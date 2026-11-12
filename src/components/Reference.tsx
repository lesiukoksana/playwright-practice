import { useEffect, useRef, useState } from 'react';
import { runtime } from '../engine/runtime';
import { DOCS as D, type DocLink } from '../lessons/docs';
import { LESSONS } from '../lessons/lessons';
import { Markdown } from './Markdown';

// Titles are escaped: "MDN: the <title> element" would otherwise be read as an HTML tag.
const link = (d: DocLink) => `[${d.title.replace(/</g, '&lt;')}](${d.url})`;
const links = (...ds: DocLink[]) => `📖 ${ds.map(link).join(' · ')}`;

/** Links to the lessons that teach a topic, e.g. "🧪 Practice: [Strict mode](#/lesson/strict-mode)". */
const lessonLink = (id: string) => {
  const lesson = LESSONS.find((l) => l.id === id);
  if (!lesson) throw new Error(`Reference links to unknown lesson "${id}"`);
  return `[${lesson.title}](#/lesson/${id})`;
};
const practice = (...ids: string[]) => `🧪 Practice: ${ids.map(lessonLink).join(' · ')}`;

/** Section ids come from the heading text, so the table of contents never goes out of date. */
const slug = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const API = `
## Locators

${links(D.locators, D.filtering, D.strictness, D.frames, D.otherLocators, D.locatorApi)}

${practice('get-by-role', 'more-locators', 'filter-scope', 'strict-mode', 'iframes', 'shadow-dom')}

| Method | Example |
|---|---|
| \`getByRole(role, { name })\` | \`page.getByRole('button', { name: 'Log in' })\` |
| \`getByLabel(text)\` | \`page.getByLabel('Email')\` |
| \`getByText(text)\` | \`page.getByText('Your cart is empty.')\` |
| \`getByPlaceholder(text)\` | \`page.getByPlaceholder('Search by name')\` |
| \`getByTestId(id)\` | \`page.getByTestId('cart-count')\` |
| \`getByAltText / getByTitle\` | \`page.getByTitle('Wishlist')\` |
| \`locator(css)\` | \`page.locator('.product-card')\`. Also \`text=\`, \`xpath=\`, \`:has-text()\`, \`:visible\` |
| \`filter({ hasText, has, hasNot, hasNotText, visible })\` | \`cards.filter({ hasText: 'Mug' })\` |
| \`first() / last() / nth(i)\` | \`cards.nth(2)\` |
| \`and(loc) / or(loc)\` | \`button.or(link)\` |
| \`frameLocator(css) / contentFrame()\` | \`page.frameLocator('iframe').getByText('Hi')\` |

String names match a **case-insensitive substring**. Use \`{ exact: true }\` or a regular expression for anything else.

## Which locator should I use?

${links(D.bestPractices, D.locators)}

Pick the first one on this list that works. The higher it is, the more your test looks at the page the way a user does,
and the less it breaks when the page's HTML or styling changes.

| # | Use | When | Example in PracticeShop |
|---|---|---|---|
| 1 | \`getByRole\` | Buttons, links, headings, checkboxes, menus, dialogs: almost anything you click or check | \`page.getByRole('button', { name: 'Add to cart' })\` |
| 2 | \`getByLabel\` | Form fields that have a label | \`page.getByLabel('Email')\` |
| 3 | \`getByPlaceholder\` | Fields with no label, only placeholder text | \`page.getByPlaceholder('Search by name')\` |
| 4 | \`getByText\` | Text that isn't interactive: messages, paragraphs | \`page.getByText('Your cart is empty.')\` |
| 5 | \`getByAltText\`, \`getByTitle\` | Images, and icons with a tooltip | \`page.getByTitle('Wishlist')\` |
| 6 | \`getByTestId\` | Nothing above fits, or the text changes (prices, counters) | \`page.getByTestId('cart-count')\` |
| 7 | \`locator('css')\` | Last resort | \`page.locator('.product-card')\` |

When the same thing appears several times (an **Add to cart** button on every card), don't count with \`nth()\`.
Find the container first, then look inside it:

\`\`\`ts
page.getByTestId('product-card')
  .filter({ hasText: 'USB-C Charger' })
  .getByRole('button', { name: 'Add to cart' });
\`\`\`

Avoid long CSS paths (\`div > div:nth-child(3) > button\`), XPath, auto-generated class names, and text that changes
on its own, such as prices or dates. Not sure what to use? Click **🎯 Pick locator** above the browser and hover over the element.

## Actions

${links(D.actions, D.actionability, D.keys, D.dragDrop, D.uploadFiles, D.locatorApi)}

${practice('click-navigate', 'fill-forms', 'checkboxes-selects', 'keyboard', 'hover', 'drag-drop', 'file-upload')}

\`click\`, \`dblclick\`, \`hover\`, \`fill\`, \`clear\`, \`pressSequentially\`, \`press\`, \`check\`, \`uncheck\`, \`setChecked\`,
\`selectOption\`, \`setInputFiles\` (with \`{ name, mimeType, buffer }\`), \`dragTo\`, \`focus\`, \`blur\`, \`scrollIntoViewIfNeeded\`,
\`waitFor\`, \`textContent\`, \`innerText\`, \`inputValue\`, \`getAttribute\`, \`isVisible\`, \`isChecked\`, \`isEnabled\`, \`count\`,
\`all\`, \`allTextContents\`, \`evaluate\`.

Actions wait until the element is visible, enabled, not covered by anything else and (for \`fill\`) editable.

## Assertions

${links(D.assertions, D.locatorAssertions, D.genericAssertions, D.softAssertions, D.expectPoll)}

${practice('assertions', 'auto-waiting', 'list-assertions', 'soft-assertions')}

**Auto-retrying** (await them): \`toBeVisible\`, \`toBeHidden\`, \`toBeEnabled\`, \`toBeDisabled\`, \`toBeChecked\`, \`toBeFocused\`,
\`toBeEditable\`, \`toBeEmpty\`, \`toBeAttached\`, \`toHaveText\`, \`toContainText\`, \`toHaveValue\`, \`toHaveAttribute\`, \`toHaveClass\`,
\`toContainClass\`, \`toHaveCount\`, \`toHaveCSS\`, \`toHaveId\`, \`toHaveAccessibleName\`, \`toHaveRole\`, and for pages \`toHaveURL\`, \`toHaveTitle\`.

**Values** (no await needed): \`toBe\`, \`toEqual\`, \`toContain\`, \`toBeTruthy\`, \`toBeGreaterThan\`, \`toMatch\`, \`toHaveLength\`,
\`toHaveProperty\`, \`toMatchObject\`, … Also \`expect.soft()\` and \`expect.poll()\`.

## Page

${links(D.pageApi, D.navigations, D.dialogs, D.newPages, D.clock, D.mock, D.network)}

${practice('first-test', 'overlays', 'dialogs', 'new-tabs', 'date-picker', 'mock-api', 'error-state')}

\`goto\`, \`reload\`, \`goBack\`, \`url\`, \`title\`, \`waitForURL\`, \`waitForLoadState\`, \`waitForTimeout\`, \`waitForFunction\`,
\`on/once('dialog' | 'console' | 'pageerror' | 'popup' | 'download')\`, \`waitForEvent\`, \`route\`, \`unroute\`, \`evaluate\`,
\`addInitScript\`, \`addLocatorHandler\`, \`keyboard.press/type\`, \`clock.setFixedTime/install\`, \`setViewportSize\`, \`context()\`, \`close\`.

## Fixtures and test structure

${links(D.writingTests, D.hooks, D.describe, D.step, D.pom, D.apiTesting, D.timeouts)}

${practice('hooks', 'page-objects', 'test-steps', 'api-request')}

Fixtures: \`page\`, \`context\` (\`pages\`, \`newPage\`, \`waitForEvent('page')\`, \`route\`, \`addInitScript\`), \`request\` (\`get/post/put/delete\`), \`baseURL\`.

Test structure: \`test\`, \`test.describe\`, \`beforeEach\`, \`afterEach\`, \`beforeAll\`, \`afterAll\`, \`test.step\`, \`test.skip\`, \`test.only\`, \`test.setTimeout\`.

## Recorder and locator picker

${links(D.codegenIntro, D.recording)}

${practice('record-a-test')}

- **⏺ Record** (above the browser) writes code while you use the app: clicks, typing, checkboxes, dropdowns, Enter and file choices. Use **Assert visible / text / value** and then click an element to add an assertion. Code goes in at the editor's cursor, or at the end of the last test.
- **🎯 Pick locator** shows the locator for whatever you hover over. Click to keep it, then **Copy** it or **Insert** it into your code.
- Both prefer roles and labels, and use \`filter({ hasText })\` to tell repeated elements apart. Real Playwright does the same with \`npx playwright codegen\`.

## Common errors

${links(D.actionability, D.strictness, D.timeouts, D.mdnPromises)}

The **Output** panel shows the error and the line it came from. These are the ones you'll see most often.

### strict mode violation: … resolved to 3 elements

Your locator matches more than one element, and Playwright won't guess which one you meant. The message lists what
it found, with a better locator for each ("aka …").

**Fix:** make the locator more specific. Add a \`name\`, use \`{ exact: true }\`, or look inside a container with
\`filter({ hasText })\`. Use \`first()\` or \`nth()\` only when the position really matters.

${practice('strict-mode', 'filter-scope')}

### locator.click: Timeout 10000ms exceeded

The action waited for 10 seconds and the element never became ready. Read the **Call log** under the error: its last line
says why.

| Last line of the call log | What it means | Fix |
|---|---|---|
| \`waiting for getBy…\` (nothing else) | Nothing on the page matches the locator | Check the spelling, role and name with **🎯 Pick locator**. Check you're on the page you think you are. If the element is inside an iframe, use \`frameLocator()\` |
| \`element is not visible\` | It exists but is hidden, for example in a closed menu | Open the menu (\`hover()\` or \`click()\`) first |
| \`element is not enabled\` | The button is disabled | Do what enables it first, such as filling in required fields |
| \`… intercepts pointer events\` | Something covers it: a pop-up, banner or overlay | Close it first, or register \`page.addLocatorHandler()\` |

${practice('auto-waiting', 'overlays', 'hover', 'iframes')}

### expect(locator).toHaveText(expected) failed

The assertion retried for 5 seconds and the page never matched. Compare **Expected** with **Received**:

- \`Received: <element(s) not found>\` means the locator is wrong (see the timeout section above).
- A small difference, like extra text, means you want \`toContainText()\` or a regular expression instead of an exact match.
- If the app really shows the wrong value, you've found a bug. That's what tests are for.

${practice('assertions', 'list-assertions')}

### Missing await on line 5

An action or assertion was called without \`await\`. The test moved on (or finished) before it was done, so it may pass
without really checking anything. **Fix:** put \`await\` in front of every \`page.…\`, \`locator.…\` and \`expect(locator)…\` call.

${practice('first-test')}

### document is not available in test code

Test code runs outside the page (in Node.js in real Playwright), so \`document\`, \`window\` and \`localStorage\` don't exist there.
**Fix:** use locators. To run code inside the page, use \`page.evaluate(() => document.title)\`.

### Test timeout of 30000ms exceeded

The whole test took longer than 30 seconds. Usually one step is waiting for something that never happens, such as an
event or a navigation. Look at the last step in the Output panel. Long \`waitForTimeout()\` calls add up too.
For a test that really is slow, call \`test.setTimeout(60_000)\`.

${practice('auto-waiting')}

### A confirm dialog was dismissed and nothing happened

Playwright dismisses dialogs (\`alert\`, \`confirm\`, \`prompt\`) that the test doesn't handle, so the shop's
**Reset all demo data?** confirmation is answered "Cancel" and nothing is reset. **Fix:** register a handler *before* the click that opens it:
\`page.once('dialog', (dialog) => dialog.accept())\`.

${practice('dialogs')}

### … is not supported in Playwright Lab

Real Playwright has it, but this in-browser version doesn't. See the list below for what's missing and what to use instead.

## Differences from real Playwright

- Tests run **in your browser**, against an iframe, one test at a time. The browser is always Chromium-like (your own browser).
- Each test gets fresh storage, like a new browser context. The lab keeps its copy of the shop's data separate, so tests don't change the shop when you open it in a tab of your own.
- Timeouts: assertions 5 s (same as Playwright), actions 10 s, test 30 s.
- Dialog handlers must call \`accept()\` or \`dismiss()\` straight away. Without a handler, dialogs are dismissed, like in Playwright.
- Not available: screenshots, video and traces, \`page.mouse\`, \`test.use\`, custom fixtures (\`test.extend\`), file paths in \`setInputFiles\`, \`waitForRequest/Response\`, and CSS \`:hover\` styles.
- Type errors are shown in the editor but don't stop the test from running. Real Playwright doesn't type-check either.
`;

