import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Library} from '../lib/library.mjs';
import {Imports} from '../lib/imports.mjs';
import {NetworkServices} from '../lib/network.mjs';
import {NativeSources} from '../lib/native-sources.mjs';
import {ChapterFeeds} from '../lib/chapter-feeds.mjs';
import {verifyBuild} from '../lib/distribution.mjs';
const workspace=fileURLToPath(new URL('../',import.meta.url)),version=JSON.parse(await readFile(path.join(workspace,'package.json'))).version,desktop=path.resolve(process.argv[2]||path.join(workspace,'.local/dist',`Folio-${version}-desktop-win32-x64`));
await verifyBuild(desktop,{version,kind:'desktop-portable'});
// Deliberately use a fresh generated profile. The product's smoke mode creates an
// unloaded, hidden source window and a synthetic cookie; no source page is visited.
const output=path.join(workspace,'.local/source-session-tests',randomUUID()),profile=path.join(output,'profile'),books=path.join(output,'books');await mkdir(profile,{recursive:true});await mkdir(books);
const library=new Library(path.join(profile,'library.sqlite'));await library.configure(books);const sources=new NativeSources(new NetworkServices(library,profile),new Imports(library,profile));sources.registry.manage('chapterfeed','add');const feeds=new ChapterFeeds(sources),feed=feeds.add({title:'Generated source-session fixture',url:'https://example.com/'});library.preferences({networkEnabled:true,sourceSessions:true});library.close();
const report=path.join(output,'report.json'),result=spawnSync(path.join(desktop,'Folio.exe'),[],{cwd:desktop,windowsHide:true,timeout:30000,encoding:'utf8',env:{...process.env,EBOOK_PROFILE:profile,FOLIO_DESKTOP_SMOKE_REPORT:report,FOLIO_DESKTOP_SMOKE_SOURCE_ID:'feed:'+feed.id}});await writeFile(path.join(output,'native.log'),String(result.stdout||'')+'\n'+String(result.stderr||''));
if(result.error||result.status!==0)throw new Error('Native source session self-check failed. Evidence: '+output);
const checked=JSON.parse(await readFile(report)),session=checked.sourceSession;if(checked.error||!checked.serverReleased||!session?.sandbox||!session.contextIsolation||session.nodeIntegration||!session.noPreload||!session.cookiesAdopted||!session.cleared)throw new Error('Native source session boundaries did not pass. Evidence: '+output);console.log(JSON.stringify({report,sourceSession:session,serverReleased:checked.serverReleased},null,2));
