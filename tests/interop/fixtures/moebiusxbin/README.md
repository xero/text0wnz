# moebiusXBIN server fixture

> [!NOTE]
> A vendored copy of the moebiusXBIN collaboration server, pinned for
> protocol interop testing. Never run it against anything shared; the
> interop suite spawns it locally per run.

- `server.js` is VERBATIM from
  [hlotvonen/moebiusXBIN](https://github.com/hlotvonen/moebiusXBIN)
  v2.2.0, commit `3e792e5`, `app/server.js`. Upstream license:
  Apache-2.0.
- `libtextmode/libtextmode.js` is a minimal shim: `compress`,
  `uncompress`, and `resize_canvas` transcribed verbatim from
  upstream (`resize_canvas` minus its electron window probe, dead in
  node); `read_file` returns a fresh 80x25 document; `write_file` is
  a no-op.
- `hourly_saver.js` is a no-op stub (the fixture never persists).
- `start.js` boots the room at `/fixture` on the given port.

Runtime: node (the upstream server targets node + the `ws` package,
which rides devDependencies).
