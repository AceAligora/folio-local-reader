const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash, randomUUID} = require('node:crypto');
const {createReadStream} = require('node:fs');

const REPOSITORY = 'AceAligora/folio-local-reader';
const LATEST = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const MAX_INSTALLER = 768 * 1024 * 1024;
const versionParts = value => typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) ? value.split('.').map(Number) : null;
function newerVersion(candidate, current) {
  const next = versionParts(candidate), previous = versionParts(current);
  if (!next || !previous || [...next, ...previous].some(value => !Number.isSafeInteger(value))) return false;
  for (let i = 0; i < 3; i++) if (next[i] !== previous[i]) return next[i] > previous[i];
  return false;
}
function releaseAsset(release, name) {
  const matches = release.assets?.filter(asset => asset.name === name);
  const expected = `https://github.com/${REPOSITORY}/releases/download/${release.tag_name}/${name}`;
  if (matches?.length !== 1 || matches[0].state !== 'uploaded' || matches[0].browser_download_url !== expected) throw new Error('The release asset is missing or has an unexpected address.');
  return matches[0];
}
function installerFor(release, manifest, current) {
  const version = release?.tag_name?.slice(1);
  if (!release || release.draft || release.prerelease || !release.published_at || release.tag_name !== 'v' + version || !newerVersion(version, current)) return null;
  if (manifest.format !== 'folio-release-v1' || manifest.version !== version || manifest.platform !== 'win32' || manifest.arch !== 'x64' || !['unsigned', 'signed'].includes(manifest.signing)) throw new Error('The release manifest does not match this Windows release.');
  const entries = manifest.artifacts?.filter(item => item.kind === 'installer');
  const expected = `Folio-Setup-${version}-windows-x64-${manifest.signing}.exe`;
  if (entries?.length !== 1 || entries[0].name !== expected || !/^[a-f0-9]{64}$/.test(entries[0].sha256) || !Number.isSafeInteger(entries[0].size) || entries[0].size < 1 || entries[0].size > MAX_INSTALLER) throw new Error('The release installer metadata is invalid.');
  const artifact = entries[0], asset = releaseAsset(release, artifact.name);
  if (asset.size !== artifact.size || asset.digest && asset.digest !== 'sha256:' + artifact.sha256) throw new Error('GitHub asset integrity differs from the release manifest.');
  return {version, ...artifact, url: asset.browser_download_url};
}
async function checksum(file) {
  if (!(await fs.lstat(file)).isFile()) throw new Error('The update file is not a regular file.');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
// Redirects may reach GitHub's binary CDN, never an arbitrary release-supplied host.
async function githubRequest(url, {fetchImpl = fetch, signal, headers = {}} = {}) {
  for (let redirects = 0; redirects <= 5; redirects++) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || !['api.github.com', 'github.com', 'release-assets.githubusercontent.com'].includes(parsed.hostname)) throw new Error('Update download left the GitHub release service.');
    const response = await fetchImpl(url, {redirect: 'manual', signal, headers});
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const destination = response.headers.get('location');
    await response.body?.cancel();
    if (!destination) throw new Error('The update download redirect was incomplete.');
    url = new URL(destination, url).href;
  }
  throw new Error('Too many GitHub download redirects.');
}
async function jsonResponse(response, limit = 1024 * 1024) {
  if (!response.ok) throw new Error('GitHub update request failed (HTTP ' + response.status + ').');
  let bytes = 0; const chunks = [];
  for await (const chunk of response.body) {bytes += chunk.length; if (bytes > limit) throw new Error('The update metadata exceeds its size limit.'); chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function createUpdater({version, profile, fetchImpl = fetch, changed = () => {}}) {
  if (!versionParts(version)) throw new Error('A stable application version is required for updates.');
  const directory = path.join(profile, 'software-updates'), config = path.join(directory, 'preferences.json');
  let enabled = true, ready = null, busy = null, controller = null;
  let state = {phase: 'idle', version, enabled, available: null, error: null};
  function update(patch) {state = {...state, ...patch, enabled}; changed({...state});}
  async function initialize() {
    await fs.mkdir(directory, {recursive: true});
    if ((await fs.lstat(directory)).isSymbolicLink()) throw new Error('The update cache must not be a linked directory.');
    try {const saved = JSON.parse(await fs.readFile(config, 'utf8')); enabled = saved.enabled !== false;} catch (error) {if (error.code !== 'ENOENT') throw error;}
    update({});
  }
  const initialized = initialize();
  // Native window loading may finish later than a filesystem error. Mark the
  // promise handled now; callers still receive the error when they await it.
  initialized.catch(() => {});
  async function setEnabled(value) {
    await initialized; enabled = value === true;
    if (!enabled) controller?.abort();
    const temporary = config + '.' + randomUUID() + '.tmp';
    await fs.writeFile(temporary, JSON.stringify({enabled}) + '\n', {flag: 'wx'});
    await fs.rename(temporary, config); update({});
  }
  async function download(artifact, signal) {
    const target = path.join(directory, `${artifact.version}-${artifact.sha256}.exe`);
    try {
      const info = await fs.lstat(target);
      if (!info.isFile()) throw new Error('The cached update must be a regular file.');
      if (info.size === artifact.size && await checksum(target) === artifact.sha256) return target;
      await fs.unlink(target); // Only this generated, regular cache file; never recursive.
    } catch (error) {if (error.code !== 'ENOENT') throw error;}
    const temporary = path.join(directory, randomUUID() + '.part');
    let handle;
    try {
      const response = await githubRequest(artifact.url, {fetchImpl, signal});
      if (!response.ok) throw new Error('Installer download failed (HTTP ' + response.status + ').');
      const length = response.headers.get('content-length');
      if (length && Number(length) !== artifact.size) throw new Error('The installer download size changed.');
      handle = await fs.open(temporary, 'wx');
      const hash = createHash('sha256'); let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > artifact.size) throw new Error('The installer download exceeds its declared size.');
        hash.update(chunk); await handle.writeFile(chunk);
      }
      await handle.sync(); await handle.close(); handle = null;
      if (size !== artifact.size || hash.digest('hex') !== artifact.sha256) throw new Error('The downloaded installer failed its SHA-256 integrity check.');
      // Never replace an existing downloaded executable, including a linked file.
      try {await fs.access(target); throw new Error('The existing cached update failed verification. Remove it through your file manager and retry.');} catch (error) {if (error.code !== 'ENOENT') throw error;}
      await fs.rename(temporary, target); return target;
    } finally {await handle?.close(); await fs.rm(temporary, {force: true});}
  }
  async function check({manual = false} = {}) {
    await initialized;
    if (busy) return busy;
    if (!enabled && !manual) return {...state};
    controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10 * 60 * 1000)]);
    const metadataSignal = AbortSignal.any([signal, AbortSignal.timeout(20000)]);
    busy = (async () => {
      ready = null; update({phase: 'checking', error: null, available: null});
      try {
        const response = await githubRequest(LATEST, {fetchImpl, signal: metadataSignal, headers: {Accept: 'application/vnd.github+json', 'User-Agent': 'Folio/' + version}});
        if (response.status === 404) {await response.body?.cancel(); update({phase: 'current'}); return {...state};}
        const release = await jsonResponse(response), next = release.tag_name?.slice(1);
        if (release.draft || release.prerelease || !release.published_at || release.tag_name !== 'v' + next || !newerVersion(next, version)) {update({phase: 'current'}); return {...state};}
        const metadata = releaseAsset(release, `Folio-${next}-release-manifest.json`);
        if (!Number.isSafeInteger(metadata.size) || metadata.size > 1024 * 1024) throw new Error('The release manifest is too large.');
        const manifest = await jsonResponse(await githubRequest(metadata.browser_download_url, {fetchImpl, signal: metadataSignal}));
        const artifact = installerFor(release, manifest, version);
        update({phase: 'downloading', available: artifact.version});
        const file = await download(artifact, signal);
        ready = {...artifact, file}; update({phase: 'ready'});
      } catch (error) {update({phase: 'error', error: error.message});}
      return {...state};
    })();
    try {return await busy;} finally {busy = null; controller = null;}
  }
  async function prepareInstall() {
    if (busy || !ready) throw new Error('No verified update is ready to install.');
    if ((await fs.stat(ready.file)).size !== ready.size || await checksum(ready.file) !== ready.sha256) {ready = null; update({phase: 'error', error: 'The cached installer changed. Check for updates again.'}); throw new Error(state.error);}
    return {file: ready.file, version: ready.version};
  }
  return {initialized, check, setEnabled, prepareInstall, getState: () => ({...state}), stop: () => controller?.abort()};
}
module.exports = {REPOSITORY, LATEST, newerVersion, installerFor, githubRequest, createUpdater};
