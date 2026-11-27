import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {collectQuoteReview,saveQuoteReview} from './capture-quote-review.mjs';
import {createQuoteReviewArchiveHandler,scanQuoteReviewArchive,runTimeFromId,createWindowsReviewScheduler} from './quote-review-archive.mjs';

const makeConfig=outputDirectory=>({jobId:'review-test',scheduledAt:'2026-11-27T09:45:00-05:00',cutoffAt:'2026-11-27T12:30:00-05:00',timeZone:'America/New_York',outputDirectory,underlyings:[{code:'US.QQQ',label:'QQQ'}],contracts:[{code:'US.QQQ270115P630000',label:'Long 630 Put'},{code:'US.QQQ270115P600000',label:'Short 600 Put'}],spreads:[{label:'630/600',longCode:'US.QQQ270115P630000',shortCode:'US.QQQ270115P600000'}]});
async function fixture(){
  const parent=await mkdtemp(join(tmpdir(),'pcr-archive-qa-')),root=join(parent,'quote-reviews'),directory=join(root,'review-test');await mkdir(directory,{recursive:true});
  const config=makeConfig(directory);await writeFile(join(directory,'config.json'),JSON.stringify({...config,privateAccount:'MUST_NOT_EXPORT_CONFIG'}));
  const make=async(time,manual)=>{
    const requestQuote=async path=>({ret_code:0,data:path.endsWith('/snapshot')?{snapshot_list:[{code:'US.QQQ',data_date:'2026-11-27',update_time:time,last_price:633,bid_price:632,ask_price:634},{code:config.contracts[0].code,data_date:'2026-11-27',update_time:time,last_price:27,bid_price:27.14,ask_price:27.62,option_contract_size:100},{code:config.contracts[1].code,data_date:'2026-11-27',update_time:time,last_price:17,bid_price:17.48,ask_price:17.76,option_contract_size:100}]}:{quote_list:[{code:'US.QQQ',last_price:633,prev_close_price:630,data_date:'2026-11-27',data_time:time}]}});
    return saveQuoteReview(config,await collectQuoteReview(config,{now:()=>time,captureNow:manual,requestQuote}));
  };
  const first=await make(Date.parse('2026-11-26T02:49:11.484Z'),true),second=await make(Date.parse('2026-11-27T14:45:00Z'),false);
  let schedulerCalls=0;
  const schedulerProvider=async ids=>{schedulerCalls++;return Object.fromEntries(ids.map(id=>[id,{available:true,state:'Ready',nextRunAt:'2026-11-27T14:45:00Z',lastRunAt:null,lastTaskResult:267011,checkedAt:'2026-11-26T05:00:00Z'}]));};
  const handler=createQuoteReviewArchiveHandler({rootDirectory:root,schedulerProvider,now:()=>Date.parse('2026-11-26T05:00:00Z')});
  const request=(suffix='',options={})=>handler(new Request('http://127.0.0.1:8765/api/quote-reviews'+suffix,options));
  return {parent,root,directory,config,first,second,handler,request,schedulerCalls:()=>schedulerCalls};
}
async function withFixture(action){const f=await fixture();try{await action(f);}finally{await rm(f.parent,{recursive:true,force:true});}}

