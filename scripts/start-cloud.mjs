import {spawn} from 'node:child_process';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {cloudConfig,createCloudGateway} from './cloud-gateway.mjs';
import {backupHfDatabase,restoreHfDatabase,assertHfBackupMounted} from './hf-storage.mjs';
import {createLocalD1} from './local-db.mjs';
import {createRuntimeMoomooAuth} from './runtime-auth.mjs';
import {createMoomooWebApiClient} from '../worker/moomoo-webapi.js';
import {captureDailyOi,ensureOiDailyMonitoring} from './oi-daily.mjs';
import {runStructureDaily,ensureStructureMonitoring} from './structure-archive.mjs';

export const isDatabaseChangedMessage=message=>Boolean(message&&typeof message==='object'&&!Array.isArray(message)&&Object.keys(message).length===1&&message.type==='pcr_database_changed');
export function createCloudBackupQueue({save,delayMs=500,onError=()=>{}}={}){
  if(typeof save!=='function'||!Number.isInteger(delayMs)||delayMs<0||delayMs>60000)throw Error('Invalid backup queue configuration.');
  let dirty=false,pending=null,timer=null,paused=false;
  const cancelTimer=()=>{if(timer!==null)clearTimeout(timer);timer=null;};
  function schedule(){if(paused||pending||timer!==null||!dirty)return;timer=setTimeout(()=>{timer=null;void flush().catch(()=>onError());},delayMs);}
  function notify(){dirty=true;schedule();}
  function flush({force=false}={}){
    if(force)dirty=true;cancelTimer();
    if(pending)return pending.then(()=>dirty?flush():undefined);
    if(!dirty)return Promise.resolve();
    let failed=false;
    pending=(async()=>{
      while(dirty){dirty=false;try{await save();}catch(error){dirty=true;failed=true;throw error;}}
    })().finally(()=>{pending=null;if(!failed)schedule();});
    return pending;
  }
  return {notify,flush,pause(){paused=true;cancelTimer();}};
}

export async function startCloudRuntime(){

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const config=cloudConfig();
process.env.PCR_RUNTIME='cloud';
const databasePath=resolve(process.env.PCR_DB_PATH||'/tmp/pcr-runtime/pcr.sqlite3');
const backupDirectory=process.env.PCR_HF_BACKUP_DIR;
const dailyEnabled=process.env.PCR_OI_DAILY_ENABLED==='1';
const structureEnabled=dailyEnabled&&process.env.PCR_STRUCTURE_DAILY_ENABLED!=='0';
process.env.PCR_STRUCTURE_DAILY_ENABLED=structureEnabled?'1':'0';
if(dailyEnabled&&!backupDirectory)throw Error('Daily cloud archiving requires an attached backup volume.');
const storage={databasePath,backupDirectory,pythonExecutable:process.env.PCR_PYTHON||'python3'};
if(backupDirectory){await assertHfBackupMounted(backupDirectory);await restoreHfDatabase(storage);}
if(process.env.MOOMOO_WEBAPI_OAUTH_ENCRYPTED_JSON||process.env.MOOMOO_WEBAPI_OAUTH_JSON||process.env.PCR_CLOUD_AUTH_KEY){
  const authFile=process.env.PCR_CLOUD_AUTH_FILE;
  if(!authFile||!backupDirectory)throw Error('Cloud quote renewal requires a private attached authorization volume.');
  await assertHfBackupMounted(dirname(resolve(authFile)));
}
const backupQueue=createCloudBackupQueue({save:()=>backupDirectory?backupHfDatabase(storage):Promise.resolve(),onError:()=>console.warn('Private backup needs attention.')});
const backup=()=>backupQueue.flush({force:true});
const database=await createLocalD1({databasePath,onChange:()=>backupQueue.notify()});
await ensureOiDailyMonitoring({database,enabled:dailyEnabled});
await ensureStructureMonitoring({database,enabled:structureEnabled});
await backup();
const child=spawn(process.execPath,[join(root,'scripts/preview.mjs')],{cwd:root,env:{...process.env,PCR_DB_PATH:databasePath,PCR_PREVIEW_PORT:String(config.internalPort)},windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
// Child output deliberately is not forwarded: runtime logs must not accidentally
// become a public source of private request details or provider diagnostics.
child.stdout.resume();child.stderr.resume();
let closing=false,tickPending=null,lastAttempt=0,structurePending=null,lastStructureAttempt=0;
child.on('message',message=>{if(isDatabaseChangedMessage(message))backupQueue.notify();});
const auth=createRuntimeMoomooAuth(),client=createMoomooWebApiClient({accessTokenProvider:auth.getAccessToken,isConfigured:auth.isConfigured});
function tick(){if(closing||tickPending||!dailyEnabled||Date.now()-lastAttempt<15*60000)return;tickPending=(async()=>{try{const result=await captureDailyOi({database,webApiClient:client,mode:'scheduled'});if(!['not_due','already_saved','running','attempts_exhausted','retry_cooldown'].includes(result.status)){lastAttempt=Date.now();await backup();}}catch{console.warn('Daily OI capture or private backup needs attention.');}finally{tickPending=null;}})();return tickPending;}
function structureTick(){if(closing||structurePending||!structureEnabled||Date.now()-lastStructureAttempt<15*60000)return;structurePending=(async()=>{try{const result=await runStructureDaily({database,webApiClient:client,mode:'scheduled'});if(!['not_due','already_saved','running','busy','attempts_exhausted','retry_cooldown'].includes(result.status)){lastStructureAttempt=Date.now();await backup();}}catch{console.warn('Daily option structure capture or private backup needs attention.');}finally{structurePending=null;}})();return structurePending;}
const gateway=createCloudGateway(config,{database,publicAccess:process.env.PCR_PUBLIC_VIEW==='1'});
await new Promise((accept,reject)=>{gateway.once('error',reject);gateway.listen(config.port,'0.0.0.0',accept);});
const scheduleTimer=setInterval(()=>{void tick();void structureTick();},60000),backupTimer=setInterval(()=>void backup().catch(()=>console.warn('Private backup needs attention.')),60*60000);
async function close(code=0){
  if(closing)return;closing=true;clearInterval(scheduleTimer);clearInterval(backupTimer);gateway.close();backupQueue.pause();
  if(tickPending)await tickPending.catch(()=>{});
  if(structurePending)await structurePending.catch(()=>{});
  if(child.exitCode===null&&child.signalCode===null){
    await new Promise(accept=>{
      const timer=setTimeout(()=>{child.kill('SIGKILL');},5000);child.once('exit',()=>{clearTimeout(timer);accept();});
      try{if(child.connected)child.send({type:'pcr_shutdown'});else child.kill();}catch{child.kill();}
    });
  }
  try{await backup();}catch{console.warn('Final private backup could not be completed.');}
  process.exit(code);
}
child.on('exit',()=>{if(!closing)void close(1);});
process.on('SIGTERM',()=>void close());process.on('SIGINT',()=>void close());
console.log('Private PCR cloud gateway is ready.');
void tick();
void structureTick();
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await startCloudRuntime();
