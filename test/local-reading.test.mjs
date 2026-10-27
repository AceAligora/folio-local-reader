import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rename,rm,readFile,symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Library} from '../lib/library.mjs';
import {AutomaticBackups} from '../lib/automatic-backups.mjs';
import {restoreBackup,validateState} from '../lib/backup.mjs';

async function fixture(run){const temp=await mkdtemp(path.join(os.tmpdir(),'folio-local-reading-'));let library;try{const root=path.join(temp,'books');await mkdir(root);await writeFile(path.join(root,'Novel.pdf'),'original content');library=new Library(path.join(temp,'library.sqlite'));await library.configure(root);await library.scan();await run(library,root,temp);}finally{library?.close();await rm(temp,{recursive:true,force:true});}}

test('same-volume rename retains book ID, annotations, time and collection without changing originals',()=>fixture(async(lib,root)=>{
  const book=lib.list().books[0];lib.save(book.id,{page:4,total:20,seconds:12,flowPosition:{page:4,fraction:.42},readerPreferences:{readingMode:'continuous-vertical',padding:60}});lib.details(book.id,{favorite:true,bookmarks:[{page:4,label:'Return here'}]});const collection=lib.saveCollection({name:'Reading',books:[book.id]});
  await mkdir(path.join(root,'Moved'));await rename(path.join(root,'Novel.pdf'),path.join(root,'Moved','Renamed.pdf'));await lib.scan();
  const moved=lib.book(book.id);assert.equal(lib.list().total,1);assert.equal(moved.source,path.join('Moved','Renamed.pdf'));assert.equal(moved.available,1);assert.equal(moved.state.page,4);assert.equal(moved.state.flowPosition.fraction,.42);assert.equal(moved.state.favorite,true);assert.equal(moved.state.bookmarks[0].label,'Return here');assert.equal(lib.insights()[0].seconds,12);assert.deepEqual(lib.collections().find(c=>c.id===collection.id).books,[book.id]);assert.equal(await readFile(path.join(root,moved.source),'utf8'),'original content');
}));

test('different files are not inferred as moves from equal contents or size',()=>fixture(async(lib,root)=>{
  const id=lib.list().books[0].id;await writeFile(path.join(root,'Other.pdf'),'original content');await rm(path.join(root,'Novel.pdf'));await lib.scan();assert.equal(lib.book(id).available,0);assert.notEqual(lib.list().books.find(b=>b.available).id,id);
}));

test('reading recovery rotates owned snapshots, respects Incognito and restores book preferences',()=>fixture(async(lib,root,temp)=>{
  const service=new AutomaticBackups(lib,temp),book=lib.list().books[0];lib.preferences({backupKeep:2});lib.save(book.id,{page:3,total:15,readerPreferences:{pageLayout:'double',epubSize:26},flowPosition:{page:3,fraction:.7}});
  const first=await service.tick();assert.ok(first.name);assert.equal(await service.tick(),undefined);const backup=await service.read(first.name);lib.save(book.id,{page:8,total:15});restoreBackup(lib,backup);assert.equal(lib.book(book.id).state.page,3);assert.equal(lib.book(book.id).state.readerPreferences.epubSize,26);
  for(let i=0;i<3;i++){await new Promise(r=>setTimeout(r,4));await service.tick(true);}assert.equal((await service.list()).length,2);await writeFile(path.join(service.folder,'personal.json'),'keep');await service.tick(true);assert.equal(await readFile(path.join(service.folder,'personal.json'),'utf8'),'keep');
  lib.preferences({incognito:true});assert.equal(await service.tick(true),undefined);lib.preferences({incognito:false,automaticBackups:false});assert.equal(await service.tick(),undefined);await assert.rejects(service.read('../library.sqlite'));
}));

test('book settings and offsets reject untrusted preferences and invalid ranges',()=>{
  assert.throws(()=>validateState({readerPreferences:{networkEnabled:true}}));assert.throws(()=>validateState({readerPreferences:{epubSize:200}}));assert.throws(()=>validateState({flowPosition:{page:1,fraction:2}}));assert.deepEqual(validateState({readerPreferences:{background:'black'}}).readerPreferences,{background:'black'});
});
