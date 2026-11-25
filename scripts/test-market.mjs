import assert from 'node:assert/strict';
import {marketTesting as t} from '../worker/market.js';

const definitions=[{id:'sp500',symbol:'^GSPC',name:'S&P 500'},{id:'nasdaq',symbol:'^IXIC',name:'Nasdaq Composite'},{id:'dow',symbol:'^DJI',name:'Dow Jones Industrial Average'},{id:'oil',symbol:'CL=F',name:'WTI Crude Oil'},{id:'gold',symbol:'GC=F',name:'Gold'}];
const sourceTimes=[Date.parse('2026-11-23T21:00:00Z'),Date.parse('2026-11-23T20:59:00Z'),Date.parse('2026-11-23T20:58:00Z'),Date.parse('2026-11-24T01:30:00Z'),Date.parse('2026-11-24T02:00:00Z')];
const payload=(definition,index=0)=>({chart:{error:null,result:[{meta:{symbol:definition.symbol,regularMarketPrice:110+index,previousClose:100,chartPreviousClose:50,regularMarketTime:sourceTimes[index]/1000,shortName:definition.id==='oil'?'Crude Oil Jan27':definition.id==='gold'?'Gold Dec26':definition.name,currency:'USD',instrumentType:index>2?'FUTURE':'INDEX',exchangeTimezoneName:'America/New_York'}}]}});
const request=(path='/api/market',method='GET',headers={})=>new Request('https://market-test.example'+path,{method,headers});
const read=async(handler,...args)=>{const response=await handler(request(...args));return {status:response.status,body:await response.json()};};
let clock=Date.parse('2026-11-25T02:00:00Z'),calls=[],failed=new Set();
const handler=t.createMarketHandler({now:()=>clock,fetcher:async(url,options)=>{
  calls.push(url);assert.equal(options.redirect,'manual');assert.equal(options.headers['user-agent'],'Mozilla/5.0');
  const parsed=new URL(url),symbol=decodeURIComponent(parsed.pathname.split('/').at(-1));
  assert.equal(parsed.hostname,'query1.finance.yahoo.com');assert.equal(parsed.search,'?interval=1m&range=1d');
  const index=definitions.findIndex(value=>value.symbol===symbol);assert.notEqual(index,-1,'Only five fixed symbols can reach the source');
  if(failed.has(symbol))throw Error('fixture source unavailable');
  return new Response(JSON.stringify(payload(definitions[index],index)));
}});

let result=await read(handler);
assert.equal(result.status,200);assert.equal(result.body.status,'current');assert.equal(calls.length,5);
assert.deepEqual(result.body.quotes.map(quote=>quote.symbol),definitions.map(value=>value.symbol));
for(const [index,quote] of result.body.quotes.entries()){
  assert.equal(quote.price,110+index);assert.equal(quote.previousClose,100);assert.equal(quote.previousCloseField,'previousClose');
  assert.equal(quote.change,10+index);assert.equal(quote.changePercent,(10+index)/100*100);
  assert.equal(quote.marketTime,new Date(sourceTimes[index]).toISOString());
  assert.equal(quote.sourceSessionDate,'2026-11-23','Use the source timestamp and timezone, not the check date');
  assert.equal(quote.checkedAt,new Date(clock).toISOString());assert.equal(quote.stale,false);
}
assert.equal(result.body.quotes[3].contractName,'Crude Oil Jan27');assert.equal(result.body.quotes[4].contractName,'Gold Dec26');
assert.match(result.body.quotes[0].sourceUrl,/%5EGSPC$/);
assert.equal((await read(handler)).body.cached,true);assert.equal(calls.length,5);
assert.equal((await read(handler,'/api/market/refresh','POST')).body.refreshStatus,'cooldown');assert.equal(calls.length,5);
const oldOil=result.body.quotes[3];clock+=31000;failed.add('CL=F');
result=await read(handler,'/api/market/refresh','POST');
assert.equal(result.body.status,'partial');assert.equal(calls.length,10);
const staleOil=result.body.quotes.find(quote=>quote.id==='oil');
assert.equal(staleOil.price,oldOil.price);assert.equal(staleOil.marketTime,oldOil.marketTime);assert.equal(staleOil.checkedAt,oldOil.checkedAt);
assert.equal(staleOil.stale,true);assert.match(staleOil.error,/unavailable/);assert.equal(staleOil.lastAttemptAt,new Date(clock).toISOString());
clock+=31000;failed.clear();result=await read(handler,'/api/market/refresh','POST');
assert.equal(result.body.status,'current');assert.equal(result.body.quotes[3].stale,false);assert.equal(result.body.quotes[3].error,undefined);
clock+=60001;await read(handler);assert.equal(calls.length,20,'GET refreshes after its 60-second cache expires');

