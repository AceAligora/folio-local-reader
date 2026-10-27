# Feature completion ledger

This is the current acceptance checklist, replacing older plan-only status summaries. A checkbox means implemented, not a promise of identical Adobe/Android behavior. Local reading never requires network access.

## Library and organization
- [x] Local PDF, EPUB and natural-order image folders, recursive rescan, cancellation and issues
- [x] Grid/list/descriptive layouts, A–Z/title search, requested local filters/sorts and badges
- [x] File/folder imports without modifying originals; overlapping virtual collections
- [x] Categories, favorites, reading status, named bookmarks, history and reading hours
- [x] Editable title/author, tags and series; custom local covers
- [x] CBZ comic archives, with bounded extraction and natural page ordering
- [x] User image ordering/exclusion, without modifying files; filename anchors for image/EPUB resume
- [x] Bulk editing, tag/series filters, size-based duplicate candidate report and explicit missing-book relinking
- [x] Persisted scan diagnostics and server-side periodic refresh without an open tab
- [x] Incremental folder-listing reuse with per-file change checks, full-scan override and automatic folder collections

## Reader
- [x] Embedded PDF canvas, PDF outlines/page labels/password opening/local text search
- [x] EPUB chapter list, local images, adjustable font/size/line spacing/width
- [x] Paged LTR/RTL/vertical; single/double/automatic layouts, cover offsets/inverted spreads
- [x] Continuous vertical/horizontal LTR/RTL for PDF/images/CBZ; webtoon and image auto-webtoon
- [x] Default resume, wheel navigation, zoom, rotation, fullscreen, click-zone presets
- [x] Autoscroll, hold-to-scroll, reduced-motion-aware transitions, progress indicator
- [x] Page-linked notes/edit/removal undo, notebook search and Markdown export
- [x] Reading links for the same device, original-file view
- [x] Custom toolbar arrangement, PDF/image border crop, long-press/right-click notes menu and bounded zoom controls
- [x] PDF text selection and saved quote highlights; EPUB quote highlights and internal chapter links
- [x] Local full-text index/search over embedded PDF/EPUB text
- [x] EPUB character/text-context anchors beyond chapter path plus scroll (local anchors, not CFI interchange)
- [x] Windows offline OCR, local JSON dictionary, verified installed Windows speech voices
- [x] Side-by-side books with optional synchronized page numbers

## Settings, storage and security
- [x] Separate settings pages; Browse inside Settings; themes/glass/date format/tabs
- [x] Theme-aware decorative icons in the main sidebar and settings section menu
- [x] Reading-data export, reviewed path-based restore, safety backup and atomic writes
- [x] Integrity check/index maintenance with database snapshot
- [x] Opt-in sanitized diagnostics and HTTP summaries with local view/export
- [x] Network timeout/User Agent, essential data protected from cache clearing
- [x] Incognito, inactive-window privacy screen, server-enforced password lock
- [x] Full-profile ZIP (database/covers/packages/dictionary/lock config), verified offline restore and retained safety profile
- [x] Category exclusions for local update notifications and cover-refresh policy
- [x] Folder scan exclusions with preserved originals/reading state and reversible library visibility
- [x] Optional background source checks, protected metadata/cover policies and category exclusions
- [x] RSS/Atom serialized chapter-feed checks, opt-in background refresh, retained chapter history and explicit local EPUB downloads
- [x] Browser/favicon/library icon selection
- [x] Windows desktop capture exclusion, focused-reader display wake blocker and taskbar page progress
- [ ] Mobile/native status-bar visibility (Windows taskbar progress is available instead)

## Optional network
- [x] Network defaults off; cached discovery works offline
- [x] Native adapter: Gutendex discovery and explicit Gutenberg EPUB download to local library
- [x] Find alternative editions without moving originals or transferring inaccurate page numbers
- [x] Open Library metadata lookup with explicit search text
- [x] Android repository discovery/catalogues; APK cache/export/remove/version comparison
- [x] Bundled adapter add/remove/update; Open Library discovery/metadata alongside Gutenberg downloads; source preferences and pagination
- [x] Remote metadata/cover review and refresh policies, category exclusions, pause/resume, cancellation and dismissed revisions
- [x] Complete-edition URL change notices without replacing ebooks or reading positions
- [x] Explicit per-book same-URL Gutenberg EPUB/source-cover revision comparison with retained local baselines
- [x] Serialized chapter updates through the bundled Chapter feeds adapter, with unread/revised filters and offline series navigation
- [x] Isolated Desktop source windows and temporary, origin-scoped cookie integration for manual sign-in/challenges; no automatic bypass promise

