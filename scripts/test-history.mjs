import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handleCboeApi, cboeTesting as t} from '../worker/cboe.js';

const seed=JSON.parse(await readFile(new URL('../data/cboe-seed.json',import.meta.url),'utf8'));
const recordMap=value=>new Map(value.observations.map(snapshot=>[snapshot.date,{schemaVersion:1,snapshot,checkedAt:value.checkedAt}]));
const htmlFor=snapshot=>{
  const optionsData={ratios:Object.values(snapshot.metrics).map(metric=>({name:metric.name,value:metric.ratio.toFixed(2)}))};
  for(const [key,table] of [['index','INDEX OPTIONS'],['total','SUM OF ALL PRODUCTS'],['etp','EXCHANGE TRADED PRODUCTS'],['equity','EQUITY OPTIONS']])optionsData[table]=[{name:'VOLUME',put:snapshot.metrics[key].put,call:snapshot.metrics[key].call}];
  const data={selectedDate:snapshot.date,optionsData};
  return '<script>self.__next_f.push('+JSON.stringify([1,'25:'+JSON.stringify(['$','$L33',null,{data}])+'\n'])+')</script>';
};
const origin='https://cboe-history-test.example';
const request=(path,method='GET',body)=>new Request(origin+path,{method,...(body===undefined?{}:{body,headers:{'content-type':'application/json'}})});
const expected=seed.expectedSessionDates;
assert.equal(expected.length,331);
assert.equal(seed.observations.length,331);
assert.equal(expected[0],'2025-08-01');
assert.equal(expected.at(-1),'2026-11-23');

// Independent raw-volume sums verify the pooled method and the warm-up before the displayed range.
const view=t.cboeHistoryView(seed,recordMap(seed),'2026-11-23','126');
assert.equal(view.rows.length,126);
assert.equal(view.actualEnd,'2026-11-23');
assert.equal(view.coverage.continuous,true);
assert.equal(view.rows.at(-1).index.daily,1.21);
assert.equal(view.rows.at(-1).index.dailyText,'1.21');
for(const row of [view.rows[0],view.rows.at(-1)])for(const key of ['index','total','etp','equity'])for(const n of [20,60]){
  const last=expected.indexOf(row.date),window=expected.slice(last-n+1,last+1).map(day=>seed.observations.find(value=>value.date===day).metrics[key]);
  const p=window.reduce((sum,value)=>sum+value.put,0),c=window.reduce((sum,value)=>sum+value.call,0);
  assert.equal(row[key]['p'+n],p);assert.equal(row[key]['c'+n],c);assert.equal(row[key]['r'+n],p/c);
}
assert.equal(view.rows.at(-1).index.p20,82924514);
assert.equal(view.rows.at(-1).index.c20,78117340);
assert.equal(view.rows.at(-1).index.r60,212650886/211153503);
assert.equal(view.rows.at(-1).equity.daily,0.55);
assert.equal(view.rows.at(-1).equity.derived,true);
assert.equal(view.rows.at(-1).equity.derived20,true);
assert.equal(view.rows.at(-1).equity.source,'derived_from_cboe_category_volumes');
assert.equal(view.coverage.metrics.equity.derivedSessions,126);
const legacySeed=structuredClone(seed);for(const row of legacySeed.observations)delete row.metrics.equity;
const legacyView=t.cboeHistoryView(legacySeed,recordMap(legacySeed),'2026-11-23','126');
assert.equal(legacyView.rows.at(-1).equity.r60,view.rows.at(-1).equity.r60);
assert.equal(legacyView.rows.at(-1).equity.derived60,true);
assert.equal(legacyView.rows.at(-1).total.r20,view.rows.at(-1).total.r20);
const equityGap=structuredClone(seed);
delete equityGap.observations.at(-2).metrics.equity;
Object.assign(equityGap.observations.at(-2).metrics.total,{put:0,ratio:0});
const equityGapView=t.cboeHistoryView(equityGap,recordMap(equityGap),'2026-11-23','126');
assert.equal(equityGapView.rows.at(-1).equity.r20,null);
assert.equal(equityGapView.rows.at(-1).index.r20,view.rows.at(-1).index.r20,'Unavailable EQUITY cannot invalidate INDEX windows');
const last20=seed.observations.slice(-20).map(row=>row.metrics.index.ratio);
assert.notEqual(view.rows.at(-1).index.r20,last20.reduce((a,b)=>a+b,0)/20,'Do not average published daily ratios');
assert.equal(t.cboeHistoryView(seed,recordMap(seed),null,'252').rows.length,252);
const all=t.cboeHistoryView(seed,recordMap(seed),null,'all');
assert.equal(all.rows.length,331);assert.equal(all.rows[18].index.r20,null);assert.equal(all.rows[19].index.r20!==null,true);
assert.equal(all.rows[58].index.r60,null);assert.equal(all.rows[59].index.r60!==null,true);

