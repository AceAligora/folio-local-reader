import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {SourceRegistry,sourceDefinition} from './source-registry.mjs';
export {nativeSources} from './source-registry.mjs';
const clean=value=>String(value||'').slice(0,300);
export function normalizeBooks(data){
  if(!data||!Array.isArray(data.results)||data.results.length>100)throw new Error('Unsupported book catalogue.');
  return {count:Number(data.count)||0,hasNext:typeof data.next==='string',results:data.results.filter(item=>item&&Number.isInteger(item.id)&&item.id>0&&item.copyright===false).map(item=>{
    let download=null;try{const url=new URL(item.formats?.['application/epub+zip']);if(url.protocol==='https:'&&['www.gutenberg.org','gutenberg.org'].includes(url.hostname)&&!url.port&&!url.username&&!url.password&&/^\/cache\/epub\/\d+\/[^/]+\.epub$/.test(url.pathname))download=url.href;}catch{}
    return {id:item.id,title:clean(item.title)||'Untitled',author:(Array.isArray(item.authors)?item.authors:[]).slice(0,5).map(a=>clean(a?.name)).join(', ').slice(0,300),languages:(Array.isArray(item.languages)?item.languages:[]).filter(l=>typeof l==='string'&&l.length<=10).slice(0,10),download,details:'https://www.gutenberg.org/ebooks/'+item.id};
  })};
}
export function normalizeOpenLibrary(data,page,limit){
  if(!data||!Array.isArray(data.docs)||data.docs.length>100)throw new Error('Unsupported Open Library catalogue.');
  const count=Number(data.numFound??data.num_found)||0;
  return {count,hasNext:page*limit<count,results:data.docs.filter(item=>item&&/^\/?(?:works\/)?OL\d+W$/.test(String(item.key))).map(item=>{const key='/works/'+String(item.key).split('/').pop();return {id:key,title:clean(item.title)||'Untitled',author:(Array.isArray(item.author_name)?item.author_name:[]).slice(0,5).map(clean).join(', ').slice(0,300),year:Number(item.first_publish_year)||null,languages:[],download:null,details:'https://openlibrary.org'+key};})};
}
export class NativeSources{
  constructor(network,imports){this.network=network;this.imports=imports;this.registry=new SourceRegistry(network.library);}
  request(query,source='gutenberg',page=1){
    if(!sourceDefinition(source).capabilities.includes('search'))throw new Error('Use Chapter feeds to follow this adapter.');
    if(typeof query!=='string'||query.trim().length<2||query.length>200)throw new Error('Enter a title or author of 2–200 characters.');
    if(!Number.isInteger(page)||page<1||page>1000)throw new Error('Invalid catalogue page.');
    const state=this.registry.state(source),settings=state.settings;if(state.updateAvailable&&page>1)throw new Error('Update to the bundled adapter version for catalogue pagination.');const request={query:query.trim(),source,page,language:settings.language,sort:settings.sort,limit:settings.limit};
    const token=createHash('sha256').update(JSON.stringify({...request,query:request.query.toLowerCase()})).digest('hex');
    return {request,token,key:'native:search:'+source+':'+token};
  }
  lookup(query,source='gutenberg',token){
    const spec=this.request(query,source);
    if(token!==undefined&&(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)))throw new Error('Invalid cached source result.');
    const data=this.network.cached(token?'native:search:'+source+':'+token:spec.key);
    if(data&&data.source===source&&data.query.toLowerCase()===query.trim().toLowerCase())return data;
    if(token)throw new Error('Cached source result not found. Search again.');
    if(source==='gutenberg'&&!spec.request.language&&spec.request.sort==='popular')return this.network.cached('native:gutenberg:'+query.trim().toLowerCase());
    return null;
  }
  async search(query,{offline=false,source='gutenberg',page=1,refresh=false}={}){
    const {request,token,key}=this.request(query,source,page),cached=this.network.cached(key)||(page===1?this.lookup(query,source):null);
    if(offline||!this.network.library.preferences().networkEnabled){if(!cached)throw new Error('No cached results for this search and these source preferences. Enable optional network access to search online.');return cached;}
    this.registry.require(source);
    if(!refresh&&cached&&Date.now()-cached.cachedAt<86400000)return cached;
    if(Date.now()-(this.lastSearch||0)<2000)throw new Error('Wait two seconds before another source search.');this.lastSearch=Date.now();
    let url,data;
    if(source==='gutenberg'){
      url=new URL('https://gutendex.com/books/');url.search=new URLSearchParams({search:request.query,copyright:'false',mime_type:'application/epub+zip',sort:request.sort,page:String(page),...(request.language?{languages:request.language}:{})}).toString();
      data=normalizeBooks(JSON.parse((await this.network.bounded(url.href,2*1024*1024,['gutendex.com'])).toString('utf8')));
    }else{
      url=new URL('https://openlibrary.org/search.json');url.search=new URLSearchParams({q:request.query,fields:'key,title,author_name,first_publish_year',limit:String(request.limit),page:String(page),...(request.language?{lang:request.language}:{}),...(request.sort!=='relevance'?{sort:request.sort}:{})}).toString();
      data=normalizeOpenLibrary(JSON.parse((await this.network.bounded(url.href,1024*1024,['openlibrary.org'])).toString('utf8')),page,request.limit);
    }
    return this.network.store(key,{...request,token,...data});
  }
  applyMetadata(bookId,query,id,{source='openlibrary',token}={}){
    if(!sourceDefinition(source).capabilities.includes('metadata'))throw new Error('This adapter does not provide metadata updates.');
    const item=this.lookup(query,source,token)?.results.find(item=>item.id===id);if(!item)throw new Error('Search for this metadata before applying it.');
    this.network.library.details(bookId,{metadata:{title:item.title,author:item.author,key:item.id,year:item.year,provider:'Open Library'}});this.updates?.link(bookId,source,item.id);return this.network.library.book(bookId);
  }
  async download(query,id,{source='gutenberg',token}={}){
    if(!sourceDefinition(source).capabilities.includes('download'))throw new Error('This adapter provides discovery and metadata, not ebook downloads.');
    if(this.busy)throw new Error('A source book is already downloading.');
    this.network.enabled();this.registry.require(source);const item=this.lookup(query,source,token)?.results.find(b=>b.id===id);
    if(!item?.download)throw new Error('Search for this EPUB before downloading it.');
    const library=this.network.library,key='native:download:'+library.root()+':'+source+':'+id,previous=this.network.cached(key);
    if(previous&&library.book(previous.bookId)?.available)return {bookId:previous.bookId,alreadyDownloaded:true};
    if(Date.now()-(this.lastDownload||0)<2000)throw new Error('Wait two seconds before another download.');
    this.busy=true;let batch;
    try{
      this.lastDownload=Date.now();batch=await this.imports.begin();
      const bytes=await this.network.bounded(item.download,80*1024*1024,['www.gutenberg.org','gutenberg.org']);
      if(bytes[0]!==0x50||bytes[1]!==0x4b)throw new Error('The source did not return an EPUB archive.');
      const name=item.title.replace(/[\\/<>:"|?*\x00-\x1f]/g,' ').trim().slice(0,100).replace(/[. ]+$/,'')||'Book';
      await this.imports.upload(batch.id,`${name} - Gutenberg ${id}.epub`,Readable.from([bytes]));const batchId=batch.id;
      await this.imports.finish(batchId);batch=null;
      const book=library.db.prepare('SELECT id FROM books WHERE root=? AND source LIKE ?').get(library.root(),'%'+batchId+'%');if(!book)throw new Error('Downloaded file was not indexed. Check Library health.');
      library.details(book.id,{metadata:{title:item.title,author:item.author,key:'gutenberg:'+id,provider:'Project Gutenberg'}});
      this.updates?.link(book.id,source,id,{metadata:library.book(book.id).state.metadata,cover:null,edition:item.download});
      return this.network.store(key,{bookId:book.id,source,remoteId:id,downloaded:Date.now()});
    }finally{if(batch)await this.imports.cancel(batch.id).catch(()=>{});this.busy=false;}
  }
}
