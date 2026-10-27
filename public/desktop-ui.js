export function initializeDesktop({getPreferences,getReader,flush,openBook}){
  const bridge=window.folioDesktop;if(bridge?.capabilities?.apiVersion!==1)return;
  let previous='',busy=false,openingFile=Promise.resolve(),closing=false;
  const sync=async()=>{if(busy)return;const prefs=getPreferences(),reader=getReader(),state={reading:reader.reading,keepAwake:!!prefs.keepAwake&&!document.hidden,protectCapture:!!prefs.desktopCaptureProtection,showProgress:!!prefs.desktopProgress,progress:reader.progress};const signature=JSON.stringify(state);if(signature===previous)return;busy=true;try{await bridge.syncReader(state);previous=signature;}catch{previous='';}finally{busy=false;}};
  bridge.onClosing(async()=>{closing=true;try{await openingFile;await flush();}finally{closing=false;}});
  if(bridge.onOpenFiles&&openBook){
    const panel=document.createElement('section');panel.className='desktop-open-panel';panel.hidden=true;panel.setAttribute('aria-label','Ebooks opened from Windows');document.querySelector('main').prepend(panel);
    let pending=[],working=false;const seen=new Set(),errors=new Map();
    const draw=()=>{panel.replaceChildren();panel.hidden=!pending.length;const title=document.createElement('h2');title.textContent='Opening selected ebooks';panel.append(title);for(const file of pending){const row=document.createElement('div');row.className='desktop-open-row';const name=document.createElement('span');name.textContent=file.name;row.append(name);const open=document.createElement('button');open.textContent=errors.has(file.id)?'Retry Open':'Open';open.disabled=working;open.onclick=()=>void read(file);row.append(open);const dismiss=document.createElement('button');dismiss.textContent='Dismiss';dismiss.disabled=working;dismiss.onclick=()=>bridge.dismissFile(file.id);row.append(dismiss);if(errors.has(file.id)){const message=document.createElement('p');message.setAttribute('role','alert');message.textContent=errors.get(file.id);row.append(message);}panel.append(row);}const hint=document.createElement('p');hint.textContent='Existing library files resume in place. Other files are copied into your chosen library; originals stay unchanged.';panel.append(hint);};
    const read=async file=>{if(working||closing)return;working=true;let finished;openingFile=new Promise(resolve=>finished=resolve);errors.delete(file.id);draw();try{const result=await bridge.openFile(file.id),response=await fetch('/api/book/'+encodeURIComponent(result.bookId));if(!response.ok)throw new Error('The selected book could not be loaded. Find it in Library.');await openBook(await response.json());}catch(error){errors.set(file.id,error.message);}finally{working=false;finished();draw();void next();}};
    const next=async()=>{if(working||closing)return;const file=pending.find(file=>!seen.has(file.id));if(file){seen.add(file.id);await read(file);}};
    bridge.onOpenFiles(files=>{pending=files;draw();void next();});
  }
  const timer=setInterval(()=>void sync(),1000);
  for(const event of ['folio-preferences','visibilitychange'])document.addEventListener(event,()=>void sync());
  window.addEventListener('focus',()=>void sync());window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
  void sync();
}
