import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createMoomooWebApiClient} from '../worker/moomoo-webapi.js';
import {createOptionStructureHandler,selectGammaExpiries,optionStructureDay} from '../worker/option-structure.js';
import {createPublicAccessHandler,publicStaticPath} from './public-access.mjs';
import {createCloudGateway,cloudConfig} from './cloud-gateway.mjs';

const time=Date.parse('2026-11-26T15:00:00Z'),sourceTime=Date.parse('2026-11-25T21:00:00Z');
const request=(path,body)=>new Request('https://unit-test.hf.space'+path,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const response=body=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
const gammaRaw=()=>({call_wall_strike:'650',put_wall_strike:'635',underlying_price:'649.37',update_time:sourceTime,zero_gamma_points:[648.35,680],items:[{strike_price:'650',call_gex:'200',put_gex:'-250',net_gex:'-50'}],profile_points:[{spot_price:'640',aggregate_gex:'-100'},{spot_price:'650',aggregate_gex:'50'}]});
function normalizedGamma(raw){return {...raw,call_wall_strike:Number(raw.call_wall_strike),put_wall_strike:Number(raw.put_wall_strike),underlying_price:Number(raw.underlying_price),items:raw.items.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,Number(v)]))),profile_points:raw.profile_points.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,Number(v)]))),zero_gamma_disclosed:true};}
const apiResult=(kind,data)=>({provider:'moomoo_webapi',kind,checkedAt:new Date(time).toISOString(),data});
function fixture({dates=['2026-11-25','2026-11-27','2026-11-30','2026-12-04','2026-12-24','2026-12-31'],gamma=gammaRaw}={}){
  let clock=time,fail=null;const calls=[];
  const client={status:()=>({configured:true}),expirations:async symbol=>{calls.push({kind:'expirations',symbol});if(fail==='expirations')throw {code:'NO_PERMISSION'};return apiResult('option_expirations',{expiration_list:dates.map(strike_time=>({strike_time}))});},gammaExposure:async(symbol,{expiries})=>{calls.push({kind:'gamma',symbol,expiries});if(fail==='gamma')throw {code:'NO_PERMISSION'};return apiResult('gamma_exposure',normalizedGamma(gamma()));},maxPain:async(symbol,{expiry})=>{calls.push({kind:'pain',symbol,expiry});if(fail==='pain')throw {code:'NO_DATA'};return apiResult('max_pain',{update_time:sourceTime,chains:[{strike_date:expiry,max_pain_strike:644,items:[{strike_price:640,call_pain:20,put_pain:30,total_pain:50}]}]});}};
  return {calls,client,handler:createOptionStructureHandler({webApiClient:client,now:()=>clock}),advance(ms){clock+=ms;},fail(value){fail=value;}};
}
const db={prepare(sql){return {bind(){return {first:async()=>sql.includes('user_watchlists')?{items_json:JSON.stringify([{symbol:'SNDK'}]),revision:2}:{items_json:JSON.stringify([{type:'symbol',symbol:'QQQ'}]),revision:1}};}};}};

test('expiration selection uses New York dates, real dates, inclusive DTE bounds and no expired contracts',()=>{
  const dates=['2026-12-04','2026-11-25','2026-11-26','2026-12-03','2026-12-26','2026-12-27'];
  assert.equal(optionStructureDay(Date.parse('2026-11-27T02:00:00Z')),'2026-11-26');
  assert.deepEqual(selectGammaExpiries(dates,'nearest','2026-11-26'),['2026-11-26']);
  assert.deepEqual(selectGammaExpiries(dates,'7d','2026-11-26'),['2026-11-26','2026-12-03']);
  assert.deepEqual(selectGammaExpiries(dates,'30d','2026-11-26'),['2026-11-26','2026-12-03','2026-12-04','2026-12-26']);
  assert.equal(selectGammaExpiries(dates,'all','2026-11-26').length,5);
  for(const bad of ['2026-02-30','2026-99-99','invalid'])assert.throws(()=>selectGammaExpiries([bad],'30d','2026-11-26'));
});

