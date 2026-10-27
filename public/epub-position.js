// UTF-16 text offsets plus nearby text survive layout changes and inserted content.
export function textAnchor(text,offset,chapter){
  offset=Math.max(0,Math.min(text.length,offset));
  return {chapter,offset,quote:text.slice(offset,offset+96),prefix:text.slice(Math.max(0,offset-32),offset),suffix:text.slice(offset+96,offset+128)};
}
export function anchorOffset(text,anchor){
  if(!anchor||!Number.isInteger(anchor.offset)||anchor.offset<0)return null;
  const {offset,quote,prefix='',suffix=''}=anchor;
  if(quote&&text.slice(offset,offset+quote.length)===quote&&(!prefix||text.slice(Math.max(0,offset-prefix.length),offset)===prefix))return offset;
  if(quote){let at=text.indexOf(quote),best=null,score=-Infinity;while(at>=0){const before=text.slice(Math.max(0,at-prefix.length),at),after=text.slice(at+quote.length,at+quote.length+suffix.length),rank=(prefix&&before===prefix?2:0)+(suffix&&after===suffix?2:0)-Math.abs(at-offset)/Math.max(1,text.length);if(rank>score){score=rank;best=at;}at=text.indexOf(quote,at+1);}if(best!==null)return best;}
  // If the edition's wording changed, the original chapter/scroll is safer.
  return null;
}
function nodesIn(doc){const walker=doc.createTreeWalker(doc.body,4),nodes=[];let node,offset=0;while(node=walker.nextNode()){nodes.push({node,offset});offset+=node.length;}return nodes;}
export function captureTextPosition(frame,chapter){
  const doc=frame?.contentDocument;if(!doc?.body||frame.dataset.chapterPath!==chapter)return null;
  const nodes=nodesIn(doc),range=doc.createRange();
  for(const {node,offset}of nodes){
    if(!node.length||!node.textContent.trim())continue;
    range.selectNodeContents(node);const rect=range.getBoundingClientRect();if(rect.bottom<=8||rect.top>=frame.contentWindow.innerHeight||!rect.height)continue;
    let low=0,high=node.length-1;
    while(low<high){const mid=Math.floor((low+high)/2);range.setStart(node,mid);range.setEnd(node,mid+1);if(range.getBoundingClientRect().bottom<=8)low=mid+1;else high=mid;}
    return textAnchor(doc.body.textContent,offset+low,chapter);
  }
  return null;
}
export function restoreTextPosition(frame,anchor){
  const doc=frame?.contentDocument;if(!doc?.body||frame.dataset.chapterPath!==anchor?.chapter)return false;
  const offset=anchorOffset(doc.body.textContent,anchor);if(offset===null)return false;
  for(const item of nodesIn(doc)){if(offset<item.offset+item.node.length){const range=doc.createRange(),at=offset-item.offset;range.setStart(item.node,at);range.setEnd(item.node,at+1);frame.contentWindow.scrollBy(0,range.getBoundingClientRect().top-8);return true;}}
  return false;
}
