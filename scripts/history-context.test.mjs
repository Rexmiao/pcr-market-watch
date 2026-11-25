import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../web/history-context.js', import.meta.url), 'utf8');
const {historyContext} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('prior distribution excludes current and future and reports a small sample honestly', () => {
  const result = historyContext([
    {date:'2025-01-01',daily:1,r20:2,r60:null},
    {date:'2025-01-02',daily:2,r20:2,r60:3},
    {date:'2025-01-03',daily:3,r20:null,r60:5},
    {date:'2025-01-04',daily:2,r20:2,r60:4},
    {date:'2025-01-05',daily:999,r20:999,r60:999},
  ], {date:'2025-01-04'});
  assert.deepEqual(result.stats.daily, {value:2,sampleCount:3,comparisonSamples:252,complete:false,percentile:0.5,median:2,min:1,max:3});
  assert.equal(result.stats.r20.sampleCount, 2);
  assert.equal(result.stats.r20.percentile, 0.5);
  assert.equal(result.stats.r60.median, 4);
});

test('each field takes its own preceding 252 finite samples regardless of visible range', () => {
  const rows = Array.from({length:270}, (_,i) => ({date:new Date(Date.UTC(2020,0,i+1)).toISOString().slice(0,10),daily:i,r20:i<10?null:i,r60:i<25?null:i}));
  const all = historyContext(rows, {range:'all'}), short = historyContext(rows, {range:'126'});
  assert.deepEqual(short.stats, all.stats);
  assert.equal(all.stats.daily.sampleCount,252);
  assert.equal(all.stats.daily.min,17);
  assert.equal(all.stats.r20.sampleCount,252);
  assert.equal(all.stats.r60.sampleCount,244);
  assert.equal(all.stats.r60.complete,false);
});

test('null from zero call denominator stays missing; actual zero PCR remains valid', () => {
  const result = historyContext([{date:'2025-01-01',daily:0},{date:'2025-01-02',daily:null},{date:'2025-01-03',daily:1}]);
  assert.equal(result.stats.daily.sampleCount,1);
  assert.equal(result.stats.daily.median,0);
  assert.equal(result.stats.daily.percentile,1);
  const missingCurrent = historyContext([{date:'2025-01-01',daily:0},{date:'2025-01-02',daily:null}]);
  assert.equal(missingCurrent.stats.daily.value,null);
  assert.equal(missingCurrent.stats.daily.percentile,null);
});

test('date anchors to the latest actual record and missing history is not invented', () => {
  const result = historyContext([{date:'2025-01-03',daily:1},{date:'2025-01-07',daily:2}],{date:'2025-01-05'});
  assert.equal(result.actualDate,'2025-01-03');
  assert.equal(result.requestedDate,'2025-01-05');
  assert.equal(result.stats.daily.sampleCount,0);
  assert.equal(result.stats.daily.percentile,null);
});

test('yearAgo allows a preceding observation up to seven days but annual comparison is exact', () => {
  const result = historyContext([{date:'2023-06-05',daily:1},{date:'2024-06-09',daily:2}]);
  assert.equal(result.yearAgo.targetDate,'2023-06-09');
  assert.equal(result.yearAgo.actualDate,'2023-06-05');
  assert.equal(result.yearAgo.fallbackDays,4);
  assert.equal(result.yearAgo.fields.daily.difference,1);
  assert.equal(result.annual.rows[0].previousDaily,null);
  assert.equal(result.annual.rows[0].previousOriginalDate,null);
});

test('yearAgo rejects stale data and never borrows a record after target', () => {
  const result = historyContext([{date:'2023-06-01',daily:1},{date:'2023-06-10',daily:3},{date:'2024-06-09',daily:2}]);
  assert.equal(result.yearAgo.actualDate,null);
  assert.equal(result.yearAgo.fields.daily.previous,null);
  assert.equal(result.yearAgo.fields.daily.difference,null);
});

test('leap day summary clamps while annual chart retains a real missing counterpart', () => {
  const result = historyContext([{date:'2023-02-28',daily:1},{date:'2024-02-29',daily:2}]);
  assert.equal(result.yearAgo.targetDate,'2023-02-28');
  assert.equal(result.yearAgo.actualDate,'2023-02-28');
  assert.equal(result.annual.rows[0].comparisonDate,null);
  assert.equal(result.annual.rows[0].previousDaily,null);
});

test('annual chart preserves original dates and does not substitute a future row', () => {
  const result = historyContext([{date:'2023-01-01',daily:1},{date:'2024-01-01',daily:2},{date:'2024-01-02',daily:3}],{date:'2024-01-01'});
  assert.equal(result.annual.rows.length,1);
  assert.equal(result.annual.rows[0].originalDate,'2024-01-01');
  assert.equal(result.annual.rows[0].previousOriginalDate,'2023-01-01');
  assert.equal(result.annual.rows[0].previousDaily,1);
});

test('duplicates take latest revision; malformed dates and invalid values stay out', () => {
  const result = historyContext([{date:'2025-02-30',daily:5},{date:'2025-01-01',daily:1},{date:'2025-01-01',daily:3},{date:'2025-01-02',daily:Infinity}]);
  assert.equal(result.actualDate,'2025-01-02');
  assert.equal(result.stats.daily.sampleCount,1);
  assert.equal(result.stats.daily.median,3);
  assert.equal(result.point.daily,null);
});

test('empty data and invalid option inputs', () => {
  const empty = historyContext([]);
  assert.equal(empty.actualDate,null);
  assert.equal(empty.point,null);
  assert.equal(empty.yearAgo.targetDate,null);
  assert.deepEqual(empty.annual.rows,[]);
  assert.throws(() => historyContext([],{date:'2025-02-30'}));
  assert.throws(() => historyContext([],{field:'oi'}));
  assert.throws(() => historyContext([],{range:'5'}));
});
