import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {collectQuoteReview,validateReviewConfig,calculateReviewSpread,normalizeReviewQuote,renderQuoteReview,saveQuoteReview,createQuoteReviewRequester,contractParts} from './capture-quote-review.mjs';

const target=Date.parse('2026-11-27T14:45:00Z');
const config={jobId:'test-quote-review',scheduledAt:'2026-11-27T09:45:00-05:00',cutoffAt:'2026-11-27T12:30:00-05:00',timeZone:'America/New_York',outputDirectory:join(tmpdir(),'unused-quote-review'),underlyings:[{code:'US.QQQ',label:'QQQ'}],contracts:[{code:'US.QQQ270115P630000',label:'Long 630 Put'},{code:'US.QQQ270115P600000',label:'Short 600 Put'}],spreads:[{label:'630/600 Put',longCode:'US.QQQ270115P630000',shortCode:'US.QQQ270115P600000'}]};
const quote=(code,bid,ask,extra={})=>({code,last_price:(bid+ask)/2,bid_price:bid,ask_price:ask,update_time:target-1000,data_time:target-1000,data_date:'2026-11-27',option_contract_size:100,...extra});
const rows=[quote('US.QQQ',633,634),quote('US.QQQ270115P630000',27.14,27.62),quote('US.QQQ270115P600000',17.48,17.76)];
const responder=async path=>({ret_code:0,data:path.endsWith('/snapshot')?{snapshot_list:rows}:{quote_list:[{...rows[0],prev_close_price:630}]}});

