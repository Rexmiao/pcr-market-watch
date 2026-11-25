import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createChartLibraryController} from '../web/chart-library.js';

const stamp='2026-11-25T01:00:00Z';
const instrument=date=>({rows:[{date,p:1,c:2}],freshness:{status:'pending_source'}});
const core=date=>({asof:date,checkedAt:stamp,instruments:{NVDA:instrument(date),AMD:instrument(date)},freshness:{status:'pending_source'}});
const symbol=(name,date)=>({symbol:name,asof:date,checkedAt:stamp,instrument:instrument(date),freshness:{status:'pending_source'}});
const history=()=>({rows:[],asof:'2026-11-23',checkedAt:stamp,freshness:{status:'pending_source'},coverage:{missingDates:['2026-11-24']}});
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const calls=[];
let refreshed=false;
const fetcher=async(path,options={})=>{
  calls.push({path,method:options.method});
  const url=new URL(path,'https://test.example');
  if(url.pathname==='/api/watchlist-settings'){
    assert.equal(options.method,'GET','The chart library must never seed or mutate the saved watchlist');
    return json({initialized:true,revision:4,storage:'cloud',items:[{symbol:'NVDA',category:'semi'},{symbol:'SNDK',category:'semi'}]});
  }
  if(url.pathname==='/api/watchlist')return json(core('2026-11-23'));
  if(url.pathname==='/api/refresh'){
    assert.equal(options.method,'POST');assert.equal(options.body,'{}');
    refreshed=true;await new Promise(accept=>setTimeout(accept,4));
    return json({status:'failed',data:core('2026-11-20')},502);
  }
  if(url.pathname==='/api/symbol'){
    if(url.searchParams.get('refresh')==='1')return json({code:'SOURCE_FAILURE',data:symbol('SNDK','2026-11-23')},502);
    return json(symbol('SNDK','2026-11-23'));
  }
  if(url.pathname==='/api/cboe/history/refresh'){
    assert.equal(options.method,'POST');assert.equal(url.searchParams.get('range'),'252');
    return json({...history(),refresh:{status:'partial',remainingGaps:2}});
  }
  if(url.pathname==='/api/cboe/history')return json(history());
  throw Error('Unexpected endpoint: '+path);
};
const controller=createChartLibraryController({fetcher});
await controller.load();
assert.deepEqual(controller.records().map(row=>row.symbol),['NVDA','SNDK']);
assert.equal(controller.records()[1].date,'2026-11-23');
const first=controller.refresh(),second=controller.refresh();
assert.equal(first,second,'Repeated clicks must share the active update');
await first;
assert(refreshed);
assert.equal(calls.filter(call=>call.path==='/api/refresh').length,1);
assert.equal(controller.records()[0].date,'2026-11-23','A failed source must not roll data back to an older activity date');
assert.equal(controller.records()[0].operation,'retained');
assert.equal(controller.records()[1].operation,'failed');
assert.equal(controller.records()[1].date,'2026-11-23');
assert.equal(controller.state.cboe.date,'2026-11-23');
assert.equal(controller.state.cboe.operation,'partial');
assert.equal(controller.state.busy,false);
assert(calls.filter(call=>call.path==='/api/watchlist-settings').length>=3,'Update must re-read the DB list');

for(const initialized of [true,false]){
  const emptyCalls=[];
  const empty=createChartLibraryController({fetcher:async(path,options)=>{
    emptyCalls.push({path,method:options.method});
    if(path==='/api/watchlist-settings')return json({initialized,revision:initialized?2:0,items:initialized?[]:null});
    if(path==='/api/watchlist')return json(core('2026-11-23'));
    if(path.startsWith('/api/cboe/history/refresh'))return json({...history(),refresh:{status:'pending_source'}});
    if(path.startsWith('/api/cboe/history'))return json(history());
    throw Error('No symbols may be invented for an empty/uninitialized profile');
  }});
  await empty.load();await empty.refresh();
  assert.equal(empty.records().length,0);
  assert.equal(empty.state.profile.initialized,initialized);
  assert.equal(emptyCalls.some(call=>call.path==='/api/refresh'||call.path.startsWith('/api/symbol')),false);
  assert.equal(emptyCalls.some(call=>call.path==='/api/watchlist-settings'&&call.method!=='GET'),false);
}

let simultaneous=0,peak=0;
const extraOnly=createChartLibraryController({fetcher:async(path,options)=>{
  const url=new URL(path,'https://test.example');
  if(url.pathname==='/api/watchlist-settings')return json({initialized:true,revision:1,items:['SNDK','AAPL','MSFT','NFLX','GOOG'].map(symbol=>({symbol,category:null}))});
  if(url.pathname==='/api/watchlist')return json(core('2026-11-23'));
  if(url.pathname.startsWith('/api/cboe/history'))return json(history());
  if(url.pathname==='/api/symbol'){
    simultaneous++;peak=Math.max(peak,simultaneous);
    await new Promise(accept=>setTimeout(accept,3));simultaneous--;
    return json(symbol(url.searchParams.get('symbol'),'2026-11-23'));
  }
  throw Error('Unexpected endpoint');
}});
await extraOnly.load();await extraOnly.refresh();
assert.equal(extraOnly.records().length,5);
assert.equal(peak,2,'Non-core symbols must use at most two parallel requests');

const html=await readFile(new URL('../web/charts.html',import.meta.url),'utf8');
assert(!html.includes('七个标的'));
assert(html.includes('/source-notes.js'));
const catalog=JSON.parse(await readFile(new URL('../web/archive/catalog.json',import.meta.url),'utf8'));
assert.equal(catalog.items.find(item=>item.id==='seven-watchlist').path,'/archive/seven-watchlist.html');
assert.equal(catalog.items.find(item=>item.id==='seven-watchlist').title,'关注名单 PCR 历史快照');
console.log('PASS chart library DB-only watchlist, empty/uninitialized lists, read-only profile, source refresh APIs, stale/failed data retention, non-reentrant updates, and two-request symbol concurrency');
