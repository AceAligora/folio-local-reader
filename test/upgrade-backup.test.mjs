import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,symlink,stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Library} from '../lib/library.mjs';
import {CURRENT_SCHEMA} from '../lib/schema.mjs';
import {verifyUpgradeBackup,recoverUpgradeBackup} from '../lib/upgrade-backup.mjs';
import {privateReleasePath} from '../lib/distribution.mjs';

async function fixture(run){
  const temp=await mkdtemp(path.join(os.tmpdir(),"folio-upgrade-'你好-")),profile=path.join(temp,'profile'),root=path.join(temp,'books');
  await mkdir(profile);await mkdir(root);const file=path.join(profile,'library.sqlite');
  let db;
  try{
    await writeFile(path.join(root,'Original.pdf'),'ebook bytes remain untouched');
    const lib=new Library(file);
    try{await lib.configure(root);await lib.scan();const book=lib.list().books[0];lib.save(book.id,{page:4,total:20,seconds:12,readerPreferences:{background:'black'}});lib.details(book.id,{bookmarks:[{page:4,label:'Continue'}],tags:['local']});lib.saveCollection({name:'My collection',books:[book.id]});lib.db.prepare('INSERT INTO config VALUES(?,?)').run('fixture-private','never sent anywhere');}finally{lib.close();}
    db=new DatabaseSync(file);db.exec('DROP TABLE recovery_fingerprints; DROP TABLE recovery_collection_links; PRAGMA user_version=7;');
    await run({temp,profile,root,file,db,close(){db.close();db=null;}});
    assert.equal(await readFile(path.join(root,'Original.pdf'),'utf8'),'ebook bytes remain untouched');
  }finally{db?.close();await rm(temp,{recursive:true,force:true});}
}
const rows=db=>Object.fromEntries(['books','reading','config','bookmeta'].map(table=>[table,db.prepare('SELECT * FROM '+table+' ORDER BY 1').all().map(row=>({...row}))]));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

test('schema upgrades save a verified pre-upgrade snapshot including committed WAL data and keep every reading/config row',()=>fixture(async({profile,file,db,close})=>{
  db.exec('PRAGMA wal_autocheckpoint=0');db.prepare('INSERT INTO config VALUES(?,?)').run('only-in-wal','committed latest value');
  assert.ok((await stat(file+'-wal')).size>0);
  const before=rows(db),lib=new Library(file);
  try{
    assert.equal(lib.db.prepare('PRAGMA user_version').get().user_version,CURRENT_SCHEMA);assert.deepEqual(rows(lib.db),before);
    const data=verifyUpgradeBackup(lib.upgradeBackup.file);assert.equal(data.from,7);assert.equal(data.to,CURRENT_SCHEMA);
    const saved=new DatabaseSync(data.snapshot,{readOnly:true});try{assert.deepEqual(rows(saved),before);assert.equal(saved.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='recovery_fingerprints'").get().n,0);}finally{saved.close();}
    assert.match(lib.upgradeBackup.file,/upgrade-backups/);assert.equal((await readdir(path.join(profile,'upgrade-backups'))).length,2);
  }finally{lib.close();close();}
}));

test('new, in-memory and already-current profiles do not create upgrade backups; newer profiles are refused',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'folio-new-profile-')),file=path.join(temp,'library.sqlite');
  try{
    for(const name of [':memory:',file,file]){const lib=new Library(name);try{assert.equal(lib.upgradeBackup,null);}finally{lib.close();}}
    await assert.rejects(readdir(path.join(temp,'upgrade-backups')),e=>e.code==='ENOENT');
    const db=new DatabaseSync(file);db.exec('PRAGMA user_version=999');db.close();const before=hash(await readFile(file));
    assert.throws(()=>new Library(file),/newer Folio/);assert.equal(hash(await readFile(file)),before);
  }finally{await rm(temp,{recursive:true,force:true});}
});

test('a populated legacy schema zero is backed up while an empty database is initialized directly',()=>fixture(async({file,db,close})=>{
  db.exec('PRAGMA user_version=0');close();const lib=new Library(file);
  try{assert.equal(verifyUpgradeBackup(lib.upgradeBackup.file).from,0);assert.equal(lib.list().books[0].state.page,4);}finally{lib.close();}
}));

