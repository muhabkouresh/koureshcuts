/* eslint-disable @typescript-eslint/no-require-imports -- Isolated real Postgres integration tests; never production schema. */
const test = require('node:test'); const assert = require('node:assert/strict'); const crypto = require('node:crypto');
const loadFactory = require('./privacy-loader.cjs');
const testUrl = process.env.KC_PRIVACY_TEST_URL;
const clientPath = process.env.KC_PRIVACY_TEST_CLIENT;
const enabled = Boolean(testUrl && clientPath);
if (enabled && !/^kc_privacy_test_[a-z0-9_]+$/.test(new URL(testUrl).searchParams.get('schema') || '')) throw new Error('Integration tests require a dedicated temporary schema.');
let raw, db, load, apiLoad, privacy, enc;
const fixture = { name: 'Privacy Fixture Ä', email: 'fixture@example.invalid', phone: '+490000000', notes: 'Private fixture notes' };
let service;

test.before(async () => {
  if (!enabled) return;
  const { PrismaClient } = require(clientPath);
  const nativePrisma = require('@prisma/client').Prisma;
  raw = new PrismaClient({ datasources: { db: { url: testUrl } }, log: [] });
  const config = { activeKeyId: 'test', keys: { test: crypto.randomBytes(32).toString('base64') }, lookupKey: crypto.randomBytes(32).toString('base64') };
  process.env.CUSTOMER_DATA_ACTIVE_KEY_ID = config.activeKeyId; process.env.CUSTOMER_DATA_KEYS = JSON.stringify(config.keys); process.env.CUSTOMER_DATA_LOOKUP_KEY = config.lookupKey;
  const mocks = { '@prisma/client': { Prisma: nativePrisma, PrismaClient: class { constructor() { return raw; } } } };
  load = loadFactory(undefined, mocks); privacy = load('src/lib/customerPrivacy.ts'); enc = privacy.customerCrypto();
  db = load('src/lib/prisma.ts').prisma;
  apiLoad = loadFactory(undefined, {
    '@/lib/prisma': load('src/lib/prisma.ts'), './prisma': load('src/lib/prisma.ts'),
    'next/server': { after: () => {} }, '@/lib/auth': { isAuthenticated: async () => true },
    '@/lib/email': new Proxy({}, { get: () => async () => { throw new Error('Test must not send email'); } }),
    '@/lib/push': { sendAdminPush: async () => {} }, '@/lib/rateLimit': { rateLimit: () => ({ok:true}), clientIp: () => 'privacy-test' },
  });
  service = await raw.service.create({ data: { name: 'Test service', durationMinutes: 30, priceCents: 1000 } });
  await raw.settings.create({ data: { id:'singleton', bookingWindowDays:28 } });
  await raw.businessHours.createMany({ data: Array.from({length:7}, (_,dayOfWeek) => ({dayOfWeek,openMinute:0,closeMinute:1440,isClosed:false})) });
});
test.after(async () => { if(raw) await raw.$disconnect(); });
const run = (name, fn) => test(name, { skip: !enabled }, fn);

run('private appointment is encrypted at rest and transparently readable with projections', async () => {
  const row = await db.appointment.create({ data: { serviceId: service.id, customerName: fixture.name, customerEmail: fixture.email, customerPhone:fixture.phone, notes: fixture.notes, startTime:new Date('2030-01-01T12:00:00Z'),endTime:new Date('2030-01-01T12:30:00Z') } });
  assert.equal(row.customerName, fixture.name); assert.equal(row.customerEmail, fixture.email); assert.equal(row.notes, fixture.notes);
  assert.equal('privacyVersion' in row, false); assert.equal('customerEmailHash' in row, false);
  const stored = await raw.appointment.findUnique({where:{id:row.id}});
  for(const f of ['customerName','customerEmail','customerPhone','notes']) assert.match(stored[f],/^kcenc:v1:/);
  assert.equal(stored.privacyVersion,1); assert.equal(stored.customerEmailHash,enc.emailLookup(fixture.email));
  const projected = await db.appointment.findUnique({where:{id:row.id},select:{customerName:true,customerEmail:true}});
  assert.deepEqual(Object.keys(projected).sort(), ['customerEmail','customerName']); assert.equal(projected.customerName,fixture.name);
  assert.equal(await db.appointment.count({where:{customerEmail:{equals:fixture.email.toUpperCase(),mode:'insensitive'}}}),1);
  const nested = await db.service.findUnique({where:{id:service.id},select:{appointments:{select:{customerEmail:true}}}});
  assert.equal(nested.appointments[0].customerEmail,fixture.email); assert.deepEqual(Object.keys(nested.appointments[0]),['customerEmail']);
});

