import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectFeaturedBooks} from '../public/discovery-model.js';

const book=(id,available=1,status='unread')=>({id,available,state:{status}});
test('discovery prioritizes unfinished local books, keeps ordering and fills without duplicate book records',()=>{
  const a=book('a',1,'reading'),b=book('b'),c=book('c'),d=book('d'),e=book('e');
  const result=selectFeaturedBooks([b,a,c,d,e],[a]);
  assert.equal(result.ongoing,true);assert.deepEqual(result.books.map(book=>book.id),['a','b','c','d']);
});
test('unavailable and completed history records do not create a false continue-reading shelf',()=>{
  const result=selectFeaturedBooks([book('missing',0),book('available')],[book('old',1,'finished'),book('offline',0,'reading')]);
  assert.equal(result.ongoing,false);assert.deepEqual(result.books.map(book=>book.id),['available']);
});
test('discovery has an honest empty state and never invents books to fill a row',()=>{
  assert.deepEqual(selectFeaturedBooks([],[]),{ongoing:false,books:[]});
  assert.deepEqual(selectFeaturedBooks([book('only'),book('only')],[]).books.map(book=>book.id),['only']);
});
