import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretPcr,previousPcrSession,PCR_INTERPRETATION_EPSILON} from '../web/pcr-interpretation.js';
import {summaryRow} from '../web/pcr-summary-model.js';

const dates=['2026-11-20','2026-11-23','2026-11-24','2026-11-25'];
const point=(date,r5,r20,r60)=>({date,r5,r20,r60});
const ordered=(current,previous=current)=>interpretPcr([{date:dates[2],...previous},{date:dates[3],...current}],{date:dates[3]});
const rising=()=>dates.map((date,index)=>point(date,1+index*.1,.8+index*.1,2-index*.1));

test('all six current orderings are independent of price forecasts and direction classification',()=>{
  const permutations=[['r5','r20','r60'],['r5','r60','r20'],['r20','r5','r60'],['r20','r60','r5'],['r60','r5','r20'],['r60','r20','r5']];
  for(const fields of permutations){
    const current=Object.fromEntries(fields.map((field,index)=>[field,3-index])),result=ordered(current);
    assert.deepEqual(result.ordering,fields.map(field=>[field]));
    assert.equal(result.state,'flat','An ordering is not a continuation signal.');
  }
});

test('ties use only floating epsilon and stable period labels without chaining tolerance',()=>{
  assert.equal(PCR_INTERPRETATION_EPSILON,1e-12);
  const result=ordered({r5:1,r20:1+5e-13,r60:.8});
  assert.deepEqual(result.ordering,[['r5','r20'],['r60']]);
  assert.deepEqual(ordered({r5:1,r20:1,r60:1}).ordering,[['r5','r20','r60']]);
  const chained=ordered({r5:1,r20:1+7e-13,r60:1+14e-13});
  assert.equal(chained.ordering.length,2,'Floating ties do not join values more than epsilon apart.');
  const flat=ordered({r5:1,r20:1,r60:1},{r5:1+5e-13,r20:1-5e-13,r60:1});
  assert.equal(flat.fields.r5.delta,0);assert.equal(flat.fields.r20.direction,'flat');assert.equal(flat.state,'flat');
});

test('5 > 20 > 60 can coexist with all three PCRs falling, including confirmed downward persistence',()=>{
  const rows=dates.map((date,index)=>point(date,2.3-index*.1,1.8-index*.1,1.3-index*.1));
  const result=interpretPcr(rows);
  assert.deepEqual(result.ordering,[['r5'],['r20'],['r60']]);
  assert.equal(result.state,'continuation_down');
  assert.deepEqual(Object.values(result.fields).map(field=>field.direction),['down','down','down']);
  assert(Math.abs(result.fields.r5.delta+.1)<1e-12,'Delta is a ratio difference, not a percent.');
});

test('continuation needs exactly three aligned 5/20 comparisons, while 60 direction remains separate',()=>{
  const result=interpretPcr(rising());
  assert.equal(result.state,'continuation_up');assert.equal(result.fields.r60.direction,'down');
  assert.equal(result.continuation.requiredComparisons,3);assert.equal(result.continuation.complete,true);assert.deepEqual(result.continuation.dates,dates);
  const old60=rising();old60[0].r60=null;old60[1].r60=null;
  assert.equal(interpretPcr(old60).state,'continuation_up','Only current/prior 60 is required for the overall reading.');
  const interrupted=rising();interrupted[1].r20=.7;
  assert.equal(interpretPcr(interrupted).state,'early_alignment_up');
  const flatMiddle=rising();flatMiddle[1].r5=flatMiddle[0].r5;
  assert.equal(interpretPcr(flatMiddle).state,'early_alignment_up');
});

test('an exact-session gap prevents continuation instead of borrowing previous available records',()=>{
  const rows=[point('2026-11-19',.9,.7,2.1),...rising().slice(1)];
  const result=interpretPcr(rows);
  assert.equal(result.state,'early_alignment_up');assert.equal(result.continuation.complete,false);assert.deepEqual(result.continuation.missingDates,['2026-11-20']);
  const priorMissing=interpretPcr([rising()[0],rising()[1],rising()[3]]);
  assert.equal(priorMissing.previousDate,'2026-11-24');assert.equal(priorMissing.state,'insufficient');assert.equal(priorMissing.fields.r5.direction,'unknown');
});

test('Thanksgiving, weekends and the national day of mourning are skipped by exact prior-session lookup',()=>{
  assert.equal(previousPcrSession('2026-11-27'),'2026-11-25');
  assert.equal(previousPcrSession('2026-11-30'),'2026-11-27');
  assert.equal(previousPcrSession('2025-01-10'),'2025-01-08');
  const days=['2026-11-24','2026-11-25','2026-11-27','2026-11-30'];
  const result=interpretPcr(days.map((date,index)=>point(date,1+index,.5+index,.3)));
  assert.equal(result.state,'continuation_up');assert.deepEqual(result.continuation.dates,days);
});

