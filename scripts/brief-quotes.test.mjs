import assert from 'node:assert/strict';
import {createBriefQuotesHandler} from './brief-quotes.mjs';

const checkedAt='2026-11-25T22:00:00.000Z',marketTime=1795630800123,privateText='synthetic-private-data-never-returned';
let ticks=1000,cloudConfigured=true,cloudCalls=0,desktopCalls=0,cloudFailure=null;
const cloudRow=symbol=>({code:'US.'+symbol,last_price:170.5,data_time:marketTime,data_date:'2026-11-25',prev_close_price:169,open_price:170,high_price:172,low_price:167,volume:400,account_id:privateText,after_market:{price:171,update_timestamp:marketTime},overnight:{price:0},extra:privateText});
const cloud={status:()=>({configured:cloudConfigured,connectionStatus:'connected',secret:privateText}),stockQuotes:async symbols=>{cloudCalls++;if(cloudFailure)throw cloudFailure;return {provider:'moomoo_webapi',checkedAt,data:{quote_list:symbols.map(cloudRow)},raw:privateText};}};
const desktop={status:()=>({configured:true,cliAvailable:true,connectionStatus:'not_checked'}),quotes:async symbols=>{desktopCalls++;return {provider:'moomoo',checkedAt,data:{basic_qot_list:symbols.map(symbol=>({security:{code:symbol,market:11,account:privateText},cur_price:168,update_timestamp:marketTime/1000,update_time:'2026-11-25 16:00:00',after_market:{price:169,update_time:'2026-11-25 17:00:00'},raw:privateText}))}};}};
const handler=createBriefQuotesHandler({webApiClient:cloud,desktopClient:desktop,now:()=>ticks});
const req=(path='/api/brief-quotes?symbols=NVDA',options={})=>new Request('http://127.0.0.1:8765'+path,options);
const read=async(request=req(),target=handler)=>{const response=await target(request);return {response,body:await response.json()};};
let result=await read(req('/api/brief-quotes/status'));
assert.deepEqual(result.body,{provider:'moomoo_webapi',configured:true,connectionStatus:'connected',readOnly:true});assert.equal(cloudCalls,0);assert.equal(desktopCalls,0);
result=await read(req('/api/brief-quotes?symbols=NVDA,AMD'));
assert.equal(result.body.provider,'moomoo_webapi');assert.equal(result.body.status,'current');assert.equal(result.body.checkedAt,checkedAt);assert.equal(cloudCalls,1);assert.equal(desktopCalls,0);
const nvda=result.body.data.basic_qot_list.find(row=>row.security.code==='NVDA');
assert.deepEqual(nvda.security,{code:'NVDA',market:11});assert.equal(nvda.cur_price,170.5);assert.equal(nvda.update_timestamp,marketTime/1000);
assert.deepEqual(nvda.after_market,{price:171});assert.deepEqual(nvda.overnight,{price:null});assert.equal(nvda.last_close_price,169);assert(!JSON.stringify(result.body).includes(privateText));
result=await read(req('/api/brief-quotes?symbols=AMD,NVDA'));assert.equal(result.body.cached,true);assert.equal(cloudCalls,1,'Sorted batch cache is shared');
ticks+=15000;await read(req('/api/brief-quotes?symbols=AMD,NVDA'));assert.equal(cloudCalls,2,'Cache expires at 15 seconds');

cloudConfigured=false;result=await read(req('/api/brief-quotes/status'));assert.equal(result.body.provider,'moomoo_desktop');
result=await read(req('/api/brief-quotes?symbols=AMD,NVDA'));assert.equal(result.body.provider,'moomoo_desktop');assert.equal(desktopCalls,1,'Cloud and desktop caches cannot mix');
assert.equal(result.body.data.basic_qot_list[0].after_market.update_time,'2026-11-25 17:00:00');assert(!JSON.stringify(result.body).includes(privateText));
cloudConfigured=true;cloudFailure={code:'TIMEOUT',message:privateText};result=await read(req('/api/brief-quotes?symbols=MU'));assert.equal(result.response.status,504);assert.equal(result.body.code,'TIMEOUT');assert.equal(result.body.provider,'moomoo_webapi');assert.equal(desktopCalls,1,'Configured cloud failure never falls back to desktop');assert(!JSON.stringify(result.body).includes(privateText));
cloudFailure=Error(privateText);result=await read(req('/api/brief-quotes?symbols=MU'));assert.equal(result.body.code,'PROVIDER_UNAVAILABLE');assert(!JSON.stringify(result.body).includes(privateText));cloudFailure=null;

