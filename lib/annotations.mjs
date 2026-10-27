import {validateState} from './backup.mjs';
import {sameAnnotation} from '../public/annotations.js';

export function changeAnnotation(library,bookId,{operation,note,previous=null}){
  if(!['save','remove'].includes(operation))throw new Error('Invalid note action.');
  const book=library.book(bookId);if(!book)throw new Error('Book not found.');
  const checked=validateState({notes:[note]}).notes[0],notes=book.state.notes||[],existing=notes.find(n=>n.id===checked.id)||null;
  if(previous!==null)validateState({notes:[previous]});
  if(!sameAnnotation(existing,previous))throw new Error('This note changed elsewhere. Reopen the notebook or book before editing it again.');
  if(operation==='remove'&&!existing)throw new Error('Note not found.');
  const next=notes.filter(n=>n.id!==checked.id);if(operation==='save')next.push({...checked,...(existing?{created:existing.created}:{} )});
  library.details(bookId,{notes:next});return {notes:library.book(bookId).state.notes};
}
