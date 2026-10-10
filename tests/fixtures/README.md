# Round-Trip Corpus

> [!NOTE]
> How the format round-trip test corpus is organized, what rights cover the
> committed artwork, and how the optional bulk conformance tier works.

---

## Tier A: Committed Artwork

The tutorial and reference pieces in [`src/ansi/`](../../src/ansi/) double as
the committed round-trip corpus. [`tests/corpus/roundtrip.test.js`](../corpus/roundtrip.test.js)
decodes each one, re-encodes it, and asserts the result is cell-identical and
the encoder is a fixed point.

> [!IMPORTANT]
> The artwork in `src/ansi/` is © its respective artists and is included with
> permission for tutorial display and format-interoperability testing. It is
> NOT covered by the repository MIT license. Do not add third-party artwork
> to the corpus without the artist's permission; that call belongs to the
> project owner.

---

## Tier B: Synthetic Fixtures

[`tests/corpus/generators.js`](../corpus/generators.js) builds deterministic
in-memory fixtures for the edge cases wild files can't guarantee:

- weird SAUCE records (comment blocks, max-length fields, zeroed TInfo, flag combos)
- ice color ANSI
- 132-column and large (80x2000) documents
- XBin RLE covering all four run types, embedded palettes, 256- and 512-glyph fonts
- UTF-8 ANSI with multibyte rows
- wide BIN files

Every generator is seeded, so each run produces identical bytes and no binary
blobs live in the repo. Known v2 codec defects are pinned with `it.fails` and
a comment; when a fix lands the test flips red and should be promoted to a
plain `it()`.

---

## Tier C: Bulk Conformance (optional, not CI)

Broad coverage against real scene packs comes from the owner's mirror of the
sixteencolors archive, pinned to an immutable commit:

| What | Value |
|---|---|
| Repo | [`xero/sixteencolors-archive`](https://github.com/xero/sixteencolors-archive) (fork of `sixteencolors/sixteencolors-archive`) |
| Pinned commit | `3ed700074f98dfb9a52b34e769d0162b6dfe6010` (branch `master`, committed 2024-10-08) |
| Layout | `<year>/<packname>.zip`, 1990 onward, ~5.3GB total |

The SHA pin makes the corpus immutable; bump it deliberately when the owner
syncs newer packs into the mirror.

**Fetch mechanics.** Never clone the whole mirror. Either sparse-checkout the
pack directories you need:

```sh
git clone --filter=blob:none --sparse https://github.com/xero/sixteencolors-archive
cd sixteencolors-archive
git sparse-checkout set 1996 2004
git checkout 3ed700074f98dfb9a52b34e769d0162b6dfe6010
```

or fetch single packs by raw URL:

```
https://raw.githubusercontent.com/xero/sixteencolors-archive/3ed700074f98dfb9a52b34e769d0162b6dfe6010/<year>/<pack>.zip
```

GitHub serves the bytes either way, so 16colo.rs infrastructure is never
touched.

**Rules.**

- This tier is a manually triggered (or nightly, if the owner enables the
  schedule) conformance job. It never runs per-PR.
- Never hit `api.16colo.rs` from CI or any automation. Its automation policy
  is undocumented and the root 403s generic clients. The API is for
  interactive in-app browsing only.
- Treat downloaded packs as untrusted input. Extract into an isolated
  directory and feed files to the decoders by path.
- Decode results are assertions about OUR codecs, not the files. A wild file
  that fails to decode is a finding to triage, not automatically a bug.

**Pack manifest.** Packs chosen for conformance runs get recorded here with
the reason. The list starts empty; fill it when the job is first enabled.

| Pack path | Why chosen |
|---|---|
| - | tallest-known file (ACiD-Trip-scale) goes here when picked |
