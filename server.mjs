import {changeAnnotation} from './lib/annotations.mjs';
import {visibleQueue,changeQueue} from './lib/reading-queue.mjs';
import {previewRelink} from './lib/relink-review.mjs';
import {DuplicateVerifier} from './lib/duplicate-verifier.mjs';
import {LibraryWatcher} from './lib/library-watcher.mjs';
import {AutomaticBackups} from './lib/automatic-backups.mjs';
import {exportProfile} from './lib/profile-backup.mjs';
import {TextIndex} from './lib/text-index.mjs';
import {LocalSpeech} from './lib/speech.mjs';
import {OcrService} from './lib/ocr.mjs';
import {CustomCovers} from './lib/custom-covers.mjs';
import {AppLock} from './lib/app-lock.mjs';
import {Diagnostics} from './lib/diagnostics.mjs';
import {NativeSources} from './lib/native-sources.mjs';
import {SourceUpdates} from './lib/source-updates.mjs';
import {ChapterFeeds} from './lib/chapter-feeds.mjs';
import {SourceSessions} from './lib/source-sessions.mjs';
import {prepareRestore,restoreBackup} from './lib/backup.mjs';
import http from 'node:http';
import { readFile, mkdir, stat, writeFile, rm, rename } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Imports } from './lib/imports.mjs';
import { Library } from './lib/library.mjs';
import { NetworkServices } from './lib/network.mjs';