## Distribution
- [x] Apache-2.0, vendor notices, contributor/security docs and cross-platform Node CI
- [x] Portable Windows folder with bundled Node runtime and licenses; tested without relying on a Node installation
- [x] Unsigned portable Windows desktop host with sandboxed reader and verified local-server lifecycle
- [x] Per-user Windows installer/uninstaller, preserving personal ebooks and profiles
- [x] Optional PDF/EPUB/CBZ Open with registration, native file opening and saved-choice upgrades
- [x] Payload/release SHA-256 manifests and manual unsigned Windows build workflow
- [ ] Code signing (deferred by user choice; this release stays unsigned)
- [x] Contributor issue/PR templates and code of conduct
- [ ] Broad performance/accessibility/release testing

Android APK execution is replaced by Folio-native adapters, per the user's explicit choice. Windows-only controls run through the optional Electron desktop host; the localhost browser version does not claim these native capabilities. The desktop preview remains unsigned; its optional installer and Open with component require explicit selection. Portable extraction does not register anything. Mobile status bars require a mobile host. PDF editing/signatures/DRM removal and public multiuser hosting remain outside the original scope.

## Verified increment — 0.9.0

Chapter feeds now supports RSS 2.0 and Atom. Checks merge stable chapter identities, retain entries that disappear from a recent feed, track read/download/revision state and support per-feed pause/removal. Optional background checks default off and do not download chapter pages or create books. Explicit downloads create separate, plain-text EPUBs in the local library and group them by series/collection. Revisions create new copies; existing files, notes and positions stay intact. Full feed content can be saved from cache with networking off. The embedded reader provides local previous/next downloaded-chapter and Mark read & next controls.

Temporary source sessions default off. Desktop opens an ephemeral sandboxed window without a preload/library bridge; the user handles sign-in/challenges and explicitly adopts its cookies through a native menu. Server cookies remain memory-only, origin/path scoped, bounded to eight hours and excluded from all backups/logs. Opt-out, Incognito, lock, User Agent changes and restart clear them. Source requests pin public DNS results; an authenticated per-window proxy also pins Chromium's remote connections and denies local/private destinations. Remote pages cannot navigate to the local reader, create popups/downloads or request device permissions. Third-party SSO and non-cookie authentication are unsupported, and challenge acceptance remains site-dependent.

The full suite passes 59 tests including Windows OCR/speech. Controlled checks cover RSS/Atom/DTD rejection, stable identities, revisions/disappeared chapters, offline saving, cancellation/redirect refusal, preserved originals/time, cookie expiry/path/origin/redirect isolation, response rotation, app-lock APIs and backup privacy. The native Electron self-check creates a hidden blank source window, adopts/clears a generated cookie and verifies sandbox/isolation/no preload; it does not visit a login page or claim a solved challenge. Browser checks in a generated library verify offline chapter saving, reload-persistent status, unread filtering, Updates, embedded EPUB reading and Mark read & next. A live compatibility check parsed ten entries from The Wandering Inn and extracted text from a public chapter without remote assets or changes to the personal library. See [usage, limits and evidence](CHAPTER-FEEDS-AND-SESSIONS.md).

## Verified increment — 0.8.0

The unsigned Windows x64 installer installs for the current account without administrator access. Its optional Open with component defaults off, preserves Windows default readers and retains the chosen component during upgrades. Unchecking it removes Folio's owned registrations. Native file selection/command-line arguments open existing library books at their saved position; outside PDF/EPUB/CBZ files are imported over authenticated localhost, with originals untouched and persistent duplicate-import bindings. App lock is enforced. Install/uninstall reject running executables, unrelated nonempty folders and linked application paths. Uninstall deletes an exact application-file list and leaves ebooks, profiles and unexpected files intact.

