import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLocalD1} from './local-db.mjs';
import {backupHfDatabase,restoreHfDatabase} from './hf-storage.mjs';
import {runStructureDaily,createStructureArchiveHandler,structurePublishedSymbols,ensureStructureMonitoring,nextStructureDailyRun,structureDailyIsDue,STRUCTURE_ARCHIVE_LIMITS} from './structure-archive.mjs';

async function fixture({symbols=['QQQ'],market=[],expiries=['2026-11-25','2026-11-27','2026-12-04','2027-01-15']}={}){
  const directory=await mkdtemp(join(tmpdir(),'pcr-structure-archive-'));
  const database=await createLocalD1({databasePath:join(directory,'test.sqlite3')});
  await database.prepare('INSERT INTO user_watchlists(owner_id,items_json,groups_json,revision,updated_at) VALUES(?,?,?,?,?)').bind('local_user',JSON.stringify(symbols.map(symbol=>({symbol,category:null}))),'[]',1,'2026-11-27T20:00:00Z').run();
  await database.prepare('INSERT INTO user_market_pcr(owner_id,items_json,revision,updated_at) VALUES(?,?,?,?)').bind('local_user',JSON.stringify(market),1,'2026-11-27T20:00:00Z').run();
  let clock=Date.parse('2026-11-27T22:45:00Z'),failure=null,oldClock=false,crossMidnight=false;
  const calls=[];
  function result(kind,data){clock+=100;if(crossMidnight)clock=Date.parse('2026-11-28T05:00:01Z');return {provider:'moomoo_webapi',kind,checkedAt:new Date(oldClock?clock-86400000:clock).toISOString(),data};}
  const client={status:()=>({configured:true}),
    async expirations(symbol){calls.push({kind:'expirations',symbol});if(failure?.('expirations',symbol))throw {code:'TIMEOUT',message:'secret-test-token'};return result('option_expirations',{expiration_list:expiries.map(strike_time=>({strike_time}))});},
    async gammaExposure(symbol,{expiries}){calls.push({kind:'gamma',symbol,expiries});if(failure?.('gamma',symbol,expiries))throw {code:'TIMEOUT',message:'secret-test-token'};return result('gamma_exposure',{underlying_price:649.3,call_wall_strike:650,put_wall_strike:630,update_time:Date.parse('2026-11-25T21:30:00Z'),zero_gamma_points:[648.35],zero_gamma_disclosed:true,items:[{strike_price:630,call_gex:10,put_gex:-20,net_gex:-10},{strike_price:650,call_gex:30,put_gex:-5,net_gex:25}],profile_points:[{spot_price:630,aggregate_gex:-15},{spot_price:660,aggregate_gex:20}],interpolated_points:[]});},
    async maxPain(symbol,{expiry}){calls.push({kind:'max_pain',symbol,expiry});if(failure?.('max_pain',symbol,expiry))throw {code:'TIMEOUT',message:'secret-test-token'};return result('max_pain',{update_time:Date.parse('2026-11-25T21:31:00Z'),chains:[{strike_date:expiry,max_pain_strike:640,items:[{strike_price:630,call_pain:100,put_pain:200,total_pain:300},{strike_price:640,call_pain:150,put_pain:100,total_pain:250}]}]});}
  };
  const options={database,webApiClient:client,now:()=>clock,sleep:async milliseconds=>{clock+=milliseconds;}};
  return {directory,database,client,calls,options,setClock:value=>{clock=Date.parse(value);},advance:ms=>{clock+=ms;},setFailure:value=>{failure=value;},oldClock:value=>{oldClock=value;},crossMidnight:value=>{crossMidnight=value;}};
}
const get=(path,options)=>new Request('http://127.0.0.1'+path,options);

