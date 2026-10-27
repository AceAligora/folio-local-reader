# Contributing

Use Node.js 24.14 or newer. No package installation is needed for this preview.

1. Run `node --test` and `node --check server.mjs`.
2. Start with `node server.mjs` and open the printed loopback address.
3. Use generated or openly licensed books for development. Never commit personal books, database profiles, exports, machine-specific configuration, or synced reference files.

Submit focused pull requests describing the user-visible change and validation. Changes to schema, file access, or source preservation require relevant integration tests. Interface changes should include screenshots with private information removed.

The current preview uses Node built-ins and vanilla JavaScript. See `docs/IMPLEMENTATION.md` for deviations from the proposed architecture and known limitations. Discuss new dependencies and reader engines before introducing them; preserve their licenses and notices.

UI contributions use the project-local [Taste Skill](.agents/skills/design-taste-frontend/SKILL.md).
Read its app-screen guidance and [Folio design notes](docs/UI-DESIGN.md) before changing interface patterns.
The skill is pinned and licensed in its own folder; its scripts are development tools and are not required to read books.
Bundle fonts, icons and other interface assets locally, keep every theme accessible, and test library, reader, settings and dialogs at desktop, tablet and phone widths.
Keep personal-book screenshots and profiles in ignored local folders. Use generated books in public screenshots.
