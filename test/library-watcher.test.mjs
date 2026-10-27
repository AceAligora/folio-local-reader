import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,mkdir,writeFile,rename,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Library} from '../lib/library.mjs';
import {LibraryWatcher} from '../lib/library-watcher.mjs';

const waitFor=async(predicate)=>{const deadline=Date.now()+6000;while(!predicate()){if(Date.now()>deadline)throw new Error('Timed out waiting for folder refresh');await new Promise(r=>setTimeout(r,20));}};

test('watcher coalesces events, waits for scans, handles exclusions, privacy, errors and shutdown',async()=>{
  let callback,handle,scans=0,attempts=0;const prefs={watchLibrary:true,incognito:false,excludedFolders:['Skip']};let root='one';const library={preferences:()=>prefs,root:()=>root,job:{running:false},scan:async()=>{scans++;}};
  const watcher=new LibraryWatcher(library,{delay:10,maxDelay:30,retry:0,watchImpl:(folder,options,fn)=>{attempts++;callback=fn;handle=new EventEmitter();handle.close=()=>{handle.closed=true;};return handle;}});
  try{watcher.reconcile();callback('change','notes.txt');callback('rename','Skip/book.pdf');assert.equal(watcher.pending,false);for(let i=0;i<10;i++)callback('rename','book.pdf');await waitFor(()=>scans===1);assert.equal(attempts,1);
    library.job.running=true;callback('change','book.pdf');await new Promise(r=>setTimeout(r,40));assert.equal(scans,1);library.job.running=false;await waitFor(()=>scans===2);
    prefs.incognito=true;watcher.reconcile();assert.equal(watcher.status,'Off');assert.equal(handle.closed,true);callback('rename','book.pdf');assert.equal(watcher.pending,false);
    prefs.incognito=false;watcher.reconcile();handle.emit('error',new Error('Drive disconnected'));assert.match(watcher.status,/unavailable/);watcher.reconcile();assert.equal(attempts,3);root='two';watcher.reconcile();assert.equal(attempts,4);watcher.close();watcher.reconcile();assert.equal(attempts,4);
  }finally{watcher.close();}
});

test('real recursive watcher detects new books and renamed image folders with reading data intact offline',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'folio-watch-')),root=path.join(temp,'books');await mkdir(path.join(root,'Original'),{recursive:true});let lib,watcher;
  try{for(const name of ['1.png','2.png','3.png'])await writeFile(path.join(root,'Original',name),'unchanged '+name);lib=new Library(path.join(temp,'library.sqlite'));await lib.configure(root);await lib.scan();const book=lib.list().books[0];lib.details(book.id,{imageOrder:[book.pages[2],book.pages[0],book.pages[1]],excludedPages:[book.pages[1]],favorite:true});lib.save(book.id,{page:0,total:2,anchor:book.pages[2],seconds:7,readerPreferences:{readingMode:'webtoon'},flowPosition:{page:0,fraction:.4}});const collection=lib.saveCollection({name:'My reading',books:[book.id]});
    watcher=new LibraryWatcher(lib,{delay:40});watcher.reconcile();assert.match(watcher.status,/Watching/);await writeFile(path.join(root,'New.pdf'),'new book');await waitFor(()=>lib.list().total===2&&!lib.job.running);
    await rename(path.join(root,'Original'),path.join(root,'Renamed'));await waitFor(()=>lib.book(book.id)?.source==='Renamed'&&!lib.job.running);
    const moved=lib.book(book.id);assert.equal(lib.list().total,2);assert.deepEqual(moved.pages,[path.join('Renamed','3.png'),path.join('Renamed','1.png')]);assert.equal(moved.state.anchor,path.join('Renamed','3.png'));assert.equal(moved.state.readerPreferences.readingMode,'webtoon');assert.equal(moved.state.flowPosition.fraction,.4);assert.equal(lib.insights()[0].seconds,7);assert.deepEqual(lib.collections().find(c=>c.id===collection.id).books,[book.id]);assert.equal(await readFile(await lib.content(book.id),'utf8'),'unchanged 3.png');assert.equal(lib.preferences().networkEnabled,false);
  }finally{watcher?.close();while(lib?.job.running)await new Promise(r=>setTimeout(r,10));lib?.close();await rm(temp,{recursive:true,force:true});}
});
