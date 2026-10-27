import {ArchiveReader} from './archive-reader.js';
import { getDocument } from './vendor/pdfjs/build/pdf.mjs';
import { EpubReader } from './epub-reader.js';

// One thumbnail at a time, only near the viewport. Cached outside ebook files.
let database,automaticRefresh=true;document.addEventListener('folio-cover-policy',event=>automaticRefresh=event.detail);
const dbReady=new Promise(resolve=>{
  const request=indexedDB.open('folio-covers',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('covers',{keyPath:'key'});
  request.onsuccess=()=>{database=request.result;resolve();};
  request.onerror=()=>resolve();
});
async function cached(key){await dbReady;if(!database)return;return new Promise(resolve=>{const request=database.transaction('covers').objectStore('covers').get(key);request.onsuccess=()=>resolve(request.result?.blob);request.onerror=()=>resolve();});}
async function cache(key,blob){await dbReady;if(!database)return;try{const tx=database.transaction('covers','readwrite');const store=tx.objectStore('covers');store.put({key,blob});const count=store.count();count.onsuccess=()=>{if(count.result>150){const cursor=store.openCursor();cursor.onsuccess=()=>cursor.result?.delete();}};}catch{/* A full/disabled cache must not prevent reading. */}}
let running=false;const queue=[];let observer;
const urls=new Map(),watched=new Set();
export function resetCovers(root){
  for(const cover of watched)if(!root||!cover.isConnected||root.contains(cover)){observer?.unobserve(cover);watched.delete(cover);}
  for(let index=queue.length-1;index>=0;index--)if(!root||!queue[index].isConnected||root.contains(queue[index]))queue.splice(index,1);
  for(const [url,cover]of urls)if(!root||!cover.isConnected||root.contains(cover)){URL.revokeObjectURL(url);urls.delete(url);}
}
export async function clearCoverCache(){await dbReady;database?.close();database=undefined;return new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase('folio-covers');request.onsuccess=resolve;request.onerror=()=>reject(new Error('Could not clear thumbnail cache.'));request.onblocked=()=>reject(new Error('Close other Folio windows before clearing cache.'));});}
export function observeCover(cover,book){
  if(!observer)observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);watched.delete(entry.target);queue.push(entry.target);void pump();}},{rootMargin:'200px'});
  cover.coverBook=book;watched.add(cover);observer.observe(cover);
}
async function pump(){if(running)return;running=true;try{while(queue.length){const cover=queue.shift();if(!cover.isConnected)continue;await render(cover,cover.coverBook);}}finally{running=false;}}
async function render(cover,book){
  let task,epub,archive;
  try{
    const info=await fetch(`/api/cover-info/${book.id}`);if(!info.ok)throw new Error('Source unavailable');
    const {version,custom}=await info.json();const key=`${book.id}:${custom||automaticRefresh?version:"retained"}`;let blob=await cached(key);
    if(!blob&&(custom||book.format==='images')){const response=await fetch(custom?'/api/custom-cover/'+book.id:'/content/'+book.id+'/0');if(!response.ok)throw new Error('Cover unavailable.');blob=await response.blob();if(custom||!automaticRefresh)await cache(key,blob);}
    if(!blob&&book.format==='epub'){epub=new EpubReader();await epub.open(book.id);blob=epub.coverBlob();if(blob)await cache(key,blob);}
    else if(!blob&&book.format==='cbz'){archive=new ArchiveReader();await archive.open(book.id);blob=archive.blob(0);await cache(key,blob);}
    else if(!blob){
      task=getDocument({url:`/content/${book.id}/0`,cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/',iccUrl:'/vendor/pdfjs/iccs/',isEvalSupported:false,enableXfa:false});
      task.onPassword=()=>{void task.destroy();};
      const pdf=await task.promise;const page=await pdf.getPage(1);const base=page.getViewport({scale:1});
      const viewport=page.getViewport({scale:Math.min(360/base.width,480/base.height)});
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
      blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.85));if(blob)await cache(key,blob);
    }
    if(blob&&cover.isConnected){const img=document.createElement('img');img.alt=`Cover of ${book.title}`;const url=URL.createObjectURL(blob);urls.set(url,cover);img.src=url;cover.append(img);}
  }catch{if(cover.isConnected)cover.title='Cover unavailable (the PDF may be password protected or unreadable). Open the book to read it.';}
  finally{archive?.close();epub?.close();if(task)await task.destroy().catch(()=>{});}
}
