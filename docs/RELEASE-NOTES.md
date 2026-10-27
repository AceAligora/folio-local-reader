# Folio 0.10.0

A local-first Windows ebook reader for PDF, EPUB, CBZ and naturally ordered image collections.

- New bookshelf interface with cream/olive surfaces, real covers, local Discover, categories and matching reader/settings pages.
- Automatic desktop update checks at startup and every four hours. New stable GitHub Releases download in the background; Folio verifies SHA-256, saves reading progress, and installs after you choose **Install and restart**.
- Native **Updates** menu includes manual checking and an automatic-check opt-out. Software update checks are separate from optional ebook networking and send no library content.
- Installers, portable ZIPs, a machine-readable release manifest and SHA-256 checksums are distributed through **GitHub Releases**. Tagged releases build and test before publication.

## Windows download

Choose **Folio-Setup-0.10.0-windows-x64-unsigned.exe** for the installed desktop app with automatic updates. Installation is per user and needs no administrator access. The portable desktop/browser ZIPs are available for manual use; they do not automatically replace themselves.

This release is deliberately **unsigned**. Checksums verify artifact integrity; they are not publisher signatures. Books, original files, reading data and the existing profile are preserved. Optional Open with registration does not replace Windows defaults.

Existing 0.9.0 installations need this installer once to gain the updater. Future stable published releases are then detected automatically while Folio is running. Drafts, prereleases and ordinary source commits are not app updates. Offline reading remains available when GitHub cannot be reached.
