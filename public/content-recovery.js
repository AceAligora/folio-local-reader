const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
async function api(route,data){const response=await fetch('/api/recovery'+route,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),result=await response.json();if(!response.ok)throw new Error(result.error);return result;}
export async function mountContentRecovery(host){
  const section=el('section');section.className='settings-card';
  section.append(el('h2','Recover books moved to another drive'),el('p','Remember file contents before moving your library. After choosing and scanning the new folder, prepare again to find exact PDF, EPUB and CBZ copies. Matches use the last remembered contents, not filenames. Image folders and books without a remembered fingerprint still use manual relinking.'));
  const prepare=el('button','Prepare recovery fingerprints'),cancel=el('button','Stop recovery check'),progress=el('p'),select=el('select'),review=el('button','Review matching copy'),apply=el('button','Apply reviewed recovery'),detail=el('p');
  cancel.hidden=true;review.disabled=apply.disabled=true;select.setAttribute('aria-label','Remembered book match');progress.setAttribute('role','status');detail.setAttribute('role','status');
  const actions=el('div');actions.className='row';actions.append(prepare,cancel);section.append(actions,progress,select,review,apply,detail);host.append(section);
  let matches=[],plan=null,timer;
  const reset=()=>{plan=null;apply.disabled=true;detail.textContent='';};
  const selected=()=>matches[Number(select.value)];select.onchange=reset;
  const refresh=async()=>{
    clearTimeout(timer);if(!section.isConnected)return;
    try{
      const data=await api(''),old=selected();matches=data.matches;
      select.replaceChildren(...matches.map((match,index)=>new Option(match.from.source+' → '+match.to.source+' (from '+match.from.root+')',String(index))));
      if(old){const retained=matches.findIndex(match=>match.from.id===old.from.id&&match.to.id===old.to.id);if(retained>=0)select.value=String(retained);else reset();}
      prepare.disabled=data.running;cancel.hidden=!data.running;select.disabled=data.running||!matches.length;review.disabled=data.running||!matches.length;
      progress.textContent=data.status+' · '+data.remembered+' '+(data.remembered===1?'file':'files')+' remembered here · '+data.checked+' '+(data.checked===1?'file':'files')+' read · '+(data.bytes/1024/1024).toFixed(1)+' MB read. '+matches.length+' '+(matches.length===1?'match':'matches')+(matches.length===200?' (showing up to 200)':'')+'.'+(data.stale?' Library changed; prepare again.':'');
      for(const issue of data.issues.slice(0,3))progress.textContent+=' '+issue.source+': '+issue.message;
      if(data.limited)progress.textContent+=' Preparation reads up to 200 files or 2 GB per pass; run again to continue. Files larger than 2 GB require manual relinking.';
      if(data.running)timer=setTimeout(()=>void refresh(),800);
    }catch(error){progress.textContent=error.message;prepare.disabled=false;}
  };
  prepare.onclick=async()=>{reset();prepare.disabled=true;try{await api('/prepare',{});await refresh();}catch(error){progress.textContent=error.message;prepare.disabled=false;}};
  cancel.onclick=async()=>{try{await api('/cancel',{});await refresh();}catch(error){progress.textContent=error.message;}};
  review.onclick=async()=>{
    reset();const match=selected();if(!match)return;review.disabled=true;
    try{plan=await api('/preview',{from:match.from.id,to:match.to.id});detail.textContent='From '+plan.from.root+' / '+plan.from.source+' (page '+plan.from.page+', '+plan.from.notes+' notes) to '+plan.to.source+'. Contents match the fingerprint saved '+new Date(plan.rememberedAt).toLocaleString()+'. Recovery uses the previous record’s position and preferences, combines notes/bookmarks/tags, retains the larger reading-time total and carries manual collection membership. Previous-library records and ebook files are retained. A safety backup is saved first.';apply.disabled=false;}
    catch(error){detail.textContent=error.message;}finally{review.disabled=false;}
  };
  apply.onclick=async()=>{
    if(!plan)return;apply.disabled=true;prepare.disabled=true;review.disabled=true;cancel.hidden=false;detail.textContent='Verifying the complete replacement file before recovering reading data…';
    try{const result=await api('/apply',{from:plan.from.id,to:plan.to.id,token:plan.token});plan=null;detail.textContent='Reading data recovered. Safety backup: '+result.safetyBackup;document.dispatchEvent(new Event('folio-library-reset'));}
    catch(error){plan=null;detail.textContent=error.message+' Review again before applying.';}
    finally{cancel.hidden=true;await refresh();}
  };
  await refresh();
}
