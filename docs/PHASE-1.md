# Phase 1: Foundation and import

Status: ready for implementation planning. Application code has not been created.

## Outcome

A localhost application can index an explicitly configured ebook folder, display its contents, preview image-book grouping, and report import issues. It preserves all source files. Reading is delivered in phase 2.

The initial personal library will be configured locally during implementation; documentation and examples use a generic path rather than committing a personal location.

## Ordered work packages

### P1-01 — Repository and development setup

Create the web/server/shared workspace, choose a supported Node LTS release, lock dependencies, and add development, build, lint, type-check, and test commands. Document startup and shutdown on Windows. Add ignore rules before scanning real books; exclude `sources/`, local configuration, profiles, logs, databases, caches, and ebook formats.

Acceptance: a fresh checkout installs and builds from documented instructions; no machine-specific path is required in tracked configuration.

### P1-02 — Local service and profile

Serve the production interface and API from loopback. Handle occupied ports, clean shutdown, per-user application-data storage, and startup diagnostics. Implement request origin/host validation, ephemeral API authorization, and secure bootstrap before exposing library content.

Acceptance: the service is not bound to a LAN interface; unauthorized requests and foreign origins fail; startup identifies its address without exposing tokens.

### P1-03 — Persistence and library configuration

Select the SQLite binding, add migration support, and create root/book/source/image-manifest/scan-issue tables. Provide local root configuration with path validation and a generic example. Reject missing paths with a useful message and distinguish inaccessible paths from empty folders.

Acceptance: configuration survives restart, migrations are repeatable, and no database or configured path appears among publishable source files.

### P1-04 — Scanner and incremental rescans

Recognize PDFs, EPUBs, JPEG, PNG, WebP, and GIF case-insensitively. Walk configured roots with bounded concurrency, cancellation, and progress. Skip links/junctions by default. Track source entries, modification state, unreadable entries, and unsupported files without copying or editing books.

Acceptance: repeated scans do not duplicate books; one unreadable file does not abort a scan; cancellation preserves previously committed records; disconnected roots retain their book records as unavailable.

### P1-05 — Image grouping and natural ordering

Suggest a book for a folder with direct image children. Treat nested folders as separate candidates by default; offer an explicit multi-chapter grouping preview. Ignore non-image files for page order. Support exclusions, manual reorder, and deterministic numeric-aware sorting. Persist overrides separately.

Acceptance: `page1`, `page2`, and `page10` appear in that order; leading-zero ties are stable; chapter grouping is explicit; rescans preserve overrides and identify added/missing pages.

### P1-06 — Basic metadata and library interface

Show title, filename, format, source folder, availability, and import state. Use filenames as fallback titles. Add safe bounded EPUB metadata extraction and defer heavy PDF metadata/thumbnail work if it would delay import. Use placeholders for unavailable covers. Deliver basic grid/list views and title/filename filtering with scan progress and cancellation controls.

Acceptance: the library renders incrementally, empty/error states explain the next action, filtering works on imported records, and large result sets use pagination or virtualization.

### P1-07 — Library health and duplicate candidates

Report unreadable files, unavailable roots, missing files, malformed metadata, unsupported formats, and potential duplicates. Start duplicate suggestions with size/name evidence and label them as unverified. Offer retry/rescan, with no automatic source deletion or metadata merging.

Acceptance: failures are inspectable without exposing document text; issues can recover after a successful retry; duplicate suggestions do not hide or remove books.

### P1-08 — Validation and handoff

Run the checks below, document startup and limitations, and record a phase 2 reader prototype checklist. Use generated fixtures for automated tests; use the personal library only for local smoke checks and never as committed test data.

Acceptance: all phase exit checks pass, outstanding limitations are documented, and no ebook or personal profile is included in the source handoff.

## Focused validation

- Scanner integration: mixed formats, nested folders, uppercase extensions, Unicode/space paths, empty folders, unreadable entries, cancellation, restart, and incremental rescans.
- Data integrity: migrations, stable IDs on unchanged rescans, preservation of grouping overrides, and recovery from unavailable roots.
- Sorting/grouping: numeric segments, leading zeros, chapter folders, exclusions, deterministic ties.
- Access checks: traversal attempts, unconfigured paths, links escaping roots, unauthorized requests, and foreign origins.
- Metadata handling: corrupt EPUB/ZIP input and expansion limits.
- Source preservation: compare fixture contents before and after scanning.
- Interface smoke check: import, progress, filtering, issues, keyboard operation, and app restart.

Record scan duration and peak resource usage against the actual local library during the first authorized smoke check. Set performance budgets from that baseline rather than inventing a hardware-independent guarantee.

## Phase 1 exit checklist

- [ ] Fresh setup and production startup documented and verified on Windows.
- [ ] Explicitly configured root indexes without modifying source files.
- [ ] Incremental rescan, cancellation, and missing-root behavior verified.
- [ ] Image order and grouping are previewable and persistent.
- [ ] Library and health report work with accessible controls.
- [ ] Local API access restrictions are verified.
- [ ] Personal data and synced references are excluded from publication.
- [ ] Phase 2 EPUB/PDF/image prototype cases are documented.
