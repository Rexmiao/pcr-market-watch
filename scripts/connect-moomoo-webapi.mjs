import http from 'node:http';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {saveLocalMoomooWebApiBundle} from './local-secrets.mjs';
import {postMoomooOAuth,bundleFromTokenResponse,MoomooOAuthError} from './moomoo-webapi-auth.mjs';

async function openAuthorizationBrowser(url){
  if(process.platform!=='win32')throw new MoomooOAuthError('BROWSER_REQUIRED','Run the local authorization connector on Windows.');
  await new Promise((accept,reject)=>{
    // The helper stays hidden; the browser is deliberately interactive for consent.
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command','Start-Process -FilePath $env:PCR_MOOMOO_AUTHORIZE_URL -ErrorAction Stop'],{windowsHide:true,shell:false,stdio:'ignore',env:{...process.env,PCR_MOOMOO_AUTHORIZE_URL:url}});
    child.on('error',()=>reject(new MoomooOAuthError('BROWSER_REQUIRED','The official moomoo authorization page could not be opened.')));
    child.on('exit',code=>code===0?accept():reject(new MoomooOAuthError('BROWSER_REQUIRED','The official moomoo authorization page could not be opened.')));
  });
}
const document=(complete,failed)=>`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PCR Market Watch · moomoo</title><body><h1>${failed?'授权未完成':complete?'moomoo 行情授权已保存':'等待 moomoo 行情授权'}</h1><p>${failed?'请回到本地启动窗口重新连接。':complete?'已仅申请 quote:read 行情读取权限。可以关闭本页，返回 PCR 观察台刷新监测。':'请在 moomoo 官方授权页完成确认。'}</p></body></html>`;

