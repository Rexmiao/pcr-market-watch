// Offline regression checks: no live market-data requests and no file mutations.
import assert from "node:assert/strict";
import fs from "node:fs";
import {handleApi, backendTesting as t} from "../worker/backend.js";

const symbols=["NVDA","MU","SPY","QQQ","DIA","AVGO","AMD"];
const shift=(day,n)=>{const d=new Date(day+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const dates=[];
for(let day="2026-11-20";dates.length<500;day=shift(day,-1))if(t.isSession(day))dates.unshift(day);
const seed={asof:"2026-11-20",queryDate:"2026-11-23",instruments:{}};
for(const [s,symbol] of symbols.entries())seed.instruments[symbol]={label:symbol,rows:dates.map((date,i)=>({date,p:1000+(i*19+s*37)%3000,c:1500+(i*23+s*41)%2100})),oi:{p:100,c:200,ratio:0.5,dateLabel:"2026-11-23查询的旧OI快照"}};
const raw=t.rawFromSeed(seed);

for(const [clock,want] of [
  ["2026-11-23T15:00:00Z","2026-11-20"], // Monday before regular close
  ["2026-11-23T21:00:00Z","2026-11-23"],
  ["2026-11-22T21:00:00Z","2026-11-20"], // Weekend
  ["2026-11-26T22:00:00Z","2026-11-25"], // Thanksgiving
  ["2026-11-27T17:59:00Z","2026-11-25"], // Before 13:00 ET early close
  ["2026-11-27T18:00:00Z","2026-11-27"],
  ["2026-04-03T21:00:00Z","2026-04-02"], // Good Friday
  ["2026-03-09T19:59:00Z","2026-03-06"], // Daylight saving time
  ["2026-03-09T20:00:00Z","2026-03-09"],
])assert.equal(t.completedSession(new Date(clock)),want,clock);
assert.equal(t.isSession("2021-12-31"),true,"NYSE does not observe Saturday New Year on prior Friday");
assert.equal(t.isSession("2025-01-09"),false,"Announced exceptional closure");

function checkCalculations(candidateSeed) {
  const source=t.rawFromSeed(candidateSeed),view=t.makeView(source,candidateSeed);
  for(const symbol of symbols) {
    const input=source.data[symbol],prior=[];
    for(let i=0;i<input.length;i++) {
      const actual=view.instruments[symbol].rows[i];
      assert.equal(actual.daily,input[i].put_sides/input[i].call_sides);
      for(const n of [20,60]) {
        const win=i>=n-1?input.slice(i-n+1,i+1):[];
        const expected=win.length?win.reduce((s,r)=>s+r.put_sides,0)/win.reduce((s,r)=>s+r.call_sides,0):null;
        assert.equal(actual[`r${n}`],expected,`${symbol}/${i}/PCR${n}`);
      }
      const hist=prior.slice(-252);
      const rank=actual.r20!==null&&hist.length===252?(hist.filter(x=>x<actual.r20).length+.5*hist.filter(x=>x===actual.r20).length)/252:null;
      assert.equal(actual.rank,rank,`${symbol}/${i}/rank`);
      if(actual.r20!==null)prior.push(actual.r20);
    }
    assert.equal(view.instruments[symbol].oi.refreshed,false);
  }
}
checkCalculations(seed);

// Optional comparison with the original research artifact, when present locally.
const artifact=new URL("../../output/us-market-pcr/watchlist-chart-data.json",import.meta.url);
if(fs.existsSync(artifact)) {
  const original=JSON.parse(fs.readFileSync(artifact,"utf8")),view=t.makeView(t.rawFromSeed(original),original);
  for(const symbol of symbols)for(let i=0;i<view.instruments[symbol].rows.length;i++)for(const field of ["r20","r60","rank"])assert.equal(view.instruments[symbol].rows[i][field],original.instruments[symbol].rows[i][field]);
  console.log("PASS original artifact PCR20/PCR60/rank parity");
}

function csvFor(symbol,extra=[]) {
  const rows=raw.data[symbol].filter(r=>r.date.startsWith("2026-11-"));
  for(const date of extra)rows.push({date,put_sides:100,call_sides:200});
  return "quantity,underlying,symbol,actype,porc,exchange,actdate\n"+rows.flatMap(r=>{
    const stamp=`${r.date.slice(5,7)}/${r.date.slice(8)}/${r.date.slice(0,4)}`;
    return [`${r.put_sides},${symbol},${symbol},C,P,TEST,${stamp},`,`${r.call_sides},${symbol},${symbol},C,C,TEST,${stamp},`];
  }).join("\n")+"\n";
}
assert.throws(()=>t.parseMonth("<html>unavailable</html>","NVDA","202611","2026-11-20"));
assert.ok(t.parseMonth(csvFor("NVDA"),"NVDA","202611","2026-11-20").length>0);
assert.equal(t.jobsFor(raw,new Date("2026-11-23T21:00:00Z")).length,7);
assert.equal(t.jobsFor(raw,new Date("2026-12-01T15:00:00Z")).length,14,"Refresh both sides of month boundary");
let calls=0;
const fakeFetch=async url=>{calls++;const p=new URL(url).searchParams;return new Response(csvFor(p.get("symbol"),["2026-11-23"]));};
const beforeRaw=JSON.stringify(raw);
const updated=await t.refreshRaw(raw,new Date("2026-11-23T21:00:00Z"),fakeFetch);
assert.equal(updated.status,"updated");assert.equal(updated.raw.through,"2026-11-23");assert.equal(calls,7);assert.equal(JSON.stringify(raw),beforeRaw);
await assert.rejects(t.refreshRaw(raw,new Date("2026-11-23T21:00:00Z"),async()=>new Response("offline",{status:503})));
assert.equal(JSON.stringify(raw),beforeRaw,"Failed source must not mutate original data");
await assert.rejects(t.refreshRaw(raw,new Date("2026-11-23T21:00:00Z"),async()=>new Response("quantity,underlying,symbol,actype,porc,exchange,actdate\n")),/日期缺失/);

const cache=new Map(),NativeDate=globalThis.Date,nativeFetch=globalThis.fetch,nativeCaches=globalThis.caches;
let fixed="2026-11-23T15:00:00Z";
globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return new NativeDate(fixed).getTime();}};
globalThis.caches={default:{async match(key){const value=cache.get(key.url);return value?new Response(value):undefined;},async put(key,response){cache.set(key.url,await response.text());}}};
const get=()=>handleApi(new Request("https://test.example/api/watchlist"),{},null,seed);
const post=(origin="https://test.example")=>new Request("https://test.example/api/refresh",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:"{}"});
try {
  let response=await get(),data=await response.json();
  assert.equal(data.calendarDate,"2026-11-23");assert.equal(data.asof,"2026-11-20");
  fixed="2026-11-24T21:00:00Z";
  globalThis.fetch=async url=>new Response(csvFor(new URL(url).searchParams.get("symbol"),["2026-11-23","2026-11-24"]));
  response=await handleApi(post(),{},null,seed);assert.equal(response.status,200);data=(await response.json()).data;
  assert.equal(data.asof,"2026-11-24");assert.equal(data.calendarDate,"2026-11-24");assert.equal(data.queryDate,"2026-11-23");assert.equal(data.oiQueryDate,"2026-11-23");assert.equal(data.checkedAt,"2026-11-24T21:00:00.000Z");
  const saved=[...cache.values()][0];
  response=await handleApi(post(),{},null,seed);assert.equal(response.status,429);
  response=await handleApi(post("https://attacker.example"),{},null,seed);assert.equal(response.status,403);
  fixed="2026-11-25T21:00:00Z";globalThis.fetch=async()=>new Response("offline",{status:503});
  response=await handleApi(post(),{},null,seed);assert.equal(response.status,502);data=(await response.json()).data;
  assert.equal(data.asof,"2026-11-24");assert.equal(data.calendarDate,"2026-11-25");assert.equal(data.queryDate,"2026-11-23");assert.equal(data.oiQueryDate,"2026-11-23");assert.equal([...cache.values()][0],saved,"Failure must not overwrite complete cached snapshot");
  data=await(await get()).json();assert.equal(data.calendarDate,"2026-11-25");assert.equal(data.queryDate,"2026-11-23");assert.equal(data.checkedAt,"2026-11-24T21:00:00.000Z");
  const custom=t.makeView(raw,{...seed,oiQueryDate:"2026-11-22"});assert.equal(custom.queryDate,"2026-11-23");assert.equal(custom.oiQueryDate,"2026-11-22");
  function datedSeed(asof,checkedAt,refreshOnly=false) {
    const value=structuredClone(seed);value.asof=asof;
    if(checkedAt){value.refresh={status:"unchanged",checkedAt,message:"Checked seed"};if(!refreshOnly)value.checkedAt=checkedAt;}
    if(asof>seed.asof)for(const symbol of symbols)value.instruments[symbol].rows.push({date:asof,p:100,c:200});
    return value;
  }
  const freshnessCases=[
    {name:"Newer verified seed check supersedes stale same-date Cache",bundled:datedSeed("2026-11-20","2026-11-23T12:49:24.965Z"),cached:datedSeed("2026-11-20","2026-11-23T02:16:00.000Z"),wantDate:"2026-11-20",wantCheck:"2026-11-23T12:49:24.965Z"},
    {name:"Later cached activity date beats even a later-check-time old seed",bundled:datedSeed("2026-11-20","2026-11-25T22:00:00.000Z"),cached:datedSeed("2026-11-24","2026-11-24T21:00:00.000Z"),wantDate:"2026-11-24",wantCheck:"2026-11-24T21:00:00.000Z"},
    {name:"Later cached check wins when activity dates match",bundled:datedSeed("2026-11-20","2026-11-23T12:49:24.965Z"),cached:datedSeed("2026-11-20","2026-11-23T13:00:00.000Z"),wantDate:"2026-11-20",wantCheck:"2026-11-23T13:00:00.000Z"},
    {name:"Later seed activity date wins; refresh.checkedAt fallback is recognized",bundled:datedSeed("2026-11-24","2026-11-24T21:00:00.000Z",true),cached:datedSeed("2026-11-20","2026-11-25T20:00:00.000Z"),wantDate:"2026-11-24",wantCheck:"2026-11-24T21:00:00.000Z"},
  ];
  for(const test of freshnessCases) {
    t.clearMemory();cache.clear();
    const cachedRaw=t.rawFromSeed(test.cached),cacheUrl="https://freshness.example/__pcr_internal_cache__/complete-v1",cooldownUntil=Date.now()+60000;
    const envelope={version:1,raw:cachedRaw,data:t.makeView(cachedRaw,test.cached),lastAttempt:"2026-11-25T21:00:00.000Z",lastResult:"unchanged",nextAllowedAt:cooldownUntil};
    cache.set(cacheUrl,JSON.stringify(envelope));const previousCache=cache.get(cacheUrl);
    const request=()=>new Request("https://freshness.example/api/watchlist");
    data=await(await handleApi(request(),{},null,test.bundled)).json();
    assert.equal(data.asof,test.wantDate,test.name);assert.equal(data.checkedAt,test.wantCheck,test.name);
    assert.equal(data.queryDate,"2026-11-23");assert.equal(data.oiQueryDate,"2026-11-23");assert.equal(data.calendarDate,"2026-11-25");
    assert.equal(cache.get(cacheUrl),previousCache,"GET must not overwrite cache during deployment seed selection");
    data=await(await handleApi(request(),{},null,test.bundled)).json();assert.equal(data.checkedAt,test.wantCheck,"A stale cache must not override a newer memory snapshot");
    const status=await(await handleApi(new Request("https://freshness.example/api/status"),{},null,test.bundled)).json();assert.equal(status.retryAfterSeconds,60,"Keep existing refresh cooldown when selecting newer seed");
  }
  console.log("PASS deployment seed/cache freshness ordering, later user-cache preservation, memory precedence, immutable OI dates and retained cooldown");
  for(const unavailable of [
    {name:"default cache getter denied",create:()=>({get default(){throw Error("Default cache is not permitted");}})},
    {name:"default cache put denied",create:()=>({default:{async match(){return undefined;},async put(){throw Error("Default cache write is not permitted");}}})},
  ]) {
    t.clearMemory();fixed="2026-11-24T21:00:00Z";globalThis.caches=unavailable.create();
    globalThis.fetch=async url=>new Response(csvFor(new URL(url).searchParams.get("symbol"),["2026-11-23","2026-11-24"]));
    response=await handleApi(post(),{},null,seed);assert.equal(response.status,200,unavailable.name);
    data=(await response.json()).data;assert.equal(data.asof,"2026-11-24",unavailable.name);
    data=await(await get()).json();assert.equal(data.asof,"2026-11-24","GET retains validated data in memory despite denied cache");
    assert.equal(data.checkedAt,"2026-11-24T21:00:00.000Z");
    fixed="2026-11-25T21:00:00Z";globalThis.fetch=async()=>new Response("offline",{status:503});
    response=await handleApi(post(),{},null,seed);assert.equal(response.status,502,"Source errors must still fail when cache is unavailable");
    data=(await response.json()).data;assert.equal(data.asof,"2026-11-24","Source failure retains the prior validated memory snapshot");
    assert.equal((await(await get()).json()).asof,"2026-11-24");
  }
  console.log("PASS denied default-cache getter/write falls back to memory; validated refresh succeeds and source failures retain prior data");
  console.log("PASS date limits, NY holidays/DST/early close, immutable OI dates, seven-symbol PCR parity, dynamic/month-boundary refresh, source failure preservation, cache rollback, same-origin protection and cooldown");
} finally {
  globalThis.Date=NativeDate;globalThis.fetch=nativeFetch;
  if(nativeCaches===undefined)delete globalThis.caches;else globalThis.caches=nativeCaches;
  t.clearMemory();
}