All 51 automated tests passed, including actual Windows OCR/speech and generated file-open/import/lock/deduplication checks. The installer test uses an isolated registry namespace, a path containing spaces, generated ebooks and a separate profile; it verifies installation, saved-choice upgrades, association removal/re-addition, refusal while running, linked-path refusal, a second-instance file launch, native save/close and data-preserving uninstall. The 1,000 tiny-PDF benchmark measured 1,663 ms initial scan, 809 ms incremental scan, 34.57 ms median and 53.65 ms p95 library queries on this laptop. This covers indexing/queries, not real-book rendering or accessibility.

Builds reject private payloads and links, hash every payload file, pin runtime/compiler downloads and fail on compiler warnings. Release artifacts receive SHA-256 checksums; those are not publisher signatures. The manual GitHub workflow is prepared but has not been run on GitHub. See [distribution instructions and remaining manual test matrix](DISTRIBUTION.md). Code signing stays deferred at the user's request; broad device/accessibility/recovery testing remains unchecked.

## Verified increment — 0.7.0

The optional Windows x64 desktop host uses a pinned, SHA-256-verified Electron runtime with sandboxing, context isolation and no renderer Node integration. Only the exact local main frame receives a bounded reader-state bridge. External HTTPS details links open in the system browser; original-file windows have no bridge. The renderer cannot fetch remote sites; source networking stays in the existing opt-in server. All ebook formats continue to use the existing embedded readers. A private runtime record/instance handshake verifies server reuse. Only an owned server is stopped on exit, including app-lock cases; IPC disconnection also stops an orphaned owned server.

The full suite passes 47 tests including actual Windows OCR and speech. Additional native smoke runs on this laptop loaded the renderer bridge, reported sandbox/isolation enabled and Node integration disabled, and verified Windows' content-protection flag. A generated two-chapter EPUB opened at chapter two and completed the save/close handshake, preserving its original hash, bookmark and reading time. One run started/stopped its own server; another reused a server and left it running. Controller fixtures cover wake-blocker release on blur, minimization and reader exit. Capture behavior across external recording tools and visible native-window accessibility still need broader manual testing; the Windows API flag is not proof against every capture method.

Native-only settings are disabled in the browser. Capture exclusion defaults off, remains a separate choice from inactive-window privacy, and reading-data JSON restore preserves the current choice. Chromium's local cookie/cache folder is disposable and excluded from full-profile backups. At that increment, source browser sessions, chapter feeds, signing/installer/file associations and broader release testing remained open. Installer and association progress is recorded in 0.8.0 below.

## Verified increment — 0.6.5

Same-URL comparisons are implemented for linked Gutenberg EPUBs and source covers, behind a saved opt-in plus an explicit per-book action. Regular/background checks never download assets for byte comparison. The first successful comparison establishes a remote baseline; subsequent comparisons use SHA-256 and retain only URLs, digests, sizes and dates. EPUB changes create notices and never replace books or transfer reading positions. Covers retain review/custom-cover protections and reject bytes that changed after review. Limits are 20 MiB per EPUB and 5 MiB per cover. These are complete-edition/source-cover checks, not serialized chapter feeds or arbitrary remote image-folder tracking.

Generated fixtures verify opt-in/privacy/category/source/pause gates, baseline persistence, unchanged originals/bookmarks/time, repeated and dismissed notices, background checks without asset downloads, size/format/redirect rejection, cancellation and mid-request opt-out, stale-cover rejection and safe reading-data restore. The full suite passes 43 tests including actual Windows OCR and speech. Browser checks in an isolated library used controlled responses to save/reload the opt-in, establish a baseline, apply a reviewed cover and show the changed-EPUB notice at the same URL. The generated local book, bookmark, page and reading time remained intact. The main library's 54 books and reading-data/collection hash matched before and after the server update; network, automatic checks and content comparisons stayed off.

The main/settings menus also have decorative theme-aware vector icons with unchanged accessible labels. Serialized feeds, source browser sessions, native platform integration and broader release/accessibility testing remain open.

## Verified increment — 0.6.4

