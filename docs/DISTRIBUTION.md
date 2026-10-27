# Windows distribution — 0.10.0 unsigned preview

Folio remains local-first. The library, reading progress, notes, covers, preferences and backups stay on the device. Optional source networking defaults off. No personal books or profile files are shipped in releases.

## Install and open books

Run `Folio-Setup-0.10.0-windows-x64-unsigned.exe`. It installs for the current Windows account under `%LOCALAPPDATA%\Programs\Folio`, adds Start Menu shortcuts and an installed-apps entry, and needs no administrator access. Close the installed Folio and its local server before upgrading. Upgrades use the same application folder; uninstall first to move it. Existing books and the profile are preserved in either case.

The **Offer Folio in Open with** component is optional and initially unchecked. It registers PDF, EPUB and CBZ support without replacing extension defaults or Windows UserChoice. Upgrades retain the choice; unchecking removes Folio's owned entries. Choose a default reader yourself through Windows if desired. The portable desktop ZIP needs only extraction and creates no registrations.

Use **Folio → Open ebook…** (Ctrl+O), Windows Open with, or a quoted local filename argument. Already indexed books resume from their saved position. A file inside the configured library can be indexed on demand. A file outside it is copied through the normal local import flow; the original is unchanged. A persistent path/size/modification-time binding prevents repeat imports of the same unchanged file. Changed files may be imported as a new copy. Configure the library first; unlock Folio before retrying a pending file. Image folders still use Add items; OS file opening accepts PDF/EPUB/CBZ only, up to 1 GB, local absolute paths only, with a queue of at most 10 files. UNC/network/device paths are refused.

Native filenames never become arbitrary renderer filesystem access. Only OS-selected arguments/dialog entries receive opaque queue IDs; the native process validates file identity and streams a selected file to the authenticated loopback import API. A second launch forwards selected files to the existing desktop instance. The browser version requires no native integration.

## Uninstall

Use Windows Installed apps or **Uninstall Folio** from the Start Menu. Close the installed application first. The uninstaller removes a compiled list of application files, empty application directories, shortcuts and registrations still owned by that installation. It does not recursively delete the installation directory, library or `%LOCALAPPDATA%\LocalEbookReader` profile. Unexpected files in the application folder are retained. Linked application paths are refused before managed-file operations. Remove personal data separately only when you intend to do so. Back up through Settings before changing installations.

## Build from source

Use Windows x64 and Node 24.14 or newer. No npm installation is required. From the source checkout:

```powershell
node scripts/check.mjs
$env:FOLIO_NATIVE_TESTS='1'
node --test
Remove-Item Env:FOLIO_NATIVE_TESTS
node scripts/benchmark-library.mjs --books=1000
node scripts/build-portable.mjs
node scripts/build-desktop.mjs
node scripts/verify-desktop-session.mjs
node scripts/build-installer.mjs
node scripts/create-release-fixture.mjs .local/release-fixture
./scripts/test-installer.ps1 -Installer .local/dist/Folio-Setup-0.10.0-windows-x64-unsigned.exe -Fixture .local/release-fixture/fixture.json
Compress-Archive -LiteralPath .local/dist/Folio-0.10.0-win32-x64 -DestinationPath .local/dist/Folio-0.10.0-windows-x64.zip
Compress-Archive -LiteralPath .local/dist/Folio-0.10.0-desktop-win32-x64 -DestinationPath .local/dist/Folio-0.10.0-desktop-windows-x64.zip
node scripts/release-manifest.mjs --allow-unsigned
```

Builds refuse to overwrite existing releases. An optional lowercase build label can be passed to each build script for a separate preview. `NODE_LICENSE_FILE` may point to the complete official license matching the current Node runtime. Otherwise it is fetched from Node's upstream repository. Electron 45.0.0 and NSIS 3.13 are pinned by URL/SHA-256 in `desktop/runtime.json` and `packaging/nsis-runtime.json`. NSIS is extracted privately and its compiler files are checked against the pinned archive before execution. Compilation treats warnings as errors and uses zlib compression. Upstream licenses are retained, including complete `NSIS-COPYING.txt` in the installed application. No global compiler install is needed.

Each portable folder has a `build-manifest.json` listing every payload file's size/SHA-256, runtime versions and unsigned status. Builds reject private paths, ebook/profile payloads and links. `release-manifest.mjs` checks both payload manifests and emits checksums for the setup executable and two ZIPs. Checksums detect changes relative to this release; they are not publisher signatures or independent security approval. This release deliberately remains unsigned. Installed Windows copies include the GitHub Releases updater described below. Portable copies update manually.

`.github/workflows/release.yml` builds, tests and publishes tagged releases. The separate `release-preview.yml` workflow remains a manual artifact-only check.

## Automatic software updates

The installed Windows app checks the latest **published stable GitHub Release** five seconds after startup and every four hours while running. It downloads a newer Windows x64 installer, requires a matching `Folio-VERSION-release-manifest.json`, and verifies size/SHA-256 plus GitHub's asset digest when available. Drafts, prereleases, same/older versions, missing assets and invalid metadata are ignored or reported; ordinary source commits never trigger installation. Downloads follow only HTTPS GitHub/CDN redirects and stay inside a dedicated local update cache.

Use the native **Updates** menu to check manually or disable automatic checks/downloads. On **Install and restart**, the reader saves first, the app stops its owned server, rechecks the downloaded installer and hands off through Electron's post-exit relaunch. NSIS updates the existing per-user application and restarts Folio. A failed save cancels installation. If the desktop app shares another local server, close that server and reopen Folio before installing. Books and the profile are not replaced. There is no unattended installation during reading.

