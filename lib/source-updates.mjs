import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {setTimeout as delay} from 'node:timers/promises';
import {excludedSource} from './scan-policy.mjs';
const json=value=>JSON.stringify(value??null),fingerprint=value=>createHash('sha256').update(json(value)).digest('hex');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
function revisionFingerprint(remote){const revision={...remote};if(remote.content)revision.content=Object.fromEntries(Object.entries(remote.content).map(([kind,{url,sha256,size}])=>[kind,{url,sha256,size}]));return fingerprint(revision);}
// Cover redirects are restricted to the Covers API and its Internet Archive storage.
const coverHosts=source=>source==='gutenberg'?['www.gutenberg.org','gutenberg.org']:['covers.openlibrary.org','archive.org',/^ia\d{6}\.(?:us\.)?archive\.org$/];
function validAsset(bytes,kind){if(kind==='edition')return bytes.subarray(0,4).equals(Buffer.from([80,75,3,4]));return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes[0]===255&&bytes[1]===216&&bytes[2]===255||bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';}
function changedBytes(kind,remote,previous,pending){const current=remote.content?.[kind];if(!current)return false;const old=previous?.content?.[kind];return !!(old?.url===current.url&&old.sha256!==current.sha256||pending?.changes.includes(kind==='edition'?'content':'cover')&&pending.remote.content?.[kind]?.url===current.url&&pending.remote.content[kind].sha256===current.sha256);}
function remoteId(source,id){id=String(id);if(source==='gutenberg'&&/^[1-9]\d{0,9}$/.test(id)||source==='openlibrary'&&/^\/works\/OL\d{1,15}W$/.test(id))return id;throw new Error('Invalid linked source identifier.');}
function approvedCover(source,address){try{const url=new URL(address);if(url.protocol!=='https:'||url.port||url.username||url.password||url.search||url.hash)return null;if(source==='gutenberg'&&['www.gutenberg.org','gutenberg.org'].includes(url.hostname)&&/^\/cache\/epub\/\d+\/[^/]+\.(jpg|jpeg|png)$/.test(url.pathname))return url.href;}catch{}return null;}
export class SourceUpdates{
  constructor(sources,covers,{pace=2000}={}){
    this.sources=sources;this.network=sources.network;this.library=this.network.library;this.covers=covers;this.pace=pace;
    this.library.db.exec("CREATE TABLE IF NOT EXISTS source_updates(book TEXT NOT NULL,source TEXT NOT NULL,remote_id TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,checked INTEGER NOT NULL DEFAULT 0,snapshot TEXT NOT NULL DEFAULT 'null',proposal TEXT NOT NULL DEFAULT 'null',ignored TEXT NOT NULL DEFAULT '',error TEXT NOT NULL DEFAULT '',managed_cover TEXT NOT NULL DEFAULT '',PRIMARY KEY(book,source))");
    this.job={running:false,checked:0,total:0,errors:0,status:'No source check in this session'};
  }
  link(book,source,id,initial=null){if(!this.library.book(book))throw new Error('Book not found.');id=remoteId(source,id);const old=this.row(book,source);if(old?.remote_id===id)return;this.library.db.prepare('INSERT OR REPLACE INTO source_updates(book,source,remote_id,snapshot) VALUES(?,?,?,?)').run(book,source,id,json(initial));}
  sync(){if(this.library.preferences().incognito)return;for(const row of this.library.db.prepare('SELECT id,state FROM books WHERE root=?').all(this.library.root())){const metadata=JSON.parse(row.state).metadata;if(metadata?.provider==='Project Gutenberg'&&/^gutenberg:[1-9]\d{0,9}$/.test(metadata.key))this.link(row.id,'gutenberg',metadata.key.split(':')[1]);else if(metadata?.provider==='Open Library'&&/^\/works\/OL\d{1,15}W$/.test(metadata.key))this.link(row.id,'openlibrary',metadata.key);}}
  row(book,source){return this.library.db.prepare('SELECT * FROM source_updates WHERE book=? AND source=?').get(book,source);}
  list(){this.sync();const links=this.library.db.prepare('SELECT source_updates.* FROM source_updates JOIN books ON books.id=source_updates.book WHERE books.root=? ORDER BY checked,book').all(this.library.root()).map(row=>{const book=this.library.book(row.book),cover=this.covers.info(row.book);return {...row,title:book.state.metadata?.title||book.title,available:!!book.available,coverProtected:!!(cover&&cover!==row.managed_cover),proposal:JSON.parse(row.proposal),snapshot:JSON.parse(row.snapshot),category:book.state.category||'Default'};});return {job:{...this.job,applying:!!this.applying,status:this.applying?'Saving source change':this.job.status},links,networkEnabled:this.library.preferences().networkEnabled,incognito:this.library.preferences().incognito,contentChecksEnabled:this.library.preferences().remoteContentChecks};}
  allowed(){const prefs=this.library.preferences();return prefs.networkEnabled&&!prefs.incognito;}
  eligible(row){const book=this.library.book(row.book),prefs=this.library.preferences();if(!row.enabled||!book?.available||prefs.remoteExcludedCategories.includes(book.state.category||'Default')||excludedSource(book.source,prefs.excludedFolders))return false;try{this.sources.registry.require(row.source);return true;}catch{return false;}}
  due(){this.sync();const now=Date.now(),hours=this.library.preferences().remoteIntervalHours;return this.list().links.filter(row=>this.eligible(row)&&now-row.checked>=hours*3600000);}
  ensureEnabled(){if(!this.allowed())throw new Error('Enable optional network access and turn off Incognito to check sources.');}
  cancel(){this.cancelled=true;this.controller?.abort();this.applyController?.abort();}
  async tick(){if(this.job.running){if(!this.allowed()||this.automatic&&!this.library.preferences().remoteRefresh)this.cancel();return;}if(this.library.preferences().remoteRefresh&&this.allowed()&&this.due().length)await this.run({force:false});}
  async remote(row,signal){
    const id=remoteId(row.source,row.remote_id);let metadata,cover=null,edition=null;
    if(row.source==='gutenberg'){
      const raw=JSON.parse((await this.network.bounded('https://gutendex.com/books/'+id,1024*1024,['gutendex.com'],{signal})).toString('utf8'));
      if(raw.id!==Number(id)||raw.copyright!==false||typeof raw.title!=='string')throw new Error('The source did not return this public-domain edition.');
      metadata={title:raw.title.slice(0,300),author:(Array.isArray(raw.authors)?raw.authors:[]).slice(0,5).map(a=>String(a?.name||'')).join(', ').slice(0,300),key:'gutenberg:'+id,provider:'Project Gutenberg',year:null};
      cover=approvedCover(row.source,raw.formats?.['image/jpeg']||raw.formats?.['image/png']);
      try{const url=new URL(raw.formats?.['application/epub+zip']);if(url.protocol==='https:'&&!url.port&&!url.username&&!url.password&&['www.gutenberg.org','gutenberg.org'].includes(url.hostname)&&/^\/cache\/epub\/\d+\/[^/]+\.epub$/.test(url.pathname))edition=url.href;}catch{}
    }else{
      const url=new URL('https://openlibrary.org/search.json');url.search=new URLSearchParams({q:'key:'+id,fields:'key,title,author_name,first_publish_year,cover_i',limit:'1'}).toString();
      const raw=JSON.parse((await this.network.bounded(url.href,1024*1024,['openlibrary.org'],{signal})).toString('utf8')),item=Array.isArray(raw.docs)&&raw.docs.find(item=>item?.key===id||'/works/'+item?.key===id);
      if(!item||typeof item.title!=='string')throw new Error('This linked work is no longer available from Open Library.');
      metadata={title:item.title.slice(0,300),author:(Array.isArray(item.author_name)?item.author_name:[]).slice(0,5).map(String).join(', ').slice(0,300),key:id,provider:'Open Library',year:Number(item.first_publish_year)||null};
      if(Number.isSafeInteger(item.cover_i)&&item.cover_i>0)cover='https://covers.openlibrary.org/b/id/'+item.cover_i+'-M.jpg?default=false';
    }
    return {metadata,cover,edition};
  }
  async contents(row,remote,previous,signal,compare){
    const content={};let compared=0;
    for(const kind of ['edition','cover']){
      const url=remote[kind];if(!url)continue;
      // Retain a baseline while checks are off, without issuing any asset request.
      if(previous?.content?.[kind]?.url===url)content[kind]=previous.content[kind];
      const prefs=this.library.preferences();if(!compare||!prefs.remoteContentChecks||kind==='cover'&&prefs.remoteCovers==='off')continue;
      this.ensureEnabled();if(!this.eligible(row))throw new Error('This linked book or source was excluded while checking.');
      const bytes=await this.network.bounded(url,(kind==='edition'?20:5)*1024*1024,kind==='edition'?['www.gutenberg.org','gutenberg.org']:coverHosts(row.source),{signal});
      this.ensureEnabled();if(!this.library.preferences().remoteContentChecks)throw new Error('Content comparison was turned off. The last successful check was preserved.');
      if(!validAsset(bytes,kind))throw new Error('The source returned an unexpected '+(kind==='edition'?'EPUB':'cover image')+' response. The last successful check was preserved.');
      content[kind]={url,sha256:sha256(bytes),size:bytes.length,checked:Date.now()};compared++;
    }
    if(compare&&!compared)throw new Error('No supported EPUB or enabled source cover is available for content comparison.');
    if(Object.keys(content).length)remote.content=content;
  }
  metadata(book,remote,preserveTitle){return {...remote.metadata,title:preserveTitle?(book.state.metadata?.title||book.title):remote.metadata.title};}
  comparison(book,source){this.ensureEnabled();this.sync();const row=this.row(book,source);if(!this.library.preferences().remoteContentChecks)throw new Error('Enable manual content comparison in Source update preferences first.');if(!row||this.library.book(book)?.root!==this.library.root()||!this.eligible(row))throw new Error('This linked book is paused, excluded, unavailable or its source is disabled.');return {book,source};}
  async run({force=true,compare=null}={}){
    this.ensureEnabled();if(this.job.running||this.applying)throw new Error('A source operation is already running.');this.sync();
    if(compare){if(!force)throw new Error('Content comparisons require an explicit per-book action.');this.comparison(compare.book,compare.source);}
    const root=this.library.root(),rows=(compare?this.list().links.filter(row=>row.book===compare.book&&row.source===compare.source):force?this.list().links.filter(row=>this.eligible(row)):this.due()).slice(0,10);this.cancelled=false;this.automatic=!force;this.controller=new AbortController();
    this.job={running:true,checked:0,total:rows.length,errors:0,status:compare?'Comparing linked file contents':'Checking linked sources'};
    try{for(const row of rows){
      if(this.cancelled||!this.allowed()||this.library.root()!==root||this.automatic&&!this.library.preferences().remoteRefresh)break;
      if(!this.eligible(row))continue;
      try{
        const wait=Math.max(0,this.pace-(Date.now()-(this.lastRequest||0)));if(wait)await delay(wait,undefined,{signal:this.controller.signal});this.lastRequest=Date.now();
        const book=this.library.book(row.book),localMetadata=book.state.metadata??null,localCover=this.covers.info(row.book),remote=await this.remote(row,this.controller.signal);
        await this.contents(row,remote,row.snapshot,this.controller.signal,!!compare);
        if(this.cancelled||!this.allowed()||this.library.root()!==root||this.automatic&&!this.library.preferences().remoteRefresh)break;
        if(!this.eligible(row))continue;
        const prefs=this.library.preferences(),changes=[],previous=row.snapshot,pending=row.proposal;
        const current={title:book.state.metadata?.title||book.title,author:book.state.metadata?.author||'',year:book.state.metadata?.year||null},target=this.metadata(book,remote,prefs.remoteKeepTitles);
        if(prefs.remoteMetadata!=='off'&&['title','author','year'].some(key=>current[key]!==target[key]))changes.push('metadata');
        if(prefs.remoteCovers!=='off'&&remote.cover&&(!localCover||previous?.cover!==remote.cover||changedBytes('cover',remote,previous,pending)||pending?.changes.includes('cover')&&pending.remote.cover===remote.cover))changes.push('cover');
        if(remote.edition&&(previous?.edition&&previous.edition!==remote.edition||pending?.changes.includes('edition')&&pending.remote.edition===remote.edition))changes.push('edition');
        if(changedBytes('edition',remote,previous,pending))changes.push('content');
        const hash=revisionFingerprint(remote),proposal=changes.length&&row.ignored!==hash?{fingerprint:hash,remote,changes,localMetadata,localCover,preserveTitle:prefs.remoteKeepTitles}:null;
        this.library.db.prepare('UPDATE source_updates SET checked=?,snapshot=?,proposal=?,error=? WHERE book=? AND source=?').run(Date.now(),json(remote),json(proposal),'',row.book,row.source);
        const provider=this.library.book(row.book).state.metadata?.provider;
        if(proposal?.changes.includes('metadata')&&prefs.remoteMetadata==='apply'&&provider===(row.source==='gutenberg'?'Project Gutenberg':'Open Library'))await this.apply(row.book,row.source,'metadata',{automatic:true});
        if(proposal?.changes.includes('cover')&&prefs.remoteCovers==='missing'&&(!localCover||localCover===row.managed_cover))await this.apply(row.book,row.source,'cover',{automatic:true});
      }catch(error){if(this.cancelled||!this.allowed())break;this.job.errors++;this.library.db.prepare('UPDATE source_updates SET checked=?,error=? WHERE book=? AND source=?').run(Date.now(),error.message.slice(0,300),row.book,row.source);}
      this.job.checked++;
    }}catch(error){if(!this.cancelled)throw error;}
    finally{this.job.running=false;this.job.status=this.cancelled||!this.allowed()?'Source check stopped':`Checked ${this.job.checked} linked ${this.job.checked===1?'book':'books'}${this.job.errors?' · '+this.job.errors+' errors':''}`;this.controller=null;}
    return this.job;
  }
  async apply(bookId,source,kind,{automatic=false}={}){
    if(this.applying||this.job.running&&!automatic)throw new Error('Wait for the current source check to finish.');
    const row=this.row(bookId,source),book=this.library.book(bookId),proposal=row&&JSON.parse(row.proposal);if(!book||!proposal?.changes.includes(kind)||!['metadata','cover'].includes(kind))throw new Error('No pending change of this type. Check the source again.');
    this.applying=true;this.applyController=new AbortController();
    try{
      if(kind==='metadata'){
        if(json(book.state.metadata)!==json(proposal.localMetadata)||proposal.preserveTitle!==this.library.preferences().remoteKeepTitles)throw new Error('Local metadata or title policy changed. Check the source again before applying.');
        this.library.details(bookId,{metadata:this.metadata(book,proposal.remote,proposal.preserveTitle)});proposal.localMetadata=this.library.book(bookId).state.metadata;
      }else{
        this.ensureEnabled();this.sources.registry.require(source);const current=this.covers.info(bookId);if(current&&current!==row.managed_cover)throw new Error('Your custom cover is preserved. Use original cover in Book details before applying a source cover.');
        const bytes=await this.network.bounded(proposal.remote.cover,5*1024*1024,coverHosts(source),{signal:this.applyController.signal});
        if(proposal.remote.content?.cover&&sha256(bytes)!==proposal.remote.content.cover.sha256)throw new Error('The source cover changed after review. Check the source again before applying.');
        this.ensureEnabled();if(automatic&&this.library.preferences().remoteCovers!=='missing')throw new Error('Automatic cover refresh was turned off.');if(this.covers.info(bookId)!==current)throw new Error('The local cover changed. Check the source again.');
        const saved=await this.covers.save(bookId,Readable.from([bytes]),{expected:current});proposal.localCover=saved.filename;this.library.db.prepare('UPDATE source_updates SET managed_cover=? WHERE book=? AND source=?').run(proposal.localCover,bookId,source);
      }
      proposal.changes=proposal.changes.filter(change=>change!==kind);this.library.db.prepare('UPDATE source_updates SET proposal=?,error=? WHERE book=? AND source=?').run(json(proposal.changes.length?proposal:null),'',bookId,source);return {ok:true};
    }finally{this.applying=false;this.applyController=null;}
  }
  dismiss(book,source){if(this.job.running||this.applying)throw new Error('Wait for the source operation to finish.');const row=this.row(book,source);if(!this.library.book(book)||!row)throw new Error('Linked book not found.');const proposal=JSON.parse(row.proposal);this.library.db.prepare('UPDATE source_updates SET ignored=?,proposal=? WHERE book=? AND source=?').run(proposal?.fingerprint||row.ignored,'null',book,source);}
  follow(book,source,enabled){if(this.job.running||this.applying)throw new Error('Wait for the source operation to finish.');if(typeof enabled!=='boolean'||!this.library.book(book)||!this.row(book,source))throw new Error('Invalid linked book.');this.library.db.prepare('UPDATE source_updates SET enabled=? WHERE book=? AND source=?').run(enabled?1:0,book,source);}
}
