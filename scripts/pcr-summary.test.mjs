import test from 'node:test';
import assert from 'node:assert/strict';
import {summaryEntries,summaryRow,previousSummarySession} from '../web/pcr-summary-model.js';
import {createPcrSummaryController} from '../web/pcr-summary.js';

const symbol={type:'symbol',symbol:'AMD',id:'symbol:AMD',group:'watch'};
const cboe={type:'cboe',key:'index',id:'cboe:index',group:'cboe'};
const instrument=(rows)=>({rows});
const row=(date,p,c,r20=.6,r60=.5)=>({date,p,c,r20,r60});
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
const history=(date,daily)=>({requestedEnd:date,asof:date,checkedAt:date+'T22:00:00Z',rows:[{date,index:{daily,r20:daily,r60:daily}}]});

test('summary follows both editable lists, deduplicates references before watchlist, and keeps empty lists empty',()=>{
  const values=summaryEntries([{type:'symbol',symbol:'qqq'},{type:'cboe',key:'equity'},{type:'symbol',symbol:'IWM'},{type:'cboe',key:'equity'}],[{symbol:'QQQ'},{symbol:'SNDK'},{symbol:'AMD'}]);
  assert.deepEqual(values.map(value=>[value.id,value.group]),[['cboe:equity','cboe'],['symbol:QQQ','market'],['symbol:IWM','market'],['symbol:SNDK','watch'],['symbol:AMD','watch']]);
  assert.deepEqual(summaryEntries([],[]),[]);
  assert.deepEqual(summaryEntries([{type:'cboe',key:'unknown'}],[{symbol:'bad/ticker'}]),[]);
});

test('holiday selection compares the actual published day against its exact preceding session',()=>{
  const view=summaryRow(symbol,{date:'2026-11-26',instrument:instrument([row('2026-11-24',50,100),row('2026-11-25',80,100)])});
  assert.equal(view.requestedDate,'2026-11-26');assert.equal(view.actualDate,'2026-11-25');assert.equal(view.previousDate,'2026-11-24');assert(Math.abs(view.delta-.3)<1e-12);
  assert.equal(previousSummarySession('2026-11-27'),'2026-11-25');
  assert.equal(previousSummarySession('2026-11-30'),'2026-11-27');
  assert.equal(previousSummarySession('2025-01-10'),'2025-01-08');
  assert.equal(previousSummarySession('2026-03-09'),'2026-03-06');
});

test('a missing prior session is never replaced by the previous available record',()=>{
  const view=summaryRow(symbol,{date:'2026-11-25',instrument:instrument([row('2026-11-23',10,100),row('2026-11-25',80,100)])});
  assert.equal(view.daily,.8);assert.equal(view.delta,null);assert.equal(view.previousDate,'2026-11-24');assert.equal(view.comparison,'missing_previous');
  const grid=summaryRow(cboe,{date:'2026-11-24',cboeHistory:{rows:[{date:'2026-11-23',available:true,index:{daily:1,r20:1,r60:1}},{date:'2026-11-24',available:false,index:{daily:null,r20:null,r60:null}}]}});assert.equal(grid.actualDate,'2026-11-23');assert.equal(grid.daily,1,'A missing session grid row is not a source observation.');
});

test('zero puts stay zero; zero calls preserve the latest actual date and never borrow an earlier ratio',()=>{
  const data=instrument([row('2026-11-24',100,100,1,1),row('2026-11-25',0,100,0,.8)]);
  const zero=summaryRow(symbol,{date:'2026-11-25',instrument:data});assert.equal(zero.daily,0);assert.equal(zero.delta,-1);assert.equal(zero.percentile,0);
  data.rows.push(row('2026-11-27',100,0,null,null));const missing=summaryRow(symbol,{date:'2026-11-27',instrument:data});
  assert.equal(missing.actualDate,'2026-11-27');assert.equal(missing.daily,null);assert.equal(missing.delta,null);assert.equal(missing.percentile,null);assert.equal(missing.comparison,'current_unavailable');
});

test('20/60 source values are retained independently; rank uses up to 252 preceding valid 20-session values',()=>{
  const start=new Date('2025-01-01T12:00:00Z'),rows=[];
  for(let i=0;i<280;i++){const date=new Date(start);date.setUTCDate(date.getUTCDate()+i);rows.push(row(date.toISOString().slice(0,10),50,100,i<27?99:1,i));}
  const current=rows.at(-1);current.r20=1;current.r60=7;
  const view=summaryRow(symbol,{date:current.date,instrument:instrument(rows)});
  assert.equal(view.samples,252);assert.equal(view.percentile,.5);assert.equal(view.r20,1);assert.equal(view.r60,7);assert.equal(view.trend,'lower');
  rows.push(row('2026-11-25',1,100,999,999));const withFuture=summaryRow(symbol,{date:current.date,instrument:instrument(rows)});assert.equal(withFuture.percentile,.5);assert.equal(withFuture.actualDate,current.date);
});