test('offset schedule is exact NY 09:45 and validation rejects unrelated inputs',()=>{
  assert.equal(Date.parse(config.scheduledAt),target);validateReviewConfig(config);
  assert.throws(()=>validateReviewConfig({...config,scheduledAt:'2026-11-27T09:45:00'}));
  assert.throws(()=>validateReviewConfig({...config,endpoint:'/trade/orders'}));
  assert.throws(()=>validateReviewConfig({...config,cutoffAt:config.scheduledAt}));
  assert.throws(()=>validateReviewConfig({...config,spreads:[{...config.spreads[0],shortCode:config.spreads[0].longCode}]}));
  assert.equal(contractParts('US.QQQ261332P620000'),null);
});
test('early and missed scheduled runs never access credentials or quotes',async()=>{
  let calls=0;const requestQuote=()=>{calls++;throw Error('must not run');};
  assert.equal((await collectQuoteReview(config,{now:()=>target-1,requestQuote})).status,'not_due');
  const missed=await collectQuoteReview(config,{now:()=>target+86400000,requestQuote});
  assert.equal(missed.status,'missed');assert.equal(missed.quotes.length,0);assert.equal(calls,0);
});
test('scheduled and manual runs retain actual, planned and provider times separately',async()=>{
  const report=await collectQuoteReview(config,{now:()=>target+30000,requestQuote:responder});
  assert.equal(report.status,'success');assert.equal(report.lateBySeconds,30);assert.equal(report.quotes[1].providerAsOf,new Date(target-1000).toISOString());assert.equal(report.quotes[1].bidAskAsOf,null);
  const manual=await collectQuoteReview(config,{now:()=>target-86400000,captureNow:true,requestQuote:responder});
  assert.equal(manual.mode,'manual');assert.match(renderQuoteReview(manual),/手动测试抓取/);assert.equal(manual.status,'partial');
});
test('spread entry uses long ask minus short bid; exit and expiry math are distinct',async()=>{
  const report=await collectQuoteReview(config,{now:()=>target,requestQuote:responder});const spread=report.spreads[0];
  assert.equal(spread.entryNaturalDebit,10.14);assert.equal(spread.exitNaturalCredit,9.38);assert.equal(spread.indicativeMid,9.76);assert.equal(spread.maxLossAtEntry,1014);assert.equal(spread.maxProfitAtExpiry,1986);assert.equal(spread.breakEvenAtExpiry,619.86);
});
test('zero bid is retained; missing, crossed or impossible prices are not fabricated',()=>{
  const context={now:target,expectedDate:'2026-11-27',timeZone:config.timeZone};
  const normalized=rows.slice(1).map((row,index)=>normalizeReviewQuote(row,config.contracts[index],context));
  const zero=calculateReviewSpread(config.spreads[0],[normalized[0],{...normalized[1],bid:0}]);assert.equal(zero.entryNaturalDebit,27.62);
  for(const invalid of [{...normalized[0],ask:null},{...normalized[0],bid:30},{...normalized[0],ask:60}])assert.equal(calculateReviewSpread(config.spreads[0],[invalid,normalized[1]]).entryNaturalDebit,null);
  assert.equal(calculateReviewSpread(config.spreads[0],[{...normalized[0],contractSize:null},normalized[1]]).maxLossAtEntry,null);
});
test('stale dates and missing source times never become a live quote',()=>{
  const q=normalizeReviewQuote({...rows[1],update_time:target-86400000,data_date:'2026-11-25'},config.contracts[0],{now:target,expectedDate:'2026-11-27',timeZone:config.timeZone});
  assert(q.issues.includes('reported_timestamp_older_than_5_minutes'));assert(q.issues.includes('different_or_missing_trading_date'));
  const missing=normalizeReviewQuote({},config.contracts[0],{now:target,expectedDate:'2026-11-27',timeZone:config.timeZone});assert.equal(missing.providerAsOf,null);assert(missing.issues.includes('timestamp_not_disclosed'));
});
test('endpoint failure preserves partial stock data and never exposes raw errors',async()=>{
  const report=await collectQuoteReview(config,{now:()=>target,requestQuote:async(path)=>{if(path.endsWith('/snapshot'))throw Error('secret-token-must-not-escape');return responder(path);}});
  assert.equal(report.status,'partial');assert.equal(report.quotes[0].lastPrice,633.5);assert.equal(report.quotes[1].bid,null);assert(!JSON.stringify(report).includes('secret-token'));
  const failed=await collectQuoteReview(config,{now:()=>target,requestQuote:async()=>{throw Error('secret');}});assert.equal(failed.status,'unavailable');assert.match(renderQuoteReview(failed),/行情未取得/);
});
test('malformed successful responses and invalid timestamps become warnings, not a silent crash',async()=>{
  const bad=await collectQuoteReview(config,{now:()=>target,requestQuote:async()=>({ret_code:0,data:{snapshot_list:{bad:true},quote_list:'bad'}})});
  assert.equal(bad.status,'unavailable');assert.equal(bad.errors.length,2);assert.match(renderQuoteReview(bad),/行情未取得/);
  const q=normalizeReviewQuote({...rows[1],update_time:1e100},config.contracts[0],{now:target,expectedDate:'2026-11-27',timeZone:config.timeZone});assert.equal(q.providerAsOf,null);
  const nullRows=await collectQuoteReview(config,{now:()=>target,requestQuote:async()=>({ret_code:0,data:{snapshot_list:[null,1,[],...rows],quote_list:[null]}})});assert.equal(nullRows.quotes.length,3);
});
test('only the two read-only quote paths can receive an access token',async()=>{
  let reads=0,calls=0;const requester=createQuoteReviewRequester({getAccessToken:async()=>{reads++;return 'fake-token';}},{fetcher:async(url,options)=>{calls++;assert(url.startsWith('https://webapi.moomoo.com/api/v1.0/quote/'));assert.equal(options.method,'POST');assert.equal(options.redirect,'error');return new Response(JSON.stringify({ret_code:0,data:{snapshot_list:[]}}),{status:200});}});
  await assert.rejects(requester('/api/v1.0/trade/orders',{}));assert.equal(reads,0);
  await requester('/api/v1.0/quote/snapshot',{code_list:['US.QQQ']});assert.equal(reads,1);assert.equal(calls,1);
});
test('save keeps JSON and HTML, escapes labels, and latest points at that run',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'pcr-quote-review-test-'));
  try{
    const report=await collectQuoteReview(config,{now:()=>target,requestQuote:responder});report.quotes[0].label='<script>bad()</script>';
    const saved=await saveQuoteReview({...config,outputDirectory:directory},report);
    const html=await readFile(saved.reportPath,'utf8');assert(!html.includes('<script>bad()'));assert(html.includes('&lt;script&gt;'));
    assert.equal(JSON.parse(await readFile(join(saved.directory,'snapshot.json'),'utf8')).status,'success');assert((await readFile(join(directory,'latest.html'),'utf8')).includes('runs/2026-11-27T14-45-00-000Z/index.html'));assert.deepEqual((await readdir(directory)).sort(),['latest.html','runs']);
  }finally{await rm(directory,{recursive:true,force:true});}
});
