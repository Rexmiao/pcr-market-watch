import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createPublicAccessHandler} from './public-access.mjs';
import {cloudConfig,createCloudGateway} from './cloud-gateway.mjs';
const id='a'.repeat(64),origin='https://archive-unit.hf.space';
const database={prepare(sql){return {bind(){return {first:async()=>({items_json:JSON.stringify(sql.includes('user_watchlists')?[{symbol:'AMD',category:null}]:[{type:'symbol',symbol:'QQQ'}]),revision:1})};}};}};
const request=(path,method='GET')=>new Request(origin+path,{method,...(method==='POST'?{headers:{'content-type':'application/json'},body:'{}'}:{})});

test('archive reads enforce current published symbols and never proxy capture for anonymous access',async()=>{
  const calls=[],handler=createPublicAccessHandler({database,proxy:async req=>{calls.push({method:req.method,url:req.url});return Response.json({id,symbol:'AMD',payload:{callWall:490,putWall:400,accessToken:'unit-private',nested:{positions:[1],keep:2}}});}});
  for(const path of ['/api/structure-archive/index?symbol=AMD','/api/structure-archive?symbol=AMD&date=2026-11-27','/api/structure-archive?symbol=AMD&id='+id,'/api/structure-daily']){
    const response=await handler(request(path));assert.equal(response.status,200);assert(!JSON.stringify(await response.json()).includes('unit-private'));
  }
  assert(calls.every(call=>call.method==='GET'));
  for(const path of ['/api/structure-archive/index?symbol=AAPL','/api/structure-archive?symbol=AAPL&id='+id])assert.equal((await handler(request(path))).status,403);
  for(const path of ['/api/structure-archive/index?symbol=AMD&symbol=QQQ','/api/structure-archive?symbol=AMD','/api/structure-archive?symbol=AMD&date=2026-02-30','/api/structure-archive?symbol=AMD&date=2026-11-27&id='+id,'/api/structure-archive?symbol=AMD&id=invalid','/api/structure-daily?refresh=1'])assert.equal((await handler(request(path))).status,400,path);
  const before=calls.length;
  assert.equal(await handler(request('/api/structure-daily/capture','POST')),null);
  assert.equal(await handler(request('/api/structure-archive/index?symbol=AMD','POST')),null);
  assert.equal(calls.length,before);
});

test('cloud gateway keeps capture owner-only and preserves anonymous archived dates without source POSTs',async()=>{
  const calls=[],backend=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;calls.push({method:req.method,url:req.url,body,headers:req.headers});res.writeHead(req.method==='POST'?202:200,{'content-type':'application/json'});res.end(JSON.stringify({accepted:req.method==='POST',symbol:'AMD',records:[]}));});
  await new Promise(resolve=>backend.listen(0,'127.0.0.1',resolve));
  const config={...cloudConfig({PCR_CLOUD_PASSWORD:'unit-archive-owner',PCR_CLOUD_PUBLIC_ORIGIN:origin}),internalPort:backend.address().port,internalOrigin:'http://127.0.0.1:'+backend.address().port};
  const gateway=createCloudGateway(config,{database,publicAccess:true});await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+gateway.address().port;
  try{
    assert.equal((await fetch(base+'/api/structure-archive?symbol=AMD&date=2025-11-27')).status,200);
    assert.equal((await fetch(base+'/api/structure-daily')).status,200);
    assert.equal((await fetch(base+'/api/structure-archive/index?symbol=AAPL')).status,403);
    const post={method:'POST',headers:{'content-type':'application/json',origin},body:'{}'};
    assert.equal((await fetch(base+'/api/structure-daily/capture',post)).status,401);
    assert(!calls.some(call=>call.method==='POST'));
    const owner=await fetch(base+'/api/structure-daily/capture',{...post,headers:{...post.headers,authorization:'Basic '+Buffer.from('pcr:unit-archive-owner').toString('base64')}});
    assert.equal(owner.status,202);const last=calls.at(-1);assert.equal(last.body,'{}');assert.equal(last.headers.authorization,undefined);assert.equal(last.headers.origin,config.internalOrigin);
  }finally{await Promise.all([new Promise(resolve=>gateway.close(resolve)),new Promise(resolve=>backend.close(resolve))]);}
});