test('structure schedule follows New York DST, not browser timezone',()=>{
  assert.equal(nextStructureDailyRun(Date.parse('2026-11-27T05:00:00Z')),'2026-11-27T22:45:00.000Z');
  assert.equal(nextStructureDailyRun(Date.parse('2026-07-02T04:00:00Z')),'2026-07-02T21:45:00.000Z');
  assert.equal(nextStructureDailyRun(Date.parse('2026-03-07T23:00:00Z')),'2026-03-08T21:45:00.000Z');
  assert(!structureDailyIsDue(Date.parse('2026-11-27T22:44:59Z')));assert(structureDailyIsDue(Date.parse('2026-11-27T22:45:00Z')));
});

test('actual published union captures every future30-day expiry, aggregate and exclusion; payloads compressed and immutable',async()=>{
  const f=await fixture({market:[{type:'cboe',key:'total'},{type:'symbol',symbol:'QQQ'},{type:'symbol',symbol:'SPY'}]});
  assert.deepEqual(await structurePublishedSymbols(f.database),['QQQ','SPY']);
  const report=await runStructureDaily({...f.options,mode:'scheduled'});
  assert.equal(report.status,'success');assert.equal(report.savedCount,12);assert.equal(report.requestCount,14);
  assert(f.calls.filter(call=>call.kind==='gamma').every(call=>Array.isArray(call.expiries)&&call.expiries.length>0&&call.expiries.every(date=>date>='2026-11-27'&&date<='2026-12-27')));
  assert.deepEqual(f.calls.filter(call=>call.kind==='gamma'&&call.symbol==='QQQ').map(call=>call.expiries),[['2026-11-27','2026-12-04'],['2026-12-04'],['2026-11-27'],['2026-12-04']]);
  const records=(await f.database.prepare('SELECT * FROM structure_snapshots').all()).results;assert.equal(records.length,12);assert(records.every(row=>row.compressed_bytes<row.payload_bytes&&row.observation_date==='2026-11-27'&&row.oi_settlement_date===null));
  await assert.rejects(f.database.prepare('UPDATE structure_snapshots SET status=? WHERE id=?').bind('changed',records[0].id).run(),/immutable/);
  await assert.rejects(f.database.prepare('DELETE FROM structure_snapshots WHERE id=?').bind(records[0].id).run(),/append-only/);
  assert.equal((await runStructureDaily({...f.options,mode:'scheduled'})).status,'already_saved');assert.equal(f.calls.length,14);
});

test('history is cache-only, dates and archived expired expiries remain exact, source timestamps independent',async()=>{
  const f=await fixture();await runStructureDaily({...f.options,mode:'manual'});const calls=f.calls.length;
  f.setClock('2027-01-02T20:00:00Z');const handler=createStructureArchiveHandler(f.options);
  const index=await(await handler(get('/api/structure-archive/index?symbol=QQQ'))).json();assert.equal(index.dates[0].date,'2026-11-27');assert.deepEqual(index.dates[0].expiries,['2026-11-27','2026-12-04']);
  const date=await(await handler(get('/api/structure-archive?symbol=QQQ&date=2026-11-27'))).json();assert.equal(date.records.length,6);
  const gamma=date.records.find(row=>row.kind==='gamma'&&row.scopeKey==='30d');
  const full=await(await handler(get('/api/structure-archive?symbol=QQQ&id='+gamma.id))).json();assert.equal(full.record.payload.underlyingPrice,649.3);assert.equal(full.record.payload.profile[0].gex,-15);assert.equal(full.record.providerUpdatedAt,'2026-11-25T21:30:00.000Z');assert.equal(full.record.queriedAt,full.record.payload.checkedAt);assert.equal(full.record.oiSettlementDate,null);
  assert.deepEqual((await(await handler(get('/api/structure-archive?symbol=QQQ&date=2020-01-01'))).json()).records,[]);assert.equal(f.calls.length,calls);
  assert.equal((await handler(get('/api/structure-archive?symbol=AMD&id='+gamma.id))).status,404);
});

