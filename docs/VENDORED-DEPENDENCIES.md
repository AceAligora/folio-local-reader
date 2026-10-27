# Bundled rendering dependency

PDF.js distribution: `pdfjs-dist` version **6.4.299**, obtained from the npm registry package metadata and tarball. Upstream: https://github.com/mozilla/pdf.js. Original package files, resource notices, and Apache-2.0 license are retained under `public/vendor/pdfjs`.

The browser imports `build/pdf.mjs`, uses `build/pdf.worker.mjs`, and resolves fonts, CMaps, ICC profiles and WASM resources from the same local server. No package installation or CDN request is required at runtime. Update all resources together when upgrading the renderer. Verify page rendering, rapid navigation, rotation, zoom, close/reopen, password handling and saved page positions after upgrades.

The application renders PDF pages to canvas; PDF JavaScript/actions and embedded interactive forms are not executed. Text layers and document search are future work.

EPUB ZIP extraction uses fflate **0.8.3** from the npm registry, retaining its MIT license under `public/vendor/fflate/LICENSE`. The app implements its own restricted chapter renderer rather than using EPUB.js. No external resources, publisher scripts, or publisher styles are loaded.

## Feed/XML parser

@xmldom/xmldom 0.9.12 (MIT), from its official npm package. Complete original package retained in `lib/vendor/xmldom`, with registry SHA-512 integrity and origin recorded in `upstream.json`. It has no runtime package dependencies. XML parsing rejects DTD/entity declarations, malformed feeds and bounded element/depth/size limits before use; HTML is converted to text and never evaluated.