// One missing real session leaves an explicit gap and invalidates every overlapping window.
const gap=expected.at(-25),gapped={...seed,observations:seed.observations.filter(row=>row.date!==gap)};
const gapView=t.cboeHistoryView(gapped,recordMap(gapped),null,'126');
assert.equal(gapView.rows.find(row=>row.date===gap).index.daily,null);
assert.equal(gapView.rows.at(-1).index.r20!==null,true);
assert.equal(gapView.rows.at(-1).index.r60,null);
assert.deepEqual(gapView.coverage.missingDates,[gap]);
const noVolume=structuredClone(seed),volumeGap=noVolume.observations.at(-2);
volumeGap.metrics.etp.put=null;volumeGap.metrics.etp.call=null;
const volumeView=t.cboeHistoryView(noVolume,recordMap(noVolume),null,'126');
assert.equal(volumeView.rows.at(-1).etp.r20,null);
assert.equal(volumeView.rows.at(-1).index.r20,view.rows.at(-1).index.r20);
assert.deepEqual(volumeView.coverage.missingVolumeDates,[volumeGap.date]);
const zero=structuredClone(seed);
for(const row of zero.observations.slice(-60))row.metrics.index={...row.metrics.index,ratio:0,put:0,call:0};
const zeroView=t.cboeHistoryView(zero,recordMap(zero),null,'126');
assert.equal(zeroView.rows.at(-1).index.p20,0);assert.equal(zeroView.rows.at(-1).index.c20,0);assert.equal(zeroView.rows.at(-1).index.r20,null);
// Prefix sums must stay exact even when totals before the window exceed safe integers.
const large=structuredClone(zero);
for(const row of large.observations.slice(0,-60))row.metrics.index={...row.metrics.index,ratio:1,put:Number.MAX_SAFE_INTEGER,call:Number.MAX_SAFE_INTEGER};
large.observations.at(-1).metrics.index={...large.observations.at(-1).metrics.index,ratio:1,put:7,call:7};
const largeView=t.cboeHistoryView(large,recordMap(large),null,'126');
assert.equal(largeView.rows.at(-1).index.p20,7);assert.equal(largeView.rows.at(-1).index.c60,7);assert.equal(largeView.rows.at(-1).index.r60,1);
assert.equal(largeView.rows[0].index.r20,null,'Unsafe window totals remain null');
assert.equal(t.cboeRegularSession('2025-01-09'),false);
assert.equal(t.cboeRegularSession('2026-04-03'),false);
assert.equal(t.cboeRegularSession('2026-11-26'),false);
assert.equal(t.cboeRegularSession('2021-12-31'),true);
assert.equal(t.cboeHistoryClock(seed,new Date('2026-11-24T20:59:00Z')).completedSession,'2026-11-23');
assert.equal(t.cboeHistoryClock(seed,new Date('2026-11-24T21:01:00Z')).completedSession,'2026-11-24');
assert.equal(t.cboeHistoryClock(seed,new Date('2026-11-27T17:59:00Z')).marketOpen,true);
assert.equal(t.cboeHistoryClock(seed,new Date('2026-11-27T18:01:00Z')).completedSession,'2026-11-27');

