import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,copyFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Library} from '../lib/library.mjs';
import {DuplicateVerifier} from '../lib/duplicate-verifier.mjs';
import {previewRelink} from '../lib/relink-review.mjs';
import {spawn} from 'node:child_process';
async function fixture(run){const temp=await mkdtemp(path.join(os.tmpdir(),'folio-health-')),root=path.join(temp,'books');await mkdir(root);const lib=new Library(path.join(temp,'profile.sqlite'));try{await lib.configure(root);await run(lib,root);}finally{lib.close();await rm(temp,{recursive:true,force:true});}}

test('HTTP relink requires a fresh review and saves the destination reading data before applying',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'folio-relink-api-')),root=path.join(temp,'books'),profile=path.join(temp,'profile');await mkdir(root);await mkdir(profile);const lib=new Library(path.join(profile,'library.sqlite'));let child;
  try{
    lib.preferences({watchLibrary:false});await lib.configure(root);await writeFile(path.join(root,'Old.pdf'),'book');await lib.scan();const old=lib.list().books[0];lib.save(old.id,{page:3,total:10,seconds:9});await copyFile(path.join(root,'Old.pdf'),path.join(root,'New.pdf'));await rm(path.join(root,'Old.pdf'));await lib.scan();const replacement=lib.list().books.find(b=>b.available);lib.close();
    child=spawn(process.execPath,['server.mjs'],{env:{...process.env,EBOOK_PROFILE:profile,PORT:'0'},stdio:['ignore','pipe','pipe']});
    const origin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server timed out')),10000);child.stdout.on('data',data=>{const match=String(data).match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});child.once('error',reject);});
    const home=await fetch(origin),cookie=home.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
    const api=async(route,data)=>{const response=await fetch(origin+'/api/'+route,{method:'POST',headers:{cookie,origin,'Content-Type':'application/json'},body:JSON.stringify(data)});return {ok:response.ok,data:await response.json()};};
    const selection={missing:old.id,replacement:replacement.id};assert.equal((await api('relink',selection)).ok,false);const review=await api('relink/preview',selection);assert.equal(review.ok,true);await api('state/'+replacement.id,{page:1,total:10});assert.equal((await api('relink',{...selection,token:review.data.token})).ok,false);
    const fresh=await api('relink/preview',selection),applied=await api('relink',{...selection,token:fresh.data.token});assert.equal(applied.ok,true);const safety=JSON.parse(await readFile(path.join(profile,'backups',applied.data.safetyBackup),'utf8'));assert.equal(safety.books.find(b=>b.id===replacement.id).state.page,1);const result=await(await fetch(origin+'/api/book/'+replacement.id,{headers:{cookie}})).json();assert.equal(result.state.page,3);assert.equal(await readFile(path.join(root,'New.pdf'),'utf8'),'book');
    await api('shutdown',{});await new Promise(resolve=>child.once('exit',resolve));
  }finally{try{lib.close();}catch{}if(child&&child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}await rm(temp,{recursive:true,force:true});}
});

test('verification separates equal-size candidates by actual bytes and leaves all files and reading data intact',()=>fixture(async(lib,root)=>{
  for(const [name,text]of [['A.pdf','same'],['B.pdf','same'],['C.pdf','else']])await writeFile(path.join(root,name),text);await lib.scan();const before=lib.backup(),service=new DuplicateVerifier(lib);assert.equal(lib.duplicateCandidates()[0].length,3);const result=await service.run();assert.equal(result.checked,3);assert.deepEqual(result.groups[0].map(b=>b.source).sort(),['A.pdf','B.pdf']);assert.deepEqual(lib.backup().books,before.books);assert.equal(await readFile(path.join(root,'C.pdf'),'utf8'),'else');assert.equal(service.result().stale,false);await lib.scan();assert.equal(service.result().stale,true);assert.equal(lib.preferences().networkEnabled,false);
}));
test('verification is bounded, cancellable, and disabled/hidden in Incognito',()=>fixture(async(lib,root)=>{
  await writeFile(path.join(root,'A.pdf'),'same');await writeFile(path.join(root,'B.pdf'),'same');await lib.scan();const bounded=new DuplicateVerifier(lib,{maxBytes:3});assert.equal((await bounded.run()).limited,true);assert.equal(bounded.job.bytes,0);const original=lib.content.bind(lib),service=new DuplicateVerifier(lib);lib.content=async(...args)=>{service.cancel();return original(...args);};assert.equal((await service.run()).status,'Cancelled');assert.equal(service.job.groups.length,0);lib.preferences({incognito:true});await assert.rejects(service.run(),/Incognito/);assert.equal(service.result().groups.length,0);
}));
test('verification rejects files changed while reading instead of reporting an identical pair',()=>fixture(async(lib,root)=>{
  await writeFile(path.join(root,'A.pdf'),'same');await writeFile(path.join(root,'B.pdf'),'same');await lib.scan();const original=lib.content.bind(lib);let calls=0;lib.content=async(...args)=>{const file=await original(...args);if(++calls===2)await writeFile(file,'else');return file;};const result=await new DuplicateVerifier(lib).run();assert.equal(result.groups.length,0);assert.equal(result.issues.length,1);assert.match(result.issues[0].message,/changed/);
}));
test('relink review changes when reading data changes and remaps image-page paths for copied folders',()=>fixture(async(lib,root)=>{
  await mkdir(path.join(root,'Old'));for(const n of ['1.png','2.png','3.png'])await writeFile(path.join(root,'Old',n),'page '+n);await lib.scan();const old=lib.list().books[0];lib.details(old.id,{imageOrder:[old.pages[2],old.pages[0],old.pages[1]],excludedPages:[old.pages[1]]});lib.save(old.id,{page:0,total:2,anchor:old.pages[2],seconds:10});await mkdir(path.join(root,'Replacement'));for(const n of ['1.png','2.png','3.png'])await copyFile(path.join(root,'Old',n),path.join(root,'Replacement',n));await rm(path.join(root,'Old'),{recursive:true});await lib.scan();const replacement=lib.list().books.find(b=>b.available),plan=previewRelink(lib,old.id,replacement.id);lib.save(replacement.id,{page:1,total:3});assert.notEqual(previewRelink(lib,old.id,replacement.id).token,plan.token);lib.relink(old.id,replacement.id);const moved=lib.book(replacement.id);assert.deepEqual(moved.pages,[path.join('Replacement','3.png'),path.join('Replacement','1.png')]);assert.equal(moved.state.anchor,path.join('Replacement','3.png'));assert.equal(await readFile(await lib.content(replacement.id),'utf8'),'page 3.png');lib.preferences({incognito:true});assert.throws(()=>previewRelink(lib,old.id,replacement.id),/Incognito/);
}));
