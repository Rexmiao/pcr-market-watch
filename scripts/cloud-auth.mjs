// Quote-only cloud authorization. Bootstrap values are runtime Secrets; only
// authenticated ciphertext is persisted on the private mounted volume.
import {createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {copyFile,lstat,mkdir,open,readFile,realpath,rename,unlink} from 'node:fs/promises';
import {dirname,isAbsolute,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {assertQuoteOnlyScope,bundleFromTokenResponse,MoomooOAuthError,postMoomooOAuth} from './moomoo-webapi-auth.mjs';
import {authorizationHealth,authorizationUnavailable} from './auth-health.mjs';

const AAD=Buffer.from('pcr-moomoo-cloud-oauth:v1');
const TOKEN=/^[A-Za-z0-9._~+\/-]+=*$/;
const MAX_BYTES=65536;
const fields=new Set(['clientId','accessToken','refreshToken','scope','expiresAt','refreshExpiresAt','hasAccountContext']);
const unavailable=()=>new MoomooOAuthError('CREDENTIALS_UNAVAILABLE','The encrypted cloud quote authorization could not be accessed.');
const wait=ms=>new Promise(accept=>setTimeout(accept,ms));
function keyFrom(value){if(typeof value!=='string'||!/^[a-fA-F0-9]{64}$/.test(value))throw unavailable();return Buffer.from(value,'hex');}
function safeBundle(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!fields.has(key)))throw unavailable();
  assertQuoteOnlyScope(value.scope);
  if(typeof value.clientId!=='string'||!/^[A-Za-z0-9._-]{1,256}$/.test(value.clientId)||![value.accessToken,value.refreshToken].every(v=>typeof v==='string'&&v.length>0&&v.length<=8192&&TOKEN.test(v))||!Number.isFinite(value.expiresAt)||value.expiresAt<=0||value.refreshExpiresAt!==undefined&&(!Number.isFinite(value.refreshExpiresAt)||value.refreshExpiresAt<=0))throw unavailable();
  return {clientId:value.clientId,accessToken:value.accessToken,refreshToken:value.refreshToken,scope:'quote:read',expiresAt:value.expiresAt,hasAccountContext:value.hasAccountContext===true,...(value.refreshExpiresAt!==undefined?{refreshExpiresAt:value.refreshExpiresAt}:{})};
}
function bootstrap(env){
  if(env.MOOMOO_WEBAPI_OAUTH_ENCRYPTED_JSON!==undefined){
    if(typeof env.MOOMOO_WEBAPI_OAUTH_ENCRYPTED_JSON!=='string'||!env.MOOMOO_WEBAPI_OAUTH_ENCRYPTED_JSON||Buffer.byteLength(env.MOOMOO_WEBAPI_OAUTH_ENCRYPTED_JSON)>MAX_BYTES)throw unavailable();
    return decode(env.MOOMOO_WEBAPI_OAUTH_ENCRYPTED_JSON,keyFrom(env.PCR_CLOUD_AUTH_KEY));
  }
  if(typeof env.MOOMOO_WEBAPI_OAUTH_JSON!=='string'||!env.MOOMOO_WEBAPI_OAUTH_JSON||Buffer.byteLength(env.MOOMOO_WEBAPI_OAUTH_JSON)>32768)return null;
  try{return safeBundle(JSON.parse(env.MOOMOO_WEBAPI_OAUTH_JSON));}catch(error){if(error instanceof MoomooOAuthError&&error.code==='NO_PERMISSION')throw error;throw unavailable();}
}
function config(env){
  const key=keyFrom(env.PCR_CLOUD_AUTH_KEY),file=env.PCR_CLOUD_AUTH_FILE;
  if(typeof file!=='string'||!isAbsolute(file)||file.length>4096)throw unavailable();
  const lockFile=env.PCR_CLOUD_AUTH_LOCK_FILE||join(dirname(env.PCR_DB_PATH||join(tmpdir(),'pcr-runtime','pcr.sqlite3')),'moomoo-cloud-auth.lock');
  if(!isAbsolute(lockFile)||resolve(file)===resolve(lockFile)||dirname(resolve(file))===dirname(resolve(lockFile)))throw unavailable();
  return {key,file:resolve(file),lockFile:resolve(lockFile)};
}
function encode(bundle,key){
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(AAD);
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(safeBundle(bundle)),'utf8'),cipher.final()]);
  return JSON.stringify({schemaVersion:1,algorithm:'aes-256-gcm',nonce:nonce.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),ciphertext:ciphertext.toString('base64url')})+'\n';
}
export function encryptCloudBootstrap(bundle,keyHex){return encode(bundle,keyFrom(keyHex));}
function decode(text,key){
  try{
    if(Buffer.byteLength(text)>MAX_BYTES)throw Error();const value=JSON.parse(text);
    if(value?.schemaVersion!==1||value.algorithm!=='aes-256-gcm'||Object.keys(value).some(key=>!['schemaVersion','algorithm','nonce','tag','ciphertext'].includes(key))||!['nonce','tag','ciphertext'].every(key=>typeof value[key]==='string'&&/^[A-Za-z0-9_-]+$/.test(value[key])))throw Error();
    const nonce=Buffer.from(value.nonce,'base64url'),tag=Buffer.from(value.tag,'base64url'),ciphertext=Buffer.from(value.ciphertext,'base64url');
    if(nonce.length!==12||tag.length!==16||ciphertext.length<2||ciphertext.length>32768)throw Error();
    const decipher=createDecipheriv('aes-256-gcm',key,nonce);decipher.setAAD(AAD);decipher.setAuthTag(tag);
    const plain=Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8');return safeBundle(JSON.parse(plain));
  }catch{throw unavailable();}
}
async function safeRead(file,key){
  try{const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size<1||info.size>MAX_BYTES||resolve(await realpath(file))!==file)throw unavailable();return decode(await readFile(file,'utf8'),key);}
  catch(error){if(error.code==='ENOENT')return null;throw unavailable();}
}
async function safeParent(directory){await mkdir(directory,{recursive:true,mode:0o700});const info=await lstat(directory);if(!info.isDirectory()||info.isSymbolicLink()||resolve(await realpath(directory))!==resolve(directory))throw unavailable();}
export function createEncryptedCloudBundleStore({env=process.env}={}){
  const ready=()=>{try{const {file}=config(env);return Boolean(bootstrap(env)||existsSync(file));}catch{return false;}};
  async function readBundle(){
    const {file,key}=config(env);let current;
    try{current=await safeRead(file,key);}catch{const previous=await safeRead(file+'.previous',key);if(previous)return previous;throw unavailable();}
    if(current)return current;
    const previous=await safeRead(file+'.previous',key);if(previous)return previous;
    return bootstrap(env);
  }
  async function saveBundle(value){
    const {file,key}=config(env),body=encode(value,key),temp=file+'.'+randomUUID()+'.tmp';let created=false;
    try{
      await safeParent(dirname(file));
      const handle=await open(temp,'wx',0o600);created=true;
      try{await handle.writeFile(body,'utf8');await handle.sync().catch(error=>{if(!['EINVAL','ENOTSUP','EOPNOTSUPP'].includes(error.code))throw error;});}finally{await handle.close();}
      await safeRead(temp,key);
      const existing=await safeRead(file,key).catch(()=>null);if(existing){const previous=file+'.previous';try{const info=await lstat(previous);if(!info.isFile()||info.isSymbolicLink())throw unavailable();}catch(error){if(error.code!=='ENOENT')throw error;}await copyFile(file,previous);await safeRead(previous,key);}
      await rename(temp,file);created=false;await safeRead(file,key);
    }catch{throw unavailable();}finally{if(created)await unlink(temp).catch(()=>{});}
  }
  return Object.freeze({isConfigured:ready,readBundle,saveBundle});
}
function alive(pid){if(!Number.isSafeInteger(pid)||pid<1)return true;try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}}
async function lock(config,{timeoutMs=30000,now=()=>Date.now()}={}){
  await safeParent(dirname(config.lockFile));
  const started=Date.now(),identity=randomUUID();
  while(true){
    try{
      const handle=await open(config.lockFile,'wx',0o600);await handle.writeFile(JSON.stringify({pid:process.pid,id:identity,createdAt:new Date(now()).toISOString()}));await handle.close();
      return async()=>{try{const value=JSON.parse(await readFile(config.lockFile,'utf8'));if(value.id===identity)await unlink(config.lockFile);}catch{}};
    }catch(error){
      if(error.code!=='EEXIST')throw unavailable();
      try{const info=await lstat(config.lockFile);if(!info.isFile()||info.isSymbolicLink()||info.size>1024)throw unavailable();const value=JSON.parse(await readFile(config.lockFile,'utf8'));if(!alive(value.pid)){const again=JSON.parse(await readFile(config.lockFile,'utf8'));if(again.id===value.id){await unlink(config.lockFile);continue;}}}catch(error){if(error.code==='ENOENT')continue;if(error instanceof MoomooOAuthError)throw error;}
      if(Date.now()-started>=timeoutMs)throw unavailable();await wait(40);
    }
  }
}
export function createCloudMoomooTokenProvider({env=process.env,fetcher,now=()=>Date.now(),timeoutMs=15000,lockTimeoutMs=30000}={}){
  const store=createEncryptedCloudBundleStore({env});let pending=null,lastReturnedToken=null;
  async function getAccessToken({forceRefresh=false}={}){
    if(pending){const active=pending,result=await active.promise;if(!forceRefresh||active.refreshing)return result;return getAccessToken({forceRefresh:true});}
    const active={refreshing:false,promise:null};pending=active;
    active.promise=(async()=>{
      if(!store.isConfigured())throw new MoomooOAuthError('NOT_CONFIGURED','Configure an independent quote-only cloud authorization.');
      let release;
      try{
        release=await lock(config(env),{timeoutMs:lockTimeoutMs,now});let bundle=await store.readBundle();if(!bundle)throw unavailable();
        const anotherProcessRefreshed=forceRefresh&&lastReturnedToken!==null&&lastReturnedToken!==bundle.accessToken;
        if((!forceRefresh||anotherProcessRefreshed)&&bundle.expiresAt>now()+60000){
          // Ensure the first bootstrap is durably encrypted before returning it.
          if(!existsSync(config(env).file))await store.saveBundle(bundle);
          lastReturnedToken=bundle.accessToken;return bundle.accessToken;
        }
        if(bundle.refreshExpiresAt&&bundle.refreshExpiresAt<=now())throw new MoomooOAuthError('AUTH_REQUIRED','The cloud quote authorization must be renewed.',401);
        active.refreshing=true;
        const response=await postMoomooOAuth('/oauth2/token',{grant_type:'refresh_token',refresh_token:bundle.refreshToken,client_id:bundle.clientId},{fetcher,timeoutMs});
        bundle=bundleFromTokenResponse(response,{clientId:bundle.clientId,previous:bundle,now:now()});
        await store.saveBundle(bundle);lastReturnedToken=bundle.accessToken;return bundle.accessToken;
      }catch(error){if(error instanceof MoomooOAuthError)throw error;throw unavailable();}finally{await release?.();}
    })();
    try{return await active.promise;}finally{if(pending===active)pending=null;}
  }
  async function getAuthorizationStatus(){
    try{return authorizationHealth(await store.readBundle(),{now});}catch{return authorizationUnavailable();}
  }
  return Object.freeze({isConfigured:store.isConfigured,getAccessToken,getAuthorizationStatus});
}
