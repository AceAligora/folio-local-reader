import {mkdir,writeFile,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {publicFetch} from './source-policy.mjs';

export function repositoryJson(address){
  const url=new URL(address);
  if(url.protocol!=='https:'||url.username||url.password||url.port||!url.pathname.endsWith('.pb')||url.search)throw new Error('Use a GitHub HTTPS repository index.pb address.');
  const parts=url.pathname.split('/').filter(Boolean);
  if(url.hostname==='github.com'){
    if(parts[2]!=='raw'||parts.length<5)throw new Error('Use the repository raw index.pb link.');
    parts.splice(2,1);if(parts[2]==='refs'&&parts[3]==='heads')parts.splice(2,2);
  }else if(url.hostname!=='raw.githubusercontent.com')throw new Error('This preview supports GitHub-hosted repository indexes.');
  if(parts.length<4||parts.some(p=>!p||p==='..'||!/^[-\w.]+$/.test(p)))throw new Error('Invalid repository path.');
  return 'https://raw.githubusercontent.com/'+parts.join('/').replace(/\.pb$/,'.json');
}
export function normalizeCatalogue(data){
  const list=Array.isArray(data)?data:data?.extensionList?.extensions;
  if(!Array.isArray(list)||list.length>10000)throw new Error('Unsupported repository JSON format.');
  const text=value=>String(value||'').slice(0,250);
  return {name:text(data.name||'Extension repository'),extensions:list.map(item=>({
    id:text(item.packageName||item.pkg),name:text(item.name),version:text(item.versionName||item.version),versionCode:text(item.versionCode||item.code),
    nsfw:item.contentWarning==='CONTENT_WARNING_NSFW'||item.nsfw===true||Number(item.nsfw)===1,
    language:text(item.lang||item.sources?.[0]?.language||'all'),
    sources:(item.sources||[]).slice(0,100).map(s=>({name:text(s.name),language:text(s.language||s.lang)})),
    packageUrl:item.resources?.apkUrl||null,
  })).filter(item=>/^[\w.-]{1,180}$/.test(item.id)&&item.name)};
}
export class NetworkServices{
  constructor(library,profile,{fetchImpl=fetch,publicFetchImpl=publicFetch}={}){
    this.library=library;this.fetch=fetchImpl;this.publicFetch=publicFetchImpl;this.directory=path.join(profile,'extension-packages');this.lastRequest=0;
    library.db.exec(`CREATE TABLE IF NOT EXISTS network_cache(key TEXT PRIMARY KEY,data TEXT NOT NULL,updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS extension_packages(id TEXT PRIMARY KEY,repository TEXT NOT NULL,package TEXT NOT NULL,name TEXT NOT NULL,version TEXT NOT NULL,filename TEXT NOT NULL,sha256 TEXT NOT NULL,size INTEGER NOT NULL,downloaded INTEGER NOT NULL);`);
  }
  enabled(){if(!this.library.preferences().networkEnabled)throw new Error('Enable optional network access in Sources & extensions first. Offline reading remains available.');}
  cached(key){const row=this.library.db.prepare('SELECT * FROM network_cache WHERE key=?').get(key);return row?{...JSON.parse(row.data),cachedAt:row.updated}:null;}
  store(key,data){this.library.db.prepare('INSERT OR REPLACE INTO network_cache VALUES(?,?,?)').run(key,JSON.stringify(data),Date.now());return this.cached(key);}
  async bounded(url,limit,allowedHosts,{signal:externalSignal,publicOnly=false}={}){
    this.enabled();
    let address=new URL(url);const timeout=AbortSignal.timeout(this.library.preferences().receiveTimeout*1000),signal=externalSignal?AbortSignal.any([timeout,externalSignal]):timeout;
    for(let hop=0;hop<5;hop++){
      this.enabled();signal.throwIfAborted();
      if(address.protocol!=='https:'||address.username||address.password||address.port||!allowedHosts.some(host=>host===address.hostname||host instanceof RegExp&&host.test(address.hostname)))throw new Error('Remote address is not an approved service.');
      const epoch=this.sessions?.epoch,response=await (publicOnly?this.publicFetch:this.fetch)(address,{redirect:'manual',signal,headers:{'User-Agent':this.sessions?.userAgent(address)||this.library.preferences().userAgent||'FolioLocalReader/0.9','Accept':'application/atom+xml, application/rss+xml, application/json, text/html;q=0.9, application/octet-stream;q=0.8',...this.sessions?.headers(address)}});
      this.enabled();this.sessions?.received(address,response.headers,epoch);
      if([301,302,303,307,308].includes(response.status)){await response.body?.cancel();const location=response.headers.get('location');if(!location)throw new Error('Invalid remote redirect.');address=new URL(location,address);continue;}
      if([401,403].includes(response.status)||response.headers.get('cf-mitigated')==='challenge'){this.sessions?.challenge(address);await response.body?.cancel();throw new Error('This source requires sign-in or a browser challenge. Open its temporary source session in Folio Desktop, then retry. No automatic bypass is attempted.');}
      if(!response.ok){await response.body?.cancel();throw new Error('Remote service returned HTTP '+response.status+'. Cached data was preserved.');}
      if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw new Error('Remote response exceeds size limit.');}
      const chunks=[];let size=0;
      for await(const chunk of response.body||[]){size+=chunk.length;if(size>limit)throw new Error('Remote response exceeds size limit.');chunks.push(chunk);}
      this.enabled();const bytes=Buffer.concat(chunks);if(/text\/html/i.test(response.headers.get('content-type')||'')&&/cf-chl-|challenge-platform|<title>\s*(?:just a moment|attention required|access denied)/i.test(bytes.toString('utf8',0,8192))){this.sessions?.challenge(address);throw new Error('The source returned a browser challenge. Open its temporary source session, then retry.');}return bytes;
    }
    throw new Error('Too many remote redirects.');
  }
  catalogue(repository){if(!this.library.preferences().repositories.includes(repository))throw new Error('Add this repository first.');return this.cached('repo:'+repository);}
  async refresh(repository){
    this.enabled();this.catalogue(repository);
    const data=JSON.parse((await this.bounded(repositoryJson(repository),8*1024*1024,['raw.githubusercontent.com'])).toString('utf8'));
    return this.store('repo:'+repository,normalizeCatalogue(data));
  }
  packages(){return this.library.db.prepare('SELECT id,repository,package,name,version,sha256,size,downloaded FROM extension_packages ORDER BY downloaded DESC').all();}
  async download(repository,id){
    if(this.downloading)throw new Error('An extension package is already downloading.');
    this.downloading=true;
    try{
    this.enabled();const item=this.catalogue(repository)?.extensions.find(e=>e.id===id);
    if(!item?.packageUrl)throw new Error('This catalogue entry has no supported APK download.');
    const url=new URL(item.packageUrl);
    if(url.hostname!=='github.com'||!/^\/[\w.-]+\/[\w.-]+\/releases\/download\/.+\.apk$/.test(url.pathname))throw new Error('Only GitHub release APK assets are supported.');
    const bytes=await this.bounded(url.href,80*1024*1024,['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com']);
    if(bytes[0]!==0x50||bytes[1]!==0x4b)throw new Error('Downloaded asset is not an APK/ZIP package.');
    await mkdir(this.directory,{recursive:true});const packageId=randomUUID(),filename=packageId+'.apk';const sha=createHash('sha256').update(bytes).digest('hex');
    await writeFile(path.join(this.directory,filename+'.part'),bytes);await rename(path.join(this.directory,filename+'.part'),path.join(this.directory,filename));
    try{this.library.db.prepare('INSERT INTO extension_packages VALUES(?,?,?,?,?,?,?,?,?)').run(packageId,repository,id,item.name,item.version,filename,sha,bytes.length,Date.now());}catch(error){await unlink(path.join(this.directory,filename)).catch(()=>{});throw error;}
    return this.packages().find(p=>p.id===packageId);
    }finally{this.downloading=false;}
  }
  async packageFile(id){const row=this.library.db.prepare('SELECT filename FROM extension_packages WHERE id=?').get(id);if(!row||!/^[-a-f0-9]+\.apk$/.test(row.filename))throw new Error('Package not found.');return {file:path.join(this.directory,row.filename),name:row.filename};}
  async remove(id){const {file}=await this.packageFile(id);if(path.dirname(path.resolve(file))!==path.resolve(this.directory))throw new Error('Invalid package path.');await unlink(file).catch(error=>{if(error.code!=='ENOENT')throw error;});this.library.db.prepare('DELETE FROM extension_packages WHERE id=?').run(id);return {ok:true};}
  async metadata(query){
    this.enabled();if(typeof query!=='string'||query.trim().length<2||query.length>200)throw new Error('Enter a search title of 2–200 characters.');
    const key='metadata:'+query.trim().toLowerCase();const cache=this.cached(key);if(cache&&Date.now()-cache.cachedAt<86400000)return cache;
    if(Date.now()-(this.lastMetadata||0)<1000)throw new Error('Please wait a second before another metadata search.');this.lastMetadata=Date.now();
    const url=new URL('https://openlibrary.org/search.json');url.search=new URLSearchParams({title:query.trim(),limit:'8',fields:'key,title,author_name,first_publish_year'}).toString();
    const data=JSON.parse((await this.bounded(url.href,512*1024,['openlibrary.org'])).toString('utf8'));
    if(!Array.isArray(data.docs))throw new Error('Unsupported metadata response.');
    return this.store(key,{query,results:data.docs.slice(0,8).map(item=>({key:String(item.key||''),title:String(item.title||'').slice(0,300),author:(item.author_name||[]).slice(0,5).join(', ').slice(0,300),year:Number(item.first_publish_year)||null})).filter(item=>/^\/works\/OL\d+W$/.test(item.key))});
  }
  applyMetadata(bookId,query,key){const entry=this.cached('metadata:'+String(query).trim().toLowerCase())?.results.find(item=>item.key===key);if(!entry)throw new Error('Search for this metadata before applying it.');this.library.details(bookId,{metadata:{...entry,provider:'Open Library'}});return this.library.book(bookId);}
}
