import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Library} from '../lib/library.mjs';
import {validatePreferences} from '../lib/preferences.mjs';

test('preferences default to resume and enforce settings/repository boundaries',()=>{
  assert.equal(validatePreferences({}).resume,true);
  assert.equal(validatePreferences({}).defaultTab,'last');
  assert.equal(validatePreferences({}).showCounts,false);
  assert.equal(validatePreferences({}).remoteContentChecks,false);
  assert.throws(()=>validatePreferences({remoteContentChecks:'true'}));
  assert.throws(()=>validatePreferences({columns:0}));
  assert.throws(()=>validatePreferences({tabs:['library']}));
  assert.throws(()=>validatePreferences({repositories:['http://example.com/index.pb']}));
  assert.throws(()=>validatePreferences({repositories:['https://example.com/install.exe']}));
  assert.equal(validatePreferences({repositories:['https://example.com/index.pb']}).repositories.length,1);
});
test('resume, scroll, time, categories, updates and incognito survive profile reload',async()=>{
  const tmp=await mkdtemp(path.join(os.tmpdir(),'folio-workspace-'));const root=path.join(tmp,'books');await mkdir(root);const file=path.join(tmp,'profile.sqlite');let library=new Library(file);
  try{
    await writeFile(path.join(root,'A.pdf'),'initial');await library.configure(root);await library.scan();
    const book=library.list().books[0];library.preferences({categories:['Default','Study'],defaultCategory:'Study'});
    library.save(book.id,{page:12,scroll:450,total:30,seconds:10,view:{zoom:'1.5',rotation:90}});
    library.details(book.id,{bookmarks:[{page:12,label:'Remember'}]});
    library.close();library=new Library(file);
    assert.equal(library.book(book.id).state.page,12);assert.equal(library.book(book.id).state.scroll,450);assert.deepEqual(library.book(book.id).state.view,{zoom:'1.5',rotation:90});assert.equal(library.insights()[0].seconds,10);
    assert.equal(library.list('','',0,'','title','Study').total,1);assert.equal(library.list('','',0,'unread').total,0);
    assert.equal(library.updates().length,1);await library.scan();assert.equal(library.updates().length,1);
    await writeFile(path.join(root,'A.pdf'),'changed and expanded');await library.scan();assert.equal(library.updates()[0].kind,'Local file updated');assert.equal(library.updates().length,2);
    library.preferences({incognito:true});library.save(book.id,{page:20,scroll:800,total:30,seconds:10});
    assert.equal(library.book(book.id).state.page,12);assert.equal(library.insights()[0].seconds,10);assert.equal(library.backup().format,'folio-backup-v1');
    assert.equal(library.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  }finally{library.close();await rm(tmp,{recursive:true,force:true});}
});
