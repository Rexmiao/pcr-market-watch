import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {cloudConfig,createCloudGateway,spaceHosts} from './cloud-gateway.mjs';

test('cloud deployment refuses missing login, invalid origins, and colliding ports',()=>{
  assert.throws(()=>cloudConfig({}),/password/);
  const base={PCR_CLOUD_PASSWORD:'a-long-test-password',PCR_CLOUD_PUBLIC_ORIGIN:'https://unit-test.hf.space'};
  assert.equal(cloudConfig(base).port,7860);
  for(const length of [9,257])assert.throws(()=>cloudConfig({...base,PCR_CLOUD_PASSWORD:'x'.repeat(length)}),/password/);
  for(const length of [10,11,256])assert.equal(cloudConfig({...base,PCR_CLOUD_PASSWORD:'x'.repeat(length)}).password.length,length);
  for(const control of ['\r','\n','\0'])assert.throws(()=>cloudConfig({...base,PCR_CLOUD_PASSWORD:'x'.repeat(10)+control}),/password/);
  assert.throws(()=>cloudConfig({...base,PCR_CLOUD_PUBLIC_ORIGIN:'http://public.example'}),/HTTPS/);
  assert.throws(()=>cloudConfig({...base,PORT:'8765'}),/separate/);
});
test('all cloud paths require authentication, reject cross-origin API writes, and strip identity/secrets upstream',async()=>{
  let received=null;
  const backend=http.createServer((req,res)=>{received={url:req.url,headers:req.headers};res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true}));});
  await new Promise(accept=>backend.listen(0,'127.0.0.1',accept));
  const config={...cloudConfig({PCR_CLOUD_PASSWORD:'a-long-test-password',PCR_CLOUD_PUBLIC_ORIGIN:'https://unit-test.hf.space'}),internalPort:backend.address().port,internalOrigin:'http://127.0.0.1:'+backend.address().port};
  const gateway=createCloudGateway(config);await new Promise(accept=>gateway.listen(0,'127.0.0.1',accept));
  const origin='http://127.0.0.1:'+gateway.address().port,auth='Basic '+Buffer.from('pcr:a-long-test-password').toString('base64');
  try{
    assert.equal((await fetch(origin+'/api/watchlist-settings')).status,401);assert.equal(received,null);
    assert.equal((await fetch(origin+'/',{headers:{authorization:'Basic '+Buffer.from('pcr:wrong').toString('base64')}})).status,401);
    assert.equal((await fetch(origin+'/api/watchlist-settings',{method:'POST',headers:{authorization:auth,origin:'https://hostile.example'}})).status,403);assert.equal(received,null);
    assert.equal((await fetch(origin+'/api/providers/moomoo/quotes',{headers:{authorization:auth}})).status,403);
    const response=await fetch(origin+'/api/oi-daily',{headers:{authorization:auth,origin:config.publicOrigin,'oai-authenticated-user-id':'other_user','x-auth-user':'other'}});assert.equal(response.status,200);
    assert.equal(received.headers.authorization,undefined);assert.equal(received.headers['oai-authenticated-user-id'],undefined);assert.equal(received.headers['x-auth-user'],undefined);assert.equal(received.headers.origin,config.internalOrigin);
    assert.equal((await fetch(origin+'/',{headers:{authorization:auth,'sec-fetch-site':'cross-site'}})).status,200,'Opening the Space through a normal external link can load its document.');
  }finally{await Promise.all([new Promise(accept=>gateway.close(accept)),new Promise(accept=>backend.close(accept))]);}
});

