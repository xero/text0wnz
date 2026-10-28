# Vendored Unicode Character Database extracts

> [!NOTE]
> `tools/genEawRanges.js` verifies the sha256 pin on the table below
> and regenerates `src/js/core/eawData.ts`, the committed range table
> behind the width policy (`src/js/core/width.ts`). The width-table
> version is recorded in every saved doc, which is why this is pinned
> data instead of a live engine query. `tools/genUnicodeBlocks.js` pins
> `Blocks-18.0.0.txt.gz` the same way and generates the unicode block
> pages the charset picker offers.

---

## Provenance

| File | Source | sha256 |
|---|---|---|
| `EastAsianWidth-18.0.0.txt.gz` | https://www.unicode.org/Public/18.0.0/ucd/EastAsianWidth.txt (gzipped at vendoring) | `600abcae8f6164ded54ee855a243e1ff3b8b08b4370723e587596fbce9f5eb36` |
| `Blocks-18.0.0.txt.gz` | https://www.unicode.org/Public/18.0.0/ucd/Blocks.txt (gzipped at vendoring) | `77cdc7792ec3c34fda801d6aa38e98c8cbdd1b6db2421afbf0962a30c2318144` |

Unicode data files are © Unicode, Inc., distributed under the
[Unicode License v3](https://www.unicode.org/license.txt), which
permits redistribution with this notice.

## Refreshing to a new Unicode version

- Download the new `EastAsianWidth.txt`, gzip it, and drop it here
  with the version in the file name.
- Update `UCD_VERSION` and `SHA256` in `tools/genEawRanges.js`, plus
  the table above.
- Run `bun tools/genEawRanges.js` and commit the regenerated
  `eawData.ts` together with these files.
- Do the same for `Blocks.txt` with `tools/genUnicodeBlocks.js`.
- The width tests pin boundary samples that will flag surprises, and
  saved docs keep their own recorded version, so old art is unaffected
  by the bump.
