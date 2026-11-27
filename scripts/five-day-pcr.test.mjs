import test from 'node:test';
import assert from 'node:assert/strict';
import {withFiveSessionPcr,pcrSession} from '../web/rolling-pcr.js';
import {volumeAt,getView,buildConfigs} from '../web/model.js';
import {cboeHistoryView,cboeChartConfig,referenceHistoryPayload} from '../web/cboe-model.js';
import {summaryRow} from '../web/pcr-summary-model.js';
import {historyContext} from '../web/history-context.js';

const dates=['2026-11-19','2026-11-20','2026-11-23','2026-11-24','2026-11-25'];
const fixture=()=>dates.map((date,i)=>({date,p:[10,20,30,40,100][i],c:[10,10,10,10,1000][i],r20:.6,r60:.5,p20:600,c20:1000,p60:1500,c60:3000}));
const macro=(rows,key='index')=>({rows:rows.map(({date,...value})=>({date,[key]:{...value,daily:value.c>0?value.p/value.c:null}}))});
const symbol={type:'symbol',symbol:'AMD',id:'symbol:AMD',group:'watch'};
const category={type:'cboe',key:'index',id:'cboe:index',group:'cboe'};

test('five sessions aggregate raw put/call counts rather than average ratios and never mutate old windows',()=>{
  const rows=fixture(),before=JSON.stringify(rows),last=withFiveSessionPcr(rows).at(-1);
  assert.equal(last.p5,200);assert.equal(last.c5,1040);assert.equal(last.r5,200/1040);
  assert.notEqual(last.r5,rows.reduce((sum,row)=>sum+row.p/row.c,0)/5);
  assert.equal(last.r20,.6);assert.equal(last.r60,.5);assert.equal(JSON.stringify(rows),before);
  assert.equal(withFiveSessionPcr(rows.slice(0,4)).at(-1).r5,null);
});

test('OCC keeps its recorded-session rule; Cboe requires each calendar session including holiday handling',()=>{
  const missing=fixture().filter(row=>row.date!=='2026-11-24');
  missing.unshift({date:'2026-11-18',p:1,c:2});
  assert(Number.isFinite(withFiveSessionPcr(missing).at(-1).r5));
  const strict=withFiveSessionPcr(missing,{strictSessions:true}).at(-1);
  assert.equal(strict.r5,null);assert.equal(strict.r5Reason,'missing_session');
  assert.equal(pcrSession('2026-11-26'),false);
  assert.equal(pcrSession('2025-01-09'),false);
  const holidayWindow=fixture().slice(1).concat({date:'2026-11-27',p:50,c:50});
  assert(Number.isFinite(withFiveSessionPcr(holidayWindow,{strictSessions:true}).at(-1).r5));
  const unavailable=fixture().map(row=>({...row}));unavailable[2].available=false;
  assert.equal(withFiveSessionPcr(unavailable,{strictSessions:true}).at(-1).r5Reason,'missing_volume');
});

test('missing/invalid/unsafe counts remain blank, zero puts remain valid and zero aggregate calls stay undefined',()=>{
  for(const value of [null,undefined,-1,1.5,Infinity]){
    const rows=fixture();rows[1].p=value;
    const last=withFiveSessionPcr(rows).at(-1);assert.equal(last.r5,null);assert.equal(last.p5,null);
  }
  const zeroPut=fixture().map(row=>({...row,p:0}));assert.equal(withFiveSessionPcr(zeroPut).at(-1).r5,0);
  const zeroCall=fixture().map(row=>({...row,c:0})),last=withFiveSessionPcr(zeroCall).at(-1);
  assert.equal(last.c5,0);assert.equal(last.r5,null);assert.equal(last.r5Reason,'zero_call');
  const overflow=fixture().map(row=>({...row,p:Number.MAX_SAFE_INTEGER}));
  assert.equal(withFiveSessionPcr(overflow).at(-1).r5Reason,'unsafe_volume');
});

test('legacy put/call aliases and complete derived EQUITY windows preserve provenance',()=>{
  const rows=fixture().map(({date,p,c},i)=>({date,put:p,call:c,derived:i===1}));
  const last=withFiveSessionPcr(rows,{strictSessions:true}).at(-1);
  assert.equal(last.r5,200/1040);assert.equal(last.derived5,true);
  const payload=macro(rows,'equity'),view=cboeHistoryView(payload,{metric:'equity'});
  assert.equal(view.point.r5,200/1040);assert.equal(view.lastRow.equity.derived5,true);
  const summary=summaryRow({...category,key:'equity',id:'cboe:equity'},{date:dates.at(-1),cboeHistory:payload});
  assert.equal(summary.r5,200/1040);assert.equal(summary.derived,true);
});