test('GET is cache-only; default thirty-day refresh preserves profiles, multiple roots, selected dates and independent times',async()=>{
  const f=fixture();let value=await(await f.handler(request('/api/gamma-exposure?symbol=QQQ'))).json();assert.equal(value.status,'unavailable');assert.equal(f.calls.length,0);
  value=await(await f.handler(request('/api/gamma-exposure/refresh',{symbol:'QQQ'}))).json();
  assert.deepEqual(value.selectedExpiries,['2026-11-27','2026-11-30','2026-12-04','2026-12-24']);
  assert.deepEqual(f.calls.filter(x=>x.kind==='gamma').map(x=>x.expiries),[value.selectedExpiries,value.selectedExpiries.slice(1)]);
  assert.equal(value.base.checkedAt,new Date(time).toISOString());assert.equal(value.base.providerUpdatedAt,new Date(sourceTime).toISOString());
  assert.deepEqual(value.base.zeroGammaPoints,[648.35,680]);assert.deepEqual(value.base.profile,[{spot:640,gex:-100},{spot:650,gex:50}]);assert.equal(value.base.items[0].netGex,-50);
  assert.equal(value.withoutNearest.excludedExpiry,'2026-11-27');assert.equal(value.base.underlyingPrice,649.37);assert.equal(value.units,'provider_gex_unspecified');
  const before=f.calls.length;await f.handler(request('/api/gamma-exposure?symbol=QQQ'));assert.equal(f.calls.length,before);
});

test('nearest-only comparison is unavailable and never sends an empty filter that means all expirations',async()=>{
  const f=fixture(),value=await(await f.handler(request('/api/gamma-exposure/refresh',{symbol:'QQQ',window:'nearest'}))).json();
  assert.equal(value.withoutNearest.status,'unavailable');assert.equal(value.withoutNearest.reason,'NO_REMAINING_EXPIRIES');assert.equal(f.calls.filter(x=>x.kind==='gamma').length,1);
});

test('all-expiration base uses vendor all; comparison above the exact filter limit stays unavailable',async()=>{
  const dates=Array.from({length:35},(_,i)=>new Date(time+i*86400000).toISOString().slice(0,10)),f=fixture({dates});
  const value=await(await f.handler(request('/api/gamma-exposure/refresh',{symbol:'QQQ',window:'all'}))).json();
  assert.equal(f.calls.filter(x=>x.kind==='gamma').length,1);assert.equal(f.calls.find(x=>x.kind==='gamma').expiries,null);
  assert.equal(value.withoutNearest.reason,'PROVIDER_FILTER_LIMIT');assert.equal(value.withoutNearest.profile.length,0);assert.equal(value.status,'partial');
});

test('empty expiration windows do not issue a gamma query or invent roots',async()=>{
  const f=fixture({dates:['2026-11-25','2027-01-15']}),value=await(await f.handler(request('/api/gamma-exposure/refresh',{symbol:'QQQ',window:'7d'}))).json();
  assert.equal(value.base.reason,'NO_EXPIRIES');assert.deepEqual(value.base.zeroGammaPoints,[]);assert.equal(f.calls.filter(x=>x.kind==='gamma').length,0);
});

test('Max Pain has its own expiry selection and independent refresh budget; GET cannot fetch it',async()=>{
  const f=fixture();await f.handler(request('/api/gamma-exposure/refresh',{symbol:'QQQ'}));
  let value=await(await f.handler(request('/api/max-pain?symbol=QQQ'))).json();assert.equal(value.checkedAt,null);
  value=await(await f.handler(request('/api/max-pain/refresh',{symbol:'QQQ'}))).json();assert.equal(value.expiry,'2026-11-27');assert.equal(value.maxPain,644);assert.equal(value.providerUpdatedAt,new Date(sourceTime).toISOString());assert.equal(value.underlyingPrice,null);assert.equal(value.items[0].totalPain,50);
  assert.equal((await f.handler(request('/api/max-pain/refresh',{symbol:'QQQ',expiry:'2026-11-30'}))).status,429);
  f.advance(60001);value=await(await f.handler(request('/api/max-pain/refresh',{symbol:'QQQ',expiry:'2026-11-30'}))).json();assert.equal(value.expiry,'2026-11-30');
  f.advance(60001);value=await(await f.handler(request('/api/max-pain/refresh',{symbol:'QQQ',expiry:'2026-11-25'}))).json();assert.equal(value.reason,'EXPIRY_NOT_AVAILABLE');assert.equal(value.maxPain,null);
});

test('failure retains verified data and original source times; cross-day reads retain old scope and mark stale',async()=>{
  const f=fixture(),first=await(await f.handler(request('/api/gamma-exposure/refresh',{symbol:'QQQ'}))).json();
  f.advance(60001);f.fail('gamma');let value=await(await f.handler(request('/api/gamma-exposure/refresh',{symbol:'QQQ'}))).json();
  assert.equal(value.base.status,'failed');assert.equal(value.base.stale,true);assert.equal(value.base.checkedAt,first.base.checkedAt);assert.equal(value.base.providerUpdatedAt,first.base.providerUpdatedAt);assert.deepEqual(value.base.profile,first.base.profile);
  f.advance(86400000);value=await(await f.handler(request('/api/gamma-exposure?symbol=QQQ'))).json();assert.equal(value.calendarDate,'2026-11-26');assert.equal(value.currentCalendarDate,'2026-11-27');assert.equal(value.stale,true);assert.equal(value.base.stale,true);
});

