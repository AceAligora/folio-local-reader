import {shortcutDefaults,shortcutKeys} from './shortcuts.js';
import {mountChapterFeeds,mountSourceSessions} from './serial-ui.js';
import {mountSourceUpdates} from './source-update-ui.js';
import {mountTextSearch} from './text-library.js';
import {initializeLibraryTools,mountLibraryHealth} from './library-tools.js';
import {mountSecurity} from './security-ui.js';
import {mountRestore} from './backup-ui.js';
import {mountNotebook} from './notebook.js';
import { initializeActions } from './actions.js';
import { mountNetwork } from './network-ui.js';
import {clearCoverCache,observeCover} from './covers.js';
const $=id=>document.getElementById(id);
export let preferences={resume:true};
let reloadBooks,openBook,activeTab='library',settingsPage=sessionStorage.getItem('folio-settings-page')||'';
const tabs=['library','updates','history','settings'];
const labels={library:'Library',updates:'Updates',browse:'Browse',history:'History',settings:'Settings'};
async function request(path,data){const res=await fetch('/api/'+path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const body=await res.json();if(!res.ok)throw new Error(body.error);return body;}
function e(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;}
// Decorative, locally drawn icons inherit each menu's theme and selected color.
const menuPaths={
  library:'M4 4h4v16H4z M10 4h4v16h-4z M16 5l4-1 3 15-4 1z',
  'add-items':'M14 3H5v18h14V8z M14 3v5h5 M8 14h8 M12 10v8',
  'add-collection':'M3 7V5h7l2 2h9v13H3z M8 13h8 M12 9v8',
  updates:'M20 9a8 8 0 0 0-14-3L3 9 M3 4v5h5 M4 15a8 8 0 0 0 14 3l3-3 M16 15h5v5',
  history:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2',
  settings:'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
  general:'M4 6h9 M17 6h3 M4 12h3 M11 12h9 M4 18h9 M17 18h3 M13 3v6 M7 9v6 M13 15v6',
  appearance:'M12 3a9 9 0 0 0 0 18h1a2 2 0 0 0 1-4c-1-1 0-3 2-3h2c5 0 3-11-6-11 M7 10h.01 M10 6h.01 M15 7h.01 M6 14h.01',
  reader:'M12 6c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1z M12 6v15',
  browse:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M16 8l-2 6-6 2 2-6z',
  storage:'M3 4h18v5H3z M5 9v12h14V9 M9 13h6',
  security:'M12 3l8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6z M8 12l3 3 5-6',
  insights:'M4 3v17h17 M8 16v-5 M13 16V6 M18 16V9',
  notebook:'M5 3h15v18H5z M3 7h4 M3 12h4 M3 17h4 M10 8h6 M10 12h6 M10 16h4',
  'chapter-feeds':'M4 4h16v16H4z M8 8h8 M8 12h8 M8 16h4',
  'source-sessions':'M12 3a7 7 0 0 0-7 7v4h14v-4a7 7 0 0 0-7-7 M8 14v7h8v-7 M12 17v1',
  'source-updates':'M4 14a5 5 0 0 1 2-9 6 6 0 0 1 11 2 4 4 0 0 1 3 7 M8 16l4-4 4 4 M12 12v9',
  health:'M3 4h18v16H3z M3 12h5l2-4 4 8 2-4h5',
  text:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6 M7 7h6 M7 10h6 M7 13h3'
};
function menuIcon(name){const ns='http://www.w3.org/2000/svg',icon=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');icon.setAttribute('class','menu-icon');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');icon.setAttribute('focusable','false');path.setAttribute('d',menuPaths[name]);icon.append(path);return icon;}
function initializeMenuIcons(){for(const control of document.querySelectorAll('#main-tabs > button')){const name=control.dataset.tab||control.id;if(menuPaths[name]&&!control.querySelector('.menu-icon'))control.prepend(menuIcon(name));}}
// Mobile navigation is a modal sheet; its hidden links cannot receive focus.
function initializeShell(){
  const folded=matchMedia('(max-width:1000px)'),sidebar=$('app-sidebar'),main=$('main-content');
  const setMenu=(open,restoreFocus=true)=>{
    const visible=folded.matches&&open;document.body.classList.toggle('nav-open',visible);
    $('open-menu').setAttribute('aria-expanded',String(visible));$('nav-scrim').hidden=!visible;
    sidebar.inert=folded.matches&&!visible;main.inert=visible;
    if(visible){sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-modal','true');$('close-menu').focus();}
    else{sidebar.removeAttribute('role');sidebar.removeAttribute('aria-modal');if(restoreFocus&&folded.matches)$('open-menu').focus();}
  };
  $('open-menu').onclick=()=>setMenu(true);$('close-menu').onclick=$('nav-scrim').onclick=()=>setMenu(false);
  $('main-tabs').addEventListener('click',event=>{if(event.target.closest('button')&&folded.matches)setMenu(false);},true);
  folded.addEventListener('change',()=>setMenu(false,false));setMenu(false,false);
  sidebar.addEventListener('keydown',event=>{
    if(!document.body.classList.contains('nav-open'))return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setMenu(false);}
    if(event.key==='Tab'){const controls=[...sidebar.querySelectorAll('a,button')].filter(node=>!node.hidden&&node.getClientRects().length),first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
  });
  const disclosures=[...document.querySelectorAll('.reader-options')];
  for(const item of disclosures)item.addEventListener('toggle',()=>{if(item.open)for(const other of disclosures)if(other!==item)other.open=false;});
  document.addEventListener('pointerdown',event=>{for(const item of disclosures)if(item.open&&!item.contains(event.target))item.open=false;});
  $('reader').addEventListener('keydown',event=>{if(event.key==='Escape'&&disclosures.some(item=>item.open)){event.preventDefault();event.stopPropagation();for(const item of disclosures)if(item.open){item.open=false;item.querySelector('summary').focus();}}},true);
  $('reader').addEventListener('close',()=>{for(const item of disclosures)item.open=false;});
}
// Keep existing setting handlers while giving long reader preferences a hierarchy.
function groupReaderSettings(reader){
  reader.querySelector('h2').textContent='Reading defaults';
  const definitions=[
    ['Reading behavior',['resume','wheelNavigation','keepAwake','autoWebtoon','showProgress','scrollIndicator']],
    ['Page layout',['readingMode','pageLayout','separateFirst','invertSpread','background','padding','cropBorders']],
    ['Typography',['epubFont','epubSize','epubLineHeight','epubWidth']],
    ['Navigation & gestures',['zoneStyle','invertZones','tapZones','doubleTap','limitZoom','animate','holdScroll','autoScrollSpeed']],
    ['Keyboard shortcuts',['readerShortcuts','shortcutNext','shortcutPrevious','shortcutFocus','shortcutBookmark','shortcutContents']],
    ['Toolbar',['toolbar']]
  ];
  const originals=[...reader.children],groups=definitions.map(([title],index)=>{const details=e('details',undefined,'settings-group'),body=e('div');details.append(e('summary',title),body);details.open=index===0;reader.append(details);return body;});
  let extraGroup=0;
  for(const node of originals){
    if(node.tagName==='H2')continue;
    const key=node.querySelector('[data-pref]')?.dataset.pref;
    if(key){const index=definitions.findIndex(([,keys])=>keys.includes(key));groups[index<0?0:index].append(node);continue;}
    if(node.tagName==='H3')extraGroup=node.textContent==='Keyboard shortcuts'?4:5;
    if(node.classList.contains('toolbar-editor')||node.textContent==='Save toolbar arrangement')extraGroup=5;
    if(node.textContent==='Reset reader shortcuts')extraGroup=4;
    groups[extraGroup].append(node);
  }
}
function safe(fn){return async()=>{try{await fn();}catch(error){$('message').textContent=error.message;}};}
let appReaderDefaults=null,readerOverrides=null;
export function bookPreferences(patch){if(!appReaderDefaults)appReaderDefaults={...preferences};readerOverrides={...patch};preferences={...appReaderDefaults,...readerOverrides};apply();}
export function clearBookPreferences(){if(appReaderDefaults){preferences=appReaderDefaults;appReaderDefaults=null;readerOverrides=null;apply();}}
export async function savePreferences(patch){const saved=await request('preferences',patch);if(appReaderDefaults){appReaderDefaults=saved;preferences={...saved,...readerOverrides};}else preferences=saved;apply();document.dispatchEvent(new CustomEvent('folio-preferences'));return preferences;}
export function date(value){if(!value)return 'Not yet';const d=new Date(value);const pad=n=>String(n).padStart(2,'0');switch(preferences.dateFormat){case 'yyyy-MM-dd':return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;case 'MM/dd/yy':return `${pad(d.getMonth()+1)}/${pad(d.getDate())}/${String(d.getFullYear()).slice(2)}`;case 'dd/MM/yy':return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${String(d.getFullYear()).slice(2)}`;case 'yMd':return d.toLocaleDateString('en-US');case 'MMM dd, yyyy':return d.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'2-digit'});case 'dd MMM yyyy':return `${pad(d.getDate())} ${d.toLocaleString('en',{month:'short'})} ${d.getFullYear()}`;default:return d.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'});}} // taste-skill-ignore: two-digit calendar dates, never decorative numbering.
const toolbarHomes=new Map();
function apply(){
  const custom=$('custom-toolbar');for(const id of ['toggle-navigation','bookmark','back-page','next-page','autoscroll','rotate','fullscreen','share-book','book-details','open-original','highlight-selection']){const control=$(id);if(!toolbarHomes.has(id)){const marker=document.createComment(id);control.before(marker);toolbarHomes.set(id,marker);}if(preferences.toolbar==='custom'&&preferences.toolbarItems.includes(id))custom.append(control);else{const marker=toolbarHomes.get(id);marker.after(control);control.hidden=preferences.toolbar==='custom';}}custom.hidden=preferences.toolbar!=='custom';document.querySelector('.brand img').src='/icons/'+preferences.appIcon+'.svg';$('app-icon').href='/icons/'+preferences.appIcon+'.svg';
  for(const id of preferences.toolbarItems||[])if(preferences.toolbar==='custom'&&$(id))$(id).hidden=false;
  document.dispatchEvent(new CustomEvent('folio-cover-policy',{detail:preferences.refreshCovers}));
  const zoom=$('zoom'),selectedZoom=zoom.value;zoom.replaceChildren(...[['fit','Fit page'],...(!preferences.limitZoom?[['0.25','25%'],['0.5','50%']]:[]),['0.75','75%'],['1','100%'],['1.5','150%'],['2','200%'],...(!preferences.limitZoom?[['3','300%'],['4','400%']]:[])].map(([value,label])=>new Option(label,value)));zoom.value=[...zoom.options].some(option=>option.value===selectedZoom)?selectedZoom:'fit';
  document.documentElement.dataset.theme=preferences.theme;
  document.body.classList.toggle('glass',preferences.glass);document.body.classList.toggle('compact-reader',preferences.toolbar==='compact');
  $('display-mode').value=preferences.display;$('books').classList.toggle('list',preferences.display!=='grid');$('books').classList.toggle('descriptive',preferences.display==='descriptive');
  $('books').style.gridTemplateColumns=`repeat(${preferences.columns},minmax(0,1fr))`;
  $('reader-body').style.padding=`20px ${preferences.padding}px`;
  $('reader-body').style.background=preferences.background==='black'?'#080b09':preferences.background==='white'?'#fff':'';
  $('reader').classList.toggle('hide-progress',!preferences.showProgress);
  document.documentElement.style.setProperty('--glass-blend',preferences.blend+'%');
  for(const button of document.querySelectorAll('[data-tab]'))button.hidden=!preferences.tabs.includes(button.dataset.tab);
  for(const input of document.querySelectorAll('[data-pref]')){if(document.activeElement===input)continue;const value=preferences[input.dataset.pref];if(input.type==='checkbox')input.checked=value;else input.value=value;}
  const selected=$('category-filter').value;$('category-filter').replaceChildren(new Option('All categories',''),...preferences.categories.map(c=>new Option(c,c)));$('category-filter').value=selected;
}
function field(parent,label,key,choices){const row=e('label',undefined,'setting-row');row.append(e('span',label));let input;if(choices){input=e('select');for(const [value,text]of choices)input.add(new Option(text,value));input.value=preferences[key];}else{input=e('input');input.type=typeof preferences[key]==='boolean'?'checkbox':'number';if(input.type==='checkbox')input.checked=preferences[key];else input.value=preferences[key];}input.dataset.pref=key;input.onchange=safe(async()=>{await savePreferences({[key]:input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value});});row.append(input);parent.append(row);return input;}
function section(parent,title,description){const block=e('section',undefined,'settings-card');block.append(e('h2',title));if(description)block.append(e('p',description,'muted'));parent.append(block);return block;}
function button(parent,label,fn){const b=e('button',label);b.onclick=safe(fn);parent.append(b);return b;}
function download(name,body){const url=URL.createObjectURL(new Blob([JSON.stringify(body,null,2)],{type:'application/json'}));const a=e('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function pending(parent,text){const p=e('p','Not available yet: '+text,'pending');parent.append(p);}
async function show(tab){
  if(tab==='browse'){settingsPage='browse';tab='settings';}
  $('browse-panel').hidden=true;
  if(!tabs.includes(tab))tab='library';
  if(preferences.keepScroll)sessionStorage.setItem('folio-scroll-'+activeTab,String(window.scrollY));activeTab=tab;
  for(const name of tabs)$(name+'-panel').hidden=name!==tab;
  for(const b of document.querySelectorAll('[data-tab]')){b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false');}
  document.body.dataset.page=tab;$('page-heading').textContent=labels[tab];$('scan').hidden=!['library','updates'].includes(tab);$('status').hidden=!['library','updates'].includes(tab);$('summary').textContent={library:'Your books, right where you left them.',updates:'Changes in your local collection.',history:'Pick up where you left off.',settings:'Preferences for a quieter reading space.'}[tab];
  if(preferences.lastTab!==tab)await savePreferences({lastTab:tab});
  if(tab==='settings')await settings();if(tab==='updates')await updates();if(tab==='history')await history();
  window.scrollTo(0,preferences.keepScroll?Number(sessionStorage.getItem('folio-scroll-'+tab)||0):0);
}
async function updates(){const panel=$('updates-panel');panel.replaceChildren();await mountSourceUpdates(panel,{preferences,savePreferences,openBook});await mountChapterFeeds(panel,{preferences,savePreferences,openBook,settings:false});const local=section(panel,'Local updates','Scans detect added books, changed files and changed image collections.');const data=await request('updates');if(!data.length)local.append(e('p','No local changes recorded yet.'));for(const item of data){const row=e('article',undefined,'activity-row');row.append(e('strong',item.title),e('p',`${item.kind} · ${date(item.created)}`));local.append(row);}}
async function history(){
  const panel=$('history-panel');panel.replaceChildren();const result=await request('books?shelf=continue&sort=lastRead');
  for(const book of result.books){
    const title=book.state.metadata?.title||book.title,b=e('button',undefined,'history-row'),cover=e('span',undefined,'insight-cover'),info=e('span',undefined,'activity-info');
    if(book.available)observeCover(cover,book);info.append(e('strong',title),e('span',`${book.format==='epub'?'Chapter':'Page'} ${(book.state.page||0)+1} · ${date(book.state.updated)}`));b.append(cover,info,e('span','Continue →','history-action'));b.title=title;b.disabled=!book.available;b.onclick=()=>openBook(book);panel.append(b);
  }
  if(!result.total)panel.append(e('p','Your reading history will appear here after you open a book.','empty'));
  if(result.total>60)panel.append(e('p','Showing the latest 60 books.','muted'));
}
async function browse(destination){await mountNetwork(destination||$('browse-panel'),{preferences,savePreferences,openLocal:()=>show('library')});}
function displayControls(parent){field(parent,'Display mode','display',[['grid','Grid'],['list','List'],['descriptive','Descriptive list']]);const count=field(parent,'Items per row (1–10)','columns');count.min=1;count.max=10;const controls=e('div',undefined,'row');button(controls,'−',()=>savePreferences({columns:Math.max(1,preferences.columns-1)}));button(controls,'+',()=>savePreferences({columns:Math.min(10,preferences.columns+1)}));parent.append(controls);for(const badge of ['unread','downloaded','completed']){const row=e('label',undefined,'setting-row');row.append(e('span',badge[0].toUpperCase()+badge.slice(1)+' badge'));const input=e('input');input.type='checkbox';input.checked=preferences.badges.includes(badge);input.onchange=safe(async()=>{await savePreferences({badges:input.checked?[...new Set([...preferences.badges,badge])]:preferences.badges.filter(b=>b!==badge)});await reloadBooks();});row.append(input);parent.append(row);}}
async function settings(){
  const host=$('settings-panel');host.replaceChildren();
  const pages=[['general','General','Language, navigation and startup'],['appearance','Appearance','Theme, colors and date format'],['library','Library','Display, categories and local updates'],['reader','Reader','Resume, layouts and reading controls'],['browse','Sources & extensions','Local source, repositories and migration'],['storage','Storage & advanced','Cache, backups and database health'],['security','Security','Incognito and privacy screen'],['insights','Reading insights','Your reading time, book by book'],['notebook','Reading notebook','Search and export your local notes'],['chapter-feeds','Chapter feeds','Serialized chapters and offline copies'],['source-sessions','Source sessions','Temporary sign-in and challenge cookies'],['source-updates','Source updates','Optional checks, review and refresh policies'],['health','Library health','Duplicates and missing-book relinking'],['text','Search book text','Local full-text indexing and search']];
  if(!pages.some(p=>p[0]===settingsPage))settingsPage='';
  const selectedPage=pages.find(p=>p[0]===settingsPage);$('page-heading').textContent=selectedPage?.[1]||'Settings';$('summary').textContent=selectedPage?.[2]||'Make this space work for the way you read.';
  const pageNav=e('div',undefined,'settings-breadcrumb');button(pageNav,'← All settings',async()=>{settingsPage='';sessionStorage.removeItem('folio-settings-page');await settings();window.scrollTo(0,0);});if(settingsPage)pageNav.append(e('span',' / '+pages.find(p=>p[0]===settingsPage)[1]));if(settingsPage)host.append(pageNav);
  const openPage=async id=>{settingsPage=id;sessionStorage.setItem('folio-settings-page',id);await settings();window.scrollTo(0,0);};
  if(!settingsPage){
    const grid=e('div',undefined,'settings-index');
    for(const [title,ids]of [['Reading experience',['general','appearance','reader']],['Library & organization',['library','notebook','text','insights']],['Optional online sources',['browse','chapter-feeds','source-updates','source-sessions']],['Device & maintenance',['storage','security','health']]]){
      const group=e('section',undefined,'settings-index-group');group.append(e('h2',title));
      for(const id of ids){const [,name,description]=pages.find(page=>page[0]===id),card=e('button',undefined,'settings-link');card.append(menuIcon(id),e('strong',name),e('span',description));card.onclick=safe(()=>openPage(id));group.append(card);}grid.append(group);
    }
    host.append(grid);return;
  }
  const switcher=e('label','Settings section','settings-section-select'),select=e('select');select.setAttribute('aria-label','Settings section');for(const [id,title]of pages)select.add(new Option(title,id));select.value=settingsPage;select.onchange=safe(()=>openPage(select.value));switcher.append(select);host.append(switcher);
  const layout=e('div',undefined,'settings-layout'),nav=e('nav',undefined,'settings-navigation'),panel=e('div',undefined,'settings-content');nav.setAttribute('aria-label','Settings sections');for(const [id,title]of pages){const b=button(nav,title,()=>openPage(id));b.prepend(menuIcon(id));b.classList.toggle('selected',id===settingsPage);b.setAttribute('aria-current',id===settingsPage?'page':'false');}layout.append(nav,panel);host.append(layout);
  if(settingsPage==='chapter-feeds'){await mountChapterFeeds(panel,{preferences,savePreferences,openBook});return;}
  if(settingsPage==='source-sessions'){await mountSourceSessions(panel,{preferences,savePreferences});return;}
  if(settingsPage==='source-updates'){await mountSourceUpdates(panel,{preferences,savePreferences,openBook,settings:true});return;}
  if(settingsPage==='text'){mountTextSearch(panel,{openBook});return;}
  if(settingsPage==='health'){await mountLibraryHealth(panel);return;}
  if(settingsPage==='notebook'){await mountNotebook(panel,{openBook});return;}
  if(settingsPage==='browse'){await browse(panel);return;}

  const general=section(panel,'General');general.append(e('p','App language: English'));
  field(general,'Default tab','defaultTab',[['last','Last opened tab (default)'],...tabs.map(t=>[t,labels[t]])]);
  for(const tab of tabs){const row=e('label',undefined,'setting-row');row.append(e('span','Show '+labels[tab]));const checkbox=e('input');checkbox.type='checkbox';checkbox.checked=preferences.tabs.includes(tab);checkbox.disabled=tab==='settings';checkbox.onchange=safe(()=>savePreferences({tabs:checkbox.checked?[...new Set([...preferences.tabs,tab])]:preferences.tabs.filter(t=>t!==tab)}));row.append(checkbox);general.append(row);}
  button(general,'Stop Folio server',async()=>{await request('shutdown',{});document.dispatchEvent(new Event('folio-shutdown'));const screen=e('div',undefined,'shutdown-screen');screen.append(e('h1','Folio has stopped'),e('p','You can close this tab. Use Start Reader.cmd or the portable launcher to read again.'));document.body.append(screen);});
  field(general,'Keep tab filter and sort state','keepTabState');field(general,'Keep library scroll position','keepScroll');
  const storage=section(panel,'Storage & advanced','Clear Cache removes generated PDF cover thumbnails only. Books, database, preferences, bookmarks and reading history are preserved.');
  button(storage,'Clear cache',async()=>{await clearCoverCache();location.reload();});
  const fullBackup=e('a','Export full profile archive');fullBackup.href='/api/profile-backup';fullBackup.download='folio-full-profile.zip';storage.append(fullBackup,e('p','The full archive includes the database, custom covers, cached extension packages, dictionary and app-lock configuration. Keep it private. Restore it with the offline restore tool while Folio is stopped; reading-data JSON can be restored below while the app runs.'));
  field(storage,'Automatic reading-data backups','automaticBackups');const backupHours=field(storage,'Hours between backups','backupHours');backupHours.min=1;backupHours.max=168;const backupKeep=field(storage,'Backups to keep','backupKeep');backupKeep.min=2;backupKeep.max=30;
  button(storage,'Create recovery backup now',async()=>{const result=await request('automatic-backups/create',{});$('message').textContent=result.name?'Recovery backup saved.':'No backup created: open a populated library and leave Incognito first.';});
  button(storage,'Export backup',async()=>download('folio-backup.json',await request('backup')));
  button(storage,'Check database integrity',async()=>{const result=await request('integrity',{});$('message').textContent=JSON.stringify(result);});
  storage.append(e('p','Local source: your configured ebook folder. Essential data is never included in cache deletion. Backup export contains reading data; keep it private.'));
  const restore=section(panel,'Restore reading data','Choose an exported Folio backup. Matched relative paths restore into the currently configured library.');if(settingsPage==='storage')mountRestore(restore);
  button(storage,'Maintain database with safety snapshot',async()=>{const result=await request('maintenance',{});$('message').textContent='Database checked and indexes rebuilt. Snapshot: '+result.snapshot;});
  field(storage,'Enable local diagnostics','enableLog');field(storage,'Record sanitized HTTP request summaries','httpDump');
  for(const [kind,label]of [['log','Log'],['http','HTTP summaries']]){button(storage,'Export '+label,async()=>download('folio-'+kind+'.json',await request('diagnostics?kind='+kind)));button(storage,'View '+label,async()=>{const records=await request('diagnostics?kind='+kind),pre=e('pre',records.map(r=>new Date(r.created).toISOString()+' '+r.method+' '+r.route+' '+r.status+' '+r.duration+'ms').join('\n')||'No records.');storage.querySelector('pre')?.remove();storage.append(pre);});}
  storage.append(e('p','Diagnostics contain route templates, status and duration only. No cookies, headers, request bodies, search terms or book text are recorded. Incognito disables recording. Maintenance rebuilds indexes; restore a known-good backup if the database is corrupt.'));
  const timeout=field(storage,'Network timeout in seconds','receiveTimeout');timeout.min=5;timeout.max=180;const agent=e('label','Source User Agent'),agentInput=e('input');agentInput.value=preferences.userAgent;agentInput.maxLength=80;agentInput.onchange=safe(()=>savePreferences({userAgent:agentInput.value}));agent.append(agentInput);storage.append(agent);
  const appearance=section(panel,'Appearance');field(appearance,'App theme','theme',[['system','Same as system'],['light','Light'],['dark','Dark'],['sepia','Sepia']]);field(appearance,'Blend sidebar surfaces','glass');const blend=field(appearance,'Color blend level (0–100)','blend');blend.min=0;blend.max=100;field(appearance,'Date format','dateFormat',['yMMMd','yMd','MM/dd/yy','dd/MM/yy','yyyy-MM-dd','dd MMM yyyy','MMM dd, yyyy'].map(v=>[v,v]));field(appearance,'App icon (browser and library)','appIcon',[['journal-bookmark','Journal'],['collection','Collection'],['bookmark-fill','Bookmark']]);
  const library=section(panel,'Library');displayControls(library);field(library,'Show category item counts','showCounts');
  const categories=e('input');categories.setAttribute('aria-label','Categories, separated by commas');categories.value=preferences.categories.join(', ');library.append(categories);button(library,'Save categories',async()=>{await savePreferences({categories:[...new Set(categories.value.split(',').map(v=>v.trim()).filter(Boolean))]});await settings();});field(library,'Default category','defaultCategory',[['ask','Always ask'],...preferences.categories.map(c=>[c,c])]);
  field(library,'Refresh covers after source changes','refreshCovers');const exclusions=e('div');exclusions.append(e('h3','Exclude categories from update notifications'));for(const category of preferences.categories){const row=e('label',category,'setting-row'),check=e('input');check.type='checkbox';check.checked=preferences.excludedUpdateCategories.includes(category);check.onchange=safe(()=>savePreferences({excludedUpdateCategories:check.checked?[...new Set([...preferences.excludedUpdateCategories,category])]:preferences.excludedUpdateCategories.filter(c=>c!==category)}));row.append(check);exclusions.append(row);}library.append(exclusions);
  field(library,'Refresh local library automatically','autoRefresh');const minutes=field(library,'Refresh interval in minutes','refreshMinutes');minutes.min=1;minutes.max=1440;
  library.append(e('h3','Folders & scanning'));field(library,'Watch local folders for changes','watchLibrary');if(settingsPage==='library'){const status=await request('status');const watcherStatus=e('p','Folder watching: '+(status.watcher||'Restart Folio to activate folder watching.'));watcherStatus.id='folder-watch-status';watcherStatus.setAttribute('role','status');library.append(watcherStatus);}library.append(e('p','Folder watching groups changes into a scan. It pauses in Incognito; manual scans and periodic refresh remain available.'));field(library,'Reuse unchanged folder listings','incrementalScan');field(library,'Create collections from folders automatically','folderCollections');
  const folderLabel=e('label','Excluded folders (one relative path per line)','folder-exclusions'),folderInput=e('textarea');folderInput.rows=4;folderInput.placeholder='Drafts\nComics/Extras';folderInput.value=preferences.excludedFolders.join('\n');folderLabel.append(folderInput);library.append(folderLabel,e('p','Paths start inside your library folder and include their subfolders. Excluded books are hidden from the library and skipped by scans; files and saved reading data are kept. Folder collections update automatically and cannot be edited.'));
  button(library,'Save folder exclusions',async()=>{await savePreferences({excludedFolders:folderInput.value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean)});await reloadBooks();$('message').textContent='Folder exclusions saved. Existing books and reading data are preserved.';});
  button(library,'Run full library scan',async()=>{await request('scan',{full:true});$('message').textContent='Full scan started, without reusing folder listings.';});
  library.append(e('p','Automatic local refresh runs in the server even when this tab is closed. The server must remain running. Local covers refresh when file size/modified time changes. Remote EPUBs are complete editions, not live chapter feeds.'));
  const reader=section(panel,'Reader');field(reader,'Enable reader keyboard shortcuts','readerShortcuts');reader.append(e('h3','Keyboard shortcuts'),e('p','Choose different keys for each action. Ctrl, Alt, Shift and typing in form fields retain their normal behavior. Escape exits focus reading; a second Escape closes the reader.'));for(const [key,label]of [['shortcutNext','Next page'],['shortcutPrevious','Previous page'],['shortcutFocus','Toggle focus reading'],['shortcutBookmark','Bookmark this page'],['shortcutContents','Contents and search']]){const input=field(reader,label+' key',key,shortcutKeys.map(value=>[value,value===' '?'Space':value]));const save=input.onchange;input.onchange=async()=>{await save();input.value=preferences[key];};}button(reader,'Reset reader shortcuts',async()=>{await savePreferences(shortcutDefaults);});field(reader,'Resume at last position (default on)','resume');field(reader,'Mouse wheel turns pages at page edges','wheelNavigation');field(reader,'Reading mode','readingMode',[['paged-ltr','Paged (left to right)'],['paged-rtl','Paged (right to left)'],['paged-vertical','Paged (vertical)'],['continuous-vertical','Continuous (vertical)'],['continuous-ltr','Continuous (left to right)'],['continuous-rtl','Continuous (right to left)'],['webtoon','Webtoon']]);field(reader,'Page layout (PDF and images)','pageLayout',[['single','Single page'],['double','Double page'],['auto','Automatic']]);field(reader,'Separate first page','separateFirst');field(reader,'Invert double pages','invertSpread');field(reader,'Click zones','zoneStyle',[['sides','Right and left'],['l-shaped','L-shaped'],['kindle','Kindle-ish']]);field(reader,'Invert click zones','invertZones');field(reader,'Show tap zones when opening (default on)','tapZones');field(reader,'Bottom toolbar style','toolbar',[['classic','Classic'],['compact','Compact'],['custom','Custom']]);field(reader,'Background color','background',[['black','Black'],['white','White'],['system','Same as system']]);const padding=field(reader,'Side padding (0–160 px)','padding');padding.min=0;padding.max=160;field(reader,'Show page progress','showProgress');field(reader,'Double tap to zoom','doubleTap');field(reader,'Limit zoom to 75–200%','limitZoom');field(reader,'Keep screen on while reading','keepAwake');
  field(reader,'EPUB font','epubFont',[['serif','Serif'],['sans','Sans serif'],['mono','Monospace']]);for(const [label,key,min,max]of [['EPUB text size','epubSize',12,40],['EPUB line spacing (tenths)','epubLineHeight',12,30],['EPUB text width','epubWidth',320,1200],['Autoscroll pixels per second','autoScrollSpeed',5,300]]){const input=field(reader,label,key);input.min=min;input.max=max;}field(reader,'Animate page changes (respects reduced motion)','animate');field(reader,'Press and hold to scroll','holdScroll');field(reader,'Show scroll indicator','scrollIndicator');field(reader,'Automatic webtoon for image books','autoWebtoon');
  field(reader,'Crop PDF and image borders','cropBorders');const toolbar=e('div',undefined,'toolbar-editor'),toolbarLabels={'toggle-navigation':'Contents and search',bookmark:'Bookmark','back-page':'Previous page','next-page':'Next page',autoscroll:'Autoscroll',rotate:'Rotate',fullscreen:'Fullscreen','share-book':'Copy reading link','book-details':'Book details','open-original':'Open original','highlight-selection':'Highlight selection'},order=[...preferences.toolbarItems,...Object.keys(toolbarLabels).filter(id=>!preferences.toolbarItems.includes(id))],enabled=new Set(preferences.toolbarItems);const drawToolbar=()=>{toolbar.replaceChildren();for(const id of order){const row=e('div',undefined,'row'),label=e('label',toolbarLabels[id]),check=e('input');check.type='checkbox';check.checked=enabled.has(id);check.onchange=()=>check.checked?enabled.add(id):enabled.delete(id);label.prepend(check);row.append(label);const index=order.indexOf(id);const up=button(row,'↑',async()=>{if(index){[order[index-1],order[index]]=[order[index],order[index-1]];drawToolbar();}});up.setAttribute('aria-label','Move '+toolbarLabels[id]+' up');up.disabled=index===0;const down=button(row,'↓',async()=>{if(index<order.length-1){[order[index+1],order[index]]=[order[index],order[index+1]];drawToolbar();}});down.setAttribute('aria-label','Move '+toolbarLabels[id]+' down');down.disabled=index===order.length-1;toolbar.append(row);}};drawToolbar();reader.append(e('h3','Customize toolbar'),e('p','Choose controls and move them into your preferred order. Select Custom above to use this layout.'),toolbar);button(reader,'Save toolbar arrangement',()=>savePreferences({toolbarItems:order.filter(id=>enabled.has(id))}));reader.append(e('p','Continuous/webtoon layouts apply to PDF/image/CBZ; EPUB scrolls within chapters. Native status-bar controls require a desktop host.'));

  const desktop=section(panel,'Desktop window');const capabilities=window.folioDesktop?.capabilities;
  desktop.append(e('p',capabilities?'Folio Desktop preview is connected to this local library.':'These controls require the Folio Desktop preview. Local reading remains available in your browser.'));
  const nativeProgress=field(desktop,'Show reading progress on the Windows taskbar','desktopProgress');nativeProgress.disabled=!capabilities?.taskbarProgress;
  const security=section(panel,'Security');field(security,'Incognito: do not save progress, history or reading time','incognito');field(security,'Secure screen: hide contents when inactive','secureScreen');const capture=field(security,'Exclude the desktop window from screen capture (Windows)','desktopCaptureProtection');capture.disabled=!capabilities?.captureProtection;security.append(e('p','Screen-capture protection requires Folio Desktop on Windows. It does not encrypt books or stop cameras and every possible capture method. The inactive-window privacy screen works in both versions.'));if(settingsPage==='security')await mountSecurity(security);
  const insights=section(panel,'Reading insights','Time counts only while a book is open in an active, visible window. Collection starts with this version; earlier reading time cannot be reconstructed.');
  const pageMap={'General':'general','Storage & advanced':'storage','Restore reading data':'storage','Appearance':'appearance','Desktop window':'appearance','Library':'library','Reader':'reader','Security':'security','Reading insights':'insights'};for(const block of [...panel.children])if(pageMap[block.querySelector('h2')?.textContent]!==settingsPage)block.remove();
  if(settingsPage==='reader')groupReaderSettings(reader);
  if(settingsPage!=='insights')return;
  const data=await request('insights');let total=0;
  for(const book of data){
    total+=book.seconds;const row=e('button',undefined,'history-row'),cover=e('span',undefined,'insight-cover'),info=e('span',undefined,'activity-info');
    if(book.available)observeCover(cover,book);info.append(e('strong',book.state.metadata?.title||book.title),e('span',(book.seconds/3600).toFixed(2)+' hours read'));row.append(cover,info);row.disabled=!book.available;row.onclick=()=>openBook(book);insights.append(row);
  }
  insights.append(e('p',`Total: ${(total/3600).toFixed(2)} hours`));
}
export async function initializeWorkspace(reload,open){reloadBooks=reload;openBook=open;initializeMenuIcons();initializeShell();preferences=await request('preferences');apply();displayControls($('display-controls'));for(const b of document.querySelectorAll('[data-tab]'))b.onclick=safe(()=>show(b.dataset.tab));initializeLibraryTools();await initializeActions({showLibrary:()=>show('library'),reload:reloadBooks});const tab=preferences.defaultTab==='last'?preferences.lastTab:preferences.defaultTab;await show(preferences.tabs.includes(tab)?tab:'library');
  const privacy=hidden=>{const obscure=Boolean(preferences.secureScreen&&hidden);$('privacy-screen').hidden=!obscure;document.body.classList.toggle('obscured',obscure);};
  document.addEventListener('visibilitychange',()=>privacy(document.hidden));window.addEventListener('blur',()=>privacy(true));window.addEventListener('focus',()=>privacy(false));
  document.addEventListener('folio-scan-complete',()=>{if(activeTab==='updates')void updates().catch(error=>$('message').textContent=error.message);});
  document.dispatchEvent(new Event('folio-workspace-ready'));
}