run('AND/OR/NOT composition preserves lookup restrictions regardless of property order', async () => {
  for(const where of [
    {customerEmail:fixture.email,AND:[{status:'CONFIRMED'}]},
    {AND:[{status:'CONFIRMED'}],customerEmail:fixture.email},
    {OR:[{customerEmail:fixture.email},{customerEmail:'nobody@example.invalid'}]},
  ]) assert.equal(await db.appointment.count({where}),1);
  assert.equal(await db.appointment.count({where:{customerEmail:'nobody@example.invalid',AND:[{status:'CONFIRMED'}]}}),0);
  assert.equal(await db.appointment.count({where:{NOT:{customerEmail:fixture.email}}}),0);
  assert.equal(await db.appointment.count({where:{customerEmail:{not:''}}}),1);
  assert.equal(await db.appointment.count({where:{customerEmail:{in:[fixture.email]}}}),1);
});

run('legacy plaintext rows remain searchable; partial updates do not corrupt other fields', async () => {
  const old = await raw.appointment.create({data:{serviceId:service.id,customerName:'Legacy fixture',customerEmail:'LEGACY@example.invalid',customerPhone:'',notes:'Old note',startTime:new Date('2030-01-02T12:00:00Z'),endTime:new Date('2030-01-02T12:30:00Z')}});
  const found=await db.appointment.findFirst({where:{customerEmail:{equals:'legacy@example.invalid',mode:'insensitive'}}}); assert.equal(found.id,old.id);
  await db.appointment.update({where:{id:old.id},data:{notes:'Changed private note'}});
  const stored=await raw.appointment.findUnique({where:{id:old.id}});assert.match(stored.notes,/^kcenc:/);assert.equal(stored.privacyVersion,0);
  const changed=await db.appointment.findUnique({where:{id:old.id}});assert.equal(changed.customerName,'Legacy fixture');assert.equal(changed.notes,'Changed private note');
});

run('legacy-aware private upserts and normalized unique lookup handle parallel registrations', async () => {
  await raw.blockedCustomer.create({data:{email:'legacy-block@example.invalid',reason:'legacy reason'}});
  const upsert=load('src/lib/prisma.ts').privateUpsert;
  await upsert('blockedCustomer',{where:{email:'legacy-block@example.invalid'},create:{email:'legacy-block@example.invalid'},update:{reason:'encrypted reason'}});
  assert.equal(await raw.blockedCustomer.count(),1);
  const old=await db.blockedCustomer.findFirst({where:{email:'legacy-block@example.invalid'}});assert.equal(old.reason,'encrypted reason');
  await Promise.all(Array.from({length:4},()=>upsert('reviewCustomer',{where:{email:'parallel@example.invalid'},create:{email:'parallel@example.invalid',reason:'review'},update:{reason:'review'}})));
  assert.equal(await db.reviewCustomer.count({where:{email:'parallel@example.invalid'}}),1);
  await upsert('emailOptOut',{where:{email:'optout@example.invalid'},create:{email:'optout@example.invalid'},update:{}});
  assert.equal((await db.emailOptOut.findMany({select:{email:true}}))[0].email,'optout@example.invalid');
  await upsert('winbackLog',{where:{email:'winback@example.invalid'},create:{email:'winback@example.invalid',sentAt:new Date()},update:{sentAt:new Date()}});
  assert.equal((await db.winbackLog.findMany())[0].email,'winback@example.invalid');
});

