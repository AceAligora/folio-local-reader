# Folio 0.11.1 — local book recovery

Recover reading data after moving or copying your library to another drive, without relying on filenames or filesystem identity.

- **Settings → Library health → Prepare recovery fingerprints** remembers local PDF/EPUB/CBZ contents before a move. Repeat it in the new folder to find exact copies.
- Review the original and replacement before applying. Folio rehashes the replacement, rejects stale reviews and saves a safety backup.
- Reading positions/preferences, notes, bookmarks, tags, queue and manual collections transfer. Reading time retains the larger total. Previous-library records and ebook files remain intact; unrelated same-name collections are kept separate.
- Fingerprints persist locally and unchanged files are reused. Preparation is cancellable and bounded to 200 files / 2 GB per pass. Incognito and app lock are enforced. Nothing is uploaded.
- 111 local automated tests passed, including 13 new service/HTTP checks plus installed Windows OCR/speech. A generated browser fixture recovered a renamed EPUB and resumed chapter 2.

## Install or update

Download **Folio-Setup-0.11.1-windows-x64-unsigned.exe**, or use **Updates → Check for updates** in the installed 0.10.0 desktop app. Automatic checks continue at startup and every four hours. Portable ZIPs update manually. The release remains unsigned by owner choice.

## Compatibility and limits

This release adds **profile schema 8**. Older builds refuse an upgraded profile; keep a pre-upgrade full-profile backup if you need to downgrade. Existing book/reading data is preserved. Fingerprints must be prepared before originals disappear; otherwise use manual relinking. Image folders and files over 2 GB also use manual relinking. Matches reflect the date last remembered and never trigger an automatic merge. Physical second-drive hardware testing remains open; tests simulate changing library roots with generated files.

See [content recovery instructions](https://github.com/AceAligora/folio-local-reader/blob/v0.11.1/docs/CONTENT-RECOVERY.md).

CI runs the complete test suite with two concurrent workers to avoid integration-server startup timeouts on constrained Windows runners. The earlier 0.11.0 tag failed its CI gate and was not published as a release.
