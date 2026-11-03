# Recovering a moved local library

Folio 0.11.2 can reconnect reading data to byte-identical PDF, EPUB and CBZ copies, including after switching the library folder to another drive. It uses locally remembered SHA-256 fingerprints, never filenames alone. No ebook data is sent over the network.

## Before moving books

1. Open **Settings → Library health → Recover books moved to another drive**.
2. Choose **Prepare recovery fingerprints** while the original files are still available.
3. A pass reads up to 200 files or 2 GB. Repeat preparation to cover additional files. Unchanged verified files are reused without rereading their bytes. Excluded folders and image books are skipped.
4. Keep a full-profile backup if moving the profile too: fingerprints are stored in the local database and included in the full-profile ZIP. Reading-data JSON exports do not include fingerprints.

## After moving or copying

1. Choose the new local folder in Folio and scan it.
2. Prepare fingerprints there. The selector offers individually identified matching copies of missing books or records from a previous library folder. Previous-library records may still be marked available in their old scan; Folio does not claim their old drive is connected.
3. Select the intended replacement and choose **Review matching copy**. Check the original/replacement paths, saved position, note count and fingerprint date. Multiple identical copies are not chosen automatically.
4. Choose **Apply reviewed recovery**. Folio rehashes the replacement, rejects changed files or stale reading data, and saves a reading-data safety backup before transferring.

The previous record's position/preferences take priority; notes, bookmarks and tags combine without silently dropping data. Reading time uses the larger total rather than adding possibly overlapping sessions. Cross-folder recovery leaves the previous-root record, time and collections unchanged. Manual collection membership is copied into source-mapped collections in the current library; an unrelated collection with the same name is preserved, with a distinct recovered name used instead. Later books from the same previous collection join that recovered collection. For a missing book in the same root, reading time, queue and manual collection membership move to the available replacement.

## Limits and safety

- A fingerprint must have been saved before the original disappears. Otherwise use manual relinking or reconnect the original drive first.
- Matches represent the contents last verified on the displayed date. They do not prove a missing file was never edited afterward. Recovery always requires review.
- Files over 2 GB and image folders use manual relinking. Folio shows up to 200 candidate pairs from a bounded candidate query.
- Nothing is automatically merged, deleted or rewritten in ebook files. Derived indexes, source-adapter links and custom-cover files are not migrated by this reading-data action.
- Incognito, scanning, root changes, exclusions and cancellation stop unsafe or stale preparation; app lock protects the APIs. Transfer is rejected if state changes while hashing or saving its safety backup.
- Restore the destination safety backup through normal reading-data recovery if you need to undo a transfer. Previous-root records remain available when you switch back.
- This release adds profile schema 8. Older Folio versions refuse an upgraded profile; keep a pre-upgrade backup if you need to downgrade. The migration only adds recovery tables/indexes.

## Verification

Thirteen generated-fixture service/HTTP tests cover persisted fingerprints, unique files, simulated root/volume switches, same-size differing bytes, ambiguous copies, stale reviews, safety-backup failures/races, queue/time/collection preservation, bounded reads, cancellation, exclusions, Incognito and app lock. The browser flow prepares a moved EPUB, reviews/applies recovery, and reopens it on its saved second chapter. No physical second-drive hardware test is claimed; broader hardware/accessibility testing remains open.