Generated-fixture checks exercise opt-in/exclusions/Incognito, source-owned automatic metadata, title preservation, custom-cover protection, optimistic writes, cached offline review, cancellation, error retention, dismissal, bounded fair background batches, safe JSON restore defaults and edition-link notices. Image fixtures exercise the Covers API → archive.org → numbered Internet Archive storage redirect chain. Browser checks exercised reviewed metadata while offline, explicit policy saving and reload, and the live source cover flow using a generated PDF. The live Open Library work-ID check returned metadata and a cover reference. Originals, saved page and bookmarks remained intact.

Automatic checks default off, require optional networking, and process at most 10 due links per pass. These sources do not provide chapter feeds. Edition notices compare URLs rather than same-URL ebook contents; cover notices compare IDs/URLs rather than same-URL image bytes. A changed source cover does not replace a manual cover. Native platform/session items remain open.

## Verified increment — 0.6.3

Adapter fixtures verify legacy switch migration, add/remove/update and persisted settings, optional network enforcement, per-source/page/preference cache isolation, bounded approved-host requests, malicious next-link rejection, offline metadata application and unchanged original bytes. The authenticated HTTP workflow exercises management endpoints without enabling network access. Browser checks exercised the bundled Gutenberg v2 update, Open Library removal/re-addition, cached results after removal, explicit metadata application to a generated PDF while offline, and French/newest/8-result preferences surviving reload. A live Open Library query returned 32 works; the Gutenberg live request timed out, leaving local reading unaffected.

Adapter lifecycle controls manage reviewed code bundled with the application; they do not install arbitrary remote JavaScript or Android APKs. Open Library is discovery/metadata only. New adapters require a Folio release/contribution. Automatic remote chapter/metadata/cover policies and browser source sessions remain unchecked below.

## Verified increment — 0.6.2

Generated fixture tests verify directory-cache reuse across restart, file edits inside unchanged directories, additions/moves/removals, full-scan override, excluded-book progress preservation, automatic/manual collection independence and backup behavior. Text-anchor checks cover insertions, repeated passages, Unicode, validation and backup encoding. Browser checks verified settings pages, folder exclusions/collections, EPUB paragraph 28 remaining at the top after changing zoom from 100% to 150%, closing/reopening at that passage, and cross-chapter fragment navigation. A settings label-shadowing error found during these checks was repaired.

Folder caching is timestamp-based and still traverses directories/checks files; it is not an OS filesystem watcher. Use the full-scan override after tools that preserve directory timestamps. EPUB anchors do not implement standard CFI import/export; a removed/rewritten passage falls back to chapter/scroll.

## Verified increment — 0.6.1

Generated-fixture checks cover local imports, collections, notes/backup restore, image ordering/exclusion, relinking, crop bounds, native-source cache/download boundaries, app lock, sanitized diagnostics, full-text stale-index exclusion, full-profile integrity and safe offline restoration. Optional Windows tests exercised actual installed OCR and speech locally. Browser checks verified continuous page tracking, EPUB navigation, PDF search/highlights, OCR, notebook and full-text search, and synchronized side-by-side reading.

Known limits: CBZ/EPUB extraction is 80 MB; full-profile archives are 256 MB. Continuous resume saves the page; exact within-page pixel offsets are not retained in continuous mode. PDF highlights mark matching text items, rather than precise character rectangles. Comparison state is session-only and reading time tracks the main book. Native catalogue live verification encountered a timeout; the adapter is tested with controlled responses and reports offline/network errors without affecting local reading.

## Local reading reliability follow-up
- [x] Per-book reading mode, layout, crop, background, padding and EPUB typography overrides; reset to app defaults
- [x] Continuous PDF/image/CBZ fractional page position, captured before close and restored after rendering
- [x] Same-volume PDF/EPUB/CBZ rename/move recognition after an identity-baseline scan, retaining book IDs and associated reading data
- [x] Automatic rotating local reading-data snapshots, manual creation, review and restore with a safety copy
- [x] Same-volume image-folder move recognition with page-path remapping for custom order, excluded pages and resume anchors
- [ ] Cross-volume content matching (manual relinking remains available)
- [x] Recursive filesystem watcher with debouncing, scan coordination, exclusions, Incognito pause, retry and manual/periodic fallback

Validation: 63 automated checks passed including Windows OCR/speech. A separate generated library verified EPUB font persistence after reload, recovery preview, and identical continuous scroll offset after reopening. This source update does not rebuild the previously delivered installer.

