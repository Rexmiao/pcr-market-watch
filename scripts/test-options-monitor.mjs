import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {createLocalD1} from './local-db.mjs';
import {createOptionsMonitorHandler} from './option-monitor.mjs';
import {monitorOverview,monitorChain,selectMonitorContracts,normalizeMonitorTrades,handleOptionsMonitorApi} from '../worker/option-monitor.js';

const directory=await mkdtemp(join(tmpdir(),'pcr-options-monitor-'));
try {
  const database=await createLocalD1({databasePath:join(directory,'test.sqlite3')});
  await database.prepare('INSERT INTO user_watchlists(owner_id,items_json,groups_json,revision,updated_at) VALUES(?,?,?,?,?)').bind('fixture','[]','[]',7,'2026-11-24T00:00:00Z').run();
  let clock=Date.parse('2026-11-25T15:00:00Z'),calls=0,fail=false,callVolume=100,putVolume=300,callOi=1000,putOi=500;
  const symbols=['NVDA261127C145000','NVDA261127P145000'];
  const client={
    async optionExpirations(){calls++;if(fail)throw Object.assign(Error('Private provider response must not leak'),{code:'PROVIDER_UNAVAILABLE'});return {data:{date_list:[{strike_time:'2026-11-27'}]}};},
    async optionChain(){calls++;return {data:{option_chain:[{strike_time:'2026-11-27',option:symbols.map(code=>({security:{code,market:11}}))}]}};},
    async quotes(){calls++;return {data:{basic_qot_list:[{security:{code:'NVDA'},cur_price:145,update_timestamp:clock/1000}]}};},
    async securitySnapshots(){calls++;return {data:{snapshot_list:symbols.map((code,i)=>({basic:{security:{code},cur_price:2,volume:i?putVolume:callVolume,update_timestamp:clock/1000},option_ex_data:{open_interest:i?putOi:callOi,implied_volatility:50}}))}};},
    async optionTrades(contract){calls++;return {data:{ticker_list:[{sequence:1,timestamp:clock/1000,dir:1,price:2,volume:600,turnover:120000},{sequence:2,timestamp:(clock-86400000)/1000,dir:2,price:2,volume:900}]}};},
  };
  const handler=createOptionsMonitorHandler({client,database,now:()=>clock});
  const request=(path='/api/options-monitor?symbol=NVDA',post=false,extra={})=>new Request('http://127.0.0.1:8876'+path,post?{method:'POST',headers:{'content-type':'application/json',...extra.headers},body:extra.body||'{}'}:extra);
  let data=await (await handler(request())).json();
  assert.equal(data.status,'unavailable');assert.equal(data.checkedAt,null);assert.equal(calls,0,'GET must never query the provider');
  data=await (await handler(request('/api/options-monitor/refresh?symbol=NVDA',true))).json();
  assert.equal(data.status,'current');assert.equal(data.overview.volumePcr,3);assert.equal(data.overview.oiPcr,.5);
  assert.equal(data.coverage.isComplete,false);assert.equal(data.coverage.selectedContracts,2);assert.equal(data.coverage.expiration,'2026-11-27');
  assert.equal(data.overview.oiAsOf,null);assert.equal(data.events.length,2);assert(data.events.every(e=>e.openClose==='unknown'&&e.side==='buy'));
  assert.deepEqual(data.oiChanges,[],'No invented first-day OI comparison');
  const afterFirst=calls,firstChecked=data.checkedAt;
  assert.equal((await (await handler(request('/api/options-monitor/refresh?symbol=NVDA',true))).json()).refreshStatus,'cooldown');
  await handler(request());assert.equal(calls,afterFirst,'Cache reads/cooldown cause no provider calls');
  clock+=31000;callVolume=120;putVolume=350;
  const concurrent=await Promise.all([handler(request('/api/options-monitor/refresh?symbol=NVDA',true)),handler(request('/api/options-monitor/refresh?symbol=NVDA',true))]);
  const both=await Promise.all(concurrent.map(r=>r.json()));
  assert.equal(calls-afterFirst,6,'Concurrent refreshes use one bounded scan');
  assert(both.some(d=>d.coalesced));
  data=both[0];assert.equal(data.contracts.find(c=>c.optionType==='CALL').volumeIncreaseSincePreviousCheck,20);
  assert.equal(data.contracts.find(c=>c.optionType==='PUT').volumeIncreaseSincePreviousCheck,50);
  assert.notEqual(data.checkedAt,firstChecked);
  const lastGood=data.checkedAt;
  clock+=31000;fail=true;
  data=await (await handler(request('/api/options-monitor/refresh?symbol=NVDA',true))).json();
  assert.equal(data.status,'failed');assert.equal(data.stale,true);assert.equal(data.checkedAt,lastGood);assert.equal(data.contracts.length,2);
  assert(!JSON.stringify(data).includes('Private provider response'));
  fail=false;clock+=86400000;callOi=1100;putOi=450;
  data=await (await handler(request('/api/options-monitor/refresh?symbol=NVDA',true))).json();
  assert.equal(data.oiChanges.length,2);assert(data.oiChanges.every(c=>c.basis==='observed_oi_change'&&c.currentOiAsOf===null&&c.openClose==='unknown'));
  assert.equal(data.oiChanges.find(c=>c.optionType==='CALL').change,100);
  assert.equal(data.oiChanges.find(c=>c.optionType==='PUT').change,-50);
  assert(data.contracts.every(c=>c.volumeIncreaseSincePreviousCheck===null),'No cumulative volume delta across observation days');
  const restarted=createOptionsMonitorHandler({client,database,now:()=>clock});const beforeRead=calls;
  const persisted=await (await restarted(request())).json();assert.equal(persisted.checkedAt,data.checkedAt);assert.equal(calls,beforeRead);
  assert.equal((await database.prepare('SELECT revision FROM user_watchlists WHERE owner_id=?').bind('fixture').first()).revision,7);
  assert.equal((await handler(new Request('http://127.0.0.1:8876/api/options-monitor?symbol=NVDA',{headers:{origin:'https://hostile.example'}}))).status,403);
  for(const query of ['symbol=NVDA%3Bbad','symbol=NVDA&command=orders','symbol=NVDA&symbol=AMD','symbol=NVDA&expiration=2026-02-30'])assert.equal((await handler(request('/api/options-monitor?'+query))).status,400);
  assert.equal((await handler(request('/api/options-monitor/refresh?symbol=NVDA',true,{body:'{"command":"orders"}'}))).status,400);
  const missing=monitorOverview([{optionType:'CALL',volume:null,openInterest:10},{optionType:'PUT',volume:100,openInterest:0}]);assert.equal(missing.volumePcr,null);
  const many=Array.from({length:100},(_,i)=>({contract:String(i),strike:i,optionType:i%2?'CALL':'PUT'}));assert.equal(selectMonitorContracts(many,50).length,20);
  assert.deepEqual(monitorChain({security:{code:'OTHER261127C145000'}},'NVDA','2026-11-27'),[]);
  assert.deepEqual(normalizeMonitorTrades({contract:'US.NVDA261127C145000',root:'NVDA'},[{price:2,volume:600}],clock),[],'Unknown trade dates are not presented as current-session prints');
  const cloud=handleOptionsMonitorApi(request());assert.equal(cloud.status,503);assert.equal((await cloud.json()).status,'local_backend_required');
  console.log('PASS options monitor: bounded scoped sums, cache-only GET, cooldown/coalescing, timestamp and unknown-direction handling, real SQLite persistence/observed OI changes, failures retain verified data, independent watchlists, validation and cloud boundaries.');
} finally {
  assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert(basename(directory).startsWith('pcr-options-monitor-'));
  await rm(directory,{recursive:true,force:true});
}
