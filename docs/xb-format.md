# XB: eXtended BIN Format specification

> Written by Olivier "Tasmaniac" Reubens / ACiD
> No rights reserved, No patent pending
> For comments/questions : Tas@acid.org
> http://uc2.unicall.be/tasmaniac/xbin.htm

---

## Introduction

Out of a crying need from several ANSi artists, a new type of file is
born and ready to take the Art scene by storm.

This new format is known as eXtended BIN or XBIN for short.

XBIN is what it's name dictates, it's an extention to the normal raw-image
BIN files which have become very popular among the art-scene lately.

The use of the XBIN format is more or less the same as for the BIN format.
However, XBIN offers a far better way to handle the the raw images.

## BIN vs XBIN

The BIN format was introduced into the art-scene out of a need to overcome
the limits of ANSi files. Apparantly, the 80 columns wide screen was too
constraining for some artists. The BIN format was adopted to resolve this
problem.

Being very simple in nature, BIN was quickly supported by several art
groups in their native ANSI/RIP/GIF/etc. viewer. Consequently, our very
own SAUCE standard went in for a quick facelift and immediately dealt with
one of the main problems imposed by the BIN format.

Being nothing more than a raw memory copy of the textmode videomemory, BIN
offers no insight to the size/width of the image. Having nothing more than
a BIN file, there is no way to determine whether it's a 80 column wide or
a 160 column wide image. SAUCE took care of this by taking the BIN format
into it's specifications. Out of the SAUCE attached to the BIN, one was
able to determine the correct dimensions of the BIN.

XBIN solves this little matter all by itself, and takes matters even
further. Anything BIN can do, XBIN does better.

## Features

XBIN allows for binary images up to 65536 columns wide, and 65536 lines
high.

XBIN allows for an alternate set of palette colors either in blink or
non-blink mode.

XBIN allows for different textmode fonts from 1 to 32 scanlines high,
consisting of either 256 or 512 different characters.

And finally, XBIN offers smaller files due to a simple yet very efficient
compression system.

## Goals

XBIN was designed with certain rules in mind. These were:

- The format may not have a group-specific name. It should be as
  anonymous as possible.

- The format must be simple to implement, yet offer as much functionality
  as possible.

- The format must be universally adoptable, a prerequisite for this is the
  complete availability of the formats specifications.

- Availability of direct plug-in code, tools to read/write/convert the
  format and the immediate support in practical applications.

The above simple four rules were similarly used when designing the
specifications of SAUCE. These basic principles helped get the acceptance
of SAUCE as a standard by the majority of art groups worldwide. The
premise of SAUCE's success was reason alone to re-use this set of rules
while designing XBIN.

More specifically to the practical use of XBIN, following constraints and
ideas needed to be addressed :

- Provide an unambiguous system for how the file should be displayed.

- Be as complete as possible to avoid having to make changes to the
  specifications. Since XBIN has a very specific use (textmode 'graphics')
  it should not be too difficult to provide for all/most of what textmode
  has to offer.
  In short XBIN should provide for any possible feature possible for
  textmode graphics, but no more.
  In addition, XBIN is designed for VGA. Several of the features XBIN
  offers can only be used on a VGA system.

  To sum things up, XBIN was required to handle :
  - Any reasonable sized image
  - Alternate color sets (palettes)
  - Alternate fonts of any size (due to limitations of the VGA hardware
    this means sizes of 1 up to 32 pixels), for practical reasons, only 8
    pixel wide fonts are supported, even though the VGA hardware has other
    capabilities.
  - Blink and non-blink mode
  - 256 and 512 characters

In addition to the set requirements, XBIN also offers a simple compression
scheme which does remarkably well seen it's simplicity.

## the Spec

Ok, now that we have you totally brainwashed, and drooling, it's time for dealing out the specs.

The default file extention of an XBIN file is '.XB', just as a BIN file by default has '.BIN' as extention. Even though long filenames are getting popular due to newer operating systems like Windows 95, Windows NT, OS/2, Unix, Linux... there was specifically chosen for .XB over .XBIN

An XBIN consists of 4 main parts, a header (required), a palette (optional), a font (optional), and the image data (optional).

| Part       | Usage    |
| ---------- | -------- |
| Header     | Required |
| Palette    | Optional |
| Font       | Optional |
| Image Data | Optional |

> **_NOTE_** An XBIN is not REQUIRED to have an image. You can use the standard XBIN format for storing pre-made fonts and pre-made palettes which you could load from a viewer/editor (as alternate font/palette)

### Header

The XBIN header consists of 11 bytes. The header describes the size of the image, how the screen should be set up, and how the rest of the XBIN should be processed.

#### Record layout :

