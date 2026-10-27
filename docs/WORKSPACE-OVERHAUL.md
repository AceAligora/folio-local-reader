# Workspace overhaul: implementation and remaining scope

Historical 0.2–0.3 design notes. The remaining-work tables below are superseded by [FEATURE-COMPLETION.md](FEATURE-COMPLETION.md). Current features include native-source discovery/downloads, full-profile backup, notes/highlights, continuous readers, OCR/speech, app lock and full-text search.

The current information architecture is Library, Updates, History and Settings. Browse now lives under Settings → Sources & extensions. Settings has a category index and separate category pages. This is an implementation increment, not completion of every advanced feature in the supplied specification. See [the design review](DESIGN-REVIEW.md) for the 0.3.0 refinement.

## Resume and reading data

Resume is enabled by default in Settings → Reader. Reopening a book fetches its latest saved state rather than relying on an old library card. PDF/image pages and EPUB chapters resume automatically; vertical scroll is restored within the rendered page/chapter. Position is saved after rendering, during scroll, periodically, on reader close and on page hide. Changing zoom, viewport size, fonts or EPUB content can alter the exact pixel location. The app does not automatically open a book on startup.

Incognito prevents progress/history/time writes at the server as well as the interface. Explicit favorites, bookmarks and category edits still save when requested. Reading time counts active, visible reading with periodic bounded increments, starting with this version; historical hours cannot be recovered. Abrupt process termination can lose the most recent seconds.

## Library

Implemented: all ebooks; unread/completed/downloaded-local filters; title, total known pages/chapters, last read, unread-first, latest local change, last local check and date-added sorts; grid/list/descriptive list; 1–10 columns; unread/local/completed badges; category editing, default category and counts; local auto-refresh while the server and an app tab run. PDF covers remain bundled-renderer thumbnails with local caching.

Local PDFs/images have pages rather than published chapters. EPUB counts currently refer to spine sections. PDF/EPUB counts become known after opening a book. Existing imported books get a metadata baseline at upgrade time because their original import dates were not recorded. The first scan establishes file-change signatures; later scans detect changes.

## Updates, Browse and History

Updates records local additions and source changes across restarts. History lists recently read books and opens them at saved positions. The built-in local source is active in Browse.

Browse accepts, stores and removes HTTPS repository URLs whose path ends in `.pb`, and provides the requested Keiyoushi index link. Saving a URL does not fetch it, parse its catalogue or execute code. Remote chapter updates, extension install/update/remove and migration are outstanding.

The supplied Keiyoushi repository targets Mihon/Android. Android APK/Kotlin extensions are not directly executable in this Node/browser app. A future extension runtime needs either native Folio adapters or an explicitly designed Android compatibility service. Supporting the same index URL is not equivalent to supporting its extensions. The local app makes no automatic extension-network requests or Cloudflare bypass attempts.

## Settings implemented

- General: English interface, visible tabs, last-opened/default tab, remembered filters/sort, and scroll preferences.
- Storage: clear generated thumbnail cache only, JSON reading-data backup export, and SQLite integrity check. Cache clearing never deletes source files or essential database/preferences. Export is not a complete profile restore system.
- Appearance: system/light/dark/sepia themes, optional glass styling/color blend, column controls, date formats. Tab customization is shared through General.
- Library: categories, default category, counts, display/badges and periodic local rescans. Categories can be assigned in the reader.
- Reader: default resume, paged LTR/RTL/vertical navigation, three click-zone presets for PDF/images, inverted zones, opening hint, classic/compact bottom details toolbar, background, side padding, double-tap zoom, progress visibility and browser wake-lock request where available.
- Extensions: stored repository management and NSFW visibility preference for future compatible sources. No active remote catalogue exists yet.
- Security: incognito and an inactive-window privacy overlay. The overlay also hides reader-dialog contents, but it is not OS screenshot protection.
- Insights: books sorted by tracked hours, cover thumbnails for PDFs/images, per-book hours and total hours.

## Remaining requested features

The UI marks unsupported features as unavailable instead of presenting working-looking toggles.

| Area | Remaining work |
|---|---|
| Storage/advanced | Complete backup restore, repair workflow, logs and log export, request dumps/viewer, source cookies, source User Agent/timeouts, Cloudflare integrations and mute management |
| Appearance | App-icon customization and fuller platform integration |
| Library updates | Excluded categories, title-update skipping and separate chapter/metadata/cover refresh policies for remote sources |
| Reader modes | Continuous horizontal/vertical, webtoon, auto-webtoon |
| Reader layouts | Single/double/automatic PDF and image layouts, separate first page and inverted spreads are implemented in 0.3.0; further spread polish remains |
| Reader interaction | Animated page changes, press-and-hold scrolling, long-press menu, zoom limits, full gesture and EPUB tap-zone integration |
| Reader toolbar | Custom arrangement, chapter outline selector, previous/next chapter distinct from pages, autoscroll, crop borders, web view and share |
| Reader display | Native status-bar integration, dedicated scroll indicator and OS screen controls |
| Extensions | Catalogue decoding, compatible source runtime, installs/updates/removals, source settings and alternative-source migration |
| Security | Actual application lock with server-side enforcement and native secure-window handling |

Automatic Cloudflare bypass is not implemented. Any future source integration must handle site challenges through its supported browser/session workflow; no toggle currently promises to bypass them.

## Validation

Generated-fixture tests cover saved page/scroll state after database reopen, bounded reading time, incognito suppression, category filtering, changed-file update history, stable rescans, backup structure, preference validation, source preservation, extraction limits and database integrity. Browser verification checks the new navigation and reopening a PDF at the last stopping page.
