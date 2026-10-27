import {excludedSource} from './scan-policy.mjs';

export function readingQueue(library){return library.db.prepare('SELECT * FROM books WHERE root=?').all(library.root()).map(b=>library.decode(b)).filter(b=>Number.isInteger(b.state.queueRank)).sort((a,b)=>a.state.queueRank-b.state.queueRank||a.id.localeCompare(b.id));}
export function visibleQueue(library){return readingQueue(library).filter(b=>!excludedSource(b.source,library.preferences().excludedFolders));}
export function changeQueue(library,{id,action}){
  if(library.preferences().incognito)throw new Error('Leave Incognito to change your reading queue.');
  if(!['add','remove','up','down'].includes(action))throw new Error('Invalid queue action.');
  const book=library.book(id);if(!book||excludedSource(book.source,library.preferences().excludedFolders))throw new Error('Choose a book in this library.');
  const books=readingQueue(library),index=books.findIndex(b=>b.id===id);
  if(action==='add'&&index<0){if(books.length>=500)throw new Error('The reading queue holds up to 500 books.');books.push(book);}
  else if(action==='remove'&&index>=0)books.splice(index,1);
  else if(action==='up'&&index>0)[books[index-1],books[index]]=[books[index],books[index-1]];
  else if(action==='down'&&index>=0&&index<books.length-1)[books[index+1],books[index]]=[books[index],books[index+1]];
  library.db.exec('BEGIN IMMEDIATE');
  try{const update=library.db.prepare('UPDATE books SET state=? WHERE id=?');if(action==='remove'){const state={...book.state};delete state.queueRank;update.run(JSON.stringify(state),id);}books.forEach((item,rank)=>update.run(JSON.stringify({...item.state,queueRank:rank}),item.id));library.db.exec('COMMIT');}catch(error){library.db.exec('ROLLBACK');throw error;}
  return visibleQueue(library);
}
