# Archive Support

> [!NOTE]
> How the editor reads archives in the browser. Most of this page
> covers `.lha` and `.lzh`: which header levels and compression
> methods the built-in decoder supports, how the formats are laid
> out, and how the implementation was verified. The reader lives in
> `src/js/core/codecs/lha.ts`. The shorter
> [Zip Archives](#zip-archives) section covers the `.zip` reader in
> `src/js/core/codecs/zip.ts`.

---

> ### Table of Contents
>
> - [Why LHA](#why-lha)
> - [What Opens](#what-opens)
> - [Header Levels](#header-levels)
> - [The lh5 Stream](#the-lh5-stream)
> - [Integrity](#integrity)
> - [Verification](#verification)
> - [Zip Archives](#zip-archives)
> - [References](#references)

## Why LHA

LHA is the native archive format of the Amiga scene. Ascii collys,
diskmags, and tool releases shipped as `.lha` (or the older `.lzh`)
the way the PC scene shipped `.zip`. An editor that browses
[aSCIIaRENA](https://asciiarena.se) needs to unpack them, and once the
decoder exists, native opens get it for free: drop an `.lha` on the
canvas and its openable files list in a picker.

The format dates to Haruyasu Yoshizaki's LHarc (1988) and Haruhiko
Okumura's compression research. Dozens of writers exist across DOS,
Amiga, and UNIX; the archives on aSCIIaRENA come mostly from LhA for
AmigaOS.

## What Opens

The reader is deliberately minimal. It handles what the amiga ascii
scene actually produced, verified against every archive aSCIIaRENA
hosts:

| Capability                                           | Supported                           |
| :--------------------------------------------------- | :---------------------------------- |
| Header levels                                        | 0, 1, and 2                         |
| `-lh0-` (stored)                                     | yes                                 |
| `-lh5-` (8KB window)                                 | yes                                 |
| `-lhd-` (directory)                                  | listed, never extracted             |
| `-lh1-`, `-lh4-`, `-lh6-`, `-lh7-`, `-lz4-`, `-lzs-` | no; extraction throws a clear error |
| Multi-volume archives                                | no                                  |

Any other method of the `-lXX-` shape (`-lh1-`, `-lh7-`, `-lzs-`, and
the rest) parses in the header walk, so a mixed archive still lists
completely; only extracting an unsupported entry fails. A header with
a method outside that shape, such as PMarc's `-pm0-` and `-pm2-`,
stops the listing with a torn-header error. Such entries are rare in
amiga collys.

Filenames decode as byte-exact ISO-8859-1, which keeps amiga latin-1
names like `c«w-LIG.txt` intact. Backslashes in filenames from
DOS-made archives normalize to `/`; a level 2 directory prefix only
has its `0xFF` separators converted.

## Header Levels

An LHA archive is a chain of entries, each a header followed by that
entry's compressed bytes. A zero byte where the next header would
start ends the chain, except where a valid method signature follows:
a level 2 header sized to a multiple of 256 also begins with a zero
byte, and the reader parses on through it.

### Level 0 and 1

| Offset | Size | Field                                       |
| :----- | :--- | :------------------------------------------ |
| 0      | 1    | header size, counted from offset 2          |
| 1      | 1    | header checksum                             |
| 2      | 5    | method id, `-lh5-` and friends              |
| 7      | 4    | compressed size (level 1: plus ext headers) |
| 11     | 4    | original size                               |
| 15     | 4    | timestamp                                   |
| 19     | 1    | attribute                                   |
| 20     | 1    | header level                                |
| 21     | 1    | filename length, then the filename          |
| -      | 2    | CRC-16 of the uncompressed data             |

Level 1 appends an OS id byte and a chain of extended headers; each
block's final 2 bytes hold the next block's size, and a zero size ends
the chain. The size field at offset 7 counts the extended headers, so
the reader subtracts them to find the real compressed size.

### Level 2

| Offset | Size | Field                           |
| :----- | :--- | :------------------------------ |
| 0      | 2    | total header size               |
| 2      | 5    | method id                       |
| 7      | 4    | compressed size                 |
| 11     | 4    | original size                   |
| 15     | 4    | unix timestamp                  |
| 19     | 1    | reserved                        |
| 20     | 1    | header level (2)                |
| 21     | 2    | CRC-16 of the uncompressed data |
| 23     | 1    | OS id                           |
| 24     | 2    | first extended header size      |

The filename lives in extended headers: type `0x01` holds the name,
type `0x02` a directory prefix with `0xFF` separators that the reader
converts to `/`.

## The lh5 Stream

`-lh5-` is LZSS over an 8KB sliding window, entropy-coded with static
Huffman tables that are rebuilt per block. Bits read most significant
first.

Each block opens with a 16-bit symbol count, then three code tables:

1. **Temp table.** Up to 19 code lengths, each 3 bits with a
   unary extension for lengths past 7, plus a 2-bit zero-run skip
   after the third entry. This small table exists only to compress
   the next one.
2. **Literal table.** 510 symbols: 256 literals plus match lengths
   3-256. Its code lengths decode through the temp table, where
   symbols 0-2 encode zero runs.
3. **Position table.** 14 symbols for the window's 13 distance bit
   lengths. Same 3-bit encoding as the temp table, without the skip.

Decoding then runs the block's symbol count through the literal
table. A symbol under 256 is a byte. Anything else is a match: length
is `symbol - 256 + 3`, and a position symbol `p` expands to distance
`2^(p-1) + (p-1 extra bits) + 1`. Copies may overlap themselves, which
is how runs compress.

A declared table size larger than the alphabet, a code length past 16,
an empty table, or a zero block count where output remains all throw
instead of guessing; a desynced stream must fail at the table, not
surface later as a confusing checksum error.

## Integrity

- **Every extraction is CRC-checked.** The header's CRC-16 (the ARC
  polynomial, `0xA001` reflected) is computed over the decoded bytes
  and must match, for stored and compressed entries alike. A rotten
  scene file fails loud instead of rendering garbage.
- **Size caps run before decoding.** An entry declaring more than 32MB
  in either direction is rejected up front, so a forged header cannot
  balloon the output buffer.
- **Match distances are bounds-checked**, and reads past the stream's
  end pad with zeros that the CRC then catches.

## Verification

The decoder was built against the live aSCIIaRENA corpus and a fuzzer:

- All 74 archives the site hosts, 4,190 valid entries across every
  header level, extract with matching CRCs. The one failing entry
  (`jp!demt5.asc` in `impure83.lha`) is corrupt in the wild; 7-Zip
  rejects it too.
- 6,000 mutated and truncated archives produced only clean
  `CodecError` failures: no crashes, no hangs, no case over a second.

Unit tests in `tests/core/lha.test.ts` cover each header level with
hand-crafted stored archives, the lh5 path with a real 1.6KB colly
embedded as a fixture, and the failure modes.

## Zip Archives

The PC scene shipped packs as `.zip`, so the 16colo.rs browser, the
aSCIIaRENA browser, and native opens all need to read them. They share
one minimal reader in `src/js/core/codecs/zip.ts` that walks the
central directory and extracts one entry at a time.

| Capability                                        | Supported                                                         |
| :------------------------------------------------ | :---------------------------------------------------------------- |
| Store (method 0)                                  | yes                                                               |
| Deflate (method 8)                                | yes                                                               |
| Other methods (deflate64, bzip2, LZMA, and so on) | no; extraction throws a clear error                               |
| Encrypted entries                                 | no; refused before extraction                                     |
| Zip64                                             | no; saturated count, size, or offset fields are refused           |
| Archive comment                                   | skipped, up to the 64KB the format allows                         |
| Prepended data (SFX stubs)                        | yes; offsets are corrected from where the directory actually sits |

- **Names.** An entry flagged UTF-8 (general purpose bit 11) decodes
  as UTF-8; everything else decodes as latin1, which keeps CP437-era
  names matchable. Backslashes normalize to `/`. Lookup by name tries
  an exact match, then a basename match, so a piece nested in a folder
  still resolves.
- **Integrity.** Every extraction is checked against the central
  directory's CRC-32, and an inflated entry must match its declared
  size. An entry declaring more than 32MB in either direction is
  refused before inflation, and inflation aborts the moment the output
  passes the declared size, so a lying header cannot balloon memory.
- **Opening.** A zip handed to File → Open, drag-and-drop, or a PWA
  file launch lists the entries the editor can open; a lone entry opens
  straight away, several raise a picker. Zip entries keep the editor's
  CP437 defaults, where amiga archives open as latin-1 in Topaz+ 1200.

Unit tests in `tests/core/zip.test.ts` cover store and deflate
extraction, basename matching inside nested packs, torn directories
and truncated data, and declared and lying decompression bombs.

## References

- [LHA file format overview](http://justsolve.archiveteam.org/wiki/LHA) - Just Solve the File Format Problem wiki
- [lhasa](https://fragglet.github.io/lhasa/) - Simon Howard's free LHA tool and library, with format notes
- [LHa for UNIX](https://github.com/jca02266/lha) - the canonical open implementation of the lh5 coder
- [APPNOTE.TXT](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT) - PKWARE's .ZIP file format specification
