import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const project = existsSync(resolve('web/model.js')) ? process.cwd() : resolve('pcr-dashboard-site');
const source = readFileSync(resolve(project, 'web/model.js'), 'utf8');
const model = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const data = JSON.parse(readFileSync(resolve(project, 'data/seed.json'), 'utf8'));
const baseState = { symbol: 'NVDA', range: 'all', volumeWindow: 'day', date: '2026-11-20' };
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
const cases = [];
function test(name, run) { cases.push({ name, run }); }

test('Historical selection uses the November 13 values, not the latest values', () => {
  const view = model.getView(data, { ...baseState, date: '2026-11-13' });
  near(view.current.p / view.current.c, 0.7635709672287274);
  near(view.current.r20, 0.749015227095778);
  near(view.current.r60, 0.652746526908369);
  near(view.current.rank, 0.9841269841269841);
  assert.equal(view.actualDate, '2026-11-13');
});

test('A selected Monday includes only Monday in its calendar-week volume', () => {
  for (const instrument of Object.values(data.instruments)) {
    const day = model.volumeAt(instrument, '2026-11-16', 'day');
    const week = model.volumeAt(instrument, '2026-11-16', 'week');
    assert.equal(week.samples, 1);
    assert.equal(week.start, '2026-11-16');
    assert.equal(week.end, '2026-11-16');
    assert.equal(week.p, day.p);
    assert.equal(week.c, day.c);
  }
});

test('Historical rolling volumes agree with independent prefix sums for all seven symbols', () => {
  for (const instrument of Object.values(data.instruments)) {
    const prefix = instrument.rows.filter(row => row.date <= '2026-11-13');
    for (const size of [20, 60]) {
      const expected = prefix.slice(-size);
      const actual = model.volumeAt(instrument, '2026-11-13', String(size));
      assert.equal(actual.p, expected.reduce((sum, row) => sum + row.p, 0));
      assert.equal(actual.c, expected.reduce((sum, row) => sum + row.c, 0));
      assert.equal(actual.end, '2026-11-13');
      assert.equal(actual.samples, size);
    }
  }
});

test('20/60-day windows remain null before enough observations exist', () => {
  for (const instrument of Object.values(data.instruments)) {
    assert.equal(model.volumeAt(instrument, '2024-12-27', '20').ratio, null);
    assert.ok(model.volumeAt(instrument, '2024-12-30', '20').ratio > 0);
    assert.equal(model.volumeAt(instrument, '2025-02-27', '60').ratio, null);
    assert.ok(model.volumeAt(instrument, '2025-02-28', '60').ratio > 0);
  }
  const first = model.buildConfigs(data, { ...baseState, date: '2024-12-02', volumeWindow: '20' });
  assert.ok(first[0].rows.every(row => row[2] === null));
  assert.equal(first[1].rows.length, 3);
  assert.ok(first[1].rows[0][2] > 0);
  assert.equal(first[1].rows[1][2], null);
  assert.equal(first[1].rows[2][2], null);
});

test('Historical percentile is not created during warmup and is independent of visible range', () => {
  assert.equal(model.getView(data, { ...baseState, date: '2025-12-31' }).current.rank, null);
  near(model.getView(data, { ...baseState, date: '2026-01-02' }).current.rank, 0.25);
  for (const range of ['126', '252', 'all']) {
    near(model.getView(data, { ...baseState, date: '2026-11-13', range }).current.rank, 0.9841269841269841);
  }
});

test('Historical selection never borrows the latest OI snapshot', () => {
  const config = model.buildConfigs(data, { ...baseState, date: '2026-11-13' })[0];
  const oi = config.rows.filter(row => row[1] === 'OI 未平仓量 PCR（独立快照）');
  assert.equal(oi.length, 7);
  assert.ok(oi.every(row => row[2] === null && row[3] === null && row[4] === null));
  assert.ok(oi.every(row => row[6] === '该日历史持仓快照未保存'));
});

test('Latest view preserves independent OI snapshot labels', () => {
  const config = model.buildConfigs(data, { ...baseState, date: data.asof })[0];
  const oi = config.rows.filter(row => row[1] === 'OI 未平仓量 PCR（独立快照）');
  assert.equal(oi.length, 7);
  assert.ok(oi.every(row => Number.isFinite(row[2])));
  assert.ok(oi.every(row => row[6].includes('OI')));
});

test('Daily, 20-day and 60-day series stop on the selected day without exceeding chart limits', () => {
  for (const symbol of Object.keys(data.instruments)) {
    for (const range of ['126', '252', 'all']) {
      const config = model.buildConfigs(data, { ...baseState, symbol, range, date: '2026-11-13' })[1];
      assert.ok(config.rows.length <= 2000);
      assert.deepEqual([...new Set(config.rows.map(row => row[1]))], ['每日成交量 PCR', '20 日成交量 PCR', '60 日成交量 PCR']);
      assert.ok(config.rows.every(row => row[0] <= '2026-11-13'));
      for (const series of ['每日成交量 PCR', '20 日成交量 PCR', '60 日成交量 PCR']) {
        assert.equal(config.rows.filter(row => row[1] === series).at(-1)[0], '2026-11-13');
      }
    }
  }
  assert.equal(model.buildConfigs(data, baseState)[1].rows.length, 1485);
});

test('An in-range weekend resolves to Friday while preserving the requested date', () => {
  for (const date of ['2026-11-14', '2026-11-15']) {
    const view = model.getView(data, { ...baseState, date });
    assert.equal(view.requestedDate, date);
    assert.equal(view.actualDate, '2026-11-13');
  }
});

test('The weekend immediately after the latest quote resolves to the latest available Friday', () => {
  for (const date of ['2026-11-21', '2026-11-22']) {
    assert.equal(model.resolveDate(data, date), '2026-11-20');
  }
});

test('Malformed and nonexistent calendar dates are rejected', () => {
  for (const date of ['', '2026-2-03', '2026-02-30', '2025-02-29', '2026-13-01', '0000-00-00']) {
    assert.throws(() => model.resolveDate(data, date));
  }
  assert.throws(() => model.resolveDate(data, '2024-12-01'));
});

let failures = 0;
for (const { name, run } of cases) {
  try { run(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.error(`FAIL ${name}\n  ${error.message}`); }
}
console.log(`${cases.length - failures}/${cases.length} model checks passed`);
process.exitCode = failures ? 1 : 0;
