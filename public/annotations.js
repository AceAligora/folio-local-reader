export const annotationColors=Object.freeze({yellow:'#fff0a6',green:'#c7ebd4',blue:'#cce2ff',pink:'#ffd1e3',purple:'#e3d5ff'});
export const annotationColor=note=>Object.hasOwn(annotationColors,note?.color)?note.color:'yellow';
export function annotationFields(note){
  const result={};
  if('color'in note){if(!Object.hasOwn(annotationColors,note.color))throw new Error('Choose a supported note color.');result.color=note.color;}
  if('tags'in note){if(!Array.isArray(note.tags)||note.tags.length>20||note.tags.some(t=>typeof t!=='string'||!t.trim()||t.trim().length>60||/[\x00-\x1f,]/.test(t)))throw new Error('Use up to 20 note tags, each 1–60 characters, separated by commas.');result.tags=[...new Set(note.tags.map(t=>t.trim()))];}
  return result;
}
export function sameAnnotation(a,b){
  if(!a||!b)return a===b;
  const fields=n=>[n.id,n.page,n.text,n.quote||'',annotationColor(n),n.tags||[],n.created||0];
  return JSON.stringify(fields(a))===JSON.stringify(fields(b));
}
export const normalizedQuote=text=>text.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
// PDF highlights remain text-item based, scoped to the recorded page.
export function annotationMatches(text,notes,page,query=''){
  const matches=[];
  for(const note of notes||[]){if(note.page!==page||!note.quote)continue;const term=normalizedQuote(note.quote);if(!term)continue;let at=text.indexOf(term),count=0;while(at>=0&&count++<200&&matches.length<1000){matches.push({start:at,end:at+term.length,color:annotationColor(note),kind:'note'});at=text.indexOf(term,at+term.length);}}
  const term=normalizedQuote(query);if(term){let at=text.indexOf(term),count=0;while(at>=0&&count++<200){matches.push({start:at,end:at+term.length,kind:'search'});at=text.indexOf(term,at+term.length);}}
  return matches;
}
// Mark the first exact quote in a chapter, including quotes split by inline tags.
export function applyEpubAnnotations(doc,notes){
  for(const mark of doc.querySelectorAll('mark[data-folio-highlight]'))mark.replaceWith(...mark.childNodes);
  doc.body.normalize();const walker=doc.createTreeWalker(doc.body,4),nodes=[];let node,text='';
  while(node=walker.nextNode()){nodes.push({node,start:text.length,end:text.length+node.length});text+=node.textContent;}
  const matches=[];for(const note of notes||[]){if(!note.quote)continue;const at=text.indexOf(note.quote);if(at>=0&&!matches.some(m=>m.start<at+note.quote.length&&m.end>at))matches.push({start:at,end:at+note.quote.length,color:annotationColor(note)});}
  for(const entry of nodes){const ranges=matches.filter(m=>m.end>entry.start&&m.start<entry.end).sort((a,b)=>b.start-a.start);for(const range of ranges){const start=Math.max(0,range.start-entry.start),end=Math.min(entry.node.length,range.end-entry.start);if(end<=start)continue;const selected=entry.node.splitText(start);selected.splitText(end-start);const mark=doc.createElement('mark');mark.dataset.folioHighlight=range.color;mark.style.backgroundColor=annotationColors[range.color];mark.style.color='#17212b';mark.textContent=selected.textContent;selected.replaceWith(mark);}}
}
export function notebookEntries(books,{query='',tag='',color='',kind='all',sort='book'}={}){
  const term=query.normalize('NFKC').toLowerCase().trim(),entries=[];
  for(const book of books)for(const note of book.state.notes||[]){
    if(tag&&!(note.tags||[]).includes(tag)||color&&annotationColor(note)!==color||kind==='highlights'&&!note.quote||kind==='notes'&&note.quote)continue;
    const text=[book.title,book.state.metadata?.title,book.state.metadata?.author,note.text,note.quote,...(book.state.tags||[]),...(note.tags||[])].filter(Boolean).join(' ').normalize('NFKC').toLowerCase();
    if(!term||text.includes(term))entries.push({book,note});
  }
  return entries.sort((a,b)=>sort==='newest'?(b.note.created||0)-(a.note.created||0)||a.note.id.localeCompare(b.note.id):(a.book.state.metadata?.title||a.book.title).localeCompare(b.book.state.metadata?.title||b.book.title,'en',{numeric:true})||a.book.id.localeCompare(b.book.id)||a.note.page-b.note.page||(a.note.created||0)-(b.note.created||0));
}
const literal=text=>String(text||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replace(/[\\`*_[\]#!|]/g,'\\$&');
export function notesMarkdown(books,options={}){
  const entries=notebookEntries(books,options);let output='# Folio reading notes\n\n',bookId;
  for(const {book,note}of entries){if(book.id!==bookId){output+='## '+literal(book.state.metadata?.title||book.title)+'\n\nSource: '+literal(book.source||'')+'\n\n';bookId=book.id;}output+='### '+(book.format==='epub'?'Chapter ':'Page ')+(note.page+1)+'\n\n';if(note.quote)output+='> '+literal(note.quote).replaceAll('\n','\n> ')+'\n\n';if(note.text!==note.quote)output+=literal(note.text)+'\n\n';output+='Color: '+annotationColor(note)+'\n';if(note.tags?.length)output+='Tags: '+note.tags.map(literal).join(', ')+'\n';output+='\n';}
  return output;
}
