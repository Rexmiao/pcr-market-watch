import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {cloudConfig,createCloudGateway} from './cloud-gateway.mjs';

async function fixture(t){
  let clock=Date.parse('2026-11-27T14:00:00Z'),upstream=0;
  const backend=http.createServer((req,res)=>{upstream++;res.end('{}');});
  await new Promise(resolve=>backend.listen(0,'127.0.0.1',resolve));
  const config={...cloudConfig({PCR_CLOUD_USERNAME:'unit_owner',PCR_CLOUD_PASSWORD:'synthetic-login-pass-17',PCR_CLOUD_PUBLIC_ORIGIN:'https://unit-language.hf.space'}),internalPort:backend.address().port,internalOrigin:'http://127.0.0.1:'+backend.address().port};
  const gateway=createCloudGateway(config,{now:()=>clock,onSecurityEvent:()=>{}});await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));
  t.after(()=>Promise.all([new Promise(resolve=>gateway.close(resolve)),new Promise(resolve=>backend.close(resolve))]));
  const origin='http://127.0.0.1:'+gateway.address().port;
  const get=path=>fetch(origin+path,{redirect:'manual'});
  const signIn=(path,{password=config.password,fields={},headers={}}={})=>fetch(origin+path,{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded',origin:config.publicOrigin,...headers},body:new URLSearchParams({username:config.username,password,...fields})});
  return {origin,config,get,signIn,advance:ms=>{clock+=ms;},upstream:()=>upstream};
}
function form(html){return {action:html.match(/<form action="([^"]+)" method="post">/)?.[1],nonce:html.match(/name="csrf" value="([A-Za-z0-9_-]+)"/)?.[1],names:[...html.matchAll(/<input[^>]* name="([^"]+)"/g)].map(match=>match[1])};}

test('first login is English with a same-origin Chinese link and unchanged CSP/form fields',async t=>{
  const f=await fixture(t),page=await f.get('/_pcr/login'),html=await page.text();
  assert.equal(page.status,200);assert(html.includes('<html lang="en">'));assert(html.includes('<h1>Private PCR workspace</h1>'));assert(html.includes('>Username</label>'));assert(html.includes('>Password</label>'));assert(html.includes('>Sign in</button>'));
  assert(html.includes('href="/_pcr/login?lang=zh"'));assert(html.includes('aria-label="Switch to Chinese">中文</a>'));
  assert(html.includes('<span aria-current="true" lang="en">English</span>'),'Both languages are visible and the current one is marked');
  assert.equal(form(html).action,'/_pcr/login');assert.deepEqual(form(html).names,['csrf','username','password']);assert(form(html).nonce);
  assert(!/<script|onclick=|javascript:/i.test(html));assert(!html.includes(f.config.password));
  assert.equal(page.headers.get('content-security-policy'),"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'self' https://huggingface.co https://hf.co");
});

test('Chinese GET has an English switch and preserves only whitelisted query language in the form',async t=>{
  const f=await fixture(t),page=await f.get('/_pcr/login?lang=zh&next=https://hostile.example'),html=await page.text();
  assert(html.includes('<span aria-current="true" lang="zh-CN">中文</span>'));assert(html.includes('aria-label="切换为英文">English</a>'));
  assert(html.includes('<html lang="zh-CN">'));assert(html.includes('<h1>私人 PCR 工作台</h1>'));assert(html.includes('>用户名</label>'));assert(html.includes('>密码</label>'));assert(html.includes('>登录</button>'));
  assert(html.includes('href="/_pcr/login?lang=en"'));assert.equal(form(html).action,'/_pcr/login?lang=zh');assert.deepEqual(form(html).names,['csrf','username','password']);assert(!html.includes('hostile.example'));
  assert(html.includes('href="'+f.config.publicOrigin+'/_pcr/login?lang=zh" target="_blank"'));
  const cookie=page.headers.get('set-cookie');for(const flag of ['HttpOnly','SameSite=None','Partitioned','Secure','Max-Age=300'])assert(cookie.includes(flag));
});