test('coalesced same-scope refreshes run once; different scope shares the operation budget',async()=>{
  const f=fixture();await Promise.all([f.handler(request('/api/gamma-exposure/refresh',{symbol:'QQQ'})),f.handler(request('/api/gamma-exposure/refresh',{symbol:'QQQ'}))]);assert.equal(f.calls.filter(x=>x.kind==='gamma').length,2);
  const result=await f.handler(request('/api/gamma-exposure/refresh',{symbol:'SPY',window:'7d'}));assert.equal(result.status,429);assert((await result.json()).retryAfterSeconds>0);
});

test('unknown, repeated, malformed and credential-bearing query fields cannot reach upstream',async()=>{
  const f=fixture();for(const path of ['/api/gamma-exposure?symbol=QQQ&window=bogus','/api/gamma-exposure?symbol=QQQ&symbol=SPY','/api/gamma-exposure?symbol=QQQ&token=secret','/api/max-pain?symbol=QQQ&expiry=2026-02-30'])assert.equal((await f.handler(request(path))).status,400);
  for(const body of [{symbol:'US.QQQ'},{symbol:'QQQ',url:'https://bad.example'},{symbol:'QQQ',window:null}])assert.equal((await f.handler(request('/api/gamma-exposure/refresh',body))).status,400);assert.equal(f.calls.length,0);
});

test('direct adapters allow only fixed quote endpoints and sanitize structures without credential/free-text leaks',async()=>{
  const calls=[],secret='synthetic-test-secret',client=createMoomooWebApiClient({accessToken:secret,fetcher:async(url,options)=>{calls.push({url,options});if(url.includes('option-expiration'))return response({ret_code:0,data:{expiration_list:[{strike_time:'2026-11-27',password:secret}]}});if(url.includes('option-max-pain'))return response({ret_code:0,data:{update_time:sourceTime,chains:[{strike_date:'2026-11-27',max_pain_strike:'644',items:[{strike_price:'640',call_pain:'0',put_pain:'2',total_pain:'2',account_id:secret}]}]}});return response({ret_code:0,ret_msg:secret,data:{...gammaRaw(),access_token:secret}});}});
  const expiration=await client.expirations('QQQ'),gamma=await client.gammaExposure('QQQ',{expiries:['2026-11-27']}),pain=await client.maxPain('QQQ',{expiry:'2026-11-27'});
  assert.equal(expiration.data.expiration_list[0].strike_time,'2026-11-27');assert.equal(gamma.data.items[0].net_gex,-50);assert.equal(pain.data.chains[0].items[0].call_pain,0);assert(!JSON.stringify([expiration,gamma,pain]).includes(secret));
  assert(calls.every(call=>new URL(call.url).origin==='https://webapi.moomoo.com'&&call.options.method==='GET'&&call.options.redirect==='manual'));
  assert.equal(new URL(calls[1].url).searchParams.get('expire_time'),'2026-11-27');
  assert.equal(new URL(calls[2].url).searchParams.get('only_max_pain'),'false');
  await assert.rejects(client.gammaExposure('QQQ',{expiries:[]}),error=>error.code==='INVALID_EXPIRY');await assert.rejects(client.maxPain('QQQ',{expiry:'2026-99-99'}),error=>error.code==='INVALID_EXPIRY');
  await assert.rejects(client.expirations('HK.00700'),error=>error.code==='INVALID_SYMBOL');assert.equal(calls.length,3);
});

test('provider missing values remain null; missing roots and profiles are not derived from bars',async()=>{
  const client=createMoomooWebApiClient({accessToken:'synthetic-test',fetcher:async()=>response({ret_code:0,data:{items:[{strike_price:'650',call_gex:'',put_gex:'-2'}],underlying_price:'649'}})});
  const result=await client.gammaExposure('QQQ',{expiries:['2026-11-27']});assert.equal(result.data.items[0].call_gex,null);assert.equal(result.data.items[0].net_gex,null);assert.deepEqual(result.data.profile_points,[]);assert.deepEqual(result.data.zero_gamma_points,[]);assert.equal(result.data.zero_gamma_disclosed,false);
});

