# Architecture plan

Status: proposed; validate dependency versions and licenses during implementation.

## Components

- `apps/web`: React, TypeScript, Vite interface.
- `apps/server`: Node.js and Fastify local API, scanner, and background jobs.
- `packages/shared`: validated contracts, identifiers, and shared types.
- `packages/readers`: PDF.js adapter, candidate EPUB.js adapter, image reader adapter.
- `docs`: product, architecture, contributor, and decision documentation.
- `tests/fixtures`: small generated or redistributable examples only.

SQLite stores persistent data through versioned migrations. Evaluate a maintained Node SQLite binding against the chosen supported Node LTS version and later desktop packaging before locking it in. Use a workspace and lockfile for reproducible installs.

The production server serves the built interface and API from one loopback origin. Development uses a narrowly configured local proxy. Electron packaging is a later adapter around the same service and UI; keep Node integration disabled in reader content and use an isolated, minimal native bridge.

## Data ownership

Application data goes into the operating system's per-user application-data directory. Separate database, configuration, disposable thumbnails/caches, and logs. Allow an explicit portable profile later.

Suggested entities:

- Library root: configured path, scan options, availability.
- Source entry: root-relative path, format, size, modification time, availability.
- Book: stable application ID, metadata, cover reference, optional series.
- Image manifest: ordered member paths, exclusions, chapter grouping, user overrides.
- Scan job and issue: progress, cancellation state, bounded diagnostic information.
- Reading state: book ID, format-specific location, settings, status.
- Bookmark and annotation: book ID, location/anchor, content, timestamps.
- Collection and tag: many-to-many book membership.

Keep source metadata distinct from user overrides. Stage 1 implements only entities it needs; later migrations add reading and annotation data.

## File identity and scanning

Root-relative paths and file attributes support inexpensive incremental scans. Stable book IDs must not depend solely on paths. Hashing is deferred and bounded: a duplicate candidate is a suggestion, not proof. Later verified hashes and explicit user relinking support moves and renames. Never merge reading data automatically on a weak match.

Walk directories in batches with cancellation, bounded concurrency, and per-entry errors. Do not follow junctions or symbolic links by default. Missing or disconnected roots must not mark every book deleted. Preserve records and distinguish unavailable roots from missing individual files after a successful scan.

Natural image ordering compares numeric filename segments, then uses a deterministic filename/path tie-breaker. Test leading zeros, mixed case, Unicode, and nested chapter names. Preserve user ordering overrides across rescans and flag changed members.

## Reader contracts

Each reader exposes open/close, navigate, current location, restore location, outline, and capability reporting. Search, text selection, zoom, highlights, and reflow are optional capabilities, not assumed across formats.

PDF locations use page indices and appropriate position data. EPUB locations use document references/CFIs and robust anchors where supported. Image locations use manifest member identity plus position, rather than a page number alone.

Keep rendering work and decoding lazy; dispose offscreen pages and object URLs. Use HTTP range responses for PDF access and bounded extraction for EPUB resources. Do not persist PDF passwords.

## Local access boundary

- Bind only to loopback; choose an available port and report the actual address.
- Validate Host and Origin on applicable requests. Do not enable wildcard CORS.
- Use an ephemeral session token for API requests, bootstrap it without putting it in URLs or logs, and reject unauthorized file access and mutations.
- Address book files by internal IDs; do not accept arbitrary file paths through content endpoints.
- Resolve and validate paths against configured roots, including junction/symlink escape cases.
- Configure roots through a local setup mechanism; keep directory browsing constrained to configured roots. Desktop folder selection comes later.
- Treat EPUB HTML, SVG, embedded resources, and archives as untrusted. Disable scripting, block remote resources, isolate rendering, and constrain CSP/navigation.
- Enforce archive entry, expanded-size, compression-ratio, and path limits. Never extract archive paths outside an owned temporary directory.
- Bundle reader assets; avoid remote fonts, analytics, and automatic update requests.
- Keep logs bounded and avoid document text, passwords, tokens, and unnecessary absolute paths.

## Open-source requirements

Use Apache-2.0 for original project code when licensing files are added. Preserve dependency notices and review bundled assets and transitive dependencies. Keep sample configuration generic. Ignore local profiles, books, caches, exports, credentials, machine-specific configuration, and synced `sources/` when creating the future repository. Do not publish existing project references as part of the app.

## Decisions to validate

1. EPUB engine fidelity and maintenance, including fixed-layout content and resource isolation.
2. SQLite binding and packaging compatibility.
3. PDF rendering performance and annotation anchoring.
4. Exact desktop process lifecycle, secure bridge, and installer behavior.
5. Optional OCR engine, asset licenses, and resource budget.

Reference candidates: [PDF.js](https://mozilla.github.io/pdf.js/) and [EPUB.js](https://github.com/futurepress/epub.js/). These are proposed dependencies, not installed components.
