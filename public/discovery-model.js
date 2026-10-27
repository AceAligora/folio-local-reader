export function selectFeaturedBooks(recent,history,limit=4){
  const ongoing=history.filter(book=>book.available&&book.state.status!=='finished');
  const seen=new Set(),books=[];
  for(const book of [...ongoing,...recent]){if(!book.available||seen.has(book.id))continue;seen.add(book.id);books.push(book);if(books.length>=limit)break;}
  return {ongoing:ongoing.length>0,books};
}