const fallback=payload(definitions[0]);delete fallback.chart.result[0].meta.previousClose;
assert.equal(t.parseMarketQuote(fallback,definitions[0],new Date(clock).toISOString()).changePercent,120);
assert.equal(t.parseMarketQuote(fallback,definitions[0],new Date(clock).toISOString()).previousCloseField,'chartPreviousClose');
for(const mutate of [meta=>meta.regularMarketPrice=null,meta=>meta.regularMarketPrice=NaN,meta=>{meta.previousClose=0;meta.chartPreviousClose=0;},meta=>meta.regularMarketTime=null,meta=>meta.regularMarketTime=Infinity,meta=>meta.symbol='OTHER']){
  const bad=payload(definitions[0]);mutate(bad.chart.result[0].meta);assert.throws(()=>t.parseMarketQuote(bad,definitions[0],new Date(clock).toISOString()));
}
const negative=payload(definitions[3],3);negative.chart.result[0].meta.regularMarketPrice=-5;
assert.equal(t.parseMarketQuote(negative,definitions[3],new Date(clock).toISOString()).change,-105,'Finite negative futures prices must not be fabricated into positive values');
assert.equal(t.marketSessionDate(Date.parse('2026-11-24T01:00:00Z'),'America/Chicago').sourceSessionDate,'2026-11-23');
assert.equal(t.marketSessionDate(sourceTimes[0],'invalid/timezone').exchangeTimezoneName,'America/New_York');

const unavailable=t.createMarketHandler({now:()=>clock,fetcher:async()=>new Response('',{status:302})});
result=await read(unavailable);assert.equal(result.status,200);assert.equal(result.body.status,'failed');
for(const quote of result.body.quotes){assert.equal(quote.price,null);assert.equal(quote.previousClose,null);assert.equal(quote.marketTime,null);assert.equal(quote.sourceSessionDate,null);assert.equal(quote.checkedAt,null);assert.equal(quote.stale,true);}
assert.equal((await read(handler,'/api/market','GET',{origin:'https://other.example'})).status,403);
assert.equal((await read(handler,'/api/market','POST')).status,405);
assert.equal((await read(handler,'/api/market/refresh','GET')).status,405);
assert.equal((await read(handler,'/api/market?symbol=TSLA')).status,400);
assert.equal((await read(handler,'/api/market?url=https://other.example/')).status,400);
assert.equal(await handler(request('/api/market/arbitrary')),null);

// Concurrent cold requests share exactly one five-request batch.
let release,concurrentCalls=0;
const gate=new Promise(resolve=>{release=resolve;});
const coalesced=t.createMarketHandler({now:()=>clock,fetcher:async url=>{concurrentCalls++;await gate;const symbol=decodeURIComponent(new URL(url).pathname.split('/').at(-1)),index=definitions.findIndex(value=>value.symbol===symbol);return new Response(JSON.stringify(payload(definitions[index],index)));}});
const one=read(coalesced),two=read(coalesced,'/api/market/refresh','POST');
await Promise.resolve();assert.equal(concurrentCalls,5);release();
const both=await Promise.all([one,two]);assert.equal(concurrentCalls,5);assert.equal(both[0].body.status,'current');assert.equal(both[1].body.coalesced,true);
console.log('PASS market snapshots: fixed routes/symbols, previous-close denominator, source dates/times, contract names, 60s cache, partial-failure retention, unavailable nulls, invalid data, origin, cooldown and coalesced refresh');
