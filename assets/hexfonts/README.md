# Vendored hex font sources

> [!NOTE]
> These files are the upstream sources for the unicode glyph pipeline.
> `tools/bakeHexFonts.js` verifies their sha256 pins, then packs them
> into per-256-codepoint block binaries under `src/fonts/u/` (generated,
> gitignored) which vite copies into `dist/ui/fonts/u/`. The runtime
> fetches blocks lazily and reads them with `src/js/core/hexfont.ts`.

---

## Provenance

| File | Source | Version | sha256 |
|---|---|---|---|
| `unscii-16.hex` | http://viznut.fi/unscii/ | 2.1 | `2642c8b748fa81f24d76772d70c55faa720d98fadfec8133daf89136c5c8bfb1` |
| `unifont_all-18.0.01.hex.gz` | https://unifoundry.com/pub/unifont/unifont-18.0.01/font-builds/ | 18.0.01 | `14c96e497466a82e46cf20032ce510e186bdc8658c9158e2290f452cda9bc498` |
| `OFL-1.1.txt` | `unifont-18.0.01.tar.gz` from the same release | - | license text |

Versions re-verified against upstream on 2026-10-11.

## Licenses

**unscii-16.** Public Domain. The unscii page states: "'unscii-16-full'
falls under GPL because of how Unifont is licensed; the other variants
are in the Public Domain. Unscii was created by Viznut." Never vendor
`unscii-16-full` here; its GPL terms would bind the bundle.

**GNU Unifont.** Dual-licensed since 13.0.04: SIL Open Font License 1.1
or GNU GPL 2+ with the font embedding exception. This project elects
the OFL option; the full text is vendored as `OFL-1.1.txt`. The OFL
requires that the font not be sold by itself and that derivatives stay
under the OFL, both satisfied here.

Both fonts are credited in the in-app credits UI. The repo's MIT
license covers the code, not these font files or the artwork under
`src/ansi/`.

## What each file is

**`unscii-16.hex`.** viznut's 8x16 bitmap font purpose-built for
textmode art: full Box Drawing, Block Elements, Braille, and most of
Legacy Computing. 3,240 glyphs, 243 of them double-wide. Codepoints
are five hex digits.

**`unifont_all-18.0.01.hex.gz`.** GNU Unifont, every plane, including
ConScript PUA coverage: 126,743 glyphs, Legacy Computing Supplement
with all 230 octants, dual-width CJK. Expands to ~8.3MB of text, which
is exactly why the bake step exists.

## Refreshing a font

- Download the new file from the source URL above (prefer the `.gz`
  build for Unifont and check its `.sig` if you have GPG set up).
- Update the matching file name and sha256 pin in
  `tools/bakeHexFonts.js` (`SOURCES`), this table, and the credits UI
  if the version or attribution changed.
- Run `bun run fonts:bake` and the unit suite; the hexfont tests pin
  real glyph vectors that will flag a format change.
