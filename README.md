# text.0w.nz

[![Tests](https://github.com/xero/text0wnz/actions/workflows/test-suite.yml/badge.svg?branch=main)](https://poop) [![Tests](https://github.com/xero/text0wnz/actions/workflows/deploy-pages.yml/badge.svg?branch=main)](https://xero.github.io/text0wnz) ![GitHub commit activity](https://img.shields.io/github/commit-activity/w/xero/text0wnz?style=flat&color=#31c352) ![GitHub last commit](https://img.shields.io/github/last-commit/xero/text0wnz.svg?style=flat&color=#31c352) ![GitHub repo size](https://img.shields.io/github/repo-size/xero/text0wnz?style=flat&color=#31c352)

**text0wnz** is a collaborative, web-based text art editor and viewer. It supports classic ANSI text art, XBin files, and plain UTF-8 text. Editor state is synchronized between clients via WebSockets.

---

## Install and Run

> [!NOTE]
> you can replace `bun` or `bunx` commands with `npm` and `npx` commands if you want. But you will need to add the `run` command into the short aliases in these examples. **e.g.** `bun bake` = `npm run bake`

1. **Install dependencies**

```sh
bun i
```

2. **Build the app**

```sh
bun bake
```
- This creates the `dist` directory, bundles JS/CSS, and moves all assets (HTML, fonts, images) into `dist/ui`.

3. **Locally serve the app**
```sh
bun serve
```
- This runs a simple localhost server on port 4173.
- You can now use the app via `http://localhost:4173`

4. **Production deploy the app**
- Serve the contents of `dist` any way you like.
  - **e.g.** `cp -r dist ~www/ansi` and point nginx at it.

## Bun/NPM Scripts

- `bun bake`
  — Builds all site assets and moves them to the `dist` folder.
- `bun dbinit`
  — Create a blank SQLite database for the server.
- `bun serve`
  — Start a local webserver on port 3173 for development and testing.
- `bun run lint`
  — Run ESLint to check code quality.
- `bun run lint:fix`
  — Run ESLint and automatically fix problems.
- `bun check` / `bunx vitest run [options]`
  — Run unit tests.
- `bun check:coverage`
  — Run unit tests and generate a coverage report.
- `bun check:e2e` / `bunx playwright test [options]`
  — Run Playwright end-to-end tests.
- `bun check:e2e:headed`
  — Run Playwright E2E tests with the browser UI visible (not headless), so you can watch them run.
- `bun check:e2e:debug`
  — Run Playwright E2E tests in debug mode, opening debugging tools and pausing on failures for inspection.
- `bun playwright:install`
  — Install Playwright, its dependencies, and all supported browsers (Chromium, Firefox, WebKit) for E2E testing.

> [!TIP]
> Review [package.json](https://github.com/xero/text0wnz/blob/main/package.json) for the full list of script commands.

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

---

## Supported Browsers
- Chrome/Chromium 95+
- Firefox 93+
- Safari 15+
- Edge 95+

---

## License

<img src="https://gist.githubusercontent.com/xero/cbcd5c38b695004c848b73e5c1c0c779/raw/6b32899b0af238b17383d7a878a69a076139e72d/kopimi-sm.png" align="left" height="222">

Much of this work is inspired by the open-source, MIT licensed [Moebius](https://github.com/blocktronics/moebius) and the [MoebiusXBIN](https://github.com/hlotvonen/moebiusXBIN/) fork ANSI editors.

---

All files and scripts in this repo are released [CC0](https://creativecommons.org/publicdomain/zero/1.0/) / [kopimi](https://kopimi.com)! In the spirit of _freedom of information_, I encourage you to fork, modify, change, share, or do whatever you like with this project! `^c^v`
