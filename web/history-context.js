// Historical context for normalized PCR observations. All comparisons are
// anchored to an actually recorded date; this module never fills missing days.
export const HISTORY_FIELDS = ['daily', 'r5', 'r20', 'r60'];
const DAY_MS = 86400000;
const PRIOR_SAMPLES = 252;

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const stamp = Date.parse(value + 'T12:00:00Z');
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value;
}

const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const valuesOf = row => Object.fromEntries(HISTORY_FIELDS.map(field => [field, finite(row?.[field])]));

function previousYearDate(date, clampLeapDay = false) {
  const year = String(Number(date.slice(0, 4)) - 1).padStart(4, '0');
  const candidate = year + date.slice(4);
  if (validDate(candidate)) return candidate;
  return clampLeapDay && date.slice(5) === '02-29' ? year + '-02-28' : null;
}

function distribution(prior, value) {
  const samples = prior.slice(-PRIOR_SAMPLES), sorted = [...samples].sort((a, b) => a - b);
  const sampleCount = samples.length, middle = Math.floor(sampleCount / 2);
  const below = value === null ? 0 : samples.filter(sample => sample < value).length;
  const equal = value === null ? 0 : samples.filter(sample => sample === value).length;
  return {
    value,
    sampleCount,
    comparisonSamples: PRIOR_SAMPLES,
    complete: sampleCount === PRIOR_SAMPLES,
    percentile: sampleCount && value !== null ? (below + equal * 0.5) / sampleCount : null,
    median: sampleCount ? sampleCount % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2 : null,
    min: sampleCount ? sorted[0] : null,
    max: sampleCount ? sorted.at(-1) : null,
  };
}

/**
 * rows: [{date:'YYYY-MM-DD',daily:number|null,r20:number|null,r60:number|null}]
 * range controls visible annual rows only; statistics always use up to the
 * preceding 252 finite observations per field, independently of visible range.
 * field is retained for callers selecting one series; every field is returned.
 */
export function historyContext(rows, {metric = null, date = null, field = 'daily', range = '252'} = {}) {
  if (!HISTORY_FIELDS.includes(field)) throw Error('INVALID_HISTORY_FIELD');
  if (!['126', '252', 'all'].includes(String(range))) throw Error('INVALID_HISTORY_RANGE');
  if (date !== null && !validDate(date)) throw Error('INVALID_HISTORY_DATE');

  // Last occurrence wins for duplicate dates, preserving the latest revision.
  const byDate = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (validDate(row?.date)) byDate.set(row.date, {date: row.date, ...valuesOf(row)});
  }
  const records = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const requestedDate = date || records.at(-1)?.date || null;
  const prefix = records.filter(row => requestedDate && row.date <= requestedDate);
  const current = prefix.at(-1) || null, actualDate = current?.date || null;
  const point = current ? valuesOf(current) : null;
  const prior = prefix.slice(0, -1);
  const stats = Object.fromEntries(HISTORY_FIELDS.map(key => [key,
    distribution(prior.map(row => row[key]).filter(value => value !== null), point?.[key] ?? null),
  ]));

  const targetDate = actualDate ? previousYearDate(actualDate, true) : null;
  const comparisonRow = targetDate ? prefix.findLast(row => row.date <= targetDate) || null : null;
  const gap = comparisonRow ? (Date.parse(targetDate) - Date.parse(comparisonRow.date)) / DAY_MS : null;
  const previous = comparisonRow && gap >= 0 && gap <= 7 ? comparisonRow : null;
  const yearAgo = {
    targetDate,
    actualDate: previous?.date || null,
    fallbackDays: previous ? gap : null,
    point: previous ? valuesOf(previous) : null,
    diff: Object.fromEntries(HISTORY_FIELDS.map(key => [key, point?.[key] !== null && point?.[key] !== undefined && previous?.[key] !== null && previous?.[key] !== undefined ? point[key] - previous[key] : null])),
    fields: Object.fromEntries(HISTORY_FIELDS.map(key => {
      const value = point?.[key] ?? null, old = previous?.[key] ?? null;
      return [key, {current: value, previous: old, difference: value !== null && old !== null ? value - old : null}];
    })),
  };

  const visible = String(range) === 'all' ? prefix : prefix.slice(-Number(range));
  const year = actualDate ? Number(actualDate.slice(0, 4)) : null;
  const annualRows = visible.filter(row => Number(row.date.slice(0, 4)) === year).map(row => {
    // The annual chart matches exact calendar dates. In particular, Feb 29 is
    // a true missing counterpart in non-leap years and is not copied from 28.
    const comparisonDate = previousYearDate(row.date), old = comparisonDate ? byDate.get(comparisonDate) : null;
    const output = {date: row.date, originalDate: row.date, comparisonDate, previousOriginalDate: old?.date || null,
      current: row[field], previous: old?.[field] ?? null, previousDate: old?.date || null};
    for (const key of HISTORY_FIELDS) {
      output[key] = row[key];
      output['previous' + key[0].toUpperCase() + key.slice(1)] = old?.[key] ?? null;
    }
    return output;
  });

  return {metric, field, range: String(range), requestedDate, actualDate, point, stats, yearAgo,
    annual: {year, previousYear: year === null ? null : year - 1, rows: annualRows}};
}
