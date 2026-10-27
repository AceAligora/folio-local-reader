import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from '../public/vendor/fflate/esm/browser.js';
import {unpackEpub} from '../public/epub-reader.js';
test('EPUB extraction accepts bounded archives and rejects traversal and expansion bombs',()=>{
  const safe=zipSync({'META-INF/container.xml':strToU8('<container/>'),'chapter.xhtml':strToU8('<p>Hello</p>')});
  assert.equal(new TextDecoder().decode(unpackEpub(safe)['chapter.xhtml']),'<p>Hello</p>');
  assert.throws(()=>unpackEpub(zipSync({'../escape':strToU8('bad')})),/path/);
  assert.throws(()=>unpackEpub(zipSync({'large':new Uint8Array(21*1024*1024)})),/limits/);
});
