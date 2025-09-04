# Copilot Agent Instructions for text0wnz

**text0wnz** is a collaborative, web-based text art editor and viewer. It supports classic ANSI text art, XBin files, and plain UTF-8 text. Editor state is synchronized between clients via WebSockets.

---

## Directory structure and important files / locations

```
├── coverage/             // unit test coverage
├── dist/                 // built version of the app
│   ├── ui/               // static assets
│   ├── app.min.js        // minified js
│   ├── editor.min.css    // minified css
│   └── index.html        // single page app dom
├── docs/                 // various markdown docs to help you
├── examples/             // test files
│   ├── ansi/             // .ans art files to test with
│   └── xbin/             // .xb files to test with
├── server/               // future server side scripts (not implemented)
├── src/                  // app source code
│   ├── scripts/          // typescript
│   ├── style/            // tailwindcss
│   └── www/              // index.html and static ui folder with font images
├── tests/                // all test related files
│   ├── e2e/              // playwright tests
│   ├── results/          // e2e and unit test results
│   ├── setup/            // unit test globals
│   └── unit/             // vitest unit files
├── CICaDa.ts             // custom build script for the app
├── eslint.config.js      // style guidelines
├── package.json          // deps and scripts
├── playwright.config.ts  // e2e configs
├── postcss.config.js     // css minifier config
├── tailwind.config.js    // css config
├── tsconfig.json         // typescript build opts
└── vitest.config.ts      // unit test opts
```

## Testing Tools and Structure

### Test Runners

- **Unit tests:**
  - Use [Vitest](https://vitest.dev/) (configured in `vitest.config.ts`).
  - These run in a `jsdom` environment for DOM-like APIs.
  - Unit tests go in `./tests/unit/` or any subfolder of `./tests/` except `./tests/e2e/`.
  - Coverage is enabled and reported in both text and HTML.

- **End-to-end (E2E) tests:**
  - Use [Playwright](https://playwright.dev/) (configured in `playwright.config.ts`).
  - E2E tests go in `./tests/e2e/`.

### Directory Structure

```
tests/
  unit/      # All Vitest unit tests
  e2e/       # All Playwright E2E tests
  setup/     # Shared setup files (e.g. ./tests/setup/test-setup.ts for Vitest)
```

- **Vitest** will automatically run all tests in `tests/unit/` and any other `tests/` subdirectory *except* `tests/e2e/`.
- **Playwright** will only run tests inside `tests/e2e/`.

> Please do **not** place any test files in `src/` or the project root—use `tests/unit/` and `tests/e2e/` as described above.

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

3. Run Unit Tests
```sh
bun check
```
or
```sh
bunx vitest run
```
For coverage:
```sh
bun check:coverage
```
or
```sh
bunx vitest run --coverage
```

4. Run E2E Tests
```sh
bun check:e2e
```
or
```sh
bunx playwright test
```

5. Serve the app
Point your web server to the dist directory.

6. Manual Browser Testing

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
- `bun check` or `bunx vitest run` — Run unit tests
- `bunx vitest run --coverage` — Run tests with coverage report
- `bun check:e2e` or `bunx playwright test` — Run Playwright E2E tests

review `package.json` for the full list of script commands.

## Supported Browsers
- Chrome/Chromium 95+
- Firefox 93+
- Safari 15+
- Edge 95+

Thank you for helping test and improve text0wnz!
