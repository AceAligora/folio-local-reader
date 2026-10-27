import {validateState} from './backup.mjs';
import {CURRENT_SCHEMA} from './schema.mjs';
import { readdir, lstat, realpath, access } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {defaults,validatePreferences} from './preferences.mjs';
import {excludedSource} from './scan-policy.mjs';

const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
export const naturalOrder = (a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0);
export function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
export class Library {
  constructor(file) {
    this.db = new DatabaseSync(file);
    if(this.db.prepare('PRAGMA user_version').get().user_version>CURRENT_SCHEMA){this.db.close();throw new Error('This profile was created by a newer Folio version. Update Folio before opening it.');}
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS file_identity(root TEXT NOT NULL,identity TEXT NOT NULL,book TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS config(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS books(id TEXT PRIMARY KEY, root TEXT NOT NULL, source TEXT NOT NULL, title TEXT NOT NULL, format TEXT NOT NULL, pages TEXT NOT NULL, available INTEGER NOT NULL DEFAULT 1, state TEXT NOT NULL DEFAULT '{}', UNIQUE(root,source));
      CREATE TABLE IF NOT EXISTS bookmeta(id TEXT PRIMARY KEY,added INTEGER NOT NULL,checked INTEGER NOT NULL,changed INTEGER NOT NULL,signature TEXT NOT NULL DEFAULT '');
      CREATE TABLE IF NOT EXISTS updates(id INTEGER PRIMARY KEY AUTOINCREMENT,book TEXT NOT NULL,kind TEXT NOT NULL,created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS reading(book TEXT PRIMARY KEY,seconds REAL NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS scan_directories(root TEXT NOT NULL,directory TEXT NOT NULL,stamp TEXT NOT NULL,entries TEXT NOT NULL,PRIMARY KEY(root,directory));
      PRAGMA user_version=${CURRENT_SCHEMA};`);
    const now=Date.now();this.db.prepare('INSERT OR IGNORE INTO bookmeta(id,added,checked,changed) SELECT id,?,?,? FROM books').run(now,now,now);
    const previousJob=JSON.parse(this.db.prepare('SELECT value FROM config WHERE key=?').get('last-scan')?.value||'null');this.job = previousJob?{...previousJob,running:false}:{ running: false, visited: 0, found: 0, issues: [], status: 'Ready' };
  }
  collections(){
    const root=this.root(),manual=JSON.parse(this.db.prepare('SELECT value FROM config WHERE key=?').get('collections')?.value||'[]').filter(c=>c.root===root);
    if(!this.preferences().folderCollections)return manual;
    const folders=new Map(),exclusions=this.preferences().excludedFolders;
    for(const book of this.db.prepare('SELECT id,source,format FROM books WHERE root=? AND available=1').all(root)){
      if(excludedSource(book.source,exclusions))continue;
      const parts=book.source.replaceAll('\\','/').split('/');if(book.format!=='images')parts.pop();
      if(parts[0]==='.')continue;
      for(let i=1;i<=parts.length;i++){const folder=parts.slice(0,i).join('/');if(!folders.has(folder))folders.set(folder,[]);folders.get(folder).push(book.id);}
    }
    return [...manual,...[...folders].sort(([a],[b])=>naturalOrder(a,b)).map(([folder,books])=>({id:'folder:'+folder,root,name:folder,books,generated:true}))];
  }
  saveCollection(data){
    if(data.id?.startsWith('folder:'))throw new Error('Folder collections follow your folders automatically. Create a manual collection to edit membership.');
    const name=typeof data.name==='string'?data.name.trim():'';
    if(!name||name.length>80)throw new Error('Enter a collection name of 1–80 characters.');
    if(!Array.isArray(data.books)||data.books.length>10000||data.books.some(id=>typeof id!=='string'||!this.book(id)))throw new Error('Choose books from this library.');
    const all=JSON.parse(this.db.prepare('SELECT value FROM config WHERE key=?').get('collections')?.value||'[]');
    if(all.some(c=>c.root===this.root()&&c.id!==data.id&&c.name.toLowerCase()===name.toLowerCase()))throw new Error('A collection with this name already exists.');
    const old=data.id&&all.find(c=>c.id===data.id&&c.root===this.root());
    if(data.id&&!old)throw new Error('Collection not found.');
    const next={id:old?.id||randomUUID(),root:this.root(),name,books:[...new Set(data.books)]};
    this.db.prepare('INSERT OR REPLACE INTO config VALUES (?,?)').run('collections',JSON.stringify([...all.filter(c=>c.id!==next.id),next]));return next;
  }
  removeCollection(id){if(id?.startsWith('folder:'))throw new Error('Disable folder collections in Library settings to hide these collections.');const all=JSON.parse(this.db.prepare('SELECT value FROM config WHERE key=?').get('collections')?.value||'[]');this.db.prepare('INSERT OR REPLACE INTO config VALUES (?,?)').run('collections',JSON.stringify(all.filter(c=>c.id!==id||c.root!==this.root())));}
  root() { return this.db.prepare('SELECT value FROM config WHERE key=?').get('root')?.value || ''; }
  preferences(patch){const previous=JSON.parse(this.db.prepare('SELECT value FROM config WHERE key=?').get('preferences')?.value||'{}');if(previous.tabs)previous.tabs=previous.tabs.filter(tab=>tab!=='browse');if(previous.lastTab==='browse')previous.lastTab='settings';if(previous.defaultTab==='browse')previous.defaultTab='settings';if(patch===undefined)return {...defaults,...previous};const next=validatePreferences(patch,previous);this.db.prepare('INSERT OR REPLACE INTO config VALUES (?,?)').run('preferences',JSON.stringify(next));return next;}
  updates(){return this.db.prepare('SELECT updates.*,books.title,books.format FROM updates JOIN books ON books.id=updates.book WHERE books.root=? ORDER BY updates.created DESC LIMIT 200').all(this.root());}
  insights(){return this.db.prepare('SELECT books.*,reading.seconds FROM reading JOIN books ON books.id=reading.book WHERE books.root=? ORDER BY seconds DESC').all(this.root()).map(b=>this.decode(b));}
  backup(){return {format:'folio-backup-v1',created:Date.now(),preferences:this.preferences(),collections:this.collections().filter(c=>!c.generated),books:this.db.prepare('SELECT id,source,state FROM books WHERE root=?').all(this.root()).map(b=>({...b,state:JSON.parse(b.state)})),reading:this.insights().map(b=>({id:b.id,seconds:b.seconds}))};}
  async configure(root) {
    if (this.job.running) throw new Error('Wait for the scan to finish before changing folders.');
    if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('Enter an absolute folder path.');
    const resolved = await realpath(root);
    if (!(await lstat(resolved)).isDirectory()) throw new Error('Choose a folder.');
    this.db.prepare('INSERT OR REPLACE INTO config VALUES (?,?)').run('root', resolved);
  }
  list(query = '', format = '', page = 0, shelf = '', sort='title',category='',letter='',descending=false,collection='',tag='',series='') {
    const members=collection?new Set(this.collections().find(c=>c.id===collection)?.books||[]):null;
    const exclusions=this.preferences().excludedFolders,visible=this.db.prepare('SELECT * FROM books WHERE root=?').all(this.root()).filter(b=>!excludedSource(b.source,exclusions));
    const all = visible
      .filter(b => {const state=JSON.parse(b.state);const title=state.metadata?.title||b.title;const initial=/^[A-Z]$/i.test(title[0]||'')?title[0].toUpperCase():'#';return (!letter||initial===letter)&&(!format || b.format === format) && `${title} ${state.metadata?.author||''} ${b.source}`.toLowerCase().includes(query.toLowerCase()) && (shelf!=='continue'||state.updated) && (shelf!=='favorites'||state.favorite) && (shelf!=='finished'||state.status==='finished');})
      .filter(b=>{const state=JSON.parse(b.state);return (!members||members.has(b.id))&&(!tag||(state.tags||[]).includes(tag))&&(!series||state.series===series);})
      .map(b=>({...b,...this.db.prepare('SELECT added,checked,changed FROM bookmeta WHERE id=?').get(b.id)}))
      .filter(b=>{const state=JSON.parse(b.state);return (shelf!=='unread'||!state.status||state.status==='unread')&&(shelf!=='downloaded'||b.available)&&(category===''||(state.category||'Default')===category);})
      .sort((a,b) => {
        const x=JSON.parse(a.state),y=JSON.parse(b.state);
        const count=b=>b.format==='images'?JSON.parse(b.pages).length:JSON.parse(b.state).total||0;
        const value=sort==='chapters'?count(b)-count(a):sort==='lastRead'?(y.updated||0)-(x.updated||0):sort==='unread'?Number(!y.status||y.status==='unread')-Number(!x.status||x.status==='unread'):sort==='latest'?(b.changed||0)-(a.changed||0):sort==='fetched'?(b.checked||0)-(a.checked||0):sort==='added'?(b.added||0)-(a.added||0):0;
        return (descending?-1:1)*(value||naturalOrder(x.metadata?.title||a.title,y.metadata?.title||b.title));
      });
    const categoryCounts={};for(const row of visible){const name=JSON.parse(row.state).category||'Default';categoryCounts[name]=(categoryCounts[name]||0)+1;}
    const tags=new Set(),seriesNames=new Set();for(const row of visible){const state=JSON.parse(row.state);for(const tag of state.tags||[])tags.add(tag);if(state.series)seriesNames.add(state.series);}
    return { total: all.length,categoryCounts,tags:[...tags].sort(naturalOrder),series:[...seriesNames].sort(naturalOrder), books: all.slice(page * 60, (page + 1) * 60).map(b => this.decode(b)) };
  }
  decode(b) {if(!b)return b;const state=JSON.parse(b.state),sourcePages=JSON.parse(b.pages);let pages=sourcePages;if(b.format==='images'){const order=(state.imageOrder||[]).filter(p=>sourcePages.includes(p));pages=[...order,...sourcePages.filter(p=>!order.includes(p))].filter(p=>!(state.excludedPages||[]).includes(p));}return {...b,pages,sourcePages,state}; }
  book(id) { return this.decode(this.db.prepare('SELECT * FROM books WHERE id=? AND root=?').get(id, this.root())); }
  bookBySource(source){if(typeof source!=='string'||!source||source.length>4000||path.isAbsolute(source)||/^[a-z]:/i.test(source)||source.split(/[\\/]/).some(part=>!part||part==='..'||part==='.'))throw new Error('Invalid relative book path.');return this.decode(this.db.prepare('SELECT * FROM books WHERE source=? AND root=?').get(source,this.root()))||null;}
  desktopFileBinding(key,bookId){if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))throw new Error('Invalid desktop file binding.');const name='desktop-file:'+this.root()+':'+key;if(bookId!==undefined){if(!this.book(bookId)?.available)throw new Error('Book not found.');this.db.prepare('INSERT OR REPLACE INTO config VALUES(?,?)').run(name,bookId);}const stored=this.db.prepare('SELECT value FROM config WHERE key=?').get(name)?.value;return stored&&this.book(stored)?.available?{bookId:stored}:null;}
  save(id, state) {
    if(this.preferences().incognito)return;
    if (!this.book(id)) throw new Error('Book not found.');
    if (!Number.isInteger(state.page) || state.page < 0 || state.page > 1000000) throw new Error('Invalid page.');
    const book=this.book(id),previous=book.state;
    if('anchor'in state&&(typeof state.anchor!=='string'||state.anchor.length>4000))throw new Error('Invalid reading anchor.');
    const scroll=Number(state.scroll||0),seconds=Number(state.seconds||0),total=Number(state.total||previous.total||0);
    if(!Number.isFinite(scroll)||scroll<0||scroll>100000000||!Number.isFinite(seconds)||seconds<0||seconds>30||!Number.isInteger(total)||total<0||total>1000000)throw new Error('Invalid reading position.');
    const category=previous.category||(this.preferences().defaultCategory==='ask'?'Default':this.preferences().defaultCategory);
    this.db.prepare('UPDATE books SET state=? WHERE id=?').run(JSON.stringify({...previous,...('flowPosition'in state?{flowPosition:validateState({flowPosition:state.flowPosition}).flowPosition}:{}),...('readerPreferences'in state?{readerPreferences:validateState({readerPreferences:state.readerPreferences}).readerPreferences}:{}),...('view'in state?{view:validateState({view:state.view}).view}:{}),...('epubAnchor'in state?{epubAnchor:validateState({epubAnchor:state.epubAnchor}).epubAnchor}:{}),anchor:state.anchor||previous.anchor,page:state.page,scroll,total,category,updated:Date.now(),status:previous.status==='finished'?'finished':'reading'}), id);
    if(seconds)this.db.prepare('INSERT INTO reading(book,seconds) VALUES(?,?) ON CONFLICT(book) DO UPDATE SET seconds=seconds+excluded.seconds').run(id,seconds);
  }
  details(id, patch) {
    const book=this.book(id);if(!book)throw new Error('Book not found.');
    const state={...book.state};
    for(const key of ['imageOrder','excludedPages'])if(key in patch){if(book.format!=='images'||!Array.isArray(patch[key])||patch[key].length>100000||patch[key].some(p=>typeof p!=='string'||!book.sourcePages.includes(p)))throw new Error('Choose pages from this image book.');state[key]=[...new Set(patch[key])];}
    if('readerPreferences'in patch){if(patch.readerPreferences===null)delete state.readerPreferences;else state.readerPreferences=validateState({readerPreferences:patch.readerPreferences}).readerPreferences;}
    if('notes'in patch)state.notes=validateState({notes:patch.notes}).notes;
    if('tags'in patch)state.tags=validateState({tags:patch.tags}).tags;
    if('series'in patch)state.series=validateState({series:patch.series}).series;
    if('metadata' in patch){const data=patch.metadata;if(data===null)delete state.metadata;else{if(!data||typeof data.title!=='string'||data.title.length>300||typeof data.author!=='string'||data.author.length>300||typeof data.key!=='string'||data.key.length>100)throw new Error('Invalid book metadata.');state.metadata={title:data.title,author:data.author,key:data.key,year:Number(data.year)||null,provider:['Manual','Project Gutenberg'].includes(data.provider)?data.provider:'Open Library'};}}
    if('category' in patch){if(!this.preferences().categories.includes(patch.category))throw new Error('Unknown category.');state.category=patch.category;}
    if('favorite' in patch){if(typeof patch.favorite!=='boolean')throw new Error('Invalid favorite.');state.favorite=patch.favorite;}
    if('status' in patch){if(!['unread','reading','finished'].includes(patch.status))throw new Error('Invalid status.');state.status=patch.status;}
    if('bookmarks' in patch){
      if(!Array.isArray(patch.bookmarks)||patch.bookmarks.length>100||patch.bookmarks.some(b=>!Number.isInteger(b.page)||b.page<0||b.page>1000000||typeof b.label!=='string'||b.label.length>120))throw new Error('Invalid bookmarks.');
      state.bookmarks=patch.bookmarks.map(b=>({page:b.page,label:b.label}));
    }
    if(book.format==='images'&&book.sourcePages.length&&book.sourcePages.every(p=>(state.excludedPages||[]).includes(p)))throw new Error('Keep at least one image page.');
    this.db.prepare('UPDATE books SET state=? WHERE id=?').run(JSON.stringify(state),id);
  }
  bulk(ids,patch){if(!Array.isArray(ids)||!ids.length||ids.length>500||ids.some(id=>!this.book(id)))throw new Error('Choose up to 500 books in this library.');if(!patch||Object.keys(patch).some(key=>!['category','status','favorite','tags','series'].includes(key)))throw new Error('Invalid bulk edit.');this.db.exec('BEGIN IMMEDIATE');try{for(const id of new Set(ids))this.details(id,patch);this.db.exec('COMMIT');return {updated:new Set(ids).size};}catch(error){this.db.exec('ROLLBACK');throw error;}}
  duplicateCandidates(){const rows=this.db.prepare('SELECT books.id,books.title,books.source,books.format,bookmeta.signature FROM books JOIN bookmeta ON books.id=bookmeta.id WHERE root=? AND available=1').all(this.root()),groups=new Map();for(const row of rows){if(row.format==='images')continue;const size=row.signature.split(':')[0];if(!/^\d+$/.test(size))continue;const key=row.format+':'+size;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({id:row.id,title:row.title,source:row.source});}return [...groups.values()].filter(group=>group.length>1).slice(0,200);}
  relink(missingId,replacementId){if(this.job.running)throw new Error('Wait for the scan to finish.');const missing=this.book(missingId),replacement=this.book(replacementId);if(!missing||missing.available||!replacement?.available||missing.format!==replacement.format||missingId===replacementId)throw new Error('Choose a missing book and an available book of the same format.');this.db.exec('BEGIN IMMEDIATE');try{const oldState={...missing.state};if(missing.format==='images'){const byName=new Map(replacement.sourcePages.map(page=>[path.basename(page),page]));for(const key of ['imageOrder','excludedPages'])if(oldState[key])oldState[key]=oldState[key].map(page=>byName.get(path.basename(page))).filter(Boolean);if(oldState.anchor)oldState.anchor=byName.get(path.basename(oldState.anchor))||'';if(oldState.excludedPages?.length===replacement.sourcePages.length)oldState.excludedPages=[];}const state={...replacement.state,...oldState,notes:[...new Map([...(replacement.state.notes||[]),...(missing.state.notes||[])].map(n=>[n.id,n])).values()],bookmarks:[...new Map([...(replacement.state.bookmarks||[]),...(missing.state.bookmarks||[])].map(n=>[n.page+':'+n.label,n])).values()],tags:[...new Set([...(replacement.state.tags||[]),...(missing.state.tags||[])])]};this.db.prepare('UPDATE books SET state=? WHERE id=?').run(JSON.stringify(state),replacementId);if(Number.isInteger(missing.state.queueRank)){const retained={...missing.state};delete retained.queueRank;this.db.prepare('UPDATE books SET state=? WHERE id=?').run(JSON.stringify(retained),missingId);}const time=this.db.prepare('SELECT seconds FROM reading WHERE book=?').get(missingId);if(time)this.db.prepare('INSERT INTO reading VALUES(?,?) ON CONFLICT(book) DO UPDATE SET seconds=MAX(seconds,excluded.seconds)').run(replacementId,time.seconds);for(const c of this.collections())if(!c.generated&&c.books.includes(missingId))this.saveCollection({...c,books:[...new Set(c.books.map(id=>id===missingId?replacementId:id))]});this.db.exec('COMMIT');return {id:replacementId};}catch(error){this.db.exec('ROLLBACK');throw error;}}
  cancel() { this.cancelled = true; }
  async scan({full=false}={}) {
    if (this.job.running) return;
    const root = this.root();
    if (!root) throw new Error('Configure a library folder first.');
    this.cancelled = false;
    const preferences=this.preferences();
    this.job = { running: true, visited: 0, found: 0, cachedFolders:0, readFolders:0, skippedFolders:0, issues: [], status: 'Scanning' };
    const seen = new Set(); let incomplete = false;
    const issue = (source, message) => { if (this.job.issues.length < 200) this.job.issues.push({source,message}); };
    const upsert = async (source, title, format, pages,signature='',identity='') => {
      seen.add(source);
      let previous=this.db.prepare('SELECT id,pages FROM books WHERE root=? AND source=?').get(root,source);
      if(!previous&&identity){
        const candidates=this.db.prepare('SELECT books.id,books.source,books.pages,books.state,bookmeta.signature FROM file_identity JOIN books ON books.id=file_identity.book JOIN bookmeta ON bookmeta.id=books.id WHERE file_identity.root=? AND identity=? AND books.format=?').all(root,identity,format);
        if(candidates.length===1&&(format==='images'||candidates[0].signature===signature)&&!seen.has(candidates[0].source)&&!excludedSource(candidates[0].source,preferences.excludedFolders)){
          const old=candidates[0];let absent=false;try{await lstat(path.join(root,old.source));}catch(error){absent=error.code==='ENOENT';}
          if(absent){
            const state=JSON.parse(old.state);
            if(format==='images'){
              const mapping=new Map(JSON.parse(old.pages).map(page=>[page,path.join(source,path.basename(page))]));
              for(const key of ['imageOrder','excludedPages'])if(state[key])state[key]=state[key].map(page=>mapping.get(page)).filter(page=>pages.includes(page));
              if(state.anchor&&mapping.has(state.anchor))state.anchor=mapping.get(state.anchor);
            }
            // Move the path, page manifest and anchors together, including on crash.
            this.db.prepare('UPDATE books SET source=?,title=?,pages=?,state=?,available=1 WHERE id=?').run(source,title,JSON.stringify(pages),JSON.stringify(state),old.id);
            previous=this.db.prepare('SELECT id,pages FROM books WHERE id=?').get(old.id);
            this.db.prepare('INSERT INTO updates(book,kind,created) VALUES(?,?,?)').run(old.id,'Local file moved',Date.now());
          }
        }
      }
      this.db.prepare(`INSERT INTO books(id,root,source,title,format,pages) VALUES(?,?,?,?,?,?) ON CONFLICT(root,source) DO UPDATE SET pages=excluded.pages, available=1`).run(randomUUID(),root,source,title,format,JSON.stringify(pages));
      this.job.found++;
      const id=previous?.id||this.db.prepare('SELECT id FROM books WHERE root=? AND source=?').get(root,source).id;
      if(identity)this.db.prepare('INSERT OR REPLACE INTO file_identity VALUES(?,?,?)').run(root,identity,id);
      const old=this.db.prepare('SELECT * FROM bookmeta WHERE id=?').get(id);const now=Date.now();
      const changed=!previous||previous.pages!==JSON.stringify(pages)||(old?.signature&&old.signature!==signature);
      this.db.prepare('INSERT INTO bookmeta VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET checked=excluded.checked,changed=excluded.changed,signature=excluded.signature').run(id,old?.added||now,now,changed?now:old?.changed||now,signature);
      const category=JSON.parse(this.db.prepare('SELECT state FROM books WHERE id=?').get(id).state).category||'Default';if(changed&&!this.preferences().excludedUpdateCategories.includes(category))this.db.prepare('INSERT INTO updates(book,kind,created) VALUES(?,?,?)').run(id,previous?'Local file updated':'Added to library',now);
    };
    const walk = async directory => {
      if (this.cancelled) return;
      let entries;
      try {
        await access(directory);const info=await lstat(directory),stamp=info.mtimeMs+':'+info.ctimeMs;
        const cached=!full&&preferences.incrementalScan?this.db.prepare('SELECT stamp,entries FROM scan_directories WHERE root=? AND directory=?').get(root,directory):null;
        if(cached?.stamp===stamp){entries=JSON.parse(cached.entries);this.job.cachedFolders++;}
        else{
          entries=await readdir(directory);this.job.readFolders++;
          const after=await lstat(directory);
          if(after.mtimeMs+':'+after.ctimeMs===stamp)this.db.prepare('INSERT OR REPLACE INTO scan_directories VALUES(?,?,?,?)').run(root,directory,stamp,JSON.stringify(entries));
        }
      }
      catch { incomplete = true; issue(path.relative(root,directory), 'Folder could not be read.'); return; }
      const images = [];const stamps=[];
      for (const name of entries.sort(naturalOrder)) {
        if (this.cancelled) break;
        const full = path.join(directory,name), relative = path.relative(root,full);
        if(excludedSource(relative,preferences.excludedFolders)){this.job.skippedFolders++;continue;}
        this.job.visited++;
        try {
          const info = await lstat(full);
          if (info.isSymbolicLink()) { issue(relative,'Link skipped.'); continue; }
          if (info.isDirectory()) { await walk(full); continue; }
          if (!info.isFile()) continue;
          const ext = path.extname(name).toLowerCase();
          if (!imageExtensions.has(ext) && ext !== '.pdf' && ext !== '.epub' && ext !== '.cbz') { issue(relative, 'Unsupported file type.'); continue; }
          await access(full);
          if (imageExtensions.has(ext)){images.push(relative);stamps.push(`${relative}:${info.size}:${info.mtimeMs}`);}
          else{const stable=await lstat(full,{bigint:true});await upsert(relative,path.basename(name,ext),ext.slice(1),[],`${info.size}:${info.mtimeMs}`,stable.ino>0n?`${stable.dev}:${stable.ino}:${stable.birthtimeNs}`:'');}
        } catch { incomplete = true; issue(relative,'File could not be inspected.'); }
        if (this.job.visited % 50 === 0) await new Promise(resolve=>setImmediate(resolve));
      }
      if(images.length&&!this.cancelled){const stable=await lstat(directory,{bigint:true});await upsert(path.relative(root,directory)||'.',path.basename(directory),'images',images.sort(naturalOrder),stamps.join('|'),stable.ino>0n?`${stable.dev}:${stable.ino}:${stable.birthtimeNs}`:'');}
    };
    try {
      await access(root);
      await walk(root);
      if (!this.cancelled && !incomplete) {
        const update = this.db.prepare('UPDATE books SET available=0 WHERE root=? AND source=?');
        for (const book of this.db.prepare('SELECT source FROM books WHERE root=?').all(root)) if (!seen.has(book.source)&&!excludedSource(book.source,preferences.excludedFolders)) update.run(root,book.source);
      }
      this.job.status = this.cancelled ? 'Cancelled — existing records preserved' : incomplete ? 'Finished with unreadable entries — missing checks skipped' : 'Scan complete';
    } catch { this.job.status = 'Library unavailable — existing records preserved'; issue('', 'Check that the library drive is connected.'); }
    finally { this.job.finishedAt=Date.now();this.job.running = false;this.db.prepare('INSERT OR REPLACE INTO config VALUES(?,?)').run('last-scan',JSON.stringify(this.job)); }
  }
  async content(id, index = 0) {
    const book = this.book(id);
    if (!book || !book.available) throw new Error('Book unavailable.');
    const relative = book.format === 'images' ? book.pages[index] : book.source;
    if (typeof relative !== 'string') throw new Error('Page not found.');
    const root = await realpath(this.root());
    let current = root;
    for (const segment of relative.split(path.sep)) {
      current = path.join(current,segment);
      if ((await lstat(current)).isSymbolicLink()) throw new Error('Linked files are not served.');
    }
    const full = await realpath(current);
    if (!inside(root,full)) throw new Error('File outside configured library.');
    return full;
  }
  close() { this.db.close(); }
}