test('small or empty prior samples are honest, and Cboe and OCC rows never borrow each other',()=>{
  const empty=summaryRow(cboe,{date:'2026-11-25',cboeHistory:history('2026-11-25',1.2),instrument:instrument([row('2026-11-25',10,100,99,99)])});
  assert.equal(empty.samples,0);assert.equal(empty.percentile,null);assert.equal(empty.daily,1.2);
  const short=summaryRow(symbol,{date:'2026-11-25',instrument:instrument([row('2026-11-24',50,100,1,.8),row('2026-11-25',80,100,1,.9)])});assert.equal(short.samples,1);assert.equal(short.percentile,.5);
  const onlyOcc=summaryRow(cboe,{date:'2026-11-25',instrument:instrument([row('2026-11-25',10,100)])});assert.equal(onlyOcc.actualDate,null);
  const zeroDenominator=summaryRow(cboe,{date:'2026-11-25',cboeHistory:{rows:[{date:'2026-11-25',index:{daily:1.2,c:0,r20:1,c20:0,r60:1,c60:0}}]}});assert.equal(zeroDenominator.actualDate,'2026-11-25');assert.equal(zeroDenominator.daily,null);assert.equal(zeroDenominator.r20,null);assert.equal(zeroDenominator.r60,null);
  const derived=summaryRow({...cboe,key:'equity',id:'cboe:equity'},{date:'2026-11-25',cboeHistory:{rows:[{date:'2026-11-25',equity:{daily:.6,r20:.65,r60:.62,derived20:true}}]}});assert.equal(derived.derived,true);assert.equal(derived.r20,.65);
});

test('summary cache reads are GET-only, bounded to two symbols, and never initialize default membership',async()=>{
  const requests=[],releases=[];let active=0,max=0;
  const controller=createPcrSummaryController({fetcher:async(url,options)=>{requests.push({url,options});active++;max=Math.max(max,active);await new Promise(resolve=>releases.push(resolve));active--;const code=new URL(url,'https://fixture').searchParams.get('symbol');return Response.json({symbol:code,instrument:null,checkedAt:null});}});
  controller.updateWatch({items:[],date:'2026-11-25',ready:true,instruments:{}});controller.updateMarket({items:[],ready:true});await flush();assert.equal(requests.length,0);
  controller.updateMarket({items:['AAA','BBB','CCC'].map(symbol=>({type:'symbol',symbol})),ready:true});await flush();assert.equal(requests.length,2);assert.equal(max,2);
  while(releases.length)releases.shift()();await flush();assert.equal(requests.length,3);while(releases.length)releases.shift()();await flush();
  assert.equal(controller.rows.length,3);assert(controller.rows.every(value=>value.actualDate===null));
  assert(requests.every(({url,options})=>!url.includes('refresh')&&options.method===undefined&&options.headers['x-pcr-cache-only']==='1'));controller.dispose();
});

test('removing a ticker while its cache is loading cannot resurrect its row',async()=>{
  let release;const controller=createPcrSummaryController({fetcher:async()=>{await new Promise(resolve=>release=resolve);return Response.json({symbol:'IWM',instrument:instrument([row('2026-11-25',50,100)])});}});
  controller.updateWatch({items:[],date:'2026-11-25',ready:true,instruments:{}});controller.updateMarket({items:[{type:'symbol',symbol:'IWM'}],ready:true});await flush();
  controller.updateMarket({items:[],ready:true});await flush();release();await flush();assert.deepEqual(controller.rows,[]);controller.dispose();
});

test('late historical responses cannot overwrite the currently selected date',async()=>{
  const releases=new Map(),calls=[];const controller=createPcrSummaryController({fetcher:async url=>{const date=new URL(url,'https://fixture').searchParams.get('end');calls.push(date);await new Promise(resolve=>releases.set(date,resolve));return Response.json(history(date,date.endsWith('24')?.4:.8));}});
  controller.updateMarket({items:[{type:'cboe',key:'index'}],ready:true});controller.updateWatch({items:[],instruments:{},ready:true,date:'2026-11-24'});await flush();
  controller.updateWatch({date:'2026-11-25'});await flush();releases.get('2026-11-25')();await flush();assert.equal(controller.rows[0].daily,.8);
  releases.get('2026-11-24')();await flush();assert.equal(controller.rows[0].actualDate,'2026-11-25');assert.equal(controller.rows[0].daily,.8);assert.deepEqual(calls,['2026-11-24','2026-11-25']);controller.dispose();
});

test('fresh app data beats an older same-day reference response and a newer-dated panel cannot hide missing future records',async()=>{
  const calls=[];const controller=createPcrSummaryController({fetcher:async url=>{calls.push(url);return Response.json(history('2026-11-25',1.1));}});
  controller.updateWatch({items:[{symbol:'AMD'}],date:'2026-11-25',ready:true,instruments:{AMD:instrument([row('2026-11-25',90,100)])},checkedAt:'2026-11-25T22:00:00Z'});
  controller.updateMarket({items:[{type:'symbol',symbol:'AMD'},{type:'cboe',key:'index'}],ready:true,symbols:{AMD:{instrument:instrument([row('2026-11-25',50,100)]),checkedAt:'2026-11-25T20:00:00Z'}},history:{...history('2026-11-20',.5),asof:'2026-11-25'}});await flush();
  assert.equal(controller.rows.find(value=>value.symbol==='AMD').daily,.9);assert.equal(controller.rows.find(value=>value.type==='cboe').actualDate,'2026-11-25');assert.equal(calls.length,1);controller.dispose();
});

test('a failed cache reread retains the same symbol history and its original query time',async()=>{
  let fail=false;const controller=createPcrSummaryController({fetcher:async()=>{if(fail)throw Error('offline');return Response.json({symbol:'IWM',checkedAt:'2026-11-25T22:00:00Z',instrument:instrument([row('2026-11-25',80,100)])});}});
  controller.updateWatch({items:[],instruments:{},ready:true,date:'2026-11-25'});controller.updateMarket({items:[{type:'symbol',symbol:'IWM'}],ready:true});await flush();assert.equal(controller.rows[0].daily,.8);
  fail=true;controller.refresh();await flush();assert.equal(controller.rows[0].daily,.8);assert.equal(controller.rows[0].checkedAt,'2026-11-25T22:00:00Z');assert.equal(controller.rows[0].failed,true);controller.dispose();
});
