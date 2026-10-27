import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, readdir, rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import updates from '../desktop/updates.cjs';
import menus from '../desktop/update-menu.cjs';

const bytes = Buffer.from('generated installer bytes, never executed');
const hash = createHash('sha256').update(bytes).digest('hex');
function fixture() {
  const version = '0.10.0', base = `https://github.com/${updates.REPOSITORY}/releases/download/v${version}/`;
  const installer = {kind: 'installer', name: `Folio-Setup-${version}-windows-x64-unsigned.exe`, size: bytes.length, sha256: hash};
  const manifest = {format: 'folio-release-v1', version, platform: 'win32', arch: 'x64', signing: 'unsigned', artifacts: [installer]};
  const release = {tag_name: 'v' + version, draft: false, prerelease: false, published_at: '2026-10-27T00:00:00Z', assets: [
    {name: `Folio-${version}-release-manifest.json`, state: 'uploaded', size: 1000, browser_download_url: base + `Folio-${version}-release-manifest.json`},
    {...installer, state: 'uploaded', digest: 'sha256:' + hash, browser_download_url: base + installer.name}
  ]};
  return {release, manifest};
}
function transport({release, manifest}, {payload = bytes, requests = []} = {}) {
  return async (url, options) => {
    requests.push(url); assert.equal(options.redirect, 'manual');
    if (url === updates.LATEST) return Response.json(release);
    if (url.endsWith('release-manifest.json')) return Response.json(manifest);
    return new Response(payload);
  };
}
test('updates compare stable versions numerically and never offer downgrades or prereleases', () => {
  assert.equal(updates.newerVersion('0.10.0', '0.9.0'), true);
  for (const candidate of ['0.9.0', '0.8.99', '0.10.0-beta', 'v1.0.0', '../1.0.0', '01.2.3', '999999999999999999999.0.0']) assert.equal(updates.newerVersion(candidate, '0.9.0'), false);
  const {release, manifest} = fixture();
  assert.equal(updates.installerFor(release, manifest, '0.9.0').version, '0.10.0');
  for (const patch of [{draft: true}, {prerelease: true}, {published_at: null}]) assert.equal(updates.installerFor({...release, ...patch}, manifest, '0.9.0'), null);
  assert.equal(updates.installerFor(release, manifest, '0.10.0'), null);
});
test('release metadata binds the exact installer, version, platform, size and GitHub digest', () => {
  for (const change of [f => f.manifest.version = '1.0.0', f => f.manifest.platform = 'linux', f => f.manifest.artifacts[0].name = '../other.exe', f => f.release.assets[1].browser_download_url = 'https://example.com/update.exe', f => f.release.assets[1].digest = 'sha256:' + '0'.repeat(64), f => f.release.assets[1].size++, f => f.manifest.artifacts.push(f.manifest.artifacts[0])]) {
    const data = fixture(); change(data); assert.throws(() => updates.installerFor(data.release, data.manifest, '0.9.0'));
  }
});
test('update redirects remain HTTPS on GitHub infrastructure', async () => {
  for (const target of ['http://github.com/file', 'https://127.0.0.1/file', 'https://example.com/file', 'https://github.com:444/file', 'https://user:pass@github.com/file']) {
    let calls = 0;
    await assert.rejects(updates.githubRequest(updates.LATEST, {fetchImpl: async () => {calls++; return new Response('', {status: 302, headers: {location: target}});}}), /left the GitHub/);
    assert.equal(calls, 1);
  }
});
test('updater downloads once, reuses verified cache, persists opt-out and rejects tampering before install', async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'folio-updates-'));
  try {
    const requests = [], engine = updates.createUpdater({version: '0.9.0', profile, fetchImpl: transport(fixture(), {requests})});
    assert.equal((await engine.check()).phase, 'ready');
    const ready = await engine.prepareInstall(); assert.deepEqual(await readFile(ready.file), bytes);
    assert.equal((await engine.check()).phase, 'ready'); assert.equal(requests.filter(url => url.endsWith('.exe')).length, 1);
    await engine.setEnabled(false);
    const restarted = updates.createUpdater({version: '0.9.0', profile, fetchImpl: async () => {throw new Error('Disabled updates must not fetch.');}});
    await restarted.initialized; assert.equal((await restarted.check()).enabled, false);
    await writeFile(ready.file, Buffer.from('x'.repeat(bytes.length)));
    await assert.rejects(engine.prepareInstall(), /cached installer changed/);
    assert.equal(engine.getState().phase, 'error');
    await engine.setEnabled(true); assert.equal((await engine.check()).phase, 'ready');
    assert.deepEqual(await readFile((await engine.prepareInstall()).file), bytes);
  } finally {await rm(profile, {recursive: true, force: true});}
});
test('incomplete or corrupt downloads never become executable updates and partial files are removed', async () => {
  for (const payload of [Buffer.from('short'), Buffer.alloc(bytes.length, 0), Buffer.alloc(bytes.length + 1)]) {
    const profile = await mkdtemp(path.join(os.tmpdir(), 'folio-bad-update-'));
    try {
      const engine = updates.createUpdater({version: '0.9.0', profile, fetchImpl: transport(fixture(), {payload})});
      assert.equal((await engine.check()).phase, 'error'); await assert.rejects(engine.prepareInstall(), /No verified update/);
      assert.deepEqual((await readdir(path.join(profile, 'software-updates'))).filter(name => /\.(exe|part)$/.test(name)), []);
    } finally {await rm(profile, {recursive: true, force: true});}
  }
});
test('missing releases, offline errors and current versions do not download installers or prevent local use', async () => {
  for (const [fetchImpl, phase] of [[async () => new Response('', {status: 404}), 'current'], [async () => {throw new Error('offline');}, 'error'], [transport(fixture()), 'current']]) {
    const profile = await mkdtemp(path.join(os.tmpdir(), 'folio-offline-update-'));
    try {const engine = updates.createUpdater({version: '0.10.0', profile, fetchImpl}); assert.equal((await engine.check()).phase, phase); await assert.rejects(engine.prepareInstall());}
    finally {await rm(profile, {recursive: true, force: true});}
  }
});
test('native update install waits for successful quit, can be cancelled on save failure and preserves shared servers', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'folio-update-menu-'));
  try {
    const install = path.join(root, 'Application with spaces'); await mkdir(install);
    await writeFile(path.join(install, 'folio-install.ini'), '[Folio]\nAppId=org.folio.localreader\nTestId=\n');
    let quits = 0, owned = true; const launches = [], messages = [];
    const fakeEngine = {initialized: Promise.resolve(), getState: () => ({enabled: true}), check: async () => ({phase: 'ready', available: '0.10.0'}), prepareInstall: async () => ({file: path.join(root, 'verified.exe'), version: '0.10.0'}), stop() {}};
    const control = menus.createUpdateMenu({app: {getVersion: () => '0.9.0', getPath: () => path.join(install, 'Folio.exe'), quit: () => quits++, relaunch: options => launches.push(options)}, dialog: {showMessageBox: async (window, options) => {messages.push(options.message); return {response: 0};}}, Menu: {}, profile: root, getWindow: () => ({isDestroyed: () => false}), getService: () => ({owned}), makeUpdater: () => fakeEngine, platform: 'win32', smoke: true});
    await control.check(true); assert.equal(quits, 1); assert.deepEqual(launches, []);
    control.cancelInstall(); await control.finishQuit(); assert.deepEqual(launches, []);
    const again = menus.createUpdateMenu({app: {getVersion: () => '0.9.0', getPath: () => path.join(install, 'Folio.exe'), quit: () => quits++, relaunch: options => launches.push(options)}, dialog: {showMessageBox: async () => ({response: 0})}, Menu: {}, profile: root, getWindow: () => ({isDestroyed: () => false}), getService: () => ({owned}), makeUpdater: () => fakeEngine, platform: 'win32', smoke: true});
    owned = false; await again.check(true); assert.equal(quits, 1);
    owned = true; await again.check(true); assert.equal(quits, 2); assert.deepEqual(launches, []);
    await again.finishQuit(); assert.deepEqual(launches, [{execPath: path.join(root, 'verified.exe'), args: ['/S', '/AUTOSTART=1', '/D=' + install]}]);
  } finally {await rm(root, {recursive: true, force: true});}
});
