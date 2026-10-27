import {applyEpubAnnotations} from './annotations.js';
import { unzipSync, strFromU8 } from './vendor/fflate/esm/browser.js';
import {captureTextPosition,restoreTextPosition} from './epub-position.js';

const LIMIT=80*1024*1024;
export function unpackEpub(bytes){
  if(bytes.length>LIMIT)throw new Error('This EPUB exceeds the 80 MB preview limit.');
  let total=0,count=0;
  return unzipSync(bytes,{filter(entry){
    count++;total+=entry.originalSize;
    if(count>5000||entry.originalSize>20*1024*1024||total>LIMIT||entry.originalSize/Math.max(entry.size,1)>1000)throw new Error('EPUB archive exceeds safe extraction limits.');
    if(entry.name.startsWith('/')||entry.name.includes('\\')||entry.name.split('/').includes('..'))throw new Error('Invalid EPUB resource path.');
    return !entry.name.endsWith('/');
  }});
}
const xml=text=>{const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw new Error('Malformed EPUB metadata.');return doc;};
function resource(base,href){const url=new URL(href,'https://epub.invalid/'+base);if(url.origin!=='https://epub.invalid')return null;return decodeURIComponent(url.pathname.slice(1));}
export class EpubReader{
  close(){this.generation=(this.generation||0)+1;for(const url of this.urls||[])URL.revokeObjectURL(url);this.urls=[];this.files=null;this.chapters=[];this.frame=null;this.pendingFragment='';}
  position(){return this.frame?captureTextPosition(this.frame,this.frame.dataset.chapterPath):null;}
  restorePosition(anchor){return restoreTextPosition(this.frame,anchor);}
  async open(id){
    this.close();
    const generation=this.generation;
    const response=await fetch(`/content/${id}/0`);if(!response.ok)throw new Error('EPUB could not be loaded.');
    if(Number(response.headers.get('Content-Length'))>LIMIT)throw new Error('This EPUB exceeds the 80 MB preview limit.');
    const bytes=new Uint8Array(await response.arrayBuffer());if(generation!==this.generation)throw new Error('Opening cancelled.');
    this.files=unpackEpub(bytes);
    const text=name=>{if(!this.files[name])throw new Error('Missing EPUB metadata.');return strFromU8(this.files[name]);};
    const container=xml(text('META-INF/container.xml'));
    const opf=container.getElementsByTagNameNS('*','rootfile')[0]?.getAttribute('full-path');
    if(!opf)throw new Error('EPUB has no package document.');
    const metadata=xml(text(opf));const manifest=new Map();
    for(const item of metadata.getElementsByTagNameNS('*','item'))manifest.set(item.getAttribute('id'),{path:resource(opf,item.getAttribute('href')),type:item.getAttribute('media-type')});
    const declared=[...metadata.getElementsByTagNameNS('*','item')].find(item=>(item.getAttribute('properties')||'').split(/\s+/).includes('cover-image'));
    const coverId=[...metadata.getElementsByTagNameNS('*','meta')].find(item=>item.getAttribute('name')==='cover')?.getAttribute('content');
    this.coverPath=declared?resource(opf,declared.getAttribute('href')):manifest.get(coverId)?.path;
    this.chapters=[];
    for(const item of metadata.getElementsByTagNameNS('*','itemref')){const chapter=manifest.get(item.getAttribute('idref'));if(chapter?.path&&this.files[chapter.path]&&['application/xhtml+xml','text/html'].includes(chapter.type))this.chapters.push(chapter);}
    if(!this.chapters.length)throw new Error('No readable EPUB chapters found.');
    for(const [index,chapter]of this.chapters.entries()){
      const content=new DOMParser().parseFromString(strFromU8(this.files[chapter.path]),'text/html');
      chapter.title=(content.querySelector('h1,h2,h3')?.textContent||content.querySelector('title')?.textContent||'Chapter '+(index+1)).trim().replace(/\s+/g,' ').slice(0,300);
    }
    return this.chapters.length;
  }
  updateAnnotations(notes){const doc=this.frame?.contentDocument;if(!doc?.body)return;const anchor=this.position();applyEpubAnnotations(doc,notes);if(anchor)this.restorePosition(anchor);}
  coverBlob(){const file=this.files?.[this.coverPath];const ext=this.coverPath?.split('.').pop().toLowerCase();const mime={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp'}[ext];return file&&mime?new Blob([file],{type:mime}):null;}
  render(container,index,zoom,preferences={},quotes=[]){
    for(const url of this.urls||[])URL.revokeObjectURL(url);this.urls=[];
    const chapter=this.chapters[index];if(!chapter)throw new Error('Chapter unavailable.');
    const source=new DOMParser().parseFromString(strFromU8(this.files[chapter.path]),'text/html');
    const output=document.implementation.createHTMLDocument('EPUB chapter');
    const allowed=new Set('p div span h1 h2 h3 h4 h5 h6 section article main header footer blockquote pre code ul ol li dl dt dd table thead tbody tr td th caption strong em b i u s sup sub br hr img a figure figcaption'.split(' '));
    const copy=(node,parent)=>{
      if(node.nodeType===3){parent.append(output.createTextNode(node.textContent));return;}
      if(node.nodeType!==1)return;
      const tag=node.localName.toLowerCase();
      if(['script','style','iframe','object','embed','svg','math','form','input','button','link','meta','base'].includes(tag))return;
      const target=allowed.has(tag)?output.createElement(tag):output.createElement('span');
      if(node.id)target.id=node.id.slice(0,500);
      if(tag==='a'){const href=node.getAttribute('href');if(href){const entry=resource(chapter.path,href),destination=this.chapters.findIndex(c=>c.path===entry);if(destination>=0){target.href='#folio-chapter-'+destination;target.dataset.chapter=destination;try{target.dataset.fragment=decodeURIComponent(href.split('#')[1]||'');}catch{}}}}
      if(tag==='img'){
        const imagePath=resource(chapter.path,node.getAttribute('src')||'');const data=this.files[imagePath];
        const type=imagePath?.match(/\.(png|jpe?g|gif|webp)$/i)?.[1]?.toLowerCase();
        if(!data||!type)return;
        let binary='';for(let offset=0;offset<data.length;offset+=32768)binary+=String.fromCharCode(...data.subarray(offset,offset+32768));
        const mime=type==='jpg'||type==='jpeg'?'image/jpeg':'image/'+type;
        target.src=`data:${mime};base64,${btoa(binary)}`;target.alt=node.getAttribute('alt')||'';
      }
      for(const child of node.childNodes)copy(child,target);parent.append(target);
    };
    for(const child of source.body.childNodes)copy(child,output.body);
    applyEpubAnnotations(output,quotes);
    const policy=output.createElement('meta');policy.httpEquiv='Content-Security-Policy';policy.content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; script-src 'none'";output.head.append(policy);
    const style=output.createElement('style');const base=preferences.epubSize||19,size=zoom==='fit'?base:Math.round(Number(zoom)*base),font={serif:'Georgia,serif',sans:'Arial,sans-serif',mono:'monospace'}[preferences.epubFont]||'Georgia,serif';style.textContent=`body{font-family:${font};font-size:${size}px;line-height:${(preferences.epubLineHeight||18)/10};max-width:${preferences.epubWidth||780}px;margin:36px auto;padding:0 28px 60px;background:${preferences.background==='black'?'#171a20':preferences.background==='white'?'#fff':'#fbfaf5'};color:${preferences.background==='black'?'#edf0f7':'#29382d'};overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}h1,h2,h3{line-height:1.3}`;output.head.append(style);
    const frame=document.createElement('iframe');this.frame=frame;frame.dataset.chapterPath=chapter.path;frame.dataset.navigationFragment=this.pendingFragment||'';this.pendingFragment='';frame.title=`EPUB chapter ${index+1}`;frame.setAttribute('sandbox','allow-same-origin');frame.srcdoc='<!doctype html>'+output.documentElement.outerHTML;container.replaceChildren(frame);frame.addEventListener('load',()=>{if(frame.dataset.navigationFragment)frame.contentDocument.getElementById(frame.dataset.navigationFragment)?.scrollIntoView();frame.contentDocument.addEventListener('click',event=>{const link=event.target.closest('a[data-chapter]');if(!link)return;event.preventDefault();const next=Number(link.dataset.chapter),fragment=link.dataset.fragment;if(next===index){frame.contentDocument.getElementById(fragment)?.scrollIntoView();}else{this.pendingFragment=fragment;this.onNavigate?.(next);}});},{once:true});
  }
}
