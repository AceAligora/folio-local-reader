import {showReadingQueue} from './reading-queue.js';
import {readerShortcut} from './shortcuts.js';
import {cropImagePage} from './crop.js';
import {mountSerialReader} from './serial-ui.js';
import {initializeDesktop} from './desktop-ui.js';
import {CompareReader} from './compare-reader.js';
import {mountReadingTools} from './accessibility-reader.js';
import {bookDetails} from './book-details.js';
import {ArchiveReader} from './archive-reader.js';
import {unlockScreen} from './security-ui.js';
await unlockScreen();
import {ContinuousReader} from './continuous-reader.js';
import {mountNotes,changeNote} from './notebook.js';
import { wheelDecision } from './wheel.js';
import { spreadPages, adjacentSpread } from './spreads.js';
import { initializeWorkspace, preferences, savePreferences, bookPreferences, clearBookPreferences, date } from './workspace.js';
import { EpubReader } from './epub-reader.js';
import { observeCover, resetCovers } from './covers.js';
import { PdfReader } from './pdf-reader.js';
const $=id=>document.getElementById(id);
let shelf="",workspaceReady=false,letter="",descending=false;
let page=0, total=0, books=[], continuing=false, current=null, imagePage=0, rotation=0, lastRunning=false, lastScanCompleted=null, request=0;
async function api(url,data){const response=await fetch(url,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw new Error(result.error);return result;}
function report(error){$('message').textContent=error.message;if($('reader').open)$('reader-note').textContent=error.message;}
const action=fn=>async()=>{try{$('message').textContent='';await fn();}catch(error){report(error);}};
function element(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
async function load(){const sequence=++request;const result=await api(`/api/books?q=${encodeURIComponent($('search').value)}&format=${$('format').value}&page=${page}&shelf=${shelf}&sort=${$('sort').value}&category=${encodeURIComponent($('category-filter').value)}&letter=${letter}&descending=${descending}&collection=${encodeURIComponent($('collection-filter').value)}&tag=${encodeURIComponent($('tag-filter').value)}&series=${encodeURIComponent($('series-filter').value)}`);if(sequence!==request)return;if(workspaceReady&&preferences.keepTabState)sessionStorage.setItem('folio-library-state',JSON.stringify({query:$('search').value,format:$('format').value,filter:$('filter').value,sort:$('sort').value,category:$('category-filter').value,shelf}));books=result.books;total=result.total;for(const [id,values,label]of [['tag-filter',result.tags||[],'All tags'],['series-filter',result.series||[],'All series']]){const selected=$(id).value;$(id).replaceChildren(new Option(label,''),...values.map(v=>new Option(v,v)));$(id).value=selected;}for(const option of $('category-filter').options)if(option.value)option.textContent=option.value+(preferences.showCounts?' ('+(result.categoryCounts[option.value]||0)+')':'');render();}
function render(){
  if(!$('health').classList.contains('active'))nav(shelf||'all');
  const target=$('books');resetCovers(target);target.replaceChildren();let previous='';
  for(const book of books){const title=book.state.metadata?.title||book.title;const initial=/^[A-Z]$/i.test(title[0]||'')?title[0].toUpperCase():'#';
    if($('sort').value==='title'&&initial!==previous){target.append(element('h2',initial,'letter-heading'));previous=initial;}
    const button=element('button',undefined,'book');button.setAttribute('aria-label',title+' · '+({pdf:'PDF',epub:'EPUB',cbz:'CBZ',images:'Image book'}[book.format]));const cover=element('div',undefined,'cover '+book.format);cover.append(element('span',title));
    
    if(['pdf','epub','cbz','images'].includes(book.format)&&book.available)observeCover(cover,book);
    if(book.state.updated){const marker=element('span',undefined,'reading-marker');marker.title=book.state.status==='finished'?'Completed':'Continue reading';cover.append(marker);}
    button.append(cover);const info=element('div',undefined,'book-info');info.append(element('h3',title),element('p',book.state.metadata?.author||({pdf:'PDF',epub:'EPUB',cbz:'CBZ',images:'Image book'}[book.format]),'book-author'));
    if(book.state.favorite)info.append(element('p','Favorite','book-extra'));
    info.append(element('p',book.source+' · Added '+date(book.added),'description'));
    if(preferences.badges?.length){const badges=element('div',undefined,'book-badges');if(preferences.badges.includes('downloaded')&&book.available)badges.append(element('span','Local'));if(preferences.badges.includes('unread')&&(!book.state.status||book.state.status==='unread'))badges.append(element('span','Unread'));if(preferences.badges.includes('completed')&&book.state.status==='finished')badges.append(element('span','Completed'));info.append(badges);}
    button.append(info);button.title=title+' · '+book.source;button.onclick=()=>open(book);target.append(button);
  }
  if(!books.length)target.append(element('p','No books match this view. Try All or clear your filters.','empty'));
  $('library-count').textContent=total;document.querySelector('.library-title h2').textContent=({continue:'Continue reading',favorites:'Favorites',finished:'Completed',unread:'Unread',downloaded:'Local Books'}[shelf]||'All books');for(const button of $('alphabet').children)button.classList.toggle('selected',button.dataset.letter===letter);
  if(document.body.dataset.page==='library'&&document.body.dataset.libraryView==='catalog')$('summary').textContent=total+' '+(total===1?'book':'books')+' in your local library';
  document.dispatchEvent(new CustomEvent('folio-library-view-changed',{detail:{shelf}}));
  $('page-label').textContent='Page '+(page+1)+' of '+Math.max(1,Math.ceil(total/60));$('prev').disabled=page===0;$('next').disabled=(page+1)*60>=total;
}
async function status(){const data=await api('/api/status');const watcherStatus=$('folder-watch-status');if(watcherStatus)watcherStatus.textContent='Folder watching: '+(data.watcher||'Restart Folio to activate folder watching.');if(document.activeElement!==$('folder'))$('folder').value=data.root;$('setup').hidden=Boolean(data.root)&&!$('setup').dataset.expanded;$('status').textContent=`${data.job.status}${data.job.running?` · ${data.job.visited} entries · ${data.job.found} books`:data.job.issues.length?' · '+data.job.issues.length+' issue'+(data.job.issues.length===1?'':'s')+' to review in Library health':''}`;$('status').classList.toggle('quiet',!data.job.running&&!data.job.issues.length);$('cancel').hidden=!data.job.running;$('scan').disabled=data.job.running;$('issue-list').replaceChildren(...data.job.issues.map(issue=>element('li',`${issue.source||'Library'} — ${issue.message}`)));if(!data.job.issues.length)$('issue-list').append(element('li','No issues reported in this session.'));if(!data.job.running&&(lastRunning||lastScanCompleted!==null&&lastScanCompleted!==(data.job.finishedAt||0))){await load();document.dispatchEvent(new CustomEvent('folio-scan-complete'));}lastRunning=data.job.running;lastScanCompleted=data.job.finishedAt||0;}
$('folder-form').onsubmit=async event=>{event.preventDefault();await action(async()=>{await api('/api/config',{root:$('folder').value});delete $('setup').dataset.expanded;await api('/api/scan',{});page=0;await status();await load();})();};
$('scan').onclick=action(async()=>{await api('/api/scan',{});await status();});$('cancel').onclick=action(()=>api('/api/cancel',{}));
let debounce;$('search').oninput=()=>{clearTimeout(debounce);debounce=setTimeout(action(async()=>{page=0;await load();}),180);};$('format').onchange=action(async()=>{page=0;await load();});$('prev').onclick=action(async()=>{page--;await load();});$('next').onclick=action(async()=>{page++;await load();});$('view').onclick=action(async()=>{await savePreferences({display:preferences.display==='grid'?'list':preferences.display==='list'?'descriptive':'grid'});});
function nav(id){for(const name of ['all','continue','favorites','finished','health']){$(name).classList.toggle('active',id===name);$(name).setAttribute('aria-current',id===name?'page':'false');}$('issues').hidden=id!=='health';$('books').hidden=id==='health';}
for(const id of ['all','continue','favorites','finished'])$(id).onclick=action(async()=>{shelf=id==='all'?'':id;page=0;nav(id);await load();});$('health').onclick=()=>nav('health');$('reading-queue').onclick=action(()=>showReadingQueue(open));
for(const initial of ['All',...'ABCDEFGHIJKLMNOPQRSTUVWXYZ','#']){const button=element('button',initial);button.dataset.letter=initial==='All'?'':initial;button.onclick=action(async()=>{letter=button.dataset.letter;page=0;await load();});$('alphabet').append(button);}
$('display-mode').onchange=action(()=>savePreferences({display:$('display-mode').value}));
$('sort-direction').onclick=action(async()=>{descending=!descending;$('sort-direction').classList.toggle('reversed',descending);page=0;await load();});
$('toggle-filters').onclick=()=>{const open=$('filter-panel').hidden;$('filter-panel').hidden=!open;$('toggle-filters').setAttribute('aria-expanded',String(open));};
$('tag-filter').onchange=$('series-filter').onchange=action(async()=>{page=0;await load();});
$('collection-filter').onchange=action(async()=>{page=0;await load();});
document.addEventListener('folio-library-reset',()=>{page=0;letter='';shelf='';$('search').value='';$('format').value='';$('filter').value='';$('category-filter').value='';$('tag-filter').value='';$('series-filter').value='';nav('all');void load().catch(report);});
document.addEventListener('folio-open-library',event=>{const filters=event.detail||{};page=0;letter='';shelf=filters.shelf||'';descending=false;$('sort-direction').classList.remove('reversed');$('search').value=filters.query||'';$('format').value=filters.format||'';$('filter').value=['unread','finished','downloaded'].includes(shelf)?shelf:'';$('category-filter').value=filters.category||'';$('collection-filter').value=filters.collection||'';$('tag-filter').value='';$('series-filter').value='';$('sort').value=filters.sort||(shelf==='continue'?'lastRead':'title');nav(shelf||'all');void load().catch(report);});
$('filter').onchange=action(async()=>{shelf=$('filter').value;page=0;await load();});$('sort').onchange=$('category-filter').onchange=action(async()=>{page=0;sessionStorage.setItem('folio-sort',$('sort').value);await load();});
document.addEventListener('folio-preferences',()=>{if(workspaceReady)void load().catch(report);});
const comparison=new CompareReader($('comparison-panel'),()=>{if(current){flow.close();flowBook=null;void draw();}});
$('compare-book').onclick=action(async()=>{if(current){$('reader-options').open=false;await comparison.show(current);$('comparison-panel').querySelector('select')?.focus();}});
const archive=new ArchiveReader();
const flow=new ContinuousReader();let flowBook=null,autoFrame=null,autoTime=0,autoNavigating=false;
function continuous(){return current&&current.format!=='epub'&&(preferences.autoWebtoon&&['images','cbz'].includes(current.format)||preferences.readingMode.startsWith('continuous')||preferences.readingMode==='webtoon');}
function stopAuto(){cancelAnimationFrame(autoFrame);autoFrame=null;$('autoscroll').textContent='Autoscroll';}
const pdf = new PdfReader();
const epub = new EpubReader();epub.onNavigate=jumpToPage;
let pageCount=0, zoom='fit', opening=0, renderVersion=0;
let searchController=null,pageLabels=null,navigationVersion=0,readingToolsCleanup=null;
function setNavigation(visible){$('reader-navigation').hidden=!visible;$('toggle-navigation').setAttribute('aria-expanded',String(visible));if(current)void draw();}
$('toggle-navigation').onclick=()=>setNavigation($('reader-navigation').hidden);
$('close-navigation').onclick=()=>setNavigation(false);
function resetNavigation(){readingToolsCleanup?.();readingToolsCleanup=null;navigationVersion++;searchController?.abort();searchController=null;pageLabels=null;$('contents').replaceChildren();$('pdf-query').value='';$('search-results').replaceChildren();$('search-status').textContent='';$('cancel-search').hidden=true;$('pdf-search-form').hidden=true;$('reader-navigation').hidden=true;$('toggle-navigation').setAttribute('aria-expanded','false');}
function jumpToPage(index){if(continuous()&&flowBook===current){flow.jump(index);return;}if(!current||!Number.isInteger(index)||index<0||index>=pageCount)return;void persistPosition(0);imagePage=index;void draw();}
async function loadNavigation(book){
 const version=++navigationVersion;let items=[];
 if(book.format==='pdf'){const data=await pdf.navigation();if(version!==navigationVersion||current!==book)return;pageLabels=data.labels;items=data.items;}
 else if(book.format==='epub')items=epub.chapters.map((chapter,index)=>({title:chapter.title,page:index,depth:0}));
 if(version!==navigationVersion||current!==book)return;
 readingToolsCleanup=mountReadingTools($('offline-tools'),{book,getPreferences:()=>preferences,savePreferences,currentPage:()=>imagePage,text:async()=>{if(current!==book)throw new Error('Reopen this book.');if(book.format==='pdf'){const page=await pdf.document.getPage(imagePage+1);return (await page.getTextContent()).items.map(t=>t.str||'').join(' ');}return $('reader-body').querySelector('iframe')?.contentDocument?.body?.innerText||'';},capture:async()=>{if(current!==book)throw new Error('Reopen this book.');const body=$('reader-body'),node=continuous()?body.querySelector('[data-page="'+imagePage+'"] canvas, [data-page="'+imagePage+'"] img'):body.querySelector('canvas,img');if(!node)throw new Error('Open a rendered PDF or image page first.');const width=node.naturalWidth||node.width,height=node.naturalHeight||node.height,scale=Math.min(1,3000/width,3000/height),canvas=document.createElement('canvas');canvas.width=Math.floor(width*scale);canvas.height=Math.floor(height*scale);canvas.getContext('2d').drawImage(node,0,0,canvas.width,canvas.height);return new Promise(resolve=>canvas.toBlob(resolve,'image/png'));},save:async patch=>{if(current!==book)throw new Error('Reopen this book.');await details(patch);}});
 const contents=$('contents');contents.append(element('h3',book.format==='epub'?'Chapters':'Contents'));
 if(!items.length)contents.append(element('p',book.format==='pdf'?'This PDF has no document outline. Use Find or the page number to navigate.':'Use the page number to jump through this image book.'));
 for(const item of items){const button=element('button',item.title,'contents-link');button.style.paddingLeft=(12+Math.min(item.depth,6)*14)+'px';button.onclick=action(async()=>{const index=book.format==='pdf'?await pdf.destination(item.dest):item.page;if(current!==book)return;if(index===null){$('search-status').textContent='This outline entry has no local page destination.';return;}jumpToPage(index);});contents.append(button);}
 $('pdf-search-form').hidden=book.format!=='pdf';
 if(pageLabels?.[imagePage]&&!$('position').textContent.includes(' · Label '))$('position').textContent+=' · Label '+pageLabels[imagePage];
}
$('pdf-search-form').onsubmit=async event=>{
 event.preventDefault();if(current?.format!=='pdf')return;const query=$('pdf-query').value.trim();if(!query)return;
 searchController?.abort();pdf.highlight(query,(current.state.notes||[]).filter(n=>n.quote));const controller=searchController=new AbortController(),book=current;
 $('search-results').replaceChildren();$('search-status').textContent='Searching local PDF text…';$('cancel-search').hidden=false;
 try{await pdf.search(query,{signal:controller.signal,result:({page,snippet})=>{if(controller.signal.aborted||current!==book)return;const button=element('button',undefined,'search-result');button.append(element('strong','Page '+(page+1)+(pageLabels?.[page]?' · '+pageLabels[page]:'')),element('span',snippet));button.onclick=()=>jumpToPage(page);$('search-results').append(button);},progress:({checked,total,matches,limited})=>{if(controller.signal.aborted)return;$('search-status').textContent=matches+' matching pages · checked '+checked+' of '+total+(limited?' · search limit reached':checked===total&&matches===0?' · No matching text. Scanned pages may need OCR.':'');}});}catch(error){if(!controller.signal.aborted&&current===book)$('search-status').textContent='Search could not finish: '+error.message;}
 finally{if(searchController===controller)$('cancel-search').hidden=true;}
};
$('cancel-search').onclick=()=>{searchController?.abort();$('cancel-search').hidden=true;$('search-status').textContent+=' · Stopped';};
function controls(ready){for(const id of ['toggle-navigation','rotate','page-input','back-page','next-page','zoom','page-layout'])$(id).disabled=!ready;}
async function open(book,location){
  if(!book.available){report(new Error('This source is missing. Reconnect the drive and rescan.'));return;}
  resetNavigation();const session=++opening;try{book=await api('/api/book/'+book.id);}catch(error){report(error);return;}if(session!==opening)return;if(preferences.defaultCategory==='ask'&&!book.state.category){const category=window.prompt('Choose a category: '+preferences.categories.join(', '),preferences.categories[0]);if(category!==null&&preferences.categories.includes(category)){await api('/api/details/'+book.id,{category});book.state.category=category;}}if(current){await persistPosition(0);flow.close();flowBook=null;}current=book;clearBookPreferences();bookPreferences(book.state.readerPreferences||{});pdf.highlight('',(book.state.notes||[]).filter(n=>n.quote));imagePage=Number.isInteger(location)?location:preferences.resume?(book.state.page||0):0;rotation=preferences.resume?(book.state.view?.rotation||0):0;zoom=preferences.resume?(book.state.view?.zoom||'fit'):'fit';if(preferences.limitZoom&&zoom!=='fit')zoom=String(Math.max(.75,Math.min(2,Number(zoom))));$('zoom').value=zoom;pageCount=0;
  void mountSerialReader($('serial-reader-nav'),book,{openBook:open,flush:async()=>{await persistPosition(0);await stateQueue;},isCurrent:()=>current===book&&$('reader').open,onRead:()=>{book.state.status='finished';$('reading-status').value='finished';}}).catch(report);
  $('queue-current').textContent=Number.isInteger(book.state.queueRank)?'Queued':'Queue book';$('reader-title').textContent=book.state.metadata?.title||book.title;updateDetails();$('reader').showModal();controls(false);$('reader-body').textContent='Opening book…';$('reader-note').textContent='';
  try{
    if(book.format==='pdf'){
      const count=await pdf.open(book.id,(update,reason)=>{
        if(session!==opening)return;
        const password=window.prompt(reason===2?'Incorrect password. Try again:':'Enter this PDF’s password:');
        if(password===null){$('reader').close();return;}
        update(password);
      });
      if(session!==opening||!count)return;pageCount=count;
    }else{await pdf.close();if(session!==opening)return;pageCount=book.format==='epub'?await epub.open(book.id):book.format==='cbz'?await archive.open(book.id):book.pages.length;if(session!==opening)return;}
    if(book.format!=='epub')epub.close();
    if(preferences.resume&&!Number.isInteger(location)&&book.state.anchor){const anchored=book.format==='images'?book.pages.indexOf(book.state.anchor):book.format==='cbz'?archive.names.indexOf(book.state.anchor):book.format==='epub'?epub.chapters.findIndex(c=>c.path===book.state.anchor):-1;if(anchored>=0)imagePage=anchored;}
    imagePage=Math.max(0,Math.min(imagePage,pageCount-1));void loadNavigation(book).catch(error=>{if(current===book)$('search-status').textContent=error.message;});await draw();if(preferences.tapZones&&book.format!=='epub'){$('reader-body').classList.add('tap-guide');setTimeout(()=>$('reader-body').classList.remove('tap-guide'),2500);}if(preferences.keepAwake&&navigator.wakeLock)try{wakeLock=await navigator.wakeLock.request('screen');}catch{};
  }catch(error){if(session===opening){$('reader-body').textContent='This book could not be opened. '+error.message;$('reader-note').textContent='Return to the library to try another book.';controls(false);}}
}
async function draw(){
  if(!current)return;
  rememberEpubPosition();
  for(const input of document.querySelectorAll('[data-book-pref]')){const value=String(preferences[input.dataset.bookPref]);if(![...input.options].some(o=>o.value===value))input.add(new Option(value,value));input.value=value;}
  comparison.sync(imagePage);pdf.crop=preferences.cropBorders;$('crop-borders').disabled=current.format==='epub';$('crop-borders').textContent=preferences.cropBorders?'Borders cropped':'Crop borders';
  $('reader-mode').value=preferences.readingMode;$('hold-scroll').hidden=!preferences.holdScroll;
  if(current.format==='epub')$('reader-mode').title='Continuous modes apply to PDF and image books; EPUB scrolls within each chapter.';
  if(continuous()){
    const book=current,body=$('reader-body');book.state.total=pageCount;if(book.state.status!=='finished')book.state.status='reading';controls(true);$('page-layout').disabled=true;$('zoom').disabled=true;$('rotate').disabled=true;
    if(flowBook!==book){flowBook=book;await flow.open(body,{count:pageCount,index:imagePage,position:preferences.resume&&book.state.flowPosition?.page===imagePage?book.state.flowPosition:null,mode:preferences.autoWebtoon&&['images','cbz'].includes(book.format)?'webtoon':preferences.readingMode,render:async(slot,index,active)=>{if(book.format==='pdf')await pdf.renderContinuous(slot,index,{width:Math.max(100,body.clientWidth-50),height:Math.max(100,body.clientHeight-40),rotation:0,webtoon:preferences.readingMode==='webtoon',active});else{const img=element('img');img.alt='Page '+(index+1);img.src=book.format==='cbz'?archive.url(index):'/content/'+book.id+'/'+index;slot.replaceChildren(img);await new Promise(resolve=>{img.onload=img.onerror=resolve;if(img.complete)resolve();});if(preferences.cropBorders)await cropImagePage(img);}},onPage:index=>{if(current!==book)return;imagePage=index;comparison.sync(index);book.state.page=index;$('page-input').value=index+1;$('page-input').max=pageCount;$('position').textContent='of '+pageCount+(pageLabels?.[index]?' · Label '+pageLabels[index]:'');const rtl=preferences.readingMode==='continuous-rtl';$('back-page').disabled=rtl?index===pageCount-1:index===0;$('next-page').disabled=rtl?index===0:index===pageCount-1;$('back-page').setAttribute('aria-label',rtl?'Next page (left)':'Previous page');$('next-page').setAttribute('aria-label',rtl?'Previous page (right)':'Next page');if(flow.notePage!==index){flow.notePage=index;mountNotes($('reader-notes'),{book,page:index,save:details,jump:jumpToPage});}scrollChanged();}});}
    else flow.jump(imagePage);
    $('reader-note').textContent='Continuous reading · position saved on this device';return;
  }
  if(flowBook){flow.close();flowBook=null;}
  const version=++renderVersion, book=current, index=imagePage;const range=book.format==='epub'?[index]:spreadPages(index,pageCount,preferences.pageLayout,preferences.separateFirst,$('reader-body').clientWidth>=1000);const order=(preferences.invertSpread!==(preferences.readingMode==='paged-rtl'))?[...range].reverse():range;const savedScroll=preferences.resume&&book.state.page===index?(book.state.scroll||0):0;
  const readable=['images','cbz'].includes(book.format)||book.format==='pdf'||book.format==='epub';controls(readable);
  $('rotate').disabled=book.format==='epub';
  $('page-input').parentNode.firstChild.textContent=book.format==='epub'?'Chapter ':'Page ';
  $('bookmark').disabled=!readable;$('bookmark-list').disabled=!readable;
  $('position').textContent=readable?(range.length>1?`${range[0]+1}–${range.at(-1)+1} of ${pageCount}`:`of ${pageCount}`):'';$('page-layout').value=preferences.pageLayout;$('page-layout').disabled=book.format==='epub';$('page-input').value=index+1;$('page-input').max=pageCount;
  if(pageLabels?.[index])$('position').textContent+=' · Label '+pageLabels[index];
  const rtl=preferences.readingMode==='paged-rtl';$('back-page').disabled=!readable||(rtl?range.at(-1)>=pageCount-1:range[0]===0);$('next-page').disabled=!readable||(rtl?range[0]===0:range.at(-1)>=pageCount-1);$('back-page').setAttribute('aria-label',rtl?'Next page (left)':'Previous page');$('next-page').setAttribute('aria-label',rtl?'Previous page (right)':'Next page');
  const body=$('reader-body');$('reader-note').textContent='';
  try{
    if(preferences.animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches)body.animate([{opacity:.5},{opacity:1}],{duration:150});
    if(book.format==='pdf'){
      $('reader-note').textContent='Rendering page…';
      const rendered=await pdf.render(body,index,rotation,zoom,order);
      if(!rendered||version!==renderVersion)return;
      $('reader-note').textContent='Folio PDF reader · ← → to turn pages · Position saved on this device';
    }else if(['images','cbz'].includes(book.format)){
      const spread=element('div',undefined,'page-spread image-spread');
      for(const pageIndex of order){const img=element('img');img.alt='Page '+(pageIndex+1);img.src=book.format==='cbz'?archive.url(pageIndex):'/content/'+book.id+'/'+pageIndex;img.style.transform='rotate('+rotation+'deg)';if(zoom!=='fit'){img.style.maxWidth='none';img.style.maxHeight='none';img.style.width=(Number(zoom)*100/order.length)+'%';}else{img.style.maxWidth=(95/order.length)+'%';img.style.maxHeight=Math.max(100,body.clientHeight-45)+'px';}spread.append(img);}
      body.replaceChildren(spread);if(preferences.cropBorders)await Promise.all([...spread.querySelectorAll('img')].map(img=>cropImagePage(img,rotation)));$('reader-note').textContent=book.format==='cbz'?archive.names[index]:book.pages[index];
    }else if(book.format==='epub'){
      epub.render(body,index,zoom,preferences,(book.state.notes||[]).filter(n=>n.page===index));$('reader-note').textContent='Chapter '+(index+1)+' of '+pageCount+' · Simplified offline EPUB view';
    }else{
      const notice=element('div',undefined,'notice');notice.append(element('h2','EPUB imported'),element('p','Your EPUB is safely indexed. EPUB reading, chapter navigation, font settings, and resume are scheduled for the next reader milestone.'));body.replaceChildren(notice);return;
    }
    if(current===book&&version===renderVersion){mountNotes($('reader-notes'),{book,page:index,save:async patch=>{if(current!==book)throw new Error('Reopen this book to save the note.');await details(patch);},jump:jumpToPage});book.state.page=index;book.state.scroll=savedScroll;book.state.total=pageCount;restoreScroll(savedScroll,book);await persistPosition(0);if(book.state.status!=='finished')book.state.status='reading';updateDetails();}
  }catch(error){if(version===renderVersion)$('reader-note').textContent='Could not display this page: '+error.message;}
}
function move(delta){if(continuous()&&flowBook===current){flow.jump(Math.max(0,Math.min(pageCount-1,imagePage+delta*(preferences.readingMode==='continuous-rtl'?-1:1))));return;}if(!current||!pageCount)return;void persistPosition(0);const direction=preferences.readingMode==='paged-rtl'?-1:1;imagePage=current.format==='epub'?Math.max(0,Math.min(pageCount-1,imagePage+delta*direction)):adjacentSpread(imagePage,pageCount,delta*direction,preferences.pageLayout,preferences.separateFirst,$('reader-body').clientWidth>=1000);void draw();}
$('back-page').onclick=()=>move(-1);$('next-page').onclick=()=>move(1);
$('page-input').onchange=()=>{if(pageCount){if(continuous()){jumpToPage(Math.floor(Number($('page-input').value))-1);return;}imagePage=Math.max(0,Math.min(pageCount-1,Math.floor(Number($('page-input').value)||1)-1));void draw();}};
async function saveBookPreferences(patch){if(!current)return;const book=current,next={...(book.state.readerPreferences||{}),...patch};if(!preferences.incognito)await api('/api/details/'+book.id,{readerPreferences:next});if(current!==book)return;book.state.readerPreferences=next;bookPreferences(next);}
const bookSettings=element('details'),bookSummary=element('summary','This book’s reading preferences');bookSettings.append(bookSummary);$('reader-navigation').append(bookSettings);
for(const [key,label,choices]of [['epubFont','EPUB font',[['serif','Serif'],['sans','Sans serif'],['mono','Monospace']]],['epubSize','EPUB text size',[[16,'16'],[19,'19'],[22,'22'],[26,'26'],[32,'32']]],['epubWidth','EPUB line width',[[480,'Narrow'],[780,'Standard'],[1000,'Wide']]],['background','Page background',[['system','App theme'],['white','White'],['black','Black']]],['padding','Side padding',[[0,'None'],[20,'Small'],[60,'Medium'],[100,'Large']]]]){const row=element('label',label,'setting-row'),input=element('select');input.dataset.bookPref=key;for(const [value,text]of choices)input.add(new Option(text,value));input.onchange=action(async()=>{await persistPosition(0);await saveBookPreferences({[key]:typeof preferences[key]==='number'?Number(input.value):input.value});flow.close();flowBook=null;await draw();});row.append(input);bookSettings.append(row);}
$('reset-book-preferences').onclick=action(async()=>{if(!current)return;if(!preferences.incognito){await api('/api/details/'+current.id,{readerPreferences:null});delete current.state.readerPreferences;}clearBookPreferences();bookPreferences({});flow.close();flowBook=null;await draw();});
$('crop-borders').onclick=action(async()=>{flow.close();flowBook=null;await saveBookPreferences({cropBorders:!preferences.cropBorders});await draw();});
$('reader-mode').onchange=action(async()=>{stopAuto();flow.close();flowBook=null;await saveBookPreferences({readingMode:$('reader-mode').value});await draw();});
$('autoscroll').onclick=()=>{if(autoFrame){stopAuto();return;}autoTime=performance.now();$('autoscroll').textContent='Stop autoscroll';const tick=async now=>{if(!current){stopAuto();return;}const body=$('reader-body'),frame=body.querySelector('iframe'),target=current.format==='epub'?frame?.contentDocument?.scrollingElement:body;if(target&&document.visibilityState==='visible'&&document.hasFocus()){const delta=Math.min(100,now-autoTime)*preferences.autoScrollSpeed/1000,horizontal=continuous()&&preferences.readingMode.startsWith('continuous-')&&preferences.readingMode!=='continuous-vertical';if(horizontal){const before=target.scrollLeft;target.scrollLeft+=delta*(preferences.readingMode==='continuous-rtl'?-1:1);if(before===target.scrollLeft)stopAuto();}else if(target.scrollHeight-target.clientHeight-target.scrollTop>2)target.scrollTop+=delta;else if(imagePage<pageCount-1&&!continuous()&&!autoNavigating){autoNavigating=true;move(preferences.readingMode==='paged-rtl'?-1:1);const version=renderVersion;while(current&&version===renderVersion&&$('reader-note').textContent==='Rendering page…')await new Promise(resolve=>setTimeout(resolve,50));autoNavigating=false;}else stopAuto();}autoTime=now;if(autoFrame!==null)autoFrame=requestAnimationFrame(tick);};autoFrame=requestAnimationFrame(tick);};
$('hold-scroll').onpointerdown=event=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);if(!autoFrame)$('autoscroll').onclick();};for(const name of ['pointerup','pointercancel','lostpointercapture'])$('hold-scroll').addEventListener(name,stopAuto);
$('reader-body').addEventListener('contextmenu',event=>{event.preventDefault();if($('reader-navigation').hidden)setNavigation(true);$('notes-section').open=true;});
$('rotate').onclick=()=>{rotation=(rotation+90)%360;void draw();};
$('page-layout').onchange=action(async()=>{await saveBookPreferences({pageLayout:$('page-layout').value});await draw();});
$('zoom').onchange=()=>{zoom=$('zoom').value;void draw();};
$('fullscreen').onclick=action(async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await $('reader').requestFullscreen();});
$('close-reader').onclick=()=>$('reader').close();
$('reader').addEventListener('close',()=>{window.speechSynthesis?.cancel();window.folioLocalAudio?.pause();stopAuto();const closingSave=persistPosition(0);flow.close();flowBook=null;resetNavigation();void closingSave.then(()=>document.dispatchEvent(new CustomEvent('folio-serial-changed'))).catch(report);if(wakeLock){void wakeLock.release();wakeLock=null;}$('reader').classList.remove('focus-reading');$('focus-reading').setAttribute('aria-pressed','false');opening++;renderVersion++;current=null;clearBookPreferences();comparison.close();epub.close();archive.close();void pdf.close().catch(report);if(document.fullscreenElement)void document.exitFullscreen();void load().catch(report);});
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(current&&(zoom==='fit'||preferences.pageLayout==='auto'))void draw();},150);});
function handleReaderKey(event){
  if(!$('reader').open||!current)return;
  if(event.key==='Escape'&&$('reader').classList.contains('focus-reading')){event.preventDefault();event.stopPropagation();void toggleFocus(false).catch(report);return;}
  if(current.format==='pdf'&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f'){event.preventDefault();if($('reader').classList.contains('focus-reading'))void toggleFocus(false).then(()=>{setNavigation(true);$('pdf-query').focus();}).catch(report);else{if($('reader-navigation').hidden)setNavigation(true);$('pdf-query').focus();}return;}
  const command=readerShortcut(event,preferences);if(!command)return;event.preventDefault();
  if(command==='next')move(1);else if(command==='previous')move(-1);else if(command==='focus')void toggleFocus().catch(report);else if(command==='bookmark')$('bookmark').click();else if(command==='contents'){if($('reader').classList.contains('focus-reading'))void toggleFocus(false).then(()=>setNavigation(true)).catch(report);else setNavigation($('reader-navigation').hidden);}
}
document.addEventListener('keydown',handleReaderKey);
let focusChanging=false;
async function toggleFocus(value){if(!current||focusChanging)return;focusChanging=true;const book=current;try{await persistPosition(0);if(current!==book)return;const enabled=value??!$('reader').classList.contains('focus-reading');if(current.format==='epub')restorePending=true;flow.close();flowBook=null;$('reader').classList.toggle('focus-reading',enabled);$('focus-reading').setAttribute('aria-pressed',String(enabled));await draw();if(current===book)(enabled?$('reader-body'):$('focus-reading')).focus();}finally{focusChanging=false;}}
$('focus-reading').onclick=action(()=>toggleFocus());$('exit-focus-reading').onclick=action(()=>toggleFocus(false));
$('reader').addEventListener('cancel',event=>{if($('reader').classList.contains('focus-reading')){event.preventDefault();void toggleFocus(false).catch(report);}});


function updateDetails(){
  if(!current)return;
  $('favorite').textContent=current.state.favorite?'Remove favorite':'Favorite';
  $('favorite').setAttribute('aria-pressed',String(!!current.state.favorite));
  $('bookmark').textContent=(current.state.bookmarks||[]).some(mark=>mark.page===imagePage)?'Remove bookmark':'Bookmark page';
  $('reading-status').value=current.state.status||'unread';
  $('book-category').replaceChildren(...(preferences.categories||['Default']).map(c=>new Option(c,c)));$('book-category').value=current.state.category||preferences.defaultCategory||'Default';
  const select=$('bookmark-list');select.replaceChildren(element('option','Bookmarks'));select.firstChild.value='';
  for(const bookmark of current.state.bookmarks||[]){const option=element('option',bookmark.label+' · '+(current.format==='epub'?'Chapter ':'Page ')+(bookmark.page+1));option.value=String(bookmark.page);select.append(option);}
}
async function details(patch){if(!current)return;const book=current;await api('/api/details/'+book.id,patch);Object.assign(book.state,patch);if(current===book){updateDetails();pdf.highlight(pdf.query,(book.state.notes||[]).filter(n=>n.quote));if('notes'in patch){if(book.format==='epub')epub.updateAnnotations((book.state.notes||[]).filter(n=>n.page===imagePage));$('reader-notes').refreshNotes?.();}}}
document.addEventListener('folio-notes-changed',event=>{if(current?.id!==event.detail.bookId)return;current.state.notes=event.detail.notes;pdf.highlight(pdf.query,current.state.notes.filter(n=>n.quote));if(current.format==='epub')epub.updateAnnotations(current.state.notes.filter(n=>n.page===imagePage));$('reader-notes').refreshNotes?.();});
let selectedHighlight=null;
function rememberHighlight(clear=false){
  if(clear)selectedHighlight=null;if(!current)return;
  const frame=$('reader-body').querySelector('iframe'),selection=current.format==='epub'?frame?.contentWindow?.getSelection():window.getSelection(),quote=selection?.toString().trim().slice(0,2000);
  if(quote){const at=selection.anchorNode?.parentElement?.closest('.pdf-page')?.dataset.page;selectedHighlight={book:current.id,page:at===undefined?imagePage:Number(at),quote};}
}
$('highlight-selection').addEventListener('pointerdown',event=>{rememberHighlight();event.preventDefault();});
// Opening the tools menu can collapse the selection in either PDF text or an EPUB iframe.
const bookToolsSummary=document.querySelector('#book-tools > summary');
bookToolsSummary.addEventListener('pointerdown',()=>{if(!$('book-tools').open)rememberHighlight(true);});
bookToolsSummary.addEventListener('keydown',event=>{if(!$('book-tools').open&&['Enter',' '].includes(event.key))rememberHighlight(true);});
$('highlight-selection').onclick=action(async()=>{if(!current)return;const frame=$('reader-body').querySelector('iframe'),selection=current.format==='epub'?frame?.contentWindow?.getSelection():window.getSelection(),quote=selection?.toString().trim().slice(0,2000)||(selectedHighlight?.book===current.id?selectedHighlight.quote:'');if(!quote)throw new Error('Select text in a PDF or EPUB first.');const selectedPage=selection.anchorNode?.parentElement?.closest('.pdf-page')?.dataset.page,page=selectedPage===undefined?(selectedHighlight?.book===current.id?selectedHighlight.page:imagePage):Number(selectedPage);selectedHighlight=null;await changeNote(current,'save',{id:crypto.randomUUID(),page,quote,text:quote,color:$('highlight-color').value,tags:[],created:Date.now()},null);$('reader-note').textContent='Highlight saved in reading notes.';});
$('book-details').onclick=()=>{if(current){const book=current;bookDetails(book,{save:details,done:async()=>{const anchor=book.format==='images'?book.pages[imagePage]:null;Object.assign(book,await api('/api/book/'+book.id));$('reader-title').textContent=book.state.metadata?.title||book.title;if(book.format==='images'){pageCount=book.pages.length;imagePage=Math.max(0,book.pages.indexOf(anchor));flow.close();flowBook=null;}await draw();}});}};
$('share-book').onclick=async()=>{if(!current)return;const url=location.origin+'/#book='+current.id+'&page='+(imagePage+1);try{await navigator.clipboard.writeText(url);$('reader-note').textContent='Reading link copied. This localhost link works on this device only.';}catch{$('reader-note').textContent=url;}};
$('open-original').onclick=()=>{if(current)window.open('/content/'+current.id+'/'+(current.format==='images'?imagePage:0),'_blank','noopener');};
$('queue-current').onclick=action(async()=>{if(!current)return;const book=current;await api('/api/queue',{id:book.id,action:'add'});$('reader-note').textContent='Book added to your reading queue.';$('queue-current').textContent='Queued';});
$('favorite').onclick=action(()=>details({favorite:!current.state.favorite}));
$('reading-status').onchange=action(()=>details({status:$('reading-status').value}));
$('bookmark').onclick=action(async()=>{
  if(!current||!pageCount)return;
  const bookmarks=current.state.bookmarks||[];
  const existing=bookmarks.find(b=>b.page===imagePage);
  if(existing){await details({bookmarks:bookmarks.filter(b=>b!==existing)});$('reader-note').textContent='Bookmark removed.';return;}
  const label=window.prompt('Bookmark name:','Page '+(imagePage+1));if(label===null)return;
  await details({bookmarks:[...bookmarks,{page:imagePage,label:label.trim().slice(0,120)||'Page '+(imagePage+1)}]});$('reader-note').textContent='Bookmark saved.';
});
$('bookmark-list').onchange=()=>{const value=$('bookmark-list').value;if(value!==''){imagePage=Math.min(pageCount-1,Number(value));void draw();}};
let stateQueue=Promise.resolve(),scrollTimer,wakeLock=null,restorePending=false;
let lastTick=performance.now();
function scrollPosition(){if(!current||continuous())return 0;if(restorePending)return current.state.scroll||0;const frame=$('reader-body').querySelector('iframe');return current.format==='epub'?(frame?.contentWindow?.scrollY||0):$('reader-body').scrollTop;}
function rememberEpubPosition(){if(current?.format==='epub'&&!restorePending){const anchor=epub.position();if(anchor)current.state.epubAnchor=anchor;}}
function positionPayload(seconds=0){
  rememberEpubPosition();const book=current,flowPosition=continuous()&&flowBook===book&&flow.position?flow.position():null,at=flowPosition?.page??book.state.page??imagePage,anchor=book.format==='images'?book.pages[at]:book.format==='cbz'?archive.names[at]:book.format==='epub'?epub.chapters[at]?.path:undefined;
  return {...(flowPosition?{flowPosition}:{}),view:{zoom,rotation},anchor,...(book.format==='epub'&&book.state.epubAnchor?{epubAnchor:book.state.epubAnchor}:{}),page:at,scroll:scrollPosition(),total:pageCount,seconds};
}
function persistPosition(seconds=0){
  if(!current||!pageCount||preferences.incognito)return Promise.resolve();
  const book=current,payload=positionPayload(seconds);
  if(payload.flowPosition){book.state.flowPosition=payload.flowPosition;book.state.page=payload.page;}book.state.view=payload.view;book.state.scroll=payload.scroll;book.state.updated=Date.now();
  stateQueue=stateQueue.catch(()=>{}).then(()=>api('/api/state/'+book.id,payload));
  return stateQueue;
}
function scrollChanged(){if(current&&preferences.scrollIndicator){const body=$('reader-body'),frame=body.querySelector('iframe'),target=current.format==='epub'?frame?.contentDocument?.scrollingElement:body;if(target)$('reader').style.setProperty('--scroll-progress',Math.round(100*target.scrollTop/Math.max(1,target.scrollHeight-target.clientHeight))+'%');}clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>void persistPosition(0).catch(report),300);}
function restoreScroll(value,book){
  restorePending=true;const body=$('reader-body');body.scrollTop=0;
  const child=body.firstElementChild;
  const restore=()=>{if(current!==book||child!==body.firstElementChild)return;if(book.format==='epub'){const frame=body.querySelector('iframe');if(!frame.dataset.navigationFragment&&!(preferences.resume&&epub.restorePosition(book.state.epubAnchor)))frame?.contentWindow?.scrollTo(0,value);frame?.contentWindow?.addEventListener('keydown',handleReaderKey);frame?.contentWindow?.addEventListener('scroll',scrollChanged,{passive:true});frame?.contentWindow?.addEventListener('wheel',event=>handleWheel(event,frame.contentDocument.scrollingElement,frame.contentWindow.innerHeight),{passive:false});}else body.scrollTop=value;restorePending=false;if(book.format==='epub')void persistPosition(0).catch(report);};
  if(book.format==='epub')body.querySelector('iframe').addEventListener('load',restore,{once:true});
  else if(['images','cbz'].includes(book.format)){const image=body.querySelector('img');if(!image||image.complete)restore();else image.addEventListener('load',restore,{once:true});}
  else restore();
}
$('reader-body').addEventListener('scroll',scrollChanged,{passive:true});
$('book-category').onchange=action(()=>details({category:$('book-category').value}));
window.addEventListener('scroll',()=>{if(preferences.keepScroll)sessionStorage.setItem('folio-scroll',String(window.scrollY));},{passive:true});
setInterval(()=>{const now=performance.now(),seconds=Math.min(15,(now-lastTick)/1000);lastTick=now;if(current&&document.visibilityState==='visible'&&document.hasFocus())void persistPosition(seconds).catch(report);},10000);
document.addEventListener('visibilitychange',()=>{lastTick=performance.now();if(document.hidden)void persistPosition(0).catch(report);});
window.addEventListener('blur',()=>{lastTick=performance.now();void persistPosition(0).catch(report);});window.addEventListener('focus',()=>{lastTick=performance.now();});
window.addEventListener('pagehide',()=>{if(current&&!preferences.incognito)void fetch('/api/state/'+current.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(positionPayload()),keepalive:true});});
document.addEventListener('folio-workspace-ready',()=>initializeDesktop({getPreferences:()=>preferences,openBook:open,getReader:()=>({reading:!!current&&$('reader').open,progress:current&&pageCount?Math.max(0,Math.min(1,((current.state.page??imagePage)+1)/pageCount)):0}),flush:async()=>{const now=performance.now(),seconds=current&&document.visibilityState==='visible'&&document.hasFocus()?Math.min(15,(now-lastTick)/1000):0;lastTick=now;await persistPosition(seconds);await stateQueue;}}),{once:true});
$('reader-body').addEventListener('click',event=>{
  $('reader-body').classList.remove('tap-guide');if(!current||current.format==='epub'||event.target.closest('button,input,a,select,.textLayer')||window.getSelection()?.toString())return;
  const bounds=$('reader-body').getBoundingClientRect(),x=(event.clientX-bounds.left)/bounds.width,y=(event.clientY-bounds.top)/bounds.height;
  let delta=0;if(preferences.zoneStyle==='kindle')delta=x<.2?-1:x>.55?1:0;else if(preferences.zoneStyle==='l-shaped')delta=x<.2||y>.85?-1:x>.8?1:0;else delta=x<.2?-1:x>.8?1:0;
  if(delta)move(preferences.invertZones?-delta:delta);
});
let longPressTimer,longPressStart;
$('reader-body').addEventListener('pointerdown',event=>{if(event.target.closest('.textLayer')||current?.format==='epub')return;longPressStart=[event.clientX,event.clientY];clearTimeout(longPressTimer);longPressTimer=setTimeout(()=>{if(!$('reader').open)return;if($('reader-navigation').hidden)setNavigation(true);$('notes-section').open=true;},650);});
for(const name of ['pointerup','pointercancel'])$('reader-body').addEventListener(name,()=>clearTimeout(longPressTimer));$('reader-body').addEventListener('pointermove',event=>{if(longPressStart&&Math.hypot(event.clientX-longPressStart[0],event.clientY-longPressStart[1])>8)clearTimeout(longPressTimer);});
$('reader-body').addEventListener('dblclick',event=>{if(!preferences.doubleTap||!current||event.target.closest('.textLayer')||window.getSelection()?.toString())return;$('zoom').value=$('zoom').value==='fit'?'1.5':'fit';zoom=$('zoom').value;void draw();});