test('an explicit non-session anchor preserves supplied dates/levels but cannot invent a trading-session change or continuation',()=>{
  const days=['2026-11-23','2026-11-24','2026-11-25','2026-11-26'],rows=days.map((date,index)=>point(date,1+index,.5+index,.3));
  const before=structuredClone(rows),result=interpretPcr(rows,{date:'2026-11-26'});
  assert.equal(result.actualDate,'2026-11-26');assert.equal(result.previousDate,'2026-11-25');assert.equal(result.fields.r5.value,4);
  assert.equal(result.state,'insufficient');assert.equal(result.fields.r5.direction,'unknown');assert.equal(result.fields.r5.delta,null);
  assert.equal(result.continuation.complete,false);assert.equal(result.continuation.reason,'non_session_anchor');assert.deepEqual(rows,before);
});

test('short-term candidates, early alignment and mixed directions follow the explicit observation policy',()=>{
  assert.equal(ordered({r5:1.2,r20:1,r60:1},{r5:1,r20:1,r60:1}).state,'short_term_up');
  assert.equal(ordered({r5:.8,r20:1.2,r60:1},{r5:1,r20:1,r60:1}).state,'short_term_down');
  assert.equal(ordered({r5:1.2,r20:1.2,r60:1},{r5:1,r20:1,r60:1}).state,'early_alignment_up');
  assert.equal(ordered({r5:.8,r20:.8,r60:1},{r5:1,r20:1,r60:1}).state,'early_alignment_down');
  assert.equal(ordered({r5:1,r20:1.2,r60:.8},{r5:1,r20:1,r60:1}).state,'mixed');
});

test('missing and nonfinite current or exact-prior fields are insufficient while valid individual arrows remain',()=>{
  for(const value of [null,undefined,NaN,Infinity,-1]){
    const currentMissing=ordered({r5:value,r20:1,r60:1});
    assert.equal(currentMissing.state,'insufficient');assert.equal(currentMissing.ordering,null);
    const priorMissing=ordered({r5:1.2,r20:1.1,r60:1},{r5:1,r20:1,r60:value});
    assert.equal(priorMissing.state,'insufficient');assert.equal(priorMissing.fields.r5.direction,'up');assert.equal(priorMissing.fields.r60.direction,'unknown');
  }
  const zero=ordered({r5:0,r20:0,r60:0});assert.equal(zero.state,'flat');assert.equal(zero.fields.r5.value,0);
  const missingMiddle=rising();missingMiddle[1].r20=null;const result=interpretPcr(missingMiddle);
  assert.equal(result.state,'early_alignment_up');assert.deepEqual(result.continuation.missingValues,[{date:dates[1],fields:['r20']}]);
});

test('explicit dates never borrow older or future values; duplicate revisions and inputs remain immutable',()=>{
  const rows=rising(),before=structuredClone(rows),expected=interpretPcr(rows,{date:dates[3]});
  assert.deepEqual(interpretPcr([...rows,point('2026-11-27',999,999,999)],{date:dates[3]}),expected);
  const absent=interpretPcr(rows,{date:'2026-11-19'});assert.equal(absent.actualDate,null);assert.equal(absent.state,'insufficient');assert.equal(absent.requestedDate,'2026-11-19');
  const revised=interpretPcr([...rows,point(dates[3],1,1,1)]);assert.equal(revised.fields.r5.value,1);
  assert.deepEqual(rows,before);assert.equal(interpretPcr([]).actualDate,null);
  assert.throws(()=>interpretPcr(rows,{date:'2026-02-30'}),/INVALID_PCR_INTERPRETATION_DATE/);
});

test('summary attaches the same interpretation to its own actual date and leaves absent historical points empty',()=>{
  const rows=dates.map((date,index)=>({date,p:50+index,c:100,r20:.6+index*.01,r60:.8}));
  rows.unshift({date:'2026-11-19',p:40,c:100,r20:.59,r60:.8});
  const entry={type:'symbol',symbol:'AMD',id:'symbol:AMD',group:'watch'};
  const latest=summaryRow(entry,{date:'2026-11-25',instrument:{rows}});
  assert.equal(latest.interpretation.actualDate,latest.actualDate);assert.equal(latest.interpretation.fields.r5.value,latest.r5);assert.equal(latest.interpretation.fields.r20.value,latest.r20);
  const missing=summaryRow(entry,{date:'2026-11-18',instrument:{rows}});
  assert.equal(missing.actualDate,null);assert.equal(missing.interpretation.actualDate,null);assert.equal(missing.interpretation.state,'insufficient');
});
