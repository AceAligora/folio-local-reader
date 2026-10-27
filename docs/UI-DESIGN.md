# Folio interface

The 2026-10 redesign uses the project-local [Taste Skill](../.agents/skills/design-taste-frontend/SKILL.md), pinned at `12af471f627f866411b4bd785b19646d3672784c`. Its MIT license and source are retained beside the skill. The app uses vanilla HTML, CSS and JavaScript; the skill is a contributor tool, with no runtime dependency or network requirement.

## Direction

The current interface follows the owner's selected bookshelf screenshot: an off-white canvas, rounded white application frame, compact icon sidebar, cream and olive header, green search action, coral selected navigation and prominent real book covers. The reference takes precedence over the earlier Achromatic Ledger draw, whose reproducible record remains in `.taste-skill/direction.json`. The Taste Skill and Product Design image-to-code workflow guide implementation and visual review; neither adds a runtime dependency.

Discover uses actual unfinished books first, then available recent additions to fill a maximum four-cover row. Search, format cards, categories and collections lead to the existing filtered library. This is local discovery, with no remote recommendation service. A new library shows an honest Add books state. The profile menu is labelled My bookshelf and contains local actions; no sample account, logout or fabricated book records are introduced.

The same materials, icons, typography and control shapes extend through the reader, settings, history, insights, notebook, source tools and dialogs. Dark uses muted green-charcoal surfaces; sepia uses warm paper. The main question for each screen is:

| Screen | What it should answer first |
| --- | --- |
| Discover | What can I continue, and what is available locally? |
| Categories | Which format, category or collection should I open? |
| My library | Which book matches my search, filters and reading shelf? |
| List / descriptive list | Which title or edition matches what I need? |
| Reader | What page am I on, and how do I keep reading? |
| Settings index | Where do I change this part of Folio? |
| Settings page | Which defaults apply, and which controls are optional? |
| Notebook / history / insights | What did I save or read, and how do I return to it? |
| Sources / updates | What is already local, and what requires an explicit online action? |
| Import / collection / queue dialogs | What is selected, and what happens when I save? |

## Layout and interaction rules

- Use the semantic tokens at the top of `public/style.css`. Quicksand is the interface face; Poppins SemiBold is used for primary titles and branding. The type scale is 30 / 20 / 16 / 14 / 12px; compact navigation and metadata may use 11px. Main and muted text pass a 4.5:1 contrast test on theme surfaces.
- Desktop has 60px outer gutters, a 210px labelled sidebar and 60px main-content gutters. At a 1200px content width, the rounded frame is 1080px wide, the first cover starts near x330/y309 and the category heading starts near y597. Four featured covers overlap the cream header's bottom edge. Actual covers fit their stages without cropping; do not substitute stock or reference book art.
- At 1000px and below, navigation folds into a labelled Menu sheet. Hidden links are inert; opening the sheet contains keyboard focus and makes the main content inert. Escape, the close button, the scrim and a navigation choice close it.
- Tablet uses a 20px outer frame, 36px main gutters and three library columns. Phone uses a full-width shell, 20px gutters, a horizontal featured-cover shelf and two category/library columns. Shelf and alphabet rows scroll within their own bounds. The All initial filter comes first so clearing it stays reachable on phones.
- Settings have four task groups on the index, independent pages, a desktop section list and a phone section selector. Reader defaults use six disclosure groups. Keep field labels and saved preference keys intact when rearranging controls.
- Reader chrome is separate from the page plane: title and tools above, page controls below. Reading options and Book & notes are mutually exclusive disclosures. Preserve selections before opening annotation tools. Escape closes a tool disclosure before exiting the reader; focus reading retains its own Escape behavior.
- Keep custom toolbar placement, keyboard shortcuts, wheel navigation, EPUB typography, notes, resume, comparison and reader layouts working. The original files are never rewritten by a visual change.
- The selected reference intentionally uses soft shadows beneath books and the application frame, rounded category trays and colored navigation icons. These are documented exceptions to generic Taste shadow/icon rules. Use original locally bundled Bootstrap icons and preserve their license. The saved glass preference blends opaque surfaces rather than applying blur.
- Scope thumbnail cleanup to the panel being replaced. Background library updates must not discard Discover's queued covers or revoke another panel's visible image URLs.

## Local assets and contribution checks

Quicksand and Poppins are served through the same loopback server as the app. Their OFL notices, upstream Git blobs and SHA-256 checksums are in `public/fonts/`. Previously bundled Geist and Roboto remain available. The original lavender sidebar artwork is in `public/art/reading-space.png`; it contains no third-party covers, portraits or screenshot fragments. No font CDN or remote interface asset is used. Existing PDF.js text-layer and forced-color rules stay intact.

Run `node scripts/check.mjs` and `node --test`. On Windows, setting `FOLIO_NATIVE_TESTS=1` includes installed OCR and speech checks. Run Taste's source lint with `node .agents/skills/design-taste-frontend/scripts/lint.mjs --app public` and review its findings in context. Do not alter upstream PDF accessibility CSS merely to silence a generic visual-pattern warning.

Use an isolated generated library for write actions. Test desktop, tablet and phone layouts, themes, keyboard focus, all four book formats, imports, collections, annotations and resume. Keep screenshots and profiles in ignored local folders; never commit personal books or private-library captures.

The matching implementation review is in [UI-REDESIGN-QA.md](UI-REDESIGN-QA.md). Existing packaged installers are separate release artifacts; source UI changes require a fresh package build before they appear in an installed distribution.
