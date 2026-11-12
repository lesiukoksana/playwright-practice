# Playwright Practice Lab

Learn Playwright in the browser: short lessons, a code editor with Playwright autocomplete, and a live demo shop
(**PracticeShop**) to test against. Write a test, press **Run**, and watch it click through the app. Nothing to install.

- **32 lessons in 10 chapters**: locators, recording tests, actions, auto-waiting and soft assertions, list assertions,
  timeouts, overlays, forms, keyboard, hover, drag and drop, file upload, date pickers with \`page.clock\`, dialogs, iframes,
  shadow DOM, new tabs, hooks, steps, page objects, network mocking, API testing, and "find the bug" exercises.
- **Recorder**: use the app and the test code is written into the editor, with buttons to add assertions.
- **Automatic checking**: each lesson checks that your tests pass and that they use the technique being taught.
  "Find the bug" lessons also re-run your test against the shop with a bug switched on, and your test has to fail.
- **Sandbox** with examples, bug mode toggles and a "log in as" option.
- **Locator picker**: hover over the app to get a suggested `getByRole(...)` / `getByLabel(...)` locator.
- **Reference page** with the supported API, which locator to choose, common errors and how to fix them, and links to the
  official docs and to the lesson that teaches each topic.
- Playwright-style error messages: strict mode violations with "aka" suggestions, call logs, code frames, and
  "missing await" detection.

Progress and code are saved in the browser (`localStorage`). There is no backend, so it runs on GitHub Pages.

## How it works

GitHub Pages only serves static files, so it can't run real Playwright (that needs Node.js and a browser on a server).
Instead, `src/engine/` is a JavaScript re-implementation of the core `@playwright/test` API that drives the shop
inside an iframe:

| File | What it does |
|---|---|
| `runtime.ts` | Compiles TypeScript with Sucrase, runs `test`/`describe`/hooks, timeouts, steps, the preview iframes and instrumentation |
| `api.ts` | `Page`, `Locator`, `FrameLocator`, `BrowserContext`, `Dialog`, `Route`, `Keyboard`, `request` |
| `selectors.ts` | Locator resolution (`getByRole`, `getByText`, …, `filter`, `nth`, frames) and the locator generator |
| `recorder.ts` | The Recorder: turns clicks, typing and assertions in the preview into code |
| `dom.ts` | ARIA roles, accessible names, visibility, text matching (pierces shadow DOM) |
| `input.ts` | Mouse, keyboard, fill, select, file upload and drag-and-drop emulation |
| `expect.ts` | Auto-retrying locator/page assertions and Jest-style value matchers |
| `playwright-api.d.ts.txt` | Type definitions used by the editor for autocomplete |

The shop loads `shop/js/test-hooks.js`, which lets the lab observe dialogs, console messages, `fetch` calls
(for `page.route`) and new tabs.

Learners write standard `@playwright/test` code, so their tests also run with real Playwright: set
`baseURL` to `https://<user>.github.io/<repo>/shop/`. The in-app **Reference** page lists what's supported and the
differences from real Playwright.

## Develop

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # type-check + production build into dist/
npm run preview   # serve the build
```

The editor (Monaco) is loaded from the jsDelivr CDN at runtime.

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository (branch `main`).
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` builds and publishes on every push to `main`.

The site will be at `https://<user>.github.io/<repo>/`. The build uses relative paths and hash routing
(`#/lesson/...`), so it works under any sub-path without extra configuration.

## Project structure

```
index.html, src/main.tsx, src/App.tsx   the lab (React + Vite)
src/components/                         Home, Workspace (lesson + editor + output + preview), Reference
src/engine/                             the Playwright-like test engine
src/lessons/lessons.ts                  lessons, chapters, sandbox examples
src/lessons/lessons-extra.ts            more lessons (inserted into the course by INSERT_AFTER)
src/lessons/docs.ts                     links to the official docs for each lesson
src/progress.ts                         progress, saved code and settings (localStorage, "pwl." keys)
public/shop/                            PracticeShop, the app under test (plain HTML/CSS/JS)
  README.md                             the shop's pages, test accounts and business rules
  BUGS.md                               the bug-mode bug list (spoilers)
```

## Adding a lesson

Lessons live in two lists: `BASE_LESSONS` in `src/lessons/lessons.ts` and `EXTRA_LESSONS` in
`src/lessons/lessons-extra.ts`. The course order (`LESSONS`) is built from them, so don't edit `LESSONS` itself.

- To add a lesson at the end of a chapter, or anywhere in the base course, add it to `BASE_LESSONS` in the right position.
- To keep new lessons in their own file, add them to `EXTRA_LESSONS`, then say where each one goes in `INSERT_AFTER`
  in `lessons.ts`. For example, `keyboard: ['hover', 'drag-drop']` puts those two lessons right after `keyboard`.

A lesson looks like this:

```ts
{
  id: 'my-lesson',                 // used in the URL: #/lesson/my-lesson
  chapter: 'Locators',             // must be one of CHAPTERS
  title: 'My lesson',
  intro: `Markdown explanation…`,
  task: `What the learner must do…`,
  starter: `import { test, expect } from '@playwright/test';\n…`,
  solution: `…`,
  hints: ['First hint', 'Second hint'],
  startPath: 'index.html',         // page shown in the preview before the first run
  setup: { dismissOverlays: true, loggedInAs: 'standard@shop.test' }, // optional
  checks: [uses('filter', 'Uses filter()'), codeLacks(/waitForTimeout/, "Doesn't sleep")],
  mutation: { bugs: ['B03'], description: '…' }, // optional "find the bug" mode
}
```

Also add the lesson's official docs links to `LESSON_DOCS` in `src/lessons/docs.ts`, and, if it teaches a new API,
a "Practice" link in the matching section of `src/components/Reference.tsx`.

Every lesson's solution should pass: open the lesson, click **Show solution**, then **Run**.
