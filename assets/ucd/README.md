# Vendored Unicode Character Database extracts

> [!NOTE]
> `tools/genUnicodeBlocks.js` verifies the sha256 pin on the table below
> and regenerates `src/js/core/blocksData.ts`, the committed block names
> and ranges behind the unicode block pages the charset picker offers.

---

## Provenance

| File | Source | sha256 |
|---|---|---|
| `Blocks-18.0.0.txt.gz` | https://www.unicode.org/Public/18.0.0/ucd/Blocks.txt (gzipped at vendoring) | `77cdc7792ec3c34fda801d6aa38e98c8cbdd1b6db2421afbf0962a30c2318144` |

Unicode data files are © Unicode, Inc., distributed under the
[Unicode License v3](https://www.unicode.org/license.txt), which
permits redistribution with this notice.

## Refreshing to a new Unicode version

- Download the new `Blocks.txt`, gzip it, and drop it here with the
  version in the file name.
- Update `UCD_VERSION` and `SHA256` in `tools/genUnicodeBlocks.js`,
  plus the table above.
- Run `bun tools/genUnicodeBlocks.js` and commit the regenerated
  `blocksData.ts` together with these files.
