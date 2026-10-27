export function spreadPages(index,total,layout='single',separateFirst=true,wide=false){
  if(total<1)return [];
  const page=Math.max(0,Math.min(total-1,index));
  if(layout==='single'||(layout==='auto'&&!wide))return [page];
  if(separateFirst&&page===0)return [0];
  const offset=separateFirst?1:0;
  const start=offset+Math.floor((page-offset)/2)*2;
  return [start,start+1].filter(p=>p<total);
}
export function adjacentSpread(index,total,direction,layout,separateFirst,wide){
  const pages=spreadPages(index,total,layout,separateFirst,wide);
  if(!pages.length)return 0;
  return Math.max(0,Math.min(total-1,direction>0?pages.at(-1)+1:pages[0]-1));
}