run('encrypted push subscriptions preserve exact endpoints and email matching', async () => {
  const upsert=load('src/lib/prisma.ts').privateUpsert;
  const endpoint='https://push.example.invalid/ABC-sensitive';
  await upsert('customerPush',{where:{endpoint},create:{endpoint,p256dh:'key-fixture',auth:'auth-fixture',email:fixture.email},update:{p256dh:'new-key',auth:'new-auth'}});
  await upsert('customerPush',{where:{endpoint},create:{endpoint,p256dh:'unused',auth:'unused'},update:{p256dh:'new-key',auth:'new-auth'}});
  const [sub]=await db.customerPush.findMany({where:{email:fixture.email}});assert.equal(sub.endpoint,endpoint);assert.equal(sub.auth,'new-auth');
  const stored=await raw.customerPush.findUnique({where:{id:sub.id}});for(const f of ['endpoint','p256dh','auth','email'])assert.match(stored[f],/^kcenc:/);
  assert.equal(await db.customerPush.count({where:{endpoint:endpoint.toLowerCase()}}),0);
  assert.equal((await db.customerPush.deleteMany({where:{endpoint}})).count,1);
  await upsert('pushSubscription',{where:{endpoint},create:{endpoint,p256dh:'key',auth:'auth'},update:{auth:'new'}});
  assert.equal((await db.pushSubscription.findMany())[0].endpoint,endpoint);
});

run('batch email retry payloads and free-text records are encrypted without losing content', async () => {
  await db.emailFailure.createMany({data:[{to:fixture.email,subject:'private subject',html:'<p>private content</p>',error:'private error'},{to:'second@example.invalid',subject:'second',html:'<p>second</p>'}]});
  const stored=await raw.emailFailure.findMany(); for(const row of stored)for(const f of ['to','subject','html'])assert.match(row[f],/^kcenc:/);
  const pending=await db.emailFailure.findMany({where:{sentAt:null},orderBy:{createdAt:'asc'}});assert.equal(pending[0].to,fixture.email);assert.equal(pending[0].html,'<p>private content</p>');
  await db.emailFailure.update({where:{id:pending[0].id},data:{attempts:{increment:1},sentAt:new Date()}});
  const delay=await db.delayLog.create({data:{date:new Date(),minutes:5,customerName:fixture.name,customerEmail:fixture.email,note:'Private delay'}});assert.equal(delay.note,'Private delay');
  const sale=await db.productSale.create({data:{date:new Date(),amountCents:500,note:'Private sale'}});assert.equal(sale.note,'Private sale');
  const off=await db.timeOff.create({data:{startDate:new Date('2031-01-01'),endDate:new Date('2031-01-02'),reason:'Private closure'}});assert.equal(off.reason,'Private closure');
  const day=await db.specialDay.create({data:{date:new Date('2031-01-03'),note:'Private day'}});assert.equal(day.note,'Private day');
  const wait=await db.waitlistEntry.create({data:{serviceId:service.id,customerName:fixture.name,customerEmail:'wait@example.invalid'}});assert.equal(wait.customerEmail,'wait@example.invalid');
});

run('interactive and array transactions keep encryption atomic', async () => {
  const before=await raw.productSale.count();
  await assert.rejects(()=>db.$transaction(async tx=>{await tx.productSale.create({data:{date:new Date(),amountCents:1,note:'rollback fixture'}});throw new Error('intentional rollback');}),/intentional rollback/);
  assert.equal(await raw.productSale.count(),before);
  const [created]=await db.$transaction([db.productSale.create({data:{date:new Date(),amountCents:2,note:'array transaction'}})]);assert.equal(created.note,'array transaction');
});

run('wrong record, altered tag and hash mismatch fail closed without plaintext fallback', async () => {
  const original=await raw.appointment.findFirst({where:{privacyVersion:1}});
  const copy=await db.appointment.create({data:{serviceId:service.id,customerName:'other',customerEmail:'other@example.invalid',customerPhone:'',startTime:new Date('2030-01-03'),endTime:new Date('2030-01-03T00:30:00Z')}});
  await raw.appointment.update({where:{id:copy.id},data:{customerName:original.customerName}});
  await assert.rejects(()=>db.appointment.findUnique({where:{id:copy.id}}),/cannot be decrypted/);
  await raw.appointment.delete({where:{id:copy.id}});
  await raw.appointment.update({where:{id:original.id},data:{customerEmailHash:enc.emailLookup('tampered@example.invalid')}});
  await assert.rejects(()=>db.appointment.findUnique({where:{id:original.id}}),/lookup authentication/);
  await raw.appointment.update({where:{id:original.id},data:{customerEmailHash:enc.emailLookup(fixture.email)}});
});

