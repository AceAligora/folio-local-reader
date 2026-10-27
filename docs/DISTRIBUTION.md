# Windows distribution — 0.9.0 unsigned preview

Folio remains local-first. The library, reading progress, notes, covers, preferences and backups stay on the device. Optional source networking defaults off. No personal books or profile files are shipped in releases.

## Install and open books

Run `Folio-Setup-0.9.0-windows-x64-unsigned.exe`. It installs for the current Windows account under `%LOCALAPPDATA%\Programs\Folio`, adds Start Menu shortcuts and an installed-apps entry, and needs no administrator access. Close the installed Folio and its local server before upgrading. Upgrades use the same application folder; uninstall first to move it. Existing books and the profile are preserved in either case.

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
./scripts/test-installer.ps1 -Installer .local/dist/Folio-Setup-0.9.0-windows-x64-unsigned.exe -Fixture .local/release-fixture/fixture.json
Compress-Archive -LiteralPath .local/dist/Folio-0.9.0-win32-x64 -DestinationPath .local/dist/Folio-0.9.0-windows-x64.zip
Compress-Archive -LiteralPath .local/dist/Folio-0.9.0-desktop-win32-x64 -DestinationPath .local/dist/Folio-0.9.0-desktop-windows-x64.zip
node scripts/release-manifest.mjs --allow-unsigned
```

Builds refuse to overwrite existing releases. An optional lowercase build label can be passed to each build script for a separate preview. `NODE_LICENSE_FILE` may point to the complete official license matching the current Node runtime. Otherwise it is fetched from Node's upstream repository. Electron 45.0.0 and NSIS 3.13 are pinned by URL/SHA-256 in `desktop/runtime.json` and `packaging/nsis-runtime.json`. NSIS is extracted privately and its compiler files are checked against the pinned archive before execution. Compilation treats warnings as errors and uses zlib compression. Upstream licenses are retained, including complete `NSIS-COPYING.txt` in the installed application. No global compiler install is needed.

Each portable folder has a `build-manifest.json` listing every payload file's size/SHA-256, runtime versions and unsigned status. Builds reject private paths, ebook/profile payloads and links. `release-manifest.mjs` checks both payload manifests and emits checksums for the setup executable and two ZIPs. Checksums detect changes relative to this release; they are not publisher signatures or independent security approval. This release deliberately remains unsigned. There is no automatic updater.

`.github/workflows/release-preview.yml` provides a manual Windows build/test/artifact workflow with read-only repository permissions. It does not publish a GitHub Release. It is prepared locally; no hosted workflow pass is claimed.

## Installer test isolation

`test-installer.ps1` creates a GUID namespace under `HKCU\Software\Folio\InstallerTests`, installs under its output directory and leaves real app associations, shortcuts and defaults untouched. `/TESTID=<ASCII identifier>` routes registrations and shortcuts to this namespace; it is a test option, not a second production profile. `/REGISTER=0` or `1` controls the optional component, and `/D=<absolute folder>` must be the last NSIS argument. Tests use generated ebooks and a separate profile, verify original/profile hashes, and retain local reports. Never substitute a personal profile for a generated fixture. Failed tests retain evidence for inspection.

## Release evidence and manual coverage

| Check | Local evidence / status |
| --- | --- |
| Syntax and automated suite | 59 tests passed, none skipped; includes actual installed Windows OCR and speech |
| Generated library indexing/queries | 1,000 tiny PDFs: initial 1,663 ms, incremental 809 ms, median query 34.57 ms, p95 53.65 ms; rendering/OCR excluded |
| Per-user install/upgrade/uninstall | Actual compiled installer, isolated registry and folder containing spaces |
| Open with defaults and upgrades | Default off; persisted choice; remove/re-add; quoted PDF/EPUB/CBZ commands; existing defaults retained |
| Native opening/lifecycle | Generated EPUB sent to the installed app's existing instance; embedded reader, save/close and owned-server release |
| Files and profiles | Original ebook and profile hashes checked; an unexpected ebook inside application folder survives uninstall |
| Unsafe replacement | Running executable and linked managed application paths refused |
| Build and artifact integrity | Per-file payload manifests, artifact SHA-256 checksums, pinned compiler/runtime, retained notices |
| Chapter feeds and sessions | Generated feed/cookie/proxy/API checks, native blank-window cookie self-check, isolated browser reading and live public feed compatibility; see [feature notes](CHAPTER-FEEDS-AND-SESSIONS.md) |
| GitHub Windows workflow | Prepared; not run on hosted infrastructure |
| Signing | Deferred by user choice; unsigned preview |
| Broader manual coverage | **Open:** Windows variants/ARM, DPI/multiple monitors, keyboard/screen-reader walkthrough, visible native dialogs, external capture tools, large real PDFs/EPUBs/comics, low disk/permission failure, interrupted upgrade/power loss and crash recovery |

The completion ledger keeps broad performance/accessibility/release testing unchecked until that remaining coverage is completed. Local fixture success does not establish universal platform compatibility.