async function sessionFixture({publicOrigin='https://unit-test.hf.space',username='pcr',password='a-long-test-password',hfSpaceHost}={}){
  let received=null,clock=Date.parse('2026-11-26T12:00:00Z');
  const events=[];
  const backend=http.createServer((req,res)=>{received={url:req.url,headers:req.headers};res.setHeader('content-type','application/json');res.end('{"ok":true}');});
  await new Promise(accept=>backend.listen(0,'127.0.0.1',accept));
  const env=hfSpaceHost?{PCR_CLOUD_USERNAME:username,PCR_CLOUD_PASSWORD:password,HF_SPACE_HOST:hfSpaceHost}:{PCR_CLOUD_USERNAME:username,PCR_CLOUD_PASSWORD:password,PCR_CLOUD_PUBLIC_ORIGIN:publicOrigin};
  const config={...cloudConfig(env),internalPort:backend.address().port,internalOrigin:'http://127.0.0.1:'+backend.address().port};
  const gateway=createCloudGateway(config,{now:()=>clock,onSecurityEvent:event=>events.push(event)});await new Promise(accept=>gateway.listen(0,'127.0.0.1',accept));
  return {config,events,origin:'http://127.0.0.1:'+gateway.address().port,auth:'Basic '+Buffer.from(username+':'+password).toString('base64'),get received(){return received;},advance(ms){clock+=ms;},async close(){await Promise.all([new Promise(accept=>gateway.close(accept)),new Promise(accept=>backend.close(accept))]);}};
}
function signIn(fixture,password='a-long-test-password',extra={}){
  return fetch(fixture.origin+'/_pcr/login',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded',origin:fixture.config.publicOrigin,...extra},body:new URLSearchParams({username:fixture.config.username,password}).toString()});
}

test('rotating administrator credentials rejects prior authorization, session and CSRF while new login succeeds',async()=>{
  const previous=await sessionFixture(),next=await sessionFixture({username:'owner_unit',password:'unit-new-11'});
  try{
    const signedIn=await signIn(previous);assert.equal(signedIn.status,303);
    const oldSession=signedIn.headers.get('set-cookie').split(';')[0],oldForm=await csrfForm(previous);
    assert.equal((await fetch(previous.origin+'/api/oi-daily',{headers:{cookie:oldSession}})).status,200);
    assert.equal((await fetch(next.origin+'/api/oi-daily',{headers:{cookie:oldSession}})).status,401);
    assert.equal((await fetch(next.origin+'/api/oi-daily',{headers:{'x-pcr-authorization':previous.auth}})).status,401);
    const reusedForm=await fetch(next.origin+'/_pcr/login',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded',origin:next.config.publicOrigin,'sec-fetch-site':'cross-site',cookie:oldForm.cookie},body:new URLSearchParams({username:next.config.username,password:next.config.password,csrf:oldForm.nonce}).toString()});
    assert.equal(reusedForm.status,403);
    const newLogin=await signIn(next,next.config.password);assert.equal(newLogin.status,303);
    const newSession=newLogin.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(next.origin+'/api/oi-daily',{headers:{cookie:newSession}})).status,200);
    assert.equal((await fetch(next.origin+'/api/access',{headers:{cookie:newSession}})).status,200);
  }finally{await Promise.all([previous.close(),next.close()]);}
});
test('HF Bearer access is separate from app authorization and never reaches the private backend',async()=>{
  const fixture=await sessionFixture();try{
    let response=await fetch(fixture.origin+'/',{headers:{authorization:'Bearer unit-hf-token'}});assert.equal(response.status,401);assert.equal(response.headers.get('www-authenticate'),null);assert((await response.text()).includes('form action="/_pcr/login"'));
    response=await fetch(fixture.origin+'/api/oi-daily',{headers:{authorization:'Bearer unit-hf-token','x-pcr-authorization':fixture.auth,cookie:'other_cookie=unit-cookie','x-auth-user':'untrusted'}});assert.equal(response.status,200);
    assert.equal(fixture.received.headers.authorization,undefined);assert.equal(fixture.received.headers['x-pcr-authorization'],undefined);assert.equal(fixture.received.headers.cookie,undefined);assert.equal(fixture.received.headers['x-auth-user'],undefined);
    assert.equal((await fetch(fixture.origin+'/api/oi-daily',{headers:{authorization:'Bearer unit-hf-token'}})).status,401);
  }finally{await fixture.close();}
});
test('browser sign-in creates a bounded HttpOnly session; cookies work with HF Bearer and are stripped upstream',async()=>{
  const fixture=await sessionFixture();try{
    const page=await fetch(fixture.origin+'/_pcr/login');assert.equal(page.status,200);assert.equal(page.headers.get('referrer-policy'),'strict-origin-when-cross-origin');const html=await page.text();assert(html.includes('autocomplete="current-password"'));assert(!html.includes('a-long-test-password'));
    const response=await signIn(fixture);assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/');
    const header=response.headers.get('set-cookie');assert(header.includes('HttpOnly'));assert(header.includes('SameSite=None'));assert(header.includes('Partitioned'));assert(header.includes('Secure'));assert(header.includes('Max-Age=43200'));
    const cookie=header.split(';')[0];
    const accepted=await fetch(fixture.origin+'/api/oi-daily',{headers:{authorization:'Bearer unit-hf-token',cookie}});assert.equal(accepted.status,200);assert.equal(fixture.received.headers.cookie,undefined);assert.equal(fixture.received.headers.authorization,undefined);
    const changed=cookie.slice(0,-2)+(cookie.at(-2)==='a'?'b':'a')+cookie.at(-1);
    assert.equal((await fetch(fixture.origin+'/api/oi-daily',{headers:{cookie:changed}})).status,401);
    assert.equal((await fetch(fixture.origin+'/api/oi-daily',{headers:{cookie:cookie+'; '+cookie}})).status,401);
    fixture.advance(12*60*60*1000+1);assert.equal((await fetch(fixture.origin+'/api/oi-daily',{headers:{cookie}})).status,401);
  }finally{await fixture.close();}
});
test('login/logout require same-origin form posts and logout clears the browser cookie',async()=>{
  const fixture=await sessionFixture();try{
    assert.equal((await signIn(fixture,'a-long-test-password',{origin:'https://hostile.example'})).status,403);
    assert.equal((await fetch(fixture.origin+'/_pcr/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'username=pcr&password=unit'})).status,403);
    assert.equal((await signIn(fixture,'a-long-test-password',{'sec-fetch-site':'cross-site'})).status,403);
    const failure=await signIn(fixture,'wrong-unit-password');assert.equal(failure.status,401);assert(!(await failure.text()).includes('wrong-unit-password'));
    const signed=await signIn(fixture),cookie=signed.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(fixture.origin+'/_pcr/logout',{method:'GET',headers:{cookie}})).status,405);
    assert.equal((await fetch(fixture.origin+'/_pcr/logout',{method:'POST',headers:{cookie}})).status,403);
    const result=await fetch(fixture.origin+'/_pcr/logout',{method:'POST',redirect:'manual',headers:{cookie,origin:fixture.config.publicOrigin}});assert.equal(result.status,303);assert(result.headers.get('set-cookie').includes('Max-Age=0'));assert(result.headers.get('set-cookie').includes('HttpOnly'));
    assert.equal((await fetch(fixture.origin+'/_pcr/login',{method:'POST',headers:{origin:fixture.config.publicOrigin,'content-type':'application/json'},body:'{}'})).status,400);
  }finally{await fixture.close();}
});
test('failed browser logins are bounded per real peer, ignore spoofed forwarding headers, and reset after one minute',async()=>{
  const fixture=await sessionFixture();try{
    for(let i=0;i<10;i++)assert.equal((await signIn(fixture,'wrong-unit-password',{'x-forwarded-for':'192.0.2.'+i})).status,401);
    const limited=await signIn(fixture);assert.equal(limited.status,429);assert.equal(limited.headers.get('retry-after'),'60');
    fixture.advance(60001);assert.equal((await signIn(fixture)).status,303);
  }finally{await fixture.close();}
});

async function csrfForm(fixture,headers={}){
  // Undici overwrites Sec-Fetch-Mode with cors; a raw HTTP navigation fixture
  // is required to exercise the browser's actual navigate/iframe headers.
  const page=headers['sec-fetch-mode']==='navigate'?await new Promise((accept,reject)=>{
    const request=http.get(fixture.origin+'/_pcr/login',{headers},response=>{const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>accept({status:response.statusCode,headers:new Headers(response.headers),text:async()=>Buffer.concat(chunks).toString('utf8')}));});request.on('error',reject);
  }):await fetch(fixture.origin+'/_pcr/login',{headers});
  const html=await page.text(),nonce=html.match(/name="csrf" value="([A-Za-z0-9_-]+)"/)?.[1],cookie=page.headers.get('set-cookie')?.split(';')[0];
  return {page,html,nonce,cookie};
}
function embeddedLogin(fixture,form,headers={}){return fetch(fixture.origin+'/_pcr/login',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded',origin:'https://huggingface.co','sec-fetch-site':'cross-site',cookie:form.cookie,...headers},body:new URLSearchParams({username:'pcr',password:'a-long-test-password',csrf:form.nonce}).toString()});}
test('HF parent navigation is restricted to document GET/HEAD and never authorizes API reads or opaque mutations',async()=>{
  const fixture=await sessionFixture();try{
    const navigation={origin:'https://huggingface.co','sec-fetch-site':'cross-site','sec-fetch-mode':'navigate','sec-fetch-dest':'iframe'};
    const form=await csrfForm(fixture,navigation);assert.equal(form.page.status,200);assert(form.page.headers.get('content-security-policy').includes("frame-ancestors 'self' https://huggingface.co https://hf.co"));
    assert.equal((await fetch(fixture.origin+'/api/oi-daily',{headers:{...navigation,'x-pcr-authorization':fixture.auth}})).status,403);
    assert.equal((await fetch(fixture.origin+'/',{headers:{...navigation,origin:'https://hostile.example','x-pcr-authorization':fixture.auth}})).status,403);
    assert.equal((await fetch(fixture.origin+'/',{headers:{origin:'https://huggingface.co','x-pcr-authorization':fixture.auth}})).status,403);
    assert.equal((await embeddedLogin(fixture,form,{origin:'null'})).status,403);
  }finally{await fixture.close();}
});
test('HF embedded login requires a matching signed five-minute CSRF cookie and partitioned session',async()=>{
  const fixture=await sessionFixture();try{
    const form=await csrfForm(fixture);assert(form.nonce);assert(form.cookie.startsWith('__Host-pcr_login_csrf='));assert(form.page.headers.get('set-cookie').includes('SameSite=None'));assert(form.page.headers.get('set-cookie').includes('Partitioned'));
    assert.equal((await embeddedLogin(fixture,{...form,cookie:'unrelated=unit-cookie'})).status,403);
    assert.equal((await embeddedLogin(fixture,{...form,nonce:'a'.repeat(22)})).status,403);
    const response=await embeddedLogin(fixture,form);assert.equal(response.status,303);const cookie=response.headers.get('set-cookie').split(';')[0];assert(cookie.startsWith('__Host-pcr_embed_session='));
    assert.equal((await fetch(fixture.origin+'/api/oi-daily',{headers:{cookie,origin:fixture.config.publicOrigin,'sec-fetch-site':'same-origin'}})).status,200);
    assert.equal((await fetch(fixture.origin+'/api/oi-daily',{headers:{cookie,origin:fixture.config.publicOrigin,'sec-fetch-site':'cross-site'}})).status,403,'API cross-site restrictions remain unchanged.');
    fixture.advance(5*60000+1);assert.equal((await embeddedLogin(fixture,form)).status,403);
  }finally{await fixture.close();}
});
test('same-app iframe metadata uses CSRF proof, favicon does not overwrite the form nonce, and diagnostics exclude sensitive values',async()=>{
  const fixture=await sessionFixture();try{
    const form=await csrfForm(fixture);assert.equal((await embeddedLogin(fixture,form,{origin:fixture.config.publicOrigin})).status,303);
    const favicon=await fetch(fixture.origin+'/favicon.ico');assert.equal(favicon.status,401);assert.equal(favicon.headers.get('set-cookie'),null);
    await fetch(fixture.origin+'/api/private-unit-value?secret=unit-query-value',{headers:{origin:'https://hostile.example',cookie:'unit-cookie-secret','authorization':'Bearer unit-token-secret'}});
    const serialized=JSON.stringify(fixture.events);for(const secret of ['unit-query-value','unit-cookie-secret','unit-token-secret','hostile.example','a-long-test-password'])assert(!serialized.includes(secret));
    const event=fixture.events.at(-1);assert.equal(event.event,'PCR_CLOUD_ORIGIN_DENIED');assert.equal(event.route,'api');assert.equal(event.reason,'origin');assert.equal(event.originMatchesApp,false);
  }finally{await fixture.close();}
});
test('non-HF deployments keep SameSite Lax and do not trust HF parent logins',async()=>{
  const fixture=await sessionFixture({publicOrigin:'https://private.example'});try{
    const form=await csrfForm(fixture);assert(form.page.headers.get('set-cookie').includes('SameSite=Lax'));assert(!form.page.headers.get('set-cookie').includes('Partitioned'));
    assert.equal((await embeddedLogin(fixture,form)).status,403);const response=await signIn(fixture);assert.equal(response.status,303);assert(response.headers.get('set-cookie').includes('SameSite=Lax'));assert(!response.headers.get('set-cookie').includes('Partitioned'));
  }finally{await fixture.close();}
});

const CUSTOM='option-chain-watcher.levyquant.ai',DEFAULT_HOST='unit-pcr.hf.space';
test('HF_SPACE_HOST custom domains become extra app origins and a comma list no longer breaks startup',()=>{
  const base={PCR_CLOUD_PASSWORD:'a-long-test-password'};
  let config=cloudConfig({...base,SPACE_HOST:DEFAULT_HOST+','+CUSTOM});
  assert.equal(config.publicOrigin,'https://'+DEFAULT_HOST,'SPACE_HOST mirrors HF_SPACE_HOST; its first entry stays the canonical origin');
  assert.deepEqual(config.appOrigins,['https://'+DEFAULT_HOST,'https://'+CUSTOM]);
  config=cloudConfig({...base,HF_SPACE_HOST:DEFAULT_HOST+', '+CUSTOM,SPACE_HOST:'ignored.hf.space'});assert.deepEqual(config.appOrigins,['https://'+DEFAULT_HOST,'https://'+CUSTOM],'HF_SPACE_HOST wins and spaces around commas are tolerated');
  assert.deepEqual(cloudConfig({...base,HF_SPACE_HOST:DEFAULT_HOST}).appOrigins,['https://'+DEFAULT_HOST]);
  assert.deepEqual(cloudConfig({...base,HF_SPACE_HOST:DEFAULT_HOST+','+DEFAULT_HOST}).appOrigins,['https://'+DEFAULT_HOST],'Duplicates collapse');
  for(const bad of ['Option-Chain-Watcher.levyquant.ai','https://'+CUSTOM,CUSTOM+':8443',CUSTOM+'/x','evil example.com','*.levyquant.ai','','-bad.levyquant.ai',CUSTOM+'.'])
    assert.deepEqual(cloudConfig({...base,HF_SPACE_HOST:DEFAULT_HOST+','+CUSTOM+','+bad}).appOrigins,['https://'+DEFAULT_HOST],bad+' must fail closed for every extra origin');
  assert.deepEqual(cloudConfig({...base,HF_SPACE_HOST:[DEFAULT_HOST,'a.example.com','b.example.com','c.example.com','d.example.com','e.example.com','f.example.com'].join(',')}).appOrigins,['https://'+DEFAULT_HOST],'More than five extras trusts none');
  assert.deepEqual(cloudConfig({...base,PCR_CLOUD_PUBLIC_ORIGIN:'http://127.0.0.1:7860',HF_SPACE_HOST:DEFAULT_HOST+','+CUSTOM}).appOrigins,['http://127.0.0.1:7860','https://'+CUSTOM],'An explicit origin stays canonical; bound custom domains still apply');
  assert.throws(()=>cloudConfig({...base,HF_SPACE_HOST:'Not A Host,'+CUSTOM}),/origin/,'A malformed primary host still refuses to start');
  assert.deepEqual(spaceHosts(undefined),{primary:null,extra:[]});assert.deepEqual(spaceHosts('x'.repeat(1025)),{primary:null,extra:[]});
});

test('sign-in, sign-out and API writes work from a bound custom domain while unknown origins stay rejected',async()=>{
  const fixture=await sessionFixture({hfSpaceHost:DEFAULT_HOST+','+CUSTOM});try{
    const custom='https://'+CUSTOM;
    assert.equal((await signIn(fixture,'a-long-test-password',{origin:'https://evil.levyquant.ai'})).status,403,'Sibling subdomains are not trusted');
    assert.equal((await signIn(fixture,'a-long-test-password',{origin:'http://'+CUSTOM})).status,403,'Scheme must match exactly');
    assert.equal((await signIn(fixture,'wrong-unit-password',{origin:custom})).status,401,'Custom-domain origin passes the origin check');
    const signed=await signIn(fixture,'a-long-test-password',{origin:custom});assert.equal(signed.status,303);const cookie=signed.headers.get('set-cookie').split(';')[0];
    const write=await fetch(fixture.origin+'/api/watchlist-settings',{method:'PUT',headers:{cookie,origin:custom,'content-type':'application/json'},body:'{}'});assert.equal(write.status,200,'Authenticated writes from the custom domain reach the backend');
    assert.equal(fixture.received.headers.origin,fixture.config.internalOrigin,'The backend still sees only the internal origin');
    assert.equal((await fetch(fixture.origin+'/api/watchlist-settings',{method:'PUT',headers:{cookie,origin:'https://hostile.example','content-type':'application/json'},body:'{}'})).status,403);
    const out=await fetch(fixture.origin+'/_pcr/logout',{method:'POST',redirect:'manual',headers:{cookie,origin:custom}});assert.equal(out.status,303);
    assert(fixture.events.some(event=>event.reason==='origin'&&event.originMatchesApp===false));
  }finally{await fixture.close();}
});

test('the sign-in page links its new-window action to the host in use, never to an unbound Host header',async()=>{
  const fixture=await sessionFixture({hfSpaceHost:DEFAULT_HOST+','+CUSTOM});try{
    const page=host=>new Promise((accept,reject)=>{const request=http.request(fixture.origin+'/_pcr/login',{headers:{host}},response=>{let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);response.on('end',()=>accept(body));});request.on('error',reject);request.end();});
    assert((await page(CUSTOM)).includes('href="https://'+CUSTOM+'/_pcr/login" target="_blank"'));
    assert((await page(DEFAULT_HOST)).includes('href="https://'+DEFAULT_HOST+'/_pcr/login" target="_blank"'));
    const spoofed=await page('attacker.example');assert(spoofed.includes('href="https://'+DEFAULT_HOST+'/_pcr/login" target="_blank"'));assert(!spoofed.includes('attacker.example'));
  }finally{await fixture.close();}
});