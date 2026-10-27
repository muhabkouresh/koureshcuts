/* eslint-disable @typescript-eslint/no-require-imports -- Explicit operator-only backup/migration tool, never imported into a public route. */
const fs = require('node:fs'); const path = require('node:path'); const crypto = require('node:crypto');
const { PrismaClient, Prisma } = require('@prisma/client');
const load = require('./privacy-loader.cjs')();
const { customerPrivacyModels: specs, encryptCustomerWrite, privacyLookup } = load('src/lib/customerPrivacy.ts');
const { customerEncryptionFromEnvironment } = load('src/lib/customerEncryption.ts');
const models = Prisma.dmmf.datamodel.models;
const quote = name => { if(!/^[A-Za-z][A-Za-z0-9]*$/.test(name))throw new Error('Invalid identifier');return '"'+name+'"'; };
const delegate = (db, model) => db[model[0].toLowerCase()+model.slice(1)];
const fail = () => { throw new Error('Privacy verification failed; no customer values are logged.'); };

async function readSnapshot(db) {
  return db.$transaction(async tx => {
    const rows = {};
    for (const model of models) rows[model.name] = await tx.$queryRawUnsafe('SELECT * FROM '+quote(model.name)+' ORDER BY "id"');
    return rows;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 120000 });
}
function writeBackup(snapshot, enc, filename) {
  const backupId = crypto.randomUUID(); const entries = []; const counts = {};
  for (const [model, rows] of Object.entries(snapshot)) {
    counts[model] = rows.length;
    for (const row of rows) {
      const index = entries.length;
      const serialized = JSON.stringify(row);
      const context = { model:'DatabaseBackup', recordId:backupId+':'+index, field:'row:'+model };
      const payload = enc.encrypt(serialized, context);
      if (enc.decrypt(payload, context) !== serialized) fail();
      entries.push({model,index,payload});
    }
  }
  const digest = crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex');
  const manifest=enc.encrypt(JSON.stringify({counts,digest,totalEntries:entries.length}),{model:'DatabaseBackup',recordId:backupId,field:'manifest'});
  const document = {format:'koureshcuts-encrypted-backup-v1',backupId,createdAt:new Date().toISOString(),counts,digest,manifest,entries};
  fs.writeFileSync(filename, JSON.stringify(document), {encoding:'utf8',flag:'wx',mode:0o600});
  return {counts,entries:entries.length,encrypted:true};
}
function readBackup(enc, filename) {
  const doc = JSON.parse(fs.readFileSync(filename,'utf8'));
  if(doc.format!=='koureshcuts-encrypted-backup-v1' || crypto.createHash('sha256').update(JSON.stringify(doc.entries)).digest('hex')!==doc.digest)fail();
  const manifest=JSON.parse(enc.decrypt(doc.manifest,{model:'DatabaseBackup',recordId:doc.backupId,field:'manifest'}));
  if(manifest.digest!==doc.digest||manifest.totalEntries!==doc.entries.length||JSON.stringify(manifest.counts)!==JSON.stringify(doc.counts))fail();
  const result={};
  for(const entry of doc.entries) {
    if(entry.index!==Object.values(result).reduce((n,rows)=>n+rows.length,0))fail();
    const row=JSON.parse(enc.decrypt(entry.payload,{model:'DatabaseBackup',recordId:doc.backupId+':'+entry.index,field:'row:'+entry.model}));
    if(typeof row.id!=='string'||!row.id)fail();
    const model=models.find(m=>m.name===entry.model);if(!model)fail();
    for(const field of model.fields)if(field.type==='DateTime'&&row[field.name]!=null){row[field.name]=new Date(row[field.name]);if(!Number.isFinite(row[field.name].getTime()))fail();}
    (result[entry.model]??=[]).push(row);
  }
  for(const [model,count]of Object.entries(doc.counts))if((result[model]?.length??0)!==count)fail();
  return {document:doc,rows:result};
}
async function prepareSchema(db) {
  // Additive only. No record, column, table or existing index is deleted.
  await db.$transaction(async tx=>{
    for(const [model,spec]of Object.entries(specs)) {
      await tx.$executeRawUnsafe('ALTER TABLE '+quote(model)+' ADD COLUMN IF NOT EXISTS "privacyVersion" INTEGER NOT NULL DEFAULT 0');
      for(const [field,lookup]of Object.entries(spec.lookups)) {
        await tx.$executeRawUnsafe('ALTER TABLE '+quote(model)+' ADD COLUMN IF NOT EXISTS '+quote(lookup.column)+' TEXT');
        const source=models.find(m=>m.name===model).fields.find(f=>f.name===field);const unique=source.isUnique;
        const indexName=model+'_'+lookup.column+(unique?'_key':'_idx');
        // Names are built from the closed schema model/field list above.
        const index='"'+indexName+'"';
        await tx.$executeRawUnsafe('CREATE '+(unique?'UNIQUE ':'')+'INDEX IF NOT EXISTS '+index+' ON '+quote(model)+' ('+quote(lookup.column)+')');
      }
    }
  },{timeout:120000});
  return {additiveSchemaReady:true};
}
function plaintextRow(model,row,enc) {
  const result={};
  for(const field of specs[model].fields) {
    const value=row[field];
    if(typeof value!=='string')fail();
    result[field]=value.startsWith('kcenc:')?enc.decrypt(value,{model,recordId:row.id,field}):value;
    if(row.privacyVersion===1&&value!==''&&!value.startsWith('kcenc:'))fail();
  }
  return result;
}
async function verifyUniqueLookups(db,enc) {
  for(const [model,spec]of Object.entries(specs)) {
    const unique=Object.entries(spec.lookups).filter(([field])=>models.find(m=>m.name===model).fields.find(f=>f.name===field).isUnique);
    if(!unique.length)continue;
    const seen=new Map();for(const row of await delegate(db,model).findMany()) {
      const plain=plaintextRow(model,row,enc);
      for(const[field,lookup]of unique) {
        const value=lookup.column+':'+privacyLookup(enc,lookup.purpose,plain[field]);
        if(seen.has(value)&&seen.get(value)!==row.id)throw new Error('Normalized unique lookup conflict in '+model+'; no records were merged or deleted.');
        seen.set(value,row.id);
      }
    }
  }
}
async function migrateRows(db,enc) {
  await verifyUniqueLookups(db,enc);
  const migrated={};
  for(const [model,spec]of Object.entries(specs)) {
    let total=0;
    for(let pass=0;pass<6;pass++) {
      let cursor;
      for(;;) {
        const rows=await delegate(db,model).findMany({where:{privacyVersion:0},orderBy:{id:'asc'},take:50,...(cursor?{cursor:{id:cursor},skip:1}:{})});
        if(!rows.length)break;
        for(const row of rows) {
          const plain=plaintextRow(model,row,enc);
          const data={...encryptCustomerWrite(model,plain,enc,row.id),privacyVersion:1};
          // Compare-and-set avoids overwriting a concurrently edited/cancelled row.
          const expected=Object.fromEntries(spec.fields.map(field=>[field,row[field]]));
          const updated=await delegate(db,model).updateMany({where:{id:row.id,privacyVersion:0,...expected},data});
          total+=updated.count;
        }
        cursor=rows[rows.length-1].id;
      }
      if(await delegate(db,model).count({where:{privacyVersion:0}})===0)break;
      if(pass===5)throw new Error('Concurrent legacy writes remain in '+model+'; rerun migration safely.');
    }
    migrated[model]=total;
  }
  return {migrated};
}
async function verifyRows(db,enc,requireEncrypted=true) {
  const report={};let unencrypted=0;
  for(const [model,spec]of Object.entries(specs)) {
    const rows=await delegate(db,model).findMany();let legacy=0;
    for(const row of rows) {
      if(row.privacyVersion!==0&&row.privacyVersion!==1)fail();
      const plain=plaintextRow(model,row,enc);
      if(row.privacyVersion===0){legacy++;unencrypted++;}
      for(const[field,lookup]of Object.entries(spec.lookups)) {
        if(row.privacyVersion===1&&row[lookup.column]!==privacyLookup(enc,lookup.purpose,plain[field]))fail();
      }
    }
    report[model]={total:rows.length,legacy,encrypted:rows.length-legacy};
  }
  if(requireEncrypted&&unencrypted)throw new Error('Legacy customer records remain: '+unencrypted);
  return {verified:true,legacyRecords:unencrypted,models:report};
}
module.exports={readSnapshot,writeBackup,readBackup,prepareSchema,migrateRows,verifyRows};