### Folder watching and image-book recovery
Folder watching is local-only and enabled by default; it runs while the Folio server is open and pauses in Incognito. A burst of events schedules a normal path-checked scan. Library settings show its status and allow disabling it. Fast completed background scans refresh the visible library even when the polling interval missed their running state. Errors retry without discarding the library.

Same-volume image-folder moves retain the book ID once a scan has recorded the directory identity. Custom order, excluded pages and filename anchors are remapped to the new folder. No hashing or filesystem writes to ebook originals occur. Cross-drive moves, image-page renaming and ambiguous matches still require manual review/relinking. The previously delivered installer is unchanged.

Validation for this increment: 65 automated checks passed with no skips, including Windows OCR/speech. Browser checks verified automatic appearance without a manual scan/reload, page-two resume after an image-folder rename, and live watcher on/off status. The main library retained all 54 books and identical reading data; network features remained disabled.

## Library-health follow-up
- [x] On-demand SHA-256 verification of same-format/size PDF, EPUB and CBZ candidates
- [x] Bounded reads (200 files / 2 GB), progress, cancellation, changed-file rejection and scan-staleness notice
- [x] Verification respects Incognito, library-root changes and server shutdown; no hashes or paths sent online
- [x] Missing-book transfer preview with fresh-state token; changed reading data requires a new review
- [x] Reading-data safety backup before a reviewed transfer; ebooks and missing records retained
- [x] Manual image-book relinking remaps custom image order, exclusions and filename anchors

Verified duplicates mean identical bytes at the time of verification, not identical titles or equivalent editions. Results remain in server memory only. Image folders are not hashed, and no duplicates are deleted or merged. Large libraries may receive a partial report at the read limit. Cross-drive recovery still requires selecting and reviewing the replacement; no automatic hash-based relinking is claimed. Transfer safety JSON files are kept under the profile backups directory and can be reviewed/restored with the existing reading-data restore tool.

Validation: 70 automated checks including actual Windows OCR and speech, plus browser checks of content verification, transfer preview and applied recovery with a safety backup. Installer packaging remains unchanged.

## Reading-comfort follow-up
- [x] Focus reading hides toolbars, metadata, navigation and comparison panels while keeping an always-visible exit button
- [x] Escape returns from focus reading to normal reader controls; normal reader Escape behavior is retained
- [x] Configurable page-forward/back, focus, bookmark and contents keys; enable/disable switch and reset defaults in Reader settings
- [x] EPUB iframe keyboard handling; editable fields, browser modifier shortcuts and native button Space behavior remain available
- [x] Duplicate/reserved shortcut assignments rejected; preference changes survive profile reload

Default keys: right/left arrows turn pages, F toggles focus reading, B toggles the current-page bookmark (new bookmarks ask for a name), and C opens contents. Paged vertical mode retains down/up navigation when those keys are not otherwise assigned. Ctrl+F keeps PDF search. Focus mode is session-only and does not enter operating-system fullscreen; fullscreen remains a separate control.

Validation: 73 automated tests passed including Windows OCR/speech. Generated-library browser checks verified a custom N page-turn key, focus mode on image and EPUB readers, and Escape from inside EPUB content. The previously delivered installer is unchanged.

## Local reading queue
- [x] Add books from the library queue dialog or reader; open queued books with normal resume behavior
- [x] Reorder/remove entries, duplicate-add protection and a 500-book bound
- [x] Queue order persists in the book state through restart, automatic/manual reading-data backups and restore
- [x] Same-volume moves retain queue membership; manual relinking transfers it to the replacement
- [x] Excluded folders remain hidden; completed and unavailable books are retained until explicitly removed
- [x] Incognito rejects queue changes; ebook files and existing reading positions remain untouched

Validation: 75 automated tests including Windows OCR/speech; browser checks verified adding two books, changing order, retaining order after reload and opening the first queued book in the embedded reader. Queue data remains local, and the existing installer has not been rebuilt.

