import {annotationMatches,annotationColors} from './annotations.js';
import {cropCanvasPage} from './crop.js';
// PDF.js assets are bundled locally; book content never leaves the machine.
import { getDocument, GlobalWorkerOptions, TextLayer } from './vendor/pdfjs/build/pdf.mjs';
import {flattenOutline,searchText} from './reader-navigation.js';
GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/build/pdf.worker.mjs';

export class PdfReader {
  constructor() { this.generation=0; this.task=null; this.document=null; this.renderTask=null; }
  async open(id, passwordPrompt) {
    await this.close();
    const generation=this.generation;
    const task=this.task=getDocument({url:`/content/${id}/0`,cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/',iccUrl:'/vendor/pdfjs/iccs/',isEvalSupported:false,enableXfa:false});
    task.onPassword=(update,reason)=>passwordPrompt(update,reason);
    const document=await task.promise;
    if(generation!==this.generation) return null;
    this.document=document;
    return document.numPages;
  }
  async addTextLayer(page,wrapper,viewport,active){
    const content=await page.getTextContent();if(!active())return;const layer=documentGlobal.createElement('div');layer.className='textLayer';layer.style.setProperty('--total-scale-factor',String(viewport.scale));layer.style.setProperty('--scale-round-x','1px');layer.style.setProperty('--scale-round-y','1px');wrapper.append(layer);const task=new TextLayer({textContentSource:content,container:layer,viewport});await task.render();
    if(active())this.highlightLayer(layer);
  }
  highlightLayer(layer){
    const spans=[...layer.querySelectorAll('span')].filter(s=>!s.children.length),normalize=s=>s.normalize('NFKC').toLowerCase().replace(/\s+/g,' ');let text='',ranges=[];for(const span of spans){const value=normalize(span.textContent);ranges.push({span,start:text.length,end:text.length+value.length});text+=value+' ';}
    for(const row of ranges){row.span.classList.remove('search-hit','note-highlight');row.span.style.removeProperty('--note-highlight-color');}
    const page=Number(layer.closest('.pdf-page')?.dataset.page);
    for(const match of annotationMatches(text,this.highlights,page,this.query))for(const row of ranges)if(row.end>match.start&&row.start<match.end){
      if(match.kind==='search')row.span.classList.add('search-hit');
      else if(!row.span.classList.contains('note-highlight')){row.span.classList.add('note-highlight');row.span.style.setProperty('--note-highlight-color',annotationColors[match.color]+'bb');}
    }
  }
  highlight(query,quotes=[]){this.query=query;this.highlights=quotes;for(const layer of documentGlobal.querySelectorAll('#reader-body .textLayer'))this.highlightLayer(layer);}
  async renderContinuous(slot,index,{width,height,rotation,webtoon=false,active}){
    const document=this.document;if(!document)return;
    const page=await document.getPage(index+1);if(!active())return;
    const base=page.getViewport({scale:1,rotation:(page.rotate+rotation)%360}),scale=webtoon?width/base.width:Math.min(width/base.width,height/base.height);
    const viewport=page.getViewport({scale,rotation:(page.rotate+rotation)%360}),ratio=Math.min(window.devicePixelRatio||1,2,Math.sqrt(8000000/(viewport.width*viewport.height)));
    const canvas=documentGlobal.createElement('canvas');canvas.setAttribute('role','img');canvas.setAttribute('aria-label','PDF page '+(index+1));canvas.width=Math.max(1,Math.floor(viewport.width*ratio));canvas.height=Math.max(1,Math.floor(viewport.height*ratio));canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';const wrapper=documentGlobal.createElement('div');wrapper.className='pdf-page';wrapper.dataset.page=index;wrapper.style.width=viewport.width+'px';wrapper.style.height=viewport.height+'px';wrapper.append(canvas);slot.replaceChildren(wrapper);this.addTextLayer(page,wrapper,viewport,active).catch(()=>{});
    const task=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[ratio,0,0,ratio,0,0]});this.flowTasks??=new Set();this.flowTasks.add(task);try{await task.promise;if(this.crop&&active())cropCanvasPage(wrapper,canvas);}finally{this.flowTasks.delete(task);}
  }
  async navigation(){
    const document=this.document;if(!document)return {items:[],labels:null};
    const [outline,labels]=await Promise.all([document.getOutline().catch(()=>null),document.getPageLabels().catch(()=>null)]);
    return {items:flattenOutline(outline),labels};
  }
  async destination(dest){
    const document=this.document;if(!document)return null;
    const value=typeof dest==='string'?await document.getDestination(dest):dest;
    if(!Array.isArray(value)||!value.length)return null;
    const page=Number.isInteger(value[0])?value[0]:await document.getPageIndex(value[0]);
    return Number.isInteger(page)&&page>=0&&page<document.numPages?page:null;
  }
  async search(query,{signal,progress,result}){
    const document=this.document;if(!document)return;
    let matches=0;const limit=Math.min(document.numPages,10000);
    for(let index=0;index<limit;index++){
      if(signal.aborted||this.document!==document)return;
      const page=await document.getPage(index+1),content=await page.getTextContent();
      if(signal.aborted||this.document!==document)return;
      const snippet=searchText(content.items.map(item=>item.str||'').join(' '),query);
      if(snippet){result({page:index,snippet});matches++;}
      progress({checked:index+1,total:document.numPages,matches,limited:matches>=200||index===9999});
      if(matches>=200)break;
      // Yield to input between pages, including when PDF.js has cached text.
      await new Promise(resolve=>setTimeout(resolve,0));
    }
  }
  async render(container,index,rotation,zoom,indices=[index]) {
    const document=this.document;if(!document)return false;
    const generation=++this.generation;
    this.renderTask?.cancel();
    for(const task of this.renderTasks||[])task.cancel();this.renderTasks=[];
    const pages=await Promise.all(indices.map(i=>document.getPage(i+1)));
    if(generation!==this.generation)return false;
    const bases=pages.map(page=>page.getViewport({scale:1,rotation:(page.rotate+rotation)%360}));
    const scale=zoom==='fit'?Math.max(.05,Math.min((container.clientWidth-60)/(bases.reduce((sum,b)=>sum+b.width,0)),(container.clientHeight-40)/Math.max(...bases.map(b=>b.height)))):Number(zoom);
    const spread=documentGlobal.createElement('div');spread.className='page-spread';container.replaceChildren(spread);
    for(const [position,page]of pages.entries()){
    const viewport=page.getViewport({scale,rotation:(page.rotate+rotation)%360});
    // Limit the backing canvas for very large or unusual pages.
    const ratio=Math.min(window.devicePixelRatio||1,2,Math.sqrt(16000000/(viewport.width*viewport.height)));
    const canvas=documentGlobal.createElement('canvas');
    canvas.setAttribute('aria-label',`PDF page ${indices[position]+1}`);canvas.setAttribute('role','img');
    canvas.width=Math.max(1,Math.floor(viewport.width*ratio));canvas.height=Math.max(1,Math.floor(viewport.height*ratio));
    canvas.style.width=`${viewport.width}px`;canvas.style.height=`${viewport.height}px`;
    const wrapper=documentGlobal.createElement('div');wrapper.className='pdf-page';wrapper.dataset.page=indices[position];wrapper.style.width=viewport.width+'px';wrapper.style.height=viewport.height+'px';wrapper.append(canvas);spread.append(wrapper);
    this.addTextLayer(page,wrapper,viewport,()=>generation===this.generation).catch(()=>{});
    const renderTask=this.renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[ratio,0,0,ratio,0,0]});
    this.renderTasks.push(renderTask);
    }
    try {await Promise.all(this.renderTasks.map(task=>task.promise));}catch(error){if(error.name==='RenderingCancelledException')return false;throw error;}
    if(this.crop&&generation===this.generation)for(const wrapper of spread.querySelectorAll('.pdf-page'))cropCanvasPage(wrapper,wrapper.querySelector('canvas'));
    return generation===this.generation;
  }
  async close() {this.generation++;for(const task of this.flowTasks||[])task.cancel();this.flowTasks?.clear();this.renderTask?.cancel();for(const task of this.renderTasks||[])task.cancel();this.renderTasks=[];this.renderTask=null;this.document=null;const task=this.task;this.task=null;if(task)await task.destroy();}
}
const documentGlobal=globalThis.document;
