// Bounded browser-session archive cache, exact request scope and cancellation.
// Synthetic fetcher only; no provider, running website or QA artifacts required.
import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createStructureArchiveController as candidate} from '../web/option-structure-model.js';

const DATE='2026-11-27',LATENCY=10;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function fixture({latency=LATENCY,ignoreAbort=false}={}){
  const calls=[],failed=new Map(),tampered=new Map(),denied=new Set();
  function records(symbol,date=DATE){return [
    ['gamma-a','gamma','window','30d'],['gamma-b','gamma','expiry','2026-11-30'],['gamma-c','gamma','expiry','2026-12-04'],['pain-a','max_pain','expiry','2026-11-30']
  ].map(([id,kind,scopeKind,scopeKey],index)=>({id,runId:'synthetic-run',observationDate:date,symbol,kind,scopeKind,scopeKey,expiries:scopeKind==='window'?['2026-11-30','2026-12-04']:[scopeKey],queriedAt:date+'T22:45:00Z',providerUpdatedAt:date+'T21:00:00Z',oiSettlementDate:null,status:'current',payload:kind==='gamma'?{status:'current',checkedAt:date+'T22:45:00Z',underlyingPrice:100+index,callWall:110,putWall:90,zeroGammaPoints:[99],items:Array.from({length:80},(_,i)=>({strike:60+i,callGex:i,putGex:-i/2,netGex:i/2})),profile:Array.from({length:200},(_,i)=>({spot:i+1,gex:i-100})),selectedExpiries:scopeKind==='window'?['2026-11-30','2026-12-04']:[scopeKey]}:{kind:'max_pain',symbol,expiry:scopeKey,maxPain:100,items:[{strike:90,callPain:0,putPain:10,totalPain:10},{strike:100,callPain:0,putPain:0,totalPain:0}]}}));}
  async function fetcher(path,options={}){
    const url=new URL(path,'https://synthetic.invalid'),symbol=url.searchParams.get('symbol')||'QQQ',id=url.searchParams.get('id'),date=url.searchParams.get('date')||DATE,entry={path,method:options.method,symbol,id,date,aborted:false,startedAt:performance.now()};calls.push(entry);
    await new Promise((resolve,reject)=>{let timer=setTimeout(()=>{options.signal?.removeEventListener('abort',abort);resolve();},latency);const abort=()=>{entry.aborted=true;if(!ignoreAbort){clearTimeout(timer);reject(new Error('synthetic abort'));}};options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();});
    if(denied.has(symbol))return Response.json({error:'FORBIDDEN'},{status:403});
    if(id&&failed.get(id)){failed.set(id,failed.get(id)-1);return Response.json({error:'SYNTHETIC_UNAVAILABLE'},{status:503});}
    if(url.pathname.endsWith('/index'))return Response.json({symbol,dates:[{date:DATE,recordCount:4}],truncated:false});
    if(url.pathname==='/api/structure-daily')return Response.json({monitoringEnabled:true,running:false});
    if(id){let record=records(symbol,date).find(record=>record.id===id);if(tampered.has(id)){record=tampered.get(id)(record);tampered.delete(id);}return Response.json({record});}
    return Response.json({symbol,observationDate:date,records:records(symbol,date).map(({payload,...header})=>header),runs:[],truncated:false});
  }
  return {calls,records,fetcher,failed,tampered,denied,count:predicate=>calls.filter(predicate).length};
}
async function warmed(factory,options={}){const f=fixture(options),c=factory({fetcher:f.fetcher,...options});c.setSymbol('QQQ');await c.loadDay('primary',DATE,{initial:true});return {f,c};}

