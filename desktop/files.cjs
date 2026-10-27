const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const {randomUUID,createHash}=require('node:crypto');
const {localOrigin}=require('./policy.cjs');
const {setTimeout:pause}=require('node:timers/promises');
function allowedFile(value){return typeof value==='string'&&value.length<=32767&&!/[\x00-\x1f]/.test(value)&&!value.startsWith('\\\\')&&!value.startsWith('//')&&path.isAbsolute(value)&&/\.(pdf|epub|cbz)$/i.test(value);}
function launchFiles(argv){return [...new Set(argv.filter(allowedFile))].slice(0,10);}
function localClient(origin,getCookies){
  if(!localOrigin(origin))throw new Error('Invalid local reader address.');
  return async(route,data,stream)=>{
    if(!route.startsWith('/api/')||new URL(route,origin).origin!==origin)throw new Error('Invalid local reader operation.');
    const cookies=await getCookies(),headers={Origin:origin,Cookie:cookies.filter(c=>['reader','folioUnlock'].includes(c.name)).map(c=>c.name+'='+c.value).join('; ')};
    if(data!==undefined)headers['Content-Type']='application/json';if(stream)headers['Content-Type']='application/octet-stream';
    return new Promise((resolve,reject)=>{
      const request=http.request(new URL(route,origin),{method:data!==undefined||stream?'POST':'GET',headers},response=>{let size=0,chunks=[];response.on('data',chunk=>{size+=chunk.length;if(size>16*1024*1024)response.destroy(new Error('Local reader response is too large.'));else chunks.push(chunk);});response.on('error',reject);response.on('end',()=>{try{const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(response.statusCode<200||response.statusCode>=300)throw new Error(response.statusCode===423?'Unlock Folio, then retry opening the ebook.':body.error||'The local reader could not finish this operation.');resolve(body);}catch(error){reject(error);}});});
      request.on('error',error=>{stream?.destroy();reject(error);});request.setTimeout(120000,()=>request.destroy(new Error('The local reader operation timed out.')));
      if(stream){stream.on('error',error=>request.destroy(error));stream.pipe(request);}else request.end(data===undefined?undefined:JSON.stringify(data));
    });
  };
}
class FileQueue{
  constructor(){this.pending=new Map();this.busy=false;}
  list(){return [...this.pending.values()].map(({id,name,size})=>({id,name,size}));}
  async add(address){
    if(!allowedFile(address))throw new Error('Choose a local PDF, EPUB or CBZ file.');
    const real=await fs.realpath(address);if(!allowedFile(real))throw new Error('Network and device paths cannot be opened by file association.');const info=await fs.stat(real);
    if(!info.isFile()||!info.size||info.size>1024*1024*1024)throw new Error('Choose a nonempty ebook smaller than 1 GB.');
    const key=process.platform==='win32'?real.toLowerCase():real,previous=[...this.pending.values()].find(file=>file.key===key);if(previous)return previous.id;
    if(this.pending.size>=10)throw new Error('Open up to 10 ebooks at a time.');
    const id=randomUUID();this.pending.set(id,{id,key,address:real,name:path.basename(real),size:info.size,modified:info.mtimeMs});return id;
  }
  dismiss(id){if(this.busy)throw new Error('Wait for the current ebook to finish opening.');this.pending.delete(id);}
  async open(id,client){
    if(this.busy)throw new Error('Another ebook is opening.');const file=this.pending.get(id);if(!file)throw new Error('Choose the ebook again from Open with or Folio’s Open ebook menu.');this.busy=true;let handle,batch;
    try{
      handle=await fs.open(file.address,'r');const unchanged=async()=>{const info=await handle.stat();if(info.size!==file.size||info.mtimeMs!==file.modified)throw new Error('The selected ebook changed. Choose it again before opening.');};await unchanged();
      const status=await client('/api/status');if(!status.root)throw new Error('Choose your library folder in Folio, then retry Open.');
      const relative=path.relative(status.root,file.address),inside=relative!==''&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);
      let book,imported=false;
      if(inside){
        book=await client('/api/local-book?source='+encodeURIComponent(relative));
        if(!book){await client('/api/scan',{});for(let i=0;i<600;i++){const scan=await client('/api/status');if(scan.root!==status.root)throw new Error('The library folder changed. Retry opening this ebook.');if(!scan.job.running)break;await pause(100);}book=await client('/api/local-book?source='+encodeURIComponent(relative));}
        if(!book?.available)throw new Error('This file is not indexed. Check Library health or folder exclusions, then retry.');
      }else{
        const binding=createHash('sha256').update(JSON.stringify({path:file.key,size:file.size,modified:file.modified})).digest('hex'),previous=await client('/api/desktop-file-binding?key='+binding);if(previous?.bookId){try{book=await client('/api/book/'+previous.bookId);}catch{}}
        if(!book?.available){batch=await client('/api/import/begin',{});await client('/api/import/file?id='+encodeURIComponent(batch.id)+'&name='+encodeURIComponent(file.name),undefined,handle.createReadStream({autoClose:false}));await unchanged();const batchId=batch.id;await client('/api/import/finish',{id:batchId});batch=null;const result=await client('/api/books?q='+encodeURIComponent(file.name));book=result.books.find(book=>book.source.includes(batchId));if(!book)throw new Error('The imported ebook was not indexed. Check Library health.');imported=true;await client('/api/desktop-file-binding',{key:binding,bookId:book.id});}
      }
      this.pending.delete(id);return {bookId:book.id,imported,name:file.name};
    }finally{if(batch)await client('/api/import/cancel',{id:batch.id}).catch(()=>{});await handle?.close();this.busy=false;}
  }
}
module.exports={allowedFile,launchFiles,localClient,FileQueue};
