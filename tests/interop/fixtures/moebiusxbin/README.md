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
  node); `read_file` returns a fresh 80x25 document carrying the
  fork's `palette_4bit` as sixteen `{r, g, b}` objects in 8-bit
  components (the fork ships these raw where vanilla sends 6-bit),
  and, with `FIXTURE_FONT_BYTES=1` in the environment, `font_bytes`
  as a node Buffer the way an `.xb` server file with an embedded
  font arrives (it crosses the wire as Buffer JSON); `write_file` is
  a no-op.
- `hourly_saver.js` is a no-op stub (the fixture never persists).
- `start.js` boots the room at `/fixture` on the given port.

Runtime: node and the `ws` package from this repo's devDependencies.