export function Reference() {
  const shopUrl = runtime.baseURL;
  const config = `
## Run your tests with real Playwright

${links(D.intro, D.useOptions, D.runningTests)}

The practice app is a static site, so real Playwright can test it too:

\`\`\`bash
npm init playwright@latest
\`\`\`

Then set \`baseURL\` in **playwright.config.ts**:

\`\`\`ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: { baseURL: '${shopUrl}' },
});
\`\`\`

Copy a test from the lab into \`tests/example.spec.ts\` and run \`npx playwright test --ui\`. Keep the relative paths (\`page.goto('index.html')\`), which resolve against \`baseURL\`.

## The practice app

PracticeShop is a small online store: catalog with filters and pagination, product pages, cart with promo codes, a 3-step checkout, orders, invoices, wishlist (drag and drop), profile (file upload) and an admin page.
Its data lives in \`localStorage\` (keys start with \`pp.\`).

- Promo codes: \`SAVE10\`, \`WELCOME5\` (subtotal ≥ $30), \`FREESHIP\`, and the expired \`SUMMER2025\`
- Test cards: \`4242 4242 4242 4242\` (Visa), \`5555 5555 5555 4444\` (Mastercard), \`4000 0000 0000 0002\` (declined)
- Shipping $5.99, free from $50.00. Express +$9.99. Tax 8% of (subtotal − discount)
- Full business rules: [README](${shopUrl}README.md) · bug list: [BUGS.md](${shopUrl}BUGS.md)

## Official documentation

Everything here comes from the official Playwright docs at [playwright.dev](https://playwright.dev/docs/intro). Good next reads:

| Topic | Links |
|---|---|
| Getting started | ${link(D.intro)} · ${link(D.writingTests)} · ${link(D.runningTests)} · ${link(D.uiMode)} |
| Writing good tests | ${link(D.bestPractices)} · ${link(D.codegenIntro)} · ${link(D.codegen)} |
| Organizing tests | ${link(D.hooks)} · ${link(D.describe)} · ${link(D.step)} · ${link(D.pom)} |
| Finding elements | ${link(D.locators)} · ${link(D.byRole)} · ${link(D.byLabel)} · ${link(D.byTestId)} · ${link(D.filtering)} · ${link(D.lists)} · ${link(D.shadowDom)} |
| Interacting | ${link(D.actions)} · ${link(D.actionability)} · ${link(D.navigations)} · ${link(D.dialogs)} · ${link(D.frames)} · ${link(D.pages)} |
| Mouse, files and time | ${link(D.hoverApi)} · ${link(D.dragDrop)} · ${link(D.uploadFiles)} · ${link(D.clock)} |
| Checking results | ${link(D.assertions)} · ${link(D.locatorAssertions)} · ${link(D.genericAssertions)} · ${link(D.softAssertions)} · ${link(D.timeouts)} |
| Network and APIs | ${link(D.mock)} · ${link(D.network)} · ${link(D.route)} · ${link(D.fulfill)} · ${link(D.apiTesting)} |
| Configuration and debugging | ${link(D.configuration)} · ${link(D.useOptions)} · ${link(D.traceViewer)} |

Web platform background on MDN: ${link(D.mdnRoles)} · ${link(D.mdnRegex)} · ${link(D.mdnPromises)} · ${link(D.mdnShadowDom)} · ${link(D.mdnTitle)}

## Recommended courses

Want a longer, guided course alongside these lessons? These video courses on Udemy are a good next step.
They're external courses, not part of Playwright Lab.

**Playwright**

- [The complete QA automation course: Playwright and JavaScript](https://www.udemy.com/course/the-complete-qa-automation-course-playwright-javascript/)
- [Test automation with Playwright and JavaScript](https://www.udemy.com/course/aqa-playwright-javascript/)
- [Playwright: complete beginner course](https://www.udemy.com/course/playwright-complete-beginner-course/)
- [Automated software testing with Playwright](https://www.udemy.com/course/automated-software-testing-with-playwright/)
- [Playwright tutorials: automation testing](https://www.udemy.com/course/playwright-tutorials-automation-testing/)

**Programming foundations**

- [Understanding TypeScript](https://www.udemy.com/course/understanding-typescript/): the language the lessons here are written in
- [The complete JavaScript course](https://www.udemy.com/course/the-complete-javascript-course/): TypeScript is JavaScript with types, so this covers the basics underneath
- [Python for testers](https://www.udemy.com/course/python-for-testers/): Playwright also has a Python version, if your team uses Python
`;

  const ref = useRef<HTMLDivElement>(null);
  const [toc, setToc] = useState<{ id: string; title: string }[]>([]);

  // Give every heading an id (sections link as #/reference/<id>) and build the table of contents.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>('.md h2, .md h3').forEach((h) => {
      h.id = slug(h.textContent ?? '');
    });
    setToc([...root.querySelectorAll<HTMLElement>('.md h2')].map((h) => ({ id: h.id, title: h.textContent ?? '' })));
  }, []);

  // Scroll to the section named in the URL, on load and when a link is followed.
  useEffect(() => {
    const scroll = () => {
      const m = /^#\/reference\/([\w-]+)/.exec(location.hash);
      if (m) document.getElementById(m[1])?.scrollIntoView({ block: 'start' });
      else if (location.hash === '#/reference') ref.current?.scrollIntoView({ block: 'start' });
    };
    scroll();
    window.addEventListener('hashchange', scroll);
    return () => window.removeEventListener('hashchange', scroll);
  }, [toc]);

  return (
    <div className="page reference" ref={ref}>
      <h1>Reference</h1>
      <p className="lead">The Playwright API supported by Playwright Lab, and how to take your tests further.</p>
      {toc.length > 0 && (
        <nav className="toc" aria-label="On this page">
          <h2>On this page</h2>
          <ul>
            {toc.map((s) => (
              <li key={s.id}>
                <a href={`#/reference/${s.id}`}>{s.title}</a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <Markdown source={API} />
      <Markdown source={config} />
    </div>
  );
}