## Notebook organization and colored highlights
- [x] Five named highlight/note colors and up to 20 individual note tags, separate from book tags
- [x] Notebook search includes selected passages, note text, book metadata and note/book tags
- [x] Combine note-tag, color, type and book filters; sort by book/page or creation date; browse 50 results per page
- [x] Export all or matching notes as Markdown with source filenames, page/chapter, quoted passages, comments, colors and tags
- [x] Edit in the notebook or reader, preserve unrelated notes and reject stale edits to the same note; removal offers Undo
- [x] Reading-data backups preserve colors and tags; legacy notes remain compatible and display as yellow
- [x] PDF highlights are scoped to their saved page; double-click text selection no longer triggers zoom
- [x] EPUB colors update without reloading the chapter; first exact quote can span inline formatting

Limits: PDF highlights still mark matching text items rather than precise character rectangles; repeated occurrences on the saved PDF page share the highlight. EPUBs mark the first exact quote in the current chapter, and overlapping quotes use the first matching annotation in stored order. These annotations do not add standard EPUB CFI interchange or rewrite the original book. New color/tag fields require this source update; older installers have not been rebuilt.

Validation: 81 automated checks passed with no skips, including real Windows OCR/speech. Generated-library browser checks verified notebook filters, edits, Undo, reload persistence, a filtered Markdown download, EPUB highlights across inline formatting and live recoloring, PDF page scoping, and creating a colored PDF highlight through the toolbar. No test annotations were written into the personal library.

Main-profile verification: the previous server was stopped. A complete cold profile copy and reading-data snapshot were saved before startup. The updated localhost app retained all 54 books and identical reading/collection data, with network features disabled.

## Offline reading assistance
- [x] Installed local-voice playback with speed (0.5–2×), volume, pause/resume and stop
- [x] Optional sleep timer (off by default), counting elapsed time even when paused
- [x] Page changes, reader exit, reload and app shutdown dispose playback and cancel pending audio preparation
- [x] Local Windows synthesis supports cancellation and removes temporary text/audio files
- [x] Rough current-page/chapter reading-time estimate from embedded text or OCR for that page; configurable reading pace
- [x] Speech/pace preferences persist while per-book typography and layout remain separate
- [x] OCR text from a previous page is excluded from speech and estimates; saving recognized text uses the individual-note API

Limits: this reads one section at a time and does not automatically turn pages or highlight spoken words. Browser speech reads up to 50,000 characters; the Windows audio path reads up to 6,000 per request and reports truncation. Reading-time estimates count up to 500,000 characters and clearly identify a partial sample; they are rough estimates for the current section, not predictions for the entire book. Speed/volume/timer settings apply before playback starts. No online voice fallback is used. The installer has not been rebuilt.

Validation: 88 automated checks passed, including real Windows OCR, voice synthesis and cancelled-synthesis cleanup. Generated-library browser checks exercised a chapter estimate, muted native playback, pause/resume, actual one-minute sleep expiry while paused, cancellation on a PDF page turn, and persistence of global speech settings alongside per-book EPUB typography.

Main-profile verification for offline assistance: all 54 books and reading/collection data were unchanged after the recovery snapshot and restart. Network features remained disabled and the sleep timer default remained off. Generated test audio/text files were cleaned up.

## Taste Skill interface overhaul

- [x] Project-local, revision-pinned Taste Skill with its MIT license and contributor guidance
- [x] Consistent light, neutral dark and sepia surfaces; locally bundled Geist font and license
- [x] Cover-led library, visible reading shelves, readable titles and all three display modes
- [x] Folding tablet/phone navigation, reachable imports and collections, keyboard focus handling
- [x] Grouped settings index, independent sections, mobile section selector and six reader-default groups
- [x] Compact embedded reader with tool disclosures, page controls and preserved custom toolbars
- [x] Preserve text selection through annotation menus; retain local resume, wheel input, search and comparison
- [x] Shared styles for notebook, history, insights, sources, updates and dialogs
- [x] Fix the import-start request found during the UI check; verify importing and creating a collection through the phone UI
- [x] Desktop/tablet/phone review, 88 passing automated checks and main-library preservation verification

See [UI-DESIGN.md](UI-DESIGN.md) for contribution rules and [UI-REDESIGN-QA.md](UI-REDESIGN-QA.md) for evidence and limits. This completes the source-app interface update; the existing installer was not rebuilt.
