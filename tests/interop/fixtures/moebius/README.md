# Moebius server fixture

> [!NOTE]
> A vendored copy of the vanilla Moebius collaboration server, the
> one the scene runs, pinned for protocol interop testing. Never run
> it against anything shared; the interop suite spawns it locally per
> run.

- `server.js` is VERBATIM from
  [blocktronics/moebius](https://github.com/blocktronics/moebius)
  v1.0.29, commit `1f624d6`, `app/server.js`. Upstream license:
  Apache-2.0.
- `libtextmode/libtextmode.js` is a minimal shim: `compress`,
  `uncompress`, and `resize_canvas` transcribed verbatim from
  upstream; `read_file` returns a fresh 80x25 document carrying
  upstream's `ega` palette as sixteen `{r, g, b}` objects in 6-bit
  components, exactly the join doc shape the real server sends;
  `write_file` is a no-op.
- `hourly_saver.js` is a no-op stub (the fixture never persists).
- `start.js` boots the joint at `/fixture` on the given port, with a
  require hook that stands in for `discord.js` (upstream requires it
  at load whether or not a webhook is configured).

Runtime: node and the `ws` package from this repo's devDependencies.
