# Copilot Agent Instructions for text0wnz

**text0wnz** is a collaborative, web-based text art editor and viewer. It supports classic ANSI text art, XBin files, and plain UTF-8 text. Editor state is synchronized between clients via WebSockets.

> **Note:** Unit test coverage is currently very limited. Most testing is manual as we focus on delivering core features.

---

## How to Test and Run the App

**1. Install dependencies**
```sh
bun i
```

2. Build the app
```sh
bun bake
```
This creates the dist directory, bundles JS/CSS, and moves all assets (HTML, fonts, images) into ./ui.

3. Serve the app
Point your web server to the dist directory.

4. Manual Browser Testing

- Open the app in a modern browser.
- Open the JS console; verify there are no errors.
- Confirm the splash dialog (`<dialog id="msg">`) is open by default.
- Click the "Draw" button (`<button id="splashDraw">`) to close the dialog.
- Select a tool from the sidebar (e.g., `<button id="brush">`).
- The tool options menu (`<article id="brushOpts">`) should become visible.
- Choose a subtool (e.g., `<button id="blockBrush">` or `<button id="shadeBrush">`).
- The main canvas (`<canvas id="art">`) is now ready for drawing.
- Click, or click and drag, to draw on the canvas.
- Use the palette (`<canvas id="paletteColors">`) to change drawing colors.

> If you encounter errors or unexpected behavior, attach console logs and screenshots to your issue or pull request.

## Scripts
- `bun bake` — Build assets and move them to dist
- `bun run lint` — Run ESLint
- `bun run lint:fix` — Run ESLint with auto-fix

## Supported Browsers
- Chrome/Chromium 95+
- Firefox 93+
- Safari 15+
- Edge 95+

Thank you for helping test and improve text0wnz!
