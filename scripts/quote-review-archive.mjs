// Local-only, read-only view of private quote captures and Windows task status.
import {lstat,readdir,readFile,realpath} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {spawn} from 'node:child_process';
import {renderQuoteReview,marketDate} from './capture-quote-review.mjs';

const JOB=/^[a-z0-9][a-z0-9-]{0,63}$/;
const RUN=/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;
const MAX_FILE_BYTES=2*1024*1024;
const text=(value,max=160)=>typeof value==='string'?value.slice(0,max):null;
const finite=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const childOf=(parent,path)=>{const rel=relative(parent,path);return rel!==''&&!rel.startsWith('..')&&!isAbsolute(rel);};
const safeIssue=value=>typeof value==='string'&&/^[a-zA-Z0-9_:.-]{1,100}$/.test(value)?value:'unknown_data_warning';
const numericFields=['lastPrice','bid','ask','reportedAgeSeconds','contractSize','strike','volume','openInterest','delta','gamma','theta','vega'];

export function runTimeFromId(id){
  if(!RUN.test(id))return null;
  const value=id.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,'T$1:$2:$3.$4Z'),parsed=iso(value);
  return parsed&&parsed.replace(/[:.]/g,'-')===id?parsed:null;
}
export function sanitizeArchivedReport(value,{jobId,runId}){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.jobId!==jobId||iso(value.actualStartedAt)!==runTimeFromId(runId)||!['manual','scheduled'].includes(value.mode)||!['success','partial','unavailable','missed'].includes(value.status))throw Error('UNREADABLE_RUN');
  const quote=row=>{
    const q={code:text(row?.code,64),label:text(row?.label,120),providerAsOf:iso(row?.providerAsOf),providerTradingDate:typeof row?.providerTradingDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(row.providerTradingDate)?row.providerTradingDate:null,bidAskAsOf:iso(row?.bidAskAsOf),sourceEndpoint:['snapshot','stock-quote'].includes(row?.sourceEndpoint)?row.sourceEndpoint:null,expiry:text(row?.expiry,10),type:['P','C'].includes(row?.type)?row.type:null,issues:Array.isArray(row?.issues)?row.issues.slice(0,24).map(safeIssue):[]};
    for(const field of numericFields)q[field]=finite(row?.[field]);
    return q;
  };
  const report={jobId,mode:value.mode,status:value.status,timeZone:'America/New_York',scheduledAt:iso(value.scheduledAt),cutoffAt:iso(value.cutoffAt),actualStartedAt:iso(value.actualStartedAt),completedAt:iso(value.completedAt),lateBySeconds:finite(value.lateBySeconds),quotes:Array.isArray(value.quotes)?value.quotes.slice(0,32).map(quote):[],regularSessionQuotes:[],spreads:[],errors:[],notes:['Private local quote archive. No orders, account data or credentials are returned.']};
  if(!report.scheduledAt||!report.cutoffAt||!report.completedAt)throw Error('UNREADABLE_RUN');
  report.regularSessionQuotes=(Array.isArray(value.regularSessionQuotes)?value.regularSessionQuotes:[]).slice(0,8).map(row=>({code:text(row?.code,64),lastPrice:finite(row?.lastPrice),previousClose:finite(row?.previousClose),open:finite(row?.open),high:finite(row?.high),low:finite(row?.low),providerAsOf:iso(row?.providerAsOf),providerTradingDate:text(row?.providerTradingDate,10),issues:Array.isArray(row?.issues)?row.issues.slice(0,24).map(safeIssue):[]}));
  report.spreads=(Array.isArray(value.spreads)?value.spreads:[]).slice(0,8).map(row=>{
    const spread={label:text(row?.label,120),longCode:text(row?.longCode,64),shortCode:text(row?.shortCode,64),expiry:text(row?.expiry,10),longProviderAsOf:iso(row?.longProviderAsOf),shortProviderAsOf:iso(row?.shortProviderAsOf),issues:Array.isArray(row?.issues)?row.issues.slice(0,48).map(safeIssue):[]};
    for(const field of ['width','entryNaturalDebit','exitNaturalCredit','indicativeMid','contractSize','maxLossAtEntry','maxProfitAtExpiry','breakEvenAtExpiry'])spread[field]=finite(row?.[field]);return spread;
  });
  report.errors=(Array.isArray(value.errors)?value.errors:[]).slice(0,16).map(row=>({endpoint:['snapshot','stock'].includes(row?.endpoint)?row.endpoint:'unknown',code:typeof row?.code==='string'&&/^[A-Z_]{1,40}$/.test(row.code)?row.code:'QUOTE_UNAVAILABLE',providerCode:finite(row?.providerCode)}));
  return report;
}
async function safeFile(directory,name,{read=false}={}){
  const file=join(directory,name),stat=await lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||!childOf(directory,await realpath(file)))throw Error('UNSAFE_FILE');
  if(read&&stat.size>MAX_FILE_BYTES)throw Error('FILE_TOO_LARGE');
  return {bytes:stat.size,...(read?{body:await readFile(file,'utf8')}:{})};
}
async function safeDirectory(parent,name){
  const directory=join(parent,name),stat=await lstat(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('UNSAFE_DIRECTORY');
  const canonical=await realpath(directory);if(!childOf(parent,canonical))throw Error('UNSAFE_DIRECTORY');return canonical;
}
async function readJson(directory,name){return JSON.parse((await safeFile(directory,name,{read:true})).body.replace(/^\uFEFF/,''));}
async function runBytes(directory){
  let bytes=0;for(const name of ['snapshot.json','index.html']){try{bytes+=(await safeFile(directory,name)).bytes;}catch{}}return bytes;
}
async function readRun(directory,jobId,runId){
  const bytes=await runBytes(directory);
  const report=sanitizeArchivedReport(await readJson(directory,'snapshot.json'),{jobId,runId});
  const summary={id:runId,jobId,actualStartedAt:report.actualStartedAt,completedAt:report.completedAt,status:report.status,mode:report.mode,quoteCount:report.quotes.length,spreadCount:report.spreads.length,bytes};
  return {report,summary,bytes};
}
export async function scanQuoteReviewArchive(rootDirectory){
  let root;
  try{root=await realpath(rootDirectory);}catch(error){if(error.code==='ENOENT')return {jobs:[],runs:[],storage:{jobCount:0,runCount:0,totalBytes:0,unreadableRunCount:0}};throw Error('ARCHIVE_UNAVAILABLE');}
  const jobs=[],runs=[];
  for(const entry of await readdir(root,{withFileTypes:true})){
    if(!entry.isDirectory()||entry.isSymbolicLink()||!JOB.test(entry.name))continue;
    let directory,config;
    try{directory=await safeDirectory(root,entry.name);config=await readJson(directory,'config.json');if(config.jobId!==entry.name||!iso(config.scheduledAt)||!iso(config.cutoffAt)||config.timeZone!=='America/New_York')continue;}catch{continue;}
    const job={id:entry.name,label:text(config.label,120)??entry.name,scheduledAt:iso(config.scheduledAt),cutoffAt:iso(config.cutoffAt),timeZone:'America/New_York',runCount:0,latestRun:null};
    let runRoot;try{runRoot=await safeDirectory(directory,'runs');}catch{jobs.push(job);continue;}
    const jobRuns=[];
    for(const item of await readdir(runRoot,{withFileTypes:true})){
      const time=runTimeFromId(item.name);
      if(!item.isDirectory()||item.isSymbolicLink()||!time)continue;
      let runDirectory;try{runDirectory=await safeDirectory(runRoot,item.name);}catch{continue;}
      let summary;
      try{summary=(await readRun(runDirectory,job.id,item.name)).summary;}catch{summary={id:item.name,jobId:job.id,actualStartedAt:time,completedAt:null,status:'unreadable',mode:'unknown',quoteCount:0,spreadCount:0,bytes:await runBytes(runDirectory)};}
      jobRuns.push(summary);runs.push(summary);
    }
    jobRuns.sort((a,b)=>b.actualStartedAt.localeCompare(a.actualStartedAt));job.runCount=jobRuns.length;job.latestRun=jobRuns[0]??null;jobs.push(job);
  }
  jobs.sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt));runs.sort((a,b)=>b.actualStartedAt.localeCompare(a.actualStartedAt));
  return {jobs,runs,storage:{jobCount:jobs.length,runCount:runs.length,totalBytes:runs.reduce((sum,run)=>sum+run.bytes,0),unreadableRunCount:runs.filter(run=>run.status==='unreadable').length}};
}
const schedulerCommand=String.raw`
$ErrorActionPreference='Stop'
Import-Module ScheduledTasks
$inputData=ConvertFrom-Json -InputObject ([Console]::In.ReadToEnd())
$ids=$inputData.ids
$result=@()
foreach($rawId in $ids){
 $id=[string]$rawId
 if($id -notmatch '^[a-z0-9][a-z0-9-]{0,63}$'){continue}
 try{
  $task=Get-ScheduledTask -TaskName ('PCR-QuoteReview-'+$id) -TaskPath '\' -ErrorAction Stop
  $info=Get-ScheduledTaskInfo -TaskName $task.TaskName -TaskPath '\' -ErrorAction Stop
  $next=$null;$last=$null
  if($info.NextRunTime.Year -ge 2000){$next=$info.NextRunTime.ToUniversalTime().ToString('o')}
  if($info.LastRunTime.Year -ge 2000){$last=$info.LastRunTime.ToUniversalTime().ToString('o')}
  $result+=@{id=$id;available=$true;state=[string]$task.State;nextRunAt=$next;lastRunAt=$last;lastTaskResult=[long]$info.LastTaskResult;checkedAt=[DateTime]::UtcNow.ToString('o')}
 }catch{
  $missing=$_.CategoryInfo.Category -eq 'ObjectNotFound'
  $result+=@{id=$id;available=$missing;state=$(if($missing){'not_found'}else{'unavailable'});nextRunAt=$null;lastRunAt=$null;lastTaskResult=$null;error=$(if($missing){'TASK_NOT_FOUND'}else{'SCHEDULER_QUERY_FAILED'});checkedAt=[DateTime]::UtcNow.ToString('o')}
 }
}
ConvertTo-Json -InputObject @($result) -Depth 4 -Compress
`;
export function createWindowsReviewScheduler({now=()=>Date.now(),ttlMs=30000,platform=process.platform}={}){
  let cached=null,pending=null;
  return async function getStatus(ids){
    const unavailable=code=>Object.fromEntries(ids.map(id=>[id,{available:false,state:'unavailable',nextRunAt:null,lastRunAt:null,lastTaskResult:null,error:code,checkedAt:new Date(now()).toISOString()}]));
    if(platform!=='win32')return unavailable('NOT_WINDOWS');
    if(!ids.length)return {};
    const key=[...ids].sort().join(',');
    if(cached?.key===key&&now()-cached.at<ttlMs)return cached.value;
    if(pending?.key===key)return pending.promise;
    const operation=(async()=>{
      let value;
      try{
        const body=await new Promise((accept,reject)=>{
          const executable=join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
          const child=spawn(executable,['-NoProfile','-NonInteractive','-Command',schedulerCommand],{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe'],env:{...process.env,PSModulePath:join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','Modules')}});
          let output='',settled=false;
          const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):accept(result);};
          const timer=setTimeout(()=>{child.kill();finish(Error('TIMEOUT'));},12000);
          child.on('error',()=>finish(Error('UNAVAILABLE')));child.stdout.on('data',chunk=>{output+=chunk;if(output.length>131072){child.kill();finish(Error('TOO_LARGE'));}});child.stderr.resume();child.on('close',code=>code===0?finish(null,output):finish(Error('UNAVAILABLE')));child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({ids}));
        });
        const decoded=JSON.parse(body);if(!Array.isArray(decoded))throw Error('INVALID_RESPONSE');value=unavailable('SCHEDULER_QUERY_FAILED');
        for(const item of decoded){if(!ids.includes(item.id))continue;value[item.id]={available:item.available===true,state:['Ready','Running','Disabled','Queued','Unknown','not_found'].includes(item.state)?item.state:'unavailable',nextRunAt:iso(item.nextRunAt),lastRunAt:iso(item.lastRunAt),lastTaskResult:finite(item.lastTaskResult),checkedAt:iso(item.checkedAt),...(item.error?{error:item.error==='TASK_NOT_FOUND'?'TASK_NOT_FOUND':'SCHEDULER_QUERY_FAILED'}:{})};}
      }catch{value=unavailable('SCHEDULER_QUERY_FAILED');}
      cached={key,value,at:now()};return value;
    })();
    pending={key,promise:operation};try{return await operation;}finally{if(pending?.promise===operation)pending=null;}
  };
}
const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
function queryOptions(url){
  const keys=['job','date','mode','offset','limit'];for(const key of url.searchParams.keys())if(!keys.includes(key)||url.searchParams.getAll(key).length!==1)throw Error('INVALID_QUERY');
  const job=url.searchParams.get('job'),date=url.searchParams.get('date'),mode=url.searchParams.get('mode'),offset=url.searchParams.get('offset')??'0',limit=url.searchParams.get('limit')??'25';
  if(job&&!JOB.test(job)||date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||iso(date+'T00:00:00Z')?.slice(0,10)!==date)||mode&&!['manual','scheduled'].includes(mode)||!/^\d{1,8}$/.test(offset)||!/^\d{1,3}$/.test(limit)||Number(limit)<1||Number(limit)>100)throw Error('INVALID_QUERY');
  return {job,date,mode,offset:Number(offset),limit:Number(limit)};
}
export function createQuoteReviewArchiveHandler({rootDirectory,schedulerProvider=createWindowsReviewScheduler(),now=()=>Date.now()}={}){
  if(!rootDirectory||!isAbsolute(rootDirectory))throw Error('ABSOLUTE_PRIVATE_ARCHIVE_REQUIRED');
  return async function handler(request){
    const url=new URL(request.url);if(!url.pathname.startsWith('/api/quote-reviews'))return null;
    if(request.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405,{allow:'GET'});
    const port=url.port,allowedHosts=new Set(['127.0.0.1'+(port?':'+port:''),'localhost'+(port?':'+port:''),'[::1]'+(port?':'+port:'')]);
    if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||request.headers.get('host')&&!allowedHosts.has(request.headers.get('host')))return json({error:'LOCAL_ORIGIN_REQUIRED'},403);
    const origin=request.headers.get('origin'),actualHost=request.headers.get('host')??url.host;if(origin&&origin!=='http://'+actualHost)return json({error:'LOCAL_ORIGIN_REQUIRED'},403);
    try{
      if(url.pathname==='/api/quote-reviews'){
        let options;try{options=queryOptions(url);}catch{return json({error:'INVALID_QUERY'},400);}
        const archive=await scanQuoteReviewArchive(rootDirectory),states=await schedulerProvider(archive.jobs.map(job=>job.id));
        const jobs=archive.jobs.map(job=>({...job,scheduler:states[job.id]??{available:false,state:'unavailable',nextRunAt:null,lastRunAt:null,lastTaskResult:null,error:'SCHEDULER_QUERY_FAILED'}}));
        const selected=archive.runs.filter(run=>(!options.job||run.jobId===options.job)&&(!options.date||marketDate(Date.parse(run.actualStartedAt),'America/New_York')===options.date)&&(!options.mode||run.mode===options.mode));
        return json({supported:true,localOnly:true,checkedAt:new Date(now()).toISOString(),storage:archive.storage,jobs,runs:selected.slice(options.offset,options.offset+options.limit),pagination:{offset:options.offset,limit:options.limit,total:selected.length,hasMore:options.offset+options.limit<selected.length}});
      }
      const match=/^\/api\/quote-reviews\/jobs\/([a-z0-9-]+)\/runs\/([^/]+)(?:\/(snapshot\.json|report\.html))?$/.exec(url.pathname);
      if(!match||!JOB.test(match[1])||!runTimeFromId(match[2])||url.search)return json({error:'NOT_FOUND'},404);
      const root=await realpath(rootDirectory),job=await safeDirectory(root,match[1]),config=await readJson(job,'config.json');
      if(config.jobId!==match[1])return json({error:'NOT_FOUND'},404);
      const runRoot=await safeDirectory(job,'runs'),directory=await safeDirectory(runRoot,match[2]);
      let run;try{run=await readRun(directory,match[1],match[2]);}catch{return json({error:'RUN_UNREADABLE',jobId:match[1],runId:match[2]},422);}
      if(match[3]==='snapshot.json')return json(run.report,200,{'content-disposition':`attachment; filename="quote-review-${match[1]}-${match[2]}.json"`});
      if(match[3]==='report.html')return new Response(renderQuoteReview(run.report),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",'referrer-policy':'no-referrer'}});
      return json({supported:true,jobId:match[1],runId:match[2],bytes:run.bytes,report:run.report});
    }catch(error){return json({error:['ENOENT','ENOTDIR','UNSAFE_DIRECTORY','UNSAFE_FILE'].includes(error.code??error.message)?'NOT_FOUND':'ARCHIVE_UNAVAILABLE'},['ENOENT','ENOTDIR','UNSAFE_DIRECTORY','UNSAFE_FILE'].includes(error.code??error.message)?404:503);}
  };
}
