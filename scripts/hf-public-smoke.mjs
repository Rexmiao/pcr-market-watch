// Optional complete-container check, using a temporary owner password only.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const docker=process.env.PCR_DOCKER||'docker',container='pcr-public-smoke-'+randomUUID().slice(0,8),password=randomUUID().replaceAll('-','');
const origin='http://127.0.0.1:8797';
const expectedMigrations=JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8')).entries.length;
async function run(args,{env=process.env}={}){return await new Promise((accept,reject)=>{const child=spawn(docker,args,{shell:false,windowsHide:true,env,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',part=>{if(output.length<32768)output+=part;});child.stderr.resume();child.on('error',()=>reject(Error('Docker unavailable.')));child.on('close',code=>code===0?accept(output.trim()):reject(Error('Docker check failed.')));});}
const request=(path,{owner=false,...init}={})=>fetch(origin+path,{...init,headers:{...(owner?{'x-pcr-authorization':'Basic '+Buffer.from('pcr:'+password).toString('base64')}:{}) ,...init.headers},signal:AbortSignal.timeout(20000)});
let attempted=false;
try{
  attempted=true;await run(['run','-d','--name',container,'-p','127.0.0.1:8797:7860','--env','PCR_CLOUD_PASSWORD','--env','PCR_PUBLIC_VIEW=1','--env','PCR_CLOUD_PUBLIC_ORIGIN='+origin,process.env.PCR_HF_IMAGE||'pcr-market-watch-hf:0.2.21'],{env:{...process.env,PCR_CLOUD_PASSWORD:password}});
  let ready=false;for(let i=0;i<30;i++){try{const response=await request('/api/access');if(response.status===200){ready=true;break;}}catch{}await new Promise(accept=>setTimeout(accept,500));}assert(ready);
  assert.deepEqual(await (await request('/api/access')).json(),{authenticated:false,publicReadOnly:true,canRefresh:true});
  const home=await request('/');assert.equal(home.status,200);assert((await home.text()).includes('/public-access.js'));assert.equal((await request('/public-access.js')).status,200);
  let settings=await (await request('/api/watchlist-settings')).json();assert(settings.readOnly&&settings.canRefresh&&settings.items.length===7);
  let owner=await (await request('/api/watchlist-settings',{owner:true})).json();assert.equal(owner.initialized,false,'Public reads never initialize or alter owner preferences.');assert.equal(owner.storage,'cloud');
  const body={revision:0,groups:[{id:'custom_hidden',name:'PRIVATE OWNER CATEGORY'}],items:[{symbol:'AMD',category:'custom_hidden'}]};
  assert.equal((await request('/api/watchlist-settings',{method:'PUT',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)})).status,401);
  assert.equal((await request('/api/watchlist-settings',{owner:true,method:'PUT',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)})).status,200);
  settings=await (await request('/api/watchlist-settings')).json();assert.deepEqual(settings.items,[{symbol:'AMD',category:'semi'}]);assert(!JSON.stringify(settings).includes('PRIVATE OWNER CATEGORY'));
  const core=await (await request('/api/watchlist')).json();assert.equal(Object.keys(core.instruments).length,7,'The documented generic reference corpus stays complete.');
  assert.equal((await request('/api/oi-summaries/history?symbols=NVDA')).status,403,'Unpublished private OI symbols cannot be enumerated.');
  assert.equal((await request('/option-structure.html')).status,200);
  const gamma=await request('/api/gamma-exposure?symbol=AMD&window=30d');assert.equal(gamma.status,200);assert.equal((await gamma.json()).base.checkedAt,null);
  for(const [path,body]of [['/api/gamma-exposure/refresh',{symbol:'AMD',window:'30d'}],['/api/max-pain/refresh',{symbol:'AMD'}]]){
    const structure=await request(path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(structure.status,200);assert.equal((await structure.json()).configured,false);
  }
  assert.equal((await request('/api/gamma-exposure?symbol=NVDA')).status,403,'The generic Core corpus does not publish removed symbols for new structure queries.');
  assert.equal((await request('/api/max-pain?symbol=NVDA')).status,403);
  const archiveIndex=await request('/api/structure-archive/index?symbol=AMD');assert.equal(archiveIndex.status,200);assert.deepEqual((await archiveIndex.json()).dates,[]);
  const archiveDay=await request('/api/structure-archive?symbol=AMD&date=2026-11-26');assert.equal(archiveDay.status,200);const archived=await archiveDay.json();assert.equal(archived.observationDate,'2026-11-26');assert.deepEqual(archived.records,[],'A missing historical date is not replaced with a current observation.');
  for(const path of ['/api/structure-archive/index?symbol=NVDA','/api/structure-archive?symbol=NVDA&date=2026-11-26'])assert.equal((await request(path)).status,403,'Unpublished symbols cannot enumerate structure archives.');
  const captureOptions={method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'};
  assert.equal((await request('/api/structure-daily/capture',captureOptions)).status,401,'Anonymous archive reads do not permit capture.');
  const publicDaily=await request('/api/structure-daily');assert.equal(publicDaily.status,200);assert.equal((await publicDaily.json()).scheduledTime,'17:45');
  const ownerDaily=await request('/api/structure-daily',{owner:true});assert.equal(ownerDaily.status,200);assert.equal((await ownerDaily.json()).authorization.configured,false,'No brokerage credentials are supplied to this container.');
  const capture=await request('/api/structure-daily/capture',{...captureOptions,owner:true});assert.equal(capture.status,202,'An owner can queue a bounded capture without treating queue acceptance as success.');
  let captureStatus;
  for(let i=0;i<40;i++){captureStatus=await (await request('/api/structure-daily',{owner:true})).json();if(!captureStatus.running&&captureStatus.lastRun?.completedAt)break;await new Promise(accept=>setTimeout(accept,250));}
  assert.equal(captureStatus.running,false);assert.equal(captureStatus.lastRun.mode,'manual');assert(captureStatus.lastRun.errors.includes('NOT_CONFIGURED'),'A credential-free capture reports the configuration problem explicitly.');assert.equal(captureStatus.lastRun.savedCount,0);assert.equal(captureStatus.archive.recordCount,0,'A failed capture never invents market observations.');
  const update=await request('/api/oi-summaries/refresh?symbols=AMD',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'});assert.equal(update.status,200);const result=await update.json();assert.equal(result.configured,false,'This check supplies no brokerage credentials.');assert(result.items.every(item=>item.checkedAt===null));
  const cooldown=await request('/api/oi-summaries/refresh?symbols=AMD',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'});assert.equal(cooldown.status,429);assert(Number(cooldown.headers.get('retry-after'))>0);
  for(const path of ['/api/oi-daily','/api/options-monitor','/api/providers/moomoo/status','/api/quote-reviews'])assert.equal((await request(path)).status,401,path);
  assert.equal((await request('/api/market/refresh',{method:'POST',headers:{origin:'https://hostile.example','content-type':'application/json'},body:'{}'})).status,403);
  assert.deepEqual(await (await request('/api/access',{owner:true})).json(),{authenticated:true,publicReadOnly:false,canRefresh:true});
  const sqlite=JSON.parse(await run(['exec',container,'python3','-c',"import sqlite3,json; c=sqlite3.connect('/tmp/pcr-runtime/pcr.sqlite3'); print(json.dumps({'integrity':c.execute('PRAGMA quick_check').fetchone()[0],'migrations':c.execute('SELECT COUNT(*) FROM __pcr_local_migrations').fetchone()[0]}))"]));assert.equal(sqlite.integrity,'ok');assert.equal(sqlite.migrations,expectedMigrations);
  console.log(JSON.stringify({passed:true,publicHome:200,publicCharts:true,visitorRefresh:200,cooldown:429,privateManagement:401,privateData:401,privateGroupsHidden:true,ownerEditing:200,unpublishedOi:403,crossSite:403,archivePublicRead:200,archiveUnpublished:403,archiveGuestCapture:401,archiveOwnerCapture:202,archiveNoCredentials:'NOT_CONFIGURED',archiveInventedRecords:0,sqlite}));
}finally{if(attempted)await run(['rm','-f',container]).catch(()=>{});}
