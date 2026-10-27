import {createHash} from 'node:crypto';

export function previewRelink(library,missingId,replacementId){
  if(library.preferences().incognito)throw new Error('Leave Incognito to transfer reading data.');
  if(library.job.running)throw new Error('Wait for the library scan to finish.');
  const missing=library.book(missingId),replacement=library.book(replacementId);
  if(!missing||missing.available||!replacement?.available||missing.format!==replacement.format)throw new Error('Choose a missing book and an available replacement of the same format.');
  const describe=book=>({id:book.id,source:book.source,title:book.state.metadata?.title||book.title,page:(book.state.page||0)+1,total:book.state.total||0,notes:book.state.notes?.length||0,bookmarks:book.state.bookmarks?.length||0,format:book.format});
  const reading=library.db.prepare('SELECT book,seconds FROM reading WHERE book IN (?,?) ORDER BY book').all(missingId,replacementId);
  const token=createHash('sha256').update(JSON.stringify({root:library.root(),missing,replacement,reading,collections:library.collections()})).digest('hex');
  return {missing:describe(missing),replacement:describe(replacement),token};
}