const home = path.dirname(fileURLToPath(import.meta.url));
const appVersion=JSON.parse(await readFile(path.join(home,'package.json'),'utf8')).version;
const profile = process.env.EBOOK_PROFILE || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(),'.local','share'),'LocalEbookReader');
await mkdir(profile,{recursive:true});
const runtimeFile=path.join(profile,'server-runtime.json');
try{const previous=JSON.parse(await readFile(runtimeFile,'utf8'));try{process.kill(previous.pid,0);throw new Error('This Folio profile is already open. Use the existing app or stop it before starting another server.');}catch(error){if(error.code!=='ESRCH')throw error;}await rm(runtimeFile,{force:true});}catch(error){if(error.code!=='ENOENT')throw error;}
await writeFile(runtimeFile,JSON.stringify({pid:process.pid,started:Date.now()}),{flag:'wx'});
const library = new Library(path.join(profile,'library.sqlite'));
const duplicateVerifier=new DuplicateVerifier(library);
const libraryWatcher=new LibraryWatcher(library);
const automaticBackups=new AutomaticBackups(library,profile);
const imports = new Imports(library,profile);
const network = new NetworkServices(library,profile);
const sources = new NativeSources(network,imports);
const sourceUpdates=new SourceUpdates(sources,new CustomCovers(library,profile));sources.updates=sourceUpdates;
const chapterFeeds=new ChapterFeeds(sources);
const sourceSessions=new SourceSessions(library,()=>[...sources.registry.list().adapters.filter(a=>a.id!=='chapterfeed').flatMap(adapter=>adapter.hosts.map(host=>({id:adapter.id+':'+host,name:adapter.name+' · '+host,url:'https://'+host+'/',enabled:!!adapter.installedVersion&&adapter.supported&&adapter.settings.enabled}))),...chapterFeeds.descriptors()]);network.sessions=sourceSessions;
if (process.env.EBOOK_LIBRARY) await library.configure(process.env.EBOOK_LIBRARY);
const textIndex=new TextIndex(library);
const speech=new LocalSpeech(profile);
const ocr=new OcrService(library,profile);
const customCovers=new CustomCovers(library,profile);
const appLock=new AppLock(library),diagnostics=new Diagnostics(library);
const token = randomBytes(32).toString('hex');
const instance = randomBytes(32).toString('hex');
let origin;
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.epub':'application/epub+zip','.cbz':'application/vnd.comicbook+zip','.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp'};
const json = (res,status,value) => { res.writeHead(status,{'Content-Type':'application/json'}); res.end(JSON.stringify(value)); };
async function body(req) {
  let value=''; for await (const part of req) { value+=part; if (value.length>(req.url==='/api/text/page'?500000:req.url==='/api/dictionary'?2*1024*1024:req.url.startsWith('/api/restore')?20*1024*1024:req.url==='/api/collections'?2000000:32768)) throw new Error('Request too large.'); }
  return JSON.parse(value || '{}');
}
const server = http.createServer(async(req,res)=>{
  const started=performance.now();res.on('finish',()=>{try{diagnostics.record({method:req.method,route:new URL(req.url,'http://localhost').pathname,status:res.statusCode,duration:performance.now()-started});}catch{}});
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; frame-src 'self' blob:; img-src 'self' blob: data:; media-src 'self' blob:; object-src 'none'; connect-src 'self'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'");
  try {
    if (`http://${req.headers.host}`!==origin || (req.headers.origin && req.headers.origin!==origin)) return json(res,403,{error:'Origin rejected.'});
    if (req.headers['sec-fetch-site']==='cross-site') return json(res,403,{error:'Cross-site request rejected.'});
    const url = new URL(req.url,origin);
    const cookies = req.headers.cookie?.split(';').map(s=>s.trim()) || [];
    const authorized = cookies.includes(`reader=${token}`);
    if (url.pathname === '/' && req.method==='GET') {
      res.setHeader('Set-Cookie',`reader=${token}; HttpOnly; SameSite=Strict; Path=/`);
      res.setHeader('Content-Type',mime['.html']); return res.end(await readFile(path.join(home,'public/index.html')));
    }
    if (['/discovery-model.js','/discovery.js','/read-aloud.js','/annotations.js','/reading-queue.js','/shortcuts.js','/serial-ui.js','/source-update-ui.js','/native-source-ui.js','/epub-position.js','/compare-reader.js','/text-library.js','/crop.js','/accessibility-reader.js','/library-tools.js','/book-details.js','/archive-reader.js','/security-ui.js','/continuous-reader.js','/notebook.js','/backup-ui.js','/reader-navigation.js','/actions.js','/app.js','/workspace.js','/network-ui.js','/wheel.js','/spreads.js','/pdf-reader.js','/epub-reader.js','/covers.js','/pdf-text.css','/style.css'].includes(url.pathname) && req.method==='GET') {
      res.setHeader('Content-Type',mime[path.extname(url.pathname)]); return res.end(await readFile(path.join(home,'public',url.pathname.slice(1))));
    }
    if (!authorized) return json(res,401,{error:'Open the reader home page first.'});
    if(req.method==='GET'&&url.pathname==='/desktop-ui.js'){res.setHeader('Content-Type',mime['.js']);return res.end(await readFile(path.join(home,'public/desktop-ui.js')));}
    if(req.method==='GET'&&url.pathname==='/api/runtime')return json(res,200,{instance,captureProtection:library.preferences().desktopCaptureProtection,desktopFiles:1,sourceSessions:1,version:appVersion});
    const unlocked=cookies.find(c=>c.startsWith('folioUnlock='))?.slice('folioUnlock='.length);
    const unlockCookie=value=>res.setHeader('Set-Cookie','folioUnlock='+value+'; HttpOnly; SameSite=Strict; Path=/');
    if(req.method==='GET'&&url.pathname==='/api/lock/status')return json(res,200,{configured:appLock.configured(),locked:!appLock.authorized(unlocked)});
    if(req.method==='POST'&&url.pathname==='/api/lock/unlock'){if(req.headers.origin!==origin||!req.headers['content-type']?.startsWith('application/json'))return json(res,403,{error:'Local JSON request required.'});const data=await body(req);unlockCookie(await appLock.unlock(data.password,req.socket.remoteAddress));return json(res,200,{ok:true});}
    if(!appLock.authorized(unlocked)&&!url.pathname.startsWith('/icons/')&&!url.pathname.startsWith('/fonts/')&&!url.pathname.startsWith('/vendor/')&&url.pathname!=='/art/reading-space.png')return json(res,423,{error:'Folio is locked. Unlock the app to continue.'});
    if(req.method==='GET'&&url.pathname==='/api/diagnostics')return json(res,200,diagnostics.list(url.searchParams.get('kind')||'log'));
    if(req.method==='GET'&&['/fonts/Roboto.ttf','/fonts/Geist.ttf','/fonts/Quicksand.ttf','/fonts/Poppins-SemiBold.ttf'].includes(url.pathname)){res.setHeader('Content-Type','font/ttf');return res.end(await readFile(path.join(home,'public',url.pathname.slice(1))));}
    if(req.method==='GET'&&url.pathname==='/art/reading-space.png'){res.setHeader('Content-Type','image/png');return res.end(await readFile(path.join(home,'public/art/reading-space.png')));}
    if(req.method==='GET'&&/^\/icons\/[a-z-]+\.svg$/.test(url.pathname)){res.setHeader('Content-Type','image/svg+xml');return res.end(await readFile(path.join(home,'public',url.pathname.slice(1))));}
    if ((url.pathname.startsWith('/vendor/pdfjs/')||url.pathname.startsWith('/vendor/fflate/')) && req.method==='GET') {
      const base=path.join(home,'public','vendor');
      const file=path.resolve(base,decodeURIComponent(url.pathname.slice('/vendor/'.length)));
      const relative=path.relative(base,file);
      if(relative.startsWith('..')||path.isAbsolute(relative))return json(res,403,{error:'Invalid asset path.'});
      res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
      const stream=createReadStream(file);stream.on('error',()=>{if(!res.headersSent)json(res,404,{error:'Asset not found.'});else res.destroy();});return stream.pipe(res);
    }
    if (req.method==='GET' && url.pathname==='/api/status') return json(res,200,{root:library.root(),job:library.job,watcher:libraryWatcher.status});
    if(req.method==='GET'&&url.pathname==='/api/local-book')return json(res,200,library.bookBySource(url.searchParams.get('source')));
    if(req.method==='GET'&&url.pathname==='/api/desktop-file-binding')return json(res,200,library.desktopFileBinding(url.searchParams.get('key')));
    if(req.method==='GET'&&url.pathname==='/api/duplicates/verified')return json(res,200,duplicateVerifier.result());
    if(req.method==='GET'&&url.pathname==='/api/queue')return json(res,200,visibleQueue(library));
    if(req.method==='GET'&&url.pathname==='/api/duplicates')return json(res,200,library.duplicateCandidates());
    if(req.method==='GET'&&url.pathname==='/api/sources')return json(res,200,sources.registry.list());
    if(req.method==='GET'&&url.pathname==='/api/chapter-feeds')return json(res,200,chapterFeeds.list());
    if(req.method==='GET'&&url.pathname==='/api/chapter-navigation')return json(res,200,chapterFeeds.navigation(url.searchParams.get('book')));
    if(req.method==='GET'&&url.pathname==='/api/source-sessions')return json(res,200,sourceSessions.state());
    if(req.method==='GET'&&url.pathname==='/api/source-updates')return json(res,200,sourceUpdates.list());
    if(req.method==='GET'&&url.pathname==='/api/preferences')return json(res,200,library.preferences());
    if(req.method==='GET'&&url.pathname==='/api/updates')return json(res,200,library.updates());
    if(req.method==='GET'&&url.pathname==='/api/insights')return json(res,200,library.insights());
    if(req.method==='GET'&&url.pathname==='/api/profile-backup'){const bytes=await exportProfile(library,profile);res.setHeader('Content-Type','application/zip');res.setHeader('Content-Disposition','attachment; filename="folio-full-profile.zip"');return res.end(bytes);}
    if(req.method==='GET'&&url.pathname==='/api/automatic-backups')return json(res,200,{files:await automaticBackups.list(),error:automaticBackups.error});
    if(req.method==='GET'&&url.pathname==='/api/automatic-backup')return json(res,200,await automaticBackups.read(url.searchParams.get('name')));
    if(req.method==='GET'&&url.pathname==='/api/backup')return json(res,200,library.backup());
    if(req.method==='GET'&&url.pathname==='/api/network/catalogue')return json(res,200,network.catalogue(url.searchParams.get('repository'))||{extensions:[],cachedAt:null});
    if(req.method==='GET'&&url.pathname==='/api/network/packages')return json(res,200,network.packages());
    if(req.method==='GET'&&url.pathname.startsWith('/api/network/package/')){const asset=await network.packageFile(url.pathname.split('/').pop());res.setHeader('Content-Disposition',`attachment; filename="${asset.name}"`);res.setHeader('Content-Type','application/vnd.android.package-archive');const stream=createReadStream(asset.file);stream.on('error',()=>res.destroy());return stream.pipe(res);}
    if(req.method==='GET'&&url.pathname.startsWith('/api/book/')){const book=library.book(url.pathname.split('/').pop());return json(res,book?200:404,book||{error:'Book not found.'});}
    if (req.method==='GET' && url.pathname.startsWith('/api/cover-info/')) {
      const id=url.pathname.split('/').pop(),custom=customCovers.info(id);if(custom)return json(res,200,{version:custom,custom:true});
      const file=await library.content(id);const info=await stat(file);
      return json(res,200,{version:`${info.size}-${info.mtimeMs}`});
    }
    if (req.method==='GET' && url.pathname==='/api/books') return json(res,200,library.list((url.searchParams.get('q')||'').slice(0,300),url.searchParams.get('format')||'',Math.max(0,Number(url.searchParams.get('page'))||0),url.searchParams.get('shelf')||'',url.searchParams.get('sort')||'title',url.searchParams.get('category')||'',url.searchParams.get('letter')||'',url.searchParams.get('descending')==='true',url.searchParams.get('collection')||'',url.searchParams.get('tag')||'',url.searchParams.get('series')||''));
    if(req.method==='GET'&&url.pathname==='/api/text/search')return json(res,200,textIndex.search(url.searchParams.get('q')||''));
    if(req.method==='GET'&&url.pathname==='/api/speech/voices')return json(res,200,await speech.voices());
    if(req.method==='GET'&&url.pathname==='/api/dictionary'){const entries=JSON.parse(library.db.prepare('SELECT value FROM config WHERE key=?').get('dictionary')?.value||'{}'),word=(url.searchParams.get('word')||'').trim().toLowerCase();return json(res,200,{definition:Object.hasOwn(entries,word)?entries[word]:null});}
    if(req.method==='GET'&&url.pathname==='/api/ocr/languages')return json(res,200,await ocr.languages());
    if(req.method==='POST'&&/^\/api\/ocr\/[^/]+\/\d+$/.test(url.pathname)){if(req.headers.origin!==origin||req.headers['content-type']!=='application/octet-stream')return json(res,403,{error:'Local OCR request required.'});const parts=url.pathname.split('/');return json(res,200,await ocr.recognize(parts[3],Number(parts[4]),url.searchParams.get('language')||'',req));}
    if(url.pathname.startsWith('/api/custom-cover/')&&url.pathname!=='/api/custom-cover/remove'){
      const id=url.pathname.split('/').pop();
      if(req.method==='GET'){const bytes=await customCovers.get(id),name=customCovers.info(id);res.setHeader('Content-Type',mime[path.extname(name)]||'image/webp');return res.end(bytes);}
      if(req.method==='POST'){if(req.headers.origin!==origin||req.headers['content-type']!=='application/octet-stream')return json(res,403,{error:'Local cover upload required.'});return json(res,200,await customCovers.save(id,req));}
    }
    if(req.method==='POST'&&url.pathname==='/api/import/file'){
      if(req.headers.origin!==origin||req.headers['content-type']!=='application/octet-stream')return json(res,403,{error:'Local reader upload required.'});
      return json(res,200,await imports.upload(url.searchParams.get('id'),url.searchParams.get('name'),req));
    }
    if(req.method==='GET'&&url.pathname==='/api/collections')return json(res,200,library.collections());
    if (req.method==='POST') {
      if (req.headers.origin!==origin || !req.headers['content-type']?.startsWith('application/json')) return json(res,403,{error:'JSON request from the reader required.'});
      if(url.pathname==='/api/shutdown'){json(res,200,{ok:true});setTimeout(()=>void shutdown(),200);return;}
      if(url.pathname==='/api/text/begin')return json(res,200,textIndex.begin((await body(req)).id));
      if(url.pathname==='/api/text/page'){const data=await body(req);return json(res,200,textIndex.page(data.token,data.page,data.text));}
      if(url.pathname==='/api/text/cancel')return json(res,200,textIndex.cancel((await body(req)).token));
      if(url.pathname==='/api/text/finish')return json(res,200,textIndex.finish((await body(req)).token));
      if(url.pathname==='/api/speech'){const data=await body(req),controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});const wav=await speech.speak(data.text,data.voice,{signal:controller.signal});res.setHeader('Content-Type','audio/wav');return res.end(wav);}
      if(url.pathname==='/api/bulk'){const data=await body(req);return json(res,200,library.bulk(data.ids,data.patch));}
      if(url.pathname==='/api/automatic-backups/create'){await body(req);return json(res,200,await automaticBackups.tick(true)||{skipped:true});}
      if(url.pathname==='/api/duplicates/verify'){await body(req);if(duplicateVerifier.job.running)throw new Error('A duplicate check is already running.');if(library.preferences().incognito||library.job.running)throw new Error('Leave Incognito and wait for the scan to finish.');void duplicateVerifier.run().catch(()=>{duplicateVerifier.job.status='Check failed; try again.';});return json(res,202,{ok:true});}
      if(url.pathname==='/api/duplicates/cancel'){await body(req);duplicateVerifier.cancel();return json(res,200,{ok:true});}
      if(url.pathname==='/api/queue')return json(res,200,changeQueue(library,await body(req)));
      if(url.pathname==='/api/relink/preview'){const data=await body(req);return json(res,200,previewRelink(library,data.missing,data.replacement));}
      if(url.pathname==='/api/relink'){const data=await body(req),plan=previewRelink(library,data.missing,data.replacement);await library.content(data.replacement);if(typeof data.token!=='string'||data.token!==plan.token)throw new Error('Reading data changed or has not been reviewed. Review the transfer again.');const folder=path.join(profile,'backups');await mkdir(folder,{recursive:true});const safetyBackup='before-relink-'+Date.now()+'.json';await writeFile(path.join(folder,safetyBackup),JSON.stringify(library.backup()),{flag:'wx'});if(previewRelink(library,data.missing,data.replacement).token!==data.token)throw new Error('Reading data changed. Review the transfer again.');return json(res,200,{...library.relink(data.missing,data.replacement),safetyBackup});}
      if(url.pathname==='/api/dictionary'){const entries=await body(req);if(!entries||typeof entries!=='object'||Array.isArray(entries)||Object.keys(entries).length>50000)throw new Error('Use a JSON object mapping words to definitions.');const clean=Object.create(null);for(const [word,definition]of Object.entries(entries)){if(!word.trim()||word.length>100||typeof definition!=='string'||definition.length>10000)throw new Error('Dictionary entries require words and text definitions.');clean[word.trim().toLowerCase()]=definition;}library.db.prepare('INSERT OR REPLACE INTO config VALUES(?,?)').run('dictionary',JSON.stringify(clean));return json(res,200,{count:Object.keys(clean).length});}
      if(url.pathname==='/api/custom-cover/remove'){await customCovers.remove((await body(req)).id);return json(res,200,{ok:true});}
      if(url.pathname==='/api/lock/setup'){const data=await body(req);unlockCookie(await appLock.setup(data.password,data.previous));sourceSessions.clear();chapterFeeds.cancel();return json(res,200,{ok:true});}
      if(url.pathname==='/api/lock/now'){appLock.lock(unlocked);sourceSessions.clear();chapterFeeds.cancel();sourceUpdates.cancel();unlockCookie('');return json(res,200,{ok:true});}
      if(url.pathname==='/api/lock/remove'){await appLock.remove((await body(req)).password);return json(res,200,{ok:true});}
      if(url.pathname==='/api/maintenance'){if(library.job.running)throw new Error('Wait for the scan to finish.');const folder=path.join(profile,'backups');await mkdir(folder,{recursive:true});const snapshot=path.join(folder,'before-maintenance-'+Date.now()+'.sqlite');library.db.exec("VACUUM INTO '"+snapshot.replaceAll("'","''")+"'");library.db.exec('REINDEX; PRAGMA optimize;');return json(res,200,{checks:library.db.prepare('PRAGMA integrity_check').all(),snapshot:path.basename(snapshot)});}
      if(url.pathname==='/api/restore/preview'){const plan=prepareRestore(library,await body(req));return json(res,200,{matched:plan.matched,missing:plan.missing});}
      if(url.pathname==='/api/restore'){const data=await body(req);prepareRestore(library,data.backup);const folder=path.join(profile,'backups');await mkdir(folder,{recursive:true});const filename='before-restore-'+Date.now()+'.json';await writeFile(path.join(folder,filename),JSON.stringify(library.backup()),{flag:'wx'});return json(res,200,{...restoreBackup(library,data.backup,{preferences:data.preferences===true}),safetyBackup:filename});}
      if(url.pathname==='/api/import/begin')return json(res,200,await imports.begin());
      if(url.pathname==='/api/desktop-file-binding'){const data=await body(req);return json(res,200,library.desktopFileBinding(data.key,data.bookId));}
      if(url.pathname==='/api/import/finish')return json(res,200,await imports.finish((await body(req)).id));
      if(url.pathname==='/api/import/cancel'){await imports.cancel((await body(req)).id);return json(res,200,{ok:true});}
      if(url.pathname==='/api/collections')return json(res,200,library.saveCollection(await body(req)));
      if(url.pathname==='/api/collections/remove'){library.removeCollection((await body(req)).id);return json(res,200,{ok:true});}
      if(url.pathname==='/api/preferences'){const previous=library.preferences(),next=library.preferences(await body(req));if(!next.networkEnabled||next.incognito||!next.serialRefresh&&chapterFeeds.automatic)chapterFeeds.cancel();if(!next.networkEnabled||next.incognito||!next.sourceSessions||previous.userAgent!==next.userAgent)sourceSessions.clear();if(next.incognito)duplicateVerifier.cancel();libraryWatcher.reconcile();return json(res,200,next);}
      if(url.pathname==='/api/sources/manage'){const data=await body(req);return json(res,200,sources.registry.manage(data.id,data.action,data.settings));}
      if(url.pathname==='/api/chapter-feeds/add')return json(res,200,chapterFeeds.add(await body(req)));
      if(url.pathname==='/api/chapter-feeds/check'){const data=await body(req);return json(res,200,await chapterFeeds.check(data.id));}
      if(url.pathname==='/api/chapter-feeds/download'){const data=await body(req);return json(res,200,await chapterFeeds.download(data.feed,data.chapter));}
      if(url.pathname==='/api/chapter-feeds/read'){const data=await body(req);chapterFeeds.markRead(data.feed,data.chapter,data.read);return json(res,200,{ok:true});}
      if(url.pathname==='/api/chapter-feeds/follow'){const data=await body(req);chapterFeeds.follow(data.id,data.enabled);sourceSessions.reconcile();libraryWatcher.reconcile();void automaticBackups.tick().catch(()=>{});return json(res,200,{ok:true});}
      if(url.pathname==='/api/chapter-feeds/remove'){chapterFeeds.remove((await body(req)).id);sourceSessions.reconcile();libraryWatcher.reconcile();void automaticBackups.tick().catch(()=>{});return json(res,200,{ok:true});}
      if(url.pathname==='/api/chapter-feeds/cancel'){chapterFeeds.cancel();return json(res,200,{ok:true});}
      if(url.pathname==='/api/source-sessions/adopt'){const data=await body(req);return json(res,200,sourceSessions.adopt(data.id,data.cookies,{epoch:data.epoch,userAgent:data.userAgent,browserAgent:data.browserAgent}));}
      if(url.pathname==='/api/source-sessions/clear')return json(res,200,sourceSessions.clear((await body(req)).id));
      if(url.pathname==='/api/source-updates/check'){sourceUpdates.ensureEnabled();if(sourceUpdates.job.running||sourceUpdates.applying)throw new Error('A source operation is already running.');void sourceUpdates.run().catch(error=>{sourceUpdates.job.status=error.message;});return json(res,202,{ok:true});}
      if(url.pathname==='/api/source-updates/compare'){const data=await body(req),compare=sourceUpdates.comparison(data.book,data.source);if(sourceUpdates.job.running||sourceUpdates.applying)throw new Error('A source operation is already running.');void sourceUpdates.run({compare}).catch(error=>{sourceUpdates.job.status=error.message;});return json(res,202,{ok:true});}
      if(url.pathname==='/api/source-updates/cancel'){sourceUpdates.cancel();return json(res,200,{ok:true});}
      if(url.pathname==='/api/source-updates/apply'){const data=await body(req);return json(res,200,await sourceUpdates.apply(data.book,data.source,data.kind));}
      if(url.pathname==='/api/source-updates/dismiss'){const data=await body(req);sourceUpdates.dismiss(data.book,data.source);return json(res,200,{ok:true});}
      if(url.pathname==='/api/source-updates/follow'){const data=await body(req);sourceUpdates.follow(data.book,data.source,data.enabled);return json(res,200,{ok:true});}
      if(url.pathname==='/api/sources/search'){const data=await body(req);return json(res,200,await sources.search(data.query,{offline:data.offline===true,source:data.source,page:data.page,refresh:data.refresh===true}));}
      if(url.pathname==='/api/sources/download'){const data=await body(req);return json(res,200,await sources.download(data.query,data.id,{source:data.source,token:data.token}));}
      if(url.pathname==='/api/sources/apply-metadata'){const data=await body(req);return json(res,200,sources.applyMetadata(data.bookId,data.query,data.id,{source:data.source,token:data.token}));}
      if(url.pathname==='/api/network/refresh'){const data=await body(req);return json(res,200,await network.refresh(data.repository));}
      if(url.pathname==='/api/network/download'){const data=await body(req);return json(res,200,await network.download(data.repository,data.id));}
      if(url.pathname==='/api/network/remove'){const data=await body(req);return json(res,200,await network.remove(data.id));}
      if(url.pathname==='/api/network/metadata'){const data=await body(req);return json(res,200,await network.metadata(data.query));}
      if(url.pathname==='/api/network/apply-metadata'){const data=await body(req);return json(res,200,network.applyMetadata(data.bookId,data.query,data.key));}
      if(url.pathname==='/api/integrity')return json(res,200,library.db.prepare('PRAGMA integrity_check').all());
      if (url.pathname==='/api/config') { const data=await body(req);if(chapterFeeds.job.running)throw new Error('Cancel the chapter operation before changing the library.');await library.configure(data.root);duplicateVerifier.cancel();libraryWatcher.reconcile();sourceSessions.clear();return json(res,200,{ok:true}); }
      if (url.pathname==='/api/scan') { if(!library.root()) throw new Error('Configure a folder first.'); const options=await body(req);if('full'in options&&typeof options.full!=='boolean')throw new Error('Invalid scan mode.');void library.scan({full:options.full===true}); return json(res,202,{ok:true}); }
      if (url.pathname==='/api/cancel') {library.cancel(); return json(res,200,{ok:true});}
      if (url.pathname.startsWith('/api/state/')) {library.save(url.pathname.split('/').pop(),await body(req)); return json(res,200,{ok:true});}
      if(url.pathname.startsWith('/api/annotation/'))return json(res,200,changeAnnotation(library,url.pathname.split('/').pop(),await body(req)));
      if (url.pathname.startsWith('/api/details/')) {library.details(url.pathname.split('/').pop(),await body(req));return json(res,200,{ok:true});}
    }
    const match=url.pathname.match(/^\/content\/([a-f0-9-]+)\/(\d+)$/);
    if (match && (req.method==='GET'||req.method==='HEAD')) {
      const book=library.book(match[1]);
      const file=await library.content(match[1],Number(match[2]));
      const info=await stat(file); let start=0,end=info.size-1,status=200;
      if(req.headers.range) {
        const range=req.headers.range.match(/^bytes=(\d*)-(\d*)$/);
        if(!range || (!range[1]&&!range[2])) {res.writeHead(416,{'Content-Range':`bytes */${info.size}`}); return res.end();}
        start=range[1]?Number(range[1]):Math.max(0,info.size-Number(range[2]));
        end=range[1]&&range[2]?Math.min(Number(range[2]),end):end;
        if(start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});return res.end();}
        status=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${info.size}`);
      }
      if(['epub','cbz'].includes(book.format))res.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(path.basename(book.source)));
      res.writeHead(status,{'Content-Type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','Content-Length':Math.max(0,end-start+1),'Accept-Ranges':'bytes'});
      if(req.method==='HEAD'||info.size===0)return res.end();
      const stream=createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());return stream.pipe(res);
    }
    json(res,404,{error:'Not found.'});
  } catch(error) { if(!res.headersSent) json(res,400,{error:error.code?'File or folder could not be accessed.':error.message});else res.destroy(); }
});
let port=process.env.PORT==='0'?0:Number(process.env.PORT)||4317;
for (;;) {
  try {await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});break;}
  catch(error){if(error.code!=='EADDRINUSE'||port>=4417)throw error;port++;}
}
port=server.address().port;origin=`http://127.0.0.1:${port}`;
const readyFile=runtimeFile+'.ready-'+process.pid;await writeFile(readyFile,JSON.stringify({pid:process.pid,started:Date.now(),origin,instance}),{flag:'wx'});await rename(readyFile,runtimeFile);
process.send?.({type:'folio:ready',origin,instance});
console.log(`Local Ebook Reader: ${origin}\nPress Ctrl+C to stop.`);
if(process.argv.includes('--open')) {
  const child=process.platform==='win32'?spawn('rundll32',['url.dll,FileProtocolHandler',origin],{stdio:'ignore',windowsHide:true}):spawn(process.platform==='darwin'?'open':'xdg-open',[origin],{stdio:'ignore'});
  child.on('error',()=>console.log('Open the address above in your browser.'));
}
libraryWatcher.reconcile();
let lastAutoScan=Date.now();const backgroundRefresh=setInterval(()=>{const prefs=library.preferences();sourceSessions.reconcile();libraryWatcher.reconcile();void automaticBackups.tick().catch(()=>{});if(prefs.autoRefresh&&!library.job.running&&library.root()&&Date.now()-lastAutoScan>=prefs.refreshMinutes*60000){lastAutoScan=Date.now();void library.scan().catch(()=>{});}void sourceUpdates.tick().catch(error=>{sourceUpdates.job.status=error.message;});void chapterFeeds.tick().catch(error=>{chapterFeeds.job.status=error.message;});},15000);backgroundRefresh.unref();
let stopping=false;
async function shutdown(){if(stopping)return;stopping=true;clearInterval(backgroundRefresh);libraryWatcher.close();speech.cancel();duplicateVerifier.cancel();library.cancel();sourceUpdates.cancel();chapterFeeds.cancel();sourceSessions.clear();server.close();while(speech.controllers.size||duplicateVerifier.job.running||automaticBackups.running||library.job.running||sourceUpdates.job.running||sourceUpdates.applying||chapterFeeds.job.running)await new Promise(r=>setTimeout(r,20));library.close();await rm(runtimeFile,{force:true});process.exit(0);}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
process.on('message',message=>{if(message?.type==='folio:shutdown'&&message.instance===instance)void shutdown();});
if(process.send)process.on('disconnect',()=>void shutdown());