test('same-day scheduled partial retry skips saved scopes and never overwrites snapshots',async()=>{
  const f=await fixture();let first=true;f.setFailure(kind=>kind==='gamma'&&first?(first=false,true):false);
  const one=await runStructureDaily({...f.options,mode:'scheduled'});assert.equal(one.status,'partial');assert.equal(one.savedCount,5);
  const old=(await f.database.prepare('SELECT id,queried_at,payload_gzip_base64 FROM structure_snapshots ORDER BY id').all()).results;
  assert.equal((await runStructureDaily({...f.options,mode:'scheduled'})).status,'retry_cooldown');
  f.advance(15*60000);const two=await runStructureDaily({...f.options,mode:'scheduled'});assert.equal(two.status,'success');assert.equal(two.runId,one.runId);assert.equal(two.attempts,2);assert.equal(f.calls.length,8);
  const after=(await f.database.prepare('SELECT id,queried_at,payload_gzip_base64 FROM structure_snapshots ORDER BY id').all()).results;for(const row of old)assert.deepEqual(after.find(value=>value.id===row.id),row);
});

test('manual same-day recaptures append only after cooldown, independent from scheduled dedupe',async()=>{
  const f=await fixture();const a=await runStructureDaily({...f.options,mode:'manual'});assert.equal((await runStructureDaily({...f.options,mode:'manual'})).status,'manual_cooldown');f.advance(60001);
  const b=await runStructureDaily({...f.options,mode:'manual'});assert.notEqual(a.runId,b.runId);assert.equal((await f.database.prepare('SELECT COUNT(*) n FROM structure_snapshots').first()).n,12);
});

test('request budget is explicit partial and resumes missing tasks within retry budget',async()=>{
  const f=await fixture();const one=await runStructureDaily({...f.options,mode:'scheduled',limits:{maxRequests:2}});assert.equal(one.status,'partial');assert.equal(one.requestCount,2);assert(one.errors.includes('REQUEST_BUDGET'));assert.equal(one.coverageComplete,false);
  f.advance(900000);const two=await runStructureDaily({...f.options,mode:'scheduled'});assert.equal(two.status,'success');assert.equal(two.runId,one.runId);assert.equal(f.calls.length,7);
});

test('single-expiry exclusion stays unavailable and never omits filter to mean all',async()=>{
  const f=await fixture({expiries:['2026-11-27']});const report=await runStructureDaily({...f.options,mode:'manual'});assert.equal(report.status,'success');assert.equal(report.savedCount,3);assert.equal(report.notApplicableCount,1);assert.equal(report.unavailableCount,0);assert.equal(f.calls.length,4);assert(f.calls.filter(call=>call.kind==='gamma').every(call=>call.expiries.length===1));
});

test('old or midnight-crossing observations never become current-day archived records',async()=>{
  const old=await fixture();old.oldClock(true);const result=await runStructureDaily({...old.options,mode:'manual'});assert.equal(result.status,'unavailable');assert.equal((await old.database.prepare('SELECT COUNT(*) n FROM structure_snapshots').first()).n,0);
  const crossing=await fixture();crossing.setClock('2026-11-28T04:59:59Z');crossing.crossMidnight(true);const report=await runStructureDaily({...crossing.options,mode:'manual'});assert.equal(report.observationDate,'2026-11-27');assert(report.errors.includes('DATE_CHANGED'));assert.equal((await crossing.database.prepare('SELECT COUNT(*) n FROM structure_snapshots').first()).n,0);
  crossing.crossMidnight(false);const next=await runStructureDaily({...crossing.options,mode:'manual'});assert.equal(next.observationDate,'2026-11-28');assert.notEqual(next.runId,report.runId);
});

