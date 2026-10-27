const $=id=>document.getElementById(id);
function el(tag,text,cls){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;}
async function api(path,data){const response=await fetch('/api/'+path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw new Error(result.error);return result;}
function dialog(title){
  const host=el('dialog',undefined,'action-dialog'),heading=el('h2',title),error=el('p',undefined,'action-error'),close=el('button','Cancel');
  const headingId='action-title';heading.id=headingId;host.setAttribute('aria-labelledby',headingId);error.setAttribute('role','alert');
  close.type='button';close.onclick=()=>host.close();host.append(heading,error);host.addEventListener('close',()=>host.remove(),{once:true});document.body.append(host);
  return {host,error,close};
}
export async function initializeActions({showLibrary,reload}){
  let collections=[];
  async function refresh(selected=$('collection-filter').value){collections=await api('collections');$('collection-filter').replaceChildren(new Option('All books',''),...collections.map(c=>new Option(`${c.generated?'Folder: ':''}${c.name} (${c.books.length})`,c.id)));$('collection-filter').value=collections.some(c=>c.id===selected)?selected:'';$('edit-collection').hidden=!collections.some(c=>c.id===$('collection-filter').value&&!c.generated);}
  $('collection-filter').addEventListener('change',()=>{$('edit-collection').hidden=!collections.some(c=>c.id===$('collection-filter').value&&!c.generated);});
  async function editCollection(existing){
    const {host,error,close}=dialog(existing?'Edit collection':'Add collection');
    const label=el('label','Collection name'),name=el('input');name.required=true;name.maxLength=80;name.value=existing?.name||'';label.append(name);
    const search=el('input');search.placeholder='Find books to include…';search.setAttribute('aria-label','Find books to include');
    const list=el('div',undefined,'collection-picker'),selected=new Set(existing?.books||[]),summary=el('p');
    const save=el('button',existing?'Save collection':'Create collection','primary'),remove=el('button','Delete collection'),footer=el('div',undefined,'action-footer');
    host.append(label,el('p','Group books without moving files. A book can belong to several collections.'),search,summary,list,footer);footer.append(close);if(existing)footer.append(remove);footer.append(save);host.showModal();name.focus();
    let all=[];
    try{for(let page=0;;page++){const result=await api('books?page='+page);all.push(...result.books);if(all.length>=result.total)break;}}catch(err){error.textContent=err.message;save.disabled=true;}
    const draw=()=>{summary.textContent=selected.size+' books selected';list.replaceChildren();for(const book of all.filter(b=>(b.state.metadata?.title||b.title).toLowerCase().includes(search.value.toLowerCase()))){const row=el('label'),check=el('input');check.type='checkbox';check.checked=selected.has(book.id);check.onchange=()=>{if(check.checked)selected.add(book.id);else selected.delete(book.id);summary.textContent=selected.size+' books selected';};row.append(check,el('span',book.state.metadata?.title||book.title));list.append(row);}if(!list.children.length)list.append(el('p','No matching books. You can create an empty collection and add books later.'));};search.oninput=draw;draw();
    save.onclick=async()=>{save.disabled=true;error.textContent='';try{const result=await api('collections',{id:existing?.id,name:name.value,books:[...selected]});await refresh(result.id);await showLibrary();document.dispatchEvent(new Event('folio-library-reset'));host.close();}catch(err){error.textContent=err.message;save.disabled=false;}};
    remove.onclick=async()=>{remove.disabled=true;try{await api('collections/remove',{id:existing.id});await refresh('');await reload();host.close();}catch(err){error.textContent=err.message;remove.disabled=false;}};
  }
  $('add-collection').onclick=()=>void editCollection().catch(err=>$('message').textContent=err.message);
  $('edit-collection').onclick=()=>void editCollection(collections.find(c=>c.id===$('collection-filter').value)).catch(err=>$('message').textContent=err.message);
  $('add-items').onclick=async()=>{
    try{const status=await api('status');if(!status.root){await showLibrary();$('setup').hidden=false;$('setup').dataset.expanded='true';$('folder').focus();$('message').textContent='Choose a library folder first, then use Add items to import your books.';return;}}catch(err){$('message').textContent=err.message;return;}
    const {host,error,close}=dialog('Add items');
    host.append(el('p','Choose PDF, EPUB, CBZ or image files. Folio copies them into your local library; originals stay unchanged. No files leave this device.'));
    const files=el('input');files.type='file';files.multiple=true;files.accept='.pdf,.epub,.cbz,.png,.jpg,.jpeg,.webp,.gif';files.id='import-files';
    const fileLabel=el('label','Ebook files');fileLabel.htmlFor=files.id;fileLabel.append(files);
    const folder=el('input');folder.type='file';folder.multiple=true;folder.setAttribute('webkitdirectory','');folder.id='import-folder';
    const folderLabel=el('label','Or choose a folder (subfolders stay grouped)');folderLabel.htmlFor=folder.id;folderLabel.append(folder);
    const summary=el('p','No files selected.'),progress=el('p'),start=el('button','Import selected files','primary'),footer=el('div',undefined,'action-footer');progress.setAttribute('role','status');start.disabled=true;
    host.append(fileLabel,folderLabel,el('p','Images in the same folder become one book, with pages sorted naturally by filename.'),summary,progress,footer);footer.append(close,start);host.showModal();
    let chosen=[],busy=false,batch;
    const select=input=>{chosen=[...input.files].filter(f=>/\.(pdf|epub|cbz|png|jpe?g|webp|gif)$/i.test(f.name));summary.textContent=`${chosen.length} supported files selected · ${(chosen.reduce((n,f)=>n+f.size,0)/1024/1024).toFixed(1)} MB`;start.disabled=!chosen.length;};
    files.onchange=()=>{folder.value='';select(files);};folder.onchange=()=>{files.value='';select(folder);};
    host.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    start.onclick=async()=>{
      busy=true;start.disabled=true;close.disabled=true;files.disabled=true;folder.disabled=true;error.textContent='';
      try{
        batch=await api('import/begin',{});let count=0;
        for(const file of chosen){progress.textContent=`Copying ${++count} of ${chosen.length}: ${file.name}`;const response=await fetch('/api/import/file?id='+batch.id+'&name='+encodeURIComponent(file.webkitRelativePath||file.name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});const data=await response.json();if(!response.ok)throw new Error(data.error);}
        progress.textContent='Updating your library…';await api('import/finish',{id:batch.id});batch=null;
        await refresh('');await showLibrary();document.dispatchEvent(new Event('folio-library-reset'));$('message').textContent=`Imported ${chosen.length} files into your local library.`;host.close();
      }catch(err){error.textContent=err.message;if(batch)try{await api('import/cancel',{id:batch.id});}catch{};progress.textContent='';}
      finally{busy=false;start.disabled=false;close.disabled=false;files.disabled=false;folder.disabled=false;}
    };
  };
  for(const event of ['folio-preferences','folio-scan-complete'])document.addEventListener(event,()=>void refresh().catch(err=>$('message').textContent=err.message));
  await refresh();
}
