const fs = require('node:fs/promises');
const path = require('node:path');
const {createUpdater} = require('./updates.cjs');

// Update actions exist only in the native menu; ebook/renderer frames get no updater IPC.
function createUpdateMenu({app, dialog, Menu, profile, getWindow, getService, smoke = false, makeUpdater = createUpdater, platform = process.platform}) {
  const engine = makeUpdater({version: app.getVersion(), profile});
  let timer, startup, pending = false, prompted = null, stopped = false;
  const message = options => dialog.showMessageBox(getWindow(), options);
  async function installed() {
    if (platform !== 'win32') return false;
    try {const marker = await fs.readFile(path.join(path.dirname(app.getPath('exe')), 'folio-install.ini'), 'utf8'); return /^AppId=org\.folio\.localreader\r?$/m.test(marker) && /^TestId=\r?$/m.test(marker);} catch {return false;}
  }
  async function check(manual = false) {
    try {
      const state = await engine.check({manual});
      if (stopped || !getWindow() || getWindow().isDestroyed()) return;
      if (state.phase === 'ready' && (manual || prompted !== state.available)) {
        prompted = state.available;
        if (!await installed()) {if (manual) await message({type: 'info', message: 'Folio ' + state.available + ' is ready.', detail: 'Automatic installation is available in the installed Windows app. Run the installer from GitHub Releases to upgrade this portable copy.'}); return;}
        const result = await message({type: 'info', buttons: ['Install and restart', 'Later'], defaultId: 1, cancelId: 1, message: 'Folio ' + state.available + ' is ready to install.', detail: 'The installer was downloaded from the published GitHub Release and its SHA-256 was checked. This preview is unsigned. Folio will save your reading position before restarting. Your books and profile stay on this device.'});
        if (result.response === 0) {
          // A shared server may be running from the installation being replaced.
          if (!getService()?.owned) {await message({type: 'info', message: 'Close the other Folio server first.', detail: 'Folio is sharing an existing local server. Close the desktop app and that server, then reopen Folio and choose Check for updates.'}); return;}
          await engine.prepareInstall(); pending = true; app.quit();
        }
      } else if (manual && state.phase === 'current') await message({type: 'info', message: 'Folio is up to date.', detail: 'Installed version: ' + app.getVersion() + '. Only published stable GitHub Releases are offered.'});
      else if (manual && state.phase === 'error') await message({type: 'error', message: 'Could not check for updates.', detail: state.error + '\nYour local library remains available.'});
    } catch (error) {if (manual && !stopped) await message({type: 'error', message: 'Could not update Folio.', detail: error.message});}
  }
  const menu = {label: 'Updates', submenu: [
    {label: 'Check for updates…', click: () => void check(true)},
    {id: 'automatic-updates', label: 'Check and download updates automatically', type: 'checkbox', checked: true, click: item => {void engine.setEnabled(item.checked).catch(error => message({type: 'error', message: 'Could not save update settings.', detail: error.message}));}},
    {label: 'About software updates', click: () => void message({type: 'info', message: 'Updates come from GitHub Releases.', detail: 'When enabled, Folio checks at startup and every four hours, downloads a newer stable release, and asks before restarting to install. Only version/update requests go to GitHub; books, reading history and source cookies are never sent. This is separate from optional ebook networking.'})}
  ]};
  async function start() {
    await engine.initialized;
    const item = Menu.getApplicationMenu()?.getMenuItemById('automatic-updates'); if (item) item.checked = engine.getState().enabled;
    if (smoke || stopped || !await installed()) return;
    startup = setTimeout(() => void check(), 5000); startup.unref();
    timer = setInterval(() => void check(), 4 * 60 * 60 * 1000); timer.unref();
  }
  async function finishQuit() {
    stopped = true; clearTimeout(startup); clearInterval(timer); engine.stop();
    if (!pending) return;
    const update = await engine.prepareInstall();
    if (!await installed()) throw new Error('Folio is no longer running from its registered installation.');
    // Electron starts this only after the process exits. The owned local server
    // and reader save handshake have already finished before this method runs.
    app.relaunch({execPath: update.file, args: ['/S', '/AUTOSTART=1', '/D=' + path.dirname(app.getPath('exe'))]});
  }
  return {menu, start, finishQuit, cancelInstall: () => {pending = false;}, check};
}
module.exports = {createUpdateMenu};