if(require.main===module) {
  require('@next/env').loadEnvConfig(path.resolve(__dirname,'..'));
  const command=process.argv[2];const backupPath=process.env.KC_ENCRYPTED_BACKUP_PATH;
  const db=new PrismaClient({log:[]});
  (async()=>{try{
    const enc=customerEncryptionFromEnvironment();let result;
    if(command==='backup') {if(!backupPath||!path.isAbsolute(backupPath))throw new Error('An absolute encrypted backup path is required.');result=writeBackup(await readSnapshot(db),enc,backupPath);readBackup(enc,backupPath);}
    else if(command==='backup-check'){const restored=readBackup(enc,backupPath);result={verified:true,counts:restored.document.counts};}
    else if(command==='prepare-schema'||command==='migrate') {
      if(!process.argv.includes('--apply-approved-migration'))throw new Error('Explicit migration operator flag required.');
      if(!backupPath||!fs.existsSync(backupPath))throw new Error('Verified encrypted backup required.');readBackup(enc,backupPath);
      result=command==='prepare-schema'?await prepareSchema(db):await migrateRows(db,enc);
    } else if(command==='verify')result=await verifyRows(db,enc);
    else throw new Error('Use backup, backup-check, prepare-schema, migrate or verify.');
    console.log(JSON.stringify({command,...result}));
  }catch(error){console.error(JSON.stringify({command,failed:true,error:error.name,code:error.code??null}));process.exitCode=1;}finally{await db.$disconnect();}})();
}
