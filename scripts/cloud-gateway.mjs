// Single-user authenticated gateway for Docker Spaces. The private backend
// still listens on loopback; no untrusted identity headers reach it.
import http from 'node:http';
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {createPublicAccessHandler} from './public-access.mjs';
const hash=value=>createHash('sha256').update(value).digest();
const COOKIE='pcr_session',LIFETIME=12*60*60*1000;
const EMBED_COOKIE='__Host-pcr_embed_session',CSRF_LIFETIME=5*60*1000,HF_PARENTS=new Set(['https://huggingface.co','https://hf.co']);
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function hfEmbedding(config){const url=new URL(config.publicOrigin);return url.protocol==='https:'&&/^[a-z0-9-]+\.hf\.space$/i.test(url.hostname);}
function sessionName(config){return hfEmbedding(config)?EMBED_COOKIE:COOKIE;}
function csrfName(config){return hfEmbedding(config)?'__Host-pcr_login_csrf':'pcr_login_csrf';}
function readCookie(header,name){if(typeof header!=='string'||header.length>8192)return null;const values=header.split(';').map(value=>value.trim()).filter(value=>value.startsWith(name+'='));return values.length===1?values[0].slice(name.length+1):null;}
export function cloudConfig(env=process.env){
  const username=env.PCR_CLOUD_USERNAME||'pcr',password=env.PCR_CLOUD_PASSWORD||'';
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(username)||password.length<10||password.length>256||/[\r\n\0]/.test(password))throw Error('Configure a private cloud login with a password of 10 to 256 characters.');
  const port=Number(env.PORT||7860),internalPort=Number(env.PCR_INTERNAL_PORT||8765);
  if(![port,internalPort].every(p=>Number.isInteger(p)&&p>=1024&&p<=65535)||port===internalPort)throw Error('Choose separate valid public and internal ports.');
  // HF lists the default *.hf.space host first, then any custom domain bound to this
  // Space, comma-separated (HF_SPACE_HOST; SPACE_HOST carries the same value).
  const hosts=spaceHosts(env.HF_SPACE_HOST||env.SPACE_HOST);
  const rawOrigin=env.PCR_CLOUD_PUBLIC_ORIGIN||(hosts.primary?'https://'+hosts.primary:'');
  let url;try{url=new URL(rawOrigin);}catch{throw Error('Set the exact public Space origin.');}
  if(url.origin!==rawOrigin||url.username||url.password||url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw Error('Use an HTTPS Space origin or a loopback origin for local testing.');
  const appOrigins=[...new Set([url.origin,...hosts.extra.map(host=>'https://'+host)])];
  return {username,password,port,internalPort,publicOrigin:url.origin,appOrigins,internalOrigin:'http://127.0.0.1:'+internalPort};
}
// Bound custom domains become additional same-app origins, so sign-in, sign-out and
// refreshes work on them as on the default host. Hosts must be exact lowercase DNS
// names; any malformed entry, or more than five extras, trusts no extra origin (fail
// closed, matching the LevyQuant digest's DIGEST_ADMIN_ORIGINS rule).
const HOST_NAME=/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export function spaceHosts(value){
  if(typeof value!=='string'||!value.trim()||value.length>1024)return {primary:null,extra:[]};
  const entries=value.split(',').map(entry=>entry.trim());
  const primary=HOST_NAME.test(entries[0])?entries[0]:null;
  const rest=entries.slice(1);
  if(!primary||rest.length>5||rest.some(entry=>!HOST_NAME.test(entry)))return {primary,extra:[]};
  return {primary,extra:[...new Set(rest)].filter(host=>host!==primary)};
}
function appOrigin(config,origin){return typeof origin==='string'&&(config.appOrigins||[config.publicOrigin]).includes(origin);}
function requestOrigin(config,host){const value=String(host||'').toLowerCase();return (config.appOrigins||[config.publicOrigin]).find(origin=>new URL(origin).host===value)||config.publicOrigin;}
export function cloudAuthorized(header,{username,password}){
  if(typeof header!=='string'||header.length>1024||!/^Basic [A-Za-z0-9+/]+={0,2}$/.test(header))return false;
  let value;try{value=Buffer.from(header.slice(6),'base64').toString('utf8');}catch{return false;}
  return timingSafeEqual(hash(value),hash(username+':'+password));
}
function sessionSignature(value,config,purpose='session'){return createHmac('sha256',hash('pcr-cloud-'+purpose+':v1\0'+config.username+'\0'+config.password)).update(value).digest();}
function sessionToken(config,now){const payload=Buffer.from(JSON.stringify({v:1,u:config.username,iat:now,exp:now+LIFETIME,nonce:randomBytes(16).toString('base64url')})).toString('base64url');return payload+'.'+sessionSignature(payload,config).toString('base64url');}
function sessionAuthorized(header,config,now){
  try{
    const token=readCookie(header,sessionName(config))||(hfEmbedding(config)?readCookie(header,COOKIE):null);if(!token||token.length>2048||!/^[-A-Za-z0-9_]+\.[-A-Za-z0-9_]{43}$/.test(token))return false;
    const [payload,signature]=token.split('.'),actual=Buffer.from(signature,'base64url'),expected=sessionSignature(payload,config);
    if(actual.length!==expected.length||actual.toString('base64url')!==signature||!timingSafeEqual(actual,expected))return false;
    const value=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
    return value?.v===1&&value.u===config.username&&Object.keys(value).length===5&&Number.isSafeInteger(value.iat)&&Number.isSafeInteger(value.exp)&&value.exp-value.iat===LIFETIME&&value.iat<=now+60000&&value.exp>now&&typeof value.nonce==='string'&&/^[A-Za-z0-9_-]{22}$/.test(value.nonce);
  }catch{return false;}
}
function cookieHeader(value,config,{clear=false,name=sessionName(config),lifetime=LIFETIME,embed=hfEmbedding(config)}={}){return name+'='+value+'; Path=/; HttpOnly; SameSite='+(embed?'None':'Lax')+'; Max-Age='+(clear?'0':String(lifetime/1000))+(config.publicOrigin.startsWith('https://')?'; Secure':'')+(embed?'; Partitioned':'')+(clear?'; Expires=Thu, 01 Jan 1970 00:00:00 GMT':'');}
function csrfToken(config,now){const nonce=randomBytes(16).toString('base64url'),payload=Buffer.from(JSON.stringify({v:1,nonce,iat:now,exp:now+CSRF_LIFETIME})).toString('base64url');return {nonce,value:payload+'.'+sessionSignature(payload,config,'login-csrf').toString('base64url')};}
function csrfAuthorized(header,nonce,config,now){
  try{
    const token=readCookie(header,csrfName(config));if(typeof nonce!=='string'||!/^[A-Za-z0-9_-]{22}$/.test(nonce)||!token||token.length>1024||!/^[-A-Za-z0-9_]+\.[-A-Za-z0-9_]{43}$/.test(token))return false;
    const [payload,signature]=token.split('.'),actual=Buffer.from(signature,'base64url'),expected=sessionSignature(payload,config,'login-csrf');if(actual.length!==expected.length||actual.toString('base64url')!==signature||!timingSafeEqual(actual,expected))return false;
    const value=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));return value?.v===1&&Object.keys(value).length===4&&value.nonce===nonce&&Number.isSafeInteger(value.iat)&&Number.isSafeInteger(value.exp)&&value.exp-value.iat===CSRF_LIFETIME&&value.iat<=now+60000&&value.exp>now;
  }catch{return false;}
}
function framePolicy(config){return hfEmbedding(config)?"'self' https://huggingface.co https://hf.co":"'self'";}
function loginLanguage(url){
  const values=url?.searchParams?.getAll('lang')||[];
  return values.length===1&&['en','zh'].includes(values[0])?values[0]:null;
}
function loginRoute(language){return '/_pcr/login'+(language?'?lang='+language:'');}
function loginDestination(language){return '/'+(language?'?lang='+language:'');}
// The app mirrors the page language to a functional pcr-lang cookie (zh|en) so this
// script-free page can follow a saved Chinese choice; an explicit ?lang= still wins.
function loginCookieLanguage(cookie){const match=/(?:^|;\s*)pcr-lang=(zh|en)(?:;|$)/.exec(String(cookie||''));return match?match[1]:null;}
function loginTheme(cookie){return /(?:^|;\s*)pcr-theme=light(?:;|$)/.test(String(cookie||''))?'light':'dark';}
function loginDocument(config,{failed=false,csrfNonce='',language=null,theme='dark',origin=config.publicOrigin}={}){
  const chinese=language==='zh',copy=chinese?{
    title:'PCR · 私人工作台',heading:'私人 PCR 工作台',intro:'请登录后查看数据。',
    failure:'登录信息不正确或页面已过期，请重试。',username:'用户名',password:'密码',submit:'登录',
    newWindow:'在新窗口打开',switchLabel:'English',switchHelp:'切换为英文',switchLanguage:'en',
  }:{
    title:'PCR · Private workspace',heading:'Private PCR workspace',intro:'Sign in to view your workspace.',
    failure:'Sign-in failed or the page expired. Please try again.',username:'Username',password:'Password',submit:'Sign in',
    newWindow:'Open in a new window',switchLabel:'中文',switchHelp:'Switch to Chinese',switchLanguage:'zh',
  };
  const action=loginRoute(language),switchRoute=loginRoute(copy.switchLanguage);
  // Night is the default display mode (theme-mode.js); the app's pcr-theme=light cookie selects day.
  const night=theme!=='light'?'html{color-scheme:dark;color:#e8edf3;background:#0b1118}main{background:#121a24;border-color:#25313f}p{color:#9aa6b5}input{color:#e8edf3;background:#0f1620;border-color:#2e3b4a}button{background:#3f82ec;border-color:#3f82ec}input:focus,button:focus,.lang a:focus{outline-color:#6aa2ff}.error{color:#ff929b}a{color:#7fb0ff}.lang{background:#172130;border-color:#2e3b4a}.lang a{color:#9aa6b5}.lang a:hover{background:#1b2633;color:#e8edf3}.lang span{background:#121a24;color:#e8edf3;box-shadow:0 0 0 1px #2e3b4a}':'';
  return `<!doctype html><html lang="${chinese?'zh-CN':'en'}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${copy.title}</title><style>html{font:16px/1.55 system-ui,sans-serif;color:#182b49;background:#f4f7fc}body{margin:0;padding:2rem 1rem}main{max-width:26rem;margin:2rem auto;background:white;border:1px solid #d8e1ed;border-radius:16px;padding:1.5rem;box-sizing:border-box}h1{font-size:1.5rem;line-height:1.35;margin-top:0}p{color:#536580}label{display:block;margin:1rem 0 .4rem}input,button{font:inherit;box-sizing:border-box;width:100%;padding:.75rem;border:1px solid #b8c7db;border-radius:8px}button{margin-top:1.25rem;color:white;background:#213653;border-color:#213653;cursor:pointer}input:focus,button:focus{outline:3px solid #8bb2eb;outline-offset:2px}.error{color:#a51a35}a{color:#205baf}.lang{display:flex;width:max-content;margin:0 0 1rem auto;gap:2px;padding:3px;border:1px solid #d7dfeb;border-radius:10px;background:#eef2f7}.lang a,.lang span{display:block;min-width:4.25rem;padding:.4rem .75rem;border-radius:7px;font-size:.875rem;line-height:1.2;text-align:center;text-decoration:none;color:#4d5d76}.lang a:hover{background:#e2e8f1;color:#21334f}.lang a:focus{outline:3px solid #8bb2eb;outline-offset:1px}.lang span{background:white;color:#21334f;font-weight:600;box-shadow:0 1px 2px #21334f1f,0 0 0 1px #d2dbe8}${night}</style><main><nav class="lang" aria-label="${chinese?'语言':'Language'}">${chinese?`<a href="${switchRoute}" lang="en" hreflang="en" aria-label="${copy.switchHelp}">${copy.switchLabel}</a><span aria-current="true" lang="zh-CN">中文</span>`:`<span aria-current="true" lang="en">English</span><a href="${switchRoute}" lang="zh-CN" hreflang="zh-CN" aria-label="${copy.switchHelp}">${copy.switchLabel}</a>`}</nav><h1>${copy.heading}</h1><p>${copy.intro}</p>${failed?'<p class="error" role="alert">'+copy.failure+'</p>':''}<form action="${action}" method="post"><input type="hidden" name="csrf" value="${escape(csrfNonce)}"><label for="username">${copy.username}</label><input id="username" name="username" autocomplete="username" maxlength="64" value="${escape(config.username)}" required><label for="password">${copy.password}</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="256" required><button type="submit">${copy.submit}</button></form><p><a href="${escape(origin+action)}" target="_blank" rel="noopener noreferrer">${copy.newWindow}</a></p></main></html>`;
}
export function createCloudGateway(config,{database,publicAccess=false,now=()=>Date.now(),onSecurityEvent=event=>console.warn(JSON.stringify(event))}={}){
  const failures=new Map();
  const publicRefreshPaths=new Set(['/api/refresh','/api/oi-summaries/refresh','/api/cboe/refresh','/api/cboe/history/refresh','/api/market/refresh','/api/gamma-exposure/refresh','/api/max-pain/refresh']);
  const publicHandler=publicAccess?createPublicAccessHandler({database,now,proxy:async request=>{
    const url=new URL(request.url),headers=new Headers(request.headers);
    for(const key of [...headers.keys()])if(['authorization','x-pcr-authorization','cookie','host','connection','content-length','origin','sec-fetch-site','forwarded','x-forwarded-for','x-forwarded-host','x-forwarded-proto'].includes(key)||key.startsWith('oai-')||key.startsWith('x-auth-'))headers.delete(key);
    if(request.headers.get('origin'))headers.set('origin',config.internalOrigin);
    const response=await fetch(config.internalOrigin+url.pathname+url.search,{method:request.method,headers,...(!['GET','HEAD'].includes(request.method)?{body:await request.text()}:{}),redirect:'manual',signal:AbortSignal.timeout(120000)});
    const outgoing=new Headers(response.headers);outgoing.delete('set-cookie');outgoing.set('cache-control','no-store');outgoing.set('referrer-policy','strict-origin-when-cross-origin');outgoing.set('x-content-type-options','nosniff');
    if(!String(outgoing.get('content-security-policy')||'').includes('frame-ancestors'))outgoing.set('content-security-policy',(outgoing.get('content-security-policy')?outgoing.get('content-security-policy')+'; ':'')+'frame-ancestors '+framePolicy(config));
    return new Response(response.body,{status:response.status,headers:outgoing});
  }}):null;
  let diagnosticSince=0,diagnosticCount=0;
  function attempts(ip){const previous=failures.get(ip);if(previous&&now()-previous.since<60000)return previous;if(previous)failures.delete(ip);return {count:0,since:now()};}
  function failAttempt(ip){const value=attempts(ip);value.count++;failures.delete(ip);failures.set(ip,value);while(failures.size>1000)failures.delete(failures.keys().next().value);}
  return http.createServer(async(req,res)=>{
    const finish=(code,message,extra={})=>{res.writeHead(code,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',...extra});res.end(message);};
    // no-referrer makes Chromium serialize a navigation form POST's Origin as
    // null. Preserve the real same-app Origin rather than accepting opaque POSTs.
    const login=(status,failed=false)=>{const csrf=csrfToken(config,now());return finish(status,loginDocument(config,{failed,csrfNonce:csrf.nonce,language:loginLanguage(path)||loginCookieLanguage(req.headers.cookie),theme:loginTheme(req.headers.cookie),origin:requestOrigin(config,req.headers.host)}),{'content-type':'text/html; charset=utf-8','referrer-policy':'strict-origin-when-cross-origin','set-cookie':cookieHeader(csrf.value,config,{name:csrfName(config),lifetime:CSRF_LIFETIME}),'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors "+framePolicy(config)});};
    let path;try{path=new URL(req.url,config.publicOrigin);if(path.origin!==config.publicOrigin||!req.url.startsWith('/')||req.url.startsWith('//'))throw Error();}catch{return finish(400,'Invalid request.');}
    const safe=['GET','HEAD'].includes(req.method),api=path.pathname.startsWith('/api/'),loginPost=path.pathname==='/_pcr/login'&&req.method==='POST',origin=req.headers.origin,crossSite=req.headers['sec-fetch-site']==='cross-site',trustedParent=hfEmbedding(config)&&HF_PARENTS.has(origin),navigation=safe&&!api&&req.headers['sec-fetch-mode']==='navigate'&&['document','iframe'].includes(req.headers['sec-fetch-dest']);
    const documentRequest=safe&&!api&&(path.pathname==='/'||path.pathname.endsWith('.html')||path.pathname==='/_pcr/login'||['document','iframe'].includes(req.headers['sec-fetch-dest'])||req.headers.accept?.includes('text/html'));
    const compatibleLogin=hfEmbedding(config)&&loginPost&&(trustedParent||appOrigin(config,origin)&&crossSite);
    const diagnostic=reason=>{
      if(now()-diagnosticSince>=60000){diagnosticSince=now();diagnosticCount=0;}if(diagnosticCount++>=30)return;
      const event={event:'PCR_CLOUD_ORIGIN_DENIED',reason,method:['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].includes(req.method)?req.method:'OTHER',route:loginPost||path.pathname==='/_pcr/login'?'login':path.pathname==='/_pcr/logout'?'logout':api?'api':'document',originPresent:Boolean(origin),originMatchesApp:appOrigin(config,origin),originTrustedHfParent:trustedParent,originOpaque:origin==='null',fetchCrossSite:crossSite,fetchModeNavigate:req.headers['sec-fetch-mode']==='navigate',fetchDestFrame:['iframe','document'].includes(req.headers['sec-fetch-dest'])};
      try{onSecurityEvent(event);}catch{}
    };
    if(origin&&!appOrigin(config,origin)&&!(trustedParent&&navigation)&&!compatibleLogin){diagnostic('origin');return finish(403,'Same-origin requests only.');}
    if(crossSite&&(api||!safe)&&!compatibleLogin){diagnostic('fetch_site');return finish(403,'Same-origin requests only.');}
    if(path.pathname==='/_pcr/login'){
      if(['GET','HEAD'].includes(req.method))return login(200);
      if(req.method!=='POST')return finish(405,'Method not allowed.');
      if(!appOrigin(config,req.headers.origin)&&!compatibleLogin){diagnostic('login_origin');return finish(403,'Same-origin requests only.');}
      const ip=req.socket.remoteAddress||'unknown',recent=attempts(ip);
      if(recent.count>=10)return finish(429,'Too many sign-in attempts. Please retry later.',{'retry-after':String(Math.max(1,Math.ceil((60000-(now()-recent.since))/1000)))});
      if(!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(req.headers['content-type']||'')||Number(req.headers['content-length']||0)>2048){failAttempt(ip);return finish(400,'Invalid sign-in request.');}
      try{
        let length=0;const chunks=[];for await(const chunk of req){length+=chunk.length;if(length>2048){failAttempt(ip);return finish(413,'Request too large.');}chunks.push(chunk);}
        const values=new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
        const valid=[...values.keys()].every(key=>['username','password','csrf'].includes(key))&&values.getAll('csrf').length<=1&&values.getAll('username').length===1&&values.getAll('password').length===1&&values.get('username').length<=64&&values.get('password').length<=256;
        if(compatibleLogin&&(!valid||!csrfAuthorized(req.headers.cookie,values.get('csrf'),config,now()))){diagnostic('login_csrf');return login(403,true);}
        const supplied=valid?Buffer.from(values.get('username')+':'+values.get('password')).toString('base64'):'';
        if(!valid||!cloudAuthorized('Basic '+supplied,config)){failAttempt(ip);return login(401,true);}
        failures.delete(ip);return finish(303,'Signed in.',{location:loginDestination(loginLanguage(path)), 'set-cookie':[cookieHeader(sessionToken(config,now()),config),cookieHeader('',config,{name:csrfName(config),clear:true})]});
      }catch{failAttempt(ip);return finish(400,'Invalid sign-in request.');}
    }
    if(path.pathname==='/_pcr/logout'){
      if(req.method!=='POST')return finish(405,'Method not allowed.');
      if(!appOrigin(config,req.headers.origin)){diagnostic('logout_origin');return finish(403,'Same-origin requests only.');}
      return finish(303,'Signed out.',{location:'/_pcr/login','set-cookie':[cookieHeader('',config,{clear:true}),...(hfEmbedding(config)?[cookieHeader('',config,{name:COOKIE,clear:true,embed:false})]:[])]});
    }
    // HF uses Authorization: Bearer for private Space access. App credentials
    // use an independent header or the signed browser cookie instead.
    const authenticated=cloudAuthorized(req.headers['x-pcr-authorization'],config)||cloudAuthorized(req.headers.authorization,config)||sessionAuthorized(req.headers.cookie,config,now());
    if(path.pathname==='/api/access'&&req.method==='GET'&&![...path.searchParams].length)return finish(200,JSON.stringify({authenticated,publicReadOnly:publicAccess&&!authenticated,canRefresh:publicAccess||authenticated}),{'content-type':'application/json; charset=utf-8'});
    if(!authenticated&&publicHandler){
      try{
        let body='';if(req.method==='POST'&&publicRefreshPaths.has(path.pathname)){if(Number(req.headers['content-length']||0)>2048)return finish(413,'Request too large.');const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>2048)return finish(413,'Request too large.');chunks.push(chunk);}body=Buffer.concat(chunks).toString('utf8');}
        const request=new Request(path,{method:req.method,headers:new Headers(req.headers),...(!safe?{body}: {})});
        const response=await publicHandler(request);
        if(response){res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
      }catch{return finish(502,'Public PCR data is temporarily unavailable.');}
    }
    if(!authenticated){if(api)return finish(401,JSON.stringify({error:'AUTH_REQUIRED'}),{'content-type':'application/json; charset=utf-8'});return documentRequest?login(401):finish(401,'Sign in to continue.');}
    // Desktop access, local OAuth registration and Windows-only private jobs
    // have no route from the internet. Quote-only cloud endpoints remain.
    if(path.pathname.startsWith('/api/providers/moomoo/')||/oauth|connect|credential/i.test(path.pathname))return finish(403,'This operation is not exposed by the cloud workspace.');
    let length=0;const chunks=[];
    try{
      for await(const chunk of req){length+=chunk.length;if(length>1048576)return finish(413,'Request too large.');chunks.push(chunk);}
      const headers={};for(const [key,value]of Object.entries(req.headers))if(!['authorization','x-pcr-authorization','cookie','host','connection','content-length','origin','sec-fetch-site','forwarded','x-forwarded-for','x-forwarded-host','x-forwarded-proto'].includes(key)&&!key.startsWith('oai-')&&!key.startsWith('x-auth-'))headers[key]=value;
      headers.host='127.0.0.1:'+config.internalPort;
      if(req.headers.origin)headers.origin=config.internalOrigin;
      const body=Buffer.concat(chunks);headers['content-length']=String(body.length);
      const upstream=http.request(config.internalOrigin+path.pathname+path.search,{method:req.method,headers,timeout:120000},response=>{
        const responseHeaders={...response.headers,'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'};
        if(!String(responseHeaders['content-security-policy']||'').includes('frame-ancestors'))responseHeaders['content-security-policy']=(responseHeaders['content-security-policy']?responseHeaders['content-security-policy']+'; ':'')+'frame-ancestors '+framePolicy(config);
        delete responseHeaders['set-cookie'];res.writeHead(response.statusCode,responseHeaders);response.pipe(res);
      });
      upstream.once('timeout',()=>upstream.destroy());upstream.once('error',()=>{if(!res.headersSent)finish(502,'The private backend is unavailable.');else res.end();});upstream.end(body);
    }catch{if(!res.headersSent)finish(502,'The private backend is unavailable.');}
  });
}