test('an unavailable backup directory stops migration before schema or reading data changes and releases the connection',()=>fixture(async({profile,file,db,close})=>{
  const before=rows(db);close();await writeFile(path.join(profile,'upgrade-backups'),'keep this unrelated file');
  assert.throws(()=>new Library(file),/could not save and verify a backup/);
  const check=new DatabaseSync(file);try{assert.equal(check.prepare('PRAGMA user_version').get().user_version,7);assert.deepEqual(rows(check),before);check.exec('BEGIN EXCLUSIVE; ROLLBACK');}finally{check.close();}
  assert.equal(await readFile(path.join(profile,'upgrade-backups'),'utf8'),'keep this unrelated file');
}));

test('linked backup directories cannot redirect private snapshots outside the profile',()=>fixture(async({temp,profile,file,db,close})=>{
  close();const outside=path.join(temp,'outside');await mkdir(outside);await symlink(outside,path.join(profile,'upgrade-backups'),process.platform==='win32'?'junction':'dir');
  assert.throws(()=>new Library(file),/must not be a link/);assert.deepEqual(await readdir(outside),[]);
  const check=new DatabaseSync(file);try{assert.equal(check.prepare('PRAGMA user_version').get().user_version,7);}finally{check.close();}
}));

test('failed migration rolls back added tables and version together, retains its usable backup, and permits a later retry',()=>fixture(async({file,db,close})=>{
  db.exec('CREATE TABLE recovery_collection_links(incompatible TEXT); CREATE VIEW recovery_fingerprints AS SELECT incompatible FROM recovery_collection_links;');
  const before=rows(db);close();assert.throws(()=>new Library(file));
  const check=new DatabaseSync(file);try{assert.equal(check.prepare('PRAGMA user_version').get().user_version,7);assert.deepEqual(rows(check),before);assert.equal(check.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='recovery_digest'").get().n,0);check.exec('DROP VIEW recovery_fingerprints; DROP TABLE recovery_collection_links');}finally{check.close();}
  const directory=path.join(path.dirname(file),'upgrade-backups'),first=(await readdir(directory)).find(name=>name.endsWith('.sqlite'));assert.equal(verifyUpgradeBackup(path.join(directory,first)).from,7);
  const lib=new Library(file);try{assert.equal(lib.book(lib.list().books[0].id).state.page,4);}finally{lib.close();}
  assert.equal((await readdir(directory)).filter(name=>name.endsWith('.sqlite')).length,2);
}));

test('concurrent commits after a snapshot prevent migration from using a stale safety copy',()=>fixture(async({file,close})=>{
  close();const other=new DatabaseSync(file),original=DatabaseSync.prototype.exec;let changed=false;
  DatabaseSync.prototype.exec=function(sql){if(sql.includes('BEGIN IMMEDIATE')&&!changed){changed=true;other.prepare('INSERT INTO config VALUES(?,?)').run('racing-write','preserved');}return original.call(this,sql);};
  try{assert.throws(()=>new Library(file),/profile changed/);assert.equal(changed,true);assert.equal(other.prepare('PRAGMA user_version').get().user_version,7);assert.equal(other.prepare("SELECT value FROM config WHERE key='racing-write'").get().value,'preserved');}finally{DatabaseSync.prototype.exec=original;other.close();}
}));

test('snapshot validation rejects altered bytes, metadata, missing manifests, unsupported schemas and links',()=>fixture(async({profile,file,db,close})=>{
  close();const lib=new Library(file);let snapshot;try{snapshot=lib.upgradeBackup.file;}finally{lib.close();}
  const manifest=snapshot+'.json',bytes=await readFile(snapshot),json=await readFile(manifest);
  await writeFile(snapshot,Buffer.concat([bytes,Buffer.from('tampering')]));assert.throws(()=>verifyUpgradeBackup(snapshot),/checksum/);await writeFile(snapshot,bytes);
  const data=JSON.parse(json);await writeFile(manifest,JSON.stringify({...data,file:'../library.sqlite'}));assert.throws(()=>verifyUpgradeBackup(snapshot),/manifest/);await writeFile(manifest,json);
  await rm(manifest);assert.throws(()=>verifyUpgradeBackup(snapshot));await writeFile(manifest,json);
  const current=new DatabaseSync(snapshot);current.exec('PRAGMA user_version=999');current.close();const changed=await readFile(snapshot);await writeFile(manifest,JSON.stringify({...data,size:changed.length,sha256:hash(changed)}));assert.throws(()=>verifyUpgradeBackup(snapshot),/database verification/);
  await writeFile(snapshot,bytes);await writeFile(manifest,json);
  const outside=path.join(profile,'linked');await mkdir(outside);const link=path.join(outside,path.basename(snapshot));
  if(process.platform!=='win32'){await symlink(snapshot,link);await writeFile(link+'.json',json);assert.throws(()=>verifyUpgradeBackup(link),/without links/);}
}));

test('offline recovery creates a separate compatible profile, refuses existing destinations, and leaves the live profile/snapshot untouched',()=>fixture(async({temp,file,db,close})=>{
  const before=rows(db);close();const lib=new Library(file);let snapshot;try{snapshot=lib.upgradeBackup.file;lib.save(lib.list().books[0].id,{page:9,total:20});}finally{lib.close();}
  const original=hash(await readFile(file)),snapshotHash=hash(await readFile(snapshot)),target=path.join(temp,'Recovered profile');
  const result=recoverUpgradeBackup(snapshot,target);assert.equal(result.schema,7);assert.equal(hash(await readFile(file)),original);assert.equal(hash(await readFile(snapshot)),snapshotHash);
  const recovered=new DatabaseSync(path.join(target,'library.sqlite'));try{assert.equal(recovered.prepare('PRAGMA user_version').get().user_version,7);assert.deepEqual(rows(recovered),before);}finally{recovered.close();}
  assert.throws(()=>recoverUpgradeBackup(snapshot,target));assert.throws(()=>recoverUpgradeBackup(snapshot,path.dirname(file)));assert.equal(hash(await readFile(file)),original);
  const cli=spawnSync(process.execPath,['scripts/recover-upgrade.mjs',snapshot],{encoding:'utf8'});assert.equal(cli.status,0,cli.stderr);assert.equal(JSON.parse(cli.stdout).verified,true);
  const second=path.join(temp,'CLI recovered profile'),copy=spawnSync(process.execPath,['scripts/recover-upgrade.mjs',snapshot,'--to',second],{encoding:'utf8'});assert.equal(copy.status,0,copy.stderr);assert.ok((await stat(path.join(second,'library.sqlite'))).isFile());
}));

test('failed server upgrades release the profile runtime marker and a corrected retry starts with unchanged reading data',()=>fixture(async({profile,file,close})=>{
  close();const blocked=path.join(profile,'upgrade-backups');await writeFile(blocked,'temporary simulated storage failure');
  const failed=spawnSync(process.execPath,['server.mjs'],{env:{...process.env,EBOOK_PROFILE:profile,EBOOK_LIBRARY:'',PORT:'0'},encoding:'utf8',timeout:20000,windowsHide:true});
  assert.equal(failed.status,1,failed.stderr);assert.match(failed.stderr,/could not save and verify a backup/);await assert.rejects(stat(path.join(profile,'server-runtime.json')),e=>e.code==='ENOENT');
  await rm(blocked);
  const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,EBOOK_PROFILE:profile,EBOOK_LIBRARY:'',PORT:'0'},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
  let output='';child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});const exited=new Promise(resolve=>child.once('exit',resolve));
  try{
    const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server did not become ready: '+output)),20000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',()=>{clearTimeout(timer);reject(new Error('Server exited: '+output));});child.on('message',message=>{if(message.type==='folio:ready'){clearTimeout(timer);resolve(message);}});});
    const response=await fetch(ready.origin),cookie=response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');await response.body.cancel();
    const backup=await(await fetch(ready.origin+'/api/backup',{headers:{cookie}})).json();assert.equal(backup.books[0].state.page,4);assert.equal(backup.reading[0].seconds,12);assert.equal(backup.preferences.networkEnabled,false);assert.match(output,/pre-upgrade database backup/);
    child.send({type:'folio:shutdown',instance:ready.instance});assert.equal(await exited,0);
    await assert.rejects(stat(path.join(profile,'server-runtime.json')),e=>e.code==='ENOENT');
    assert.equal(privateReleasePath('upgrade-backups/manifest.json'),true);assert.equal(privateReleasePath('resources/upgrade-backups/private.json'),true);
  }finally{if(child.exitCode===null){child.disconnect();await exited;}}
}));
