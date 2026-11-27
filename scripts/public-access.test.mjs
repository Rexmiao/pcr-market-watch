import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import http from 'node:http';
import {createLocalD1} from './local-db.mjs';
import {createPublicAccessHandler} from './public-access.mjs';
import {cloudConfig,createCloudGateway} from './cloud-gateway.mjs';
import {DEFAULT_SYMBOLS} from '../web/watchlist-model.js';
import {handleCboeApi,cboeTesting} from '../worker/cboe.js';
const response=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const request=(path,method='GET',body={})=>new Request('https://unit-test.hf.space'+path,{method,...(method==='POST'?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
async function databaseFixture(){
  const directory=await mkdtemp(join(tmpdir(),'pcr-public-')),database=await createLocalD1({databasePath:join(directory,'test.sqlite3')});
  await database.prepare('INSERT INTO user_watchlists(owner_id,items_json,groups_json,revision,updated_at) VALUES(?,?,?,?,?)').bind('local_user',JSON.stringify([{symbol:'NVDA',category:'custom_private'},{symbol:'SNDK',category:'custom_private'}]),JSON.stringify([{id:'custom_private',name:'PRIVATE PERSONAL GROUP'}]),7,'2026-11-26T12:00:00Z').run();
  await database.prepare('INSERT INTO user_market_pcr(owner_id,items_json,revision,updated_at) VALUES(?,?,?,?)').bind('local_user',JSON.stringify([{type:'cboe',key:'index',label:'PRIVATE LABEL'},{type:'symbol',symbol:'QQQ',label:'PRIVATE LABEL'}]),4,'2026-11-26T12:00:00Z').run();
  return database;
}
test('public settings expose only published ticker codes and generic groups, while empty lists stay empty',async()=>{
  const database=await databaseFixture(),handler=createPublicAccessHandler({database,proxy:async()=>response({})});
  let body=await (await handler(request('/api/watchlist-settings'))).json();assert.equal(body.readOnly,true);assert.equal(body.canRefresh,true);assert.equal(body.revision,7);assert.equal(body.storage,'cloud');assert.deepEqual(body.items,[{symbol:'NVDA',category:'semi'},{symbol:'SNDK',category:'semi'}]);assert(!JSON.stringify(body).includes('PRIVATE'));assert(!JSON.stringify(body).includes('custom_private'));
  body=await (await handler(request('/api/market-pcr-settings'))).json();assert.equal(body.readOnly,true);assert.deepEqual(body.items,[{type:'cboe',key:'index'},{type:'symbol',symbol:'QQQ'}]);assert(!JSON.stringify(body).includes('PRIVATE'));
  assert.equal(await handler(new Request('https://unit-test.hf.space/api/watchlist-settings',{method:'PUT',body:'{}'})),null);
  await database.prepare('UPDATE user_watchlists SET items_json=? WHERE owner_id=?').bind('[]','local_user').run();await database.prepare('UPDATE user_market_pcr SET items_json=? WHERE owner_id=?').bind('[]','local_user').run();
  body=await (await handler(request('/api/watchlist-settings'))).json();assert.deepEqual(body.items,[]);assert.equal((await handler(request('/api/symbol?symbol=NVDA'))).status,403);
  await database.prepare('DELETE FROM user_watchlists WHERE owner_id=?').bind('local_user').run();body=await (await handler(request('/api/watchlist-settings'))).json();assert.equal(body.items.length,7);assert.equal(body.initialized,true);assert.equal(body.revision,0);
});
test('only exact public aggregate endpoints and published symbols can proxy; credentials and owner APIs never do',async()=>{
  const database=await databaseFixture(),calls=[],handler=createPublicAccessHandler({database,proxy:async req=>{calls.push(new URL(req.url).pathname);return response({symbol:new URL(req.url).searchParams.get('symbol'),putOi:20,callOi:10,accessToken:'unit-secret',nested:{positions:[{secret:'unit-position'}],keep:1}});}});
  for(const path of ['/','/index.html','/app.js','/style.css','/charts.html','/archive/index-trends.html'])assert.equal((await handler(request(path))).status,200);
  for(const path of ['/options-monitor.html','/quote-reviews.html','/market-brief.html','/api/quote-reviews','/api/oi-daily','/api/options-monitor','/api/providers/moomoo-webapi/quotes','/api/search?q=AMD','/api/status'])assert.equal(await handler(request(path)),null);
  let value=await handler(request('/api/symbol?symbol=SNDK'));assert.equal(value.status,200);const body=await value.json();assert.equal(body.nested.keep,1);assert(!JSON.stringify(body).includes('unit-secret'));assert(!JSON.stringify(body).includes('positions'));
  const before=calls.length;assert.equal((await handler(request('/api/symbol?symbol=AMD'))).status,403);assert.equal((await handler(request('/api/symbol?symbol=QQQ'))).status,200);assert.equal(calls.length,before+1);
  for(const path of ['/api/symbol?symbol=SNDK&symbol=AMD','/api/symbol?symbol=SNDK&refresh=1&bypass=1','/api/symbol?symbol=US.SNDK','/api/oi-summaries?symbols=NVDA,NVDA','/api/oi-summaries/history?symbols=NVDA&date=2026-02-30','/api/cboe?date=2026-11-26&refresh=1','/api/cboe/history?range=999'])assert.equal((await handler(request(path))).status,400,path);
});
test('one public update allows independent source operations, coalesces concurrent work and enforces sixty-second budgets',async()=>{
  const database=await databaseFixture();let clock=Date.parse('2026-11-26T12:00:00Z');const calls=[];
  const handler=createPublicAccessHandler({database,now:()=>clock,proxy:async req=>{const url=new URL(req.url);calls.push({path:url.pathname,symbols:url.searchParams.get('symbols'),symbol:url.searchParams.get('symbol')});await new Promise(accept=>setTimeout(accept,30));return response(url.pathname.startsWith('/api/oi-summaries')?{provider:'moomoo_webapi',items:url.searchParams.get('symbols').split(',').map(symbol=>({symbol,putOi:20,callOi:10,oiPcr:2,checkedAt:new Date(clock).toISOString(),status:'current'})),errors:[]}:{status:'updated',value:1,date:url.searchParams.get('date')});}});
  const core=request('/api/refresh','POST');let results=await Promise.all([handler(core),handler(request('/api/refresh','POST')),handler(request('/api/cboe/refresh','POST')),handler(request('/api/cboe/history/refresh?range=252','POST')),handler(request('/api/market/refresh','POST'))]);assert(results.every(result=>result.status===200));assert.equal(calls.filter(call=>call.path==='/api/refresh').length,1);
  results=await Promise.all([handler(request('/api/oi-summaries/refresh?symbols=NVDA','POST')),handler(request('/api/oi-summaries/refresh?symbols=SNDK','POST'))]);assert(results.every(result=>result.status===200));assert.deepEqual((await results[0].json()).items.map(item=>item.symbol),['NVDA']);assert.deepEqual((await results[1].json()).items.map(item=>item.symbol),['SNDK']);assert.equal(calls.filter(call=>call.path==='/api/oi-summaries/refresh').length,1);assert.equal(calls.find(call=>call.path==='/api/oi-summaries/refresh').symbols,'NVDA,QQQ,SNDK');
  assert.equal((await handler(request('/api/oi-summaries/refresh?symbols=QQQ','POST'))).status,429);assert.equal((await handler(request('/api/refresh','POST'))).status,429);
  assert.equal((await handler(request('/api/symbol?symbol=SNDK&refresh=1'))).status,200);assert.equal((await handler(request('/api/symbol?refresh=1&symbol=SNDK'))).status,429);assert.equal((await handler(request('/api/symbol?symbol=QQQ&refresh=1'))).status,200);
  const differentDate=await handler(request('/api/cboe/refresh?date=2026-11-20','POST'));assert.equal(differentDate.status,429);assert.equal((await differentDate.json()).date,undefined,'A different date cannot receive another date’s cached snapshot.');
  clock+=60001;assert.equal((await handler(request('/api/refresh','POST'))).status,200);assert.equal(calls.filter(call=>call.path==='/api/refresh').length,2);
});
test('failed source responses are generic and malformed refresh bodies never reach a source',async()=>{
  const database=await databaseFixture();let calls=0;const handler=createPublicAccessHandler({database,proxy:async()=>{calls++;return new Response(JSON.stringify({error:'unit-private-filesystem-secret'}),{status:500});}});
  let result=await handler(request('/api/watchlist'));assert.equal(result.status,500);assert(!(await result.text()).includes('unit-private'));
  const before=calls;result=await handler(request('/api/refresh','POST',{symbols:['NVDA']}));assert.equal(result.status,400);assert.equal(calls,before);
  assert.equal((await handler(new Request('https://unit-test.hf.space/api/market/refresh',{method:'POST',headers:{'content-type':'text/plain'},body:'{}'}))).status,400);
});
test('core APIs preserve the seven already-public seed references while removing unexpected custom instruments',async()=>{
  const instruments=Object.fromEntries([...DEFAULT_SYMBOLS,'UNEXPECTED'].map(symbol=>[symbol,{name:symbol,rows:[{date:'2026-11-25',p:20,c:10}]}]));
  const data={asof:'2026-11-25',instruments},handler=createPublicAccessHandler({proxy:async req=>response(new URL(req.url).pathname==='/api/refresh'?{status:'updated',data}:data)});
  const core=await(await handler(request('/api/watchlist'))).json();assert.deepEqual(Object.keys(core.instruments),DEFAULT_SYMBOLS);assert.equal(core.instruments.UNEXPECTED,undefined);assert.equal(core.asof,data.asof);
  const updated=await(await handler(request('/api/refresh','POST'))).json();assert.deepEqual(Object.keys(updated.data.instruments),DEFAULT_SYMBOLS);assert.equal(updated.data.instruments.UNEXPECTED,undefined);
  const failed=createPublicAccessHandler({proxy:async()=>new Response(JSON.stringify({error:'private-error',data}),{status:502})});
  const retained=await(await failed(request('/api/refresh','POST'))).json();assert.deepEqual(Object.keys(retained.data.instruments),DEFAULT_SYMBOLS);assert(!JSON.stringify(retained).includes('UNEXPECTED'));assert(!JSON.stringify(retained).includes('private-error'));
});
test('public Cboe date navigation always requests cache-only reads while explicit refresh retains its shared budget',async()=>{
  let clock=Date.parse('2026-11-26T12:00:00Z');const calls=[];
  const handler=createPublicAccessHandler({now:()=>clock,proxy:async req=>{const url=new URL(req.url);calls.push({method:req.method,path:url.pathname,date:url.searchParams.get('date'),cacheOnly:req.headers.get('x-pcr-cache-only')});return response({snapshot:null,requestedDate:url.searchParams.get('date'),refreshStatus:'refresh_required'});}});
  for(const day of ['2026-11-20','2026-11-23','2026-11-24','2026-11-25']){const value=await handler(request('/api/cboe?date='+day));assert.equal(value.status,200);assert.equal((await value.json()).requestedDate,day);}
  assert(calls.every(call=>call.method==='GET'&&call.cacheOnly==='1'),'Date iteration cannot ask the worker to fetch an upstream cache miss.');
  assert.equal((await handler(request('/api/cboe/refresh?date=2026-11-25','POST'))).status,200);assert.equal(calls.at(-1).cacheOnly,null);
  const before=calls.length;assert.equal((await handler(request('/api/cboe/refresh?date=2026-11-24','POST'))).status,429);assert.equal(calls.length,before);
  assert.equal((await handler(request('/api/cboe?date=2026-11-23'))).status,200,'Reading saved history does not spend the source-refresh budget.');
  clock+=60001;assert.equal((await handler(request('/api/cboe/refresh?date=2026-11-24','POST'))).status,200);
});
test('worker cache-only Cboe snapshots read exact saved days and loaded history without any source fetch',async()=>{
  const originalFetch=globalThis.fetch,originalCaches=globalThis.caches;let networkCalls=0;
  const snapshot=date=>({date,metrics:{total:{name:'TOTAL PUT/CALL RATIO',ratio:2,put:200,call:100},index:{name:'INDEX PUT/CALL RATIO',ratio:2.5,put:50,call:20},etp:{name:'EXCHANGE TRADED PRODUCTS PUT/CALL RATIO',ratio:1,put:30,call:30}}});
  const seed={checkedAt:'2025-10-24T13:00:00.000Z',observations:[snapshot('2025-10-21'),snapshot('2025-10-22')]},saved={schemaVersion:1,snapshot:snapshot('2025-10-23'),checkedAt:'2025-10-24T14:00:00.000Z'};
  cboeTesting.clearMemory();
  globalThis.fetch=async()=>{networkCalls++;throw Error('Upstream must not be reached by a cache-only read.');};
  globalThis.caches={default:{match:async key=>new URL(key.url).pathname.endsWith('/cboe-history-v1/all')?response({schemaVersion:1,kind:'cboe-history',records:[saved]}):null}};
  try{
    for(const day of ['2025-10-21','2025-10-22','2025-10-23']){
      const req=new Request('https://unit-test.hf.space/api/cboe?date='+day,{headers:{'x-pcr-cache-only':'1'}}),result=await handleCboeApi(req,{},null,seed),body=await result.json();assert.equal(result.status,200);assert.equal(body.snapshot.date,day);assert.equal(body.snapshot.metrics.index.ratio,2.5);assert.equal(body.cacheOnly,true);
      if(day==='2025-10-23')assert.equal(body.checkedAt,saved.checkedAt,'History snapshots retain their own verified check time.');
    }
    const missing=await(await handleCboeApi(new Request('https://unit-test.hf.space/api/cboe?date=2025-10-24',{headers:{'x-pcr-cache-only':'1'}}),{},null,seed)).json();assert.equal(missing.snapshot,null);assert.equal(missing.requestedDate,'2025-10-24');assert.equal(missing.refreshStatus,'refresh_required');
    const latest=await(await handleCboeApi(new Request('https://unit-test.hf.space/api/cboe',{headers:{'x-pcr-cache-only':'1'}}),{},null,seed)).json();assert.equal(latest.snapshot.date,'2025-10-23');assert.equal(networkCalls,0);
  }finally{globalThis.fetch=originalFetch;if(originalCaches===undefined)delete globalThis.caches;else globalThis.caches=originalCaches;cboeTesting.clearMemory();}
});
test('public gateway permits charts and refresh but still protects owner settings, private pages and raw broker routes',async()=>{
  const database=await databaseFixture();let received=null;
  const backend=http.createServer((req,res)=>{received={url:req.url,headers:req.headers};if(req.url.startsWith('/api/')){res.setHeader('content-type','application/json');res.end(JSON.stringify({status:'updated',items:[],privateField:'market-values-only'}));}else{res.setHeader('content-type','text/html');res.end('<h1>Public PCR</h1>');}});
  await new Promise(accept=>backend.listen(0,'127.0.0.1',accept));const base=cloudConfig({PCR_CLOUD_PASSWORD:'unit-owner-password-only',PCR_CLOUD_PUBLIC_ORIGIN:'https://unit-test.hf.space'}),config={...base,internalPort:backend.address().port,internalOrigin:'http://127.0.0.1:'+backend.address().port},gateway=createCloudGateway(config,{database,publicAccess:true,onSecurityEvent:()=>{}});
  await new Promise(accept=>gateway.listen(0,'127.0.0.1',accept));const origin='http://127.0.0.1:'+gateway.address().port;
  try{
    assert.equal((await fetch(origin+'/')).status,200);let capabilities=await (await fetch(origin+'/api/access')).json();assert.deepEqual(capabilities,{authenticated:false,publicReadOnly:true,canRefresh:true});
    let result=await fetch(origin+'/api/watchlist-settings');assert.equal(result.status,200);assert.equal((await result.json()).readOnly,true);
    assert.equal((await fetch(origin+'/api/watchlist-settings',{method:'PUT',headers:{'content-type':'application/json',origin:config.publicOrigin},body:'{}'})).status,401);
    for(const path of ['/options-monitor.html','/market-brief.html','/quote-reviews.html','/api/options-monitor','/api/quote-reviews','/api/oi-daily','/api/providers/moomoo-webapi/quotes'])assert.equal((await fetch(origin+path)).status,401,path);
    result=await fetch(origin+'/api/refresh',{method:'POST',headers:{'content-type':'application/json',origin:config.publicOrigin,authorization:'Bearer unit-hf','x-auth-user':'unit-private-user',cookie:'unit-cookie=secret'},body:'{}'});assert.equal(result.status,200);assert.equal(received.headers.authorization,undefined);assert.equal(received.headers.cookie,undefined);assert.equal(received.headers['x-auth-user'],undefined);
    assert.equal((await fetch(origin+'/api/market/refresh',{method:'POST',headers:{'content-type':'application/json',origin:'https://hostile.example'},body:'{}'})).status,403);
    const auth='Basic '+Buffer.from('pcr:unit-owner-password-only').toString('base64');capabilities=await (await fetch(origin+'/api/access',{headers:{'x-pcr-authorization':auth}})).json();assert.deepEqual(capabilities,{authenticated:true,publicReadOnly:false,canRefresh:true});assert.equal((await fetch(origin+'/api/watchlist-settings',{method:'PUT',headers:{'x-pcr-authorization':auth,origin:config.publicOrigin,'content-type':'application/json'},body:'{}'})).status,200,'An authenticated owner keeps the original backend write path.');
  }finally{await Promise.all([new Promise(accept=>gateway.close(accept)),new Promise(accept=>backend.close(accept))]);}
});