test('wrong credentials and expired embedded CSRF keep the selected Chinese language',async t=>{
  const f=await fixture(t),page=await f.get('/_pcr/login?lang=zh'),html=await page.text(),cookie=page.headers.get('set-cookie').split(';')[0];
  const failure=await f.signIn(form(html).action,{password:'synthetic-wrong-password'}),failed=await failure.text();assert.equal(failure.status,401);assert(failed.includes('<html lang="zh-CN">'));assert(failed.includes('登录信息不正确或页面已过期'));assert.equal(form(failed).action,'/_pcr/login?lang=zh');assert(!failed.includes('synthetic-wrong-password'));
  f.advance(300001);
  const expired=await f.signIn('/_pcr/login?lang=zh',{fields:{csrf:form(html).nonce},headers:{origin:'https://huggingface.co','sec-fetch-site':'cross-site',cookie}}),expiredHtml=await expired.text();assert.equal(expired.status,403);assert(expiredHtml.includes('<html lang="zh-CN">'));assert.equal(form(expiredHtml).action,'/_pcr/login?lang=zh');
  assert.equal(f.upstream(),0);
});

test('successful login returns exactly the absent, English or Chinese app language',async t=>{
  const f=await fixture(t);
  for(const [path,destination]of [['/_pcr/login','/'],['/_pcr/login?lang=en','/?lang=en'],['/_pcr/login?lang=zh','/?lang=zh'],['/_pcr/login?lang=zh&next=https://hostile.example','/?lang=zh']]){
    const response=await f.signIn(path);assert.equal(response.status,303);assert.equal(response.headers.get('location'),destination);for(const flag of ['HttpOnly','SameSite=None','Partitioned','Secure','Max-Age=43200'])assert(response.headers.get('set-cookie').includes(flag));
  }
});

test('unknown, repeated and malicious query languages cannot become HTML or redirect values',async t=>{
  const f=await fixture(t);
  for(const query of ['lang=fr','lang=zh&lang=en','lang=','lang=%22%3E%3Cscript%3Ealert(1)%3C/script%3E']){
    const page=await f.get('/_pcr/login?'+query),html=await page.text();assert(html.includes('<html lang="en">'));assert.equal(form(html).action,'/_pcr/login');assert(!html.includes('alert(1)'));assert(!/<script/i.test(html));
    const signed=await f.signIn('/_pcr/login?'+query);assert.equal(signed.status,303);assert.equal(signed.headers.get('location'),'/');
  }
  const newField=await f.signIn('/_pcr/login?lang=zh',{fields:{lang:'en'}});assert.equal(newField.status,401);assert((await newField.text()).includes('<html lang="zh-CN">'));
});

test('language parameters preserve original origin and HF embedded CSRF protections',async t=>{
  const f=await fixture(t),page=await f.get('/_pcr/login?lang=zh'),html=await page.text(),cookie=page.headers.get('set-cookie').split(';')[0],nonce=form(html).nonce;
  const malicious=await f.signIn('/_pcr/login?lang=zh',{headers:{origin:'https://hostile.example'}});assert.equal(malicious.status,403);
  const opaque=await f.signIn('/_pcr/login?lang=zh',{fields:{csrf:nonce},headers:{origin:'null','sec-fetch-site':'cross-site',cookie}});assert.equal(opaque.status,403);
  const noCsrf=await f.signIn('/_pcr/login?lang=zh',{headers:{origin:'https://huggingface.co','sec-fetch-site':'cross-site',cookie}});assert.equal(noCsrf.status,403);
  const embedded=await f.signIn('/_pcr/login?lang=zh',{fields:{csrf:nonce},headers:{origin:'https://huggingface.co','sec-fetch-site':'cross-site',cookie}});assert.equal(embedded.status,303);assert.equal(embedded.headers.get('location'),'/?lang=zh');
});

