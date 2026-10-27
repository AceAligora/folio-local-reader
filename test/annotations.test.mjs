import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {Library} from '../lib/library.mjs';import {validateState,restoreBackup} from '../lib/backup.mjs';import {changeAnnotation} from '../lib/annotations.mjs';
import {annotationFields,annotationColor,annotationMatches,notebookEntries,notesMarkdown} from '../public/annotations.js';
const note=(patch={})=>({id:crypto.randomUUID(),page:0,text:'Local observation',created:123,...patch});
async function fixture(run){const temp=await mkdtemp(path.join(os.tmpdir(),'folio-notes-')),root=path.join(temp,'books');await mkdir(root);let lib=new Library(path.join(temp,'library.sqlite'));try{await writeFile(path.join(root,'Book.pdf'),'unchanged bytes');await lib.configure(root);await lib.scan();await run(lib,root,temp,()=>{lib.close();lib=new Library(path.join(temp,'library.sqlite'));return lib;});}finally{lib.close();await rm(temp,{recursive:true,force:true});}}

test('old notes and colored/tagged notes survive restart and backup restore without modifying ebooks',()=>fixture(async(lib,root,temp,reopen)=>{
  const id=lib.list().books[0].id,old=note(),highlight=note({quote:'A passage',color:'blue',tags:[' research ','revisit','research']});lib.details(id,{notes:[old,highlight]});lib.save(id,{page:3,total:10,seconds:7});const backup=lib.backup();assert.equal(backup.books[0].state.notes[0].color,undefined);assert.deepEqual(backup.books[0].state.notes[1].tags,['research','revisit']);lib=reopen();assert.equal(lib.book(id).state.notes[1].color,'blue');lib.details(id,{notes:[]});restoreBackup(lib,backup);assert.deepEqual(lib.book(id).state.notes,backup.books[0].state.notes);assert.equal(lib.book(id).state.page,3);assert.equal(lib.insights()[0].seconds,7);assert.equal(await readFile(path.join(root,'Book.pdf'),'utf8'),'unchanged bytes');
}));
test('note metadata validation accepts only the palette and bounded tags, including on backup import',()=>{
  assert.deepEqual(annotationFields({tags:[' one ','one'],color:'pink'}),{tags:['one'],color:'pink'});
  for(const patch of [{color:'url(https://example.com)'},{color:'__proto__'},{tags:['a,b']},{tags:['\u0000']},{tags:['x'.repeat(61)]},{tags:Array(21).fill('x')},{tags:[5]}])assert.throws(()=>validateState({notes:[note(patch)]}));
  const n=note();assert.throws(()=>validateState({notes:[n,n]}),/Duplicate/);assert.equal(annotationColor(n),'yellow');
});
test('individual note mutations preserve unrelated notes, reject stale editors and support safe undo',()=>fixture(async lib=>{
  const id=lib.list().books[0].id,a=note(),b=note({text:'Other note'});changeAnnotation(lib,id,{operation:'save',note:a});changeAnnotation(lib,id,{operation:'save',note:b});const changed={...a,text:'New text',color:'green',tags:['topic']};changeAnnotation(lib,id,{operation:'save',note:changed,previous:a});assert.throws(()=>changeAnnotation(lib,id,{operation:'save',note:{...a,text:'Stale edit'},previous:a}),/changed elsewhere/);assert.throws(()=>changeAnnotation(lib,id,{operation:'remove',note:a,previous:a}),/changed elsewhere/);assert.equal(lib.book(id).state.notes.find(n=>n.id===b.id).text,'Other note');changeAnnotation(lib,id,{operation:'remove',note:changed,previous:changed});changeAnnotation(lib,id,{operation:'save',note:changed});assert.equal(lib.book(id).state.notes.find(n=>n.id===a.id).color,'green');assert.throws(()=>changeAnnotation(lib,id,{operation:'save',note:changed}),/changed elsewhere/);
}));
test('PDF quote matches are page-scoped and colored while search remains independent and bounded',()=>{
  const notes=[note({page:1,quote:'Shared passage',color:'purple'})],text='shared passage repeats shared passage';assert.equal(annotationMatches(text,notes,0).length,0);assert.equal(annotationMatches(text,notes,1).length,2);assert.equal(annotationMatches(text,notes,1)[0].color,'purple');assert.equal(annotationMatches(text,notes,0,'passage').length,2);assert.equal(annotationMatches('a '.repeat(1000),[note({quote:'a'})],0).length,200);
});
test('notebook searches passages and note tags, combines filters and sorts across books',()=>{
  const a={id:'a',title:'Alpha',format:'pdf',source:'A.pdf',state:{tags:['book-topic'],notes:[note({text:'Comment',quote:'Hidden passage',tags:['research'],color:'blue',created:10}),note({text:'Older plain note',created:1})]}},b={id:'b',title:'Beta',format:'epub',source:'B.epub',state:{metadata:{title:'Custom title',author:'Writer'},notes:[note({text:'Newest note',tags:['research'],color:'pink',created:20})]}};
  assert.equal(notebookEntries([a,b],{query:'hidden passage'}).length,1);assert.equal(notebookEntries([a,b],{query:'book-topic'}).length,2);assert.equal(notebookEntries([a,b],{tag:'research',kind:'highlights',color:'blue'}).length,1);assert.equal(notebookEntries([a,b],{sort:'newest'})[0].book.id,'b');assert.equal(notebookEntries([a,b],{color:'yellow'}).length,1);
});
test('filtered Markdown export retains quotes, source locations, colors and tags as literal text',()=>{
  const book={id:'b',title:'<img src=x>',source:'Book.pdf',format:'pdf',state:{notes:[note({text:'My comment',quote:'<script>alert(1)</script>\n![remote](https://example.com/image)',tags:['research'],color:'blue'}),note({text:'Do not export',color:'pink'})]}};
  const markdown=notesMarkdown([book],{color:'blue'});assert.match(markdown,/Source: Book.pdf/);assert.match(markdown,/Page 1/);assert.match(markdown,/Tags: research/);assert.match(markdown,/Color: blue/);assert.match(markdown,/My comment/);assert.doesNotMatch(markdown,/<script>|<img|Do not export/);assert.ok(markdown.includes('\\!\\[remote\\]'));assert.equal(notebookEntries([book],{color:'pink'}).length,1);
});
