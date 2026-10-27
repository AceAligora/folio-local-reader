import {test} from 'node:test';
import assert from 'node:assert/strict';
import {textAnchor,anchorOffset} from '../public/epub-position.js';
import {validateState} from '../lib/backup.mjs';
test('EPUB character anchors recover text after insertions, disambiguate repeated quotes and survive backups',()=>{
  const sentence='The same opening sentence. '.repeat(8),original='A first context. '+sentence+'A different context. '+sentence+'The end.',offset=original.lastIndexOf(sentence),anchor=textAnchor(original,offset,'Text/chapter.xhtml');
  assert.equal(anchorOffset(original,anchor),offset);
  const changed='New preface. '+original;assert.equal(anchorOffset(changed,anchor),offset+13);
  assert.deepEqual(validateState({epubAnchor:anchor}).epubAnchor,anchor);
  assert.equal(anchorOffset('Entirely replaced content',anchor),null);
  assert.throws(()=>validateState({epubAnchor:{...anchor,offset:-1}}));assert.throws(()=>validateState({epubAnchor:{...anchor,quote:'x'.repeat(97)}}));
  const unicode='Hello 👋 世界. '+sentence;const at=unicode.indexOf('世界');assert.equal(anchorOffset(unicode,textAnchor(unicode,at,'c')),at);
});
