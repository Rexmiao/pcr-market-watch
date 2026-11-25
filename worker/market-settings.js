// User-owned market-PCR menu settings. Market data and personal watchlists are separate.
const MARKET_PCR_SETTINGS_PATH = '/api/market-pcr-settings';
const MARKET_PCR_MAX_ITEMS = 40;
const MARKET_PCR_MAX_BYTES = 8192;
const MARKET_PCR_CBOE_KEYS = new Set(['index', 'total', 'etp', 'equity']);

function marketPcrSettingsJson(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {status, headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff', ...headers,
  }});
}

function marketPcrItems(value) {
  if (!Array.isArray(value)) throw Error('items must be an array.');
  const items = [], seen = new Set();
  for (const item of value) {
    if (!item || Array.isArray(item) || typeof item !== 'object' || Object.keys(item).length !== 2) {
      throw Error('Each item must contain exactly type and key, or type and symbol.');
    }
    let normalized, identity;
    if (item.type === 'cboe' && MARKET_PCR_CBOE_KEYS.has(item.key) && Object.keys(item).every(key => ['type', 'key'].includes(key))) {
      normalized = {type: 'cboe', key: item.key}; identity = 'cboe|' + item.key;
    } else if (item.type === 'symbol' && typeof item.symbol === 'string' && Object.keys(item).every(key => ['type', 'symbol'].includes(key))) {
      const rawSymbol = item.symbol.trim();
      if (!/^[A-Za-z][A-Za-z0-9.]{0,9}$/.test(rawSymbol)) throw Error('A symbol has an invalid ticker format.');
      const symbol = rawSymbol.toUpperCase();
      normalized = {type: 'symbol', symbol}; identity = 'symbol|' + symbol;
    } else {
      throw Error('Choose a supported Cboe category or a valid symbol item.');
    }
    if (!seen.has(identity)) {
      seen.add(identity); items.push(normalized);
      if (items.length > MARKET_PCR_MAX_ITEMS) throw Error('The menu can contain at most 40 unique items.');
    }
  }
  return items;
}

async function marketPcrSettingsBody(request) {
  if (Number(request.headers.get('content-length') || 0) > MARKET_PCR_MAX_BYTES) return {status: 413, error: 'Request body exceeds 8192 bytes.'};
  const reader = request.body?.getReader();
  if (!reader) return {status: 400, error: 'A JSON object is required.'};
  const chunks = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MARKET_PCR_MAX_BYTES) {
        try {await reader.cancel();} catch { /* The oversized request is rejected. */ }
        return {status: 413, error: 'Request body exceeds 8192 bytes.'};
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
    return {value: JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes))};
  } catch {return {status: 400, error: 'The request must contain valid UTF-8 JSON.'};}
  finally {reader.releaseLock();}
}

function marketPcrSettingsState(row, storage) {
  if (!row) return {items: null, revision: 0, updatedAt: null, storage, initialized: false};
  if (!Number.isSafeInteger(row.revision) || row.revision < 1 || typeof row.items_json !== 'string' ||
      typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at))) throw Error('Invalid saved market-PCR settings.');
  return {items: marketPcrItems(JSON.parse(row.items_json)), revision: row.revision, updatedAt: row.updated_at, storage, initialized: true};
}

async function marketPcrSettingsCurrent(db, owner, storage) {
  const row = await db.prepare('SELECT items_json, revision, updated_at FROM user_market_pcr WHERE owner_id = ?').bind(owner).first();
  return marketPcrSettingsState(row, storage);
}

export async function handleMarketSettingsApi(request, env = {}) {
  const url = new URL(request.url);
  if (url.pathname !== MARKET_PCR_SETTINGS_PATH) return null;
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return marketPcrSettingsJson({error: 'Only same-origin requests are accepted.'}, 403);
  if (!['GET', 'PUT'].includes(request.method)) return marketPcrSettingsJson({error: 'Method not allowed.'}, 405, {allow: 'GET, PUT'});
  const owner = request.headers.get('oai-authenticated-user-id')?.trim();
  if (!owner || owner.length > 512) return marketPcrSettingsJson({error: 'Sign in to access your market-PCR menu.'}, 401);
  if ([...url.searchParams].length) return marketPcrSettingsJson({error: 'This endpoint does not accept query parameters.'}, 400);
  const storage = env.WATCHLIST_STORAGE === 'local' ? 'local' : 'cloud', db = env.DB;
  if (!db || typeof db.prepare !== 'function') return marketPcrSettingsJson({error: 'The settings database is unavailable.', storage}, 503);
  if (request.method === 'GET') {
    try {return marketPcrSettingsJson(await marketPcrSettingsCurrent(db, owner, storage));}
    catch {return marketPcrSettingsJson({error: 'The market-PCR menu could not be read. Please retry.', storage}, 503);}
  }
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return marketPcrSettingsJson({error: 'Use Content-Type: application/json.'}, 415);
  const parsed = await marketPcrSettingsBody(request);
  if (parsed.error) return marketPcrSettingsJson({error: parsed.error}, parsed.status);
  const body = parsed.value;
  if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(key => !['items', 'revision'].includes(key)) ||
      !Number.isSafeInteger(body.revision) || body.revision < 0 || body.revision >= Number.MAX_SAFE_INTEGER) {
    return marketPcrSettingsJson({error: 'Use only items and a non-negative integer revision.'}, 400);
  }
  let items;
  try {items = marketPcrItems(body.items);} catch (error) {return marketPcrSettingsJson({error: error.message}, 400);}
  const updatedAt = new Date().toISOString();
  try {
    const statement = body.revision === 0
      ? db.prepare('INSERT OR IGNORE INTO user_market_pcr (owner_id, items_json, revision, updated_at) VALUES (?, ?, 1, ?)').bind(owner, JSON.stringify(items), updatedAt)
      : db.prepare('UPDATE user_market_pcr SET items_json = ?, revision = revision + 1, updated_at = ? WHERE owner_id = ? AND revision = ?').bind(JSON.stringify(items), updatedAt, owner, body.revision);
    const result = await statement.run();
    if (result?.success === false || ![0, 1].includes(result?.meta?.changes)) throw Error('Database did not confirm a write.');
    if (result.meta.changes === 0) return marketPcrSettingsJson({error: 'The menu changed in another session. Review the latest menu and retry.', ...await marketPcrSettingsCurrent(db, owner, storage)}, 409);
    return marketPcrSettingsJson({items, revision: body.revision + 1, updatedAt, storage, initialized: true});
  } catch {return marketPcrSettingsJson({error: 'The save could not be confirmed. Reload the market-PCR menu before retrying.', storage}, 503);}
}
