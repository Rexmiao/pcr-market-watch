import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {createLocalD1} from './local-db.mjs';
import {backupHfDatabase,restoreHfDatabase,assertHfBackupMounted} from './hf-storage.mjs';

const pythonExecutable=process.env.PCR_PYTHON||(process.platform==='win32'?join(process.env.USERPROFILE,'anaconda3','python.exe'):'python3');
async function fixture(run){
  const root=await mkdtemp(join(tmpdir(),'pcr-hf-storage-'));
  assert(resolve(root).startsWith(resolve(tmpdir())+sep));
  try{
    const databasePath=join(root,'runtime','pcr.sqlite3'),backupDirectory=join(root,'bucket');
    await mkdir(backupDirectory,{recursive:true});
    const database=await createLocalD1({databasePath,pythonExecutable});
    await database.prepare('CREATE TABLE storage_test (id INTEGER PRIMARY KEY, value TEXT NOT NULL)').run();
    await database.prepare('INSERT INTO storage_test(value) VALUES (?)').bind('first').run();
    await run({root,database,options:{databasePath,backupDirectory,pythonExecutable}});
  }finally{await rm(root,{recursive:true,force:true});}
}

test('consistent backups survive mutations, deduplicate unchanged data, and restore original contents',async()=>fixture(async({root,database,options})=>{
  const first=await backupHfDatabase({...options,now:()=>Date.parse('2026-11-26T22:30:00Z')});
  assert.equal(first.status,'saved');assert(first.bytes>0);
  assert.equal((await backupHfDatabase(options)).status,'unchanged');
  await database.prepare('INSERT INTO storage_test(value) VALUES (?)').bind('second').run();
  const second=await backupHfDatabase({...options,now:()=>Date.parse('2026-11-27T22:30:00Z')});assert.equal(second.status,'saved');
  const target=join(root,'restored','pcr.sqlite3');
  const restored=await restoreHfDatabase({...options,databasePath:target});assert.equal(restored.status,'restored');assert.equal(restored.createdAt,'2026-11-27T22:30:00.000Z');
  const check=await createLocalD1({databasePath:target,pythonExecutable});
  assert.equal(await check.prepare('SELECT COUNT(*) AS n FROM storage_test').first('n'),2);
  assert.equal((await restoreHfDatabase({...options,databasePath:target})).status,'existing');
  const files=(await readdir(options.backupDirectory)).filter(name=>name.endsWith('.json'));assert.equal(files.length,2);
}));

test('a damaged newest snapshot falls back to an older verified database; incomplete uploads are ignored',async()=>fixture(async({root,database,options})=>{
  await backupHfDatabase({...options,now:()=>Date.parse('2026-11-26T22:30:00Z')});
  await database.prepare('INSERT INTO storage_test(value) VALUES (?)').bind('second').run();
  await backupHfDatabase({...options,now:()=>Date.parse('2026-11-27T22:30:00Z')});
  const names=(await readdir(options.backupDirectory)).filter(name=>name.endsWith('.json')).sort();
  const latest=JSON.parse(await readFile(join(options.backupDirectory,names.at(-1)),'utf8'));
  await writeFile(join(options.backupDirectory,latest.file),'truncated');
  await writeFile(join(options.backupDirectory,'pcr-incomplete.sqlite3'),'partial object');
  const target=join(root,'recovered','pcr.sqlite3'),result=await restoreHfDatabase({...options,databasePath:target});
  assert.equal(result.createdAt,'2026-11-26T22:30:00.000Z');
  const check=await createLocalD1({databasePath:target,pythonExecutable});
  assert.equal(await check.prepare('SELECT COUNT(*) AS n FROM storage_test').first('n'),1);
}));

test('live SQLite cannot be placed on the backup mount and empty archives remain explicitly empty',async()=>fixture(async({root,options})=>{
  await assert.rejects(backupHfDatabase({...options,databasePath:join(options.backupDirectory,'live.sqlite3')}),{code:'BACKUP_LIVE_DATABASE_ON_MOUNT'});
  const result=await restoreHfDatabase({...options,databasePath:join(root,'empty-runtime','pcr.sqlite3')});assert.deepEqual(result,{status:'empty',createdAt:null,bytes:0});
}));

test('invalid manifests never restore outside files and all-invalid archives fail visibly',async()=>fixture(async({root,options})=>{
  const bad='pcr-2026-11-26T22-30-00-000Z-aaaaaaaaaaaaaaaa.json';
  await writeFile(join(options.backupDirectory,bad),JSON.stringify({schemaVersion:1,file:'../secret.sqlite3',bytes:99,sha256:'a'.repeat(64),createdAt:'2026-11-26T22:30:00.000Z'}));
  await assert.rejects(restoreHfDatabase({...options,databasePath:join(root,'bad-runtime','pcr.sqlite3')}),{code:'BACKUP_NO_VALID_SNAPSHOT'});
}));

test('a named folder or ephemeral root is not accepted as an attached archive volume',async()=>fixture(async({root,options})=>{
  const mountInfoPath=join(root,'mountinfo'),escaped=options.backupDirectory.replaceAll(' ','\\040');
  await writeFile(mountInfoPath,'1 0 0:1 / / rw - overlay overlay rw\n');
  await assert.rejects(assertHfBackupMounted(options.backupDirectory,{platform:'linux',mountInfoPath}),{code:'BACKUP_ATTACHED_VOLUME_REQUIRED'});
  await writeFile(mountInfoPath,'1 0 0:1 / '+escaped+' rw - tmpfs tmpfs rw\n');
  await assert.rejects(assertHfBackupMounted(options.backupDirectory,{platform:'linux',mountInfoPath}),{code:'BACKUP_ATTACHED_VOLUME_REQUIRED'});
  await writeFile(mountInfoPath,'1 0 0:1 / '+escaped+' rw - fuse.hf-mount hf-mount rw\n');
  assert.deepEqual(await assertHfBackupMounted(options.backupDirectory,{platform:'linux',mountInfoPath}),{verified:true});
}));

test('UTF-8 paths round-trip through Python on Windows and Linux',async()=>fixture(async({root,options})=>{
  const databasePath=join(root,'中文运行目录','观察台.sqlite3'),backupDirectory=join(root,'每日持仓归档');
  const original=await createLocalD1({databasePath,pythonExecutable});
  await original.prepare('CREATE TABLE unicode_test (value TEXT NOT NULL)').run();
  await original.prepare('INSERT INTO unicode_test(value) VALUES (?)').bind('持仓快照').run();
  assert.equal((await backupHfDatabase({...options,databasePath,backupDirectory})).status,'saved');
  const target=join(root,'恢复目录','观察台.sqlite3');
  assert.equal((await restoreHfDatabase({...options,databasePath:target,backupDirectory})).status,'restored');
  const restored=await createLocalD1({databasePath:target,pythonExecutable});
  assert.equal(await restored.prepare('SELECT value FROM unicode_test').first('value'),'持仓快照');
}));
