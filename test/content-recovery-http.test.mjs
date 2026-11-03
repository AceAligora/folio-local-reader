import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, copyFile, rm, realpath} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {Library} from '../lib/library.mjs';
import {ContentRecovery} from '../lib/content-recovery.mjs';

test('HTTP recovery requires review, saves a safety backup, preserves previous roots and enforces Incognito/app lock', async () => {
  const temporaryRoot = await realpath(os.tmpdir());
  const temp = await realpath(await mkdtemp(path.join(temporaryRoot, 'folio-recovery-http-')));
  const first = path.join(temp, 'Previous library'), second = path.join(temp, 'Current library'), profile = path.join(temp, 'profile');
  await mkdir(first); await mkdir(second); await mkdir(profile);
  const database = path.join(profile, 'library.sqlite'), text = 'Generated original file for HTTP recovery checks.';
  let library = new Library(database), child, exited;
  try {
    library.preferences({watchLibrary: false, automaticBackups: false});
    await library.configure(first); await writeFile(path.join(first, 'Original.pdf'), text); await library.scan();
    const from = library.list().books[0]; library.save(from.id, {page: 3, total: 10, seconds: 9});
    library.details(from.id, {favorite: true});
    const originalCollection = library.saveCollection({name: 'Recovered study', books: [from.id]});
    await new ContentRecovery(library).run();
    const originalRow = library.db.prepare('SELECT * FROM books WHERE id=?').get(from.id);
    await copyFile(path.join(first, 'Original.pdf'), path.join(second, 'Renamed.pdf'));
    await library.configure(second); await library.scan();
    const to = library.list().books[0]; library.save(to.id, {page: 1, total: 10, seconds: 2});
    library.close(); library = null;

    const serverEntry = fileURLToPath(new URL('../server.mjs', import.meta.url));
    child = spawn(process.execPath, [serverEntry], {cwd: path.dirname(serverEntry), windowsHide: true,
      env: {...process.env, EBOOK_PROFILE: profile, EBOOK_LIBRARY: '', PORT: '0'}, stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
    exited = new Promise(resolve => child.once('exit', resolve));
    let diagnostics = ''; child.stdout.on('data', chunk => {diagnostics = (diagnostics + chunk).slice(-16000);});
    child.stderr.on('data', chunk => {diagnostics = (diagnostics + chunk).slice(-16000);});
    const origin = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Generated recovery server did not start: ' + diagnostics)), 10000);
      child.once('error', error => {clearTimeout(timer); reject(error);});
      child.once('exit', () => {clearTimeout(timer); reject(new Error('Generated recovery server exited: ' + diagnostics));});
      child.on('message', message => {if (message.type === 'folio:ready') {clearTimeout(timer); resolve(message.origin);}});
    });
    assert.equal((await fetch(origin + '/api/recovery')).status, 401);
    const module = await fetch(origin + '/content-recovery.js');
    assert.equal(module.status, 200); assert.match(module.headers.get('content-type'), /javascript/); assert.ok((await module.text()).length > 100);
    const jar = new Map();
    const acceptCookies = response => {for (const cookie of response.headers.getSetCookie()) {const value = cookie.split(';')[0], split = value.indexOf('='); jar.set(value.slice(0, split), value.slice(split + 1));}};
    const home = await fetch(origin); acceptCookies(home); await home.body.cancel();
    const api = async (route, data) => {
      const response = await fetch(origin + '/api/' + route, {method: data === undefined ? 'GET' : 'POST',
        headers: {cookie: [...jar].map(([key, value]) => key + '=' + value).join('; '), origin, ...(data === undefined ? {} : {'Content-Type': 'application/json'})},
        ...(data === undefined ? {} : {body: JSON.stringify(data)})});
      acceptCookies(response); return {status: response.status, data: await response.json()};
    };
    const prepared = await api('recovery/prepare', {}); assert.equal(prepared.status, 202);
    const deadline = Date.now() + 5000; let result;
    do {
      result = await api('recovery'); assert.equal(result.status, 200);
      if (!result.data.running) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    } while (Date.now() < deadline);
    assert.equal(result.data.running, false);
    assert.ok(result.data.matches.some(match => match.from.id === from.id && match.to.id === to.id));
    const ids = {from: from.id, to: to.id};
    assert.equal((await api('recovery/apply', ids)).status, 400);
    const preview = await api('recovery/preview', ids); assert.equal(preview.status, 200);
    assert.equal(preview.data.from.root, first); assert.equal(preview.data.to.root, second);
    await api('state/' + to.id, {page: 2, total: 10});
    assert.equal((await api('recovery/apply', {...ids, token: preview.data.token})).status, 400);
    const fresh = await api('recovery/preview', ids); assert.equal(fresh.status, 200);
    assert.notEqual(fresh.data.token, preview.data.token);
    const applied = await api('recovery/apply', {...ids, token: fresh.data.token}); assert.equal(applied.status, 200);
    assert.equal(applied.data.id, to.id); assert.match(applied.data.safetyBackup, /^before-content-recovery-[a-z0-9-]+\.json$/);
    const safety = JSON.parse(await readFile(path.join(profile, 'backups', applied.data.safetyBackup), 'utf8'));
    assert.equal(safety.books.find(book => book.id === to.id).state.page, 2);
    const book = await api('book/' + to.id); assert.equal(book.data.state.page, 3); assert.equal(book.data.state.favorite, true);
    const backup = await api('backup'); assert.equal(backup.data.reading.find(book => book.id === to.id).seconds, 9);
    assert.ok(backup.data.collections.some(collection => collection.name === 'Recovered study' && collection.books.includes(to.id)));
    const readonly = new DatabaseSync(database, {readOnly: true});
    try {
      assert.deepEqual(readonly.prepare('SELECT * FROM books WHERE id=?').get(from.id), originalRow);
      assert.equal(readonly.prepare('SELECT seconds FROM reading WHERE book=?').get(from.id).seconds, 9);
      const collections = JSON.parse(readonly.prepare('SELECT value FROM config WHERE key=?').get('collections').value);
      assert.deepEqual(collections.find(collection => collection.id === originalCollection.id), originalCollection);
    } finally {readonly.close();}
    assert.equal(await readFile(path.join(first, 'Original.pdf'), 'utf8'), text);
    assert.equal(await readFile(path.join(second, 'Renamed.pdf'), 'utf8'), text);

    assert.equal((await api('preferences', {incognito: true})).status, 200);
    assert.deepEqual((await api('recovery')).data.matches, []);
    for (const [route, data] of [['recovery/prepare', {}], ['recovery/preview', ids], ['recovery/apply', {...ids, token: fresh.data.token}]]) assert.equal((await api(route, data)).status, 400);
    assert.equal((await api('recovery/cancel', {})).status, 200);
    await api('preferences', {incognito: false});
    const password = 'generated recovery test password';
    assert.equal((await api('lock/setup', {password})).status, 200);
    assert.equal((await api('lock/now', {})).status, 200);
    assert.equal((await api('recovery')).status, 423);
    for (const [route, data] of [['recovery/prepare', {}], ['recovery/cancel', {}], ['recovery/preview', ids], ['recovery/apply', {...ids, token: fresh.data.token}]]) assert.equal((await api(route, data)).status, 423);
    assert.equal((await api('lock/unlock', {password})).status, 200);
    assert.equal((await api('recovery')).status, 200);
    assert.equal((await api('preferences')).data.networkEnabled, false);
    assert.equal((await api('shutdown', {})).status, 200);
    await exited;
  } finally {
    library?.close();
    if (child && child.exitCode === null) {child.kill(); await exited;}
    if (path.dirname(temp) !== temporaryRoot) throw new Error('Generated test cleanup escaped its temporary directory.');
    await rm(temp, {recursive: true, force: true});
  }
});
