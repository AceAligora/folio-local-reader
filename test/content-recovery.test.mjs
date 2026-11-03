import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, copyFile, rm, realpath} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Library} from '../lib/library.mjs';
import {ContentRecovery} from '../lib/content-recovery.mjs';
import {changeQueue, visibleQueue} from '../lib/reading-queue.mjs';

// Root switching simulates a cross-volume copy without assuming a second drive
// exists on the developer's machine or a hosted runner. Every file is generated.
const originalText = 'Generated unchanged ebook bytes.';
async function fixture(run) {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'folio-content-recovery-')));
  const first = path.join(temp, 'Original library'), second = path.join(temp, 'Copied library');
  const database = path.join(temp, 'library.sqlite');
  await mkdir(first); await mkdir(second);
  const context = {temp, first, second, database, library: new Library(database)};
  try {await context.library.configure(first); await run(context);}
  finally {context.library.close(); await rm(temp, {recursive: true, force: true});}
}
const sourceRow = (library, id) => library.db.prepare('SELECT * FROM books WHERE id=?').get(id);
const seconds = (library, id) => library.db.prepare('SELECT seconds FROM reading WHERE book=?').get(id)?.seconds || 0;
const note = (id, text, page = 0) => ({id, text, page, created: 1});
async function copiedPair(context, {baseline = true, replacementName = 'Renamed.pdf'} = {}) {
  const library = context.library;
  await writeFile(path.join(context.first, 'Original.pdf'), originalText); await library.scan();
  const from = library.list().books[0];
  if (baseline) await new ContentRecovery(library).run();
  await copyFile(path.join(context.first, 'Original.pdf'), path.join(context.second, replacementName));
  await rm(path.join(context.first, 'Original.pdf'));
  // The previous-root record remains available=1: configuring another folder
  // does not rescan the old folder. Recovery must still be able to find it.
  await library.configure(context.second); await library.scan();
  const to = library.list().books.find(book => book.source === replacementName);
  assert.notEqual(from.id, to.id);
  return {from, to};
}

test('content baselines include unique PDF/EPUB/CBZ files, exclude image books and reuse unchanged fingerprints', () => fixture(async ({library, first}) => {
  for (const name of ['Only.pdf', 'Only.epub', 'Only.cbz']) await writeFile(path.join(first, name), originalText);
  await mkdir(path.join(first, 'Images')); await writeFile(path.join(first, 'Images', '1.png'), 'generated page');
  await mkdir(path.join(first, 'Hidden')); await writeFile(path.join(first, 'Hidden', 'Excluded.pdf'), 'Generated excluded bytes.');
  await library.scan(); assert.equal(library.duplicateCandidates().length, 0);
  library.preferences({excludedFolders: ['Hidden']});
  const before = library.backup(), recovery = new ContentRecovery(library);
  await recovery.run(); const initial = recovery.result();
  assert.equal(initial.checked, 3); assert.equal(initial.bytes, Buffer.byteLength(originalText) * 3);
  assert.equal(initial.matches.length, 0); assert.ok(initial.remembered >= 3);
  await recovery.run(); assert.equal(recovery.result().bytes, 0);
  assert.deepEqual(library.backup().books, before.books); assert.deepEqual(library.backup().reading, before.reading);
  for (const name of ['Only.pdf', 'Only.epub', 'Only.cbz']) assert.equal(await readFile(path.join(first, name), 'utf8'), originalText);
  assert.equal(library.preferences().networkEnabled, false);
}));

test('fingerprints survive reopen and identify copied/renamed books across simulated library roots', () => fixture(async context => {
  const {from, to} = await copiedPair(context);
  assert.equal(sourceRow(context.library, from.id).available, 1);
  context.library.close(); context.library = new Library(context.database);
  const recovery = new ContentRecovery(context.library); await recovery.run();
  const match = recovery.result().matches.find(item => item.from.id === from.id && item.to.id === to.id);
  assert.ok(match); assert.equal(match.from.root, context.first); assert.equal(match.to.root, context.second);
  assert.match(match.sha256, /^[a-f0-9]{64}$/); assert.ok(match.rememberedAt > 0);
  assert.equal(context.library.book(to.id).state.page, undefined, 'Matching alone must not transfer reading data.');
}));