test('durable lease excludes concurrent collectors, expires after process interruption, no fakepast retry',async()=>{
  const f=await fixture();await f.database.prepare('INSERT INTO structure_daily_state(id,payload_json,updated_at,lease_until) VALUES(?,?,?,?)').bind('lease','{"token":"other"}','2026-11-27T22:45:00Z',Date.parse('2026-11-27T22:47:00Z')).run();
  assert.equal((await runStructureDaily({...f.options,mode:'scheduled'})).status,'busy');assert.equal(f.calls.length,0);f.advance(120001);assert.equal((await runStructureDaily({...f.options,mode:'scheduled'})).status,'success');
  f.setClock('2026-11-28T22:45:00Z');const next=await runStructureDaily({...f.options,mode:'scheduled'});assert.equal(next.observationDate,'2026-11-28');
});

test('database backup restores compressed observations, run evidence and scheduled dedupe',async()=>{
  const f=await fixture();const report=await runStructureDaily({...f.options,mode:'scheduled'});
  await backupHfDatabase({databasePath:f.database.databasePath,backupDirectory:join(f.directory,'backups'),pythonExecutable:f.database.pythonExecutable});
  const restoredPath=join(f.directory,'restored','db.sqlite3');await restoreHfDatabase({databasePath:restoredPath,backupDirectory:join(f.directory,'backups'),pythonExecutable:f.database.pythonExecutable});const restored=await createLocalD1({databasePath:restoredPath});
  assert.equal((await runStructureDaily({...f.options,database:restored,mode:'scheduled'})).status,'already_saved');
  const handler=createStructureArchiveHandler({...f.options,database:restored});const date=await(await handler(get('/api/structure-archive?symbol=QQQ&date=2026-11-27'))).json();assert.equal(date.records.length,6);assert.equal(date.runs[0].runId,report.runId);assert.equal((await(await handler(get('/api/structure-archive?symbol=QQQ&id='+date.records[0].id))).json()).record.payload.status,'current');
});

test('GET metadata has no activation or provider calls; routes reject ambiguous and cross-site requests; capture queues202',async()=>{
  const f=await fixture(),handler=createStructureArchiveHandler({...f.options,schedulerStatus:async()=>({available:true,state:'Ready',kind:'local_process'}),authorizationStatus:async()=>({configured:true,status:'available',token:'never-expose'})});
  let status=await(await handler(get('/api/structure-daily'))).json();assert.equal(status.monitoringEnabled,false);assert.equal(status.nextRunAt,null);assert.equal((await f.database.prepare('SELECT COUNT(*) n FROM structure_daily_state').first()).n,0);assert.equal(f.calls.length,0);assert(!JSON.stringify(status).includes('never-expose'));
  await ensureStructureMonitoring({...f.options,enabled:true});status=await(await handler(get('/api/structure-daily'))).json();assert.equal(status.monitoringEnabled,true);assert.equal(status.nextRunAt,'2026-11-28T22:45:00.000Z');
  for(const path of ['/api/structure-archive/index?symbol=QQQ&symbol=AMD','/api/structure-archive?symbol=QQQ&date=2026-02-30','/api/structure-archive?symbol=QQQ&date=2026-11-27&id=abc','/api/structure-daily?activate=1'])assert.equal((await handler(get(path))).status,400);
  assert.equal((await handler(get('/api/structure-daily',{headers:{origin:'https://other.example'}}))).status,403);
  assert.equal((await handler(get('/api/structure-daily',{method:'POST'}))).status,405);
  assert.equal((await handler(get('/api/structure-daily/capture',{method:'POST',headers:{'content-type':'application/json'},body:'{"date":"2020-01-01"}'}))).status,400);
  const capture=await handler(get('/api/structure-daily/capture',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}));assert.equal(capture.status,202);await handler.waitForIdle();status=await(await handler(get('/api/structure-daily'))).json();assert.equal(status.lastRun.savedCount,6);assert.equal(status.running,false);
});

