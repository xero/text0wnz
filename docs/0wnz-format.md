# teXt0wnz Doc Format

> [!NOTE]
> The native `.0wnz` container: a gzipped JSON envelope that holds
> everything the classic formats cannot, including unicode glyph
> tables, 24-bit colors, animation frames, and embedded fonts. The
> codec lives in `src/js/core/codecs/envelope.ts`.

---

> ### Table of Contents
>
> - [Why a Native Format](#why-a-native-format)
> - [Container](#container)
> - [Envelope Fields](#envelope-fields)
> - [Planes](#planes)
> - [Glyph Table](#glyph-table)
> - [Colors](#colors)
> - [Metadata and Fonts](#metadata-and-fonts)
> - [Reading](#reading)
> - [Verification](#verification)

## Why a Native Format

ANSI, BIN, and XBin hold 256 glyphs and 16 colors. TundraDraw adds
24-bit color but has no frames and no unicode; durdraw adds frames but
quantizes to 256 colors. A piece that mixes unicode glyphs, truecolor
cells, blink, several frames, and an embedded XBin font had no file
that could hold all of it, so the editor saves one of its own. UTF-8
ANSI stays the interchange format; `.0wnz` is the lossless one.

## Container

A `.0wnz` file is a gzip stream (magic bytes `1F 8B`) wrapping one
UTF-8 JSON document. The codec is extension-agnostic; the editor keys
on `.0wnz` when opening and saving. Every number is a plain JSON
number, every byte array is base64, and the cell planes are
little-endian regardless of the saving host, so the same document
writes the same JSON on every platform. The gzip bytes around it can
differ between engines. Each native compressor writes its own DEFLATE
output, and where the engine has no working compression stream, the
fallback in `src/js/core/codecs/flate.ts` writes fixed-Huffman blocks,
or stored ones for incompressible input. Any gzip reader opens either.

## Envelope Fields

| Field                     | Type            | Meaning                                                                                                |
| :------------------------ | :-------------- | :----------------------------------------------------------------------------------------------------- |
| `format`                  | string          | Always `"t0wnz-doc"`. Any other value is refused.                                                      |
| `version`                 | number          | Envelope version, currently `1`. A higher number is refused.                                           |
| `mode`                    | string          | The document color mode: `classic16`, `xbin16`, `xterm256`, or `free`.                                 |
| `columns`, `rows`         | number          | Canvas size in cells. Every frame holds `columns × rows` cells.                                        |
| `iceColors`               | boolean         | iCE colors on: bright backgrounds instead of blink.                                                    |
| `letterSpacing`           | boolean         | 9px letter spacing on.                                                                                 |
| `globalDelayMs`           | number          | Frame delay for frames without their own.                                                              |
| `palette`                 | number[]        | Palette entries as `0x00RRGGBB` integers: 16 for classic documents, 256 for 256-color imports.         |
| `glyphTable`              | string or array | `"cp437"` for the identity table, else `[fontSlot, codepoint]` pairs. See [Glyph Table](#glyph-table). |
| `frames`                  | array           | One object per frame, at least one. See [Planes](#planes).                                             |
| `meta`                    | object          | Optional title, author, group, and comments. See [Metadata and Fonts](#metadata-and-fonts).            |
| `fontBytes`, `fontHeight` | string, number  | Optional embedded XBin font.                                                                           |
| `widthTable`              | string          | Optional provenance stamp that older files carry. Nothing reads it.                                    |

## Planes

Each frame holds three planes of 32-bit words, one word per cell in
row-major order, plus an optional delay:

```json
{
	"delayMs": 250,
	"glyph": "<base64>",
	"fg": "<base64>",
	"bg": "<base64>"
}
```

Each plane base64-encodes `columns × rows × 4` bytes with every word
stored little-endian. A plane of any other length is refused.
`delayMs` is written only when the frame overrides `globalDelayMs`.

**Glyph word.** Bits 0-15 hold the glyph id, an index into the glyph
table. Bits 16-23 hold attributes: bit 0 is blink, bit 1 is reserved
for a future double-width continuation marker. Bits 24-31 are reserved
and zero.

**Color words.** The `fg` and `bg` planes use the layout in
[Colors](#colors).

## Glyph Table

The glyph table maps glyph ids to `(fontSlot, codepoint)` pairs. Slot
0 is the document's classic font: the bitmap font chosen in the
picker, or the embedded XBin font. Slots 1 and 2 are the bundled
unscii-16 and GNU Unifont hex fonts. Slot 3 is the upper page of a
512-glyph XBin font, whose codepoints are `U+E000` plus the upper
glyph index.

A document whose table is exactly the 256 CP437 entries in order
writes `"glyphTable": "cp437"`. Anything else writes the whole table
as an array, where the array index is the glyph id. A table holds at
most 65,536 entries.

## Colors

A color word is either a palette reference or a frozen RGB value, and
the two mix freely within one document:

- **Palette index.** Bit 31 set; bits 0-23 hold the index into
  `palette`. The cell follows later palette edits.
- **Raw RGB.** Bit 31 clear; the word is `0x00RRGGBB`.

## Metadata and Fonts

`meta` carries the SAUCE editor's fields as plain strings: `title`,
`author`, `group`, and `comments`, with comments newline separated.
The envelope writes no SAUCE record; these fields are its equivalent
and fill the SAUCE editor on open. The key is omitted when every field
is empty.

When the document uses an embedded XBin font, `fontBytes` holds the
raw 8px-wide glyph bitmaps as base64 (256 or 512 glyphs ×
`fontHeight` bytes) and `fontHeight` the row count, 16 when absent.
Opening the file restores the font into the XBIN slot.

## Reading

The reader refuses, with a clear error, any file that is not gzip, is
not valid JSON after decompression, has a `format` other than
`t0wnz-doc`, has a `version` above the one it knows, has no frames, or
has a plane whose length does not match `columns × rows`.
Decompression stops at 256MB, so a crafted file cannot exhaust memory.

A newer envelope version is a hard stop rather than a best effort, so
a file from a future editor never half-opens.

## Verification

Unit tests in `tests/core/envelope.test.ts` round-trip a document
that no classic format can hold (a unicode glyph, a truecolor
foreground, a bright background with blink, and three frames with
per-frame delays), the compact `cp437` table marker, embedded fonts,
deterministic encoding, and every refusal case above.