| Name     | Size | Type    | Purpose                                                                                                                                                                          |
| -------- | ---- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID       | 4    | Char    | XBIN identification, these 4 bytes should contain the text "XBIN". Any file which does not have a matching ID should not be considered to be an XBIN file.                       |
| EofChar  | 1    | Char    | End of file character (Ctrl-Z, Ascii 26, 1A hex) When a user uses type to view the file, he'll see "XBIN" printed on screen.                                                     |
| Width    | 2    | Numeric | Width of the image in character columns.                                                                                                                                         |
| Height   | 2    | Numeric | Height of the image in character rows.                                                                                                                                           |
| Fontsize | 1    | Numeric | Number of pixel rows (scanlines) in the font, Default value for VGA is 16. Any value from 1 to 32 is technically possible on VGA. Any other values should be considered illegal. |
| Flags    | 1    | Bits    | A set of flags indicating special features in the XBIN file.                                                                                                                     |

A sample XBIN header in Pascal could be:

```
TYPE  XB_Header = RECORD
ID      : ARRAY[0..3] OF Char;
EofChar : Byte;
Width   : Word;
Height  : Word;
Fontsize: Byte;
Flags   : Byte;
END;
```

A sample XBIN header in C could be:

```
typedef struct XB_Header {
	 unsigned char  ID[4];
	 unsigned char  EofChar;
	 unsigned short Width;
	 unsigned short Height;
	 unsigned char  Fontsize;
	 unsigned char  Flags;
};
```

## Flags

The 'flags' field in the XBIN header tells us more on special features the XBIN has in use. The flags field consists out of 8 separate bits each with it's unique function. Bits which are 0, are considered OFF or disabled, Bits with 1 are considered ON or enabled.