test('reviewed cross-root recovery preserves source records and merges destination reading data and manual collections', () => fixture(async context => {
  const {library, first, second} = context;
  await writeFile(path.join(first, 'Original.pdf'), originalText); await library.scan();
  const from = library.list().books[0];
  library.save(from.id, {page: 4, total: 20, seconds: 12, flowPosition: {page: 4, fraction: .42}, readerPreferences: {padding: 60}});
  library.details(from.id, {favorite: true, tags: ['source'], notes: [note('11111111-1111-4111-8111-111111111111', 'Source note', 4)], bookmarks: [{page: 4, label: 'Return here'}]});
  changeQueue(library, {id: from.id, action: 'add'});
  const originalCollection = library.saveCollection({name: 'Study', books: [from.id]});
  await new ContentRecovery(library).run();
  const oldRow = sourceRow(library, from.id), oldTime = seconds(library, from.id);
  await copyFile(path.join(first, 'Original.pdf'), path.join(second, 'Renamed.pdf'));
  await writeFile(path.join(second, 'Other.pdf'), 'A different generated book.');
  await library.configure(second); await library.scan();
  const to = library.list().books.find(book => book.source === 'Renamed.pdf');
  const other = library.list().books.find(book => book.source === 'Other.pdf');
  library.save(to.id, {page: 1, total: 20, seconds: 3});
  library.details(to.id, {tags: ['destination'], notes: [note('22222222-2222-4222-8222-222222222222', 'Destination note', 1)], bookmarks: [{page: 1, label: 'Destination mark'}]});
  library.saveCollection({name: 'Study', books: [other.id]});
  const recovery = new ContentRecovery(library); await recovery.run();
  const plan = await recovery.preview(from.id, to.id); let saved, calls = 0;
  const result = await recovery.apply(from.id, to.id, plan.token, async backup => {saved = backup; calls++; return 'before-content-recovery-test.json';});
  assert.equal(calls, 1); assert.equal(result.id, to.id); assert.equal(result.safetyBackup, 'before-content-recovery-test.json');
  assert.equal(saved.books.find(book => book.id === to.id).state.page, 1);
  const restored = library.book(to.id);
  assert.equal(restored.state.page, 4); assert.equal(restored.state.flowPosition.fraction, .42); assert.equal(restored.state.readerPreferences.padding, 60);
  assert.equal(restored.state.favorite, true); assert.equal(restored.state.notes.length, 2); assert.equal(restored.state.bookmarks.length, 2);
  assert.deepEqual([...restored.state.tags].sort(), ['destination', 'source']); assert.equal(seconds(library, to.id), 12);
  assert.deepEqual(visibleQueue(library).map(book => book.id), [to.id]);
  const collection = library.collections().find(item => !item.generated && item.name === 'Study');
  assert.deepEqual(collection.books, [other.id]);
  const recovered = library.collections().find(item => !item.generated && item.name.startsWith('Study (recovered'));
  assert.ok(recovered); assert.ok(recovered.books.includes(to.id)); assert.ok(!recovered.books.includes(other.id));
  assert.deepEqual(sourceRow(library, from.id), oldRow); assert.equal(seconds(library, from.id), oldTime);
  const stored = JSON.parse(library.db.prepare('SELECT value FROM config WHERE key=?').get('collections').value);
  assert.deepEqual(stored.find(item => item.id === originalCollection.id), originalCollection);
  assert.equal(await readFile(path.join(first, 'Original.pdf'), 'utf8'), originalText);
  assert.equal(await readFile(path.join(second, 'Renamed.pdf'), 'utf8'), originalText);
  assert.equal(library.preferences().networkEnabled, false);
}));

