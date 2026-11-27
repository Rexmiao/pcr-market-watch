import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createStructureController,createStructureArchiveController,archiveHeaders,structureSymbols,structureExpiries,chartSegments,validStructureDate,layoutMarkerLabels,strikeBarWidths,gammaPriceDomain} from '../web/option-structure-model.js';

const gamma=(symbol='QQQ',window='30d')=>({schemaVersion:1,kind:'gamma',symbol,window,status:'current',calendarDate:'2026-11-26',availableExpiries:['2026-11-27','2026-12-18'],selectedExpiries:['2026-11-27','2026-12-18'],base:{checkedAt:'2026-11-26T15:00:00Z',zeroGammaPoints:[620,650],profile:[{spot:620,gex:-1},{spot:650,gex:1}]},withoutNearest:{status:'current',checkedAt:'2026-11-26T15:00:02Z',selectedExpiries:['2026-12-18']}});
const pain=(symbol='QQQ',expiry='2026-11-27')=>({kind:'max_pain',symbol,status:'current',expiry,checkedAt:'2026-11-26T15:00:00Z',maxPain:640});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const archived=(id,date,kind,scopeKey,scopeKind='expiry')=>({id,runId:'run-'+date,symbol:'QQQ',observationDate:date,kind,scopeKind,scopeKey,expiries:scopeKind==='expiry'?[scopeKey]:['2026-11-27','2026-11-30'],queriedAt:date+'T22:45:03Z',providerUpdatedAt:date+'T21:00:00Z',oiSettlementDate:null,status:'current',payload:kind==='gamma'?{...gamma().base,selectedExpiries:[scopeKey]}:{...pain(),expiry:scopeKey}});
function archiveFixture(){
  const records=[archived('new-30','2026-11-27','gamma','30d','window'),archived('new-ex','2026-11-27','gamma','30d_ex_nearest','window'),archived('new-expiry','2026-11-27','gamma','2026-11-30'),archived('new-pain','2026-11-27','max_pain','2026-11-30'),archived('old-30','2026-11-25','gamma','30d','window'),archived('old-expiry','2026-11-25','gamma','2026-11-27'),archived('old-pain','2026-11-25','max_pain','2026-11-27')],calls=[];
  const fetcher=async(path,options)=>{calls.push({path,options});const url=new URL(path,'http://fixture');if(url.pathname==='/api/structure-daily')return Response.json({monitoringEnabled:true,nextRunAt:'2026-11-28T22:45:00Z'});if(url.pathname.endsWith('/index'))return Response.json({symbol:'QQQ',dates:['2026-11-27','2026-11-25'].map(date=>({date,recordCount:records.filter(r=>r.observationDate===date).length}))});if(url.searchParams.has('id'))return Response.json({record:records.find(record=>record.id===url.searchParams.get('id'))});const date=url.searchParams.get('date');return Response.json({symbol:'QQQ',observationDate:date,records:records.filter(record=>record.observationDate===date).map(({payload,...header})=>header),runs:[]});};
  return {records,calls,fetcher};
}
test('archive dates and records use GET only and preserve the original source times',async()=>{
  const fixture=archiveFixture(),c=createStructureArchiveController({fetcher:fixture.fetcher});c.setSymbol('QQQ');await c.loadIndex();assert.equal(c.state.primary.date,'2026-11-27');assert.equal(c.state.primary.gammaId,'new-30');assert.equal(c.state.primary.painId,'new-pain');assert.equal(c.state.primary.gamma.providerUpdatedAt,'2026-11-27T21:00:00Z');assert(fixture.calls.every(call=>call.options.method==='GET'));assert(fixture.calls.every(call=>!call.path.includes('/refresh')&&!call.path.includes('/api/gamma-exposure')));
});
test('archive comparison can select a different expiry on the same date independently',async()=>{
  const fixture=archiveFixture(),c=createStructureArchiveController({fetcher:fixture.fetcher});c.setSymbol('QQQ');await c.loadIndex();await c.loadDay('comparison','2026-11-27');await c.loadRecord('comparison','gamma','new-expiry',{manual:true});assert.equal(c.state.primary.gamma.scopeKey,'30d');assert.equal(c.state.comparison.gamma.scopeKey,'2026-11-30');assert.equal(c.state.primary.gamma.observationDate,c.state.comparison.gamma.observationDate);
});
test('missing historical expiry is left empty after a date change instead of choosing another expiry',async()=>{
  const fixture=archiveFixture(),c=createStructureArchiveController({fetcher:fixture.fetcher});c.setSymbol('QQQ');await c.loadIndex();await c.loadDay('comparison','2026-11-27');await c.loadRecord('comparison','gamma','new-expiry');await c.loadDay('comparison','2026-11-25');assert.equal(c.state.comparison.gammaId,'');assert.equal(c.state.comparison.painId,'');assert.equal(c.state.comparison.reset,true);assert.equal(c.state.comparison.gamma,null);await c.loadRecord('comparison','gamma','old-expiry',{manual:true});await c.loadRecord('comparison','pain','old-pain',{manual:true});assert.equal(c.state.comparison.gamma.scopeKey,'2026-11-27');assert.equal(c.state.comparison.pain.payload.expiry,'2026-11-27');assert.equal(c.state.comparison.reset,false);
});
test('missing dates and clearing comparison never backfill or query the vendor',async()=>{
  const fixture=archiveFixture(),c=createStructureArchiveController({fetcher:fixture.fetcher});c.setSymbol('QQQ');await c.loadDay('primary','2020-01-01');assert.deepEqual(c.state.primary.headers,[]);assert.equal(c.state.primary.gamma,null);const before=fixture.calls.length;await c.loadDay('comparison','');assert.equal(fixture.calls.length,before);assert.equal(c.state.comparison.date,'');
});
test('archive list keeps repeat captures and partial observations with newest-first ordering',()=>{
  const first=archived('first','2026-11-25','gamma','30d','window'),second={...first,id:'second',queriedAt:'2026-11-25T23:45:00Z',status:'partial'};assert.deepEqual(archiveHeaders([first,second,{...first,symbol:'AMD'}],{symbol:'QQQ',date:'2026-11-25'}).map(record=>record.id),['second','first']);
});