| Bit                   | Name     | Purpose                                                                                                                                                                                                                                                           |
| --------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ . . . . . . . X ]` | Palette  | When 1, A palette is present in the XBIN. When 0, Default palette applies.                                                                                                                                                                                        |
| `[ . . . . . . X . ]` | Font     | When 1, A Font is present in the XBIN. When 0, Default font applies, since the VGA default fontsize is 16, This bit should be 1 for other sizes. In consequence, a font should then also be present.                                                              |
| `[ . . . . . X . . ]` | Compress | When 1, XBIN compression is used When 0, No compression is used, the image is stored in raw memory format.                                                                                                                                                        |
| `[ . . . . X . . . ]` | NonBlink | When 1, Image should be shown in non-blink mode. When 0, Image should be shown in blink mode.                                                                                                                                                                     |
| `[ . . . X . . . . ]` | 512Chars | When 1, The image is built up out of 512 characters in stead of the usual 256. This bit also requires the Font bit to be set since the VGA has no default font for 512 character mode. The font in consequence then has 512 characters in stead of the usual 256. |
| `[ X X X . . . . . ]` | Unused   | Unused, should be all zeroes.                                                                                                                                                                                                                                     |

### Palette

A palette is only present when the 'Palette' bit is set in the Flags field of the XBIN header. The palette is built up of 48 bytes, a red, green and blue value (in that order) for each of the 16 colors. Each palette value can range from 0 to 63.

## Font

A Font is only present when the 'Font' bit is set in the Flags field of the XBIN header.

For each character (256, or 512 when the '512Chars' bit is set in the Flags field) FontSize bytes are stored in sequence. The character set is defined from the top row of each character matrix to the bottom row.

In a 16 pixel high font, the first 16 bytes are the font-matrix for ascii value 0, the next 16 are for ascii 1 and so on. In total, a 16 pixel font would have a font of 4096 bytes (16\*256)

Technically, the biggest font possible would be 16Kb in size. (32 pixels high, 512 characters), and the smallest would be 256 bytes (1 pixel high, 256 characters).

## Image data

The image data is a raw image of video memory. Each character consists of 2 bytes, the first being the character, the second being the attribute (color).
The Image data would thus be equal to Width\*Height\*2. The biggest XBIN would be a whopping 8Gb (65535\*65535\*2) in size and the smallest would be
0 bytes (0\*0\*2).

Unless the 'Compress' bit is set in the Flags field, Image data is stored in the exact way you would need it in video memory.

When the 'Compress' bit is set, Image data is compressed with XBIN-Compression. This is a fairly simple compression system, which should pose no real difficulty to decompress. As compression goes however an XBIN compressor is a little harder to write `<g>`.

## XBIN Compression

The XBIN compression uses a slightly improved Run-Length Encoding scheme which will do very well on this type of data.

In stead of describing how a compressor would work, I'll explain how the compression works by giving some examples. In these examples, you'll see strings of characters more or less like this one :

`Aa,Ab,Ac,Ba,Bb,Bc,De,Zx,Yu`

This string represents a part of the uncompressed data. The capital lettres are character bytes, the lower case letters are attribute bytes.

OK, pay close attention, as things may get hairy now ;-)

When you examine an ANSi or a BIN file, you may or may not have noticed several characteristics which are typical for ANSi/BIN files. You see sequences of identical characters one after another, and you see sequences of identical colors one after another. You may even see the combination of both; identical characters in identical colors one after another.

XBIN-compression makes use of these characteristics by replacing sequences of identical characters/color with a counter and the actual data.

A sequence like :

`Aa,Aa,Aa,Aa,Aa,Aa,Aa,Aa,Aa,Bb,Bb,Bb,Bb`

could easily be replaced with

`[Repeat 9 times]Aa,[Repeat 4 times]Bb`

The `[Repeat x times]` tag is the repeat counter.

If you're a smart observer, you've probably already figured where I'm
driving at. It shouldn't be too hard to figure out that there's a need
for four different types of compression :

1. No compression (when two subsequent character/attribute pairs have no relation)
2. character compression (for a sequence of identical characters in different colors)
3. attribute compression (for a sequence of different characters with identical attributes)
4. character/attribute compression (for a sequence of identical character/attributes).

Hmm.. 4 types of compression.. That would nicely fit in 2 bits, leaving 6 bits in a byte unused. Now.. what if we were to use those 6 bits for the repeat counter...

This is exactly what XBIN compression does...

The XBIN compression consists out of a sequence of repeat counters followed by the appropriate number of data bytes.

Ok, before we go any further now, allow me to make an important note.

> XBIN compression works on a ROW by ROW basis. The compression does NOT carry through to the next line.

so if you would have for example two lines like this:

```
Ab,Aa,Aa,Aa
Aa,Aa,Aa,Ab
```

It should _**NOT**_ be encoded as:

```
Ab,[Repeat 6 Times]Aa,Ab
```

but _**SHOULD**_ be encoded as:

```
Ab,[Repeat 3 Times]Aa
[Repeat 3 Times]Aa,Ab
```

The are several reasons why it should work like this:

1. on-the-fly decoding is facilitated (more on this later)
2. You could run into a problem with odd XBIN widths since video memory memory always has an even width. You'd have to implement special code to skip over this one odd byte.
3. You at least have SOME way of detecting errors in the XBIN file. Whenever a line doesn't nicely work out to the required width there must be some error in the XBIN file (or a bug in your decoding routine ;-))

### XBIN Compression continued

The repeat counter is split up in two parts, the two most significant bits are the compression type, the six least significant bits are the actual repeat counter.

| Bits                | Purpose                                             |
| ------------------- | --------------------------------------------------- |
| [ X X . . . . . . ] | Compression type                                    |
|                     | 00 : No compression                                 |
|                     | 01 : Character compression                          |
|                     | 10 : Attribute compression                          |
|                     | 11 : Character/Attribute compression.               |
| [ . . X X X X X X ] | Repeat counter.                                     |
|                     | Since a repeat of 0 is downright useless, we'll     |
|                     | store the repeat counter as one less of it's actual |
|                     | number of repeats.                                  |
|                     | A value of 0 indicates a repeat value of 1.         |
|                     | A value of 1 indicates a repeat value of 2.         |
|                     | And so on, giving us a maximum                      |

In the examples, the Repeat counter byte will be used as `[Type,Count]` Where Type is 00, 01, 10 or 11, and Count is a number from 0 to 63.
For example, [01,10] would mean, Attribute compression with a repeat counter of 10 (11 effective repeats)

- **Compression type 00**: `No compression`
  - This type of compression is needed whenever two or more sequences of character/attribute pairs have nothing in common.
  - The repeat counter is followed by the appropriate number of character/attribute pairs.
  - **Data**: `AaBbCcDdEeFfGg`
  - **XBin Compressed :** `[00,6]AaBbCcDdEeFfGg`

> !NOTE: Remember value is ONE less than the actual number of repeats wanted.

In a worst-case situation where you would have to use No compression on the entire file, this would mean the 'compressed' data is bigger as the non-compressed data, in this situation, the best thing to do would be to store the image data uncompressed, and set the 'Compress' bit in the Flags field to 0.

- **Compression type 01**: `Character compression`
  - This type of compression is used whenever a sequence of identical characters is found, but where the attribute changes.
  - The repeat counter is followed by the character to use which is in turn followed by the appropriate number of attribute bytes.
  - **Data**: `AaAbAcAdAeAfAg`
  - **XBIN Compressed**: `[01,6]Aabcdefg`

- **Compression type 10**: `Attribute compression`
  - This type of compression is used whenever a sequence of identical attributes is found, but where the character changes.
  - The repeat counter is followed by the attribute to use which is in turn followed by the appropriate number of character bytes.
  - **Data**: `AaBaCaDaEaFaGa`
  - **XBIN Compressed**: `[10,6]aABCDEFG`

**! Note** this is the only time you'll see the attribute byte BEFORE the characters.

- **Compression type 11**: `Character/Attribute compression`
  - This type of compression is used whenever a sequence of identical character attribute pairs is found.
  - The repeat counter is followed by the character attribute pair.
  - **Data**: `AaAaAaAaAaAaAa`
  - **XBIN Compressed**: `[11,6]Aa`

# -THE-END-
