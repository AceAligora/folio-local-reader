# Automatic database protection during upgrades

Starting with Folio 0.11.3, opening a populated profile with an older database schema first creates a verified local snapshot. The upgrade stops if the snapshot cannot be saved or verified. New profiles and profiles already on the current schema do not create extra copies at every launch.

## What is saved

Snapshots are stored in `upgrade-backups` beside `library.sqlite`; the default Windows location is `%LOCALAPPDATA%\LocalEbookReader\upgrade-backups`. Each `.sqlite` has a matching `.sqlite.json` manifest containing its old/new schema numbers, creation time, byte count and SHA-256. Keep both files together. They contain private library paths, saved reading data, preferences, lock configuration and other database records. They are local files, not encrypted archives or signed publisher artifacts. File access follows the profile's operating-system permissions.

The copy includes committed data still in SQLite's write-ahead log. Folio checks its schema and database integrity, flushes the files, then changes the schema and its version marker in one transaction. If another connection commits while the snapshot is being prepared, Folio cancels migration and asks you to close other processes and retry. A failed migration retains the verified snapshot and rolls back its own database changes. A failed startup removes its own server runtime marker so a corrected retry can start normally.

This is a copy of existing persisted records, including when the saved preference is Incognito. It does not record a new reading session. No ebook file is opened, rewritten or uploaded by this operation. Snapshots are excluded from release payloads and are never automatically expired or cleared as cache. After confirming an upgrade and keeping your own offline copy, you can remove unneeded snapshot/manifest pairs yourself while Folio is closed.

## Verify or recover offline

Stop Folio first. From the source checkout, verify a chosen snapshot:

```powershell
node scripts/recover-upgrade.mjs "C:\path\to\upgrade-backups\schema-7-before-8-TIMESTAMP-ID.sqlite"
```

Use the actual filename. Verification checks the manifest, bytes, schema and SQLite integrity without starting Folio or migrating that file. To create a separate recovered profile:

```powershell
node scripts/recover-upgrade.mjs "C:\path\to\upgrade-backups\schema-7-before-8-TIMESTAMP-ID.sqlite" --to "$env:LOCALAPPDATA\Folio-Recovered"
```

The portable browser ZIP also includes the tool and its own Node runtime. From the extracted folder, use this form instead; no installed Node is required:

```powershell
& .\runtime\node.exe .\app\scripts\recover-upgrade.mjs "C:\path\to\upgrade-backups\schema-7-before-8-TIMESTAMP-ID.sqlite" --to "$env:LOCALAPPDATA\Folio-Recovered"
```

The destination's parent must exist, and the destination itself must not exist. Recovery copies and verifies the database; it refuses an existing profile. Your working profile and the snapshot remain intact. Open the recovered profile with a Folio version compatible with its saved schema and point `EBOOK_PROFILE` at that separate directory. Opening it in a newer Folio version may upgrade it again. The normal library folder still points to the original ebook location; reconnect that folder if necessary.

This command recovers the **database only**. Original ebooks, custom cover image files and downloaded extension packages are not copied. Use full-profile ZIP backups when those assets also need to be moved. The current database contains dictionary entries and lock configuration; these are retained, and an existing password lock still requires its password. Browser cookies and temporary source sessions are not included. Upgrade snapshots themselves are not bundled into full-profile ZIP exports: keep the selected pair separately if needed.

## Compatibility and verification limits

0.11.3 keeps schema 8. Updating from 0.11.2 therefore needs no schema change and creates no new upgrade snapshot. This protection cannot recreate a pre-0.11.2 database after it has already been upgraded. It protects transitions performed by 0.11.3 and later; keep independent backups for hardware failure or a lost drive.

Ten generated-fixture tests cover committed WAL data, all saved book/reading/config rows, new/current/newer profiles, legacy schema zero, unavailable/linked backup folders, atomic migration failure and retry, a concurrent commit, altered/missing backup metadata, separate-profile recovery, the shipped command and failed-server restart. Fixtures include spaces, Unicode and apostrophes in paths. No personal library is used. Physical power-loss tests, disk-full hardware tests and broader device/accessibility coverage remain open.

Implementation references: [SQLite VACUUM INTO](https://www.sqlite.org/lang_vacuum.html) and [SQLite data_version](https://www.sqlite.org/pragma.html#pragma_data_version). Checksums detect accidental corruption; they do not defend against another program that can rewrite both a private snapshot and its manifest.
