import { EXTRA_LESSONS } from './lessons-extra';
import { codeHas, codeLacks, minTests, uses, type Lesson } from './types';

const IMPORT = "import { test, expect } from '@playwright/test';\n\n";

export const CHAPTERS = [
  'Getting started',
  'Locators',
  'Waiting & timing',
  'More assertions',
  'Forms & keyboard',
  'Mouse, files & widgets',
  'Browser features',
  'Organizing tests',
  'Network',
  'Find the bug',
];

const BASE_LESSONS: Lesson[] = [
  // ------------------------------------------------------------------ Getting started
  {
    id: 'first-test',
    chapter: 'Getting started',
    title: 'Your first test',
    startPath: 'index.html',
    intro: `
Welcome! You'll learn Playwright by testing **PracticeShop**, the demo store in the browser panel on the right.

A Playwright test is an \`async\` function that receives a **\`page\`**, which is a browser tab. You tell the page what to do and then **assert** what you expect to see:

\`\`\`ts
import { test, expect } from '@playwright/test';

test('home page has the right title', async ({ page }) => {
  await page.goto('index.html');
  await expect(page).toHaveTitle('Shop | PracticeShop');
});
\`\`\`

- \`page.goto()\` opens a page. Paths are relative to the app's **baseURL**, so \`'index.html'\` opens the shop's home page.
- \`expect(page).toHaveTitle()\` checks the page's **title**.
- Nearly everything in Playwright is asynchronous, so put **\`await\`** in front of actions and assertions.

### What is a page title?

It's the text a browser shows **on the tab**, not a heading on the page. It comes from the \`<title>\` tag in the page's HTML:

\`\`\`html
<title>Shop | PracticeShop</title>
\`\`\`

In this lab you can see the current page's title on the **tab above the browser panel** (right now it says *Shop | PracticeShop*). \`toHaveTitle('…')\` passes only if the title matches **exactly**, including spaces and the \`|\` character.

Press **Run** (or <kbd>Ctrl</kbd> + <kbd>Enter</kbd>) and watch the browser panel.
`,
    task: `Check the title of the **login page**:

1. Open the login page with \`page.goto('login.html')\`.
2. Check that its title is exactly \`Log in | PracticeShop\`.

Not sure what the title is? Type \`login.html\` in the address bar above the browser panel and press <kbd>Enter</kbd>. The tab above it shows the title.`,
    starter: `${IMPORT}test('login page has the right title', async ({ page }) => {
  // 1. Open login.html

  // 2. Check the page title

});
`,
    solution: `${IMPORT}test('login page has the right title', async ({ page }) => {
  await page.goto('login.html');
  await expect(page).toHaveTitle('Log in | PracticeShop');
});
`,
    hints: [
      "Use \`await page.goto('login.html')\` to open the page.",
      "Then: \`await expect(page).toHaveTitle('Log in | PracticeShop');\`",
    ],
    checks: [uses('goto', 'Opens a page with page.goto()'), uses('toHaveTitle', 'Checks the title with toHaveTitle()'), codeHas(/login\.html/, 'Opens login.html')],
  },
  {
    id: 'get-by-role',
    chapter: 'Getting started',
    title: 'Find elements by role',
    startPath: 'index.html',
    intro: `
To interact with an element you first **locate** it. The recommended way is by its **role** and **accessible name**, which is how users and assistive technology see the page:

\`\`\`ts
page.getByRole('heading', { name: 'Shop all products' });
page.getByRole('button', { name: 'Add to cart' });
page.getByRole('link', { name: 'Log in' });
page.getByRole('checkbox', { name: 'In stock only' });
\`\`\`

The name is matched as a **case-insensitive substring** by default. Pass \`exact: true\` for an exact match.

A locator doesn't search right away. It describes *how* to find the element, and Playwright looks it up each time you use it. To assert that something is on screen, use \`toBeVisible()\`:

\`\`\`ts
await expect(page.getByRole('heading', { name: 'Shop all products' })).toBeVisible();
\`\`\`

> 💡 **Tip:** click **🎯 Pick locator** above the browser and hover over any element to see a suggested locator.
`,
    task: `On the home page, check that:
1. the heading **Shop all products** is visible, and
2. the **Log in** link in the header is visible.`,
    starter: `${IMPORT}test('home page shows the heading and the login link', async ({ page }) => {
  await page.goto('index.html');

  // TODO: the "Shop all products" heading is visible

  // TODO: the "Log in" link is visible
});
`,
    solution: `${IMPORT}test('home page shows the heading and the login link', async ({ page }) => {
  await page.goto('index.html');

  await expect(page.getByRole('heading', { name: 'Shop all products' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
});
`,
    hints: [
      "The heading's role is \`'heading'\`, and the link's role is \`'link'\`.",
      "\`await expect(page.getByRole('heading', { name: 'Shop all products' })).toBeVisible();\`",
    ],
    checks: [uses('getByRole', 'Uses getByRole()', 2), uses('toBeVisible', 'Makes two toBeVisible() assertions', 2)],
  },
  {
    id: 'click-navigate',
    chapter: 'Getting started',
    title: 'Click and navigate',
    startPath: 'index.html',
    intro: `
\`locator.click()\` clicks an element. Before clicking, Playwright **waits** until the element is:

- attached to the page, and there's exactly one match
- visible
- enabled
- not covered by another element (like a popup)

So you rarely need to wait yourself. If a click opens another page, check where you ended up with \`toHaveURL()\`. It accepts a full URL, or a **regular expression** to match part of it:

\`\`\`ts
await page.getByRole('link', { name: 'Yoga Mat' }).click();
await expect(page).toHaveURL(/product\\.html\\?id=21/);
\`\`\`

(In a regular expression, \`.\` and \`?\` have special meanings, so escape them with a backslash.)
`,
    task: `On the home page, click the **Smart Watch** product link. Then check that:
1. the URL contains \`product.html?id=4\`, and
2. a heading **Smart Watch** is visible.`,
    starter: `${IMPORT}test('opens a product page', async ({ page }) => {
  await page.goto('index.html');

  // TODO: click the "Smart Watch" link

  // TODO: check the URL

  // TODO: check the heading
});
`,
    solution: `${IMPORT}test('opens a product page', async ({ page }) => {
  await page.goto('index.html');

  await page.getByRole('link', { name: 'Smart Watch' }).click();

  await expect(page).toHaveURL(/product\\.html\\?id=4/);
  await expect(page.getByRole('heading', { name: 'Smart Watch' })).toBeVisible();
});
`,
    hints: [
      "The product name is a link: \`page.getByRole('link', { name: 'Smart Watch' })\`.",
      'Products load after a short delay. You don\'t need to wait for them, because click() waits automatically.',
      "\`await expect(page).toHaveURL(/product\\\\.html\\\\?id=4/);\`",
    ],
    checks: [uses('click', 'Clicks the link'), uses('toHaveURL', 'Checks the URL with toHaveURL()'), uses('toBeVisible', 'Checks the heading is visible')],
  },
  {
    id: 'fill-forms',
    chapter: 'Getting started',
    title: 'Fill in a form',
    startPath: 'login.html',
    intro: `
Form fields are easiest to find by their **label**:

\`\`\`ts
await page.getByLabel('Email').fill('someone@example.com');
\`\`\`

\`fill()\` focuses the field, clears it and types the new value in one go.

PracticeShop has these test accounts:

| Email | Password |
|---|---|
| \`standard@shop.test\` | \`Password123!\` |
| \`admin@shop.test\` | \`Admin123!\` |
| \`locked@shop.test\` | \`Password123!\` (locked) |
| \`slow@shop.test\` | \`Password123!\` (7-second login) |

After logging in, the header shows a menu button with the user's name.
`,
    task: `Log in as \`standard@shop.test\` with password \`Password123!\`, then check that a button named **Sam Standard** is visible in the header.`,
    starter: `${IMPORT}test('standard user can log in', async ({ page }) => {
  await page.goto('login.html');

  // TODO: fill in the email and password

  // TODO: click the "Log in" button

  // TODO: check that the "Sam Standard" button is visible
});
`,
    solution: `${IMPORT}test('standard user can log in', async ({ page }) => {
  await page.goto('login.html');

  await page.getByLabel('Email').fill('standard@shop.test');
  await page.getByLabel('Password').fill('Password123!');
  await page.getByRole('button', { name: 'Log in' }).click();

  await expect(page.getByRole('button', { name: 'Sam Standard' })).toBeVisible();
});
`,
    hints: [
      "\`page.getByLabel('Email')\` and \`page.getByLabel('Password')\` find the two fields.",
      "The submit button is \`page.getByRole('button', { name: 'Log in' })\`. (The header also has a *link* called \"Log in\", but the role tells them apart.)",
    ],
    checks: [uses('getByLabel', 'Finds fields with getByLabel()', 2), uses('fill', 'Fills both fields', 2), uses('click', 'Clicks the button')],
  },
  {
    id: 'assertions',
    chapter: 'Getting started',
    title: 'Assertions that wait',
    startPath: 'index.html',
    intro: `
\`expect(locator)\` assertions are **web-first**: they keep re-checking until the condition is true or the timeout (5 seconds) runs out. That's what makes Playwright tests stable on pages that change.

| Assertion | Passes when |
|---|---|
| \`toBeVisible()\` | the element is visible |
| \`toHaveText('…')\` | the element's **whole** text matches (whitespace is normalized) |
| \`toContainText('…')\` | the text **contains** the value |
| \`toHaveValue('…')\` | an input has this value |
| \`toHaveCount(n)\` | the locator matches exactly *n* elements |

Each product in the catalog has \`data-testid="product-card"\`, so \`page.getByTestId('product-card')\` matches all cards.

Plain values use non-retrying assertions, such as \`expect(2 + 2).toBe(4)\`. Those don't need \`await\`.
`,
    task: `Search for \`mug\` in the catalog. Then check that:
1. the search box has the value \`mug\`
2. exactly **1** product card is shown
3. the result count (\`getByTestId('result-count')\`) contains \`of 1 product\``,
    starter: `${IMPORT}test('search finds the mug', async ({ page }) => {
  await page.goto('index.html');
  const search = page.getByLabel('Search products');

  await search.fill('mug');

  // TODO: three assertions
});
`,
    solution: `${IMPORT}test('search finds the mug', async ({ page }) => {
  await page.goto('index.html');
  const search = page.getByLabel('Search products');

  await search.fill('mug');

  await expect(search).toHaveValue('mug');
  await expect(page.getByTestId('product-card')).toHaveCount(1);
  await expect(page.getByTestId('result-count')).toContainText('of 1 product');
});
`,
    hints: [
      'The search waits 300 ms after you stop typing. toHaveCount() keeps retrying, so you don\'t need to wait.',
      "\`await expect(page.getByTestId('product-card')).toHaveCount(1);\`",
    ],
    checks: [uses('toHaveValue', 'Uses toHaveValue()'), uses('toHaveCount', 'Uses toHaveCount()'), { label: 'Checks the result count text', test: ({ run }) => (run.calls.toContainText ?? 0) + (run.calls.toHaveText ?? 0) > 0 }],
  },

  // ------------------------------------------------------------------ Locators
  {
    id: 'more-locators',
    chapter: 'Locators',
    title: 'Labels, test ids and attributes',
    startPath: 'register.html',
    intro: `
Besides \`getByRole\`, Playwright has more user-facing locators:

\`\`\`ts
page.getByLabel('Email');               // form field by its <label>
page.getByPlaceholder('Search by name'); // by placeholder text
page.getByText('Your cart is empty.');   // by visible text
page.getByAltText('Company logo');       // images by alt text
page.getByTestId('error-summary');       // by data-testid="error-summary"
\`\`\`

**Which to choose?** Prefer \`getByRole\` and \`getByLabel\`, because they match what users see. Use \`getByTestId\` when there's no good role or text, for example a container or a badge.

To check an attribute, use \`toHaveAttribute\`. Invalid fields on this site get \`aria-invalid="true"\`:

\`\`\`ts
await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
\`\`\`
`,
    task: `On the registration page:
1. Click **Create account** without filling anything in.
2. Check that the error summary (\`getByTestId('error-summary')\`) contains \`Please fix 7 errors\`.
3. Check that the **Email** field has \`aria-invalid\` set to \`true\`.
4. Fill Email with \`not-an-email\`, click **Create account** again, and check that the summary contains \`Enter a valid email address.\``,
    starter: `${IMPORT}test('registration shows validation errors', async ({ page }) => {
  await page.goto('register.html');
  const createAccount = page.getByRole('button', { name: 'Create account' });
  const summary = page.getByTestId('error-summary');

  // TODO
});
`,
    solution: `${IMPORT}test('registration shows validation errors', async ({ page }) => {
  await page.goto('register.html');
  const createAccount = page.getByRole('button', { name: 'Create account' });
  const summary = page.getByTestId('error-summary');

  await createAccount.click();
  await expect(summary).toContainText('Please fix 7 errors');
  await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');

  await page.getByLabel('Email').fill('not-an-email');
  await createAccount.click();
  await expect(summary).toContainText('Enter a valid email address.');
});
`,
    hints: [
      'Locators can be stored in variables and reused. They are looked up again every time you use them.',
      "\`await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');\`",
    ],
    checks: [uses('getByTestId', 'Uses getByTestId()'), uses('getByLabel', 'Uses getByLabel()'), uses('toHaveAttribute', 'Uses toHaveAttribute()'), uses('toContainText', 'Checks the summary text twice', 2)],
  },
  {
    id: 'filter-scope',
    chapter: 'Locators',
    title: 'Scoping and filtering',
    startPath: 'index.html',
    intro: `
Every product card has an **Add to cart** button, so \`page.getByRole('button', { name: 'Add to cart' })\` matches many elements. To pick the right one, **narrow it down**:

\`\`\`ts
// 1. Find the card that contains the text…
const card = page.getByTestId('product-card').filter({ hasText: 'Yoga Mat' });

// 2. …then search *inside* that card.
await card.getByRole('button', { name: 'Add to cart' }).click();
\`\`\`

\`filter()\` also accepts \`has\`, which keeps elements that contain another locator:

\`\`\`ts
page.getByRole('row').filter({ has: page.getByRole('link', { name: 'Edit' }) });
\`\`\`

Chaining locators (\`card.getByRole(...)\`) searches only inside the first element.
`,
    task: `Add **USB-C Charger** to the cart from the catalog, then check that the cart badge in the header (\`getByTestId('cart-count')\`) shows \`1\`.`,
    starter: `${IMPORT}test('adds a product to the cart', async ({ page }) => {
  await page.goto('index.html');

  // TODO: find the USB-C Charger card and click its "Add to cart" button

  // TODO: the cart badge shows 1
});
`,
    solution: `${IMPORT}test('adds a product to the cart', async ({ page }) => {
  await page.goto('index.html');

  const card = page.getByTestId('product-card').filter({ hasText: 'USB-C Charger' });
  await card.getByRole('button', { name: 'Add to cart' }).click();

  await expect(page.getByTestId('cart-count')).toHaveText('1');
});
`,
    hints: [
      "\`page.getByTestId('product-card').filter({ hasText: 'USB-C Charger' })\` finds the card.",
      'Chain the button locator onto the card: \`card.getByRole(\'button\', { name: \'Add to cart\' })\`.',
    ],
    checks: [uses('filter', 'Uses filter()'), uses('toHaveText', 'Checks the badge with toHaveText()')],
  },
  {
    id: 'strict-mode',
    chapter: 'Locators',
    title: 'Strict mode',
    startPath: 'product.html?id=1',
    intro: `
Actions like \`click()\` and \`fill()\` require the locator to match **exactly one** element. If it matches more, Playwright stops with a **strict mode violation** instead of guessing which one you meant.

That's a feature: it stops your test from silently clicking the wrong thing.

To fix it, make the locator more specific:

- a different locator, e.g. \`getByRole('spinbutton', { name: 'Quantity' })\`
- an exact match: \`getByLabel('Quantity', { exact: true })\`
- scoping: \`page.getByTestId('cart-item').getByRole('button')\`
- if you really mean "the first one": \`.first()\`, \`.last()\` or \`.nth(2)\`

The error message lists every matching element and suggests a better locator for each ("aka …").
`,
    task: `The test below is broken. **Run it** and read the error. Then fix the locator so the test sets the quantity to \`3\` and checks the value.`,
    starter: `${IMPORT}test('sets the quantity', async ({ page }) => {
  await page.goto('product.html?id=1');

  await page.getByLabel('Quantity').fill('3');
  await expect(page.getByLabel('Quantity')).toHaveValue('3');
});
`,
    solution: `${IMPORT}test('sets the quantity', async ({ page }) => {
  await page.goto('product.html?id=1');

  const quantity = page.getByRole('spinbutton', { name: 'Quantity' });
  await quantity.fill('3');
  await expect(quantity).toHaveValue('3');
});
`,
    hints: [
      'The error lists three elements: the input and the two buttons whose aria-labels ("Decrease quantity", "Increase quantity") also contain the word "quantity".',
      "A number input has the role \`spinbutton\`: \`page.getByRole('spinbutton', { name: 'Quantity' })\`.",
    ],
    checks: [uses('fill', 'Fills the quantity'), uses('toHaveValue', 'Checks the value')],
  },

  // ------------------------------------------------------------------ Waiting & timing
  {
    id: 'auto-waiting',
    chapter: 'Waiting & timing',
    title: 'Auto-waiting and timeouts',
    startPath: 'login.html',
    intro: `
You almost never need to sleep in Playwright tests. **Avoid** \`page.waitForTimeout(5000)\`:

- it's slow, because it always waits the full time
- it's flaky, because sometimes the app is slower than your guess

Instead, rely on auto-waiting: actions wait for elements, and \`expect\` retries until its **timeout** (5 seconds by default). If something legitimately takes longer, raise the timeout for that one assertion:

\`\`\`ts
await expect(page.getByText('Report ready')).toBeVisible({ timeout: 15_000 });
\`\`\`

The account \`slow@shop.test\` takes **7 seconds** to log in.

> In Playwright Lab, actions wait up to 10 s and the whole test up to 30 s.
`,
    task: `The test below fails because the slow user's login takes longer than the default assertion timeout. Fix it **without** using \`waitForTimeout\`.`,
    starter: `${IMPORT}test('slow user can log in', async ({ page }) => {
  await page.goto('login.html');
  await page.getByLabel('Email').fill('slow@shop.test');
  await page.getByLabel('Password').fill('Password123!');
  await page.getByRole('button', { name: 'Log in' }).click();

  // This user's login takes 7 seconds, so this assertion times out.
  await expect(page.getByRole('button', { name: 'Sid Slow' })).toBeVisible();
});
`,
    solution: `${IMPORT}test('slow user can log in', async ({ page }) => {
  await page.goto('login.html');
  await page.getByLabel('Email').fill('slow@shop.test');
  await page.getByLabel('Password').fill('Password123!');
  await page.getByRole('button', { name: 'Log in' }).click();

  await expect(page.getByRole('button', { name: 'Sid Slow' })).toBeVisible({ timeout: 10_000 });
});
`,
    hints: ['Pass an options object to the assertion: \`toBeVisible({ timeout: 10_000 })\`.'],
    checks: [codeLacks(/waitForTimeout/, "Doesn't use waitForTimeout()"), codeHas(/timeout\s*:/, 'Sets a custom timeout on the assertion')],
  },
  {
    id: 'overlays',
    chapter: 'Waiting & timing',
    title: 'Pop-ups that get in the way',
    startPath: 'index.html',
    setup: { dismissOverlays: false },
    intro: `
Real sites show things *on top of* the page: cookie banners, newsletter pop-ups, chat widgets. If one covers the element you want to click, Playwright keeps waiting and finally reports *"… intercepts pointer events"*.

PracticeShop has two:
- a **cookie banner** that appears after 1 second
- a **newsletter pop-up** (a modal dialog) that appears after 4 seconds on the catalog page

(In earlier lessons both were turned off for you.)

You can handle them explicitly, as in this task, or register a handler that runs whenever the overlay shows up:

\`\`\`ts
await page.addLocatorHandler(page.getByTestId('newsletter-popup'), async () => {
  await page.getByRole('button', { name: 'No thanks' }).click();
});
\`\`\`

To check that something has disappeared, use \`toBeHidden()\`.
`,
    task: `On the catalog page:
1. Click **Accept all** in the cookie banner and check that the banner (\`getByTestId('cookie-banner')\`) is hidden.
2. Wait for the newsletter dialog (\`getByRole('dialog', { name: 'Get 10% off your first order' })\`) to become visible.
3. Click **No thanks** and check that the dialog is hidden.`,
    starter: `${IMPORT}test('handles the cookie banner and newsletter pop-up', async ({ page }) => {
  await page.goto('index.html');

  // TODO: accept cookies

  const popup = page.getByRole('dialog', { name: 'Get 10% off your first order' });
  // TODO: wait for the pop-up, close it, check it's gone
});
`,
    solution: `${IMPORT}test('handles the cookie banner and newsletter pop-up', async ({ page }) => {
  await page.goto('index.html');

  await page.getByRole('button', { name: 'Accept all' }).click();
  await expect(page.getByTestId('cookie-banner')).toBeHidden();

  const popup = page.getByRole('dialog', { name: 'Get 10% off your first order' });
  await expect(popup).toBeVisible();
  await popup.getByRole('button', { name: 'No thanks' }).click();
  await expect(popup).toBeHidden();
});
`,
    hints: [
      "The banner appears after 1 s, but you don't have to wait for it: click() waits until the button exists.",
      'The pop-up appears about 4 s after the page loads, which is within the default 5 s assertion timeout.',
    ],
    checks: [uses('toBeHidden', 'Checks that both overlays are hidden', 2), uses('toBeVisible', 'Waits for the pop-up to appear')],
  },

  // ------------------------------------------------------------------ Forms & keyboard
  {
    id: 'checkboxes-selects',
    chapter: 'Forms & keyboard',
    title: 'Checkboxes and dropdowns',
    startPath: 'index.html',
    intro: `
Playwright has dedicated actions for form controls:

\`\`\`ts
await page.getByLabel('In stock only').check();     // checkbox or radio
await page.getByLabel('In stock only').uncheck();
await page.getByLabel('Sort by').selectOption('Price: low to high'); // <select>, by label or value
\`\`\`

\`check()\` does nothing if the box is already checked, and fails if clicking didn't change it.

Assertions to match:

\`\`\`ts
await expect(page.getByLabel('In stock only')).toBeChecked();
await expect(page.getByLabel('Sort by')).toHaveValue('price-asc');
\`\`\`

\`.first()\` gives you the first match, which is handy for "the first product in the list".
`,
    task: `In the catalog:
1. Check the **Books** category and verify it's checked.
2. Sort by **Price: low to high**.
3. Check that **4** product cards are shown and that the first price (\`getByTestId('product-price')\`) is \`$9.99\`.`,
    starter: `${IMPORT}test('filters and sorts books', async ({ page }) => {
  await page.goto('index.html');

  // TODO
});
`,
    solution: `${IMPORT}test('filters and sorts books', async ({ page }) => {
  await page.goto('index.html');

  await page.getByLabel('Books').check();
  await expect(page.getByLabel('Books')).toBeChecked();
  await page.getByLabel('Sort by').selectOption('Price: low to high');

  await expect(page.getByTestId('product-card')).toHaveCount(4);
  await expect(page.getByTestId('product-price').first()).toHaveText('$9.99');
});
`,
    hints: [
      "\`await page.getByLabel('Books').check();\`",
      "\`await page.getByLabel('Sort by').selectOption('Price: low to high');\`",
      "\`page.getByTestId('product-price').first()\` is the first price on the page.",
    ],
    checks: [uses('check', 'Uses check()'), uses('toBeChecked', 'Uses toBeChecked()'), uses('selectOption', 'Uses selectOption()'), uses('toHaveCount', 'Checks the number of products')],
  },
  {
    id: 'keyboard',
    chapter: 'Forms & keyboard',
    title: 'Keyboard',
    startPath: 'login.html',
    intro: `
\`locator.press()\` focuses an element and presses a key:

\`\`\`ts
await page.getByLabel('Password').press('Enter');   // submit a form
await page.getByRole('tab', { name: 'Description' }).press('ArrowRight');
await page.getByLabel('Search').press('Control+A');
\`\`\`

There's also \`page.keyboard.press('Escape')\`, which sends the key to whatever is focused.

Keyboard tests catch accessibility problems that mouse-only tests miss. To check focus, use \`toBeFocused()\`.

This task has **two tests** in one file. Each test gets a fresh browser page.
`,
    task: `Write two tests:
1. **Log in with Enter**: fill the login form as \`standard@shop.test\` / \`Password123!\`, press **Enter** in the password field, and check that the **Sam Standard** button is visible.
2. **Tabs work with arrow keys**: on \`product.html?id=1\`, press **ArrowRight** on the **Description** tab, then check that the **Specifications** tab has \`aria-selected="true"\` and is focused.`,
    starter: `${IMPORT}test('log in with Enter', async ({ page }) => {
  await page.goto('login.html');
  // TODO
});

test('tabs work with arrow keys', async ({ page }) => {
  await page.goto('product.html?id=1');
  // TODO
});
`,
    solution: `${IMPORT}test('log in with Enter', async ({ page }) => {
  await page.goto('login.html');
  await page.getByLabel('Email').fill('standard@shop.test');
  await page.getByLabel('Password').fill('Password123!');
  await page.getByLabel('Password').press('Enter');

  await expect(page.getByRole('button', { name: 'Sam Standard' })).toBeVisible();
});

test('tabs work with arrow keys', async ({ page }) => {
  await page.goto('product.html?id=1');
  await page.getByRole('tab', { name: 'Description' }).press('ArrowRight');

  const specs = page.getByRole('tab', { name: 'Specifications' });
  await expect(specs).toHaveAttribute('aria-selected', 'true');
  await expect(specs).toBeFocused();
});
`,
    hints: [
      "\`await page.getByLabel('Password').press('Enter');\`",
      "Tabs have the role \`tab\`: \`page.getByRole('tab', { name: 'Description' })\`.",
    ],
    checks: [minTests(2), uses('press', 'Presses keys in both tests', 2), uses('toBeFocused', 'Checks focus with toBeFocused()')],
  },

  // ------------------------------------------------------------------ Browser features
  {
    id: 'dialogs',
    chapter: 'Browser features',
    title: 'Browser dialogs',
    startPath: 'cart.html',
    setup: { dismissOverlays: true, storage: { 'pp.cart.guest': [{ id: 3, qty: 1, size: null }] } },
    intro: `
Native dialogs (\`alert()\`, \`confirm()\`, \`prompt()\`) block the page until someone answers them. By default Playwright **dismisses** them automatically, which is like clicking *Cancel*.

To answer a dialog yourself, register a handler **before** the action that opens it:

\`\`\`ts
page.once('dialog', async (dialog) => {
  expect(dialog.message()).toContain('Are you sure');
  await dialog.accept(); // or dialog.dismiss()
});
await page.getByRole('button', { name: 'Delete' }).click();
\`\`\`

\`page.on\` handles every dialog. \`page.once\` handles only the next one.

> In Playwright Lab, call \`accept()\` or \`dismiss()\` straight away in the handler, before any other \`await\`.

For this lesson the cart already contains one item.
`,
    task: `On the cart page, click **Clear cart**. A \`confirm()\` dialog asks *"Remove all items from your cart?"*. Accept it and check that **Your cart is empty.** is visible.

Try running it **without** a dialog handler first and see what happens!`,
    starter: `${IMPORT}test('clears the cart', async ({ page }) => {
  await page.goto('cart.html');

  // TODO: handle the dialog

  await page.getByRole('button', { name: 'Clear cart' }).click();

  // TODO: the cart is empty
});
`,
    solution: `${IMPORT}test('clears the cart', async ({ page }) => {
  await page.goto('cart.html');

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Remove all items');
    await dialog.accept();
  });

  await page.getByRole('button', { name: 'Clear cart' }).click();

  await expect(page.getByText('Your cart is empty.')).toBeVisible();
});
`,
    hints: [
      'Register the handler *before* clicking, because the dialog opens during the click.',
      "\`page.once('dialog', (dialog) => dialog.accept());\`",
    ],
    checks: [{ label: 'Registers a dialog handler', test: ({ run }) => (run.calls.on ?? 0) + (run.calls.once ?? 0) > 0 }, codeHas(/\.accept\(/, 'Accepts the dialog')],
  },
  {
    id: 'iframes',
    chapter: 'Browser features',
    title: 'Working with iframes',
    startPath: 'index.html',
    intro: `
An **iframe** is a page inside a page. Locators on \`page\` don't look inside iframes, so you need to enter the frame first:

\`\`\`ts
const frame = page.frameLocator('iframe[title="Support chat"]');
await frame.getByRole('button', { name: 'Send' }).click();
\`\`\`

(\`page.locator('iframe').contentFrame()\` does the same thing.)

PracticeShop's **Chat with us** widget loads its chat window in an iframe the first time you open it. The bot answers after 1–2 seconds, and \`expect\` waits for that.
`,
    task: `Open the chat, send the message \`How much is shipping?\`, and check that the bot's reply containing \`free for orders of $50\` is visible.`,
    starter: `${IMPORT}test('chat bot answers shipping questions', async ({ page }) => {
  await page.goto('index.html');
  await page.getByRole('button', { name: 'Chat with us' }).click();

  // TODO: work inside the chat iframe
});
`,
    solution: `${IMPORT}test('chat bot answers shipping questions', async ({ page }) => {
  await page.goto('index.html');
  await page.getByRole('button', { name: 'Chat with us' }).click();

  const chat = page.frameLocator('iframe[title="Support chat"]');
  await chat.getByLabel('Message').fill('How much is shipping?');
  await chat.getByRole('button', { name: 'Send' }).click();

  await expect(chat.getByText(/free for orders of \\$50/)).toBeVisible();
});
`,
    hints: [
      "\`const chat = page.frameLocator('iframe[title=\"Support chat\"]');\`",
      "Inside the frame the input is labelled \`Message\`. In a regular expression escape the dollar sign: \`/free for orders of \\\\$50/\`. Or use a plain string: \`chat.getByText('free for orders of $50')\`.",
    ],
    checks: [{ label: 'Uses frameLocator() or contentFrame()', test: ({ run }) => (run.calls.frameLocator ?? 0) + (run.calls.contentFrame ?? 0) > 0 }],
  },
  {
    id: 'shadow-dom',
    chapter: 'Browser features',
    title: 'Shadow DOM',
    startPath: 'product.html?id=12',
    setup: { dismissOverlays: true, loggedInAs: 'standard@shop.test' },
    intro: `
Web components often hide their insides in a **shadow DOM**. Many tools can't see into it, but Playwright locators **pierce open shadow roots automatically**, so you don't need anything special.

The review form uses a \`<star-rating>\` web component. Its five stars are radio buttons inside a shadow root:

\`\`\`ts
await page.getByRole('radio', { name: '4 stars' }).click();
\`\`\`

For this lesson you're already logged in as Sam Standard.
`,
    task: `On the **Ceramic Mug** page (\`product.html?id=12\`), open the **Reviews** tab and post a 5-star review titled \`Great mug\` with the text \`Keeps my coffee warm for ages.\`. Then check that the first review (\`getByTestId('review')\`) contains \`Great mug\`.`,
    starter: `${IMPORT}test('posts a review', async ({ page }) => {
  await page.goto('product.html?id=12');

  // TODO
});
`,
    solution: `${IMPORT}test('posts a review', async ({ page }) => {
  await page.goto('product.html?id=12');
  await page.getByRole('tab', { name: /Reviews/ }).click();

  await page.getByRole('radio', { name: '5 stars' }).click();
  await page.getByLabel('Title').fill('Great mug');
  await page.getByLabel('Review', { exact: true }).fill('Keeps my coffee warm for ages.');
  await page.getByRole('button', { name: 'Submit review' }).click();

  await expect(page.getByTestId('review').first()).toContainText('Great mug');
});
`,
    hints: [
      "The tab's name includes the count, e.g. \"Reviews (1)\", so use a regex: \`getByRole('tab', { name: /Reviews/ })\`.",
      "\`getByLabel('Review')\` also matches the \"Write a review\" form, because matching is a case-insensitive substring. Add \`{ exact: true }\`.",
    ],
    checks: [codeHas(/stars?['"]/, 'Clicks a star inside the shadow DOM'), uses('toContainText', 'Checks the new review')],
  },
  {
    id: 'new-tabs',
    chapter: 'Browser features',
    title: 'New tabs',
    startPath: 'orders.html',
    setup: { dismissOverlays: true, loggedInAs: 'standard@shop.test' },
    intro: `
When a link opens a **new tab**, you get a new \`Page\` object for it. Start waiting for the new page *before* the click, then use it:

\`\`\`ts
const pagePromise = context.waitForEvent('page');
await page.getByRole('link', { name: 'Open report' }).click();
const newPage = await pagePromise;
await expect(newPage.getByRole('heading')).toHaveText('Report');
\`\`\`

\`context\` is a fixture like \`page\`. Ask for it in the test's arguments: \`async ({ page, context }) => …\`. (\`page.waitForEvent('popup')\` works too.)

You're logged in as Sam Standard, who has three past orders.
`,
    task: `On **My orders**, find the row for order \`ORD-100101\` and click its **View invoice** link. In the new tab, check that the invoice number (\`getByTestId('invoice-number')\`) is \`ORD-100101\` and the total (\`getByTestId('invoice-total')\`) is \`$123.11\`.`,
    starter: `${IMPORT}test('opens the invoice in a new tab', async ({ page, context }) => {
  await page.goto('orders.html');
  const row = page.getByRole('row').filter({ hasText: 'ORD-100101' });

  // TODO
});
`,
    solution: `${IMPORT}test('opens the invoice in a new tab', async ({ page, context }) => {
  await page.goto('orders.html');
  const row = page.getByRole('row').filter({ hasText: 'ORD-100101' });

  const pagePromise = context.waitForEvent('page');
  await row.getByRole('link', { name: 'View invoice' }).click();
  const invoice = await pagePromise;

  await expect(invoice.getByTestId('invoice-number')).toHaveText('ORD-100101');
  await expect(invoice.getByTestId('invoice-total')).toHaveText('$123.11');
});
`,
    hints: [
      "Start waiting first: \`const pagePromise = context.waitForEvent('page');\`. Don't \`await\` it yet!",
      'After clicking, \`const invoice = await pagePromise;\` and use \`invoice\` just like \`page\`.',
    ],
    checks: [uses('waitForEvent', 'Waits for the new tab')],
  },

  // ------------------------------------------------------------------ Organizing tests
  {
    id: 'hooks',
    chapter: 'Organizing tests',
    title: 'Hooks and describe',
    startPath: 'login.html',
    intro: `
When several tests need the same setup, put it in a **hook**:

\`\`\`ts
test.describe('Cart', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('index.html');
  });

  test('starts empty', async ({ page }) => { /* … */ });
  test('can add items', async ({ page }) => { /* … */ });
});
\`\`\`

- \`test.describe\` groups tests, and hooks inside it apply only to that group.
- \`test.beforeEach\` runs before **every** test, and \`test.afterEach\` after.
- Every test still gets a **fresh page**, with no cookies or storage from other tests. That's why each one has to log in.

Use \`test.step('Log in', async () => { … })\` to label parts of a long test in the report.
`,
    task: `Inside a \`test.describe('Logged-in customer', …)\` block:
- add a \`beforeEach\` hook that logs in as \`standard@shop.test\` / \`Password123!\` and waits for the **Sam Standard** button
- **Test 1:** on \`orders.html\`, \`getByTestId('order-count')\` has the text \`3 orders\`
- **Test 2:** on \`profile.html\`, the **Email** field has the value \`standard@shop.test\``,
    starter: `${IMPORT}test.describe('Logged-in customer', () => {
  test.beforeEach(async ({ page }) => {
    // TODO: log in
  });

  // TODO: two tests
});
`,
    solution: `${IMPORT}test.describe('Logged-in customer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('login.html');
    await page.getByLabel('Email').fill('standard@shop.test');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('button', { name: 'Sam Standard' })).toBeVisible();
  });

  test('sees their order history', async ({ page }) => {
    await page.goto('orders.html');
    await expect(page.getByTestId('order-count')).toHaveText('3 orders');
  });

  test('sees their email on the profile page', async ({ page }) => {
    await page.goto('profile.html');
    await expect(page.getByLabel('Email')).toHaveValue('standard@shop.test');
  });
});
`,
    hints: [
      'Copy the login steps from the "Fill in a form" lesson into the hook.',
      'Wait for the "Sam Standard" button at the end of the hook, so the tests start only after the login has finished.',
    ],
    checks: [uses('describe', 'Uses test.describe()'), uses('beforeEach', 'Uses test.beforeEach()'), minTests(2)],
  },
  {
    id: 'page-objects',
    chapter: 'Organizing tests',
    title: 'Page Object Model',
    startPath: 'login.html',
    intro: `
As a suite grows, the same locators get repeated everywhere. A **page object** is a class that keeps a page's locators and actions in one place:

\`\`\`ts
import { test, expect, type Page, type Locator } from '@playwright/test';

class SearchPage {
  readonly searchBox: Locator;

  constructor(readonly page: Page) {
    this.searchBox = page.getByLabel('Search products');
  }

  async search(text: string) {
    await this.searchBox.fill(text);
  }
}
\`\`\`

Tests then read like a description of what a user does: \`await loginPage.login(email, password)\`. If the page changes, you fix the locator in one place.

> In a real project, page objects live in their own files (\`pages/LoginPage.ts\`). Here everything goes in one file.
`,
    task: `Finish the \`LoginPage\` class and use it in both tests:
1. \`standard@shop.test\` / \`Password123!\` logs in, and the **Sam Standard** button is visible.
2. \`locked@shop.test\` / \`Password123!\` shows the error \`Your account is locked. Please contact support.\` in \`loginPage.error\`.`,
    starter: `import { test, expect, type Page, type Locator } from '@playwright/test';

class LoginPage {
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly error: Locator;

  constructor(readonly page: Page) {
    this.email = page.getByLabel('Email');
    this.password = page.getByLabel('Password');
    this.submit = page.getByRole('button', { name: 'Log in' });
    this.error = page.getByTestId('login-error');
  }

  async goto() {
    // TODO
  }

  async login(email: string, password: string) {
    // TODO
  }
}

test('valid user can log in', async ({ page }) => {
  const loginPage = new LoginPage(page);
  // TODO
});

test('locked user sees an error', async ({ page }) => {
  const loginPage = new LoginPage(page);
  // TODO
});
`,
    solution: `import { test, expect, type Page, type Locator } from '@playwright/test';

class LoginPage {
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly error: Locator;

  constructor(readonly page: Page) {
    this.email = page.getByLabel('Email');
    this.password = page.getByLabel('Password');
    this.submit = page.getByRole('button', { name: 'Log in' });
    this.error = page.getByTestId('login-error');
  }

  async goto() {
    await this.page.goto('login.html');
  }

  async login(email: string, password: string) {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }
}

test('valid user can log in', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login('standard@shop.test', 'Password123!');
  await expect(page.getByRole('button', { name: 'Sam Standard' })).toBeVisible();
});

test('locked user sees an error', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login('locked@shop.test', 'Password123!');
  await expect(loginPage.error).toHaveText('Your account is locked. Please contact support.');
});
`,
    hints: [
      "\`goto()\` is one line: \`await this.page.goto('login.html');\`",
      '\`login()\` fills both fields and clicks submit, using the locators stored on \`this\`.',
    ],
    checks: [minTests(2), codeHas(/new\s+LoginPage\s*\(/, 'Uses the LoginPage class'), codeHas(/loginPage\.login\s*\(/, 'Calls loginPage.login()')],
  },

  // ------------------------------------------------------------------ Network
  {
    id: 'mock-api',
    chapter: 'Network',
    title: 'Mock network responses',
    startPath: 'index.html',
    intro: `
The catalog loads its products with \`fetch('data/products.json')\`. With \`page.route()\` you can intercept that request and answer it yourself. That makes tests independent of the real data, and lets you test cases the real data can't produce.

\`\`\`ts
await page.route('**/data/products.json', async (route) => {
  await route.fulfill({ json: [/* your products */] });
});
await page.goto('index.html'); // register routes BEFORE the page makes the request
\`\`\`

\`**\` matches anything, including slashes. Other options are \`route.fulfill({ status: 500 })\`, \`route.abort()\` and \`route.continue()\`. To modify the real response, use \`const response = await route.fetch()\` and then \`route.fulfill({ response, json: … })\`.
`,
    task: `Mock the products request so the shop shows only the two fake products from the starter code. Then check that:
1. exactly **2** product cards are shown
2. the result count contains \`of 2 products\`
3. the **Test Teddy** card shows \`Out of stock\``,
    starter: `${IMPORT}const fakeProducts = [
  { id: 1, name: 'Test Rocket', category: 'Sports', price: 42, stock: 5, rating: 5, emoji: '🚀', color: '#e0e7ff' },
  { id: 2, name: 'Test Teddy', category: 'Home', price: 7.5, stock: 0, rating: 4, emoji: '🧸', color: '#fef3c7' },
];

test('shows mocked products', async ({ page }) => {
  // TODO: mock **/data/products.json

  await page.goto('index.html');

  // TODO: assertions
});
`,
    solution: `${IMPORT}const fakeProducts = [
  { id: 1, name: 'Test Rocket', category: 'Sports', price: 42, stock: 5, rating: 5, emoji: '🚀', color: '#e0e7ff' },
  { id: 2, name: 'Test Teddy', category: 'Home', price: 7.5, stock: 0, rating: 4, emoji: '🧸', color: '#fef3c7' },
];

test('shows mocked products', async ({ page }) => {
  await page.route('**/data/products.json', async (route) => {
    await route.fulfill({ json: fakeProducts });
  });

  await page.goto('index.html');

  await expect(page.getByTestId('product-card')).toHaveCount(2);
  await expect(page.getByTestId('result-count')).toContainText('of 2 products');
  await expect(page.getByTestId('product-card').filter({ hasText: 'Test Teddy' })).toContainText('Out of stock');
});
`,
    hints: [
      "\`await page.route('**/data/products.json', (route) => route.fulfill({ json: fakeProducts }));\`",
      'The route must be registered before \`page.goto()\`, otherwise the request has already happened.',
    ],
    checks: [uses('route', 'Uses page.route()'), uses('toHaveCount', 'Checks the number of cards')],
  },
  {
    id: 'error-state',
    chapter: 'Network',
    title: 'Simulate a server error',
    startPath: 'index.html',
    intro: `
Error handling is hard to test against a real server, because you can't make it fail on demand. With routing you can:

\`\`\`ts
await page.route('**/api/orders', (route) => route.fulfill({ status: 500, body: 'Server error' }));
\`\`\`

\`page.unroute()\` removes a route again, so later requests go to the real server. That lets you test recovery, for example a **Try again** button.

The catalog shows an alert with a **Try again** button when products fail to load.
`,
    task: `1. Make the products request return status **500**.
2. Check that the alert (\`getByRole('alert')\`) contains \`We couldn't load products\`.
3. Remove the route, click **Try again**, and check that **8** product cards appear.`,
    starter: `${IMPORT}test('recovers from a server error', async ({ page }) => {
  // TODO: make data/products.json fail

  await page.goto('index.html');

  // TODO
});
`,
    solution: `${IMPORT}test('recovers from a server error', async ({ page }) => {
  await page.route('**/data/products.json', (route) => route.fulfill({ status: 500, body: 'Server error' }));

  await page.goto('index.html');
  await expect(page.getByRole('alert')).toContainText("We couldn't load products");

  await page.unroute('**/data/products.json');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('product-card')).toHaveCount(8);
});
`,
    hints: [
      "\`route.fulfill({ status: 500, body: 'Server error' })\`",
      "Pass the same pattern to \`page.unroute('**/data/products.json')\`.",
      'The first page of the catalog shows 8 products.',
    ],
    checks: [uses('route', 'Uses page.route()'), uses('unroute', 'Uses page.unroute()'), uses('toHaveCount', 'Checks that products came back')],
  },

  // ------------------------------------------------------------------ Find the bug
  {
    id: 'bug-free-shipping',
    chapter: 'Find the bug',
    title: 'Boundary values: free shipping',
    startPath: 'product.html?id=3',
    mutation: { bugs: ['B03'], description: 'The free-shipping check uses > instead of >=' },
    intro: `
Tests exist to catch **regressions**, bugs that sneak in when code changes. In this chapter your test must:

1. ✅ **pass** on the correct shop, and
2. ❌ **fail** when we secretly switch on a bug.

The business rule:

> Standard shipping costs **$5.99** and is **free when the subtotal is $50.00 or more**.

Bugs love **boundary values**. A developer who writes \`>\` instead of \`>=\` breaks exactly one case: a subtotal of exactly $50.00. A test with a $120 order would never notice.

The **USB-C Charger** costs $25.00.
`,
    task: `Write a test that puts items worth **exactly $50.00** in the cart and checks that the cart's subtotal (\`getByTestId('subtotal')\`) is \`$50.00\` and shipping (\`getByTestId('shipping')\`) is \`Free\`.`,
    starter: `${IMPORT}test('orders of exactly $50 ship for free', async ({ page }) => {
  // TODO: add $50.00 worth of products to the cart

  await page.goto('cart.html');

  // TODO: check subtotal and shipping
});
`,
    solution: `${IMPORT}test('orders of exactly $50 ship for free', async ({ page }) => {
  await page.goto('product.html?id=3');
  await page.getByRole('button', { name: 'Increase quantity' }).click();
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByTestId('toast')).toContainText('Added 2');

  await page.goto('cart.html');

  await expect(page.getByTestId('subtotal')).toHaveText('$50.00');
  await expect(page.getByTestId('shipping')).toHaveText('Free');
});
`,
    hints: [
      'Two USB-C Chargers make $50.00. On its product page (\`product.html?id=3\`), click **Increase quantity** once, then **Add to cart**.',
      'Wait for the "Added 2 × …" toast before going to the cart, so you know the item was added.',
    ],
    checks: [uses('toHaveText', 'Checks subtotal and shipping', 2)],
  },
  {
    id: 'bug-search',
    chapter: 'Find the bug',
    title: 'Case-insensitive search',
    startPath: 'index.html',
    mutation: { bugs: ['B06'], description: 'Search became case-sensitive' },
    intro: `
Another rule from the product spec:

> Search matches product names **regardless of upper or lower case**.

Tests often use the "happy path", typing \`Mug\` exactly as the product name is spelled, and so miss bugs like this. Think about which input would show that the rule holds.
`,
    task: `Write a test that proves search is **case-insensitive**: it must pass on the correct shop and fail when search becomes case-sensitive.`,
    starter: `${IMPORT}test('search ignores letter case', async ({ page }) => {
  await page.goto('index.html');

  // TODO
});
`,
    solution: `${IMPORT}test('search ignores letter case', async ({ page }) => {
  await page.goto('index.html');

  await page.getByLabel('Search products').fill('MUG');

  await expect(page.getByTestId('product-card')).toHaveCount(1);
  await expect(page.getByTestId('product-card')).toContainText('Ceramic Mug');
});
`,
    hints: ['Search for the same word in UPPER CASE: \`MUG\`. It should still find the Ceramic Mug.'],
    checks: [uses('fill', 'Types a search')],
  },
  {
    id: 'bug-logout',
    chapter: 'Find the bug',
    title: 'Logging out really logs out',
    startPath: 'index.html',
    setup: { dismissOverlays: true, loggedInAs: 'standard@shop.test' },
    mutation: { bugs: ['B09'], description: 'Logout no longer clears the session' },
    intro: `
> After logging out, protected pages (like **My orders**) must redirect to the login page.

A test that only checks "after clicking *Log out* we land on the login page" can pass even when the user is still logged in behind the scenes. Check the **effect** that matters to users and security, not just the page that's shown right after the click.

You start this lesson logged in as Sam Standard. **Log out** is in the user menu in the header, which opens when you hover over or click your name.
`,
    task: `Log out, then try to open \`orders.html\` and check that you're sent to the login page (the URL contains \`login.html\`).`,
    starter: `${IMPORT}test('protected pages need a login after logging out', async ({ page }) => {
  await page.goto('index.html');

  // TODO: log out using the user menu

  // TODO: try to open orders.html and check you end up on the login page
});
`,
    solution: `${IMPORT}test('protected pages need a login after logging out', async ({ page }) => {
  await page.goto('index.html');

  await page.getByRole('button', { name: 'Sam Standard' }).hover();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/login\\.html/);

  await page.goto('orders.html');
  await expect(page).toHaveURL(/login\\.html/);
});
`,
    hints: [
      "Open the menu with \`page.getByRole('button', { name: 'Sam Standard' }).hover()\` (or \`.click()\`), then click the \`menuitem\` named **Log out**.",
      "After \`page.goto('orders.html')\`, assert \`await expect(page).toHaveURL(/login\\\\.html/);\`",
    ],
    checks: [uses('toHaveURL', 'Checks the URL after visiting orders.html')],
  },
];

// Extra lessons are inserted after these lessons, keeping chapter order.
const INSERT_AFTER: Record<string, string[]> = {
  'strict-mode': ['record-a-test'],
  overlays: ['list-assertions', 'soft-assertions'],
  keyboard: ['hover', 'drag-drop', 'file-upload', 'date-picker'],
  'page-objects': ['test-steps'],
  'error-state': ['api-request'],
};

export const LESSONS: Lesson[] = BASE_LESSONS.flatMap((l) => [
  l,
  ...(INSERT_AFTER[l.id] ?? []).map((id) => {
    const extra = EXTRA_LESSONS.find((x) => x.id === id);
    if (!extra) throw new Error(`Unknown lesson ${id}`);
    return extra;
  }),
]);

export const SANDBOX_EXAMPLES: { name: string; code: string }[] = [
  {
    name: 'Starter',
    code: `${IMPORT}test('my test', async ({ page }) => {
  await page.goto('index.html');
  await expect(page.getByRole('heading', { name: 'Shop all products' })).toBeVisible();
});
`,
  },
  {
    name: 'Checkout flow',
    code: `${IMPORT}test('guest can buy a mug', async ({ page }) => {
  await page.goto('product.html?id=12');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.goto('cart.html');
  await page.getByRole('link', { name: 'Proceed to checkout' }).click();

  // Checkout needs an account: log in and come back
  await page.getByLabel('Email').fill('standard@shop.test');
  await page.getByLabel('Password').fill('Password123!');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/checkout\\.html/);

  await page.getByLabel('Address', { exact: true }).fill('1 Main St');
  await page.getByLabel('City').fill('Austin');
  await page.getByLabel('Country').selectOption('United States');
  await page.getByLabel('State').selectOption('Texas');
  await page.getByLabel('ZIP code').fill('78701');
  await page.getByRole('button', { name: 'Choose date' }).click();
  await page.getByRole('dialog', { name: 'Choose date' }).getByRole('button', { disabled: false }).filter({ hasText: /^\\d+$/ }).first().click();
  await page.getByRole('button', { name: 'Continue to payment' }).click();

  await page.getByLabel('Card number').fill('4242424242424242');
  await page.getByLabel('Expiry date').fill('12/30');
  await page.getByLabel(/Security code/).fill('123');
  await page.getByRole('button', { name: 'Continue to review' }).click();

  await page.getByLabel('I agree to the Terms and Conditions').check();
  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page.getByRole('heading', { name: 'Thank you for your order!' })).toBeVisible();
});
`,
  },
  {
    name: 'Network mock',
    code: `${IMPORT}test('empty catalog', async ({ page }) => {
  await page.route('**/data/products.json', (route) => route.fulfill({ json: [] }));
  await page.goto('index.html');
  await expect(page.getByTestId('empty-state')).toContainText('No products match');
});
`,
  },
  {
    name: 'Drag and drop',
    code: `${IMPORT}test('reorder the wishlist', async ({ page }) => {
  // Log in and add three items to the wishlist
  await page.goto('login.html');
  await page.getByLabel('Email').fill('standard@shop.test');
  await page.getByLabel('Password').fill('Password123!');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('button', { name: 'Sam Standard' })).toBeVisible();

  for (const name of ['Wireless Headphones', 'Bluetooth Speaker', 'USB-C Charger']) {
    await page.getByTestId('product-card').filter({ hasText: name }).getByRole('button', { name: 'Add to wishlist' }).click();
  }

  await page.goto('wishlist.html');
  const items = page.getByTestId('wishlist-item');
  await items.nth(0).dragTo(items.nth(2));
  await expect(items.first()).toContainText('Bluetooth Speaker');
});
`,
  },
];
