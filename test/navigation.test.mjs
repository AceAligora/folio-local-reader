import {test} from 'node:test';
import assert from 'node:assert/strict';
import {flattenOutline,searchText} from '../public/reader-navigation.js';
test('outline navigation preserves nested destinations without following external actions and caps malformed trees',()=>{
 const tree=[{title:'Part one',dest:'p1',items:[{title:'Chapter 1',dest:[3]}]},{title:'External website',url:'https://example.com'}];
 assert.deepEqual(flattenOutline(tree),[{title:'Part one',dest:'p1',depth:0},{title:'Chapter 1',dest:[3],depth:1},{title:'External website',dest:undefined,depth:0}]);
 const cyclic={title:'cycle'};cyclic.items=[cyclic];assert.equal(flattenOutline([cyclic]).length,21);assert.equal(flattenOutline(Array(1100).fill({title:'x'})).length,1000);
});
test('local PDF text matching handles ligatures, case and wrapped whitespace with bounded snippets',()=>{
 assert.equal(searchText('A PDF about ofﬁce\n planning.','OFFICE planning'),'a pdf about office planning.');assert.equal(searchText('Nothing here','missing'),null);assert.equal(searchText('Text','   '),null);assert.ok(searchText('a'.repeat(500)+'target'+'b'.repeat(500),'target').length<180);
});