test('migration is additive and existing archives/private state stay untouched',async()=>{
  const journal=JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));assert.equal(journal.entries.at(-1).tag,'0008_structure_archive');
  const f=await fixture();assert.equal((await f.database.prepare('SELECT COUNT(*) n FROM oi_summary_snapshots').first()).n,0);assert.equal((await f.database.prepare('SELECT COUNT(*) n FROM worker_cache').first()).n,0);assert.equal((await f.database.prepare('SELECT COUNT(*) n FROM structure_snapshots').first()).n,0);
  assert.equal(STRUCTURE_ARCHIVE_LIMITS.minGapMs,2000);
});

test('provider256-character filter cannot silently truncate a30-day aggregate',async()=>{
  const expiries=Array.from({length:31},(_,i)=>new Date(Date.parse('2026-11-27T12:00:00Z')+i*86400000).toISOString().slice(0,10));
  const f=await fixture({expiries});const report=await runStructureDaily({...f.options,mode:'manual',limits:{maxRequests:5}});
  assert.equal(report.status,'partial');assert(report.errors.includes('PROVIDER_FILTER_LIMIT'));assert.equal(report.coverageComplete,false);
  assert(f.calls.filter(call=>call.kind==='gamma').every(call=>call.expiries.length===1));
  assert.equal((await f.database.prepare('SELECT COUNT(*) n FROM structure_snapshots WHERE scope_kind=?').bind('window').first()).n,0);
});

test('bounded payload and provider failures never archive synthetic or credential-bearing records',async()=>{
  const f=await fixture();f.setFailure(kind=>kind==='max_pain');const report=await runStructureDaily({...f.options,mode:'manual',limits:{maxPayloadBytes:50}});
  assert.equal(report.savedCount,0);assert(report.errors.includes('PAYLOAD_LIMIT'));assert(!JSON.stringify(report).includes('secret-test-token'));assert.equal((await f.database.prepare('SELECT COUNT(*) n FROM structure_snapshots').first()).n,0);
  await assert.rejects(runStructureDaily({...f.options,limits:{minGapMs:100}}),/INVALID_LIMITS/);
  await assert.rejects(runStructureDaily({...f.options,limits:{unknown:1}}),/INVALID_LIMITS/);
});

test('status sees another process durable lease and reads expired checkpoint as interrupted without writes',async()=>{
  const f=await fixture(),at='2026-11-27T22:45:00.000Z';
  const report={runId:'fixture-running',observationDate:'2026-11-27',mode:'scheduled',status:'running',startedAt:at,attemptStartedAt:at,attempts:1,symbols:['QQQ'],tasks:[],plans:{},requestCount:0};
  await f.database.prepare('INSERT INTO structure_daily_runs(run_id,observation_date,mode,status,payload_json,started_at,completed_at) VALUES(?,?,?,?,?,?,?)').bind(report.runId,report.observationDate,report.mode,report.status,JSON.stringify(report),at,null).run();
  await f.database.prepare('INSERT INTO structure_daily_state(id,payload_json,updated_at,lease_until) VALUES(?,?,?,?)').bind('lease','{"token":"private-task-token"}',at,Date.parse(at)+120000).run();
  const handler=createStructureArchiveHandler({...f.options,schedulerStatus:()=>({available:true,state:'Ready',kind:'cloud_process'}),authorizationStatus:()=>({configured:true,status:'available'})});
  let status=await(await handler(get('/api/structure-daily'))).json();assert.equal(status.running,true);assert.equal(status.scheduler.state,'Running');assert.equal(status.lastRun.status,'running');assert(!JSON.stringify(status).includes('private-task-token'));
  f.advance(120001);status=await(await handler(get('/api/structure-daily'))).json();assert.equal(status.running,false);assert.equal(status.lastRun.status,'interrupted');assert.equal(status.lastRun.retryEligible,true);assert.equal(JSON.parse((await f.database.prepare('SELECT payload_json FROM structure_daily_runs').first()).payload_json).status,'running');assert.equal(f.calls.length,0);
});
