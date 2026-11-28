import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {gzipSync} from 'node:zlib';
import {createLocalD1} from './local-db.mjs';
import {backupHfDatabase,restoreHfDatabase} from './hf-storage.mjs';
import {createSqliteWorkerCache,installCloudWorkerCache,WORKER_CACHE_LIMITS} from './worker-cache.mjs';
import {handleApi,backendTesting} from '../worker/backend.js';
import {handleCboeApi,cboeTesting} from '../worker/cboe.js';

const SOURCE_ORIGIN='http://127.0.0.1:8765',TARGET='2026-11-25',EPOCH=Date.parse('2026-11-26T13:00:00Z');
const moduleUrl=name=>new URL(name,import.meta.url).href;
function runNode(source){
  return new Promise((accept,reject)=>{
    const child=spawn(process.execPath,['--input-type=module','-e',source],{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let output='',error='';const timer=setTimeout(()=>{child.kill();reject(Error('Fresh-process cache read timed out.'));},60000);
    child.stdout.on('data',chunk=>{output+=chunk;if(output.length>65536){child.kill();reject(Error('Cache test returned unexpected output.'));}});
    child.stderr.on('data',chunk=>{if(error.length<4096)error+=chunk;});
    child.on('error',reason=>{clearTimeout(timer);reject(reason);});
    child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(Error('Fresh-process cache read failed: '+error));try{accept(JSON.parse(output));}catch{reject(Error('Fresh-process cache read returned invalid metadata.'));}});
  });
}
function freezeTime(epoch){const NativeDate=globalThis.Date;globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[epoch]));}static now(){return epoch;}};return()=>{globalThis.Date=NativeDate;};}
function htmlFor(payload){return '<script>self.__next_f.push('+JSON.stringify([1,'25:'+JSON.stringify(['$','$L33',null,{data:payload}])+'\n'])+')</script>';}
const post=path=>new Request(SOURCE_ORIGIN+path,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
// The fixture supplies 2026-11-24 and TARGET through mocked source pages, so it
// needs a Cboe seed ending before them. Truncate the bundled seed (which later
// refreshes may extend) instead of depending on its current last date.
function olderCboeSeed(value,cutoff='2026-11-23'){const observations=value.observations.filter(row=>row.date<=cutoff),expectedSessionDates=(value.expectedSessionDates||[]).filter(date=>date<=cutoff);return {...value,asof:cutoff,sourceLatestDate:cutoff,observations,expectedSessionDates,coverage:{...value.coverage,expectedEnd:cutoff,expectedSessions:expectedSessionDates.length,verifiedSessions:observations.length}};}

test('real Core and Cboe worker caches survive SQLite backup and a new Node process without refetching',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'pcr-worker-cache-'));assert.equal(dirname(resolve(directory)),resolve(tmpdir()));
  const nativeFetch=globalThis.fetch,nativeCaches=globalThis.caches,restoreTime=freezeTime(EPOCH);
  backendTesting.clearMemory();cboeTesting.clearMemory();
  try{
    const [seed,bundledCboeSeed]=await Promise.all(['../data/seed.json','../data/cboe-seed.json'].map(async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'))));
    const cboeSeed=olderCboeSeed(bundledCboeSeed);
    assert(seed.asof<TARGET&&cboeSeed.asof<TARGET,'Regression fixture must use the older bundled seed.');
    const originalRaw=backendTesting.rawFromSeed(seed),fixtureRows={};
    for(const [symbol,rows]of Object.entries(originalRaw.data)){
      const last=rows.at(-1);fixtureRows[symbol]=rows.map(row=>({...row}));
      for(const [index,date]of ['2026-11-24',TARGET].entries())if(date>last.date)fixtureRows[symbol].push({date,put_sides:last.put_sides+index+1,call_sides:last.call_sides+index+2});
    }
    fixtureRows.SNDK=fixtureRows.NVDA.map(row=>({...row}));
    const latestSnapshot=structuredClone(cboeSeed.observations.at(-1));let providerCalls=0,changes=0;
    globalThis.fetch=async resource=>{
      providerCalls++;const url=new URL(String(resource));
      if(url.hostname==='marketdata.theocc.com'){
        const symbol=url.searchParams.get('symbol'),month=url.searchParams.get('reportDate')?.slice(0,6),rows=fixtureRows[symbol]?.filter(row=>row.date.replaceAll('-','').startsWith(month));
        assert(rows?.length,'Mock must supply the real requested OCC month.');
        const lines=['quantity,underlying,symbol,actype,porc,exchange,actdate'];
        for(const row of rows)for(const [side,field]of [['P','put_sides'],['C','call_sides']]){const [year,mm,dd]=row.date.split('-');lines.push([row[field],symbol,symbol,'M',side,'TEST',`${mm}/${dd}/${year}`].join(','));}
        return new Response(lines.join('\n'));
      }
      assert.equal(url.hostname,'www.cboe.com','The regression test must never reach another external service.');
      const optionsData={ratios:Object.values(latestSnapshot.metrics).map(metric=>({name:metric.name,value:metric.ratio.toFixed(2)}))};
      for(const [key,table]of [['total','SUM OF ALL PRODUCTS'],['index','INDEX OPTIONS'],['etp','EXCHANGE TRADED PRODUCTS'],['equity','EQUITY OPTIONS']]){
        const metric=latestSnapshot.metrics[key];if(Number.isSafeInteger(metric?.put)&&Number.isSafeInteger(metric?.call))optionsData[table]=[{name:'VOLUME',put:metric.put,call:metric.call}];
      }
      return new Response(htmlFor({selectedDate:url.searchParams.get('dt')||TARGET,optionsData}));
    };
    const database=await createLocalD1({databasePath:join(directory,'runtime','pcr.sqlite3'),onChange:()=>{changes++;}});
    assert.equal(installCloudWorkerCache({database,env:{PCR_RUNTIME:'cloud'},now:()=>EPOCH}),true);
    const coreResponse=await handleApi(post('/api/refresh'),{},null,seed);assert.equal(coreResponse.status,200);const core=(await coreResponse.json()).data;assert.equal(core.asof,TARGET);
    const symbolResponse=await handleApi(new Request(SOURCE_ORIGIN+'/api/symbol?symbol=SNDK&refresh=1'),{},null,seed);assert.equal(symbolResponse.status,200);const symbol=await symbolResponse.json();assert.equal(symbol.asof,TARGET);
    const cboeResponse=await handleCboeApi(post('/api/cboe/refresh'),{},null,cboeSeed);assert.equal(cboeResponse.status,200);const latest=await cboeResponse.json();assert.equal(latest.snapshot.date,TARGET);
    const historyResponse=await handleCboeApi(post('/api/cboe/history/refresh?end='+TARGET+'&range=126'),{},null,cboeSeed);assert.equal(historyResponse.status,200);const history=await historyResponse.json();
    assert(history.rows.some(row=>row.date==='2026-11-24'&&Number.isFinite(row.index.daily)));assert(history.rows.some(row=>row.date===TARGET&&Number.isFinite(row.index.daily)));
    const datedResponse=await handleCboeApi(post('/api/cboe/refresh?date=2026-11-24'),{},null,cboeSeed);assert.equal(datedResponse.status,200);assert.equal((await datedResponse.json()).snapshot.date,'2026-11-24');
    for(const key of ['complete-v1','symbol-v1/SNDK','cboe-v1/latest','cboe-v1/2026-11-24','cboe-history-v1/all'])assert(await globalThis.caches.default.match(new Request(SOURCE_ORIGIN+'/__pcr_internal_cache__/'+key)),'Actual Worker writes must cover '+key);
    assert(providerCalls>0);assert(changes>0,'Cache commits must notify the existing backup mechanism.');
    const coreCache=await globalThis.caches.default.match(new Request(SOURCE_ORIGIN+'/__pcr_internal_cache__/complete-v1'));assert(coreCache);
    const coreText=await coreCache.text(),coreBytes=Buffer.byteLength(coreText),compressedBytes=gzipSync(coreText).length;
    assert(coreBytes<=WORKER_CACHE_LIMITS.maxBodyBytes);assert(compressedBytes<=WORKER_CACHE_LIMITS.maxCompressedBytes);
    const options={databasePath:database.databasePath,backupDirectory:join(directory,'bucket'),pythonExecutable:database.pythonExecutable};
    assert.equal((await backupHfDatabase({...options,now:()=>EPOCH})).status,'saved');
    const restoredPath=join(directory,'fresh-runtime','pcr.sqlite3');assert.equal((await restoreHfDatabase({...options,databasePath:restoredPath})).status,'restored');
    const childSource=`
      import {readFile} from 'node:fs/promises';
      import {createLocalD1} from ${JSON.stringify(moduleUrl('./local-db.mjs'))};
      import {installCloudWorkerCache} from ${JSON.stringify(moduleUrl('./worker-cache.mjs'))};
      import {handleApi} from ${JSON.stringify(moduleUrl('../worker/backend.js'))};
      import {handleCboeApi} from ${JSON.stringify(moduleUrl('../worker/cboe.js'))};
      const NativeDate=Date,epoch=${EPOCH+60000};globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[epoch]));}static now(){return epoch;}};
      let network=0;globalThis.fetch=async()=>{network++;throw Error('No refetch is permitted after restoring a cache.');};
      const db=await createLocalD1({databasePath:${JSON.stringify(restoredPath)}});installCloudWorkerCache({database:db,env:{PCR_RUNTIME:'cloud'},now:()=>epoch});
      const seed=JSON.parse(await readFile(new URL(${JSON.stringify(moduleUrl('../data/seed.json'))}),'utf8'));
      ${olderCboeSeed.toString()}
      const cboeSeed=olderCboeSeed(JSON.parse(await readFile(new URL(${JSON.stringify(moduleUrl('../data/cboe-seed.json'))}),'utf8')));
      const origin='http://127.0.0.1:8766';
      const core=await(await handleApi(new Request(origin+'/api/watchlist'),{},null,seed)).json();
      const symbol=await(await handleApi(new Request(origin+'/api/symbol?symbol=SNDK'),{},null,seed)).json();
      const latest=await(await handleCboeApi(new Request(origin+'/api/cboe',{headers:{'x-pcr-cache-only':'1'}}),{},null,cboeSeed)).json();
      const dated=await(await handleCboeApi(new Request(origin+'/api/cboe?date=2026-11-24',{headers:{'x-pcr-cache-only':'1'}}),{},null,cboeSeed)).json();
      const history=await(await handleCboeApi(new Request(origin+'/api/cboe/history?end=2026-11-25&range=126'),{},null,cboeSeed)).json();
      console.log(JSON.stringify({core:{asof:core.asof,checkedAt:core.checkedAt,last:core.instruments.NVDA.rows.at(-1)},symbol:{asof:symbol.asof,checkedAt:symbol.checkedAt},latest:{date:latest.snapshot?.date,checkedAt:latest.checkedAt,index:latest.snapshot?.metrics.index.ratio},dated:{date:dated.snapshot?.date,checkedAt:dated.checkedAt},history:history.rows.filter(row=>row.date>='2026-11-24'),network}));
    `;
    const restored=await runNode(childSource);
    assert.equal(restored.network,0,'A fresh process must restore without any source request.');assert.equal(restored.core.asof,TARGET);assert.equal(restored.core.checkedAt,core.checkedAt);assert.deepEqual(restored.core.last,core.instruments.NVDA.rows.at(-1));
    assert.equal(restored.symbol.asof,TARGET);assert.equal(restored.symbol.checkedAt,symbol.checkedAt);
    assert.equal(restored.latest.date,TARGET);assert.equal(restored.latest.checkedAt,latest.checkedAt);assert.equal(restored.latest.index,latest.snapshot.metrics.index.ratio);assert.equal(restored.dated.date,'2026-11-24');
    for(const date of ['2026-11-24',TARGET])assert.deepEqual(restored.history.find(row=>row.date===date),history.rows.find(row=>row.date===date));
    console.log(JSON.stringify({actualWorkerCacheRestore:true,coreBytes,compressedBytes,sourceCallsBeforeBackup:providerCalls,sourceCallsAfterRestore:restored.network,coreThrough:restored.core.asof,cboeThrough:restored.latest.date}));
  }finally{
    restoreTime();globalThis.fetch=nativeFetch;if(nativeCaches===undefined)delete globalThis.caches;else globalThis.caches=nativeCaches;backendTesting.clearMemory();cboeTesting.clearMemory();await rm(directory,{recursive:true,force:true});
  }
});