test('same-date comparison and A/B/A/B selection use four exact GETs',async()=>{
  const f=fixture(),c=candidate({fetcher:f.fetcher});c.setSymbol('QQQ');await c.loadDay('primary',DATE,{initial:true});await c.loadDay('comparison',DATE);for(const id of ['gamma-b','gamma-a','gamma-b'])await c.loadRecord('comparison','gamma',id);assert.equal(f.calls.length,4);assert.equal(f.count(call=>!call.id),1);assert.equal(f.count(call=>!!call.id),3);assert(f.calls.every(call=>call.method==='GET'&&!call.path.includes('/refresh')&&!call.path.includes('/capture')));c.dispose();
});
test('simultaneous same-day comparisons coalesce headers and the shared record',async()=>{
  const f=fixture(),c=candidate({fetcher:f.fetcher});c.setSymbol('QQQ');await Promise.all([c.loadDay('primary',DATE,{initial:true}),c.loadDay('comparison',DATE)]);assert.equal(f.calls.length,3);assert.equal(f.count(call=>!call.id),1);assert.equal(f.count(call=>call.id==='gamma-a'),1);c.dispose();
});
test('aborting one shared record consumer keeps the other request alive',async()=>{
  const {f,c}=await warmed(candidate);await c.loadDay('comparison',DATE);const a=c.loadRecord('primary','gamma','gamma-b'),b=c.loadRecord('comparison','gamma','gamma-b');await pause(3);await c.loadRecord('primary','gamma','');await Promise.all([a,b]);assert.equal(c.state.primary.gamma,null);assert.equal(c.state.comparison.gamma.id,'gamma-b');assert.equal(f.count(call=>call.id==='gamma-b'),1);assert.equal(f.calls.find(call=>call.id==='gamma-b').aborted,false);c.dispose();
});
test('aborting the final consumer prevents a late ignored-abort response from caching',async()=>{
  const {f,c}=await warmed(candidate,{ignoreAbort:true});const old=c.loadRecord('primary','gamma','gamma-b');await pause(3);await c.loadRecord('primary','gamma','');await old;await pause(LATENCY+5);assert.equal(c.cacheInfo().records.entries,2);await c.loadRecord('primary','gamma','gamma-b');assert.equal(f.count(call=>call.id==='gamma-b'),2);c.dispose();
});
test('generation invalidation blocks late writes into both state and cache',async()=>{
  const {f,c}=await warmed(candidate,{ignoreAbort:true}),old=c.loadRecord('primary','gamma','gamma-b'),oldGeneration=c.cacheInfo().generation;await pause(3);c.invalidate({clearState:true});await old;await pause(LATENCY+5);assert(c.cacheInfo().generation>oldGeneration);assert.equal(c.cacheInfo().records.entries,0);assert.equal(c.state.primary.gamma,null);await c.loadDay('primary',DATE,{initial:true});await c.loadRecord('primary','gamma','gamma-b');assert.equal(f.count(call=>call.id==='gamma-b'),2);c.dispose();
});
test('failed and scope-mismatched records are not cached',async()=>{
  const {f,c}=await warmed(candidate);f.failed.set('gamma-b',1);assert.equal(await c.loadRecord('primary','gamma','gamma-b'),false);assert.equal(await c.loadRecord('primary','gamma','gamma-b'),true);assert.equal(f.count(call=>call.id==='gamma-b'),2);f.tampered.set('gamma-c',record=>({...record,scopeKey:'2026-12-05'}));assert.equal(await c.loadRecord('primary','gamma','gamma-c'),false);assert.equal(await c.loadRecord('primary','gamma','gamma-c'),true);assert.equal(f.count(call=>call.id==='gamma-c'),2);c.dispose();
});
test('the same ID cannot reuse a cached record for a different symbol or scope',async()=>{
  const {f,c}=await warmed(candidate);const before=f.count(call=>call.id==='gamma-a');c.setSymbol('AMD');await c.loadDay('primary',DATE,{initial:true});assert.equal(c.state.primary.gamma.symbol,'AMD');assert.equal(f.count(call=>call.id==='gamma-a'),before+1);
  c.state.primary.headers=c.state.primary.headers.map(record=>record.id==='gamma-a'?{...record,scopeKey:'7d'}:record);assert.equal(await c.loadRecord('primary','gamma','gamma-a'),false);assert.equal(c.state.primary.gamma,null);c.dispose();
});
test('a permissions/list boundary clears cached records before denied reads',async()=>{
  const {f,c}=await warmed(candidate);f.denied.add('QQQ');c.invalidate({clearState:true});assert.equal(c.cacheInfo().records.entries,0);assert.equal(await c.loadDay('primary',DATE,{initial:true}),false);assert.equal(c.state.primary.gamma,null);assert.equal(c.cacheInfo().records.entries,0);c.dispose();
});
test('explicit index reload invalidates record/day caches while index/status stay uncached',async()=>{
  const {f,c}=await warmed(candidate),before=f.count(call=>call.id==='gamma-a');await c.loadIndex();assert.equal(f.count(call=>call.id==='gamma-a'),before+1);await c.loadDaily();await c.loadDaily();assert.equal(f.count(call=>call.path==='/api/structure-daily'),3);c.dispose();
});
test('date headers expire after 15 seconds while immutable records can be reused',async()=>{
  let now=0;const {f,c}=await warmed(candidate,{now:()=>now});await c.loadDay('comparison',DATE);const records=f.count(call=>!!call.id);now=15001;await c.loadDay('comparison',DATE);assert.equal(f.count(call=>!call.id&&call.path.startsWith('/api/structure-archive?')),2);assert.equal(f.count(call=>!!call.id),records);c.dispose();
});
test('entry count budgets evict LRU values without exceeding their limit',async()=>{
  const {f,c}=await warmed(candidate,{cacheLimits:{records:2,days:2}});await c.loadRecord('primary','gamma','gamma-b');await c.loadRecord('primary','gamma','gamma-a');assert.equal(f.count(call=>call.id==='gamma-a'),2);for(const date of ['2026-11-26','2026-11-25'])await c.loadDay('comparison',date);assert(c.cacheInfo().records.entries<=2);assert(c.cacheInfo().days.entries<=2);c.dispose();
});
test('single oversized values skip caches and byte budgets are never exceeded',async()=>{
  const {f,c}=await warmed(candidate,{cacheLimits:{recordBytes:128,dayBytes:128}});await c.loadRecord('primary','gamma','gamma-b');await c.loadRecord('primary','gamma','gamma-b');assert.equal(f.count(call=>call.id==='gamma-b'),2);await c.loadDay('comparison',DATE);assert.equal(c.cacheInfo().records.entries,0);assert.equal(c.cacheInfo().days.entries,0);assert.equal(f.count(call=>call.id==='gamma-b'),3);assert(c.cacheInfo().records.bytes<=128&&c.cacheInfo().days.bytes<=128);c.dispose();
});
test('cached snapshots cannot be mutated by one comparison to poison the other',async()=>{
  const {c}=await warmed(candidate);await c.loadDay('comparison',DATE);assert(Object.isFrozen(c.state.primary.gamma.payload.profile));assert.throws(()=>{c.state.primary.gamma.payload.profile[0].gex=999;},TypeError);assert.equal(c.state.comparison.gamma.payload.profile[0].gex,-100);c.dispose();
});
