import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,rename} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Library} from '../lib/library.mjs';
import {validatePreferences} from '../lib/preferences.mjs';
import {restoreBackup} from '../lib/backup.mjs';

test('folder exclusions reject absolute, escaping and ambiguous paths',()=>{
  for(const folder of ['../secret','/Books','C:\\Books','Books//Extras','Books/./Extras','Books/*','Books\u0000'])assert.throws(()=>validatePreferences({excludedFolders:[folder]}));
  assert.deepEqual(validatePreferences({excludedFolders:[' Comics\\Extras ','Comics/Extras']}).excludedFolders,['Comics/Extras']);
});
test('incremental folder listings detect edits, additions, moves and removals while preserving excluded reading data',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'folio-scan-')),root=path.join(temp,'books'),db=path.join(temp,'profile.sqlite');await mkdir(path.join(root,'Study','Extras'),{recursive:true});await mkdir(path.join(root,'Study2'));let lib=new Library(db);
  try{
    await writeFile(path.join(root,'Study','A.pdf'),'first');await writeFile(path.join(root,'Study','Extras','B.epub'),'original');await writeFile(path.join(root,'Study2','C.pdf'),'third');await lib.configure(root);await lib.scan();
    const b=lib.list().books.find(b=>b.title==='B'),a=lib.list().books.find(b=>b.title==='A');lib.save(b.id,{page:7,total:12,seconds:8});
    const manual=lib.saveCollection({name:'Study',books:[a.id]});lib.preferences({folderCollections:true});assert.equal(lib.collections().filter(c=>c.generated).length,3);
    const folder=lib.collections().find(c=>c.id==='folder:Study');assert.equal(folder.books.length,2);assert.throws(()=>lib.saveCollection({...folder,books:[]}));assert.throws(()=>lib.removeCollection(folder.id));
    await lib.scan();assert.equal(lib.job.readFolders,0);assert.equal(lib.job.cachedFolders,4);const updates=lib.updates().length;
    await writeFile(path.join(root,'Study','A.pdf'),'modified contents');await lib.scan();assert.equal(lib.job.cachedFolders,4);assert.equal(lib.updates().length,updates+1);
    lib.preferences({excludedFolders:['Study/Extras']});await lib.scan();assert.equal(lib.list().total,2);assert.equal(lib.book(b.id).available,1);assert.equal(lib.book(b.id).state.page,7);assert.equal(lib.collections().find(c=>c.id==='folder:Study').books.length,1);assert.equal(lib.collections().some(c=>c.id==='folder:Study/Extras'),false);
    const backup=lib.backup();assert.equal(backup.books.length,3);assert.equal(backup.collections.length,1);restoreBackup(lib,backup);assert.equal(lib.collections().find(c=>c.id===manual.id).generated,undefined);
    lib.preferences({excludedFolders:[]});await lib.scan();assert.equal(lib.book(b.id).state.page,7);assert.equal(lib.list().total,3);
    await writeFile(path.join(root,'Study','New.pdf'),'new');await rename(path.join(root,'Study2','C.pdf'),path.join(root,'Study','Moved.pdf'));await rm(path.join(root,'Study','A.pdf'));await lib.scan();assert.ok(lib.list().books.some(b=>b.title==='New'&&b.available));assert.equal(lib.book(a.id).available,0);assert.equal(lib.collections().find(c=>c.id==='folder:Study').books.length,3);
    await lib.scan({full:true});assert.equal(lib.job.cachedFolders,0);assert.equal(lib.job.readFolders,4);
    lib.close();lib=new Library(db);await lib.scan();assert.equal(lib.job.cachedFolders,4);assert.equal(lib.book(b.id).state.page,7);
    lib.preferences({folderCollections:false});assert.deepEqual(lib.collections().map(c=>c.id),[manual.id]);
  }finally{lib.close();await rm(temp,{recursive:true,force:true});}
});
