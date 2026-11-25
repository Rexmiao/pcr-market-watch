import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLocalD1} from './local-db.mjs';

// Real SQLite integration coverage, intentionally using an isolated temporary DB.
const directory = await mkdtemp(join(tmpdir(), 'pcr-local-sqlite-'));
const migrationsDirectory = join(directory, 'drizzle');
await mkdir(join(migrationsDirectory, 'meta'), {recursive: true});
await writeFile(join(migrationsDirectory, 'meta', '_journal.json'), JSON.stringify({entries:[{idx:0,tag:'0000_watchlists',when:1}]}));
await writeFile(join(migrationsDirectory, '0000_watchlists.sql'), `CREATE TABLE user_watchlists (
  owner_id TEXT PRIMARY KEY NOT NULL,
  items_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
`);
const databasePath = join(directory, '数据库', 'pcr.sqlite3');
const migrationPath = join(migrationsDirectory, '0000_watchlists.sql');
const migrationLF = (await readFile(migrationPath, 'utf8')).replace(/\r\n/g, '\n');
await writeFile(migrationPath, migrationLF);
const db = await createLocalD1({databasePath, migrationsDirectory});
assert.deepEqual(db.migrationResult.applied, ['0000_watchlists']);
const signature = (await readFile(databasePath)).subarray(0,16).toString();
assert.equal(signature, 'SQLite format 3\u0000');

const maliciousOwner = "owner'; DROP TABLE user_watchlists; --";
const insert = owner => db.prepare('INSERT OR IGNORE INTO user_watchlists(owner_id,items_json,revision,updated_at) VALUES(?,?,?,?)').bind(owner,'[]',1,'2026-11-24T00:00:00Z').run();
assert.equal((await insert(maliciousOwner)).meta.changes, 1);
assert.equal((await insert(maliciousOwner)).meta.changes, 0);
assert.equal((await insert('other-owner')).meta.changes, 1);
const load = owner => db.prepare('SELECT owner_id,items_json,revision FROM user_watchlists WHERE owner_id=?').bind(owner).first();
assert.equal((await load(maliciousOwner)).items_json, '[]');
assert.equal(await load('missing-owner'), null);
const savedItems = JSON.stringify([{symbol:'SNDK',name:'闪迪'}]);
const update = revision => db.prepare('UPDATE user_watchlists SET items_json=?,revision=revision+1,updated_at=? WHERE owner_id=? AND revision=?')
  .bind(savedItems,'2026-11-24T01:00:00Z',maliciousOwner,revision).run();
assert.equal((await update(1)).meta.changes, 1);
assert.equal((await update(1)).meta.changes, 0);
assert.equal((await load(maliciousOwner)).revision, 2);
assert.equal((await load('other-owner')).revision, 1);
assert.equal((await load('other-owner')).items_json, '[]');
assert.equal((await db.prepare('SELECT COUNT(*) AS total FROM user_watchlists').first('total')), 2);
assert.equal((await db.prepare('SELECT * FROM user_watchlists').all()).results.length, 2);
await assert.rejects(db.batch([
  db.prepare('UPDATE user_watchlists SET items_json=? WHERE owner_id=?').bind('[{"symbol":"AMD","name":"超微半导体"}]','other-owner'),
  db.prepare('INSERT INTO missing_test_table(value) VALUES(?)').bind('fail'),
]), /no such table/i);
assert.equal((await load('other-owner')).items_json, '[]', 'A failed batch must roll back earlier writes');

// A new Node process must see the same rows and must not replay the migration.
const moduleUrl = new URL('./local-db.mjs', import.meta.url).href;
const subprocessCode = `import {createLocalD1} from ${JSON.stringify(moduleUrl)};const database=await createLocalD1(${JSON.stringify({databasePath,migrationsDirectory})});console.log(JSON.stringify({migration:database.migrationResult,row:await database.prepare('SELECT items_json,revision FROM user_watchlists WHERE owner_id=?').bind(${JSON.stringify(maliciousOwner)}).first()}));`;
const persisted = await new Promise((accept,reject) => {
  const child = spawn(process.execPath,['--input-type=module','-e',subprocessCode],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='',errors='';
  child.stdout.on('data',chunk=>output+=chunk);
  child.stderr.on('data',chunk=>errors+=chunk);
  child.on('error',reject);
  child.on('close',code=>code===0?accept(JSON.parse(output)):reject(Error(errors)));
});
assert.deepEqual(persisted.migration.applied, []);
assert.equal(persisted.row.revision, 2);
assert.equal(persisted.row.items_json, savedItems);
assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM __pcr_local_migrations').first('count')),1);

// Batch failure rolls back the preceding write rather than leaving partial state.
await assert.rejects(db.batch([
  db.prepare('UPDATE user_watchlists SET revision=99 WHERE owner_id=?').bind('other-owner'),
  db.prepare('INSERT INTO missing_table(value) VALUES(?)').bind('fail'),
]));
assert.equal((await load('other-owner')).revision,1);

// Identical SQL checked out as CRLF must retain all user data and never rerun DDL.
const lfHash = createHash('sha256').update(migrationLF).digest('hex');
const migrationCRLF = migrationLF.replace(/\n/g, '\r\n');
const crlfHash = createHash('sha256').update(migrationCRLF).digest('hex');
const journalBefore = await db.prepare('SELECT hash,applied_at FROM __pcr_local_migrations WHERE tag=?').bind('0000_watchlists').first();
assert.equal(journalBefore.hash,lfHash);
await writeFile(migrationPath,migrationCRLF);
const crlfRestart = await createLocalD1({databasePath,migrationsDirectory});
assert.deepEqual(crlfRestart.migrationResult.applied,[]);
assert.equal((await load(maliciousOwner)).items_json,savedItems);
assert.equal((await load(maliciousOwner)).revision,2);
assert.deepEqual(await db.prepare('SELECT hash,applied_at FROM __pcr_local_migrations WHERE tag=?').bind('0000_watchlists').first(),journalBefore);

// Older releases may already have recorded the raw CRLF checksum. Accept that
// exact equivalent, canonicalize only the journal hash, and preserve applied_at.
await db.prepare('UPDATE __pcr_local_migrations SET hash=? WHERE tag=?').bind(crlfHash,'0000_watchlists').run();
await writeFile(migrationPath,migrationLF);
const legacyRestart = await createLocalD1({databasePath,migrationsDirectory});
assert.deepEqual(legacyRestart.migrationResult.applied,[]);
assert.deepEqual(await db.prepare('SELECT hash,applied_at FROM __pcr_local_migrations WHERE tag=?').bind('0000_watchlists').first(),journalBefore);
assert.equal((await load(maliciousOwner)).items_json,savedItems);
assert.equal((await db.prepare('SELECT COUNT(*) AS total FROM user_watchlists').first('total')),2);

// Even a non-line-ending whitespace change remains a checksum mismatch.
await writeFile(migrationPath,migrationLF.replace('owner_id TEXT','owner_id  TEXT'));
await assert.rejects(createLocalD1({databasePath,migrationsDirectory}), /applied migration was changed/i);

// A rewritten migration must not silently alter an existing database.
await writeFile(join(migrationsDirectory, '0000_watchlists.sql'), 'CREATE TABLE changed(value TEXT);');
await assert.rejects(createLocalD1({databasePath,migrationsDirectory}), /applied migration was changed/i);
console.log('PASS real SQLite persistence/CAS/isolation, LF-to-CRLF restart, legacy CRLF checksum canonicalization without DDL replay, unchanged user rows/timestamps, and rejection of real SQL differences');