test('symbol selection follows actual published lists, including explicit empty lists',()=>{
  assert.deepEqual(structureSymbols({items:[{symbol:'AMD'},{symbol:'AMD'}]},{items:[{type:'cboe',key:'index'},{type:'symbol',symbol:'QQQ'}]}),['AMD','QQQ']);
  assert.deepEqual(structureSymbols({items:[]},{items:[]}),[]);
  assert.deepEqual(structureSymbols({items:[{symbol:'<script>'},{symbol:'us.AMD'}]},null),[]);
});
test('expiration choices are validated, sorted and deduplicated without reviving expired or missing records',()=>{
  assert.equal(validStructureDate('2026-99-99'),false);assert.equal(validStructureDate('2026-02-30'),false);
  assert.deepEqual(structureExpiries({availableExpiries:['2026-12-18','2026-11-27','2026-02-30']},{availableExpiries:['2026-11-27']}),['2026-11-27','2026-12-18']);
});
test('zero remains a valid GEX while unavailable values split a line instead of becoming zero',()=>{
  assert.deepEqual(chartSegments([{spot:1,gex:-2},{spot:2,gex:0},{spot:3,gex:null},{spot:4,gex:2}], 'spot','gex'),[[{x:1,y:-2},{x:2,y:0}],[{x:4,y:2}]]);
});
test('close chart markers occupy separate lanes; wall-only markers do not compete for labels',()=>{
  const markers=layoutMarkerLabels([{screenX:200,text:'标的价格 633.35'},{screenX:205,text:'Γ0 652.19'},{screenX:210,text:'Γ0 ex 655.37'},{screenX:215,text:''}],{left:80,right:970});
  assert.deepEqual(markers.map(marker=>marker.labelRow),[0,1,2,null]);
  for(const marker of markers.filter(marker=>marker.labelRow!==null))assert(marker.labelX>=80&&marker.labelX+marker.labelWidth<=970);
});
test('dense marker labels are hidden instead of overlapping, while the marker itself remains represented',()=>{
  const markers=layoutMarkerLabels(Array.from({length:5},()=>({screenX:965,text:'Γ0 690.00'})),{left:80,right:970,rows:2});
  assert.equal(markers.length,5);assert.deepEqual(markers.map(marker=>marker.labelRow),[0,1,null,null,null]);
});
test('an isolated narrow strike gap does not compress every distribution bar',()=>{
  const widths=strikeBarWidths([100,101,101.01,110,120],{min:95,max:125,pixels:900,series:2});
  assert(widths.get(101)<.13);assert.equal(widths.get(120),12);assert.equal(widths.size,5);
  assert(Math.abs(widths.get(101)*2-0.24)<1e-9);
});
test('cropped numeric spacing stays local and single-strike widths remain bounded',()=>{
  const widths=strikeBarWidths([110,120],{min:100,max:130,pixels:900,series:2});
  assert.deepEqual([...widths.values()],[12,12]);
  assert.equal(strikeBarWidths([110],{min:100,max:130,pixels:900,series:2}).get(110),12);
  assert.equal(strikeBarWidths([110],{min:100,max:100,pixels:900,series:2}).size,0);
});
test('automatic range includes the AMD call wall outside the old near-spot view',()=>{
  const snapshot={underlyingPrice:405.68,callWall:490,putWall:400,zeroGammaPoints:[398]},before=structuredClone(snapshot);
  const domain=gammaPriceDomain([snapshot],{includeZeros:false});
  assert(Math.abs(domain[0]-337.5694)<1e-8);assert(Math.abs(domain[1]-497.2586)<1e-8);
  assert(domain[0]<400&&domain[1]>490);assert.deepEqual(snapshot,before);
  assert.deepEqual(gammaPriceDomain([snapshot],{mode:'near'}),[405.68*.85,405.68*1.15]);
  assert.equal(gammaPriceDomain([snapshot],{mode:'all'}),undefined);
});
test('profile automatic range includes both snapshots and every positive zero without changing source points',()=>{
  const base={underlyingPrice:100,callWall:120,putWall:80,zeroGammaPoints:[75]},without={underlyingPrice:110,callWall:150,putWall:70,zeroGammaPoints:[65,175,null,-1,0]};
  assert.deepEqual(gammaPriceDomain([base,without]),[59.5,180.5]);
  assert.deepEqual(gammaPriceDomain([without],{includeZeros:false}),[66,154]);
});
test('automatic range falls back usefully for missing spots, ignores nonpositive levels and does not clamp to source points',()=>{
  assert.deepEqual(gammaPriceDomain([{callWall:100,putWall:100}]),[83.5,116.5]);
  assert.deepEqual(gammaPriceDomain([{callWall:.1}]),[0,.65]);
  assert.equal(gammaPriceDomain([{underlyingPrice:null,callWall:0,putWall:-50,zeroGammaPoints:[null,NaN,Infinity]}]),undefined);
  assert.equal(gammaPriceDomain([{callWall:100}],{mode:'near'}),undefined);
  assert.deepEqual(gammaPriceDomain([{callWall:490,items:[{strike:400},{strike:410}]}]),[409.15,570.85]);
});
test('opening the page uses cache-only GET; a refresh is an explicit bounded POST',async()=>{
  const calls=[],c=createStructureController({fetcher:async(url,options)=>{calls.push({url,options});return Response.json(gamma());}});
  c.setSelection({symbol:'QQQ'});await c.load('gamma');assert.equal(calls[0].url,'/api/gamma-exposure?symbol=QQQ&window=30d');assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.body,undefined);
  await c.load('gamma',true);assert.equal(calls[1].url,'/api/gamma-exposure/refresh');assert.deepEqual(JSON.parse(calls[1].options.body),{symbol:'QQQ',window:'30d'});assert.equal(c.state.gamma.payload.base.checkedAt,'2026-11-26T15:00:00Z');
});
test('changing expiration scope clears only Gamma, and late responses cannot overwrite the new scope',async()=>{
  const old=deferred(),c=createStructureController({fetcher:async url=>url.includes('window=30d')?old.promise:Response.json(gamma('QQQ','7d'))});
  c.setSelection({symbol:'QQQ'});c.state.pain.payload=pain();const request=c.load('gamma');c.setSelection({window:'7d'});assert.equal(c.state.gamma.payload,null);assert.equal(c.state.pain.payload.maxPain,640);await c.load('gamma');old.resolve(Response.json(gamma()));await request;assert.equal(c.state.gamma.payload.window,'7d');assert.equal(c.state.gamma.busy,false);
});
test('a failed same-scope refresh retains original source times without relabeling it current',async()=>{
  let fail=false;const c=createStructureController({fetcher:async()=>{if(fail)throw Error('offline');return Response.json(gamma());}});c.setSelection({symbol:'QQQ'});await c.load('gamma');fail=true;await c.load('gamma',true);assert.equal(c.state.gamma.retained,true);assert.equal(c.state.gamma.error,'READ_FAILED');assert.equal(c.state.gamma.payload.base.checkedAt,'2026-11-26T15:00:00Z');assert.deepEqual(c.state.gamma.payload.base.zeroGammaPoints,[620,650]);
});
test('Max Pain has an independent expiry; changing symbols resets it without reusing the old date',async()=>{
  const c=createStructureController({fetcher:async()=>Response.json(pain())});c.setSelection({symbol:'QQQ',expiry:'2026-11-27'});await c.load('pain');c.setSelection({expiry:'2026-12-18'});assert.equal(c.state.pain.payload,null);assert.equal(c.state.expiry,'2026-12-18');c.setSelection({symbol:'AMD'});assert.equal(c.state.expiry,'');assert.equal(c.state.pain.payload,null);
});
test('rate limits remain attached to an operation across scope changes and do not block the other operation',async()=>{
  const c=createStructureController({fetcher:async url=>url.startsWith('/api/gamma')?Response.json({retryAfterSeconds:90},{status:429}):Response.json(pain())});c.setSelection({symbol:'QQQ'});await c.load('gamma',true);const retry=c.state.gamma.retryAt;assert(retry>Date.now()+80000);c.setSelection({window:'all'});assert.equal(c.state.gamma.retryAt,retry);assert.equal(c.state.pain.retryAt,0);assert.equal(await c.load('pain'),true);
});
test('a mismatched symbol, scope or Max Pain expiry is not displayed',async()=>{
  const c=createStructureController({fetcher:async()=>Response.json(gamma('AMD'))});c.setSelection({symbol:'QQQ'});assert.equal(await c.load('gamma'),false);assert.equal(c.state.gamma.payload,null);
  c.setSelection({expiry:'2026-12-18'});assert.equal(await c.load('pain'),false);assert.equal(c.state.pain.payload,null);
});
test('empty ex-nearest data is preserved as unavailable rather than replaced with the full curve',async()=>{
  const p=gamma('QQQ','nearest');p.withoutNearest={status:'unavailable',reason:'NO_REMAINING_EXPIRIES',profile:[],selectedExpiries:[]};const c=createStructureController({fetcher:async()=>Response.json(p)});c.setSelection({symbol:'QQQ',window:'nearest'});await c.load('gamma');assert.equal(c.state.gamma.payload.withoutNearest.profile.length,0);assert.equal(c.state.gamma.payload.withoutNearest.reason,'NO_REMAINING_EXPIRIES');
});
test('markup keeps distinct chart axes, independent Max Pain expiry, clear units and public navigation',async()=>{
  const html=await readFile(new URL('../web/option-structure.html',import.meta.url),'utf8'),js=await readFile(new URL('../web/option-structure.js',import.meta.url),'utf8');
  for(const id of ['structure-symbol','gamma-window','gamma-price-range','gamma-profile','gamma-strikes','gamma-bars-scope','max-pain-expiry','max-pain-chart'])assert(html.includes(`id="${id}"`));
  assert(html.indexOf('id="gamma-distribution"')<html.indexOf('id="gamma-profile"'));
  assert(html.includes('id="gamma-distribution-meta"'));assert(js.includes('showLabel:true'));assert(js.includes("color:colors.net,point:true"));
  assert(js.includes('Provider units (normalization undisclosed)'));assert(js.includes('Snapshot spot is undisclosed'));assert(js.includes('GEX 依赖做市商持仓方向假设'));assert(!js.includes('setInterval(()=>controller.load'));
  for(const page of ['index','charts','options-monitor','quote-reviews','market-brief'])assert((await readFile(new URL(`../web/${page}.html`,import.meta.url),'utf8')).includes('href="/option-structure.html"'));
});