Update checks are separately enabled for the installed desktop app because software updating is requested functionality; they do not enable source/metadata networking. Requests contain version/update metadata only, without books, history, reading positions or source cookies. Offline failures leave reading available. Update settings/cache are outside reading-data/profile exports. Browser/source and portable builds do not replace themselves. Existing 0.9.0 installations need the 0.10.0 installer once to gain this updater. The release remains unsigned by the owner's choice.

## Publish the next GitHub Release

1. Update both package versions and `docs/RELEASE-NOTES.md`; complete the relevant checks.
2. Commit and push the source to the repository, then create and push the matching stable tag, for example `v0.10.0`.
3. **Publish Windows release** builds the installer and both portable ZIPs, tests install/upgrade/uninstall with generated data, and verifies archive manifests.
4. Only after the build passes, the publish job creates a draft with the installer, ZIPs, release manifest and checksums, then publishes it as Latest. It has write access only in the publish job. Existing published versions are not overwritten; use a new version/tag for a new release.
5. Verify the public release assets and the repository's Latest Release endpoint. Installed copies receive that release on their next automatic/manual check.

Release downloads belong in **GitHub Releases**, not repository commits or Git LFS. A failed build produces no published app update. GitHub's generated source ZIP/tarball do not replace the Windows installer assets.

Fork maintainers must change `REPOSITORY` in `desktop/updates.cjs` to their own repository before distributing an installer. The upstream app deliberately accepts update assets only from its compiled-in repository.

For 0.10.0, local syntax/native tests and the desktop session self-check passed. The laptop's Windows Application Control blocked the NSIS compiler's generated child process (4551 / `0x11c7`). Installer compilation and install/upgrade/uninstall checks therefore run on the GitHub Windows runner. No local security policy was disabled or bypassed. Systems enforcing such policies may require a signed release; this owner-authorized preview remains unsigned.

## Installer test isolation

`test-installer.ps1` creates a GUID namespace under `HKCU\Software\Folio\InstallerTests`, installs under its output directory and leaves real app associations, shortcuts and defaults untouched. `/TESTID=<ASCII identifier>` routes registrations and shortcuts to this namespace; it is a test option, not a second production profile. `/REGISTER=0` or `1` controls the optional component, and `/D=<absolute folder>` must be the last NSIS argument. Tests use generated ebooks and a separate profile, verify original/profile hashes, and retain local reports. Never substitute a personal profile for a generated fixture. Failed tests retain evidence for inspection.

## Release evidence and manual coverage

| Check | Local evidence / status |
| --- | --- |
| Syntax and automated suite | 98 tests passed locally, none skipped; includes installed Windows OCR/speech and updater integrity/lifecycle checks |
| Generated library indexing/queries | 1,000 tiny PDFs: initial 1,663 ms, incremental 809 ms, median query 34.57 ms, p95 53.65 ms; rendering/OCR excluded |
| Per-user install/upgrade/uninstall | Actual compiled installer, isolated registry and folder containing spaces |
| Open with defaults and upgrades | Default off; persisted choice; remove/re-add; quoted PDF/EPUB/CBZ commands; existing defaults retained |
| Native opening/lifecycle | Generated EPUB sent to the installed app's existing instance; embedded reader, save/close and owned-server release |
| Files and profiles | Original ebook and profile hashes checked; an unexpected ebook inside application folder survives uninstall |
| Unsafe replacement | Running executable and linked managed application paths refused |
| Build and artifact integrity | Per-file payload manifests, artifact SHA-256 checksums, pinned compiler/runtime, retained notices |
| Chapter feeds and sessions | Generated feed/cookie/proxy/API checks, native blank-window cookie self-check, isolated browser reading and live public feed compatibility; see [feature notes](CHAPTER-FEEDS-AND-SESSIONS.md) |
| GitHub Windows release workflow | [0.10.0 Windows build and publication passed](https://github.com/AceAligora/folio-local-reader/actions/runs/40454986689), including install/upgrade/native reading/uninstall and archive verification |
| Signing | Deferred by user choice; unsigned preview |
| Broader manual coverage | **Open:** Windows variants/ARM, DPI/multiple monitors, keyboard/screen-reader walkthrough, visible native dialogs, external capture tools, large real PDFs/EPUBs/comics, low disk/permission failure, interrupted upgrade/power loss and crash recovery |

The completion ledger keeps broad performance/accessibility/release testing unchecked until that remaining coverage is completed. Local fixture success does not establish universal platform compatibility.

## Published 0.10.0 verification

[Folio v0.10.0](https://github.com/AceAligora/folio-local-reader/releases/tag/v0.10.0) is a published stable Latest Release with the Windows x64 installer, desktop/browser portable ZIPs, release manifest and checksums. The tagged source is commit `33f2f62060d71943e73f2f96ca2fbb1f1837a3a1`.

The real updater was exercised against that public release in an isolated profile: an older-version client downloaded and verified 0.10.0, while a 0.10.0 client reported current. No installer was executed by this live-feed check and no personal profile was used. All three artifact sizes/digests match the manifest, GitHub asset digests and checksum list. The downloaded installer was independently hashed again.

- Installer size: **203,724,908 bytes**.
- Installer SHA-256: `dd8abc4fc2f6bcc7722e06a926a62e6979893dd9f7b2a3cd75cad4f7acbb2f0e`.
- Hosted installer lifecycle tests passed on GitHub Windows; local native OCR/speech and all 98 local tests passed before publication. The later cache-recovery review also passed the targeted updater tests and the full tagged hosted checks.
- Signing remains deferred. The local Application Control limitation described above has not been bypassed; a future live upgrade between two public updater-enabled versions is not claimed by this first updater release.