const originalFetch=globalThis.fetch,originalCaches=globalThis.caches;
try {
  t.clearMemory();let fetches=[];
  globalThis.fetch=async()=>{throw Error('A history GET must not call Cboe');};
  globalThis.caches={get default(){throw Error('This Worker is not permitted to access the default cache.');}};
  let response=await handleCboeApi(request('/api/cboe/history?range=126'),{},null,seed),result=await response.json();
  assert.equal(response.status,200);assert.equal(result.rows.length,126);
  assert.equal((await handleCboeApi(request('/api/cboe/history?range=20'),{},null,seed)).status,400);
  assert.equal((await handleCboeApi(request('/api/cboe/history?end=2026-02-30'),{},null,seed)).status,400);
  assert.equal((await handleCboeApi(request('/api/cboe/history?end=2026-11-23&end=2026-11-20'),{},null,seed)).status,400);
  assert.equal((await handleCboeApi(request('/api/cboe/history/refresh','GET'),{},null,seed)).status,405);
  assert.equal((await handleCboeApi(request('/api/cboe/history/refresh','POST','{"other":1}'),{},null,seed)).status,400);

  // One explicit refresh performs one bounded batch, even with a denied persistent cache.
  const sparse={...seed,observations:seed.observations.slice(0,-18)};
  globalThis.fetch=async(url,options)=>{
    assert.equal(options.redirect,'manual');
    const day=new URL(url).searchParams.get('dt');fetches.push(day);
    return new Response(htmlFor(seed.observations.find(row=>row.date===day)));
  };
  t.clearMemory();
  response=await handleCboeApi(request('/api/cboe/history/refresh?end=2026-11-23&range=126','POST','{}'),{},null,sparse);result=await response.json();
  assert.equal(response.status,200);assert.equal(fetches.length,15);assert.equal(result.refresh.addedDates.length,15);assert.equal(result.refresh.remainingGaps,3);
  assert.deepEqual([...fetches].sort(),expected.slice(-15));
  assert.equal(result.actualEnd,'2026-11-23');assert.equal(result.rows.at(-1).index.daily,1.21);
  const readback=await (await handleCboeApi(request('/api/cboe/history?end=2026-11-23&range=126'),{},null,sparse)).json();
  assert.equal(readback.rows.at(-1).index.daily,1.21);assert.equal(fetches.length,15);
  assert.equal((await handleCboeApi(request('/api/cboe/history/refresh?end=2026-11-23&range=126','POST'),{},null,sparse)).status,429);
  assert.equal(fetches.length,15);

  // A put failure is equally optional; a later source failure cannot erase seed data.
  t.clearMemory();fetches=[];
  globalThis.caches={default:{async match(){return undefined;},async put(){throw Error('cache write denied');}}};
  const almost={...seed,observations:seed.observations.slice(0,-1)};
  result=await (await handleCboeApi(request('/api/cboe/history/refresh?end=2026-11-23&range=126','POST'),{},null,almost)).json();
  assert.equal(result.refresh.status,'updated');assert.equal(result.rows.at(-1).index.r60,view.rows.at(-1).index.r60);
  result=await (await handleCboeApi(request('/api/cboe/history?range=126'),{},null,almost)).json();
  assert.equal(result.actualEnd,'2026-11-23');
  t.clearMemory();
  globalThis.fetch=async()=>new Response('',{status:302,headers:{location:'https://other.example/'}});
  result=await (await handleCboeApi(request('/api/cboe/history/refresh?end=2026-11-23&range=126','POST'),{},null,almost)).json();
  assert.equal(result.refresh.status,'failed');assert.equal(result.actualEnd,almost.observations.at(-1).date);assert.equal(result.refresh.errors.length,1);

  // A successful legacy snapshot load is visible in the new read-only history without a second source call.
  t.clearMemory();let calls=0;
  globalThis.fetch=async()=>{calls++;return new Response(htmlFor(seed.observations.at(-1)));};
  await handleCboeApi(request('/api/cboe/refresh?date=2026-11-23','POST'),{},null,almost);
  result=await (await handleCboeApi(request('/api/cboe/history?range=126'),{},null,almost)).json();
  assert.equal(result.actualEnd,'2026-11-23');assert.equal(calls,1);
  console.log('PASS Cboe history: 331 official sessions, pooled 20/60 parity, gaps/nulls, calendar, read-only GET, 15-day refresh, cache permission fallback, and legacy snapshot compatibility');
}finally{globalThis.fetch=originalFetch;globalThis.caches=originalCaches;t.clearMemory();}
