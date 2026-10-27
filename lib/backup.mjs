import {annotationFields} from '../public/annotations.js';
import {validatePreferences} from './preferences.mjs';
import path from 'node:path';

export function validateState(state){
  if(!state||typeof state!=='object'||Array.isArray(state))throw new Error('Invalid reading data.');
  const result={};
  if('queueRank'in state){if(!Number.isInteger(state.queueRank)||state.queueRank<0||state.queueRank>100000)throw new Error('Invalid reading queue position.');result.queueRank=state.queueRank;}
  for(const key of ['page','scroll','total','updated'])if(key in state){if(!Number.isFinite(state[key])||state[key]<0||state[key]>(key==='updated'?1e15:1e8))throw new Error('Invalid '+key);if(['page','total'].includes(key)&&!Number.isInteger(state[key]))throw new Error('Invalid '+key);result[key]=state[key];}
  if('view'in state){const view=state.view;if(!view||!['fit','0.25','0.5','0.75','1','1.5','2','3','4'].includes(view.zoom)||![0,90,180,270].includes(view.rotation))throw new Error('Invalid reading view.');result.view={zoom:view.zoom,rotation:view.rotation};}
  if('readerPreferences'in state){const keys=['readingMode','pageLayout','separateFirst','invertSpread','cropBorders','background','padding','epubFont','epubSize','epubLineHeight','epubWidth'];const patch=state.readerPreferences;if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(k=>!keys.includes(k)))throw new Error('Invalid book preferences.');const checked=validatePreferences(patch);result.readerPreferences=Object.fromEntries(Object.keys(patch).map(k=>[k,checked[k]]));}
  if('flowPosition'in state){const p=state.flowPosition;if(!p||!Number.isInteger(p.page)||p.page<0||p.page>1000000||!Number.isFinite(p.fraction)||p.fraction<0||p.fraction>1)throw new Error('Invalid continuous position.');result.flowPosition={page:p.page,fraction:p.fraction};}
  if('anchor'in state){if(typeof state.anchor!=='string'||state.anchor.length>4000)throw new Error('Invalid reading anchor.');result.anchor=state.anchor;}
  if('epubAnchor'in state){const a=state.epubAnchor;if(!a||typeof a.chapter!=='string'||a.chapter.length>4000||!Number.isInteger(a.offset)||a.offset<0||a.offset>80000000||['quote','prefix','suffix'].some(k=>typeof a[k]!=='string'||a[k].length>({quote:96,prefix:32,suffix:32}[k])))throw new Error('Invalid EPUB text position.');result.epubAnchor={chapter:a.chapter,offset:a.offset,quote:a.quote,prefix:a.prefix,suffix:a.suffix};}
  for(const key of ['imageOrder','excludedPages'])if(key in state){if(!Array.isArray(state[key])||state[key].length>100000||state[key].some(p=>typeof p!=='string'||p.length>4000))throw new Error('Invalid image manifest.');result[key]=[...new Set(state[key])];}
  for(const key of ['category','series'])if(key in state){if(typeof state[key]!=='string'||state[key].length>120)throw new Error('Invalid '+key);result[key]=state[key];}
  if('favorite'in state){if(typeof state.favorite!=='boolean')throw new Error('Invalid favorite.');result.favorite=state.favorite;}
  if('status'in state){if(!['unread','reading','finished'].includes(state.status))throw new Error('Invalid status.');result.status=state.status;}
  if('metadata'in state){const m=state.metadata;if(!m||typeof m.title!=='string'||m.title.length>300||typeof m.author!=='string'||m.author.length>300||typeof m.key!=='string'||m.key.length>100)throw new Error('Invalid metadata.');result.metadata={title:m.title,author:m.author,key:m.key,year:Number(m.year)||null,provider:['Manual','Project Gutenberg'].includes(m.provider)?m.provider:'Open Library'};}
  for(const key of ['bookmarks','notes'])if(key in state){
    if(!Array.isArray(state[key])||state[key].length>500)throw new Error('Too many '+key);
    result[key]=state[key].map(item=>{
      if(!item||!Number.isInteger(item.page)||item.page<0||item.page>1e6)throw new Error('Invalid note or bookmark location.');
      if(key==='bookmarks'){if(typeof item.label!=='string'||item.label.length>120)throw new Error('Invalid bookmark.');return {page:item.page,label:item.label};}
      if(typeof item.id!=='string'||!/^[a-f0-9-]{36}$/.test(item.id)||typeof item.text!=='string'||!item.text.trim()||item.text.length>10000)throw new Error('Invalid note.');
      if('quote'in item&&(typeof item.quote!=='string'||item.quote.length>2000))throw new Error('Invalid highlight quote.');return {id:item.id,page:item.page,text:item.text,...(item.quote?{quote:item.quote}:{}),...annotationFields(item),created:Number(item.created)||Date.now()};
    });
  }
  if(result.notes&&new Set(result.notes.map(n=>n.id)).size!==result.notes.length)throw new Error('Duplicate note identifiers.');
  if('tags'in state){if(!Array.isArray(state.tags)||state.tags.length>50||state.tags.some(t=>typeof t!=='string'||!t.trim()||t.length>60))throw new Error('Invalid tags.');result.tags=[...new Set(state.tags.map(t=>t.trim()))];}
  return result;
}
export function prepareRestore(library,data){
  if(!data||data.format!=='folio-backup-v1'||!Array.isArray(data.books)||data.books.length>100000)throw new Error('Choose a Folio reading-data backup.');
  const seen=new Set(),mapping=new Map(),updates=[],missing=[];
  for(const row of data.books){
    if(!row||typeof row.id!=='string'||typeof row.source!=='string'||row.source.length>4000||path.isAbsolute(row.source)||row.source.split(/[\\/]/).includes('..')||seen.has(row.source))throw new Error('Invalid or duplicate backup entry.');
    seen.add(row.source);const state=validateState(row.state);
    const book=library.db.prepare('SELECT id FROM books WHERE root=? AND source=?').get(library.root(),row.source);
    if(book){mapping.set(row.id,book.id);updates.push({id:book.id,state});}else missing.push(row.source);
  }
  const preferences=validatePreferences(data.preferences||{});
  const reading=[];for(const item of data.reading||[]){if(typeof item.seconds!=='number'||!Number.isFinite(item.seconds)||item.seconds<0||item.seconds>1e10)throw new Error('Invalid reading time.');if(mapping.has(item.id))reading.push({id:mapping.get(item.id),seconds:item.seconds});}
  const collections=(data.collections||[]).map(c=>{if(!c||typeof c.name!=='string'||!c.name.trim()||c.name.length>80||!Array.isArray(c.books)||c.books.length>100000)throw new Error('Invalid collection.');return {name:c.name.trim(),books:[...new Set(c.books.filter(id=>mapping.has(id)).map(id=>mapping.get(id)))]};});
  return {updates,preferences,reading,collections,matched:updates.length,missing};
}
export function restoreBackup(library,data,{preferences:restorePreferences=false}={}){
  if(library.job.running)throw new Error('Wait for the library scan to finish.');
  const plan=prepareRestore(library,data);
  library.db.exec('BEGIN IMMEDIATE');
  try{
    // Network/privacy remain current choices, never enabled by an imported file.
    if(restorePreferences){const current=library.preferences();library.preferences({...plan.preferences,networkEnabled:current.networkEnabled,incognito:current.incognito,secureScreen:current.secureScreen,desktopCaptureProtection:current.desktopCaptureProtection,remoteRefresh:current.remoteRefresh,remoteMetadata:current.remoteMetadata,remoteCovers:current.remoteCovers,remoteContentChecks:current.remoteContentChecks,sourceSessions:current.sourceSessions,serialRefresh:current.serialRefresh});}
    for(const item of plan.updates)library.db.prepare('UPDATE books SET state=? WHERE id=?').run(JSON.stringify(item.state),item.id);
    for(const item of plan.reading)library.db.prepare('INSERT INTO reading VALUES(?,?) ON CONFLICT(book) DO UPDATE SET seconds=excluded.seconds').run(item.id,item.seconds);
    for(const collection of plan.collections){const existing=library.collections().find(c=>!c.generated&&c.name.toLowerCase()===collection.name.toLowerCase());library.saveCollection({...collection,id:existing?.id});}
    library.db.exec('COMMIT');return {matched:plan.matched,missing:plan.missing};
  }catch(error){library.db.exec('ROLLBACK');throw error;}
}
