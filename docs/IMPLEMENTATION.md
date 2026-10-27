# Implementation status — 0.6.1

The [completion ledger](FEATURE-COMPLETION.md) is the current acceptance checklist. The older prototype notes below retain historical architecture and limits; their remaining-feature lists are superseded by that ledger.

The Library follows the supplied compact reference, including A–Z grouping and filters. Mouse-wheel navigation is enabled by default and scrolls enlarged pages before turning at an edge. Optional network tools now support cached GitHub repository catalogues, local APK package downloads/export/removal and manual Open Library metadata application. Network access defaults off. See [network behavior](NETWORK-AND-LOCAL-FIRST.md) and [visual QA](../design-qa.md).

Settings is now organized into category pages, with Browse under Sources & extensions. Themes use a shared neutral color system. PDF/image readers include single/double/automatic layouts with separate-cover and inverted-spread preferences. See [design review and checks](DESIGN-REVIEW.md).

See [workspace overhaul status](WORKSPACE-OVERHAUL.md) for the latest navigation, preferences, reading resume, local updates, insights and remaining requested features.

## Latest reader additions

The **Contents & search** reader panel shows nested PDF outlines and a heading-based EPUB chapter list. Selecting an entry navigates within the current book; external PDF actions are not opened. PDF page labels (including Roman numerals) appear beside the physical page count. EPUB bookmarks use chapter labels.

PDF Find runs entirely in the browser using the locally bundled PDF.js text extractor. Ctrl+F (Command+F on macOS) opens it while a PDF is active. Results are one snippet per matching page and jump to that page; matches are not highlighted on the canvas. Search can be stopped and is cancelled when another query or book is opened. It stops after 200 matching pages or 10,000 checked pages, with an explicit limit notice. PDFs with scanned images need OCR, which is not yet included. Search handles case, whitespace and common Unicode ligatures; text extraction order depends on the PDF.

File/folder imports and virtual collections are implemented; see README for the current workflows. No network service is used for reading, navigation or PDF Find.

## Running

Requires Node.js 24.14+; SQLite support is supplied by Node and may emit an experimental warning on Node 24. No package installation, remote assets, account, or internet access is needed.

On Windows double-click `Start Reader.cmd`. Alternatively run `node server.mjs --open`. The server prints its address, starting at `http://127.0.0.1:4317` and trying another port if occupied. Keep the launcher open while reading; close it or press Ctrl+C to stop.

Enter an absolute library folder in the interface and select Save folder. This saves the location locally and starts a scan. Each folder with direct image children becomes one image book; nested folders become separate books. Scan Library refreshes the index. Existing source files are never intentionally written.

Configuration and SQLite data live under `%LOCALAPPDATA%/LocalEbookReader` on Windows or `~/.local/share/LocalEbookReader` on other systems. Optional `EBOOK_PROFILE`, `EBOOK_LIBRARY`, and `PORT` environment variables override the profile, initial library, and preferred port. Do not use the same profile with multiple running instances. No automatic scan occurs at startup; select Scan Library after files change.

## Working features

- Loopback-only server, strict session cookie, origin/host checks, bounded JSON bodies, and configured-root content access.
- Persistent SQLite library, source availability, filename metadata, format/search filters, pagination, grid/list views, latest-scan health report, scan cancellation, and link skipping.
- Natural-order image folder reader with page jumping, arrow navigation, rotation, and persisted page index.
- Embedded PDF.js canvas reader with range responses, page navigation/jump, fit-page and percentage zoom, rotation, fullscreen, and saved page position. Rendering assets are bundled locally.
- EPUB reading with chapter navigation, adjustable text size through the zoom control, and saved chapter index. Content is simplified, stripped of active elements, and placed in an iframe sandbox with scripts and external resources disabled. Raster images are embedded locally.
- PDF first-page cover thumbnails, generated lazily one at a time and cached in browser IndexedDB (up to 150 entries). Source size/mtime changes invalidate cached covers. Password-protected or unreadable PDFs retain a title placeholder.
- Persistent favorites, unread/reading/finished status, and named page/chapter bookmarks (click Bookmark again at the same location to remove). Favorites, Finished and Continue Reading filter the full library before pagination.

## Deliberate architecture changes

The first preview uses Node's HTTP server, built-in SQLite, and vanilla browser modules instead of React/TypeScript/Fastify. Node is installed on the initial machine but npm is not on its command path. This gives a runnable offline foundation without dependency installation. This is a provisional foundation; migration to the proposed stack remains a future decision. There is no build step or package lock. PDF.js and fflate are vendored with their licenses and pinned versions documented separately.

## Remaining phase 1 work

- User-controlled image exclusions/reordering, multi-chapter grouping, and manifest reconciliation.
- Duplicate candidate report, library-facing EPUB metadata extraction, EPUB covers, and custom cover selection. Reader extraction limits are implemented.
- Incremental metadata comparison (current rescans walk all entries and upsert records).
- Persisted scan diagnostics (current issues are session-only and capped at 200).
- More complete accessibility and performance validation, background worker isolation, and scan resource budgets.
- Additional public release governance/templates/CI. Apache-2.0 license text is included.

## Reader limitations

PDF text selection, search highlighting, custom PDF annotations, library-wide full-text search, notes, OCR, and desktop packaging remain planned. PDFs render single pages or spreads inside Folio; page index is saved after successful rendering. Password-protected PDFs prompt for the password without persisting it. Image resume currently uses page indices; inserting earlier pages can change the resumed content. Rotation and zoom are session-only. Image order is automatic and direct-child based.

EPUB support is a simplified chapter reader, not the proposed full EPUB.js integration. It preserves basic text structure and PNG/JPEG/GIF/WebP images, with a shared readable font. Publisher CSS, embedded fonts, SVG, internal hyperlink navigation, DRM, media overlays and fixed-layout fidelity are unsupported. Bookmarks identify chapters. Default resume additionally stores/restores chapter scroll pixels in the simplified reader; changed font/viewport/content can shift that position. Extraction limits: 80 MB compressed/expanded, 20 MB per entry, 5,000 entries and bounded compression ratio. These limits may reject unusually large legitimate books. Current decompression occurs in the browser main thread; worker-based loading remains future work.

Folder access problems preserve existing availability to avoid declaring inaccessible books deleted. The current app supports one configured root at a time. File identity is preserved for an unchanged root-relative path, not for moves/renames. There is no automated deletion or merging. External edits to the SQLite database are unsupported.

## Validation

Run `node --test` for generated-fixture scanner, ordering, source-preservation, persistence, and unavailable-root tests. Run syntax checks using the package `check` script or `node --check` on the server, library, and browser module.