const wheelState={};
function handleWheel(event,target,viewport){
  if(continuous()){if(preferences.readingMode==='continuous-ltr'||preferences.readingMode==='continuous-rtl'){if(!event.ctrlKey){event.preventDefault();$('reader-body').scrollLeft+=event.deltaY*(preferences.readingMode==='continuous-rtl'?-1:1);}}return;}
  if(!current||!pageCount||!preferences.wheelNavigation||event.ctrlKey||event.shiftKey)return;
  const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?viewport:1);
  const decision=wheelDecision({delta,top:target.scrollTop,height:target.scrollHeight,viewport,now:performance.now()},wheelState);
  if(decision==='scroll'||decision==='ignore')return;
  event.preventDefault();
  if(decision==='next'||decision==='previous'){
    const logical=decision==='next'?1:-1;const direction=preferences.readingMode==='paged-rtl'?-logical:logical;
    move(direction);
  }
}
$('reader-body').addEventListener('wheel',event=>handleWheel(event,$('reader-body'),$('reader-body').clientHeight),{passive:false});

await action(async()=>{await initializeWorkspace(load,open);if(preferences.keepTabState){try{const saved=JSON.parse(sessionStorage.getItem('folio-library-state')||'{}');$('search').value=saved.query||'';$('format').value=saved.format||'';$('filter').value=saved.filter||'';$('sort').value=saved.sort||'title';$('category-filter').value=saved.category||'';shelf=saved.shelf||'';}catch{}};workspaceReady=true;await status();await load();const link=new URLSearchParams(location.hash.slice(1));if(link.has('book')){try{const book=await api('/api/book/'+encodeURIComponent(link.get('book')));await open(book,Math.max(0,(Number(link.get('page'))||1)-1));}catch(error){report(error);}}if(preferences.keepScroll)window.scrollTo(0,Number(sessionStorage.getItem('folio-scroll')||0));if(sessionStorage.getItem('folio-design-version')!=='4'){sessionStorage.setItem('folio-design-version','4');window.scrollTo(0,0);}})();const statusTimer=setInterval(()=>void status().catch(report),1500);document.addEventListener('folio-shutdown',()=>clearInterval(statusTimer));
