import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {createLocalD1} from './local-db.mjs';
import {createOiHistoryStore,oiObservationDate,validOiDate} from './oi-history.mjs';
import {createOiSummaryHandler} from './oi-summaries.mjs';

const directory=await mkdtemp(join(tmpdir(),'pcr-oi-history-'));
try{
  const database=await createLocalD1({databasePath:join(directory,'test.sqlite3')});
  let clock=Date.parse('2026-11-26T23:00:00Z');
  const store=createOiHistoryStore({database,now:()=>clock});
  const item=(symbol,checkedAt,extra={})=>({symbol,provider:'moomoo_webapi',putOi:200,callOi:100,oiPcr:2,checkedAt,oiAsOf:null,oiAsOfConfirmed:false,oiBasis:'previous_session',coverage:'provider_symbol_overview',stale:false,status:'current',errors:[],...extra});
  assert.equal(oiObservationDate('2026-11-26T02:00:00Z'),'2026-11-25','Archive date uses New York, not UTC');
  assert.equal(oiObservationDate('2026-07-01T04:00:00Z'),'2026-07-01');
  assert.equal(oiObservationDate('2026-01-01T04:00:00Z'),'2025-12-31');
  assert.equal(oiObservationDate('2026-03-08T06:59:59Z'),'2026-03-08');
  assert.equal(oiObservationDate('2026-03-08T07:00:00Z'),'2026-03-08');
  assert(validOiDate('2024-02-29'));assert(!validOiDate('2026-02-29'));assert(!validOiDate('2026-99-10'));assert(!validOiDate('2026-11-26;DROP TABLE'));

  const old=item('NVDA','2026-11-24T22:00:00Z',{stale:true,status:'failed'});
  await database.prepare('INSERT INTO oi_summary_cache(symbol,payload_json,checked_at) VALUES(?,?,?)').bind('NVDA',JSON.stringify(old),old.checkedAt).run();
  assert.equal((await store.importLatestCache()).imported,1);
  assert.equal((await createOiHistoryStore({database,now:()=>clock}).importLatestCache()).imported,0,'Legacy import is idempotent across processes');
  let rows=await store.readDate(['NVDA','AMD'],'2026-11-24');assert.equal(rows[0].symbol,'AMD');assert.equal(rows[0].checkedAt,null);assert.equal(rows[1].checkedAt,new Date(old.checkedAt).toISOString());assert.equal(rows[1].archived,true);
  assert((await store.readDate(['NVDA'],'2026-11-25'))[0].checkedAt===null,'Missing historical dates never fall back');
  let saved=await store.archive(item('NVDA','2026-11-26T02:00:00Z',{putOi:0}));assert.equal(saved.stored,true);assert.equal(saved.item.observationDate,'2026-11-25');
  saved=await store.archive(item('NVDA','2026-11-26T02:00:00Z',{putOi:999}));assert.equal(saved.stored,false);
  assert.equal((await store.readDate(['NVDA'],'2026-11-25'))[0].putOi,0,'Existing observations cannot be overwritten');
  await store.archive(item('NVDA','2026-11-26T03:00:00Z',{putOi:400,oiAsOf:'2026-11-24'}));
  rows=await store.readDate(['NVDA'],'2026-11-25');assert.equal(rows[0].oiPcr,4);assert.equal(rows[0].oiAsOf,null,'A date without explicit confirmation stays unknown');
  await store.archive(item('NVDA','2026-11-26T20:00:00Z',{oiAsOf:'2026-11-25',oiAsOfConfirmed:true}),{reason:'daily'});
  rows=await store.readDate(['NVDA'],'2026-11-26');assert.equal(rows[0].oiAsOf,'2026-11-25');assert.equal(rows[0].oiAsOfConfirmed,true);
  assert.equal((await store.archive(item('AMD','2026-11-26T21:00:00Z',{status:'failed',stale:true}))).stored,false);
  await store.archive(item('AMD','2026-11-26T21:00:00Z',{callOi:0,oiAsOf:'2026-11-27',oiAsOfConfirmed:true}));
  rows=await store.readDate(['AMD'],'2026-11-26');assert.equal(rows[0].oiPcr,null);assert.equal(rows[0].callOi,0);assert.equal(rows[0].oiAsOf,null,'Future clearing dates are never confirmed');
  await store.archive(item('MU','2026-11-26T22:00:00Z',{callOi:null,status:'partial'}));
  let index=await store.summary(['NVDA','AMD','MU']);assert.deepEqual(index.dates,['2026-11-24','2026-11-25','2026-11-26']);assert.deepEqual(index.coverageByDate['2026-11-26'],{count:3,completeCount:2});assert.equal(index.totalSnapshots,6);

  let calls=0,fail=false;
  const client={status:()=>({configured:true}),overview:async symbol=>{calls++;if(fail)throw {code:'TIMEOUT'};return {provider:'moomoo_webapi',checkedAt:new Date(clock).toISOString(),oiSettlementDate:'2026-11-25',oiSettlementDateConfirmed:false,data:{items:[{code:'US.'+symbol,put_open_interest:300,call_open_interest:150}]}};}};
  const handler=createOiSummaryHandler({webApiClient:client,database,now:()=>clock});
  const request=(path,method='GET')=>new Request('http://127.0.0.1:8765/api/oi-summaries'+path,{method,...(method==='POST'?{headers:{'content-type':'application/json'},body:'{}'}:{})});
  let body=await (await handler(request('/history?symbols=NVDA&date=2026-11-25'))).json();assert.equal(calls,0);assert.equal(body.items[0].oiPcr,4);assert.equal(body.items[0].observationDate,'2026-11-25');
  body=await (await handler(request('/refresh?symbols=SNDK','POST'))).json();assert.equal(body.items[0].archived,true);assert.equal(body.items[0].observationDate,'2026-11-26');assert.equal(body.items[0].oiAsOf,null);
  const original=body.items[0].checkedAt;clock+=86400000;fail=true;
  body=await (await handler(request('/refresh?symbols=SNDK','POST'))).json();assert.equal(body.items[0].checkedAt,original);assert.equal(body.items[0].stale,true);
  body=await (await handler(request('/history?symbols=SNDK&date=2026-11-27'))).json();assert.equal(body.items[0].checkedAt,null,'Failed refresh does not rearchive yesterday as today');
  body=await (await handler(request('/history?symbols=SNDK'))).json();assert.deepEqual(body.dates,['2026-11-26']);assert.equal(body.totalSnapshots,1);
  for(const query of ['symbols=SNDK&date=2026-02-30','symbols=SNDK&date=2026-11-25&date=2026-11-26','symbols=SNDK&limit=999','symbols=SNDK,SNDK'])assert.equal((await handler(request('/history?'+query))).status,400);
  assert.equal((await handler(new Request('http://127.0.0.1:8765/api/oi-summaries/history?symbols=NVDA',{headers:{origin:'https://evil.example'}}))).status,403);
  assert.equal((await handler(request('/history?symbols=NVDA','POST'))).status,405);
  const restart=createOiHistoryStore({database:await createLocalD1({databasePath:join(directory,'test.sqlite3')}),now:()=>clock});assert.equal((await restart.readDate(['SNDK'],'2026-11-26'))[0].checkedAt,original);
  console.log('PASS OI history: immutable real SQLite, New York/DST dates, original cache import, exact-day selection, unknown clearing dates, zero/missing counts, complete coverage, persisted refresh metadata, failure isolation, restart durability and strict read inputs.');
}finally{assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert(basename(directory).startsWith('pcr-oi-history-'));await rm(directory,{recursive:true,force:true});}
