/* eslint-disable @typescript-eslint/no-require-imports -- Node built-in CommonJS test runner and isolated TypeScript module loader */
/* Regression tests use in-memory records and mocked transports: no production writes or emails. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const ts = require('typescript');

function loader(mocks = {}, globals = {}) {
  const cache = new Map();
  const native = createRequire(path.join(root, 'package.json'));
  function load(file) {
    file = path.resolve(root, file);
    if (!path.extname(file)) file += fs.existsSync(file + '.ts') ? '.ts' : '.tsx';
    if (cache.has(file)) return cache.get(file).exports;
    const compiledModule = { exports: {} }; cache.set(file, compiledModule);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    const requireLocal = id => {
      if (id in mocks) return mocks[id];
      if (id.startsWith('@/')) return load(path.join(root, 'src', id.slice(2)));
      if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id));
      return native(id);
    };
    const context = { module: compiledModule, exports: compiledModule.exports, require: requireLocal, console, process, Buffer, URL, URLSearchParams, Request, Response, AbortController, setTimeout, clearTimeout, setInterval, clearInterval, ...globals };
    new vm.Script(source, { filename: file }).runInNewContext(context);
    return compiledModule.exports;
  }
  return load;
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function hookHarness(fetch) {
  const window = new EventTarget(), document = new EventTarget();
  document.visibilityState = 'visible';
  const navigator = { onLine: true, serviceWorker: new EventTarget() };
  const intervals = new Set();
  window.setInterval = fn => { intervals.add(fn); return fn; };
  const hooks = []; let cursor = 0, effects = [], queued = false, disposed = false, result;
  let url = '/api/admin/snapshot';
  const seed = { value: 'old' };
  let active = true;
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!hooks[i]) hooks[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [hooks[i].value, value => { const next = typeof value === 'function' ? value(hooks[i].value) : value; if (!Object.is(next, hooks[i].value)) { hooks[i].value = next; schedule(); } }];
    },
    useRef(value) { const i = cursor++; if (!hooks[i]) hooks[i] = { current: value }; return hooks[i]; },
    useCallback(fn, deps) { const i = cursor++; if (!hooks[i] || deps.some((d,n) => !Object.is(d, hooks[i].deps[n]))) hooks[i] = { value: fn, deps }; return hooks[i].value; },
    useEffect(fn, deps) { const i = cursor++; const old = hooks[i]; if (!old || deps.some((d,n) => !Object.is(d, old.deps[n]))) { hooks[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { hooks[i].cleanup?.(); hooks[i].cleanup = fn(); }); } },
  };
  const load = loader({ react }, { fetch, window, document, navigator, clearInterval: handle => intervals.delete(handle) });
  const useLiveResource = load('src/hooks/useLiveResource.ts').useLiveResource;
  const validate = value => typeof value?.value === 'string';
  function render() { cursor = 0; effects = []; result = useLiveResource(url, { initialData: seed, initialUpdatedAt: '2020-01-01T00:00:00.000Z', intervalMs: 20_000, active, validate }); const current = effects; effects = []; current.forEach(effect => effect()); }
  function schedule() { if (!queued && !disposed) { queued = true; queueMicrotask(() => { queued = false; if (!disposed) render(); }); } }
  render();
  return { get value() { return result; }, window, document, navigator, async flush() { await tick(); await tick(); }, changeUrl(next) { url = next; render(); }, setActive(next) { active = next; render(); }, close() { disposed = true; hooks.forEach(h => h.cleanup?.()); } };
}

test('admin data reloads immediately, on return/reconnect, and reflects cancellation/rescheduling', async () => {
  let current = 'new booking', reads = 0;
  const h = hookHarness(async () => { reads++; return Response.json({ value: current }); });
  try {
    await h.flush(); assert.equal(h.value.data.value, 'new booking'); assert.ok(reads >= 1);
    current = 'cancelled'; h.window.dispatchEvent(new Event('pageshow')); await h.flush(); assert.equal(h.value.data.value, 'cancelled');
    current = 'rescheduled'; h.document.dispatchEvent(new Event('visibilitychange')); await h.flush(); assert.equal(h.value.data.value, 'rescheduled');
    h.navigator.onLine = false; h.window.dispatchEvent(new Event('offline')); await h.flush(); assert.equal(h.value.offline, true); assert.ok(h.value.error);
    current = 'after reconnect'; h.navigator.onLine = true; h.window.dispatchEvent(new Event('online')); await h.flush(); assert.equal(h.value.data.value, 'after reconnect'); assert.equal(h.value.error, null);
  } finally { h.close(); }
});

test('a failed or malformed refresh retains the previous data and successful timestamp', async () => {
  let response = () => Response.json({ value: 'confirmed data' });
  const h = hookHarness(async () => response());
  try {
    await h.flush(); const timestamp = h.value.updatedAt;
    response = () => Response.json({ error: 'temporary error' }, { status: 503 }); h.value.refresh(); await h.flush();
    assert.equal(h.value.data.value, 'confirmed data'); assert.equal(h.value.updatedAt, timestamp); assert.ok(h.value.error);
    response = () => Response.json({}); h.value.refresh(); await h.flush(); assert.equal(h.value.data.value, 'confirmed data'); assert.ok(h.value.error);
    response = () => Response.json({ value: 'recovered' }); h.value.refresh(); await h.flush(); assert.equal(h.value.data.value, 'recovered'); assert.equal(h.value.error, null);
    response = () => Response.json({ error: 'Unauthorized' }, { status: 401 }); h.value.refresh(); await h.flush(); assert.equal(h.value.data, null); assert.equal(h.value.unauthorized, true);
  } finally { h.close(); }
});

test('a mutation during an in-flight read queues a fresh read and rejects the older result', async () => {
  const first = deferred(), second = deferred(); let calls = 0;
  const h = hookHarness(() => (++calls === 1 ? first.promise : second.promise));
  try {
    h.value.refresh(); first.resolve(Response.json({ value: 'outdated before mutation' })); await h.flush();
    assert.equal(calls, 2); assert.equal(h.value.data.value, 'old');
    second.resolve(Response.json({ value: 'after mutation' })); await h.flush(); assert.equal(h.value.data.value, 'after mutation');
  } finally { h.close(); }
});

test('changing day never displays the preceding day and discards an out-of-order response', async () => {
  const old = deferred(), fresh = deferred(); let calls = 0;
  const h = hookHarness(() => (++calls === 1 ? old.promise : fresh.promise));
  try {
    h.changeUrl('/api/availability?date=other-day'); assert.equal(h.value.data, null);
    fresh.resolve(Response.json({ value: 'right day' })); await h.flush(); old.resolve(Response.json({ value: 'wrong day' })); await h.flush();
    assert.equal(h.value.data.value, 'right day');
  } finally { h.close(); }
});

function workerHarness() {
  const handlers = {}, stores = new Map(), messages = []; let online = true, networkReads = 0;
  const key = value => typeof value === 'string' ? new URL(value, 'https://www.koureshcuts.de').href : value.url;
  const getStore = name => { if (!stores.has(name)) stores.set(name, new Map()); return stores.get(name); };
  const cacheFor = name => ({
    match: async req => getStore(name).get(key(req))?.clone(),
    put: async (req,res) => getStore(name).set(key(req), new Response(await res.text(), { status: res.status })),
    addAll: async () => {},
  });
  const clients = { claim: async () => {}, matchAll: async () => [{ postMessage: msg => messages.push(msg) }] };
  const context = { console, URL, Response, caches: { open: async name => cacheFor(name), keys: async () => [...stores.keys()], delete: async name => stores.delete(name), match: async req => { for (const name of stores.keys()) { const r = await cacheFor(name).match(req); if (r) return r; } } }, fetch: async req => { networkReads++; if (!online) throw Error('offline'); return new Response('fresh:'+key(req)); }, self: { location: { origin: 'https://www.koureshcuts.de' }, clients, skipWaiting() {}, addEventListener: (name,fn) => { handlers[name] = fn; } }, clients };
  vm.runInNewContext(fs.readFileSync(path.join(root,'public/sw.js'),'utf8'), context);
  return { stores, messages, get networkReads() { return networkReads; }, offline() { online = false; }, async seed(name,url,text) { getStore(name).set(key(url),new Response(text)); }, async activate() { let p; handlers.activate({waitUntil(value){p=value}}); await p; }, async get(url,mode='navigate') { const waits=[]; let response; handlers.fetch({request:{method:'GET',url:new URL(url,'https://www.koureshcuts.de').href,mode},respondWith(value){response=value},waitUntil(value){waits.push(value)}}); const r = await response; const text = r ? await r.text() : null; await Promise.all(waits); return { status:r?.status, text }; } };
}

test('private admin and token pages bypass old offline HTML, and API reads are not intercepted', async () => {
  const w=workerHarness(); await w.seed('koureshcuts-v3','/admin','old confidential plan');
  assert.match((await w.get('/admin')).text,/fresh:/); assert.equal((await w.get('/api/admin/snapshot','cors')).text,null);
  await w.seed('koureshcuts-v3','/meine-termine/liste?e=person&t=token','personal details'); w.offline();
  const admin=await w.get('/admin'); assert.equal(admin.status,503); assert.doesNotMatch(admin.text,/old confidential/);
  assert.equal((await w.get('/meine-termine/liste?e=person&t=token')).status,503);
});

test('worker activation deletes legacy private snapshots and signals open admin pages', async () => {
  const w=workerHarness(); await w.seed('koureshcuts-v3','/admin','private'); await w.seed('unrelated-app','/other','other');
  await w.activate(); assert.equal(w.stores.has('koureshcuts-v3'),false); assert.equal(w.stores.has('unrelated-app'),true); assert.equal(w.messages[0].type,'kc:refresh');
});

test('public navigation loads a fresh page online and can fall back offline', async () => {
  const w=workerHarness(); await w.seed('koureshcuts-v4','/','old homepage');
  assert.match((await w.get('/')).text,/fresh:/); w.offline(); assert.match((await w.get('/')).text,/fresh:/);
});

test('invalid HTTP responses and malformed slot data cannot become an empty calendar', async () => {
  const load=loader({}, {fetch: async () => Response.json({error:'database unavailable'},{status:503})});
  await assert.rejects(()=>load('src/lib/availabilityClient.ts').fetchDaySlots('/slots'),/database unavailable/);
  const invalid=loader({}, {fetch: async () => Response.json({})});
  await assert.rejects(()=>invalid('src/lib/availabilityClient.ts').fetchDaySlots('/slots'),/Termine konnten nicht geladen/);
});

function routeHarness() {
  const records=[], scheduled=[], events=[]; let authenticated=true;
  const service={id:'service',name:'Haarschnitt',durationMinutes:30,priceCents:1500,active:true};
  const settings={bookingWindowDays:28,noShowBlockThreshold:2,maxActiveBookingsPerEmail:0,cancelDeadlineHours:0,ownerCopyEmails:true};
  const matches=(a,w={}) => (!w.status || !w.status.in || w.status.in.includes(a.status)) && (!w.startTime?.gte || a.startTime>=w.startTime.gte) && (!w.startTime?.lte || a.startTime<=w.startTime.lte) && (!w.startTime?.lt || a.startTime<w.startTime.lt) && (!w.endTime?.gt || a.endTime>w.endTime.gt) && (!w.id?.not || a.id!==w.id.not);
  const prisma={
    service:{findUnique:async()=>service,findMany:async()=>[service]},blockedCustomer:{findFirst:async()=>null},reviewCustomer:{findFirst:async()=>null},
    appointment:{findMany:async args=>records.filter(a=>matches(a,args?.where)).map(a=>({...a,service})),groupBy:async()=>[],count:async()=>0,findFirst:async({where})=>records.find(a=>matches(a,where))||null,create:async({data})=>{const a={...data,id:'appointment-'+(records.length+1)};records.push(a);return a},findUnique:async({where})=>{const a=records.find(a=>a.id===where.id);return a?{...a,service}:null},update:async({where,data})=>{const a=records.find(a=>a.id===where.id);Object.assign(a,data);return a}},
    businessHours:{findMany:async()=>Array.from({length:7},(_,dayOfWeek)=>({dayOfWeek,isClosed:false,openMinute:540,closeMinute:1140}))},timeOff:{findMany:async()=>[]},specialDay:{findMany:async()=>[]},waitlistEntry:{findMany:async()=>[],deleteMany:async()=>({count:0})},emailFailure:{count:async()=>0},
  };
  prisma.$transaction=async fn=>fn(prisma);
  const never=async()=>{events.push('email started');return new Promise(()=>{})};
  const load=loader({
    '@/lib/prisma':{prisma},'./prisma':{prisma},'next/server':{after:fn=>scheduled.push(fn)},
    '@/lib/auth':{isAuthenticated:async()=>authenticated},
    '@/lib/settings':{getSettings:async()=>settings},'./settings':{getSettings:async()=>settings},
    '@/lib/email':{sendConfirmationEmails:never,sendBookingRequestEmail:never,sendCancellationNotice:never,sendRescheduleEmails:never},
    '@/lib/push':{sendAdminPush:async()=>events.push('push')},
    '@/lib/waitlist':{notifyWaitlistForDay:async()=>events.push('waitlist')},
    '@/lib/rhythm':{followUpGapDays:async()=>14},
    '@/lib/token':{verifyCancelToken:(_id,token)=>token==='valid'},
    '@/lib/rateLimit':{rateLimit:()=>({ok:true}),clientIp:()=> 'test'},
  });
  return {records,scheduled,events,load,setAuthenticated(value){authenticated=value}};
}

test('booking, rescheduling and cancellation update the real snapshot loader without waiting on email', async () => {
  const h=routeHarness(); const time=h.load('src/lib/time.ts');
  const date=time.addDaysToDateStr(time.todayInTz('Europe/Berlin'),3);
  const start=time.zonedToUtc(date,840,'Europe/Berlin').toISOString();
  const request=(url,body)=>new Request('https://www.koureshcuts.de'+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const book=h.load('src/app/api/appointments/route.ts');
  const response=await book.POST(request('/api/appointments',{serviceId:'service',start,customerName:'Test Person',customerEmail:'test@example.invalid'}));
  assert.equal(response.status,201);assert.equal(h.events.length,0);assert.equal(h.scheduled.length,1);
  const result=await response.json();const snapshot=h.load('src/app/api/admin/snapshot/route.ts');
  let plan=await snapshot.GET();assert.match(plan.headers.get('cache-control'),/no-store/);assert.equal((await plan.json()).appointments[0].id,result.id);
  const duplicate=await book.POST(request('/api/appointments',{serviceId:'service',start,customerName:'Test Person',customerEmail:'test@example.invalid'}));assert.equal(duplicate.status,409);
  const move=h.load('src/app/api/appointments/[id]/reschedule/route.ts');const next=time.zonedToUtc(date,900,'Europe/Berlin').toISOString();
  const moved=await move.POST(request('/api/appointments/'+result.id+'/reschedule?t=valid',{start:next}),{params:Promise.resolve({id:result.id})});assert.equal(moved.status,200);
  plan=await snapshot.GET();assert.equal((await plan.json()).appointments[0].start,next);
  const cancel=h.load('src/app/api/appointments/[id]/cancel/route.ts');const cancelled=await cancel.POST(request('/api/appointments/'+result.id+'/cancel?t=valid',{reason:'Test cancellation'}),{params:Promise.resolve({id:result.id})});assert.equal(cancelled.status,200);
  plan=await snapshot.GET();assert.equal((await plan.json()).appointments[0].status,'CANCELLED');assert.equal(h.events.length,0);
  // Start supported after-response callbacks: a hanging mail must not delay pushes.
  h.scheduled.forEach(run=>{void run()});await tick();assert.ok(h.events.includes('push'));assert.ok(h.events.includes('email started'));
  h.setAuthenticated(false);assert.equal((await snapshot.GET()).status,401);
});


function componentHarness(file, name, props, fetch) {
  const window=new EventTarget(), document=new EventTarget(), navigator={onLine:true,serviceWorker:new EventTarget()}; document.visibilityState='visible';
  const intervals=new Set(), hooks=[]; let cursor=0,effects=[],queued=false,disposed=false,result; const actions=[];
  window.setInterval=fn=>{intervals.add(fn);return fn}; window.requestIdleCallback=()=>1;window.cancelIdleCallback=()=>{};
  const react={
    useState(initial){const i=cursor++;if(!hooks[i])hooks[i]={value:typeof initial==='function'?initial():initial};return[hooks[i].value,value=>{const next=typeof value==='function'?value(hooks[i].value):value;if(!Object.is(next,hooks[i].value)){hooks[i].value=next;schedule()}}]},
    useRef(value){const i=cursor++;if(!hooks[i])hooks[i]={current:value};return hooks[i]},
    useMemo(fn,deps){const i=cursor++;if(!hooks[i]||deps.some((d,n)=>!Object.is(d,hooks[i].deps[n])))hooks[i]={value:fn(),deps};return hooks[i].value},
    useCallback(fn,deps){return this.useMemo(()=>fn,deps)},
    useEffect(fn,deps){const i=cursor++,old=hooks[i];if(!old||deps.some((d,n)=>!Object.is(d,old.deps[n]))){hooks[i]={deps,cleanup:old?.cleanup};effects.push(()=>{hooks[i].cleanup?.();hooks[i].cleanup=fn()})}},
  };
  // Destructured hook imports do not bind this.
  react.useCallback=(fn,deps)=>react.useMemo(()=>fn,deps);
  const jsx=(type,props)=>{if(props?.ref&&typeof props.ref==='object')props.ref.current={scrollIntoView:()=>actions.push('scroll'),focus:()=>actions.push('focus')};return{type,props:props||{}}};
  const load=loader({react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},'next/link':{__esModule:true,default:'a'},'@/components/ui/PushOptIn':{__esModule:true,default:()=>null}}, {window,document,navigator,fetch,localStorage:{getItem:()=>null},clearInterval:handle=>intervals.delete(handle)});
  const component=load(file)[name];
  function render(){cursor=0;effects=[];result=component(props);const current=effects;effects=[];current.forEach(fn=>fn())}
  function schedule(){if(!queued&&!disposed){queued=true;queueMicrotask(()=>{queued=false;if(!disposed)render()})}}
  function elements(node=result,all=[]){if(Array.isArray(node)){node.forEach(n=>elements(n,all));return all}if(node&&typeof node==='object'){all.push(node);if(node.props?.children!==undefined)elements(node.props.children,all)}return all}
  render();
  return{get tree(){return result},elements,actions,async flush(){await tick();await tick()},close(){disposed=true;hooks.forEach(h=>h.cleanup?.())}};
}

test('calendar disables old day numbers during a slow month change and offers retry on errors',async()=>{
  const next=deferred();const failing=false;
  const h=componentHarness('src/components/booking/BookingFlow.tsx','Calendar',{serviceId:'service',value:'2026-10-27',onChange(){},accent:'brand'},async url=>{
    const month=new URL(url,'https://test.invalid').searchParams.get('month');
    if(failing)return Response.json({error:'temporary outage'},{status:503});
    return month==='9'?Response.json({days:[29],full:[]}):next.promise;
  });
  try{
    await h.flush();const day29=h.elements().find(el=>el.type==='button'&&(Array.isArray(el.props.children)?el.props.children[0]:el.props.children)===29);assert.equal(day29.props.disabled,false);
    h.elements().find(el=>el.props['aria-label']==='Nächster Monat').props.onClick();await h.flush();
    assert.ok(h.elements().filter(el=>el.type==='button'&&typeof (Array.isArray(el.props.children)?el.props.children[0]:el.props.children)==='number').every(el=>el.props.disabled));
    next.resolve(Response.json({days:[6],full:[]}));await h.flush();assert.equal(h.elements().find(el=>el.type==='button'&&(Array.isArray(el.props.children)?el.props.children[0]:el.props.children)===6).props.disabled,false);
  }finally{next.resolve(Response.json({days:[6],full:[]}));h.close()}
  const error=componentHarness('src/components/booking/BookingFlow.tsx','Calendar',{serviceId:'service',value:'2026-10-27',onChange(){},accent:'brand'},async()=>Response.json({error:'offline'},{status:503}));
  try{await error.flush();assert.ok(error.elements().some(el=>el.props.role==='alert'));assert.ok(error.elements().some(el=>el.type==='button'&&el.props.children==='Erneut versuchen'));assert.ok(error.elements().filter(el=>el.type==='button'&&typeof (Array.isArray(el.props.children)?el.props.children[0]:el.props.children)==='number').every(el=>el.props.disabled))}finally{error.close()}
});

test('returning to a chosen November date opens November, and service selection scrolls/focuses the next step',async()=>{
  const calendar=componentHarness('src/components/booking/BookingFlow.tsx','Calendar',{serviceId:'service',value:'2026-11-05',onChange(){},accent:'brand'},async()=>Response.json({days:[5],full:[]}));
  try{await calendar.flush();assert.ok(calendar.elements().some(el=>el.type==='p'&&el.props.children==='November 2026'))}finally{calendar.close()}
  const booking=componentHarness('src/components/booking/BookingFlow.tsx','default',{services:[{id:'service',name:'Haarschnitt',durationMinutes:30,priceCents:1500}]},async()=>Response.json({days:[29],full:[]}));
  try{const service=booking.elements().find(el=>el.type==='button'&&el.props.className?.includes('text-left'));assert.ok(service);service.props.onClick();await booking.flush();assert.ok(booking.actions.includes('scroll'));assert.ok(booking.actions.includes('focus'))}finally{booking.close()}
});