run('real booking, admin snapshot, rescheduling and cancellation work against encrypted Postgres', async () => {
  const time=apiLoad('src/lib/time.ts'); const date=time.addDaysToDateStr(time.todayInTz('Europe/Berlin'),3);
  const start=time.zonedToUtc(date,840,'Europe/Berlin').toISOString();
  const request=(url,body)=>new Request('https://www.koureshcuts.de'+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const book=apiLoad('src/app/api/appointments/route.ts');
  const response=await book.POST(request('/api/appointments',{serviceId:service.id,start,customerName:'Booking fixture',customerEmail:'book@example.invalid',customerPhone:'000'}));assert.equal(response.status,201);
  const result=await response.json();const stored=await raw.appointment.findUnique({where:{id:result.id}});assert.match(stored.customerEmail,/^kcenc:/);
  const snapshot=apiLoad('src/app/api/admin/snapshot/route.ts');let plan=await snapshot.GET();assert.equal(plan.status,200);assert.equal((await plan.json()).appointments.find(a=>a.id===result.id).customerName,'Booking fixture');
  const duplicate=await book.POST(request('/api/appointments',{serviceId:service.id,start,customerName:'Duplicate fixture',customerEmail:'duplicate@example.invalid'}));assert.equal(duplicate.status,409);
  const token=apiLoad('src/lib/token.ts').cancelToken(result.id);
  const move=apiLoad('src/app/api/appointments/[id]/reschedule/route.ts');const next=time.zonedToUtc(date,900,'Europe/Berlin').toISOString();
  const moved=await move.POST(request('/api/appointments/'+result.id+'/reschedule?t='+token,{start:next}),{params:Promise.resolve({id:result.id})});assert.equal(moved.status,200);
  const cancel=apiLoad('src/app/api/appointments/[id]/cancel/route.ts');const cancelled=await cancel.POST(request('/api/appointments/'+result.id+'/cancel?t='+token,{reason:'fixture'}),{params:Promise.resolve({id:result.id})});assert.equal(cancelled.status,200);
  assert.equal((await db.appointment.findUnique({where:{id:result.id}})).status,'CANCELLED');
});

run('backup restore, additive schema and resumable migration preserve every legacy field', async () => {
  const maintenance = require('./customer-privacy-maintenance.cjs');
  const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'kc-privacy-backup-'));const filename=path.join(folder,'backup.kcbackup');
  try {
    // More than one page verifies migration cursors after rows leave version 0.
    await raw.delayLog.createMany({data:Array.from({length:63},(_,i)=>({date:new Date(),minutes:i,customerName:'Legacy '+i,customerEmail:'legacy-delay-'+i+'@example.invalid',note:'Legacy note '+i}))});
    const snapshot=await maintenance.readSnapshot(raw);
    const written=maintenance.writeBackup(snapshot,enc,filename);assert.equal(written.encrypted,true);
    const restored=maintenance.readBackup(enc,filename);assert.equal(restored.rows.DelayLog.length,snapshot.DelayLog.length);assert.equal(restored.rows.Appointment[0].customerName,snapshot.Appointment[0].customerName);
    const counts=Object.fromEntries(Object.entries(snapshot).map(([model,rows])=>[model,rows.length]));
    await maintenance.prepareSchema(raw);await maintenance.prepareSchema(raw);
    const migrated=await maintenance.migrateRows(raw,enc);assert.ok(migrated.migrated.DelayLog>=63);
    assert.equal((await maintenance.verifyRows(raw,enc)).legacyRecords,0);
    const again=await maintenance.migrateRows(raw,enc);assert.equal(Object.values(again.migrated).reduce((a,b)=>a+b,0),0);
    const after=await maintenance.readSnapshot(raw);for(const[model,count]of Object.entries(counts))assert.equal(after[model].length,count);
    for(const row of snapshot.DelayLog){const decoded=await db.delayLog.findUnique({where:{id:row.id}});const expected=row.customerName.startsWith('kcenc:')?enc.decrypt(row.customerName,{model:'DelayLog',recordId:row.id,field:'customerName'}):row.customerName;assert.equal(decoded.customerName,expected);}
    const doc=JSON.parse(fs.readFileSync(filename,'utf8'));doc.entries.pop();doc.digest=crypto.createHash('sha256').update(JSON.stringify(doc.entries)).digest('hex');fs.writeFileSync(filename,JSON.stringify(doc));
    assert.throws(()=>maintenance.readBackup(enc,filename),/verification failed/);
  } finally {
    if(path.dirname(path.resolve(folder))!==path.resolve(os.tmpdir())||!path.basename(folder).startsWith("kc-privacy-backup-")) throw new Error("Unsafe temporary cleanup path");
    fs.rmSync(folder,{recursive:true,force:true});
  }
});