const before=cloudCalls;
for(const path of ['/api/brief-quotes','/api/brief-quotes?symbols=','/api/brief-quotes?symbols=NVDA,NVDA','/api/brief-quotes?symbols=US.NVDA','/api/brief-quotes?symbols=HK.00700','/api/brief-quotes?symbols=nvda','/api/brief-quotes?symbols=NVDA%20','/api/brief-quotes?symbols=NVDA&symbols=AMD','/api/brief-quotes?symbols=NVDA&token=no','/api/brief-quotes?symbols='+Array.from({length:21},(_,i)=>'A'+i).join(','),'/api/brief-quotes/status?symbols=NVDA'])assert.equal((await read(req(path))).response.status,400,path);
for(const method of ['POST','PUT','DELETE','HEAD'])assert.equal((await handler(req('/api/brief-quotes?symbols=NVDA',{method}))).status,405);
for(const headers of [{origin:'https://evil.test'},{host:'evil.test:8765'},{host:'127.0.0.1:8766'},{host:'127.0.0.1:99999'},{host:'localhost:8765',origin:'http://127.0.0.1:8765'},{'sec-fetch-site':'cross-site'}])assert.equal((await read(req(undefined,{headers}))).response.status,403);
assert.equal((await handler(new Request('http://evil.test:8765/api/brief-quotes?symbols=NVDA'))).status,403);
assert.equal((await handler(new Request('https://127.0.0.1:8765/api/brief-quotes?symbols=NVDA'))).status,403);
assert.equal(cloudCalls,before,'Invalid requests never reach a provider');
assert.equal((await read(req('/api/brief-quotes?symbols=NVDA',{headers:{host:'localhost:8765',origin:'http://localhost:8765'}}))).response.status,200,'Preview loopback alias uses actual Host for strict Origin checking');
assert.equal(await handler(req('/api/unrelated')),null);

const partialHandler=createBriefQuotesHandler({webApiClient:{status:()=>({configured:true}),stockQuotes:async()=>({provider:'moomoo_webapi',checkedAt,data:{quote_list:[{code:'US.NVDA',last_price:170}]}})}});
result=await read(req('/api/brief-quotes?symbols=AMD,NVDA'),partialHandler);assert.equal(result.body.status,'partial');assert.equal(result.body.data.basic_qot_list.length,1);assert.equal(result.body.data.basic_qot_list[0].update_timestamp,null,'Missing market time must not become checkedAt');
const emptyHandler=createBriefQuotesHandler({webApiClient:{status:()=>({configured:true}),stockQuotes:async()=>({provider:'moomoo_webapi',checkedAt,data:{quote_list:[]}})}});assert.equal((await read(req(),emptyHandler)).body.status,'partial');
for(const payload of [{provider:'moomoo',checkedAt,data:{quote_list:[]}},{provider:'moomoo_webapi',checkedAt,data:{quote_list:[{code:'HK.NVDA'}]}},{provider:'moomoo_webapi',checkedAt,data:{quote_list:[{code:7}]}},{provider:'moomoo_webapi',checkedAt:privateText,data:{quote_list:[]}}]){
  const bad=createBriefQuotesHandler({webApiClient:{status:()=>({configured:true}),stockQuotes:async()=>payload}});assert.equal((await read(req(),bad)).body.code,'INVALID_RESPONSE');
}
const absent=createBriefQuotesHandler();assert.equal((await read(req('/api/brief-quotes/status'),absent)).body.configured,false);assert.equal((await read(req(),absent)).response.status,503);

let release,concurrentCalls=0;const gate=new Promise(resolve=>{release=resolve;});
const concurrent=createBriefQuotesHandler({webApiClient:{status:()=>({configured:true}),stockQuotes:async symbols=>{concurrentCalls++;await gate;return {provider:'moomoo_webapi',checkedAt,data:{quote_list:symbols.map(cloudRow)}};}}});
const pending=Array.from({length:20},(_,index)=>read(req('/api/brief-quotes?symbols=A'+index),concurrent));
const duplicate=read(req('/api/brief-quotes?symbols=A0'),concurrent);
assert.equal((await read(req('/api/brief-quotes?symbols=ZZZ'),concurrent)).response.status,429);assert.equal(concurrentCalls,20);
release();assert((await Promise.all(pending)).every(value=>value.response.status===200));assert.equal((await duplicate).response.status,200);assert.equal(concurrentCalls,20,'Concurrent identical queries are coalesced');
console.log('PASS brief quotes: cloud priority, no fallback on failure, source-isolated 15s cache, bounded coalescing, strict local methods/Host/Origin/symbol validation, safe quote allowlist, partial coverage and independent session-time honesty');
