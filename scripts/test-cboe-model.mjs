import assert from 'node:assert/strict';
import {cboeHistoryView,cboeChartConfig,CBOE_COLORS} from '../web/cboe-model.js';

const rows=[];
for(let date='2025-08-01';rows.length<310;){
  const stamp=new Date(date+'T12:00:00Z');
  if(![0,6].includes(stamp.getUTCDay())){
    const metric={daily:0.80,p:800,c:1000,r20:0.73,p20:14600,c20:20000,r60:0.65,p60:39000,c60:60000};
    rows.push({date,index:{...metric},total:{...metric,daily:1.1,r20:1.05},etp:{...metric,daily:0.9,r60:0.91}});
  }
  stamp.setUTCDate(stamp.getUTCDate()+1);date=stamp.toISOString().slice(0,10);
}
const payload={rows,asof:rows.at(-1).date,requestedEnd:rows.at(-1).date,actualEnd:rows.at(-1).date};
const original=JSON.stringify(payload);

const daily=cboeChartConfig(payload,{metric:'index',range:'126',language:'en'});
assert.equal(daily.rows.length,126*3);
assert.deepEqual([...new Set(daily.rows.map(row=>row[1]))],['Daily volume PCR','20-session volume PCR','60-session volume PCR']);
assert.equal(daily.spec.colors['Daily volume PCR'],CBOE_COLORS.daily);
assert.equal(daily.spec.colors['20-session volume PCR'],CBOE_COLORS.r20);
assert.equal(daily.spec.colors['60-session volume PCR'],CBOE_COLORS.r60);
assert.notEqual(CBOE_COLORS.daily,CBOE_COLORS.r20);
assert.equal(daily.rows.at(-2)[2],0.73,'Display supplied aggregate PCR without averaging daily ratios');
assert.equal(daily.rows.at(-2)[3],14600,'20-session tooltip uses aggregate put volume');
assert.equal(daily.rows.at(-1)[3],39000,'60-session tooltip uses aggregate put volume');
assert.equal(cboeChartConfig(payload,{metric:'total',range:'252'}).rows.at(-3)[2],1.1);
assert.equal(cboeChartConfig(payload,{metric:'etp',range:'all'}).rows.at(-1)[2],0.91);

const selected=rows[135].date;
const view=cboeHistoryView(payload,{date:selected,range:'126'});
assert.equal(view.actualEnd,selected);
assert.equal(view.visible.length,126);
assert.ok(view.visible.every(row=>row.date<=selected),'Historical selection excludes later records');
const unpublished=new Date(payload.asof+'T12:00:00Z');unpublished.setUTCDate(unpublished.getUTCDate()+1);
const future=cboeHistoryView(payload,{date:unpublished.toISOString().slice(0,10)});
assert.equal(future.selectedRow,null,'Unpublished date never acquires a substituted exact-day record');
assert.equal(future.actualEnd,payload.asof,'The historical endpoint remains the real published day');
assert.equal(cboeHistoryView(payload,{date:'2020-01-02'}).actualEnd,null);
assert.equal(cboeChartConfig(payload,{date:'2020-01-02'}).rows.length,0);

const missing=structuredClone(payload);
missing.rows.at(-1).index={daily:null,p:null,c:null,r20:null,p20:null,c20:null,r60:null,p60:null,c60:null};
assert.ok(cboeChartConfig(missing,{range:'all'}).rows.slice(-3).every(row=>row[2]===null),'Missing data stays null instead of zero');
assert.equal(cboeHistoryView({rows:[]}).point,null);
assert.throws(()=>cboeHistoryView(payload,{date:'2026-02-30'}));
assert.throws(()=>cboeHistoryView(payload,{metric:'invalid ticker'}));
assert.throws(()=>cboeHistoryView(payload,{range:'7'}));
assert.equal(JSON.stringify(payload),original,'Rendering never mutates source data');
console.log('PASS Cboe chart metrics/ranges, aggregate values, dates, missing data, colors and language');
