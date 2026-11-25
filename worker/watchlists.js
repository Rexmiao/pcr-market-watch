// Personal watchlists use only the identity supplied by Sites' authenticated edge.
// The shared market-data APIs remain separate from these user-owned records.
const WATCHLIST_PATH = '/api/watchlist-settings';
const WATCHLIST_MAX_ITEMS = 30;
const WATCHLIST_MAX_BYTES = 8192;

function watchlistJson(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {status, headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  }});
}

function watchlistGroups(value) {
  if (!Array.isArray(value) || value.length > 30) throw Error('groups must be an array of at most 30 groups.');
  const groups = [], ids = new Set(), names = new Set();
  for (const group of value) {
    if (!group || Array.isArray(group) || typeof group !== 'object' ||
        Object.keys(group).some(key => !['id', 'name'].includes(key)) ||
        typeof group.id !== 'string' || !/^(?:semi|etf|other|custom_[A-Za-z0-9_-]{1,64})$/.test(group.id) ||
        typeof group.name !== 'string') throw Error('Each group needs a safe id and a name.');
    const name = group.name.trim(), nameKey = name.toLowerCase();
    if (!name || [...name].length > 40 || /[\u0000-\u001f\u007f]/.test(name)) throw Error('Group names must contain 1 to 40 characters without control characters.');
    if (ids.has(group.id) || names.has(nameKey)) throw Error('Group ids and names must be unique.');
    ids.add(group.id); names.add(nameKey); groups.push({id: group.id, name});
  }
  return groups;
}

function watchlistItems(value, groups) {
  if (!Array.isArray(value)) throw Error('items must be an array.');
  const items = [], seen = new Set(), categories = new Set(groups.map(group => group.id));
  for (const item of value) {
    if (!item || Array.isArray(item) || typeof item !== 'object' ||
        Object.keys(item).some(key => !['symbol', 'category'].includes(key)) ||
        typeof item.symbol !== 'string' || !(item.category === null || categories.has(item.category))) {
      throw Error('Each item needs a symbol and a category present in groups, or null for unassigned.');
    }
    const rawSymbol = item.symbol.trim();
    if (!/^[A-Za-z][A-Za-z0-9.]{0,9}$/.test(rawSymbol)) throw Error('A symbol has an invalid ticker format.');
    const symbol = rawSymbol.toUpperCase();
    if (!seen.has(symbol)) {
      seen.add(symbol); items.push({symbol, category: item.category});
      if (items.length > WATCHLIST_MAX_ITEMS) throw Error('A watchlist can contain at most 30 unique symbols.');
    }
  }
  return items;
}

async function watchlistReadBody(request) {
  if (Number(request.headers.get('content-length') || 0) > WATCHLIST_MAX_BYTES) return {status: 413, error: 'Request body exceeds 8192 bytes.'};
  const reader = request.body?.getReader();
  if (!reader) return {status: 400, error: 'A JSON object is required.'};
  const chunks = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > WATCHLIST_MAX_BYTES) {
        try { await reader.cancel(); } catch { /* The request is already rejected. */ }
        return {status: 413, error: 'Request body exceeds 8192 bytes.'};
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
    return {value: JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes))};
  } catch {
    return {status: 400, error: 'The request must contain valid UTF-8 JSON.'};
  } finally {reader.releaseLock();}
}

function watchlistState(row, storage) {
  if (!row) return {items: null, groups: null, revision: 0, updatedAt: null, storage, initialized: false};
  if (!Number.isSafeInteger(row.revision) || row.revision < 1 ||
      typeof row.items_json !== 'string' || typeof row.groups_json !== 'string' || typeof row.updated_at !== 'string' ||
      !Number.isFinite(Date.parse(row.updated_at))) throw Error('Invalid saved watchlist.');
  const groups = watchlistGroups(JSON.parse(row.groups_json));
  return {items: watchlistItems(JSON.parse(row.items_json), groups), groups, revision: row.revision,
    updatedAt: row.updated_at, storage, initialized: true};
}

async function watchlistCurrent(db, owner, storage) {
  const row = await db.prepare('SELECT items_json, groups_json, revision, updated_at FROM user_watchlists WHERE owner_id = ?').bind(owner).first();
  return watchlistState(row, storage);
}

export async function handleWatchlistsApi(request, env = {}) {
  const url = new URL(request.url);
  if (url.pathname !== WATCHLIST_PATH) return null;
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return watchlistJson({error: 'Only same-origin requests are accepted.'}, 403);
  if (!['GET', 'PUT'].includes(request.method)) return watchlistJson({error: 'Method not allowed.'}, 405, {allow: 'GET, PUT'});
  const owner = request.headers.get('oai-authenticated-user-id')?.trim();
  if (!owner || owner.length > 512) return watchlistJson({error: 'Sign in to access your watchlist.'}, 401);
  // Identity is never taken from URL parameters, a request body, or service access.
  if ([...url.searchParams].length) return watchlistJson({error: 'This endpoint does not accept query parameters.'}, 400);
  const storage = env.WATCHLIST_STORAGE === 'local' ? 'local' : 'cloud';
  const db = env.DB;
  if (!db || typeof db.prepare !== 'function') return watchlistJson({error: 'The watchlist database is unavailable.', storage}, 503);
  if (request.method === 'GET') {
    try {return watchlistJson(await watchlistCurrent(db, owner, storage));}
    catch {return watchlistJson({error: 'The saved watchlist could not be read. Please retry.', storage}, 503);}
  }
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return watchlistJson({error: 'Use Content-Type: application/json.'}, 415);
  }
  const parsed = await watchlistReadBody(request);
  if (parsed.error) return watchlistJson({error: parsed.error}, parsed.status);
  const body = parsed.value;
  if (!body || Array.isArray(body) || typeof body !== 'object' ||
      Object.keys(body).some(key => !['items', 'groups', 'revision'].includes(key)) ||
      !Number.isSafeInteger(body.revision) || body.revision < 0 || body.revision >= Number.MAX_SAFE_INTEGER) {
    return watchlistJson({error: 'Use only items, groups and a non-negative integer revision.'}, 400);
  }
  let items, groups;
  try {groups = watchlistGroups(body.groups); items = watchlistItems(body.items, groups);}
  catch (error) {return watchlistJson({error: error.message}, 400);}
  const updatedAt = new Date().toISOString();
  try {
    // Each mutation is one atomic SQLite statement; no table creation occurs here.
    const statement = body.revision === 0
      ? db.prepare('INSERT OR IGNORE INTO user_watchlists (owner_id, items_json, groups_json, revision, updated_at) VALUES (?, ?, ?, 1, ?)').bind(owner, JSON.stringify(items), JSON.stringify(groups), updatedAt)
      : db.prepare('UPDATE user_watchlists SET items_json = ?, groups_json = ?, revision = revision + 1, updated_at = ? WHERE owner_id = ? AND revision = ?').bind(JSON.stringify(items), JSON.stringify(groups), updatedAt, owner, body.revision);
    const result = await statement.run();
    if (result?.success === false || ![0, 1].includes(result?.meta?.changes)) throw Error('Database did not confirm a write.');
    if (result.meta.changes === 0) {
      return watchlistJson({error: 'The watchlist changed in another session. Review the latest list and retry.',
        ...await watchlistCurrent(db, owner, storage)}, 409);
    }
    return watchlistJson({items, groups, revision: body.revision + 1, updatedAt, storage, initialized: true});
  } catch {
    return watchlistJson({error: 'The save could not be confirmed. Reload your watchlist before retrying.', storage}, 503);
  }
}
