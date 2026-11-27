// Cloud credentials are runtime Secrets only; Windows DPAPI stays local.
import {createLocalMoomooWebApiTokenProvider,MoomooOAuthError} from './moomoo-webapi-auth.mjs';
import {createCloudMoomooTokenProvider} from './cloud-auth.mjs';
import {authorizationHealth} from './auth-health.mjs';
const TOKEN=/^[A-Za-z0-9._~+\/-]+=*$/;
export function createRuntimeMoomooAuth({env=process.env,now=()=>Date.now(),fetcher}={}){
  if(env.PCR_RUNTIME!=='cloud')return createLocalMoomooWebApiTokenProvider();
  if(env.MOOMOO_WEBAPI_OAUTH_ENCRYPTED_JSON||env.MOOMOO_WEBAPI_OAUTH_JSON||env.PCR_CLOUD_AUTH_KEY||env.PCR_CLOUD_AUTH_FILE)return createCloudMoomooTokenProvider({env,now,fetcher});
  const valid=()=>typeof env.MOOMOO_WEBAPI_ACCESS_TOKEN==='string'&&env.MOOMOO_WEBAPI_ACCESS_TOKEN.length<=8192&&TOKEN.test(env.MOOMOO_WEBAPI_ACCESS_TOKEN)&&env.MOOMOO_WEBAPI_SCOPE==='quote:read';
  return Object.freeze({isConfigured:()=>valid(),async getAuthorizationStatus(){return authorizationHealth(valid()?{scope:'quote:read',expiresAt:Date.parse(env.MOOMOO_WEBAPI_EXPIRES_AT||'')}:null,{now,renewable:false});},async getAccessToken({forceRefresh=false}={}){
    if(!valid())throw new MoomooOAuthError('NOT_CONFIGURED','Configure quote-only runtime Secrets.');
    const expires=Date.parse(env.MOOMOO_WEBAPI_EXPIRES_AT||'');
    if(forceRefresh||!Number.isFinite(expires)||expires<=now()+60000)throw new MoomooOAuthError('AUTH_REQUIRED','Renew the cloud quote-only authorization.',401);
    return env.MOOMOO_WEBAPI_ACCESS_TOKEN;
  }});
}
