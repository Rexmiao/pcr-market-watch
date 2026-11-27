// Local preview only: a minimal D1 interface backed by Python's real SQLite.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir, readFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, '..');
const bridgePath = join(scriptDirectory, 'local-db.py');

function pythonCommand(explicit) {
  if (explicit || process.env.PCR_PYTHON) return explicit || process.env.PCR_PYTHON;
  const candidates = [
    process.env.USERPROFILE && join(process.env.USERPROFILE, 'anaconda3', 'python.exe'),
    process.env.USERPROFILE && join(process.env.USERPROFILE, 'miniconda3', 'python.exe'),
  ].filter(Boolean);
  return candidates.find(candidate => existsSync(candidate)) || (process.platform === 'win32' ? 'python' : 'python3');
}

function boundValue(value) {
  if (value === null || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new TypeError('Local D1 parameters must be strings, finite numbers, or null.');
}

class LocalStatement {
  constructor(database, sql, params = []) {
    if (typeof sql !== 'string' || !sql.trim()) throw new TypeError('A SQL statement is required.');
    this.database = database;
    this.sql = sql;
    this.params = params;
  }

  bind(...values) { return new LocalStatement(this.database, this.sql, values.map(boundValue)); }

  async first(column) {
    const result = await this.database.execute(this.sql, this.params);
    const row = result.results[0] || null;
    if (column === undefined || row === null) return row;
    if (!Object.hasOwn(row, column)) throw new Error('Column does not exist: ' + column);
    return row[column];
  }

  async all() { return await this.database.execute(this.sql, this.params); }
  async run() { return await this.database.execute(this.sql, this.params); }
}

class LocalD1 {
  constructor(databasePath, pythonExecutable, onChange) {
    this.databasePath = databasePath;
    this.pythonExecutable = pythonExecutable;
    this.onChange = onChange;
  }

  prepare(sql) { return new LocalStatement(this, sql); }

  async execute(sql, params = []) {
    const result = await this.call({action: 'statement', sql, params});
    await this.notifyChange([result]);
    return result;
  }

  async batch(statements) {
    if (!Array.isArray(statements) || statements.some(statement => !(statement instanceof LocalStatement) || statement.database !== this)) {
      throw new TypeError('Batch requires statements prepared by this database.');
    }
    const result = await this.call({action: 'batch', statements: statements.map(statement => ({sql: statement.sql, params: statement.params}))});
    await this.notifyChange(result);
    return result;
  }

  async notifyChange(results) {
    if (!this.onChange || !results.some(result => result?.meta?.changes > 0)) return;
    // Notification failure cannot undo an already committed transaction. No
    // SQL, values, identity, or result data is passed to the optional callback.
    try { await this.onChange(); } catch {}
  }

  async call(input) {
    return await new Promise((accept, reject) => {
      const child = spawn(this.pythonExecutable, ['-B', '-u', bridgePath], {
        windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'],
      });
      const output = [], errors = [];
      let outputBytes = 0, settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error); else accept(value);
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(new Error('Local SQLite operation timed out.'));
      }, 20000);
      child.on('error', error => finish(new Error('Cannot start the local SQLite Python runtime: ' + error.message)));
      child.stdout.on('data', chunk => {
        outputBytes += chunk.length;
        if (outputBytes > 2_000_000) {
          child.kill();
          finish(new Error('Local SQLite response exceeded the size limit.'));
        } else output.push(chunk);
      });
      child.stderr.on('data', chunk => { if (errors.reduce((size, item) => size + item.length, 0) < 16000) errors.push(chunk); });
      child.stdin.on('error', error => finish(new Error('Cannot send the local SQLite request: ' + error.message)));
      child.on('close', code => {
        if (settled) return;
        let response;
        try { response = JSON.parse(Buffer.concat(output).toString('utf8')); }
        catch { finish(new Error('Local SQLite returned no valid response. ' + Buffer.concat(errors).toString('utf8').slice(0, 400))); return; }
        if (code !== 0 || response.success !== true) {
          finish(new Error('Local SQLite: ' + (response.error?.message || 'Operation failed.')));
          return;
        }
        finish(null, response.result);
      });
      child.stdin.end(JSON.stringify({databasePath: this.databasePath, ...input}));
    });
  }
}

async function readMigrations(directory) {
  const journalPath = join(directory, 'meta', '_journal.json');
  const journal = JSON.parse(await readFile(journalPath, 'utf8'));
  if (!Array.isArray(journal.entries)) throw new Error('Local database migration journal is invalid.');
  const seen = new Set();
  const migrations = [];
  for (const entry of journal.entries) {
    if (typeof entry.tag !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(entry.tag) || seen.has(entry.tag)) throw new Error('Invalid migration tag.');
    if (!Number.isInteger(entry.idx) || entry.idx < 0) throw new Error('Invalid migration index.');
    seen.add(entry.tag);
    // Git on Windows may check the same migration out with CRLF. Normalize only
    // line endings; whitespace, comments and all other SQL bytes remain significant.
    const sql = (await readFile(join(directory, entry.tag + '.sql'), 'utf8')).replace(/\r\n/g, '\n');
    const hash = createHash('sha256').update(sql).digest('hex');
    const crlfHash = createHash('sha256').update(sql.replace(/\n/g, '\r\n')).digest('hex');
    migrations.push({tag: entry.tag, position: entry.idx, sql, hash, legacyHashes: [...new Set([hash, crlfHash])]});
  }
  migrations.sort((left, right) => left.position - right.position);
  if (new Set(migrations.map(item => item.position)).size !== migrations.length) throw new Error('Migration indexes must be unique.');
  return migrations;
}

export async function createLocalD1({databasePath, migrationsDirectory, pythonExecutable, onChange} = {}) {
  if (onChange !== undefined && typeof onChange !== 'function') throw new TypeError('onChange must be a function.');
  const chosenPath = databasePath || process.env.PCR_DB_PATH || resolve(projectDirectory, '..', 'local-data', 'pcr.sqlite3');
  if (chosenPath === ':memory:') throw new Error('Local D1 requires a persistent SQLite file.');
  const absolutePath = resolve(chosenPath);
  const migrations = await readMigrations(resolve(migrationsDirectory || join(projectDirectory, 'drizzle')));
  await mkdir(dirname(absolutePath), {recursive: true});
  const database = new LocalD1(absolutePath, pythonCommand(pythonExecutable), onChange);
  database.migrationResult = await database.call({action: 'migrate', migrations});
  return database;
}
