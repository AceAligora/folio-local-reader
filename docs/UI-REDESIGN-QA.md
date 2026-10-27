# Taste Skill interface review

Date: 2026-10-27. Scope: the running local Folio source app, its library views, embedded reader, settings, notebook, history, insights, source tools and dialogs. Existing packaged installers were not rebuilt.

## Design and installation

- Project-local skill: `.agents/skills/design-taste-frontend`, from Leonxlnx/taste-skill at `12af471f627f866411b4bd785b19646d3672784c`, with MIT license and source pin retained.
- App-screen direction: Achromatic Ledger, Open plane, seed `1803072882`. The Folio face is warm neutral paper, stone navigation and ink controls. Actual covers are the visual signature. Geist is bundled locally with its OFL and integrity metadata.
- Desktop, tablet and phone baselines were captured before editing. The before/after desktop images were opened together for visual comparison. The redesign intentionally changes the hierarchy and density; it is not a pixel-match exercise against the earlier reference.
- Screenshot evidence is in ignored `.taste-skill/before/` and `.taste-skill/after/`. These include personal-library captures and must not be published. Generated-book reader and notebook captures are also retained locally.

## Changes verified

| Area | Evidence |
| --- | --- |
| Library | Real PDF/image covers render; titles use two readable lines; All, Continue reading, Favorites and Completed are visible; grid, list and descriptive list work. |
| Responsive shell | Labelled desktop sidebar folds at tablet widths; phone Menu exposes imports and collections; focus stays in the sheet and main content becomes inert. |
| Settings | All 14 pages were opened at 1440px and 390px. No horizontal document overflow or page error messages were observed. Visible desktop settings fields have labels. |
| Reader defaults | Six disclosure groups retain existing field handlers. Phone section selection works. |
| Reader formats | Generated PDF, EPUB, image-book and CBZ content opens in the embedded reader. PDF/image/CBZ page turning works. |
| Wheel and resume | Native wheel input turns image pages forward and backward at the edges; reopening restores the saved second page. |
| PDF search and notes | Local search returns two fixture pages. A note saves; selecting PDF text, opening Book & notes and saving a highlight preserves the quote and paints the saved highlight. |
| Other reader tools | Focus/Escape, continuous layout, contents, offline-tool disclosures, favorites, queue addition, comparison and a custom toolbar were exercised. Comparison opens with its selector focused and the tools menu closed. |
| Imports | A generated PDF was selected through the file picker, imported and appeared in the isolated library. This check found and fixed an existing GET request to the POST-only import-start endpoint. |
| Collections | A two-book collection was created through the phone UI and selected with the correct membership. |
| Themes | Light, neutral dark and sepia were rendered. Automated text-contrast checks pass on semantic theme surfaces. |
| Notebook | Saved notes and highlights appear in the phone notebook with no horizontal overflow. |
| Browser console | No errors were captured in the final test tab. |

Measured final library layouts at a 900px viewport height:

| CSS viewport width | Cover columns | Document content width | First book top |
| --- | --- | --- | --- |
| 1440px | 5 | 1425px | 409px |
| 768px | 3 | 753px | 465px |
| 390px | 2 | 375px | 529px |

The document widths exclude the browser's vertical scrollbar. Shelf and alphabet overflow is contained within their own scrolling rows. The first phone book starts within the top 60% of the viewport, including the main library's existing scan-issue notice. Reader screenshots were also reviewed at all three widths.

## Automated checks and exceptions

- `node scripts/check.mjs`: all application, service, script and test modules pass syntax checks.
- `FOLIO_NATIVE_TESTS=1 node --test`: **88 passed, 0 failed, 0 skipped**, including installed Windows OCR, speech synthesis and cancellation cleanup.
- Taste lint on the five changed interface files: **0 failures, 0 warnings**. Documented inline exceptions are actual overlay shadows and zero-padded calendar dates.
- Taste lint on all 33 public files: **0 failures, 8 warnings** in unchanged code. Six identify PDF.js high-contrast highlight filters (normally `none`), one identifies the real speech sleep timer's seconds, and one flags the literal authentication action “Unlock.” These are functional/accessibility code, not glass cards, decorative numbering or marketing copy.
- Rendered layout, labels, geometry, screenshots and interactions were inspected through the supported in-app browser tools. The skill's standalone Chromium inspector was not run; this report does not claim its generated score.
- Cover colors and user-selected annotation colors intentionally remain visible. The saved glass preference now blends opaque neutral surfaces rather than blurring content.

## Data and release boundaries

Source snapshots, reading-data JSON and a full profile archive were saved under ignored `.local/pre-taste-ui-upgrade/` before the update. The main loopback server was stopped gracefully and restarted with the new source. It retained all **54 books**, identical book reading state, collections and reading-time data, and **network access remained disabled**. The new font is served locally as `font/ttf`.

Write interactions used a separate generated library and profile. No test notes, imports, collections or reading sessions were written into the personal library. The interface adds no external runtime assets or services. The installed/distributed 0.9.0 installer remains a separate older artifact until a fresh distribution build is requested.