test('provider permission and rate-limit return codes are safe and wrong expiration/duplicate prices reject',async()=>{
  for(const [ret_code,code]of [[-9,'NO_PERMISSION'],[-11,'RATE_LIMITED'],[-10,'NO_DATA'],[-8,'UNSUPPORTED_PROVIDER']])await assert.rejects(createMoomooWebApiClient({accessToken:'synthetic-test',fetcher:async()=>response({ret_code,data:{},ret_msg:'do-not-forward'})}).expirations('QQQ'),error=>error.code===code&&!error.message.includes('do-not-forward'));
  await assert.rejects(createMoomooWebApiClient({accessToken:'synthetic-test',fetcher:async()=>response({ret_code:0,data:{chains:[{strike_date:'2026-11-30'}]}})}).maxPain('QQQ',{expiry:'2026-11-27'}),error=>error.code==='INVALID_RESPONSE');
  await assert.rejects(createMoomooWebApiClient({accessToken:'synthetic-test',fetcher:async()=>response({ret_code:0,data:{...gammaRaw(),profile_points:[{spot_price:'650',aggregate_gex:'1'},{spot_price:'650',aggregate_gex:'2'}]}})}).gammaExposure('QQQ'),error=>error.code==='INVALID_RESPONSE');
});

test('public structure reads use only published symbols; POST signatures retain symbol/window and independent budgets',async()=>{
  let clock=time;const calls=[],handler=createPublicAccessHandler({database:db,now:()=>clock,proxy:async req=>{const body=req.method==='POST'?await req.json():null;calls.push({path:new URL(req.url).pathname,body});await new Promise(accept=>setTimeout(accept,5));return response({status:'current',base:{callWall:650},access_token:'synthetic-secret'});}});
  assert(publicStaticPath('/option-structure.html'));assert(!publicStaticPath('/market-brief.html'));
  for(const symbol of ['QQQ','SNDK'])assert.equal((await handler(request('/api/gamma-exposure?symbol='+symbol))).status,200);
  for(const symbol of ['SPY','DIA','NVDA','MSFT'])assert.equal((await handler(request('/api/gamma-exposure?symbol='+symbol))).status,403);
  for(const path of ['/api/gamma-exposure?symbol=QQQ&window=bad','/api/max-pain?symbol=QQQ&expiry=2026-02-30','/api/gamma-exposure?symbol=QQQ&symbol=SPY'])assert.equal((await handler(request(path))).status,400);
  const before=calls.length;await Promise.all([handler(request('/api/gamma-exposure/refresh',{symbol:'QQQ',window:'30d'})),handler(request('/api/gamma-exposure/refresh',{symbol:'QQQ',window:'30d'})),handler(request('/api/max-pain/refresh',{symbol:'QQQ'}))]);assert.equal(calls.length,before+2);
  assert.equal((await handler(request('/api/gamma-exposure/refresh',{symbol:'SNDK',window:'7d'}))).status,429);
  assert.equal((await handler(request('/api/gamma-exposure/refresh',{symbol:'MSFT'}))).status,403);
  assert.equal((await handler(request('/api/max-pain/refresh',{symbol:'QQQ',account:'forbidden'}))).status,400);
  clock+=60001;const value=await(await handler(request('/api/gamma-exposure/refresh',{symbol:'SNDK',window:'7d'}))).json();assert(!JSON.stringify(value).includes('synthetic-secret'));
  assert.equal(await handler(request('/api/option-structure/private')),null);
});

test('public cloud gateway accepts bounded structure refresh JSON while stripping credentials and denying private routes',async()=>{
  let received;const backend=http.createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);received={body:Buffer.concat(chunks).toString(),headers:req.headers};res.setHeader('content-type','application/json');res.end('{"status":"current"}');});await new Promise(accept=>backend.listen(0,'127.0.0.1',accept));
  const config={...cloudConfig({PCR_CLOUD_PASSWORD:'synthetic-owner-password',PCR_CLOUD_PUBLIC_ORIGIN:'https://unit-test.hf.space'}),internalOrigin:'http://127.0.0.1:'+backend.address().port,internalPort:backend.address().port},gateway=createCloudGateway(config,{database:db,publicAccess:true,onSecurityEvent:()=>{}});await new Promise(accept=>gateway.listen(0,'127.0.0.1',accept));const origin='http://127.0.0.1:'+gateway.address().port;
  try{
    let result=await fetch(origin+'/api/gamma-exposure/refresh',{method:'POST',headers:{'content-type':'application/json',origin:config.publicOrigin,authorization:'Bearer synthetic-hf',cookie:'synthetic-cookie'},body:JSON.stringify({symbol:'QQQ',window:'30d'})});assert.equal(result.status,200);assert.deepEqual(JSON.parse(received.body),{symbol:'QQQ',window:'30d'});assert.equal(received.headers.authorization,undefined);assert.equal(received.headers.cookie,undefined);
    assert.equal((await fetch(origin+'/api/max-pain/refresh',{method:'POST',headers:{'content-type':'application/json',origin:'https://hostile.example'},body:'{"symbol":"QQQ"}'})).status,403);
    assert.equal((await fetch(origin+'/api/providers/moomoo-webapi/quotes')).status,401);
  }finally{await Promise.all([new Promise(accept=>gateway.close(accept)),new Promise(accept=>backend.close(accept))]);}
});