test('historical date and display range cannot borrow later raw counts or drop the five-session warmup',()=>{
  const rows=fixture().concat({date:'2026-11-27',p:999999,c:1,r20:9,r60:9});
  const data={asof:'2026-11-27',calendarDate:'2026-11-27',instruments:{AMD:{rows}}};
  const state={date:'2026-11-25',symbol:'AMD',range:'126',volumeWindow:'5',language:'en'};
  const view=getView(data,state);assert.equal(view.current.r5,200/1040);
  assert.equal(volumeAt(data.instruments.AMD,'2026-11-25','5').ratio,200/1040);
  assert.equal(summaryRow(symbol,{date:'2026-11-25',instrument:data.instruments.AMD}).r5,200/1040);
  const payload=macro(rows),market=cboeHistoryView(payload,{metric:'index',date:'2026-11-25',range:'126'});
  assert.equal(market.point.r5,200/1040);assert.equal(market.records.length,5);
  const chart=cboeChartConfig(payload,{metric:'index',date:'2026-11-25',range:'126',language:'en'});
  assert.equal(chart.rows.filter(row=>row[1]==='5-session volume PCR').at(-1)[2],200/1040);
  assert(chart.rows.every(row=>row[0]<='2026-11-25'));
  const ref=referenceHistoryPayload({symbol:'AMD',instrument:{rows}},'symbol:AMD');
  assert.equal(ref.rows[4]['symbol:AMD'].r5,200/1040);
});

test('5-session selected-window validation does not create incomplete or missing-date volume',()=>{
  const rows=fixture();assert.equal(volumeAt({rows:rows.slice(0,4)},dates[3],'5').ratio,null);
  assert.equal(volumeAt({rows},'2026-11-26','5').ratio,null);
  rows[2].p=null;assert.equal(volumeAt({rows},dates.at(-1),'5').ratio,null);
});

test('five-session historical statistics use their own prior 252 observations and preserve annual matching',()=>{
  const rows=Array.from({length:270},(_,i)=>({date:new Date(Date.UTC(2024,0,i+1)).toISOString().slice(0,10),r5:i<4?null:i,daily:1,r20:2,r60:3}));
  const all=historyContext(rows,{field:'r5',range:'all'}),short=historyContext(rows,{field:'r5',range:'126'});
  assert.deepEqual(all.stats.r5,short.stats.r5);assert.equal(all.stats.r5.sampleCount,252);assert.equal(all.stats.r5.max,268);assert.equal(all.stats.r5.value,269);
  const annual=historyContext([{date:'2025-11-25',r5:.6},{date:'2026-11-25',r5:.9},{date:'2026-11-27',r5:999}],{date:'2026-11-25',field:'r5'});
  assert.equal(annual.yearAgo.fields.r5.previous,.6);assert(Math.abs(annual.yearAgo.fields.r5.difference-.3)<1e-12);assert.equal(annual.annual.rows[0].previousR5,.6);
});

test('four history series retain all 600 observations within the bounded 3000-row chart limit',()=>{
  const rows=Array.from({length:600},(_,i)=>({date:new Date(Date.UTC(2024,0,i+1)).toISOString().slice(0,10),p:50,c:100,r20:.5,r60:.5}));
  const data={asof:rows.at(-1).date,instruments:{AMD:{rows}}},state={symbol:'AMD',date:data.asof,range:'all',volumeWindow:'5',language:'en'};
  const config=buildConfigs(data,state)[1];assert.equal(config.rows.length,2400);assert.equal(config.spec.colors['5-session volume PCR'],'#208980');
  const excess=Array.from({length:751},(_,i)=>({...rows[0],date:new Date(Date.UTC(2024,0,i+1)).toISOString().slice(0,10)}));
  assert.throws(()=>buildConfigs({asof:excess.at(-1).date,instruments:{AMD:{rows:excess}}},{...state,date:excess.at(-1).date}),/HISTORY_TOO_LONG/);
});
