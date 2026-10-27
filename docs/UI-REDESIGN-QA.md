# Bookshelf interface review

Date: 2026-10-27. Scope: running local Folio source app, including Discover, library, reader, settings, notebook, history, insights, source tools and dialogs. This UI review preceded 0.10.0 packaging; current installer/release evidence is in [DISTRIBUTION.md](DISTRIBUTION.md).

## Design and comparison

The owner selected a cream-and-white bookshelf reference. It supersedes the earlier Achromatic Ledger direction. The implementation uses the project-local revision-pinned Taste Skill and Product Design image-to-code workflow, preserving existing vanilla HTML/CSS/JavaScript behavior.

The source image and final browser screenshot were opened together at **1200 x 900 pixels**, with a matching **1200 x 900 CSS viewport**, light theme, Discover and four real covers. The final application frame measures **1080 x 768px at x60/y66**, matching the reference's major proportions. The first featured cover begins at x330/y309; visible category-heading type starts near y598. Full-size captures made the controls, small navigation text and cover treatments readable without separate close-up crops.

The comparison found and corrected a 12px excess gap before the category shelf. Header contrast checks also led to darker muted light/sepia text and expanded theme tests. The final comparison has no actionable P0/P1/P2 findings. Original sample books, genre labels and account details are intentionally replaced with real local books, formats, collections and a My bookshelf action menu. The outer decorative olive bleed remains inside the working app frame.

Quicksand and Poppins are bundled locally with OFL notices and upstream checksums. Original Bootstrap Icons retain their MIT license. The lavender orbital sidebar illustration was generated for Folio; no sample book art, portrait or screenshot fragment is bundled. Main and muted text meet 4.5:1 contrast on all semantic surfaces, including the cream/olive headers. All original ebook files remain untouched.

## Behavior verified

| Area | Evidence |
| --- | --- |
| Discover | Real unfinished books first, recent local books as row fill; query/category search opens the filtered library. |
| Categories and shelves | Format cards open the correct filter; Downloaded selects the local shelf; categories and collections remain accessible. |
| Library | Grid, list and descriptive list retain the generated collection without document overflow. |
| Reader formats | Generated PDF, EPUB, image-book and CBZ open in the integrated reader. |
| Wheel and resume | Native wheel turns a comic forward/back; reopening a PDF restores saved page 2. |
| Notes and search | A local PDF note saves; PDF search returns both matching fixture pages. Bookmark and focus/Escape work. |
| Imports and collections | File chooser imports a generated PDF, increasing the isolated library from five to six books. Phone UI creates and opens a two-book collection. |
| Settings | All 14 pages opened at 1440px and 390px, without horizontal document overflow or page error messages. |
| Responsive shell | 768px tablet and 390px phone render correctly; phone featured covers scroll within their shelf. Menu/Escape restores focus; main content is inert while the sheet is open. |
| Themes | Light, dark and sepia render; covers survive view/theme changes. |
| First launch | Empty Discover shows Add books; the action opens folder setup and focuses the path input. |
| Profile/help | Local profile Appearance action and Help & about work without invented accounts or login. |
| Browser console | No error entries in the inspected generated-library or final personal-library states. |

The existing broader reader/search/backup/OCR/speech behavior remains covered by the full suite; this visual pass does not claim a new physical-device or complete assistive-technology audit.

## Validation and exceptions

- `node scripts/check.mjs`: all application, service, script and test modules pass syntax checks.
- `FOLIO_NATIVE_TESTS=1 node --test`: **91 passed, zero failures/skips**, including Windows OCR, voice synthesis and cancellation cleanup.
- After the final color/test change: all five targeted discovery/layout checks pass, including text contrast on both new header surfaces.
- Taste lint on seven changed UI files: **zero failures, eight shadow warnings**. Book/frame shadows are deliberate reference requirements; remaining shadows belong to real overlays. They are documented exceptions to generic Taste guidance.
- Browser screenshots, rendered geometry, accessible names and interactions were checked through the supported in-app browser. The standalone Chromium inspector was not run; no inspector score is claimed.
- The detailed local QA gate is `design-qa.md`, with `final result: passed`. Its personal/reference evidence is ignored under `.local/reference-ui/` and must not be published. Early captures with scrollbar scaling were excluded from the final equal-size fidelity decision.

## Data and release boundaries

A cold profile copy, source snapshots, reading JSON and full profile export were saved before editing. Final hashes match for **book state, reading time and collections**. Preferences have no changed keys, all **54 personal books** remain, and **network access remains disabled**. Imports, notes, collection edits and reading tests used isolated generated/empty profiles only.

New interface assets and modules are explicitly served by the existing loopback server. No CDN, remote recommendation request, new runtime dependency, database migration or public service is introduced. The public README image contains a generated document only. The subsequent 0.10.0 release packages this UI; its release checks and updater scope are recorded in [DISTRIBUTION.md](DISTRIBUTION.md).
