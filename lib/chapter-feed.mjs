import {createHash} from 'node:crypto';
import {DOMParser,XMLSerializer} from './vendor/xmldom/lib/index.js';
import {sourceURL} from './source-policy.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const children=node=>Array.from(node?.childNodes||[]).filter(child=>child.nodeType===1);
const tag=node=>(node.localName||node.nodeName||'').toLowerCase();
const child=(node,name)=>children(node).find(item=>tag(item)===name);
const text=(node,name)=>String(child(node,name)?.textContent||'').trim();
export const escapeXML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function parse(raw,type='application/xml'){
  if(typeof raw!=='string'||Buffer.byteLength(raw)>2*1024*1024||/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(raw))throw new Error('Unsupported or oversized feed/document. DTDs and entities are not allowed.');
  let nodes=0,depth=0;const structure=raw.replace(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->/g,'');for(const token of structure.matchAll(/<\/?[A-Za-z][^>]*>/g)){if(++nodes>30000)throw new Error('Source document has too many elements.');if(token[0].startsWith('</'))depth--;else if(!token[0].endsWith('/>'))depth++;if(type==='application/xml'&&depth>128)throw new Error('Source document is too deeply nested.');}
  return new DOMParser({onError(level){if(type==='application/xml'||level==='fatalError')throw new Error('Malformed source document.');}}).parseFromString(raw,type);
}
export function chapterText(raw,{html=true,article=false}={}){
  if(!html)return String(raw).replace(/\r\n?/g,'\n').trim().slice(0,500000);
  if(!raw)return '';const cleaned=raw.replace(/<!doctype\s+html\s*>/ig,'');const document=parse(article?cleaned:'<div>'+cleaned+'</div>','text/html');let target=document.documentElement;
  if(article){
    const all=Array.from(document.getElementsByTagName('*'));
    if(all.some(node=>tag(node)==='input'&&node.getAttribute('type')?.toLowerCase()==='password'))throw new Error('This chapter requires signing in; open its source session.');
    target=all.find(node=>/(^|\s)(entry-content|chapter-content|reader-content)(\s|$)/.test(node.getAttribute('class')||''))||all.find(node=>tag(node)==='article')||all.find(node=>tag(node)==='main');
    if(!target)throw new Error('No supported chapter article found. Use the source page or a full-content feed.');
  }
  const parts=[],stack=[{node:target,depth:0}];let count=0;
  while(stack.length){const {node,depth,after}=stack.pop();if(++count>60000||depth>128)throw new Error('Chapter document exceeds safe parsing limits.');if(after){parts.push('\n\n');continue;}if(node.nodeType===3||node.nodeType===4){parts.push(node.data.replace(/\s+/g,' '));continue;}if(node.nodeType!==1)continue;const name=tag(node);if(['script','style','iframe','object','embed','svg','math','form','input','button','nav','aside','header','footer','noscript','template','img'].includes(name)||node.getAttribute('aria-hidden')==='true'||node.hasAttribute('hidden')||/display\s*:\s*none/i.test(node.getAttribute('style')||''))continue;
    if(['br','hr'].includes(name))parts.push('\n\n');if(/^(p|div|section|article|main|blockquote|li|h[1-6]|pre)$/.test(name)){parts.push('\n\n');stack.push({after:true,depth,node});}
    for(const item of Array.from(node.childNodes).reverse())stack.push({node:item,depth:depth+1});
  }
  const result=parts.join('').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();if(result.length>500000)throw new Error('This chapter exceeds the 500,000-character limit.');return result;
}
export function parseChapterFeed(raw,address){
  const base=sourceURL(address),doc=parse(raw),root=doc.documentElement,atom=tag(root)==='feed';
  const channel=atom?root:tag(root)==='rss'?child(root,'channel'):null;if(!channel)throw new Error('Use an RSS 2.0 or Atom chapter feed.');
  const nodes=children(channel).filter(node=>tag(node)===(atom?'entry':'item'));if(nodes.length>500)throw new Error('A feed may expose at most 500 entries per check.');
  const entries=[],ids=new Set();
  for(const node of nodes){
    const href=atom?children(node).find(item=>tag(item)==='link'&&(!item.getAttribute('rel')||item.getAttribute('rel')==='alternate'))?.getAttribute('href'):text(node,'link');let url;try{url=sourceURL(href,base);if(!href||url.origin!==base.origin)continue;}catch{continue;}
    const identity=text(node,atom?'id':'guid')||url.href,id=hash(identity);if(ids.has(id))throw new Error('The feed contains duplicate chapter identifiers.');ids.add(id);
    let content='',kind='link';const full=atom?child(node,'content'):children(node).find(item=>tag(item)==='encoded'&&item.namespaceURI==='http://purl.org/rss/1.0/modules/content/');
    if(full&&!full.getAttribute('src')){const type=full.getAttribute('type')||'text';if(atom&&type==='xhtml'){content=chapterText(new XMLSerializer().serializeToString(full));kind='content';}else if(!atom||['html','text','text/html','text/plain'].includes(type)){content=chapterText(full.textContent,{html:!atom||['html','text/html'].includes(type)});kind=content?'content':'link';}}
    const title=chapterText(text(node,'title'),{html:true}).slice(0,300)||'Untitled chapter';const published=Date.parse(text(node,atom?'published':'pubdate')||text(node,'updated'))||0;
    entries.push({id,title,url:url.href,published,content,kind,revision:hash(JSON.stringify({title,url:url.href,content}))});
  }
  // Ascending publication dates; equal/unknown dates retain reverse feed order, typical newest-first feeds.
  entries.reverse();entries.sort((a,b)=>a.published-b.published);
  return {title:chapterText(text(channel,'title'),{html:true}).slice(0,150)||base.hostname,entries};
}