test('the sign-in page follows the app day/night cookie without scripts or HTML changes',async t=>{
  const f=await fixture(t);
  const night=await (await f.get('/_pcr/login')).text();
  assert(night.includes('html{color-scheme:dark;color:#e8edf3;background:#0b1118}'),'Night is the default, matching the app');
  assert(night.includes('<html lang="en">'));assert(!/<script/i.test(night));
  const day=await (await fetch(f.origin+'/_pcr/login',{headers:{cookie:'other=1; pcr-theme=light'}})).text();
  assert(!day.includes('#0b1118'),'pcr-theme=light renders the original day styles');assert(day.includes('background:#f4f7fc'));
  for(const cookie of ['pcr-theme=LIGHT','xpcr-theme=light','pcr-theme=light%22%3E','pcr-theme="light"']){
    const html=await (await fetch(f.origin+'/_pcr/login?lang=zh',{headers:{cookie}})).text();
    assert(html.includes('background:#0b1118'),cookie+' falls back to night');assert(!html.includes('%22%3E'));assert(html.includes('<html lang="zh-CN">'));
  }
  const gated=await fetch(f.origin+'/market-brief.html',{headers:{cookie:'pcr-theme=light'}});assert.equal(gated.status,401);assert(!(await gated.text()).includes('#0b1118'),'The inline private-page gate follows the same cookie');
});

test('the sign-in page remembers a saved Chinese choice through the pcr-lang cookie; ?lang= still wins',async t=>{
  const f=await fixture(t),withCookie=(path,cookie)=>fetch(f.origin+path,{redirect:'manual',headers:{cookie}});
  let html=await (await withCookie('/_pcr/login','pcr-lang=zh')).text();
  assert(html.includes('<html lang="zh-CN">'));assert(html.includes('<h1>私人 PCR 工作台</h1>'));assert.equal(form(html).action,'/_pcr/login?lang=zh','The form keeps the remembered language through a failed attempt');
  html=await (await withCookie('/_pcr/login?lang=en','pcr-lang=zh')).text();assert(html.includes('<html lang="en">'),'An explicit URL language overrides the cookie');
  html=await (await withCookie('/_pcr/login','other=1; pcr-lang=en; pcr-theme=light')).text();assert(html.includes('<html lang="en">'));assert(!html.includes('#0b1118'),'Language and theme cookies combine');
  for(const cookie of ['pcr-lang=ZH','xpcr-lang=zh','pcr-lang=zh%22%3E','pcr-lang="zh"','pcr-lang=fr']){
    html=await (await withCookie('/_pcr/login',cookie)).text();assert(html.includes('<html lang="en">'),cookie+' is ignored');assert(!html.includes('%22%3E'));assert(!/<script/i.test(html));
  }
  const gate=await withCookie('/market-brief.html','pcr-lang=zh');assert.equal(gate.status,401);assert((await gate.text()).includes('<html lang="zh-CN">'),'The private-page gate follows the remembered language');
  const failed=await f.signIn('/_pcr/login',{password:'synthetic-wrong-password',headers:{cookie:'pcr-lang=zh'}});assert.equal(failed.status,401);assert((await failed.text()).includes('<html lang="zh-CN">'));
  const page=await (await withCookie('/_pcr/login','pcr-lang=zh')).text();
  const signed=await f.signIn(form(page).action,{headers:{cookie:'pcr-lang=zh'}});assert.equal(signed.status,303);assert.equal(signed.headers.get('location'),'/?lang=zh','Submitting the remembered-language form lands in the same language');
  assert.equal(f.upstream(),0);
});

test('an unauthenticated Chinese app URL gets a Chinese login without preserving a return target',async t=>{
  const f=await fixture(t),page=await f.get('/market-brief.html?lang=zh&next=https://hostile.example'),html=await page.text();assert.equal(page.status,401);assert(html.includes('<html lang="zh-CN">'));assert.equal(form(html).action,'/_pcr/login?lang=zh');assert(!html.includes('hostile.example'));
});

