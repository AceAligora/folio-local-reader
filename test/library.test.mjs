import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rename, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Library, naturalOrder, inside } from '../lib/library.mjs';

test('natural ordering is deterministic and rejects path escapes',()=>{
  assert.deepEqual(['page10.png','page2.png','page1.png'].sort(naturalOrder),['page1.png','page2.png','page10.png']);
  const root=path.resolve('fixture');assert.equal(inside(root,path.join(root,'a.pdf')),true);assert.equal(inside(root,path.resolve('other')),false);
});
test('scan preserves originals, identities, progress and unavailable-root records',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'folio-test-'));const root=path.join(temp,'Books');await mkdir(root);const lib=new Library(path.join(temp,'test.sqlite'));
  try{
    await mkdir(path.join(root,'Chapters 你好'));
    for(const name of ['page10.png','page2.png','page1.png'])await writeFile(path.join(root,'Chapters 你好',name),'fixture');
    await writeFile(path.join(root,'Book.PDF'),'unchanged');await writeFile(path.join(root,'Novel.epub'),'fixture');await writeFile(path.join(root,'notes.txt'),'ignored');
    await lib.configure(root);await lib.scan();let result=lib.list();assert.equal(result.total,3);
    const image=result.books.find(b=>b.format==='images');assert.deepEqual(image.pages.map(p=>path.basename(p)),['page1.png','page2.png','page10.png']);
    lib.details(image.id,{favorite:true,status:'finished',bookmarks:[{page:1,label:'Reference'}]});
    lib.save(image.id,{page:1});await lib.scan();assert.equal(lib.list().total,3);assert.equal(lib.book(image.id).state.page,1);assert.equal(await readFile(path.join(root,'Book.PDF'),'utf8'),'unchanged');
    assert.equal(lib.book(image.id).state.favorite,true);assert.equal(lib.book(image.id).state.status,'finished');assert.equal(lib.book(image.id).state.bookmarks[0].label,'Reference');
    assert.equal(lib.list('','',0,'favorites').total,1);assert.equal(lib.list('','',0,'finished').total,1);assert.equal(lib.list('','',0,'continue').total,1);
    assert.throws(()=>lib.details(image.id,{bookmarks:[{page:-1,label:'bad'}]}));
    assert.equal(await lib.content(image.id,1),path.join(root,'Chapters 你好','page2.png'));
    await assert.rejects(lib.content(image.id,999));
    await rename(root,`${root}-disconnected`);await lib.scan();assert.equal(lib.list().total,3);assert.ok(lib.list().books.every(b=>b.available));assert.match(lib.job.status,/unavailable/);
    await rename(`${root}-disconnected`,root);await rm(path.join(root,'Book.PDF'));await lib.scan();assert.equal(lib.list().books.find(b=>b.format==='pdf').available,0);
  }finally{lib.close();await rm(temp,{recursive:true,force:true});}
});
