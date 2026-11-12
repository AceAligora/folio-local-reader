# Folio 0.11.3 — safer local upgrades

Folio now saves and verifies a local database backup before upgrading an older profile's database format.

- Snapshots include the latest committed reading data, notes, collections, preferences and database settings, including changes still in SQLite's write-ahead log.
- Folio checks the backup's schema/integrity and SHA-256 before proceeding. If backup creation fails, the database format is not changed.
- Schema changes and their version marker commit together. Failed migrations roll back; a concurrent write cancels the upgrade rather than using a stale safety copy.
- A shipped offline recovery command verifies a snapshot and creates a separate recovered profile, preserving the working profile and original ebooks.
- Failed upgrade startup releases its runtime marker so the app can start again after the storage problem is corrected.

## Install or update

Download **Folio-Setup-0.11.3-windows-x64-unsigned.exe**, or choose **Updates → Check for updates** in an installed updater-enabled Folio. Published stable GitHub Releases remain the update feed. Portable ZIPs update manually. This Windows x64 preview remains unsigned by owner choice.

## Compatibility and limits

Schema stays **8**. Updating from 0.11.2 creates no redundant upgrade snapshot. This protection applies when this version performs a schema transition; it cannot recreate a pre-upgrade backup from a transition already completed by an older build.

Keep each `.sqlite` snapshot and its matching `.sqlite.json` together in the profile's `upgrade-backups` folder. These contain private local data and are not encrypted. Snapshots are database-only; full-profile ZIPs remain available for custom cover and package assets. Nothing is uploaded. No ebook is changed.

121 local tests passed, including ten new generated-fixture checks for WAL preservation, failed migrations, unavailable/linked backup folders, stale snapshots, separate-profile recovery and server retry. Real power-loss, hardware disk-full and broader accessibility/device testing remain open. See [upgrade recovery instructions](https://github.com/AceAligora/folio-local-reader/blob/v0.11.3/docs/UPGRADE-RECOVERY.md).
