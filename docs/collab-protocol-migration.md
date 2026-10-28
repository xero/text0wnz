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

### Secure pages and plaintext servers

Every Moebius and moebiusXBIN server speaks plaintext `ws://`, and a
page served over https may not open one. The browser blocks it as mixed
content, and no header can allow it. You have two ways through:

- **Serve the editor over http.** On a LAN, or from `bun www` on your
  own machine, the page dials the server directly.
- **Let the host bridge.** From an https page the editor routes a
  plaintext target through the page's own host at `/bridge`, a byte pipe
  the operator enables with `BRIDGE=port` (default off) and whose
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
