import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readerShortcut,shortcutDefaults} from '../public/shortcuts.js';
import {validatePreferences} from '../lib/preferences.mjs';

test('reader shortcuts honor custom keys and vertical navigation without overriding browser commands',()=>{
  const event=key=>({key,target:{closest:()=>null}});
  assert.equal(readerShortcut(event('ArrowRight'),{}),'next');assert.equal(readerShortcut(event('f'),{}),'focus');
  const prefs=validatePreferences({shortcutNext:'n',shortcutPrevious:'p'});assert.equal(readerShortcut(event('n'),prefs),'next');assert.equal(readerShortcut(event('ArrowRight'),prefs),null);
  assert.equal(readerShortcut(event('ArrowDown'),{readingMode:'paged-vertical'}),'next');
  for(const flag of ['ctrlKey','metaKey','altKey','shiftKey','isComposing','repeat','defaultPrevented'])assert.equal(readerShortcut({...event('f'),[flag]:true},{}),null);
  assert.equal(readerShortcut(event('f'),{readerShortcuts:false}),null);
});
test('reader shortcuts leave editable fields and native button Space behavior intact',()=>{
  assert.equal(readerShortcut({key:'f',target:{isContentEditable:true}},{}),null);
  assert.equal(readerShortcut({key:'ArrowRight',target:{closest:()=>({})}},{}),null);
  const button={closest:selector=>selector==='button,a,summary'?{}:null};assert.equal(readerShortcut({key:' ',target:button},{shortcutNext:' '}),null);
});
test('shortcut preferences reject collisions and reserved keys and restore defaults together',()=>{
  assert.throws(()=>validatePreferences({shortcutNext:'b'}),/different key/);assert.throws(()=>validatePreferences({shortcutNext:'Escape'}));assert.throws(()=>validatePreferences({shortcutNext:'Ctrl+r'}));
  const custom=validatePreferences({shortcutNext:'n'});assert.equal(validatePreferences(shortcutDefaults,custom).shortcutNext,'ArrowRight');
});
