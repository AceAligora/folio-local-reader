# Product roadmap

Status: planned. Updated: 2026-10-21.

## Goal

Build an offline personal reading workspace for existing PDF, EPUB, and image books. Start with a localhost application on Windows; preserve portable architecture for future macOS and Linux support and desktop packaging.

## Product principles

- Preserve original books and folder organization.
- Require no account, cloud service, telemetry, or external content requests for normal reading.
- Keep personal data outside the repository.
- Make large libraries usable through background jobs, lazy loading, and bounded caches.
- Use accessible controls and document extension points for contributors.

## Delivery stages

### 1. Foundation and import

Deliver the repository structure, local service, SQLite migrations, configured library roots, recursive scanner, import progress, metadata records, natural image ordering, grouping preview, and library health report.

Exit: a user can configure a folder, scan it, inspect supported books and failures, and rescan without duplicate records or changes to source files. See [the detailed plan](PHASE-1.md).

### 2. Reading MVP

Deliver PDF, EPUB, and image readers; outlines or chapter lists; page/chapter navigation; zoom where appropriate; scrolling; fullscreen; themes; bookmarks; reading status; and resume after restart.

Include PDF text search and page labels, password-protected PDF opening without persisted passwords, EPUB font and spacing controls, and image rotation, right-to-left reading, spread layouts, and cover offsets. Save viewing adjustments separately from books.

Include keyboard access, visible focus, reduced motion, descriptive controls, and high-contrast support. Reader content accessibility depends on the source document and rendering engine and must be tested separately.

Exit: representative books in all three formats open offline and resume accurately. Test large PDFs, Unicode paths, image collections, reflowable and fixed-layout EPUBs, and malformed files. Select the EPUB engine after this prototype evidence.

### 3. Daily-use workspace

Deliver tabs, session restore, navigation history, named bookmarks, grid/list layouts, continue reading, recent additions, favorites, collections, tags, bulk metadata edits, series ordering, custom covers, drag and drop, customizable toolbar, and reading presets.

Support folder-derived collections alongside virtual collections. Browsers cannot always supply an absolute path for dragged folders; resolve this through the local folder workflow and use native paths in the later desktop version.

Exit: a mixed library can be organized and read entirely with keyboard controls; tabs and settings survive restart.

### 4. Notes and portability

Deliver page/location-linked notes, highlights where text selection is supported, notebooks, annotation search, Markdown note export, versioned JSON export, backup/restore, explicit missing-book relinking, and optional relative-path library migration.

Use EPUB locations and text anchors rather than viewport page numbers. Image books initially support page notes; freeform drawing and image-region highlights require a separate design. Backups exclude books by default and explain included personal data.

Exit: exports restore into a fresh profile, preserve links, and handle changed or missing books without silent data loss.

### 5. Advanced reading

Deliver opt-in local OCR, OCR language management, library-wide full-text indexing, side-by-side books, optional synchronized PDF/image page movement, local dictionary integration, customizable shortcuts, and CBZ support. Evaluate additional formats separately.

Text-to-speech must use verified offline voices; show availability and avoid an online fallback. OCR and dictionary assets may require an explicit initial download or local import, after which they must work offline.

Exit: background jobs are cancellable, resource use is bounded, and disabling optional features leaves core reading available.

### 6. Desktop and public release

Package for Windows with folder picking, file associations, Open With support, app icon, installer/uninstaller, and a launcher requiring no development tools. Uninstall should preserve personal reading data unless the user explicitly chooses removal.

Add Apache-2.0 license text, third-party notices, dependency license review, contributor setup, code of conduct, security policy, issue/PR templates, CI, generated or redistributable fixtures, and release documentation. Public release checks apply to any earlier public preview as well.

Exit: install on a clean Windows machine, read offline, verify no private paths or books in tracked/release files, and document supported platforms and known limitations.

## Scope boundaries

PDF content editing, digital signatures, DRM removal, cloud synchronization, multiuser hosting, public network access, and a third-party plugin execution system are outside the initial scope. Printing and text copying can be added during reader polish after format-specific behavior is validated.

## Release priorities

The first public release targets stages 1–3 plus the public repository requirements from stage 6. Stages 4–5 are follow-up releases. No calendar estimate is committed until the reader prototype and a representative local scan establish complexity.
