# Folio Desktop preview

The Windows x64 desktop preview is available as a portable distribution and an optional per-user installer. Extract and run `Folio.exe`, or use the unsigned setup executable. See [distribution](DISTRIBUTION.md) for installation, Open with, uninstall and release verification. It embeds the same local-first frontend in an Electron window and uses a bundled Node runtime for SQLite, OCR, speech and localhost services. No cloud account, Node installation, administrator access or dependency installation is needed to use the built preview.

## Local data and lifecycle

Desktop uses the existing `%LOCALAPPDATA%\LocalEbookReader` profile unless a developer supplies `EBOOK_PROFILE`. It reads the private runtime record, verifies loopback origin and a random instance identifier, and reuses the matching live server. If none is running, it starts the bundled server on an available loopback port. An incompatible old server is never killed or silently adopted. Restart it with the current browser release first.

Closing the native window asks the reader to finish its queued position/time save. A failed save keeps the window open. If the page does not respond, the user can keep waiting or explicitly close. Desktop stops only the child server it started; a reused browser server remains available. Browser tabs connected to a Desktop-owned server lose their connection when Desktop closes. An unexpected parent exit disconnects IPC and asks the owned server to shut down.

The browser version keeps its original launcher and loopback URL. Desktop keeps Chromium's local cookies/cache in `desktop-browser/` under the profile. Source windows use separate non-persistent partitions, cleared when closed. The main browser cache is disposable; full-profile backups retain reading data/configuration/assets, not browser caches. No personal data or ebooks enter a distribution build.

## Native settings

- **Security → Exclude the desktop window from screen capture:** off by default. On Windows this calls Electron's [`setContentProtection`](https://www.electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable-macos-windows). This requests Windows capture exclusion; it does not encrypt ebooks or prevent cameras/every capture mechanism. It applies to original-file child windows as well as the main window. Reading-data restore preserves the current choice. The inactive-window privacy screen remains a separate browser-compatible setting.
- **Reader → Keep screen on:** uses [`powerSaveBlocker`](https://www.electronjs.org/docs/latest/api/power-save-blocker) while a book is open in the focused, non-minimized window. Blur/minimize, closing the reader, disabling the preference and quitting release the blocker. The browser version keeps its Web Wake Lock fallback.
- **Appearance → Show reading progress on the Windows taskbar:** displays page/chapter progress during reading, and clears it outside the reader. This is not an Android/mobile status-bar implementation.

Native-only switches are disabled in the browser. The desktop window has standard Windows window controls and a small application/Edit menu. External source detail links open in the default browser only when selected. Original-file windows are restricted to local content and expose no desktop bridge.

## Security boundary

The host follows Electron's [security guidance](https://www.electronjs.org/docs/latest/tutorial/security/): sandbox and context isolation enabled, renderer Node integration/webview embedding disabled, permissions denied by default, exact main-frame sender/origin checks for IPC, and no generic shell/filesystem/IPC bridge. The preload exposes capability flags, bounded reading-state synchronization, the close handshake and a queue of opaque IDs for files selected through the OS. Only the native process reads those selected files; the renderer receives no arbitrary filesystem API or absolute path. Ebook frames do not receive it.

Renderer requests are restricted to the verified local server, local blob/data resources and Chromium's built-in extension resources used for original-PDF viewing. No third-party extension code is installed. The source network switch still governs server-side requests. Desktop provides explicit temporary source-cookie adoption through separate source windows; the user handles challenges manually. No automatic Cloudflare bypass is provided. See [chapter feeds and source sessions](CHAPTER-FEEDS-AND-SESSIONS.md).

## Reproducible build

On Windows x64 with Node 24.14 or newer, run `node scripts/build-desktop.mjs`. An optional lowercase label creates a separately named preview; existing builds are never overwritten. The script downloads the exact official Electron archive pinned in `desktop/runtime.json`, checks the tracked SHA-256 before extraction/execution, builds an allowlisted Folio/Node base, and stages the complete output before publishing its folder. Failed staging directories remain private for inspection. `NODE_LICENSE_FILE` can supply the matching official Node license offline; otherwise the base builder retrieves it.

Electron is currently pinned to **45.0.0**, from the [official release](https://github.com/electron/electron/releases/tag/v45.0.0). Its ZIP checksum is pinned from the upstream `SHASUMS256.txt`. Update the version/hash/URL together and rerun native smoke checks before publishing another runtime. The build retains Electron's MIT license and Chromium third-party notices, Folio's Apache-2.0 license/vendor notices and the Node runtime's license.

For source development, run an extracted official Electron binary against the `desktop/` directory and set `FOLIO_NODE_BINARY` to the absolute Node executable path. Tests use isolated profiles and generated books. `FOLIO_DESKTOP_SMOKE_REPORT` enables a hidden lifecycle/security self-check; an optional generated-book UUID in `FOLIO_DESKTOP_SMOKE_BOOK` checks the embedded reader/close handshake. This test hook is environment-controlled, never exposed through a web API.

## Remaining release work

This release remains an unsigned preview, as requested. Installer/uninstaller and optional Open with registration are implemented. Code signing is deferred; automatic updates and mobile/native status bars remain unimplemented. Source windows support temporary cookie-based sessions; third-party SSO and non-cookie authentication remain unsupported. Native screenshot testing across capture/remote-access tools, manual keyboard/screen-reader review, crash/recovery testing and broader device/performance coverage remain on the completion checklist. No claims of universal capture protection or full production readiness are made.
