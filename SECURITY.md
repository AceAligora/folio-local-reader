# Security

This application is an early local-first preview. Do not expose its port through a proxy, tunnel, or LAN binding. File access is restricted to a user-configured root and authenticated browser session. Optional online tools are disabled by default.

Report suspected vulnerabilities through [private vulnerability reporting](https://github.com/AceAligora/folio-local-reader/security/advisories/new), which is enabled for this repository. Do not post exploit details or personal files in public issues.

Include the version, platform, reproduction using a generated fixture, expected behavior, and observed behavior. Never include personal ebooks, session cookies, or private paths.

The optional unsigned Windows Desktop preview uses a sandboxed Electron renderer with context isolation, no renderer Node integration and an exact-origin/main-frame IPC allowlist. Its bridge exposes no filesystem, generic shell or arbitrary IPC access. Native screen-capture exclusion is an OS request, not encryption or a guarantee against every recording method. See docs/DESKTOP.md for the lifecycle and remaining release checks. Do not load third-party extensions or replace the pinned runtime with an unreviewed download.