test('index separates actual scheduler status from manual / scheduled archives and reports exact bytes',()=>withFixture(async f=>{
  const before=await readdir(f.directory),data=await(await f.request()).json();
  assert.equal(data.supported,true);assert.equal(data.jobs.length,1);assert.equal(data.runs.length,2);assert.equal(data.jobs[0].scheduler.lastRunAt,null);assert.equal(data.jobs[0].scheduler.nextRunAt,'2026-11-27T14:45:00Z');assert.equal(data.jobs[0].latestRun.mode,'scheduled');
  assert.equal(data.storage.totalBytes,data.runs.reduce((n,row)=>n+row.bytes,0));assert(data.storage.totalBytes>0);assert(!JSON.stringify(data).includes('MUST_NOT_EXPORT_CONFIG'));assert(!JSON.stringify(data).includes(f.parent));assert.deepEqual(await readdir(f.directory),before);
}));
test('date filter uses actual NY date and pagination never changes global jobs / storage',()=>withFixture(async f=>{
  const data=await(await f.request('?date=2026-11-25&mode=manual&limit=1&offset=0')).json();
  assert.equal(data.runs.length,1);assert.equal(data.runs[0].actualStartedAt,'2026-11-26T02:49:11.484Z');assert.equal(data.runs[0].mode,'manual');assert.equal(data.storage.runCount,2);assert.equal(data.jobs[0].runCount,2);assert.equal(data.pagination.total,1);assert.equal(data.pagination.hasMore,false);
  const page=await(await f.request('?limit=1')).json();assert.equal(page.pagination.hasMore,true);assert.equal(page.runs[0].mode,'scheduled');
  const next=await(await f.request('?limit=1&offset=1')).json();assert.equal(next.runs[0].mode,'manual');
  assert.equal((await(await f.request('?job=other')).json()).runs.length,0);
}));
test('detail and downloads return only sanitized market fields; HTML is regenerated, not a stored executable',()=>withFixture(async f=>{
  const id='2026-11-26T02-49-11-484Z',path=join(f.first.directory,'snapshot.json'),raw=JSON.parse(await readFile(path,'utf8'));
  raw.accessToken='MUST_NOT_EXPORT_TOKEN';raw.quotes[0].accountId='MUST_NOT_EXPORT_ACCOUNT';raw.quotes[0].label='<script>alert(1)</script>';await writeFile(path,JSON.stringify(raw));await writeFile(join(f.first.directory,'index.html'),'<script>MUST_NOT_SERVE_STORED_HTML</script>');
  const base='/jobs/review-test/runs/'+id;
  const response=await f.request(base),data=await response.json();assert.equal(data.report.quotes[1].bid,27.14);assert(!JSON.stringify(data).includes('MUST_NOT_EXPORT'));assert.equal(response.headers.get('cache-control'),'no-store');
  const download=await f.request(base+'/snapshot.json');assert.match(download.headers.get('content-disposition'),/^attachment;/);assert(!JSON.stringify(await download.json()).includes('MUST_NOT_EXPORT'));
  const html=await f.request(base+'/report.html'),body=await html.text();assert(!body.includes('MUST_NOT_SERVE'));assert(!body.includes('<script>alert'));assert(body.includes('&lt;script&gt;'));assert.match(html.headers.get('content-security-policy'),/default-src 'none'/);
}));
test('corrupt captures remain visible as unreadable records without pretending that they succeeded',()=>withFixture(async f=>{
  await writeFile(join(f.first.directory,'snapshot.json'),'{invalid');const data=await(await f.request()).json();assert.equal(data.storage.runCount,2);assert.equal(data.storage.unreadableRunCount,1);assert(data.runs.some(row=>row.status==='unreadable'&&row.mode==='unknown'));
  assert.equal((await f.request('/jobs/review-test/runs/2026-11-26T02-49-11-484Z')).status,422);
}));
test('unknown paths, traversal, unsupported queries and writes cannot touch private files or trigger a task',()=>withFixture(async f=>{
  for(const path of ['/config.json','/jobs/review-test/config.json','/jobs/review-test/runs/%2e%2e%2fconfig.json','/jobs/review-test/runs/2026-11-26T02-49-11-484Z/../../config.json'])assert.equal((await f.request(path)).status,404);
  for(const query of ['?path=C:/private','?mode=all','?limit=0','?limit=101','?offset=-1','?date=2026-02-31','?job=x&job=y'])assert.equal((await f.request(query)).status,400);
  for(const method of ['POST','PUT','DELETE'])assert.equal((await f.request('',{method})).status,405);
  assert.equal(f.schedulerCalls(),0);assert.equal(await f.handler(new Request('http://127.0.0.1:8765/unrelated')),null);
}));
test('only local origins/hosts can read the archive; source paths never appear in failures',()=>withFixture(async f=>{
  assert.equal((await f.request('',{headers:{origin:'https://evil.test'}})).status,403);assert.equal((await f.request('',{headers:{host:'evil.test'}})).status,403);assert.equal((await f.request('',{headers:{origin:'http://localhost:8765',host:'localhost:8765'}})).status,200);
  assert.equal((await f.request('',{headers:{origin:'http://localhost:8765',host:'127.0.0.1:8765'}})).status,403);
  const missing=await f.request('/jobs/nonexistent/runs/2026-11-26T02-49-11-484Z');assert.equal(missing.status,404);assert(!JSON.stringify(await missing.json()).includes(f.parent));
}));
test('symlinked run folders and files cannot expose other filesystem data',()=>withFixture(async f=>{
  const external=join(f.parent,'outside');await mkdir(external);await writeFile(join(external,'snapshot.json'),'PRIVATE_EXTERNAL_FILE');
  const alias=join(f.directory,'runs','2026-11-27T16-00-00-000Z');await symlink(external,alias,process.platform==='win32'?'junction':'dir');
  const data=await(await f.request()).json();assert.equal(data.storage.runCount,2);assert.equal((await f.request('/jobs/review-test/runs/2026-11-27T16-00-00-000Z')).status,404);
}));
test('an empty archive is supported and never fabricates a Windows schedule',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'pcr-empty-archive-'));
  try{const value=await scanQuoteReviewArchive(join(directory,'missing'));assert.deepEqual(value.jobs,[]);assert.equal(value.storage.totalBytes,0);assert.equal(runTimeFromId('2026-13-27T16-00-00-000Z'),null);const scheduler=createWindowsReviewScheduler({platform:'linux'});assert.equal((await scheduler(['example'])).example.available,false);}finally{await rm(directory,{recursive:true,force:true});}
});
