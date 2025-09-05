# teXt.0w.nz

![teXt0wnz text art editor preview](https://raw.githubusercontent.com/xero/text0wnz/main/docs/preview.png)

**teXt0wnz** is a collaborative, web-based text art editor and viewer. It supports classic ANSI text art, XBin files, and plain UTF-8 text. The editor itself is a single-page-application that can run locally or on a web-server. The optional server-side components synchronize editor state between clients via WebSockets.

## URLs

| Domain                          | Status                                                      |
| ------------------------------- | ----------------------------------------------------------- |
| https://text.0w.nz              | The final prod domain. I dev here, so it will be broken lot |
| https://xero.github.io/text0wnz | The github pages version of the site is guaranteed to work  |

> [!WARNING]
> _This project is under active development and is only semi-functional!_
>
> testing stats: [unit](https://xero.github.io/text0wnz/unit/) ░ [e2e](https://xero.github.io/text0wnz/e2e/) / [json](https://xero.github.io/text0wnz/e2e/results.json)

[![Last Test Suite Results](https://github.com/xero/text0wnz/actions/workflows/test-suite.yml/badge.svg?branch=main)](https://github.com/xero/text0wnz/actions/workflows/test-suite.yml?query=branch%3Amain) [![Tests](https://github.com/xero/text0wnz/actions/workflows/deploy-pages.yml/badge.svg?branch=main)](https://xero.github.io/text0wnz) ![GitHub commit activity](https://img.shields.io/github/commit-activity/w/xero/text0wnz?style=flat&color=#31c352) ![GitHub last commit](https://img.shields.io/github/last-commit/xero/text0wnz.svg?style=flat&color=#31c352) ![GitHub repo size](https://img.shields.io/github/repo-size/xero/text0wnz?style=flat&color=#31c352)

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
  - Builds all site assets and moves them to the `dist` folder.
- `bun dbinit`
  - Create a blank SQLite database for the server.
- `bun serve`
  - Start a local web-server on port 3173 for development and testing.
- `bun run lint`
  - Run ESLint to check code quality.
- `bun run lint:fix`
  - Run ESLint and automatically fix problems.
- `bun check` / `bunx vitest run [options]`
  - Run unit tests.
- `bun check:coverage`
  - Run unit tests and generate a coverage report.
- `bun check:e2e` / `bunx playwright test [options]`
  - Run Playwright end-to-end tests.
- `bun check:e2e:headed`
  - Run Playwright E2E tests with the browser UI visible (not headless), so you can watch runs.
- `bun check:e2e:debug`
  - Run Playwright E2E tests in debug mode, opening debugging tools and pausing on failures for inspection.
- `bun playwright:install`
  - Install Playwright, its dependencies, and all supported browsers (Chromium, Firefox, & WebKit).

> [!TIP]
> Review [package.json](https://github.com/xero/text0wnz/blob/main/package.json) for the full list of script commands.

## Project Structure

```
.
├── dist/                 # built version of the app
│   ├── ui/               # static assets & fonts
│   ├── app.min.js        # minified js
│   ├── editor.min.css    # minified css
│   └── index.html        # single page app dom
├── docs/                 # various markdown spec files
├── examples/             # test files
│   ├── ansi/             # .ans art files to test with
│   └── xbin/             # .xb files to test with
├── server/               # future server side scripts
├── src/                  # app source code
│   ├── scripts/          # typescript files
│   ├── style/            # css using tailwindcss
│   └── www/              # index.html and static assets
├── tests/                # all test related files
│   ├── e2e/              # playwright tests
│   ├── results/          # e2e and unit test results
│   ├── setup/            # unit test globals
│   └── unit/             # vitest unit files
├── CICaDa.ts             # custom build script for the app
├── eslint.config.js      # style guidelines
├── package.json          # deps and scripts
├── playwright.config.ts  # e2e test configs
├── postcss.config.js     # css build config
├── tailwind.config.js    # tailwindcss config
├── tsconfig.json         # typescript build options
└── vitest.config.ts      # unit test options
```

## Testing

### Test Runners

- **Unit tests:**
  - Use [Vitest](https://vitest.dev/) (configured in `vitest.config.ts`).
  - These run in a `jsdom` environment for DOM-like APIs.
  - Unit tests go in `./tests/unit/` or any subfolder of `./tests/` except `./tests/e2e/`.
  - Coverage is enabled and reported in both text and HTML.

- **End-to-end (E2E) tests:**
  - Use [Playwright](https://playwright.dev/) (configured in `playwright.config.ts`).
  - E2E tests go in `./tests/e2e/`.

- **Results & Reports:**
  - All test results are written to `./tests/results/`
  - [this workflow](https://github.com/xero/text0wnz/blob/main/.github/workflows/commit-results.yml) publishes all test results from the `main` branch along with the demo site.
    - [unit coverage report](https://xero.github.io/text0wnz/unit/)
    - [playwright report](https://xero.github.io/text0wnz/e2e/)
    - [raw e2e results](https://xero.github.io/text0wnz/e2e/results.json)

### Tests Directory Structure

```
tests/
├── e2e/      # All Playwright E2E tests
├── unit/     # All Vitest unit tests
├── setup/    # Shared setup or init files
└── results/  # Test run results
```

>[!IMPORTANT]
>- **Vitest** will automatically run all tests in `tests/unit/` and _any__ other `tests/` subdirectory *except* `tests/e2e/`.
>- **Playwright** will only run tests inside `tests/e2e/`.

### Testing Commands

1. **Install dependencies Build the app**
- `bun i` and `bun bake`

2. **Run Unit Tests**
- `bun check` or `bunx vitest run`

3. **For Coverage Reports**
- `bun check:coverage` or `bunx vitest run --coverage`

4. Run E2E Tests
- `bun check:e2e` or `bunx playwright test`

##  Browser Support
- Chrome/Chromium 95+
- Firefox 93+
- Safari 15+
- Edge 95+


## License & Greetz

<img src="https://gist.githubusercontent.com/xero/cbcd5c38b695004c848b73e5c1c0c779/raw/6b32899b0af238b17383d7a878a69a076139e72d/kopimi-sm.png" align="left" height="222">

mad respect to [Andy Herbert^67](http://github.com/andyherbert) - [Moebius](https://github.com/blocktronics/moebius) ░ [grmmxi^imp!](https://glyphdrawing.club/) - [MoebiusXBIN](https://github.com/hlotvonen/moebiusXBIN/) ░ [Curtis Wensley](https://github.com/cwensley) - [PabloDraw](https://github.com/cwensley/pablodraw) ░ [Skull Leader^ACiD](https://defacto2.net/p/skull-leader) - [ACiDDRAW](https://www.acid.org/apps/apps.html) ▒ _shade and disrespect to "TheDraw" and the thief roy^sac_ ;P

---

All files and scripts in this repo are released [CC0](https://creativecommons.org/publicdomain/zero/1.0/) / [kopimi](https://kopimi.com)! In the spirit of _freedom of information_, I encourage you to fork, modify, change, share, or do whatever you like with this project! `^c^v`
