import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,mkdir,readFile,readdir,rm} from 'node:fs/promises';
import {Readable} from 'node:stream';
import os from 'node:os';
import path from 'node:path';
import {Library} from '../lib/library.mjs';
import {Imports} from '../lib/imports.mjs';
test('imports stage files, reject unsafe names, preserve bytes and group images naturally',async()=>{
 const temp=await realpath(await mkdtemp(path.join(os.tmpdir(),'folio-import-test-'))),root=path.join(temp,'books');await mkdir(root);const library=new Library(path.join(temp,'db.sqlite')),imports=new Imports(library,temp);
 try{
 await library.configure(root);const {id}=await imports.begin();
 await assert.rejects(()=>imports.upload(id,'../escape.pdf',Readable.from(['bad'])));
 await assert.rejects(()=>imports.upload(id,'script.exe',Readable.from(['bad'])));
 for(const [name,bytes]of [['Book.pdf','original bytes'],['Images/page10.png','ten'],['Images/page2.png','two']])await imports.upload(id,name,Readable.from([Buffer.from(bytes)]));
 assert.equal(library.list().total,0);await assert.rejects(()=>imports.upload(id,'Book.pdf',Readable.from(['overwrite'])));
 await imports.finish(id);assert.equal(library.list().total,2);const book=library.list().books.find(b=>b.format==='pdf');assert.equal(await readFile(await library.content(book.id),'utf8'),'original bytes');assert.equal(library.root(),root);
 const image=library.list().books.find(b=>b.format==='images');assert.deepEqual(image.pages.map(p=>path.basename(p)),['page2.png','page10.png']);
 const canceled=await imports.begin();await imports.upload(canceled.id,'Unused.epub',Readable.from(['fixture']));await imports.cancel(canceled.id);assert.equal((await readdir(path.join(temp,'imports'))).length,0);
 }finally{library.close();await rm(temp,{recursive:true,force:true});}
});
test('collections support overlapping memberships, validation, filtering and profile reload',async()=>{
 const temp=await realpath(await mkdtemp(path.join(os.tmpdir(),'folio-collections-test-'))),root=path.join(temp,'books');await mkdir(root);let library=new Library(path.join(temp,'db.sqlite'));const imports=new Imports(library,temp);
 try{
 await library.configure(root);const batch=await imports.begin();await imports.upload(batch.id,'Book.pdf',Readable.from(['fixture']));await imports.finish(batch.id);const book=library.list().books[0];
 const first=library.saveCollection({name:'Favorites',books:[book.id]}),second=library.saveCollection({name:'To study',books:[book.id]});
 assert.equal(library.list('','',0,'','title','','',false,first.id).total,1);assert.throws(()=>library.saveCollection({name:' favorites ',books:[]}));assert.throws(()=>library.saveCollection({name:'Bad',books:['missing']}));
 library.close();library=new Library(path.join(temp,'db.sqlite'));assert.equal(library.collections().length,2);library.saveCollection({...first,name:'Read later',books:[]});assert.equal(library.list('','',0,'','title','','',false,first.id).total,0);library.removeCollection(second.id);assert.equal(library.collections().length,1);assert.equal(library.list().total,1);assert.equal(library.book(book.id).state.category,undefined);
 }finally{library.close();await rm(temp,{recursive:true,force:true});}
});

test('localhost import and collection endpoints complete a real authenticated workflow',async()=>{
 const {spawn}=await import('node:child_process');const temp=await realpath(await mkdtemp(path.join(os.tmpdir(),'folio-http-test-'))),root=path.join(temp,'books');await mkdir(root);
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,EBOOK_PROFILE:path.join(temp,'profile'),EBOOK_LIBRARY:root,PORT:'4400'},stdio:['pipe','pipe','pipe']});
 try{
 const origin=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Server startup timed out')),15000);child.stdout.on('data',data=>{output+=data;const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});child.once('error',reject);});
 const home=await fetch(origin),cookie=home.headers.get('set-cookie').split(';')[0];
 const api=async(route,data)=>{const response=await fetch(origin+'/api/'+route,{method:data===undefined?'GET':'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});assert.equal(response.status,200,await response.clone().text());return response.json();};
 const batch=await api('import/begin',{});const upload=await fetch(origin+'/api/import/file?id='+batch.id+'&name=Sample.pdf',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/octet-stream'},body:Buffer.from('%PDF-fixture')});assert.equal(upload.status,200);await api('import/finish',{id:batch.id});const books=await api('books');assert.equal(books.total,1);
 const collection=await api('collections',{name:'Sample collection',books:[books.books[0].id]});assert.equal((await api('books?collection='+collection.id)).total,1);await api('collections',{...collection,books:[]});assert.equal((await api('books?collection='+collection.id)).total,0);await api('collections/remove',{id:collection.id});assert.deepEqual(await api('collections'),[]);assert.equal((await api('status')).root,root);
 const adapters=await api('sources');assert.equal(adapters.adapters.length,3);assert.equal(adapters.adapters.find(s=>s.id==='openlibrary').installedVersion,0);await api('sources/manage',{id:'openlibrary',action:'add'});await api('sources/manage',{id:'openlibrary',action:'settings',settings:{language:'fr',limit:8}});assert.equal((await api('sources')).adapters.find(s=>s.id==='openlibrary').settings.language,'fr');await api('sources/manage',{id:'openlibrary',action:'remove'});assert.equal((await api('books')).total,1);assert.equal((await api('preferences')).networkEnabled,false);
 const backup=await api('backup');assert.equal((await api('restore/preview',backup)).matched,1);const restored=await api('restore',{backup,preferences:false});assert.ok(restored.safetyBackup.endsWith('.json'));
 const setup=await fetch(origin+'/api/lock/setup',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password:'isolated-test-password'})});assert.equal(setup.status,200);assert.equal((await fetch(origin+'/api/books',{headers:{Cookie:cookie}})).status,423);assert.equal((await fetch(origin+'/vendor/fflate/esm/browser.js',{headers:{Cookie:cookie}})).status,200);
 const unlocked=await fetch(origin+'/api/lock/unlock',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password:'isolated-test-password'})});assert.equal(unlocked.status,200);const unlockCookie=unlocked.headers.get('set-cookie').split(';')[0];assert.equal((await fetch(origin+'/api/books',{headers:{Cookie:cookie+'; '+unlockCookie}})).status,200);
 const exited=new Promise(resolve=>child.once('exit',resolve));const stopped=await fetch(origin+'/api/shutdown',{method:'POST',headers:{Cookie:cookie+'; '+unlockCookie,Origin:origin,'Content-Type':'application/json'},body:'{}'});assert.equal(stopped.status,200);await exited;


 }finally{if(child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}await rm(temp,{recursive:true,force:true});}
});