test('same-root missing files can be reviewed without automatically merging the replacement', () => fixture(async ({library, first}) => {
  await writeFile(path.join(first, 'Original.pdf'), originalText); await library.scan();
  const from = library.list().books[0]; library.save(from.id, {page: 2, total: 8});
  changeQueue(library, {id: from.id, action: 'add'});
  const recovery = new ContentRecovery(library); await recovery.run();
  await copyFile(path.join(first, 'Original.pdf'), path.join(first, 'Replacement.pdf')); await rm(path.join(first, 'Original.pdf')); await library.scan();
  const to = library.list().books.find(book => book.available); await recovery.run();
  assert.ok(recovery.result().matches.some(item => item.from.id === from.id && item.to.id === to.id));
  assert.equal(library.book(to.id).state.page, undefined);
  const plan = await recovery.preview(from.id, to.id);
  await recovery.apply(from.id, to.id, plan.token, async () => 'safety.json');
  assert.equal(library.book(to.id).state.page, 2); assert.equal(library.book(from.id).available, 0);
  assert.deepEqual(visibleQueue(library).map(book => book.id), [to.id]);
}));

test('books from one previous collection join its recovered collection without merging an unrelated same-name collection', () => fixture(async ({library, first, second}) => {
  await writeFile(path.join(first, 'A.pdf'), 'Original alpha book.'); await writeFile(path.join(first, 'B.pdf'), 'Original beta book.'); await library.scan();
  const sources = library.list().books;
  library.saveCollection({name: 'Shared', books: sources.map(book => book.id)}); await new ContentRecovery(library).run();
  for (const book of sources) await copyFile(path.join(first, book.source), path.join(second, 'Copy-' + book.source));
  await writeFile(path.join(second, 'Other.pdf'), 'Unrelated current book.'); await library.configure(second); await library.scan();
  const other = library.list().books.find(book => book.source === 'Other.pdf');
  const unrelated = library.saveCollection({name: 'Shared', books: [other.id]});
  const recovery = new ContentRecovery(library); await recovery.run(); const destinations = [];
  for (const source of sources) {
    const target = library.list().books.find(book => book.source === 'Copy-' + source.source); destinations.push(target.id);
    const plan = await recovery.preview(source.id, target.id); await recovery.apply(source.id, target.id, plan.token, async () => 'safety.json');
  }
  const current = library.collections().filter(collection => !collection.generated);
  assert.equal(current.length, 2); assert.deepEqual(current.find(collection => collection.id === unrelated.id), unrelated);
  const recovered = current.find(collection => collection.id !== unrelated.id);
  assert.deepEqual([...recovered.books].sort(), destinations.sort()); assert.match(recovered.name, /^Shared \(recovered/);
}));

test('missing baselines, equal-size different bytes and different formats do not produce recovery matches', async () => {
  await fixture(async context => {await copiedPair(context, {baseline: false}); const service = new ContentRecovery(context.library); await service.run(); assert.deepEqual(service.result().matches, []);});
  await fixture(async context => {const {from, to} = await copiedPair(context); await writeFile(path.join(context.second, to.source), 'X'.repeat(Buffer.byteLength(originalText))); await context.library.scan(); const service = new ContentRecovery(context.library); await service.run(); assert.deepEqual(service.result().matches, []); await assert.rejects(service.preview(from.id, to.id));});
  await fixture(async context => {await copiedPair(context, {replacementName: 'Renamed.epub'}); const service = new ContentRecovery(context.library); await service.run(); assert.deepEqual(service.result().matches, []);});
});

test('identical alternative copies remain explicit candidates and recovery never chooses one automatically', () => fixture(async context => {
  const {from, to} = await copiedPair(context);
  await copyFile(path.join(context.second, to.source), path.join(context.second, 'Another copy.pdf')); await context.library.scan();
  const service = new ContentRecovery(context.library); await service.run();
  const matches = service.result().matches.filter(item => item.from.id === from.id);
  assert.equal(matches.length, 2); assert.equal(new Set(matches.map(item => item.to.id)).size, 2);
  for (const match of matches) assert.equal(context.library.book(match.to.id).state.page, undefined);
  await assert.rejects(service.apply(from.id, to.id, 'not-a-reviewed-token', async () => {throw new Error('Should not write a backup for an unreviewed transfer.');}));
}));

test('stale reading-state and file reviews reject application without changing the destination', () => fixture(async context => {
  const {from, to} = await copiedPair(context), service = new ContentRecovery(context.library); await service.run();
  const plan = await service.preview(from.id, to.id); let backups = 0;
  context.library.save(to.id, {page: 1, total: 9});
  await assert.rejects(service.apply(from.id, to.id, plan.token, async () => {backups++; return 'safety.json';}));
  assert.equal(backups, 0); assert.equal(context.library.book(to.id).state.page, 1);
  const fresh = await service.preview(from.id, to.id); assert.notEqual(fresh.token, plan.token);
  await writeFile(path.join(context.second, to.source), 'Y'.repeat(Buffer.byteLength(originalText)));
  await assert.rejects(service.apply(from.id, to.id, fresh.token, async () => {backups++; return 'safety.json';}));
  assert.equal(backups, 0); assert.equal(context.library.book(to.id).state.page, 1);
}));

test('reading changes while the safety backup is being saved cannot be overwritten', () => fixture(async context => {
  const {from, to} = await copiedPair(context), service = new ContentRecovery(context.library); await service.run();
  const plan = await service.preview(from.id, to.id);
  await assert.rejects(service.apply(from.id, to.id, plan.token, async () => {context.library.save(to.id, {page: 6, total: 10}); return 'safety.json';}));
  assert.equal(context.library.book(to.id).state.page, 6);
}));

test('a failed safety backup leaves source and destination reading data unchanged', () => fixture(async context => {
  const {from, to} = await copiedPair(context), service = new ContentRecovery(context.library); await service.run();
  const plan = await service.preview(from.id, to.id), before = context.library.backup(), source = sourceRow(context.library, from.id);
  await assert.rejects(service.apply(from.id, to.id, plan.token, async () => {throw new Error('Generated disk-write failure.');}));
  assert.deepEqual(context.library.backup().books, before.books); assert.deepEqual(context.library.backup().collections, before.collections);
  assert.deepEqual(sourceRow(context.library, from.id), source);
}));

test('fingerprinting respects byte/file bounds, cancellation, Incognito and active scans', async () => {
  await fixture(async ({library, first}) => {
    await writeFile(path.join(first, 'A.pdf'), 'four'); await writeFile(path.join(first, 'B.epub'), 'four'); await library.scan();
    const bytes = new ContentRecovery(library, {maxBytes: 3}); await bytes.run(); assert.equal(bytes.result().limited, true); assert.equal(bytes.result().bytes, 0);
    const files = new ContentRecovery(library, {maxFiles: 1}); await files.run(); assert.equal(files.result().limited, true); assert.equal(files.result().checked, 1);
    library.preferences({incognito: true}); await assert.rejects(files.run()); assert.deepEqual(files.result().matches, []);
    library.preferences({incognito: false}); library.job.running = true;
    try {await assert.rejects(files.run());} finally {library.job.running = false;}
  });
  await fixture(async ({library, first}) => {
    await writeFile(path.join(first, 'A.pdf'), 'four'); await library.scan();
    const original = library.content.bind(library), service = new ContentRecovery(library);
    library.content = async id => {service.cancel(); return original(id);};
    await service.run(); assert.match(service.result().status, /cancel/i); assert.deepEqual(service.result().matches, []);
  });
});

test('changing library root during fingerprinting cancels the job and cannot expose old results', () => fixture(async ({library, first, second}) => {
  await writeFile(path.join(first, 'A.pdf'), 'four'); await library.scan();
  const original = library.content.bind(library), service = new ContentRecovery(library);
  library.content = async id => {const file = await original(id); await library.configure(second); return file;};
  await service.run(); assert.deepEqual(service.result().matches, []); assert.equal(service.result().running, false);
}));
