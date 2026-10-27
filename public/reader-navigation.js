export function flattenOutline(items,depth=0,result=[]){
  if(depth>20||!Array.isArray(items))return result;
  for(const item of items){
    if(result.length>=1000)break;
    result.push({title:String(item.title||'Untitled section').slice(0,300),dest:item.dest,depth});
    flattenOutline(item.items,depth+1,result);
  }
  return result;
}
export function searchText(text,query){
  const normalize=value=>value.normalize('NFKC').replace(/\s+/g,' ').toLowerCase();
  const value=normalize(text),term=normalize(query).trim();
  if(!term)return null;
  const position=value.indexOf(term);if(position===-1)return null;
  const start=Math.max(0,position-65),end=Math.min(value.length,position+term.length+100);
  return (start?'…':'')+value.slice(start,end)+(end<value.length?'…':'');
}
