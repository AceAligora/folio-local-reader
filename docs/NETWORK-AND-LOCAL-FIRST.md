# Optional network features — 0.4.0

## Local-first guarantee

The configured ebook folder, SQLite library, reading state, bookmarks, applied metadata, covers and reader assets remain local. Startup, scanning, search, covers and reading do not contact online services. Network access defaults off. To enable optional requests, use Settings → Sources & extensions → Enable optional network access.

Network requests are explicit actions rather than background synchronization. Disabling network access prevents new catalogue, package and metadata requests; cached catalogue browsing and local reading still work. No ebook files, full library listing, reading history or passwords are uploaded. Metadata searches send only the user-entered search text to Open Library. Package requests go to the selected catalogue's approved GitHub release assets.

## Implemented

- Add/remove GitHub-hosted HTTPS `.pb` repository addresses. Refresh uses the repository's companion `index.json`, not arbitrary protobuf schema guessing.
- Cache normalized catalogues in the local profile database. Search cached entries by name and language, including configurable NSFW visibility.
- Download APK packages from GitHub releases into the profile's `extension-packages` directory, separately from ebooks. Record file size, version and SHA-256. Export or remove a cached package offline.
- Compare downloaded package versions against refreshed catalogue data and offer an explicit newer-package download. Existing versions remain until removed by the user.
- Search Open Library for title/author/year suggestions, select a local book and explicitly apply a result. The suggestion becomes local metadata; original ebooks and filenames stay unchanged.
- Keep generated PDF/EPUB covers local. Metadata lookup does not replace covers with online images.

## Compatibility limits

Downloaded Android packages are stored files, not installed/executable Folio sources. Android source execution requires a different runtime. Folio-native adapters provide alternative-edition searches and RSS/Atom chapter fetching independently of Android packages. SHA-256 records bytes; it is not publisher/signature verification. No downloaded code is evaluated, imported, installed or launched.

Only GitHub/raw.githubusercontent.com repository indexes, approved GitHub release redirects and Open Library metadata queries are supported. These endpoints are not generic proxies. HTTPS, host checks, redirect checks, bounded responses and request timeouts apply. File downloads are limited to 80 MB, catalogues to 8 MB and metadata responses to 512 KB. Catalogue errors preserve the previous cache. Metadata queries are rate-limited and cached for a day.

## Where data lives

- `library.sqlite`: preferences, catalogue/metadata cache and package records, along with existing library data.
- `extension-packages/*.apk`: explicitly downloaded packages.
- Browser IndexedDB: disposable generated cover images.
- Original library folder: existing ebook files, never written by these tools.

Clear Cache affects generated thumbnails only. It does not remove the database, downloaded packages, reading history or source books. Package removal is a separate explicit action. Network cache is not included in the existing reading-data JSON backup; keep a separate profile backup if package retention is important.

## Verification

Automated tests use generated data and a mocked remote fetch to check network-off behavior, approved addresses, cached offline access, package storage/export/removal and unchanged source books.

Live checks refreshed the supplied Keiyoushi repository and cached **1,444 entries**. Open Library returned eight suggestions for the public test query “Pride and Prejudice.” A Comic Fury APK was downloaded (44,343 bytes), exported locally with the same size, hashed, then removed as a test artifact. No package was executed. Network access was switched off after checks.

References: [Keiyoushi catalogue](https://github.com/keiyoushi/extensions), [Open Library search API](https://openlibrary.org/dev/docs/api/search).

Chapter-feed checks and temporary source cookies are separately opt-in. Chapter downloads become local EPUBs; full-content feed caches can be saved offline. Temporary cookies never enter SQLite, exports, profile ZIPs or diagnostics. An isolated native source window has no library bridge, and its connections pass through a public-address-pinning proxy. See [supported feeds and session limits](CHAPTER-FEEDS-AND-SESSIONS.md).
