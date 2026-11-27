// Node-side OAuth storage/refresh. Tokens remain in memory or Windows DPAPI;
// the Worker-compatible market-data client receives only this token provider.
import {readLocalMoomooWebApiBundle,saveLocalMoomooWebApiBundle,hasLocalMoomooWebApiCredentials} from './local-secrets.mjs';

export class MoomooOAuthError extends Error{
  constructor(code,message,status=503){super(message);this.name='MoomooOAuthError';this.code=code;this.status=status;}
}
const token=v=>typeof v==='string'&&v.length>0&&v.length<=8192&&/^[A-Za-z0-9._~+\/-]+=*$/.test(v);
export function assertQuoteOnlyScope(scope){
  const granted=typeof scope==='string'?scope.trim().split(/\s+/).filter(Boolean):[];
  // moomoo includes an account context selector alongside capability scopes.
  // It does not grant account/position access (which requires trade:read).
  // Retain only the quote:read capability; never retain selector identifiers.
  if(typeof scope!=='string'||scope.length>4096||granted.filter(v=>v==='quote:read').length!==1||!granted.every(v=>v==='quote:read'||/^accid:(?:\*|\d{1,32})$/.test(v))){
    const error=new MoomooOAuthError('NO_PERMISSION','Authorize only the moomoo quote:read permission. Account and trading permissions are not accepted.',403);
    error.reason=scope===undefined?'scope_missing':typeof scope!=='string'?'scope_invalid':'scope_unapproved';
    const scopes=typeof scope==='string'?scope.trim().split(/\s+/).filter(Boolean):[];
    // Fixed booleans aid consent diagnostics without exposing account selectors
    // or any other raw scope value supplied by the authorization service.
    error.scopeSummary={quoteRead:scopes.includes('quote:read'),quoteWrite:scopes.includes('quote:write'),tradeRead:scopes.includes('trade:read'),tradeWrite:scopes.includes('trade:write'),accountSelector:scopes.some(v=>v.startsWith('accid:')),unknownScope:scopes.some(v=>!['quote:read','quote:write','trade:read','trade:write'].includes(v)&&!v.startsWith('accid:')),scopeValueType:scope===null?'null':typeof scope==='string'?'string':scope===undefined?'missing':'invalid'};throw error;
  }
  return 'quote:read';
}
export async function postMoomooOAuth(path,body,{fetcher=(...args)=>fetch(...args),timeoutMs=15000}={}){
  if(!['/oauth2/register','/oauth2/token'].includes(path))throw new MoomooOAuthError('COMMAND_BLOCKED','This authorization operation is not permitted.',403);
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw new MoomooOAuthError('INVALID_TIMEOUT','Choose a bounded authorization request timeout.');
  const registration=path==='/oauth2/register',controller=new AbortController();let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new MoomooOAuthError('TIMEOUT','The moomoo authorization request timed out.',504));},timeoutMs);});
  const operation=(async()=>{
    const response=await fetcher('https://webapi.moomoo.com'+path,{method:'POST',headers:{accept:'application/json','content-type':registration?'application/json':'application/x-www-form-urlencoded'},body:registration?JSON.stringify(body):new URLSearchParams(body).toString(),redirect:'manual',signal:controller.signal});
    if(response.url&&new URL(response.url).origin!=='https://webapi.moomoo.com')throw new MoomooOAuthError('AUTH_UNAVAILABLE','Redirected moomoo authorization responses are not accepted.');
    if(response.status<200||response.status>=300)throw new MoomooOAuthError(registration?'REGISTRATION_UNAVAILABLE':response.status===401||response.status===400?'AUTH_REQUIRED':'AUTH_UNAVAILABLE','Moomoo authorization could not be completed. Reconnect with quote:read permission.',response.status===401||response.status===400?401:503);
    if(Number(response.headers.get('content-length')||0)>65536)throw new MoomooOAuthError('INVALID_RESPONSE','The moomoo authorization response is invalid.');
    const reader=response.body?.getReader();let data;
    if(reader){let count=0;const chunks=[];while(true){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>65536){await reader.cancel();throw new MoomooOAuthError('INVALID_RESPONSE','The moomoo authorization response is invalid.');}chunks.push(value);}const bytes=new Uint8Array(count);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.byteLength;}try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new MoomooOAuthError('INVALID_RESPONSE','The moomoo authorization response is invalid.');}}
    else{const text=await response.text();if(text.length>65536)throw new MoomooOAuthError('INVALID_RESPONSE','The moomoo authorization response is invalid.');try{data=JSON.parse(text);}catch{throw new MoomooOAuthError('INVALID_RESPONSE','The moomoo authorization response is invalid.');}}
    if(!data||typeof data!=='object'||Array.isArray(data)||data.error)throw new MoomooOAuthError('AUTH_REQUIRED','Moomoo authorization needs to be renewed.',401);
    return data;
  })();
  try{return await Promise.race([operation,timeout]);}catch(error){if(error instanceof MoomooOAuthError)throw error;throw new MoomooOAuthError('AUTH_UNAVAILABLE','The moomoo authorization service is unavailable.');}finally{clearTimeout(timer);}
}
export function bundleFromTokenResponse(response,{clientId,previous,requestedScope,now=Date.now()}={}){
  // RFC 6749 section 5.1 permits scope to be omitted only when unchanged from
  // the authorization request. The initial connector explicitly binds its
  // quote:read request; unrelated callers receive no implicit permission.
  const scope=assertQuoteOnlyScope(Object.hasOwn(response,'scope')?response.scope:previous?.scope??requestedScope);
  const hasAccountContext=Object.hasOwn(response,'scope')?response.scope.trim().split(/\s+/).some(v=>v.startsWith('accid:')):previous?.hasAccountContext===true;
  const refreshToken=response.refresh_token??previous?.refreshToken;
  if(response.token_type?.toLowerCase()!=='bearer'||!token(response.access_token)||!token(refreshToken)||typeof clientId!=='string'||!/^[A-Za-z0-9._-]{1,256}$/.test(clientId)||!Number.isInteger(response.expires_in)||response.expires_in<1||response.expires_in>86400)throw new MoomooOAuthError('INVALID_RESPONSE','The moomoo authorization response is invalid.');
  return {clientId,accessToken:response.access_token,refreshToken,scope,hasAccountContext,expiresAt:now+response.expires_in*1000,...(previous?.refreshExpiresAt?{refreshExpiresAt:previous.refreshExpiresAt}:{})};
}
export function createLocalMoomooWebApiTokenProvider({readBundle=readLocalMoomooWebApiBundle,saveBundle=saveLocalMoomooWebApiBundle,hasCredentials=hasLocalMoomooWebApiCredentials,fetcher,now=()=>Date.now(),timeoutMs=15000}={}){
  let pending=null;
  const isConfigured=()=>{try{return Boolean(hasCredentials());}catch{return false;}};
  async function getAccessToken({forceRefresh=false}={}){
    if(pending){
      const current=pending,result=await current.promise;
      // A 401 may arrive while another query is only reading an unexpired
      // token. Do not mistake that read for the required forced refresh.
      if(!forceRefresh||current.refreshing)return result;
      return getAccessToken({forceRefresh:true});
    }
    const current={refreshing:false,promise:null};pending=current;
    current.promise=(async()=>{
      let bundle;try{bundle=await readBundle();}catch{throw new MoomooOAuthError('CREDENTIALS_UNAVAILABLE','The encrypted moomoo WebAPI authorization could not be loaded.');}
      if(!bundle)throw new MoomooOAuthError('NOT_CONFIGURED','Connect moomoo WebAPI with quote:read authorization.',503);
      assertQuoteOnlyScope(bundle.scope);
      if(!forceRefresh&&token(bundle.accessToken)&&bundle.expiresAt>now()+60000)return bundle.accessToken;
      if(!token(bundle.refreshToken)||!bundle.clientId)throw new MoomooOAuthError('AUTH_REQUIRED','Reconnect moomoo WebAPI to renew its authorization.',401);
      current.refreshing=true;
      const response=await postMoomooOAuth('/oauth2/token',{grant_type:'refresh_token',refresh_token:bundle.refreshToken,client_id:bundle.clientId},{fetcher,timeoutMs});
      const refreshed=bundleFromTokenResponse(response,{clientId:bundle.clientId,previous:bundle,now:now()});
      try{await saveBundle(refreshed);}catch{throw new MoomooOAuthError('CREDENTIALS_UNAVAILABLE','The renewed moomoo WebAPI authorization could not be saved securely.');}
      return refreshed.accessToken;
    })();
    try{return await current.promise;}finally{if(pending===current)pending=null;}
  }
  async function getAuthorizationStatus(){
    const {authorizationHealth,authorizationUnavailable}=await import('./auth-health.mjs');
    if(!isConfigured())return authorizationHealth(null,{now});
    try{return authorizationHealth(await readBundle(),{now});}catch{return authorizationUnavailable();}
  }
  return Object.freeze({isConfigured,getAccessToken,getAuthorizationStatus});
}
