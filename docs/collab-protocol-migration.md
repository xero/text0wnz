# Collab Protocol Migration

> [!NOTE]
> teXt0wnz replaced its original collaboration protocol with the
> Moebius-native dialect. This note covers what changed, who is
> affected, how to migrate a server, the extension suite teXt0wnz
> clients negotiate on top of the dialect, and the Connect form.

> ### Table of Contents
>
> - [What changed](#what-changed)
> - [Who is affected](#who-is-affected)
> - [Migrating a server](#migrating-a-server)
> - [Compatibility notes for mixed sessions](#compatibility-notes-for-mixed-sessions)
> - [teXt0wnz extensions](#text0wnz-extensions)
>   - [Negotiation](#negotiation)
>   - [Action ids](#action-ids)
>   - [Sequence numbers and acks](#sequence-numbers-and-acks)
>   - [Batching](#batching)
>   - [Down-conversion](#down-conversion)
>   - [Sync and timelapse](#sync-and-timelapse)
>   - [Limits the server enforces](#limits-the-server-enforces)
>   - [Known deltas with upstream clients](#known-deltas-with-upstream-clients)
> - [Connecting to other servers](#connecting-to-other-servers)
>   - [Secure pages and plaintext servers](#secure-pages-and-plaintext-servers)
>   - [What vanilla servers do differently](#what-vanilla-servers-do-differently)

---

## What changed

The editor and its bundled server now speak the Moebius collaboration
protocol: JSON frames shaped `{type, data}` with the action ids
Moebius, moebiusXBIN, and icy_draw use. The original teXt0wnz protocol
(JSON arrays like `['draw', blocks]` plus one binary document frame)
is gone on both ends.

You gain cross-editor sessions. A teXt0wnz client can join Moebius,
moebiusXBIN, and icy_draw servers, and those clients can join a
teXt0wnz server. You also lose a known defect with the old wire
format: cells below row 409 on an 80-column canvas silently corrupted
in transit.

## Who is affected

**Nobody who uses the bundled server with matching versions.** The
editor and server in this repository always match each other.

**Operators running an older teXt0wnz server** behind a newer client
build (or the reverse): the two protocols do not interoperate. Update
both sides together.

## Migrating a server

- Session files migrate on their own. The new server reads the old
  `sessions/<name>.bin` BinaryText files on first load and saves in
  the native `.0wnz` format from then on.
- The `express`, `express-session`, and `express-ws` dependencies are
  gone; the server runs on Bun's built-in websockets. `bun install`
  prunes them.
- New flags: `--pass <password>` protects rooms (and unlike upstream
  Moebius, it applies to nickless spectators too), `--plain-port <port>`
  adds a plaintext listener for desktop clients, and rooms are
  path-based (`wss://host/roomname`; `/` and `/server` reach the
  default room, so existing Caddy and nginx proxy configs keep
  working).
- Spectators default to read-only drawing with chat allowed. Set
  per-room passwords with the `ROOM_PASSWORDS` environment variable
  (JSON, `{"room":"pw"}`).
- The server saves on SIGTERM now as well as SIGINT, so `docker stop`
  no longer loses unsaved work.

## Compatibility notes for mixed sessions

When teXt0wnz joins a vanilla Moebius or icy_draw server, drawing
degrades to the classic 16-color CP437 space, custom palettes arrive
only via the moebiusXBIN `CHANGE_PALETTE` relay (icy_draw clients drop
it), and late joiners can see stale palettes exactly as they do
between Moebius clients. These are upstream semantics; teXt0wnz
reproduces them deliberately.

---

## teXt0wnz extensions

Between teXt0wnz clients the server adds an extension suite on top of
the Moebius dialect: full-fidelity cells (any Unicode glyph, 24-bit or
256-entry palette color), a sequence number that detects a missed
frame, wholesale resync, a full-palette swap, and the timelapse feed.
The codec is `src/js/core/protocol/extensions.ts`, shared by the
browser worker, the Bun server, and the tests. Nothing in it reaches a
vanilla client.

### Negotiation

The client adds a `caps` array to its `CONNECTED` frame:
`{nick, group, pass, caps: ["t0wnz-ext-1"]}`. The whole v1 suite
negotiates as that one string (`EXT_SUITE_CAP`). A teXt0wnz server that
sees a `caps` array appends its own, `caps: ["t0wnz-ext-1"]`, to the
usual `CONNECTED` reply and follows the reply with an `EXT_SYNC`
snapshot. The vanilla `doc` in the reply is the quantized view; the
snapshot is the real one, and the client adopts it wholesale.
Spectators that send `caps` get the same treatment.

A reply without `caps` means a vanilla server. The upstream Moebius and
moebiusXBIN servers read only `nick`, `group`, and `pass` from
`CONNECTED` and never echo the field, so the teXt0wnz client falls back
to the vanilla dialect: per-cell `DRAW` frames with the extension
payload stripped, no `seq`, and no resync. A client that sends no
`caps` gets exactly the vanilla reply; the server appends nothing.

### Action ids

Extension ids start at 23 (`MOEBIUS_EXTENSION_BASE`), above the frozen
Moebius enum that ends at `CHANGE_PALETTE` (22).

| Id  | Action           | Direction        | Payload                                                                                                                         |
| --- | ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 23  | `EXT_DRAW`       | both             | `{x, y, u, a, fg, bg, id}`, one cell                                                                                            |
| 24  | `EXT_DRAW_BATCH` | both             | `{cells: [{x, y, u, a, fg, bg}, ...], id}`, 1 to 4096 cells                                                                     |
| 25  | `EXT_SYNC`       | both             | request `{}`; reply `{seq, columns, rows, cells, palette, ice_colors, use_9px_font, font_name, title, author, group, comments}` |
| 26  | `EXT_PALETTE`    | both             | `{palette: [words...], id}`, 1 to 256 entries                                                                                   |
| 27  | `EXT_ACK`        | server to sender | `{seq}` or `{seq, refused: true}`                                                                                               |
| 28  | `EXT_TIMELAPSE`  | both             | request `{}`; reply `{columns, rows, cells, palette, ops}`                                                                      |

Client-to-server frames carry `data.id` like every vanilla frame; the
worker stamps it. The server rebuilds every broadcast with the id it
assigned, so ids cannot be spoofed.

**Cells.** `u` is a Unicode codepoint (0 to 0x10FFFF, surrogate halves
rejected); CP437 glyphs travel as their codepoints. `a` is the glyph
attribute byte: bit 0 blink, bit 1 reserved. `fg` and `bg` are v3 color
words: bit 31 set means a palette index in the low 8 bits, bit 31 clear
means `0x00RRGGBB`. The server canonicalizes every word at intake,
keeping the 8-bit index or the 24 color bits and nothing else.

**Runs.** `EXT_SYNC` and `EXT_TIMELAPSE` carry cells as runs
`[u, a, fg, bg, count]` with `count >= 1`, not the vanilla
`[value, repeat]` shape whose length is `repeat + 1`. Palettes are
arrays of `0x00RRGGBB` words, up to 256; `null` means the room has no
extended palette.

### Sequence numbers and acks

The room keeps one counter, `seq`, and bumps it for every accepted
mutation: `DRAW`, `SAUCE`, `ICE_COLORS`, `USE_9PX_FONT`, `CHANGE_FONT`,
`SET_CANVAS_SIZE`, `EXT_DRAW`, `EXT_DRAW_BATCH`, and `EXT_PALETTE`.
Caps-aware members receive it as an extra `seq` field on those
broadcasts; vanilla members never see the field. The server excludes
the sender from its own broadcasts, so the sender gets `EXT_ACK {seq}`
instead, and its stream stays contiguous.

A gap in the stream means a missed frame; the client applies the frame
it has and requests `EXT_SYNC`. A `seq` at or below the last one seen
marks a stale frame, which is dropped. Only those server-stamped
mutation types consult the counter; a `seq` smuggled into a
blind-relayed frame such as `CURSOR` is ignored, and chat is rebuilt
field by field so it cannot carry one.

When the server drops a mutation from a caps-aware client (a cell
outside the canvas, a bad color word, a batch that is empty or too
long, a palette outside 1 to 256 entries, a resize past the walls) it
answers `EXT_ACK {seq, refused: true}` with the current counter. The
client books the operation off and resyncs, since it already applied
the change locally. Vanilla clients get no ack and no refusal; their
dialect has neither.

### Batching

The editor sends one `EXT_DRAW_BATCH` per flush and splits anything
longer than `EXT_BATCH_LIMIT` (4096 cells) into several frames. A batch
is one operation and one `seq`. Cells that fail validation are skipped
and the rest apply; a batch with nothing left is refused. Vanilla
members receive the batch as one `DRAW` frame per cell.

### Down-conversion

Every extension mutation fans out twice: the native frame with `seq`
to caps-aware members, and the nearest vanilla frame to everyone else,
spectators included. The glyph reverse-maps to CP437 or becomes `?`
(63); the foreground quantizes to the closest of the 16 palette
entries, the background to 8, or 16 with iCE colors on; blink folds
into the bright background nibble when iCE colors are off. The server
keeps the extension payload on a cell only where this projection loses
information, and recomputes the stored projections when the palette or
the iCE flag changes, so late vanilla joiners and the interchange save
never see a stale fold.

Unknown ids at or above 23 relay only between caps-aware editors: a
spectator neither sends nor receives one, a vanilla member never sees
one, and the server neither persists nor numbers them. A vanilla client
therefore never meets a shape it cannot parse, and a teXt0wnz client on
a vanilla server never sends one.

### Sync and timelapse

`EXT_SYNC {}` asks for the full-fidelity snapshot; the reply replaces
the client's document wholesale. The server answers at most once per
second per user (the snapshot that follows `CONNECTED` counts) and
drops requests inside that window without a reply, so the client asks
again after 2.5 seconds until a snapshot lands.

`EXT_TIMELAPSE {}` asks for the room's history: a baseline snapshot
plus the operation log, each entry `{t, type, data, seq}`. The log
holds at most 10,000 operations or 8 MB per room; older operations fold
into the baseline, so baseline plus log always replays to the live
canvas. The request shares the one-second cooldown with `EXT_SYNC`, and
the client gives up after 10 seconds of silence. The editor replays the
payload into an exportable animation
(`src/js/core/protocol/timelapse.ts`).

`EXT_PALETTE` swaps the whole extended palette (editors only, 1 to 256
words). The first 16 entries also become the vanilla join palette, as
8-bit `{r, g, b}` objects, so vanilla clients joining later see them;
vanilla members already in the room keep their palette, which is
upstream's own `CHANGE_PALETTE` behavior.

### Limits the server enforces

| Limit                          | Value                                                                       |
| ------------------------------ | --------------------------------------------------------------------------- |
| Cells per `EXT_DRAW_BATCH`     | 4096 (`EXT_BATCH_LIMIT`)                                                    |
| Palette entries                | 1 to 256 words, each masked to `0x00FFFFFF`                                 |
| `EXT_SYNC` and `EXT_TIMELAPSE` | one reply per second per user; requests inside the window get no answer     |
| Operation log                  | 10,000 operations or 8 MB per room                                          |
| Codepoints                     | 0 to 0x10FFFF, no surrogate halves                                          |
| Sync document                  | the shared cell ceiling (`MAX_DOC_CELLS`) applies before anything allocates |

### Known deltas with upstream clients

These are vanilla dialect facts the codec handles. They matter when a
teXt0wnz client joins a Moebius or moebiusXBIN server, or when those
clients join ours.

**Palette depth.** Vanilla Moebius sends join palettes as `{r, g, b}`
objects with 6-bit components; moebiusXBIN sends the same shape with
8-bit components. The receiver auto-detects as icy_draw does: any
component above 63 means the whole palette is 8-bit, and 6-bit values
expand by replicating the top two bits (63 becomes 255). Our own
server's palettes are always 8-bit and read as such.

**Font bytes.** moebiusXBIN serializes an embedded font as Node Buffer
JSON, `{type: "Buffer", data: [...]}`. teXt0wnz revives that shape, a
plain array, and a `Uint8Array` alike; anything else reads as no font.

**Colors above 15.** Vanilla Moebius uses palette indices 0 to 15. The
server accepts `fg` and `bg` from 0 to 255 on a `DRAW` and stores them,
and a join document reads them as palette-index words the same way. The
vanilla projection the server writes on save, and hands to a vanilla
joiner, folds everything back to 16 colors, and the teXt0wnz live view
masks a vanilla `DRAW` to the low four bits as well.

**Codepoints on the vanilla wire.** icy_draw's `block.code` is a u32
Unicode codepoint where Moebius uses bytes 0 to 255. Codes above 255
intern through the glyph table on join, resync, and live `DRAW` alike,
so the three views agree.

---

## Connecting to other servers

While you work locally the sauce panel shows a collab button that reads
`local`. Click it to open the Connect form and type a server the way
Moebius's own dialog reads one:

| You type                       | The editor dials                                              |
| ------------------------------ | ------------------------------------------------------------- |
| `jam.example`                  | `ws://jam.example:8000/` (the Moebius default port and joint) |
| `jam.example:1337/lounge`      | `ws://jam.example:1337/lounge`                                |
| `text.0w.nz:443/server`        | `wss://text.0w.nz/server` (port 443 means wss)                |
| `text.0w.nz:443/server/lounge` | the named room `lounge` on that server, through its proxy     |
| `wss://host/room`              | exactly that                                                  |

The form remembers the last eight servers you joined, your handle, and
your group. It never stores passwords. The `?server=` query parameter
still works for scripted launches and the e2e suite, and the form
prefills from it. The installed app launches with no query string, so
the form is its way in.

The silent probe that produces the launch invitation dials direct
only. A `?server=` link naming a plaintext server on an https page gets
no probe and no invitation, because a probe runs before you consent to
the host dialing out on your behalf; the Connect form is the one path
through the bridge.

### Secure pages and plaintext servers

Every Moebius and moebiusXBIN server speaks plaintext `ws://`, and a
page served over https may not open one. The browser blocks it as mixed
content, and no header can allow it. You have two ways through:

- **Serve the editor over http.** On a LAN, or from `bun www` on your
  own machine, the page dials the server directly.
- **Let the host bridge.** From an https page the editor routes a
  plaintext target through the page's own host at `/bridge`, a byte pipe
  the operator enables with `BRIDGE` (`port`, `allow`, or `local`;
  default off) and whose
  reverse proxy forwards `/bridge` to the server (the Docker image and
  the examples in
  [webserver-configuration.md](./webserver-configuration.md) do). See
  [environment-variables.md](./environment-variables.md#bridge). When
  the host keeps it off, the dial fails and the form says the site
  may not allow it.

### What vanilla servers do differently

Vanilla Moebius checks its password only when a nick is given; nickless
connections bypass it and may draw. It keys joints by URL path but
starts one per process at `--path`, and it has no keepalive, so a quiet
spectator is never reaped. Our server gates everyone, reaps dead
sockets, and hosts many rooms. The interop suite in `tests/interop/`
pins these differences against vendored copies of both upstream servers.
