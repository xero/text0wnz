# Collaboration Server

> [!NOTE]
> The teXt0wnz collaboration server is a Bun program that hosts
> real-time rooms over the Moebius protocol, so teXt0wnz, Moebius,
> moebiusXBIN, and icy_draw clients share one canvas. This page covers
> running it, its options, rooms and passwords, persistence, limits,
> desktop clients, the bridge, logging, process management, and
> troubleshooting. The protocol itself, the teXt0wnz extension suite
> included, is in
> [collab-protocol-migration.md](./collab-protocol-migration.md).

> ### Table of Contents
>
> - [What It Is](#what-it-is)
> - [Quick Start](#quick-start)
> - [Command-Line Options](#command-line-options)
> - [Environment Variables](#environment-variables)
> - [Rooms](#rooms)
> - [Passwords and Spectators](#passwords-and-spectators)
> - [Persistence](#persistence)
> - [Limits and Hardening](#limits-and-hardening)
> - [Desktop Clients](#desktop-clients)
> - [The Bridge](#the-bridge)
> - [Logging and Privacy](#logging-and-privacy)
> - [Process Management](#process-management)
> - [SSL](#ssl)
> - [Troubleshooting](#troubleshooting)
> - [See Also](#see-also)

---

## What It Is

The server speaks the Moebius collaboration protocol on the wire: JSON
frames shaped `{type, data}` with the action ids Moebius, moebiusXBIN,
and icy_draw use. A desktop Moebius client joins a teXt0wnz room the way
it joins any Moebius server, and a teXt0wnz client joins a vanilla
Moebius server the same way. Between teXt0wnz clients the server adds an
extension suite for full-fidelity cells (Unicode glyphs, extended
colors) and down-converts every such change to the nearest classic frame
for everyone else, so mixed rooms stay coherent.

One process hosts many rooms, saves them to disk, and can serve the
built editor itself. It runs under Bun (`bun server`), as a compiled
single binary (`bun binaries`), or in Docker (see
[docker.md](./docker.md)). It does not run under Node: the listener is
`Bun.serve`.

---

## Quick Start

```sh
bun i
bun server                                 # port 1337, default room "joint"
bun server 8080 --pass hunter2 --plain-port 8000
```

Serve the built editor next to it (the Docker images and the proxy
examples in
[webserver-configuration.md](./webserver-configuration.md) do), or run
`bun www` on port 8060 for a local build and connect to `127.0.0.1:1337`
from the editor's Connect form. The editor's Connect form is described
in the [manual](./manual.md#collaboration-features).

---

## Command-Line Options

```sh
bun server [port] [options]
# or the compiled binary
./t0wnz [port] [options]
```

| Option                     | Description                                                                                                     | Default            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------ |
| `[port]`                   | Port to listen on                                                                                               | `1337`             |
| `--ssl`                    | Serve TLS from `--ssl-dir` (see [SSL](#ssl))                                                                    | off                |
| `--ssl-dir <path>`         | Certificate directory                                                                                           | `/etc/ssl/private` |
| `--save-interval <min>`    | Autosave interval in minutes (dirty rooms only)                                                                 | `30`               |
| `--session-name <name>`    | The default room's name and session file prefix; must match the room grammar                                    | `joint`            |
| `--plain-port <port>`      | A second, plaintext listener for desktop clients (see [Desktop Clients](#desktop-clients))                      | off                |
| `--pass <password>`        | Password for every room without its own entry; gates spectators too                                             | none               |
| `--allowed-origins <list>` | Comma-separated Origin allowlist for websocket upgrades; unset keeps upgrades open, desktop clients always pass | open               |
| `--static <dir>`           | Serve the built PWA from `<dir>` on the same listener (single-binary and distroless deployments)                | off                |
| `--debug`                  | Verbose protocol logging; also prints the parsed configuration at boot, passwords included                      | off                |
| `--help`                   | Print the options and exit                                                                                      |                    |

Flags win over environment variables where both exist (`--pass` over
`ROOM_PASS`, `--allowed-origins` over `ALLOWED_ORIGINS`).

Two flags fail quietly. `--pass` with no value logs
`[Server] --pass given without a value; running UNPROTECTED` and boots
open, so look for that line before trusting a passworded start.
`--plain-port` set to the main port opens no second listener and
prints nothing.

**Examples:**

```sh
bun server 8080                                      # another port
bun server 1337 --pass hunter2 --plain-port 8000     # passworded, with a plaintext door for Moebius
bun server 443 --ssl --ssl-dir /etc/letsencrypt      # TLS in-process
bun server 1337 --static dist --debug                # serve the editor too, chatty
```

---

## Environment Variables

The full reference is
[environment-variables.md](./environment-variables.md). The ones the
server reads:

- `ROOM_PASS` and `ROOM_PASSWORDS` for passwords (the second is JSON, `{"room":"pw"}`).
- `ALLOWED_ORIGINS` for the upgrade allowlist.
- `ROOM_MAX_GUESSES` for the wrong passwords a room takes a minute from every address together (default 20).
- `TRUST_PROXY` for proxies beyond loopback whose `X-Real-IP` names the client.
- `ROOM_MAX_COLUMNS` and `ROOM_MAX_ROWS` for the canvas resize walls (default 1000 by 10000; restored documents keep their size). Lowering them binds every client; raising them reaches only desktop clients, since the teXt0wnz editor refuses a resize past 1000 by 10000 on its own side.
- `STATIC_DIR` for the built PWA, the same as `--static`.
- `BRIDGE`, `BRIDGE_TARGET`, `BRIDGE_PORT`, `BRIDGE_ALLOW`, and `BRIDGE_MAX` for the bridge; a bad combination stops the boot with a sentence.
- `PORT`, read only by the `healthcheck` probe mode (`main.js healthcheck [port]`), which the distroless image uses as its Docker `HEALTHCHECK`.

---

## Rooms

Rooms are keyed by the websocket path:

| Path                           | Room                                |
| ------------------------------ | ----------------------------------- |
| `/` and `/server`              | the default room (the session name) |
| `/server/<room>` and `/<room>` | the named room                      |

Room names match `[a-z0-9_-]{1,32}`, case-insensitively, and are
lowercased; the word `server` itself is never a room name. A path
outside the grammar answers 404. Behind a reverse proxy the
`/server/<room>` spelling reaches every room through the one rule
operators already have for `/server*`.

A room springs up on its first join, restores its saved document from
disk before anyone is let in, and goes away when its last socket closes,
after saving if it has changed. A room that is still blank (no art, no
chat, no SAUCE text, no palette or font setup) leaves no files behind,
so client-chosen names cannot grow the disk. A process holds at most 64
rooms, and each room at most 64 sockets, counting ones that have not
finished the handshake.

New rooms start at 80 by 25 with CP437 8x16. Resizes are bounded by the
walls above.

---

## Passwords and Spectators

`--pass` (or `ROOM_PASS`) protects every room; `ROOM_PASSWORDS` sets a
password per room, and a room with its own entry ignores the global
one. The password is checked on the `CONNECTED` frame, and the room is
not even created until a caller passes, so junk connections cannot
exhaust the room cap on a protected server.

`ROOM_PASSWORDS` keys are lowercased to match normalized room names.
A value that is not valid JSON logs
`[Config] ROOM_PASSWORDS is not valid JSON; ignored` and the server
boots with no per-room entries, so a typo there leaves every room on
the global password, or open.

A connection with no nick is a **spectator**: it receives the document,
every change to it (draws, SAUCE, font, size, iCE, and palette), and
chat, but not the presence traffic editors exchange (cursors,
selections, status, joins, and leaves). It may chat and hears chat, and
may not draw. Spectators speak as the fixed nick `spectator`; only
editors carry a nick in `CHAT`, and renames ride `CHAT` as upstream. The
password applies to spectators too. This is a deliberate difference
from upstream Moebius, where a nickless connection bypasses the password
and may draw.

Wrong passwords back off per client: two tries stay free (humans typo),
then the refusal window doubles up to 30 seconds for that client's
address, so one guesser cannot hold a room shut against everyone else.
Each room also takes at most 20 wrong guesses a minute from all
addresses together (`ROOM_MAX_GUESSES`), so many addresses still guess
slowly. A blank password never counts; it is the shape of the editor's
silent server probe, and counting it would lock a public room against
its own password after a few page views.

The gate never holds an address. It keys on a hash under a salt the
process mints at start, with IPv6 cut to its /64 (one subscriber holds
the whole block), and none of it is logged or written down. Behind a
reverse proxy the address comes from `X-Real-IP` or the last
`X-Forwarded-For` hop, believed only from loopback and from the exact
addresses in `TRUST_PROXY`. The proxy must write the header itself:
when both headers arrive and disagree, one was forged, and the request
counts as the proxy's own. The Docker image's Caddy and the examples in
[webserver-configuration.md](./webserver-configuration.md) set it. Before a room exists the same backoff lives in a gate
bounded at 4096 room names; when it is full, fresh names are refused
with `auth cooldown` until stale entries age out, so hostile name churn
cannot grow it.

Handles are kept to 100 characters, chat lines to 140, and a room holds
the last 128 chat lines for late joiners. SAUCE fields are clamped at
intake: title 35, author 20, group 20, and comments 4096 characters;
font names 100.

---

## Persistence

Session files live in `sessions/` under the server's working directory,
so run it from the same place every time:

| File                                   | What it holds                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `sessions/<room>.0wnz`                 | The document in the native envelope, full fidelity                                                          |
| `sessions/<room>.state.json`           | A sidecar with the join document, chat history, and extended palette                                        |
| `sessions/backups/<room>-<stamp>.0wnz` | A timestamped copy taken on each save whose content changed (sha1-deduplicated)                             |
| `sessions/<room>.bin`                  | A legacy v2 session file, read while no `.0wnz` or sidecar exists; removed only when the room empties blank |

To restore a backup, stop the server, copy the file from
`sessions/backups/` over `sessions/<room>.0wnz`, and delete
`sessions/<room>.state.json`. The sidecar is preferred on load when it
exists, so a restored envelope alone has no effect.

Saves happen on the autosave interval for rooms that changed, when a
room empties, and on `SIGINT` and `SIGTERM`, so `docker stop` loses
nothing. Each write lands in a temporary file, is fsynced, and is
renamed into place, so a crash mid-write cannot tear a session; crash
leftovers are swept at boot. Session files from older servers that used
mixed-case names are renamed to lowercase at boot so the normalized
rooms can restore them.

On restore the server reads the sidecar first, then the `.0wnz`
envelope, then the legacy `.bin`; a corrupt sidecar falls through to
the envelope. That order decides how a rollback works. Copying a
backup over `<room>.0wnz` changes nothing while the sidecar exists. To
roll a room back, stop the server, copy the backup over
`sessions/<room>.0wnz`, delete `sessions/<room>.state.json`, and start
again. The envelope carries the art, the palette, and the title,
author, and group; chat history, SAUCE comments, the font choice, and
embedded font bytes live only in the sidecar and start fresh after a
rollback. The next save writes a new sidecar.

Backup deduplication is a hash kept in memory, so the first save with
changed content after a restart writes a backup even when it matches
the newest one on disk.

---

## Limits and Hardening

| Limit             | Value                                                                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frame size        | 32 MB (vanilla `PASTE_AS_SELECTION` frames run tens of MB)                                                                                                                               |
| Idle sockets      | Reaped after 120 seconds; a 30 second heartbeat ping keeps quiet spectators alive                                                                                                        |
| Sockets per room  | 64, handshake pending or not                                                                                                                                                             |
| Rooms per process | 64                                                                                                                                                                                       |
| Bridged pipes     | `BRIDGE_MAX` at once (default 16); a pipe closes after 30 minutes without a frame either way, 15 seconds without delivery progress, or 64 MB unconfirmed (see [The Bridge](#the-bridge)) |
| Bridge dial       | 3 second DNS lookup, 10 second connect, and 256 KB of browser frames queued before the upstream answers                                                                                  |
| Operation log     | 10,000 operations or 8 MB per room, the timelapse substrate; older operations fold into a baseline                                                                                       |
| Chat history      | 128 lines                                                                                                                                                                                |
| SAUCE fields      | Title 35, author 20, group 20, comments 4096, font name 100 characters                                                                                                                   |
| Auth gate         | 4096 room names with a pending backoff, fresh names refused while it is full; per room, 20 wrong guesses a minute across all addresses (`ROOM_MAX_GUESSES`)                              |

Malformed frames are dropped with a log line, never a crash, which the
upstream servers do not survive. Frames before `CONNECTED` are dropped.
Unknown action ids above the extension base relay only between
caps-aware registered peers, so a classic client never sees a shape it
cannot parse. Every mutation lands in the room with the server-known
user id, so ids cannot be spoofed. `ALLOWED_ORIGINS` gates browser
upgrades, the bridge included; desktop clients send no Origin and always
pass.

`GET /healthz` answers `{"ok":true,"rooms":N,"uptime":S}` for liveness
probes. Without `--static`, a plain HTTP request to a room path answers
426, which usually means a proxy forwarded the request without its
upgrade headers. With `--static` the file server answers instead (a 404
for a room path), since plain requests are the PWA's.

---

## Desktop Clients

Moebius, moebiusXBIN, and icy_draw dial plaintext `ws://` only. If the
main listener runs TLS or sits behind an https proxy, give them a
plaintext door with `--plain-port 8000` (8000 is their default). In
their connect dialog they type `host:8000` for the default room or
`host:8000/room` for a named one, and their password field maps to the
room password.

What they see: the classic 16-color CP437 projection of the room, with
extended cells from teXt0wnz clients down-converted to the nearest
classic cell, and the same stale-palette behavior between late joiners
that upstream servers show. Upstream servers read only `nick`, `group`,
and `pass` from `CONNECTED` and answer without a `caps` field, so a
teXt0wnz client joining them falls back to the vanilla dialect, and the
field itself is harmless.

A known upstream quirk: moebiusXBIN's own client fails to load a join
document that carries an embedded font as Buffer JSON (its server sends
one when its session file is an `.xb` with a font). teXt0wnz reads that
shape; the fork does not.

**Close codes.** The server closes a socket with `1013 room full` when
a room holds 64 sockets or the process holds 64 rooms, `1008 refused`
after a `REFUSED` frame (wrong password, cooldown, or a disabled
spectator), and `1001 heartbeat lost` when a client answers no ping for
a whole 30 second sweep.

---

## The Bridge

A page served over https cannot open a plaintext websocket, so an
editor on text.0w.nz cannot reach a Moebius server directly. The bridge
is a byte pipe on `/bridge` that dials the plaintext server from the
host and relays frames both ways. It is off by default and enabled with
`BRIDGE=port` (visitors choose the host, the port stays pinned, private
addresses are refused), `BRIDGE=local` (one fixed target), or
`BRIDGE=allow` (an explicit list).

Enabling it means relaying from your address to any public websocket
server on that port for anyone who reaches `/bridge`, so read the
[bridge section of the environment variables guide](./environment-variables.md#bridge)
and the
[security policy](./security.md#the-collaboration-bridge) first. The
proxy must forward `/bridge*` to the server; the Docker images and the
proxy examples do.

---

## Logging and Privacy

By default the server logs no addresses. `--debug` prints protocol
chatter (joins, refusals, resizes, chat) by nick and room, still without
addresses. It also prints the whole parsed configuration at boot,
`pass` and every `ROOM_PASSWORDS` entry included, so keep `--debug` out
of any service whose journal you keep, or rotate the passwords after.

With the bridge enabled, the server prints one line per bridged
connection opened, closed, or refused, whether or not `--debug` is on:
the time, the address the connection came from (and the address a
reverse proxy reports for it), the server asked for, and for refusals
the reason. It is the only place the server records an address, and the
[privacy policy](./privacy.md) says so. Lines go to standard output;
retention is yours.

Lines worth grepping for:

| Line                                                                   | Meaning                                                                                  |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `teXt0wnz collab server on :1337 + plaintext :8000`                    | Boot, naming the plaintext door when there is one                                        |
| `restored session 'joint'`                                             | A room loaded its saved document                                                         |
| `SIGTERM: saving sessions`                                             | The shutdown save started (`SIGINT` likewise)                                            |
| `[Server] --ssl set but certificates missing; plain http`              | TLS fell back to plain http                                                              |
| `[Server] <file> shadowed by <lower>; left in place`                   | A mixed-case session file kept its name because its lowercase twin exists                |
| `[Server] <ISO time> bridge open <ip> -> ws://host:port/room`          | Audit line; `closed` likewise, and `(x-real-ip <ip>)` follows the address behind a proxy |
| `[Server] <ISO time> bridge refused <ip> asking host:port/room: <why>` | Audit line for a vetoed target                                                           |
| `[Server] <ISO time> bridge busy, refused <ip> asking host:port/room`  | Audit line for the `BRIDGE_MAX` cap                                                      |

The boot, restore, and shutdown lines print inside a box frame
(`╓─────`).

---

## Process Management

### systemd

`/etc/systemd/system/text0wnz.service`:

```ini
[Unit]
Description=teXt0wnz collaboration server
After=network.target

[Service]
ExecStart=/usr/bin/env bun /path/to/text0wnz/src/js/server/main.js 1337
Restart=always
User=textart
WorkingDirectory=/path/to/text0wnz
Environment=ROOM_PASS=change-me
Environment=ALLOWED_ORIGINS=https://your.domain
StandardOutput=journal
StandardError=journal
SyslogIdentifier=text0wnz

[Install]
WantedBy=multi-user.target
```

`WorkingDirectory` decides where `sessions/` lives. A compiled binary
replaces the `ExecStart` line (`/path/to/t0wnz 1337`). Leave `--debug`
off here, since the journal would keep the configuration dump,
passwords included. Then:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now text0wnz.service
sudo journalctl -u text0wnz.service -f
```

### forever

```sh
bun i -g forever
forever start -c bun src/js/server/main.js 1337
forever list
forever stop src/js/server/main.js
```

Simpler, and without the system integration. `-c bun` matters, because
forever runs scripts under `node` by default, and the server does not
start there.

---

## SSL

Two ways to get `wss://`:

- **Terminate TLS at the proxy** (recommended). Caddy or nginx holds the
  certificate and forwards `/server*` and `/bridge*` to the plain
  listener; see
  [webserver-configuration.md](./webserver-configuration.md).
- **In process.** `--ssl --ssl-dir <dir>` expects
  `letsencrypt-domain.pem` and `letsencrypt-domain.key` in that
  directory. Missing files log a warning and fall back to plain http.

```sh
sudo certbot certonly --standalone -d text.0w.nz
sudo cp /etc/letsencrypt/live/text.0w.nz/fullchain.pem /etc/ssl/private/letsencrypt-domain.pem
sudo cp /etc/letsencrypt/live/text.0w.nz/privkey.pem /etc/ssl/private/letsencrypt-domain.key
sudo chmod 644 /etc/ssl/private/letsencrypt-domain.pem
sudo chmod 600 /etc/ssl/private/letsencrypt-domain.key
bun server 443 --ssl --ssl-dir /etc/ssl/private
```

Renewal needs a restart to pick up the new files (`certbot renew` from
cron, then `systemctl restart text0wnz.service`). Either way, desktop
clients still need a plaintext door: `--plain-port`.

---

## Troubleshooting

**Port already in use.** `lsof -i :1337`, then stop the other process or
pick another port.

**Permission denied on ports under 1024.** Run behind a proxy on a high
port, or grant the binary `CAP_NET_BIND_SERVICE`.

**The editor never offers to join.** The silent probe dials the page's
own origin at `/server`; the proxy must forward `/server*` with its
upgrade headers (the nginx example strips the prefix, the Caddy example
keeps it, and the server accepts both). `--debug` shows every refusal.

**404 "no such room".** The path is outside the room grammar: letters,
digits, `_`, `-`, up to 32 characters, and never the word `server`.

**426 on a room path.** Plain HTTP reached the websocket listener; a
proxy forwarded without `Upgrade` and `Connection`. In `--static` mode
the same request gets the file server's 404 instead.

**Refused with the right password.** Check `ROOM_PASSWORDS` for a
per-room entry that overrides `--pass`, and remember the backoff after
repeated wrong tries from your address. Behind a proxy that reaches the
server from another address, list that exact address in `TRUST_PROXY`,
or every visitor shares it and one guesser's backoff refuses them all.
The Docker image behind another proxy needs a mounted Caddyfile that
trusts the outer proxy (see [docker.md](./docker.md)).

**Sessions do not survive a restart.** The server saves under its
working directory; start it from the same place, and check that
`sessions/` is writable (`--debug` logs every save).

**A restored backup changed nothing.** The sidecar wins over the
envelope, so copying a backup over `<room>.0wnz` alone is not a
rollback; delete `<room>.state.json` too, with the server stopped. See
[Persistence](#persistence).

**A desktop client drops with 1013, 1008, or 1001.** Room or process
full, refused, or heartbeat lost; see
[Desktop Clients](#desktop-clients).

**"bridge refused" or no bridged connection.** The bridge is off unless
`BRIDGE` says otherwise; the proxy must forward `/bridge*`; `port` mode
refuses private and loopback targets by design; the audit line in the
log names the reason.

---

## See Also

- [Collab Protocol Migration](./collab-protocol-migration.md), the protocol, the Connect form, and the bridge from the client's side
- [Environment Variables](./environment-variables.md), every knob
- [Webserver Configuration](./webserver-configuration.md), nginx, Caddy, and Apache examples
- [Docker](./docker.md), the two images
- [Security Policy](./security.md) and [Privacy Policy](./privacy.md)
- [Manual](./manual.md#collaboration-features), the collaboration features from the artist's side