export async function connectMoomooWebApi({fetcher,saveBundle=saveLocalMoomooWebApiBundle,openBrowser=openAuthorizationBrowser,onProgress=()=>{},timeoutMs=300000}={}){
  if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>600000)throw new MoomooOAuthError('INVALID_TIMEOUT','Choose a bounded authorization timeout.');
  const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
  let port,redirectUri,clientId,exchanging=false,complete=false,failed=false,timer,closeTimer;
  let acceptCompletion,rejectCompletion;
  const completion=new Promise((accept,reject)=>{acceptCompletion=accept;rejectCompletion=reject;});
  // Attach immediately so an early callback denial cannot cause an unhandled rejection.
  completion.catch(()=>{});
  const server=http.createServer(async(request,response)=>{
    const headers={'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",'x-content-type-options':'nosniff'};
    const send=(status,text)=>{response.writeHead(status,headers);response.end(text);};
    if(request.method!=='GET'||!request.url||request.url.length>8192||request.headers.host!==`127.0.0.1:${port}`){send(400,'Invalid local authorization request.');return;}
    let url;try{url=new URL(request.url,redirectUri);}catch{send(400,'Invalid local authorization request.');return;}
    if(url.origin!==new URL(redirectUri).origin){send(400,'Invalid local authorization request.');return;}
    if(url.pathname==='/done'){send(200,document(complete,failed));return;}
    if(url.pathname!=='/callback'){send(404,'Not found.');return;}
    const received=url.searchParams.get('state')||'';
    if(url.searchParams.getAll('state').length!==1||!/^[A-Za-z0-9_-]{43}$/.test(received)||Buffer.byteLength(received)!==Buffer.byteLength(state)||!timingSafeEqual(Buffer.from(received),Buffer.from(state))){send(400,'Invalid authorization state.');return;}
    if(exchanging||complete||failed){send(409,'This authorization callback has already been handled.');return;}
    exchanging=true;
    try{
      const code=url.searchParams.get('code');
      if(url.searchParams.has('error')||url.searchParams.getAll('code').length!==1||!code||code.length>4096)throw new MoomooOAuthError('AUTH_REQUIRED','The moomoo authorization was not completed.',401);
      onProgress('authorization_callback_received');
      const tokens=await postMoomooOAuth('/oauth2/token',{grant_type:'authorization_code',code,client_id:clientId,redirect_uri:redirectUri,code_verifier:verifier},{fetcher});
      onProgress(Object.hasOwn(tokens,'scope')?'token_response_scope_present':'token_response_scope_missing');
      const bundle=bundleFromTokenResponse(tokens,{clientId,requestedScope:'quote:read'});
      try{await saveBundle(bundle);}catch{throw new MoomooOAuthError('CREDENTIALS_UNAVAILABLE','Windows encrypted credential storage could not save this authorization.');}complete=true;clearTimeout(timer);
      response.writeHead(303,{...headers,location:'/done'});response.end();
      acceptCompletion({configured:true,scope:'quote:read',expiresAt:bundle.expiresAt,storage:'Windows user DPAPI outside the project'});
    }catch(error){
      failed=true;clearTimeout(timer);response.writeHead(303,{...headers,location:'/done'});response.end();
      rejectCompletion(error instanceof MoomooOAuthError?error:new MoomooOAuthError('AUTH_REQUIRED','Moomoo authorization failed. Reconnect using only market-data read permission.',401));
    }
    closeTimer=setTimeout(()=>server.close(),3000);
  });
  server.maxConnections=8;
  await new Promise((accept,reject)=>{server.once('error',()=>reject(new MoomooOAuthError('CALLBACK_UNAVAILABLE','The local moomoo authorization callback could not be started.')));server.listen(0,'127.0.0.1',accept);});
  port=server.address().port;redirectUri=`http://127.0.0.1:${port}/callback`;
  try{
    onProgress('registration_starting');
    const registration=await postMoomooOAuth('/oauth2/register',{redirect_uris:[redirectUri],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code'],client_name:'PCR Market Watch',scope:'quote:read'},{fetcher});
    if(typeof registration.client_id!=='string'||!/^[A-Za-z0-9._-]{1,256}$/.test(registration.client_id))throw new MoomooOAuthError('INVALID_RESPONSE','The moomoo OAuth client registration response was invalid.');
    clientId=registration.client_id;
    onProgress('registration_succeeded');
    const authorize=new URL('https://webapi.moomoo.com/oauth2/authorize/confirm');
    for(const [key,value] of Object.entries({client_id:clientId,code_challenge:challenge,code_challenge_method:'S256',redirect_uri:redirectUri,response_type:'code',state,scope:'quote:read'}))authorize.searchParams.set(key,value);
    timer=setTimeout(()=>{failed=true;rejectCompletion(new MoomooOAuthError('TIMEOUT','Moomoo authorization timed out. Run the connector again.',504));server.close();},timeoutMs);
    await openBrowser(authorize.href);
    onProgress('browser_opened');
    return await completion;
  }catch(error){
    clearTimeout(timer);if(!closeTimer)server.close();
    if(error instanceof MoomooOAuthError)throw error;
    throw new MoomooOAuthError('AUTH_UNAVAILABLE','The moomoo authorization connector could not complete the request.');
  }
}

export async function runMoomooWebApiConnector(){
  if(process.argv.includes('--help')){console.log('Connect PCR Market Watch directly to moomoo using official OAuth PKCE and quote:read only. Tokens are encrypted in Windows user storage; no desktop AppKey or moomoo desktop process is needed.');return;}
  console.log('Opening the official moomoo authorization page. Approve only quote:read market-data access.');
  const stages={registration_starting:'Registering the read-only application with the official moomoo service...',registration_succeeded:'Read-only application registration accepted.',browser_opened:'The official consent page was sent to your default browser. Waiting for quote:read authorization...',authorization_callback_received:'The consent callback was received and its security state verified.',token_response_scope_present:'The token response contains explicit granted scopes; validating quote:read only.',token_response_scope_missing:'The token response omits scope; binding it to this PKCE session\'s explicit quote:read request.'};
  try{console.log(JSON.stringify(await connectMoomooWebApi({onProgress:stage=>{if(Object.hasOwn(stages,stage))console.log(stages[stage]);}})));}catch(error){
    const messages={REGISTRATION_UNAVAILABLE:'The official moomoo service did not accept public-client registration. Confirm WebAPI availability for this region/account.',AUTH_REQUIRED:'Authorization was not completed or has expired. Reconnect with quote:read only.',AUTH_UNAVAILABLE:'The official moomoo authorization service is unavailable.',NO_PERMISSION:'The authorization included permissions beyond quote:read and was rejected.',INVALID_RESPONSE:'The official authorization response did not match the required secure format.',TIMEOUT:'The authorization request timed out. Run the connector again.',BROWSER_REQUIRED:'The official moomoo authorization page could not be opened. Run this connector on Windows with a browser.',CALLBACK_UNAVAILABLE:'The local authorization callback could not be started.',CREDENTIALS_UNAVAILABLE:'Windows encrypted credential storage could not save this authorization.'};
    const code=error instanceof MoomooOAuthError&&Object.hasOwn(messages,error.code)?error.code:'AUTH_UNAVAILABLE';
    const reason=['scope_missing','scope_invalid','scope_unapproved'].includes(error?.reason)?` (${error.reason})`:'';
    console.error(`Moomoo WebAPI [${code}]${reason}: ${messages[code]}`);process.exitCode=1;
    if(code==='NO_PERMISSION'&&error.scopeSummary){const summary={};for(const key of ['quoteRead','quoteWrite','tradeRead','tradeWrite','accountSelector','unknownScope'])summary[key]=error.scopeSummary[key]===true;summary.scopeValueType=['null','string','missing','invalid'].includes(error.scopeSummary.scopeValueType)?error.scopeSummary.scopeValueType:'invalid';console.error('Granted-scope checks (booleans and type only): '+JSON.stringify(summary));}
  }
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))await runMoomooWebApiConnector();
