import assert from 'node:assert/strict';
import {createMoomooClient,createMoomooLocalHandler} from './moomoo-client.mjs';

const secret='synthetic-monitor-key-never-in-arguments';
const contract='US.NVDA261127C145000',put='US.NVDA261127P145000';
const calls=[];
let holdSnapshots;
const pendingSnapshot=new Promise(resolve=>{holdSnapshots=resolve;});
let delaySnapshot=true;
const runner=async request=>{
  assert.equal(request.environment.OPENAPI_HOST_APPKEY,secret);
  assert.equal(request.environment.OPENAPI_HOST_URL,'http://127.0.0.1:22222');
  assert(!request.args.join(' ').includes(secret));
  calls.push(request.args);
  const command=request.args[1];
  assert(['subscribe','get-security-snapshot','get-ticker'].includes(command),'Monitor must stay inside its readonly command allowlist');
  let data;
  if(command==='subscribe')data={};
  if(command==='get-security-snapshot'){
    if(delaySnapshot)await pendingSnapshot;
    data={snapshot_list:[{basic:{security:{market:11,code:contract.slice(3)},volume:1200,update_time:'2026-11-25 09:45:00'},option_ex_data:{open_interest:400}}]};
  }
  if(command==='get-ticker')data={security:{market:11,code:contract.slice(3)},ticker_list:[{time:'2026-11-25 09:44:59.123',timestamp:1795617899.123,sequence:91,dir:1,price:2.3,volume:100,turnover:23000}]};
  return {code:0,stdout:JSON.stringify({ret_type:0,err_code:0,ret_msg:'',s2c:data}),stderr:''};
};
const client=createMoomooClient({appKey:secret,runner});
const first=client.securitySnapshots([contract,put,contract]);
const simultaneous=client.securitySnapshots([contract,put]);
await Promise.resolve();
assert.equal(calls.length,1,'Concurrent identical snapshot queries are coalesced');
holdSnapshots();delaySnapshot=false;
const [snapshots,again]=await Promise.all([first,simultaneous]);
assert.deepEqual(snapshots,again);
assert.equal(snapshots.data.snapshot_list[0].option_ex_data.open_interest,400);
assert.equal(snapshots.entitlementVerified,false);
assert.match(snapshots.coverage,/not a complete underlying/);
assert.match(snapshots.marketTimestamps,/undisclosed/);
assert.deepEqual(calls[0],['--raw','get-security-snapshot',contract,put]);
await client.securitySnapshots([contract,put]);
assert.equal(calls.length,1,'Snapshot cache avoids repeated provider requests');

const ticks=await client.optionTrades(contract,{count:150});
assert.equal(calls.at(-2)[1],'subscribe');
assert.equal(calls.at(-2)[calls.at(-2).indexOf('--sub-type-list')+1],'ticker');
assert(calls.at(-2).includes('--no-is-reg-or-un-reg-push'));
assert.deepEqual(calls.at(-1),['--raw','get-ticker','--security',contract,'--max-ret-num','150']);
assert.equal(ticks.data.ticker_list[0].volume,100);
assert.equal(ticks.entitlementVerified,false);
assert.match(ticks.coverage,/no pagination/);
assert.match(ticks.directionMeaning,/not a verified opening\/closing/);
const before=calls.length;
await client.optionTrades(contract,{count:150});
assert.equal(calls.length,before,'Trade cache must not resubscribe or repeat the request');
await client.optionTrades(contract,{count:20});
assert.equal(calls.length,before+1,'Changing count reuses ticker subscription');
assert(client.status().capabilities.includes('security_snapshots'));
assert(client.status().capabilities.includes('option_trades'));

await assert.rejects(client.securitySnapshots(Array.from({length:101},(_,i)=>'US.NVDA261127C'+(145000+i))),e=>e.code==='INVALID_SYMBOL');
await assert.rejects(client.securitySnapshots('NVDA; get-acc-list'),e=>e.code==='INVALID_SYMBOL');
await assert.rejects(client.optionTrades('NVDA'),e=>e.code==='INVALID_SYMBOL');
await assert.rejects(client.optionTrades('HK.NVDA261127C145000'),e=>e.code==='INVALID_SYMBOL');
for(const count of [0,201,1.5,'100'])await assert.rejects(client.optionTrades(contract,{count}),e=>e.code==='INVALID_QUERY');
assert.equal(calls.length,before+1,'Invalid inputs must never invoke CLI commands');

