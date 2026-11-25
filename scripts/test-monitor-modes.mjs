import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {createLocalD1} from './local-db.mjs';
import {createOptionsMonitorHandler} from './option-monitor.mjs';
import {createMoomooWebApiClient} from '../worker/moomoo-webapi.js';
const directory=await mkdtemp(join(tmpdir(),'pcr-monitor-modes-'));
try {
 const database=await createLocalD1({databasePath:join(directory,'test.sqlite3')});
 let clock=Date.parse('2026-11-25T16:00:00Z'),configured=true,oi=500,calls=0,failOverview=false,failEvents=false;
 const contract='US.NVDA261127C145000';
 const webApiClient={status:()=>({configured}),async overview(){calls++;if(failOverview)throw Object.assign(Error('secret-response-must-not-leak'),{code:'NO_PERMISSION'});return {data:{items:[{code:'US.NVDA',call_volume:1000,put_volume:2000,call_open_interest:10000,put_open_interest:4000}]}};},async events(){calls++;if(failEvents)throw Object.assign(Error('secret-response-must-not-leak'),{code:'TIMEOUT'});return {data:{events:[{option:contract,owner:'US.NVDA',option_type:'CALL',fill_timestamp:clock*1000,ticker_type:'BUY',price:2,volume:1000,total_volume:1200,total_open_interest:oi,strike_price:145},{option:'US.NVDA261204P145000',owner:'US.NVDA',fill_timestamp:clock*1000,ticker_type:'SELL',price:2,volume:200,total_volume:300,total_open_interest:800,strike_price:145}],update_timestamp:clock*1000},pagination:{completed:true,total:2}};}};
 const request=(provider='auto',expiration='',post=true)=>new Request('http://127.0.0.1:8765/api/options-monitor'+(post?'/refresh':'')+'?symbol=NVDA&provider='+provider+(expiration?'&expiration='+expiration:''),post?{method:'POST',headers:{'content-type':'application/json'},body:'{}'}:{});
 const handler=createOptionsMonitorHandler({webApiClient,database,now:()=>clock});
 let data=await(await handler(request('auto','',false))).json();assert.equal(calls,0);assert.equal(data.connectionMode,'webapi');assert.equal(data.checkedAt,null);
 data=await(await handler(request())).json();assert.equal(data.connectionMode,'webapi');assert.equal(data.overview.volumePcr,2);assert.equal(data.events.length,2);assert.equal(data.oiChanges.length,0);
 const cloudChecked=data.checkedAt;
 let desktop=await(await handler(request('desktop','',false))).json();assert.equal(desktop.checkedAt,null,'Cloud cache must not populate desktop source');assert.equal(desktop.connectionMode,'desktop');
 const filtered=await(await handler(request('webapi','2026-11-27'))).json();assert.equal(filtered.overview.volumePcr,2,'Expiry must not change provider symbol aggregate');assert.equal(filtered.events.length,1);assert.equal(filtered.contracts.length,1);
 clock+=86400000;oi=450;
 data=await(await handler(request())).json();assert.equal(data.oiChanges.length,2);assert.equal(data.oiChanges.find(row=>row.contract===contract).change,-50);
 const desktopHistory=await database.prepare('SELECT COUNT(*) AS n FROM option_monitor_oi').first();assert.equal(desktopHistory.n,0,'No cloud records in desktop OI table');
 const cloudHistory=await database.prepare('SELECT COUNT(*) AS n FROM option_monitor_webapi_oi').first();assert.equal(cloudHistory.n,4);
 configured=false;data=await(await handler(request('auto','',false))).json();assert.equal(data.connectionMode,'desktop');assert.equal(data.checkedAt,null);
 configured=true;failOverview=true;clock+=31000;
 data=await(await handler(request())).json();assert.equal(data.status,'partial');assert.equal(data.events.length,2);assert.equal(data.overview.volumePcr,null);assert(data.errors.some(e=>e.code==='NO_PERMISSION'));
 const partialTime=data.checkedAt;failEvents=true;clock+=31000;
 data=await(await handler(request())).json();assert.equal(data.status,'failed');assert.equal(data.stale,true);assert.equal(data.checkedAt,partialTime);assert.notEqual(data.checkedAt,cloudChecked);assert(!JSON.stringify(data).includes('secret-response'));
 assert.equal((await handler(new Request('http://localhost/api/options-monitor?symbol=NVDA&provider=orders'))).status,400);
 assert.equal((await handler(new Request('http://localhost/api/options-monitor?symbol=NVDA&provider=auto&provider=webapi'))).status,400);
 // Use the actual production client interface, not a synthetic isConfigured
 // method: this catches integration failures between auth, provider and router.
 let networkCalls=0;
 const actualClient=createMoomooWebApiClient({accessToken:'synthetic-integration-token',isConfigured:()=>configured,fetcher:async url=>{
  networkCalls++;const body=url.includes('option-underlying-overview')?{data:{items:[{code:'US.NVDA',call_volume:100,put_volume:200,call_open_interest:1000,put_open_interest:500}]}}:{data:{events:[],update_timestamp:clock*1000},pagination:{completed:true,total:0}};
  return new Response(JSON.stringify({ret_code:0,...body}),{status:200,headers:{'content-type':'application/json'}});
 }});
 const integrated=createOptionsMonitorHandler({webApiClient:actualClient,database,now:()=>clock});
 data=await(await integrated(request('auto'))).json();assert.equal(data.connectionMode,'webapi');assert.equal(data.overview.volumePcr,2);assert.equal(networkCalls,2);
 configured=false;data=await(await integrated(request('auto','',false))).json();assert.equal(data.connectionMode,'desktop');assert.equal(networkCalls,2);
 console.log('PASS monitor modes: source-isolated cache/OI, expiry-independent summaries, configured auto selection, independent partial data, failure snapshot retention and strict provider input.');
} finally {assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert(basename(directory).startsWith('pcr-monitor-modes-'));await rm(directory,{recursive:true,force:true});}
