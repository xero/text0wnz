# Collab Protocol Migration

> [!NOTE]
> teXt0wnz replaced its original collaboration protocol with the
> Moebius-native dialect. This note covers what changed, who is
> affected, and how to migrate a server.

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
  Moebius, it applies to nickless spectators too), `--plain-port
<port>` adds a plaintext listener for desktop clients, and rooms are
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