const unavailable=createMoomooClient({appKey:secret,runner:async()=>({code:1,stdout:'',stderr:JSON.stringify({error:'connect host: cannot reach OpenAPI Host at http://127.0.0.1:22222 '+secret})})});
await assert.rejects(unavailable.securitySnapshots(contract),e=>e.code==='PROVIDER_UNAVAILABLE'&&!e.message.includes(secret));
assert.equal(unavailable.status().connectionStatus,'error');
const noSupport=createMoomooClient({appKey:secret,runner:async()=>({code:1,stdout:'',stderr:JSON.stringify({error:'unrecognized subcommand get-security-snapshot'})})});
await assert.rejects(noSupport.securitySnapshots(contract),e=>e.code==='UNSUPPORTED_CLIENT');
const denied=createMoomooClient({appKey:secret,runner:async()=>({code:0,stdout:JSON.stringify({ret_type:-1,ret_msg:'AppKey '+secret+' rejected'}),stderr:''})});
await assert.rejects(denied.securitySnapshots(contract),e=>e.code==='AUTH_FAILED'&&!e.message.includes(secret)&&e.message.includes('[redacted]'));
const malformed=createMoomooClient({appKey:secret,runner:async()=>({code:0,stdout:JSON.stringify({ret_type:0,s2c:{other:[]}}),stderr:''})});
await assert.rejects(malformed.securitySnapshots(contract),e=>e.code==='INVALID_RESPONSE');
const noKey=createMoomooClient({appKey:'',runner});
await assert.rejects(noKey.securitySnapshots(contract),e=>e.code==='NOT_CONFIGURED');

const handle=createMoomooLocalHandler(client);
assert.equal((await handle(new Request('http://localhost/api/providers/moomoo/security-snapshots?symbols='+contract))).status,200);
assert.equal((await handle(new Request('http://localhost/api/providers/moomoo/option-trades?symbol='+contract+'&count=20'))).status,200);
assert.equal((await handle(new Request('http://localhost/api/providers/moomoo/option-trades?symbol=NVDA'))).status,400);
assert.equal((await handle(new Request('http://localhost/api/providers/moomoo/security-snapshots?symbols='+contract,{method:'POST'}))).status,405);
assert.equal((await handle(new Request('http://localhost/api/providers/moomoo/option-trades?symbol='+contract,{headers:{origin:'https://outside.example'}}))).status,403);
assert.equal((await handle(new Request('http://localhost/api/providers/moomoo/orders'))).status,404);

// Monitor observations work through the verified basic-quote option extension,
// independently of a Host's optional full snapshot operation.
const basicCalls=[];
const basicClient=createMoomooClient({appKey:secret,runner:async request=>{
  basicCalls.push(request.args);const command=request.args[1];
  assert(['subscribe','get-basic-qot'].includes(command));
  const data=command==='subscribe'?{}:{basic_qot_list:request.args.slice(2).map(code=>({security:{code:code.slice(3)},volume:23,option_ex_data:{open_interest:57,implied_volatility:42}}))};
  return {code:0,stdout:JSON.stringify({ret_type:0,s2c:data}),stderr:''};
}});
const forty=Array.from({length:40},(_,i)=>'US.NVDA261127C'+(145000+i*1000));
const observed=await basicClient.optionSnapshots(forty);
assert.equal(observed.data.snapshot_list.length,40);
assert.equal(observed.data.snapshot_list[0].option_ex_data.open_interest,57);
assert.equal(observed.data.snapshot_list[0].basic.volume,23);
assert.equal(observed.sourceCommand,'get-basic-qot');
const quoteCalls=basicCalls.filter(args=>args[1]==='get-basic-qot');
assert.equal(quoteCalls.length,2);assert(quoteCalls.every(args=>args.length===22));
await assert.rejects(basicClient.optionSnapshots([...forty,'US.NVDA261127C999000']),e=>e.code==='INVALID_SYMBOL');
await assert.rejects(basicClient.optionSnapshots('NVDA'),e=>e.code==='INVALID_SYMBOL');
console.log('PASS monitor provider: readonly CLI arguments, bounded requests, cache/coalescing, ticker subscription reuse, timestamps/coverage, offline/unsupported/auth errors, redaction and local routes');
