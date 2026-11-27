import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLocalD1} from './local-db.mjs';
import {createOiHistoryStore} from './oi-history.mjs';
import {captureDailyOi,dailyWatchlistSymbols,nextOiDailyRun,oiDailyIsDue,oiObservationDate,createOiDailyStatusHandler} from './oi-daily.mjs';
import {createRuntimeMoomooAuth} from './runtime-auth.mjs';
import {backupHfDatabase,restoreHfDatabase} from './hf-storage.mjs';

test('daily 17:30 New York follows daylight saving and actual query dates',()=>{
  assert.equal(nextOiDailyRun(Date.parse('2026-11-26T05:00:00Z')),'2026-11-26T22:30:00.000Z');
  assert.equal(nextOiDailyRun(Date.parse('2026-07-02T04:00:00Z')),'2026-07-02T21:30:00.000Z');
  assert.equal(nextOiDailyRun(Date.parse('2026-03-07T23:00:00Z')),'2026-03-08T21:30:00.000Z');
  assert.equal(oiObservationDate(Date.parse('2026-11-26T03:00:00Z')),'2026-11-25');
  assert(!oiDailyIsDue(Date.parse('2026-11-26T22:29:00Z')));assert(oiDailyIsDue(Date.parse('2026-11-26T22:30:00Z')));
});
test('fresh captures persist exact date, follow changed watchlist, and never archive retained failures as today',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'pcr-daily-')),database=await createLocalD1({databasePath:join(directory,'test.sqlite3')});
  await database.prepare('INSERT INTO user_watchlists(owner_id,items_json,groups_json,revision,updated_at) VALUES(?,?,?,?,?)').bind('local_user',JSON.stringify([{symbol:'AMD',category:null},{symbol:'QQQ',category:null}]),'[]',1,'2026-11-26T20:00:00Z').run();
  let clock=Date.parse('2026-11-26T22:30:00Z'),fail=false,calls=0;
  const client={status:()=>({configured:true}),overview:async symbol=>{calls++;if(fail)throw {code:'TIMEOUT'};return {provider:'moomoo_webapi',checkedAt:new Date(clock+1000).toISOString(),data:{items:[{code:'US.'+symbol,put_open_interest:200,call_open_interest:100}]}};}};
  const options={database,webApiClient:client,rootDirectory:join(directory,'oi-daily'),now:()=>clock,mode:'scheduled'};
  assert.equal((await captureDailyOi(options)).status,'success');assert.equal(calls,2);
  assert.equal((await captureDailyOi(options)).status,'already_saved');assert.equal(calls,2);
  const history=createOiHistoryStore({database,now:()=>clock});assert((await history.readDate(['AMD','QQQ'],'2026-11-26')).every(v=>v.oiPcr===2));
  clock+=86400000;fail=true;
  const failed=await captureDailyOi(options);assert.equal(failed.status,'unavailable');assert.equal(failed.savedCount,0);
  assert((await history.readDate(['AMD','QQQ'],'2026-11-27')).every(v=>v.checkedAt===null));
  assert.equal((await captureDailyOi(options)).status,'retry_cooldown');
  clock+=15*60000;await captureDailyOi(options);clock+=15*60000;await captureDailyOi(options);clock+=15*60000;assert.equal((await captureDailyOi(options)).status,'attempts_exhausted');
  clock+=86400000;fail=false;
  await database.prepare('UPDATE user_watchlists SET items_json=? WHERE owner_id=?').bind(JSON.stringify([{symbol:'NVDA',category:null}]),'local_user').run();
  assert.deepEqual(await dailyWatchlistSymbols(database),['NVDA']);
  const changed=await captureDailyOi({...options,mode:'manual'});assert.equal(changed.savedCount,1);assert.equal(changed.requestedCount,1);
  const state=JSON.parse(await readFile(join(directory,'oi-daily','state.json'),'utf8'));assert.equal(state.lastRun.observationDate,'2026-11-28');
});
test('daily status is read-only, distinguishes a planned time from a registered task, excludes private paths',async()=>{
  const rootDirectory=await mkdtemp(join(tmpdir(),'pcr-daily-status-'));
  const handler=createOiDailyStatusHandler({database:{databasePath:join(rootDirectory,'private.sqlite3')},rootDirectory,now:()=>Date.parse('2026-11-26T12:00:00Z'),schedulerStatus:async()=>({available:false,state:'not_found'})});
  const response=await handler(new Request('http://127.0.0.1/api/oi-daily'));const body=await response.json();
  assert.equal(body.scheduler.available,false);assert.equal(body.lastRun,null);assert.equal(body.nextPlannedAt,'2026-11-26T22:30:00.000Z');assert(!JSON.stringify(body).includes(rootDirectory));
  assert.equal((await handler(new Request('http://127.0.0.1/api/oi-daily',{method:'POST'}))).status,405);
  assert.equal((await handler(new Request('http://127.0.0.1/api/oi-daily',{headers:{origin:'https://other.example'}}))).status,403);
});
test('SQLite backup restores run metadata and daily dedup even when ephemeral state files are gone',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'pcr-daily-durable-')),database=await createLocalD1({databasePath:join(directory,'original.sqlite3')});
  await database.prepare('INSERT INTO user_watchlists(owner_id,items_json,groups_json,revision,updated_at) VALUES(?,?,?,?,?)').bind('local_user',JSON.stringify([{symbol:'AMD',category:null}]),'[]',1,'2026-11-26T20:00:00Z').run();
  let clock=Date.parse('2026-11-26T22:30:00Z'),calls=0;
  const client={status:()=>({configured:true}),overview:async symbol=>{calls++;clock+=1000;return {provider:'moomoo_webapi',checkedAt:new Date(clock).toISOString(),data:{items:[{code:'US.'+symbol,put_open_interest:200,call_open_interest:100}]}};}};
  const first=await captureDailyOi({database,webApiClient:client,rootDirectory:join(directory,'old-runtime-files'),mode:'scheduled',now:()=>clock});assert.equal(first.status,'success');assert.equal(calls,1);
  const runRows=(await database.prepare('SELECT run_id,payload_json FROM oi_daily_runs').all()).results;assert.equal(runRows.length,1);assert.equal(runRows[0].run_id,first.runId);assert.equal(JSON.parse(runRows[0].payload_json).savedCount,1);
  const backupDirectory=join(directory,'persistent-backups'),pythonExecutable=database.pythonExecutable;
  await backupHfDatabase({databasePath:database.databasePath,backupDirectory,pythonExecutable});
  const restoredPath=join(directory,'restored-runtime','test.sqlite3');await restoreHfDatabase({databasePath:restoredPath,backupDirectory,pythonExecutable});
  const restored=await createLocalD1({databasePath:restoredPath}),freshFiles=join(directory,'new-runtime-files');
  const resumed=await captureDailyOi({database:restored,webApiClient:client,rootDirectory:freshFiles,mode:'scheduled',now:()=>clock+60000});
  assert.equal(resumed.status,'already_saved');assert.equal(calls,1,'Restart must not repeat a successful saved day.');
  // A stale compatibility mirror cannot replace the durable original metadata.
  await mkdir(freshFiles,{recursive:true});await writeFile(join(freshFiles,'state.json'),JSON.stringify({schemaVersion:1,timeZone:'America/New_York',lastRun:{status:'unavailable',observationDate:'2000-01-01'}}));
  const handler=createOiDailyStatusHandler({database:restored,rootDirectory:freshFiles,now:()=>clock,schedulerStatus:async()=>({available:false,state:'not_supported'})});
  const status=await(await handler(new Request('http://127.0.0.1/api/oi-daily'))).json();
  assert.equal(status.lastRun.status,'success');assert.equal(status.lastRun.observationDate,'2026-11-26');assert.equal(status.lastRun.startedAt,first.startedAt);assert.equal(status.lastRun.savedCount,1);
  assert.equal((await restored.prepare('SELECT COUNT(*) AS n FROM oi_daily_runs').first()).n,1);
});
test('completed metadata transaction failure never replaces the previous durable state',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'pcr-daily-atomic-')),database=await createLocalD1({databasePath:join(directory,'test.sqlite3')});
  await database.prepare('INSERT INTO user_watchlists(owner_id,items_json,groups_json,revision,updated_at) VALUES(?,?,?,?,?)').bind('local_user',JSON.stringify([{symbol:'AMD',category:null}]),'[]',1,'2026-11-26T20:00:00Z').run();
  let clock=Date.parse('2026-11-26T22:30:00Z');
  const client={status:()=>({configured:true}),overview:async symbol=>({provider:'moomoo_webapi',checkedAt:new Date(clock+1000).toISOString(),data:{items:[{code:'US.'+symbol,put_open_interest:200,call_open_interest:100}]}})};
  const rootDirectory=join(directory,'files'),first=await captureDailyOi({database,webApiClient:client,rootDirectory,mode:'manual',now:()=>clock});
  const before=await database.prepare('SELECT payload_json FROM oi_daily_state WHERE id=?').bind('daily').first();
  await database.prepare("CREATE TRIGGER reject_daily_runs BEFORE INSERT ON oi_daily_runs BEGIN SELECT RAISE(ABORT,'TEST_REJECTED'); END").run();
  clock+=86400000;
  await assert.rejects(captureDailyOi({database,webApiClient:client,rootDirectory,mode:'manual',now:()=>clock}));
  assert.equal((await database.prepare('SELECT payload_json FROM oi_daily_state WHERE id=?').bind('daily').first()).payload_json,before.payload_json);
  assert.equal((await database.prepare('SELECT COUNT(*) AS n FROM oi_daily_runs').first()).n,1);
  assert.equal(JSON.parse((await database.prepare('SELECT payload_json FROM oi_daily_runs').first()).payload_json).runId,first.runId);
});
test('cloud auth never reads Windows secrets, requires quote-only scope and future expiry',async()=>{
  const env={PCR_RUNTIME:'cloud',MOOMOO_WEBAPI_ACCESS_TOKEN:'unit-test-token',MOOMOO_WEBAPI_SCOPE:'quote:read',MOOMOO_WEBAPI_EXPIRES_AT:'2026-11-27T23:00:00Z'};
  const auth=createRuntimeMoomooAuth({env,now:()=>Date.parse('2026-11-26T00:00:00Z')});assert(auth.isConfigured());assert.equal(await auth.getAccessToken(),'unit-test-token');
  await assert.rejects(auth.getAccessToken({forceRefresh:true}),{code:'AUTH_REQUIRED'});
  env.MOOMOO_WEBAPI_SCOPE='quote:read trade:read';assert(!auth.isConfigured());await assert.rejects(auth.getAccessToken(),{code:'NOT_CONFIGURED'});
});
