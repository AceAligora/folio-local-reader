const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
async function api(endpoint,data){const response=await fetch('/api/'+endpoint,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw new Error(result.error);return result;}
export async function mountNativeSources(host,{networkEnabled}){
  const manager=el('section',undefined,'settings-card'),search=el('section',undefined,'settings-card');
  manager.append(el('h2','Native adapters'),el('p','Add, update or remove reviewed adapters bundled with this Folio release. These controls work offline. Removing an adapter keeps downloaded books and cached searches. New adapter code arrives through Folio updates.'));
  const adapters=el('div');manager.append(adapters);host.append(manager,search);search.append(el('h2','Search sources'),el('p','Only the query and preferences you choose are sent. Gutenberg downloads become local EPUBs. Open Library provides discovery and metadata. External details links open only when selected.'));
  const status=el('p','','network-message');status.setAttribute('role','status');manager.append(status);
  const source=el('select');source.setAttribute('aria-label','Native adapter');const query=el('input');query.placeholder='Title or author';query.setAttribute('aria-label','Native source search');query.maxLength=200;
  const controls=el('div',undefined,'source-search-controls');controls.append(source,query);search.append(controls);
  const results=el('div',undefined,'native-source-results'),target=el('select');results.setAttribute('role','region');results.setAttribute('aria-label','Source search results');results.tabIndex=0;target.setAttribute('aria-label','Local book for source metadata');target.add(new Option('Choose a local book for metadata…',''));
  for(let page=0;;page++){const data=await api('books?page='+page);for(const book of data.books)target.add(new Option(book.state.metadata?.title||book.title,book.id));if((page+1)*60>=data.total)break;}
  const targetLabel=el('label','Apply metadata to');targetLabel.append(target);targetLabel.className='source-metadata-target';search.append(targetLabel);
  let registry=await api('sources'),generation=0;
  const selected=()=>registry.adapters.find(adapter=>adapter.id===source.value);
  const canSearch=()=>!!(networkEnabled&&selected()?.installedVersion&&selected()?.supported&&selected()?.settings.enabled);
  const run=async(node,task)=>{node.disabled=true;status.textContent='Working…';try{await task();}catch(error){status.textContent=error.message;}finally{node.disabled=false;sync();}};
  const button=(parent,title,handler)=>{const node=el('button',title);node.type='button';node.onclick=()=>run(node,handler);parent.append(node);return node;};
  const online=button(controls,'Search source',()=>find(false)),cached=button(controls,'Show cached results',()=>find(true)),refresh=button(controls,'Refresh source results',()=>find(false,1,query.value,true));
  search.append(results);
  function sync(){const adapter=selected();online.disabled=refresh.disabled=!canSearch();targetLabel.hidden=!adapter?.capabilities.includes('metadata');for(const node of results.querySelectorAll('[data-apply-metadata]'))node.disabled=!target.value;}
  const choice=(parent,label,values,current)=>{const row=el('label',label),input=el('select');input.setAttribute('aria-label',label);for(const [value,title]of values)input.add(new Option(title,value));input.value=String(current);row.append(input);parent.append(row);return input;};
  async function drawManager(){
    const value=source.value;source.replaceChildren(...registry.adapters.filter(adapter=>adapter.capabilities.includes('search')).map(adapter=>new Option(adapter.name+(adapter.installedVersion?'':' (not added)'),adapter.id)));source.value=registry.adapters.some(a=>a.id===value)?value:'gutenberg';adapters.replaceChildren();
    for(const adapter of registry.adapters){
      const row=el('details',undefined,'native-adapter'),summary=el('summary',adapter.name+' · '+(adapter.installedVersion?'v'+adapter.installedVersion:'Not added')+(adapter.updateAvailable?' · Update available':''));row.append(summary,el('p',adapter.description));
      const manage=async(action,settings)=>{registry=await api('sources/manage',{id:adapter.id,action,settings});generation++;results.replaceChildren();await drawManager();status.textContent=adapter.name+' saved locally.';};
      if(!adapter.supported)row.append(el('p','This profile needs a newer Folio release.'));
      else if(!adapter.installedVersion)button(row,'Add '+adapter.name,()=>manage('add'));
      else{
        if(adapter.updateAvailable)button(row,'Update to bundled v'+adapter.version,()=>manage('update'));
        const enabledLabel=el('label',undefined,'setting-row'),enabled=el('input');enabled.type='checkbox';enabled.checked=adapter.settings.enabled;enabledLabel.append(el('span','Enable '+adapter.name),enabled);row.append(enabledLabel);
        if(!adapter.capabilities.includes('search')){row.append(el('p','Follow feeds from Settings → Chapter feeds.'));button(row,'Save '+adapter.name+' preferences',()=>manage('settings',{enabled:enabled.checked}));button(row,'Remove '+adapter.name,()=>manage('remove'));adapters.append(row);continue;}
        const form=el('div',undefined,'native-adapter-preferences'),language=choice(form,adapter.id==='openlibrary'?'Preferred edition language':'Language filter',registry.languages,adapter.settings.language),sort=choice(form,'Result order',adapter.sorts,adapter.settings.sort);
        const limit=adapter.id==='openlibrary'?choice(form,'Results per page',[[8,'8'],[16,'16'],[32,'32']],adapter.settings.limit):null;
        if(adapter.updateAvailable){language.disabled=sort.disabled=true;if(limit)limit.disabled=true;form.append(el('p','Update the bundled adapter to use search preferences and pagination.'));}
        if(!limit)form.append(el('p','Gutendex returns up to 32 results per page.'));
        if(adapter.id==='openlibrary')form.append(el('p','Preferred language ranks editions; works in other languages can still appear.'));
        row.append(form);button(row,'Save '+adapter.name+' preferences',()=>manage('settings',{enabled:enabled.checked,language:language.value,sort:sort.value,limit:limit?Number(limit.value):32}));
        button(row,'Remove '+adapter.name,()=>manage('remove'));
      }
      adapters.append(row);
    }
    sync();
  }
  function drawResults(data){
    results.replaceChildren();results.append(el('p',`${registry.adapters.find(a=>a.id===data.source)?.name||data.source} · Page ${data.page||1} · ${data.results.length} of ${data.count} results · Cached ${new Date(data.cachedAt).toLocaleString()}`));
    for(const item of data.results){const row=el('article',undefined,'catalogue-entry');row.append(el('strong',item.title),el('p',[item.author,item.year].filter(Boolean).join(' · ')));
      if(data.source==='gutenberg'){const download=button(row,'Download EPUB to local library',async()=>{const result=await api('sources/download',{source:data.source,query:data.query,id:item.id,token:data.token});status.textContent=result.alreadyDownloaded?'This edition is already in your local library.':'EPUB saved to your local library.';document.dispatchEvent(new CustomEvent('folio-preferences'));});const adapter=registry.adapters.find(a=>a.id===data.source);download.disabled=!networkEnabled||!adapter?.installedVersion||!adapter.settings.enabled||!item.download;}
      if(data.source==='openlibrary'){const apply=button(row,'Apply metadata to selected local book',async()=>{if(!target.value)throw new Error('Choose a local book first.');await api('sources/apply-metadata',{source:data.source,query:data.query,id:item.id,token:data.token,bookId:target.value});status.textContent='Metadata saved for '+target.selectedOptions[0].textContent+'.';document.dispatchEvent(new CustomEvent('folio-preferences'));});apply.dataset.applyMetadata='true';apply.disabled=!target.value;}
      const details=el('a','View source details');details.href=item.details||(data.source==='gutenberg'?'https://www.gutenberg.org/ebooks/'+item.id:'https://openlibrary.org'+item.id);details.target='_blank';details.rel='noopener noreferrer';row.append(details);results.append(row);
    }
    const pages=el('div',undefined,'source-search-controls');const previous=button(pages,'Previous source page',()=>find(!canSearch(),Math.max(1,(data.page||1)-1),data.query)),next=button(pages,'Next source page',()=>find(!canSearch(),(data.page||1)+1,data.query));previous.disabled=(data.page||1)<=1;next.disabled=!data.hasNext||(data.page||1)>=1000||selected()?.updateAvailable;results.append(pages);if(!data.results.length)results.append(el('p','No matching works. Try another title or author.'));sync();
  }
  async function find(offline,page=1,text=query.value,force=false){const current=++generation,id=source.value;const data=await api('sources/search',{source:id,query:text,offline,page,refresh:force});if(current!==generation)return;query.value=text;drawResults(data);status.textContent=offline||!networkEnabled?'Showing results saved on this device.':'Source results cached on this device.';}
  source.onchange=()=>{generation++;results.replaceChildren();sync();};target.onchange=sync;query.onkeydown=event=>{if(event.key==='Enter')void run(canSearch()?online:cached,()=>find(!canSearch()));};
  await drawManager();
  return {searchFor:async text=>{query.value=text;await find(!canSearch());search.scrollIntoView({behavior:'smooth'});}};
}
