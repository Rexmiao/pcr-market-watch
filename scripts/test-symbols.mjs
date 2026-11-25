// Dynamic-symbol regression checks. All OCC responses are deterministic fixtures.
import assert from 'node:assert/strict';
import {handleApi,backendTesting as t} from '../worker/backend.js';

const shift=(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const dates=[];
for(let day='2025-08-01';day<='2026-11-23';day=shift(day,1))if(t.isSession(day))dates.push(day);
const core=['NVDA','MU','SPY','QQQ','DIA','AVGO','AMD'];
const seed={asof:'2026-11-20',queryDate:'2026-11-23',instruments:Object.fromEntries(core.map(symbol=>[symbol,{label:symbol,rows:dates.filter(date=>date<='2026-11-20').map((date,i)=>({date,p:100+i,c:200+i}))}]))};
const header='quantity,underlying,symbol,actype,porc,exchange,actdate\n';
function fixtureRows(from='2025-08-01',through='2026-11-23') {
  const rows=[];
  for(let day=from;day<=through;day=shift(day,1))if(t.isSession(day)){
    const n=Math.trunc(Date.parse(day)/86400000);
    rows.push({date:day,p:120+n%83,c:200+n%97});
  }
  return rows;
}
function fixtureCsv(symbol,month,{from='2025-08-01',through='2026-11-23',empty=false}={}) {
  const rows=empty?[]:fixtureRows(from,through).filter(r=>r.date.replaceAll('-','').startsWith(month));
  return header+rows.flatMap(r=>{
    const stamp=`${r.date.slice(5,7)}/${r.date.slice(8)}/${r.date.slice(0,4)}`;
    // Distinct roots/account types must all be summed; these are not duplicate trades.
    return [`${r.p-20},${symbol},${symbol},C,P,TEST,${stamp},`,`20,${symbol},1${symbol},M,P,TEST,${stamp},`,`${r.c-30},${symbol},${symbol},C,C,TEST,${stamp},`,`30,${symbol},1${symbol},F,C,TEST,${stamp},`];
  }).join('\n')+'\n';
}
for(const [source,clock,want] of [
  ['2026-11-23','2026-11-24T00:22:00Z','current'],
  ['2026-11-23','2026-11-24T14:29:00Z','current'],
  ['2026-11-23','2026-11-24T15:00:00Z','market_open'],
  ['2026-11-23','2026-11-25T00:22:09Z','pending_source'],
  ['2026-11-25','2026-11-27T17:59:00Z','market_open'],
  ['2026-11-25','2026-11-27T18:00:00Z','pending_source'],
  ['2026-11-27','2026-11-28T18:00:00Z','current'],
])assert.equal(t.freshness(source,new Date(clock)).status,want,clock);
const parsed=t.parseMonth(fixtureCsv('SNDK','202611'),'SNDK','202611','2026-11-23');
const expectedNovember=fixtureRows().filter(r=>r.date.startsWith('2026-11'));
assert.deepEqual(parsed,expectedNovember.map(r=>({date:r.date,put_sides:r.p,call_sides:r.c})));

const boundary=t.makeInstrument('SNDK',dates.slice(0,272).map((date,i)=>({date,put_sides:100+i,call_sides:200+i})));
assert.equal(boundary.rows[270].rank,null,'Percentile needs 252 earlier valid rolling values, not the current observation');
assert.notEqual(boundary.rows[271].rank,null);
const zero=t.makeInstrument('ZERO',dates.slice(0,61).map((date,i)=>({date,put_sides:10,call_sides:i<20?0:20})));
assert.equal(zero.rows[0].daily,null);assert.equal(zero.rows[19].r20,null);assert.equal(zero.rows[20].r20,200/20);
assert.equal(zero.rows[59].r60,600/800);assert.equal(zero.rows[60].rank,null);assert.equal(zero.oi,null);

const NativeDate=globalThis.Date,nativeFetch=globalThis.fetch,nativeCaches=globalThis.caches;
const cache=new Map();let fixed='2026-11-25T00:22:09Z',requests=0,options={};
globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return new NativeDate(fixed).getTime();}};
globalThis.caches={default:{async match(key){const body=cache.get(key.url);return body?new Response(body):undefined;},async put(key,response){cache.set(key.url,await response.text());}}};
const get=(path,origin)=>handleApi(new Request('https://symbols.example'+path,{headers:origin?{Origin:origin}:{}}),{},null,seed);
const symbol=(name,refresh=false)=>get(`/api/symbol?symbol=${encodeURIComponent(name)}${refresh?'&refresh=1':''}`);
const reset=()=>{t.clearMemory();cache.clear();requests=0;options={};};
const fetchFixture=async url=>{
  requests++;const target=new URL(url),q=target.searchParams;
  assert.equal(target.origin,'https://marketdata.theocc.com');assert.equal(q.get('symbolType'),'U');assert.equal(q.get('volumeQueryType'),'O');
  return new Response(fixtureCsv(q.get('symbol'),q.get('reportDate').slice(0,6),options));
};
try {
  globalThis.fetch=fetchFixture;
  for(const bad of ['1ABC','A/B','../AMD','A-B','ABCDEFGHIJK','A%00'])assert.equal((await symbol(bad)).status,400,bad);
  assert.equal((await get('/api/symbol?symbol=SNDK&symbol=AMD')).status,400);
  assert.equal((await get('/api/symbol?symbol=SNDK&refresh=yes')).status,400);
  assert.equal((await get('/api/search?q=SNDK','https://other.example')).status,403);
  let body=await(await get('/api/search?q=Sandisk')).json();assert.equal(body.results[0].symbol,'SNDK');assert.equal(body.scope,'seed_and_small_catalog');
  body=await(await get('/api/search?q=QQQQQQ')).json();assert.equal(body.results.length,1);assert.equal(body.results[0].kind,'direct');assert.equal(body.results[0].canQuery,true);
  assert.equal((await get('/api/search?q='+('a'.repeat(65)))).status,400);
  assert.equal(requests,0,'Validation and local catalog searches do not request OCC');

  let response=await symbol('sndk');assert.equal(response.status,200);body=await response.json();
  assert.equal(body.symbol,'SNDK');assert.equal(requests,16);assert.equal(body.asof,'2026-11-23');assert.equal(body.freshness.status,'pending_source');
  assert.equal(body.freshness.completedSession,'2026-11-24');assert.equal(body.instrument.oi,null);assert.equal(body.coverage.sessionCount,dates.length);
  assert.equal(body.coverage.historyMonths,16);assert.equal(body.coverage.rolling60Available,true);assert.equal(body.coverage.rankAvailable,true);
  assert.deepEqual(body.instrument.rows.map(({date,p,c})=>({date,p,c})),fixtureRows());
  for(let i=0;i<body.instrument.rows.length;i++)for(const n of [20,60]) {
    const rows=body.instrument.rows.slice(Math.max(0,i-n+1),i+1);
    assert.equal(body.instrument.rows[i][`r${n}`],rows.length===n?rows.reduce((s,r)=>s+r.p,0)/rows.reduce((s,r)=>s+r.c,0):null);
  }
  const good=body,stored=cache.get('https://symbols.example/__pcr_internal_cache__/symbol-v1/SNDK');
  assert.equal((await symbol('SNDK')).status,200);assert.equal(requests,16,'Repeated loads use independent good cache');
  assert.equal((await symbol('SNDK',true)).status,429,'Explicit refresh respects cooldown');
  t.clearMemory();assert.equal((await symbol('SNDK')).status,200);assert.equal(requests,16,'Cache survives an isolate-memory reset');
  fixed='2026-11-25T00:23:00Z';options={through:'2026-11-24'};
  body=await(await symbol('SNDK',true)).json();assert.equal(requests,17,'Warm refresh fetches only affected month');assert.equal(body.asof,'2026-11-24');assert.equal(body.freshness.status,'current');
  assert.equal(body.instrument.rows.length,good.instrument.rows.length+1);
  const updatedStored=cache.get('https://symbols.example/__pcr_internal_cache__/symbol-v1/SNDK');
  fixed='2026-11-25T00:24:00Z';globalThis.fetch=async()=>{requests++;return new Response('offline',{status:503});};
  response=await symbol('SNDK',true);assert.equal(response.status,502);body=await response.json();assert.equal(body.code,'OCC_SOURCE_ERROR');assert.equal(body.data.asof,'2026-11-24');assert.ok(body.error);assert.ok(body.data.freshness);
  assert.equal(cache.get('https://symbols.example/__pcr_internal_cache__/symbol-v1/SNDK'),updatedStored,'Failure cannot overwrite good symbol cache');
  const coreView=await(await get('/api/watchlist')).json();assert.equal(coreView.asof,'2026-11-20');assert.deepEqual(Object.keys(coreView.instruments),core);assert.equal(coreView.freshness.status,'pending_source');
  assert.equal((await(await symbol('NVDA')).json()).instrument.oi,null);
  assert.ok(stored,'Independent symbol snapshot is persisted under its own key');

  reset();fixed='2026-11-25T00:25:00Z';globalThis.fetch=fetchFixture;options={from:'2026-11-19'};
  body=await(await symbol('RECENT')).json();assert.equal(body.coverage.sessionCount,3);assert.equal(body.instrument.rows.length,3);assert.equal(body.instrument.rows.at(-1).r60,null);assert.equal(body.instrument.rows.at(-1).rank,null);assert.equal(body.instrument.oi,null);
  reset();options={empty:true};response=await symbol('NOHISTORY');assert.equal(response.status,404);body=await response.json();assert.equal(body.code,'NO_OCC_DATA');assert.equal(requests,16);assert.equal((await symbol('NOHISTORY')).status,429);assert.equal(requests,16,'Repeated empty lookups are cooled down');

  reset();let release;const gate=new Promise(resolve=>{release=resolve;});
  globalThis.fetch=async url=>{await gate;return fetchFixture(url);};
  const first=symbol('SNDK'),duplicate=symbol('SNDK');await new Promise(resolve=>setImmediate(resolve));release();
  const replies=await Promise.all([first,duplicate]);assert.ok(replies.every(r=>r.status===200));assert.equal(requests,16,'Concurrent duplicate loads share a single sixteen-month fetch');
  reset();let unlock;const blocking=new Promise(resolve=>{unlock=resolve;});globalThis.fetch=async url=>{await blocking;return fetchFixture(url);};
  const a=symbol('AAAA'),b=symbol('BBBB');await new Promise(resolve=>setImmediate(resolve));
  response=await symbol('CCCC');assert.equal(response.status,429);assert.equal((await response.json()).code,'SYMBOL_RATE_LIMIT');unlock();assert.ok((await Promise.all([a,b])).every(r=>r.status===200));assert.equal(requests,32);
  console.log('PASS symbol validation/search, independent history and coverage, pooled PCR/zero denominators/rank boundary, pending-source states, warm refresh, good-cache preservation, cooldown, duplicate-load coalescing and concurrent-load limits');
}finally{
  globalThis.Date=NativeDate;globalThis.fetch=nativeFetch;if(nativeCaches===undefined)delete globalThis.caches;else globalThis.caches=nativeCaches;t.clearMemory();
}
