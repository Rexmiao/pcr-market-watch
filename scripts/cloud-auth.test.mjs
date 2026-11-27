import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,copyFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createCloudMoomooTokenProvider,createEncryptedCloudBundleStore,encryptCloudBootstrap} from './cloud-auth.mjs';
import {createRuntimeMoomooAuth} from './runtime-auth.mjs';
const exec=promisify(execFile);
const clock=Date.parse('2026-11-26T12:00:00Z');
function initial(expiresAt=clock+7200000){return {clientId:'test-cloud-client',accessToken:'unit-initial-access',refreshToken:'unit-cloud-refresh',scope:'quote:read',expiresAt};}
async function setup(){const directory=await mkdtemp(join(tmpdir(),'pcr-cloud-oauth-')),env={PCR_RUNTIME:'cloud',PCR_CLOUD_AUTH_KEY:'ab'.repeat(32),PCR_CLOUD_AUTH_FILE:join(directory,'私有云凭证','行情.enc.json'),PCR_CLOUD_AUTH_LOCK_FILE:join(directory,'local-runtime','moomoo.lock'),MOOMOO_WEBAPI_OAUTH_JSON:JSON.stringify(initial())};return {directory,env};}
function tokenResponse(access='unit-refreshed-access',scope='quote:read'){return new Response(JSON.stringify({access_token:access,token_type:'Bearer',expires_in:7200,scope}),{status:200,headers:{'content-type':'application/json'}});}
test('cloud bootstrap persists only authenticated ciphertext, including Unicode paths and independent restart',async()=>{
  const {env}=await setup();let calls=0;
  const provider=createRuntimeMoomooAuth({env,now:()=>clock,fetcher:async()=>{calls++;throw Error();}});
  assert(provider.isConfigured());assert.equal(await provider.getAccessToken(),'unit-initial-access');assert.equal(calls,0);
  const text=await readFile(env.PCR_CLOUD_AUTH_FILE,'utf8');for(const secret of ['unit-initial-access','unit-cloud-refresh','test-cloud-client','quote:read'])assert(!text.includes(secret));
  const disk=JSON.parse(text);assert.equal(disk.algorithm,'aes-256-gcm');assert.equal(Buffer.from(disk.nonce,'base64url').length,12);assert.equal(Buffer.from(disk.tag,'base64url').length,16);
  delete env.MOOMOO_WEBAPI_OAUTH_JSON;
  assert.equal(await createCloudMoomooTokenProvider({env,now:()=>clock}).getAccessToken(),'unit-initial-access');
});
test('new deployments can bootstrap with encrypted runtime Secrets without any raw token environment value',async()=>{
  const {env}=await setup();delete env.MOOMOO_WEBAPI_OAUTH_JSON;
  env.MOOMOO_WEBAPI_OAUTH_ENCRYPTED_JSON=encryptCloudBootstrap(initial(),env.PCR_CLOUD_AUTH_KEY);
  for(const secret of ['unit-initial-access','unit-cloud-refresh','test-cloud-client'])assert(!JSON.stringify(env).includes(secret));
  const auth=createRuntimeMoomooAuth({env,now:()=>clock});assert(auth.isConfigured());assert.equal(await auth.getAccessToken(),'unit-initial-access');
  delete env.MOOMOO_WEBAPI_OAUTH_ENCRYPTED_JSON;
  assert.equal(await createCloudMoomooTokenProvider({env,now:()=>clock}).getAccessToken(),'unit-initial-access');
});
test('concurrent providers refresh once, persist original refresh token and skip stale-token forced refresh',async()=>{
  const {env}=await setup();let current=clock,calls=0;
  const fetcher=async(url,options)=>{calls++;assert.equal(url,'https://webapi.moomoo.com/oauth2/token');const input=new URLSearchParams(options.body);assert.equal(input.get('grant_type'),'refresh_token');assert.equal(input.get('client_id'),'test-cloud-client');assert.equal(input.get('refresh_token'),'unit-cloud-refresh');await new Promise(accept=>setTimeout(accept,70));return tokenResponse('unit-refreshed-'+calls);};
  const a=createCloudMoomooTokenProvider({env,now:()=>current,fetcher}),b=createCloudMoomooTokenProvider({env,now:()=>current,fetcher});
  await a.getAccessToken();await b.getAccessToken();current+=7200000;
  assert.deepEqual(await Promise.all([a.getAccessToken(),a.getAccessToken(),b.getAccessToken()]),['unit-refreshed-1','unit-refreshed-1','unit-refreshed-1']);assert.equal(calls,1);
  await a.getAccessToken({forceRefresh:true});assert.equal(calls,2);
  assert.equal(await b.getAccessToken({forceRefresh:true}),'unit-refreshed-2');assert.equal(calls,2,'A 401 for a previously issued token uses the newer persisted token.');
  const saved=await createEncryptedCloudBundleStore({env}).readBundle();assert.equal(saved.refreshToken,'unit-cloud-refresh');
});
test('different OS processes serialize expired-token refresh using the local lock file',async()=>{
  const {directory,env}=await setup();await createEncryptedCloudBundleStore({env}).saveBundle(initial(clock-1000));
  const counter=join(directory,'refresh-count.txt');await writeFile(counter,'0');
  const script=`import {readFile,writeFile} from 'node:fs/promises';import {createCloudMoomooTokenProvider} from ${JSON.stringify(new URL('./cloud-auth.mjs',import.meta.url).href)};const auth=createCloudMoomooTokenProvider({now:()=>${clock},fetcher:async()=>{const path=process.env.UNIT_COUNTER;const count=Number(await readFile(path,'utf8'))+1;await new Promise(resolve=>setTimeout(resolve,80));await writeFile(path,String(count));return new Response(JSON.stringify({access_token:'unit-cross-process',token_type:'Bearer',expires_in:7200,scope:'quote:read'}),{status:200});}});await auth.getAccessToken();console.log('ok');`;
  const options={env:{...process.env,...env,UNIT_COUNTER:counter},windowsHide:true,timeout:20000};
  const results=await Promise.all([exec(process.execPath,['--input-type=module','-e',script],options),exec(process.execPath,['--input-type=module','-e',script],options)]);
  assert(results.every(value=>value.stdout.trim()==='ok'));assert.equal(await readFile(counter,'utf8'),'1');
});
test('tampering, wrong keys, unsafe files and broadened permissions fail without disclosing credentials',async()=>{
  const {env}=await setup(),store=createEncryptedCloudBundleStore({env});await store.saveBundle(initial());
  const body=JSON.parse(await readFile(env.PCR_CLOUD_AUTH_FILE,'utf8'));body.tag='a'.repeat(22);await writeFile(env.PCR_CLOUD_AUTH_FILE,JSON.stringify(body));
  await assert.rejects(store.readBundle(),error=>error.code==='CREDENTIALS_UNAVAILABLE'&&!error.message.includes('unit-')&&!error.message.includes(env.PCR_CLOUD_AUTH_FILE));
  await assert.rejects(createCloudMoomooTokenProvider({env:{...env,PCR_CLOUD_AUTH_KEY:'cd'.repeat(32)},now:()=>clock}).getAccessToken(),{code:'CREDENTIALS_UNAVAILABLE'});
  const changed=await setup();changed.env.MOOMOO_WEBAPI_OAUTH_JSON=JSON.stringify({...initial(),scope:'quote:read trade:read'});
  assert(!createCloudMoomooTokenProvider({env:changed.env}).isConfigured());
  await assert.rejects(createCloudMoomooTokenProvider({env:changed.env}).getAccessToken(),{code:'NOT_CONFIGURED'});
});
test('known refresh expiry requires new consent; safe provider failures retain encrypted prior state',async()=>{
  const {env}=await setup();env.MOOMOO_WEBAPI_OAUTH_JSON=JSON.stringify({...initial(clock-1000),refreshExpiresAt:clock-1});let calls=0;
  const auth=createCloudMoomooTokenProvider({env,now:()=>clock,fetcher:async()=>{calls++;return tokenResponse();}});
  await assert.rejects(auth.getAccessToken(),{code:'AUTH_REQUIRED'});assert.equal(calls,0);
  const other=await setup(),store=createEncryptedCloudBundleStore({env:other.env});await store.saveBundle(initial(clock-1000));const before=await readFile(other.env.PCR_CLOUD_AUTH_FILE,'utf8');
  const provider=createCloudMoomooTokenProvider({env:other.env,now:()=>clock,fetcher:async()=>{throw Error('unit-secret-do-not-print');}});
  await assert.rejects(provider.getAccessToken(),error=>error.code==='AUTH_UNAVAILABLE'&&!error.message.includes('unit-secret'));assert.equal(await readFile(other.env.PCR_CLOUD_AUTH_FILE,'utf8'),before);
});
test('encrypted previous version is readable after an incomplete current write; live lock is never stolen',async()=>{
  const {env}=await setup(),store=createEncryptedCloudBundleStore({env});await store.saveBundle(initial());await store.saveBundle({...initial(),accessToken:'unit-newer'});
  await writeFile(env.PCR_CLOUD_AUTH_FILE,'incomplete');assert.equal((await store.readBundle()).accessToken,'unit-initial-access');
  await mkdir(join(env.PCR_CLOUD_AUTH_LOCK_FILE,'..'),{recursive:true});await writeFile(env.PCR_CLOUD_AUTH_LOCK_FILE,JSON.stringify({pid:process.pid,id:'live-owner'}));
  const auth=createCloudMoomooTokenProvider({env,now:()=>clock,lockTimeoutMs:100});await assert.rejects(auth.getAccessToken(),{code:'CREDENTIALS_UNAVAILABLE'});assert((await lstat(env.PCR_CLOUD_AUTH_LOCK_FILE)).isFile());
});
