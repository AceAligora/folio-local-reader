# Folio interface

The 2026-10 redesign uses the project-local [Taste Skill](../.agents/skills/design-taste-frontend/SKILL.md), pinned at `12af471f627f866411b4bd785b19646d3672784c`. Its MIT license and source are retained beside the skill. The app uses vanilla HTML, CSS and JavaScript; the skill is a contributor tool, with no runtime dependency or network requirement.

## Direction

Taste app-screen draw: seed `1803072882`, `achromatic-ledger`, light workspace. The reproducible draw is in `.taste-skill/direction.json`. The Folio interpretation is a warm paper ground, opaque stone navigation, ink controls and locally bundled Geist. Dark uses neutral charcoal; sepia uses paper and brown. Book covers, user-selected annotation colors and actual errors carry color. There are no decorative metrics, stock imagery, glass panels or remote interface assets.

The signature is a readable, cover-led library with explicit reading shelves and a quiet, integrated reader. The main question for each screen is:

| Screen | What it should answer first |
| --- | --- |
| Library | What can I read, and where can I continue? |
| List / descriptive list | Which title or edition matches what I need? |
| Reader | What page am I on, and how do I keep reading? |
| Settings index | Where do I change this part of Folio? |
| Settings page | Which defaults apply, and which controls are optional? |
| Notebook / history / insights | What did I save or read, and how do I return to it? |
| Sources / updates | What is already local, and what requires an explicit online action? |
| Import / collection / queue dialogs | What is selected, and what happens when I save? |

## Layout and interaction rules

- Use the semantic tokens at the top of `public/style.css`. The type scale is 24 / 16 / 14 / 12px; compact metadata may use 11px. Main and muted text pass a 4.5:1 contrast test on all theme surfaces.
- Desktop has a 240px labelled sidebar and 36px content gutters. At 1440px with the browser scrollbar and five configured columns, the book stage is about 203px wide: `(1440 - 15 - 240 - 72 - 4×24) / 5`. Covers fit their stage without cropping.
- At 1000px and below, navigation folds into a labelled Menu sheet. Hidden links are inert; opening the sheet contains keyboard focus and makes the main content inert. Escape, the close button, the scrim and a navigation choice close it.
- Tablet uses three cover columns and 24px gutters. Phone uses two columns, 20px gutters and an 18px gap. Alphabet and shelf rows scroll within their own bounds. The All initial filter comes first so clearing it stays reachable on phones.
- Settings have four task groups on the index, independent pages, a desktop section list and a phone section selector. Reader defaults use six disclosure groups. Keep field labels and saved preference keys intact when rearranging controls.
- Reader chrome is separate from the page plane: title and tools above, page controls below. Reading options and Book & notes are mutually exclusive disclosures. Preserve selections before opening annotation tools. Escape closes a tool disclosure before exiting the reader; focus reading retains its own Escape behavior.
- Keep custom toolbar placement, keyboard shortcuts, wheel navigation, EPUB typography, notes, resume, comparison and reader layouts working. The original files are never rewritten by a visual change.
- Use subtle shadows only on actual floating menus, dialogs and overlaid panels. Existing icon assets and menu icons are retained. The saved glass preference blends opaque neutral surfaces; it no longer applies blur or transparency.

## Local assets and contribution checks

Geist is served through the same loopback server as the app. Its OFL, upstream blob and checksum are in `public/fonts/Geist*`; no font CDN is used. Existing PDF.js text-layer and forced-color rules stay intact.

Run `node scripts/check.mjs` and `node --test`. On Windows, setting `FOLIO_NATIVE_TESTS=1` includes installed OCR and speech checks. Run Taste's source lint with `node .agents/skills/design-taste-frontend/scripts/lint.mjs --app public` and review its findings in context. Do not alter upstream PDF accessibility CSS merely to silence a generic visual-pattern warning.

Use an isolated generated library for write actions. Test desktop, tablet and phone layouts, themes, keyboard focus, all four book formats, imports, collections, annotations and resume. Keep screenshots and profiles in ignored local folders; never commit personal books or private-library captures.

The matching implementation review is in [UI-REDESIGN-QA.md](UI-REDESIGN-QA.md). Existing packaged installers are separate release artifacts; source UI changes require a fresh package build before they appear in an installed distribution.
