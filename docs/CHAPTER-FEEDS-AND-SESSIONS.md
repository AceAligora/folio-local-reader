# Chapter feeds and temporary source sessions — 0.9.0

The existing local library remains independent of network access, accounts and subscriptions. These features add an optional way to follow serialized works and save selected chapters for offline reading. Gutenberg and Open Library retain their existing complete-edition behavior.

## Follow and read a series

1. Open **Settings → Chapter feeds** and add the bundled **Chapter feeds** adapter if needed. This alone does not enable networking.
2. Enter a series name and an author-published HTTPS RSS 2.0 or Atom feed. Following stores its address locally. The suggested **The Wandering Inn** button fills the form; it does not subscribe or download anything.
3. Enable optional network access in **Sources & extensions**, then choose **Check chapters**. Updates also shows followed feeds, unread counts and downloaded chapters.
4. Choose **Save chapter locally** for cached full feed content, or **Download chapter** for a supported same-origin article page. A chapter becomes a separate, plain-text EPUB in your local library, with a series tag and collection. Existing ebooks are never replaced. Cached full-content chapters can be saved while networking is off.
5. Choose **Read offline**. The embedded reader adds previous/next downloaded-chapter controls and **Mark read & next**. Read/unread status is explicit; opening a chapter alone does not mark it finished. Original reader positions, notes and bookmarks remain available per chapter ebook.

Filter by unread, downloaded or revised chapters; search within a series and reveal more entries as needed. **Pause feed** stops remote checks. **Unfollow; keep local books** removes that subscription's feed history while retaining downloaded ebooks and their collection. A later feed revision offers **Download revised copy** and retains the previous local file. Entries disappearing from a recent feed remain in local history. An RSS feed is usually a recent window, not a complete series archive; mixed author feeds may include announcements as well as chapters.

Optional automatic checks default off and run only while the local Folio server is running, networking is on, Incognito is off and the adapter/feed is enabled. They use the shared source-check interval, inspect one due feed per scheduler pass and never automatically create books or download chapter pages. A feed containing full chapter text necessarily transfers that text during its check. Cancel an active operation through the chapter panel. Failed/cancelled checks retain the successful chapter list and downloaded books.

## Supported content and boundaries

- RSS 2.0 `guid`, `link`, `pubDate`, `content:encoded`; Atom `id`, alternate links, dates and text/HTML/XHTML content. Summaries/descriptions alone are not presented as complete chapter text. Link-only entries use supported article containers (`entry-content`, `chapter-content`, `reader-content`, `article` or `main`). Password pages are rejected.
- HTTPS only, public hostnames, default HTTPS port, no URL credentials. Chapter links and redirects must stay on the feed's exact origin. DTD/entity declarations, malformed XML, deeply nested/oversized input and duplicate entry identities are rejected.
- Up to 50 feeds per library, 500 entries per response and 5,000 retained entries per feed. Responses are limited to 2 MiB, chapter text to 500,000 characters, and cached inline content to 4 MiB per feed. Older cached text may be discarded while its title/link/read/download history remains.
- Output is escaped text in generated EPUBs. Scripts, tracking images, styles, embedded content and remote assets are omitted. Complex layouts, comics, JavaScript-only readers, third-party authentication, paywall/password bypass and arbitrary scraping are unsupported.
- Feed definitions/history/cache live in SQLite and are included in full-profile backups, subject to the existing 256 MiB limit. Downloaded EPUBs live in your library; back up those files separately. Full-profile restore to a different library folder remaps subscription roots while retaining chapter/book identities. Reading-data JSON does not install subscriptions or enable automatic checks/sessions. Removing an adapter keeps downloaded books and saved feed data.

The live compatibility check used the author's [The Wandering Inn feed](https://wanderinginn.com/feed/): ten entries parsed, and a public chapter's article text was extracted without remote assets. No subscription or book was added to the personal library. This is a compatibility example, not a claim that every feed or future site layout works.

## Manual source sign-in or challenges

1. Use **Folio Desktop 0.9.0**, and enable optional networking plus **Settings → Source sessions → Allow temporary source cookies**. The browser edition shows status/clear controls but cannot open an isolated native source window.
2. Open the enabled source's temporary window. Its native title/menu retain the source hostname so a page cannot replace that identity. The window has a separate ephemeral Chromium session and no Folio preload or library bridge. The user completes any normal sign-in or challenge manually. Folio does not automate CAPTCHA solving or promise Cloudflare bypass.
3. Choose **Source session → Use this session in Folio** from that window's native menu. Only matching source cookies are copied to the local server's memory; the window's browser storage is then cleared and the window closes. Retry the original feed/source action.
4. Use **Clear this source session** or **Clear all source sessions** to revoke it. Open source windows close after their next local guard check. **Discard and close** discards the new browser window's session without adopting it.

Cookies are origin- and path-scoped, limited to 100 cookies / 16 KiB per origin and at most eight hours. Expired cookies are excluded/pruned. Response cookies can rotate only an already adopted session. Cookies are never returned to the renderer, written into SQLite, exported, backed up or logged. Restarting the local server, locking Folio, Incognito, network/session opt-out and User Agent changes clear them. Removing/pausing the relevant source also revokes its active scope. Sources on the same exact origin share its temporary jar. Server-memory sessions do not survive a restart.

The source window uses Chromium's normal browser User Agent when the app's default Folio agent is selected; an explicit custom agent is honored. Adoption retains that browser agent for requests made with its jar. A site's TLS fingerprint checks, browser storage tokens, client certificates, cross-origin SSO or other protections may still reject a replay. This implementation supports cookie-based sessions, not every authentication mechanism. No personal credentials are collected through Folio's settings UI.

Both custom-feed requests and the source-window proxy resolve and pin a verified public IP before connecting. The proxy requires a random per-window credential and permits only that source host plus `challenges.cloudflare.com` for challenge subresources. Main-frame navigation stays on the source origin; local/private/reserved destinations, popups, downloads, device permissions and certificate bypass are blocked. This deliberately limits third-party login/CDN flows. TLS validation remains enabled.

## Verification and remaining manual coverage

The 59-test suite includes generated RSS/Atom parsing and DTD limits, stable IDs, revision copies, disappearing entries, cached/offline downloads, read status, cancellation, redirect refusal, original/time preservation, authenticated API/app lock, cookie rotation/expiry/path/origin isolation, redirect non-leakage, a real local proxy tunnel and native-controller isolation. Windows OCR and speech tests also ran locally.

`node scripts/verify-desktop-session.mjs` uses a fresh generated profile and the packaged Electron executable. Its hidden, blank source window adopts/clears a synthetic cookie, checks sandbox/context isolation/no Node/no preload, and closes its owned server. It performs no source navigation or account sign-in. `scripts/create-serial-fixture.mjs` prepares a separate generated chapter library for browser checks without external requests. Browser verification covered offline save/open, persistent read status, filtering, Updates and direct next-chapter navigation.

Actual account sign-ins/CAPTCHAs remain user-operated and site-dependent; no solved Cloudflare challenge is claimed. Broader screen-reader/device/capture/recovery coverage and code signing retain their prior checklist status. The GitHub preview workflow is prepared locally, not verified on hosted infrastructure.
