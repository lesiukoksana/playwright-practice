import { codeHas, minTests, uses, type Lesson } from './types';

const IMPORT = "import { test, expect } from '@playwright/test';\n\n";

/** Lessons for the recorder, more assertions, mouse/files/widgets, steps and API testing. */
export const EXTRA_LESSONS: Lesson[] = [
  // ------------------------------------------------------------------ Locators
  {
    id: 'record-a-test',
    chapter: 'Locators',
    title: 'Record a test',
    startPath: 'index.html',
    intro: `
Writing every locator by hand is slow. Playwright has a **test generator** (\`npx playwright codegen\`) that watches you use the app and writes the code. This lab has one too: the **Record** button above the browser.

1. Put the cursor in the editor where the code should go (or don't, and it goes at the end of the test).
2. Click **Record** and use the app: click, type, choose options.
3. To check something, click **Assert visible**, **Assert text** or **Assert value**, then click the element.
4. Click **Stop**.

The recorder picks locators the way you've learned: roles, labels, and \`filter()\` for repeated elements like "Add to cart".

> **Always read recorded code.** It records *everything* you did, including extra clicks, and it can't know what you meant to check. Treat it as a first draft: delete the noise and add the assertions that matter.
`,
    task: `Use **Record** to create a test that adds **Bluetooth Speaker** to the cart and checks that the cart badge (\`getByTestId('cart-count')\`) shows \`1\`.

Then look at the recorded locator for the button. Why does it need \`filter()\`?`,
    starter: `${IMPORT}test('adds the speaker to the cart', async ({ page }) => {
  await page.goto('index.html');
  // Click Record above the browser and use the app.
  // Your actions will appear here.
});
`,
    solution: `${IMPORT}test('adds the speaker to the cart', async ({ page }) => {
  await page.goto('index.html');
  await page.getByTestId('product-card').filter({ hasText: 'Bluetooth Speaker' }).getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByTestId('cart-count')).toHaveText('1');
});
`,
    hints: [
      'Click **Record**, then click **Add to cart** on the Bluetooth Speaker card in the browser.',
      'For the check, click **Assert text** and then the small number on the Cart link in the header. Then click **Stop** and **Run**.',
    ],
    checks: [uses('click', 'Clicks Add to cart'), uses('toHaveText', 'Checks the badge text')],
  },

  // ------------------------------------------------------------------ More assertions
  {
    id: 'list-assertions',
    chapter: 'More assertions',
    title: 'Checking lists',
    startPath: 'index.html',
    intro: `
When a locator matches **many** elements, \`toHaveText\` can check all of them at once, **in order**:

\`\`\`ts
await expect(page.getByRole('listitem')).toHaveText(['Apples', 'Bananas', 'Cherries']);
\`\`\`

It retries until the list matches exactly, so it's the best way to test sorting and filtering.

If you need the texts as plain values, for example to compare them in your own code, use \`allTextContents()\`. It returns **right away without waiting**, so call it only after an auto-waiting assertion has confirmed the page is ready:

\`\`\`ts
const prices = await page.getByTestId('product-price').allTextContents();
expect(prices).toEqual(['$9.99', '$12.00']);
\`\`\`
`,
    task: `In the catalog, check the **Books** category and sort by **Name: A to Z**. Then:
1. Check that the product names (the headings inside \`getByTestId('product-card')\`) are exactly: \`Clean Locators\`, \`JavaScript Basics\`, \`Mystery of the Flaky Test\`, \`The Pragmatic Tester\`.
2. Read all prices with \`allTextContents()\` and check they equal \`['$24.99', '$29.00', '$9.99', '$34.99']\`.`,
    starter: `${IMPORT}test('books are sorted by name', async ({ page }) => {
  await page.goto('index.html');
  await page.getByLabel('Books').check();
  await page.getByLabel('Sort by').selectOption('Name: A to Z');

  // TODO: check the four names in order

  // TODO: read the prices and compare them
});
`,
    solution: `${IMPORT}test('books are sorted by name', async ({ page }) => {
  await page.goto('index.html');
  await page.getByLabel('Books').check();
  await page.getByLabel('Sort by').selectOption('Name: A to Z');

  const names = page.getByTestId('product-card').getByRole('heading');
  await expect(names).toHaveText(['Clean Locators', 'JavaScript Basics', 'Mystery of the Flaky Test', 'The Pragmatic Tester']);

  const prices = await page.getByTestId('product-price').allTextContents();
  expect(prices).toEqual(['$24.99', '$29.00', '$9.99', '$34.99']);
});
`,
    hints: [
      "\`page.getByTestId('product-card').getByRole('heading')\` matches the four product names.",
      'Do the toHaveText([...]) check first. It waits for the list, so allTextContents() afterwards reads the final list.',
    ],
    checks: [codeHas(/toHaveText\(\s*\[/, 'Checks the whole list with toHaveText([...])'), uses('allTextContents', 'Reads the prices with allTextContents()'), uses('toEqual', 'Compares the prices with toEqual()')],
  },
  {
    id: 'soft-assertions',
    chapter: 'More assertions',
    title: 'Soft assertions',
    startPath: 'cart.html',
    setup: { dismissOverlays: true, storage: { 'pp.cart.guest': [{ id: 1, qty: 1, size: null }] } },
    mutation: { bugs: ['B02'], description: 'Tax is calculated before the discount' },
    intro: `
A normal assertion **stops the test** when it fails. That's usually what you want, but when you check several independent values (like the lines of an invoice), one failure hides the others.

A **soft assertion** records the failure and lets the test continue. The test still fails at the end, but the report lists *every* wrong value:

\`\`\`ts
await expect.soft(page.getByTestId('subtotal')).toHaveText('$10.00');
await expect.soft(page.getByTestId('total')).toHaveText('$12.00');
\`\`\`

The cart already contains **Wireless Headphones** ($89.99). The rules:
- \`SAVE10\` gives 10% off the subtotal
- shipping is free from $50.00
- tax is **8% of (subtotal − discount)**

This is also a "find the bug" lesson: your test runs a second time with a pricing bug switched on, and it must catch it.
`,
    task: `Apply the promo code \`SAVE10\`, then use **soft assertions** to check every line of the summary:

| Test id | Expected |
|---|---|
| \`subtotal\` | \`$89.99\` |
| \`discount\` | contains \`$9.00\` |
| \`shipping\` | \`Free\` |
| \`tax\` | \`$6.48\` |
| \`total\` | \`$87.47\` |`,
    starter: `${IMPORT}test('cart totals with SAVE10', async ({ page }) => {
  await page.goto('cart.html');
  await page.getByLabel('Promo code').fill('SAVE10');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByTestId('applied-promo')).toBeVisible();

  // TODO: one expect.soft(...) per summary line
});
`,
    solution: `${IMPORT}test('cart totals with SAVE10', async ({ page }) => {
  await page.goto('cart.html');
  await page.getByLabel('Promo code').fill('SAVE10');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByTestId('applied-promo')).toBeVisible();

  await expect.soft(page.getByTestId('subtotal')).toHaveText('$89.99');
  await expect.soft(page.getByTestId('discount')).toContainText('$9.00');
  await expect.soft(page.getByTestId('shipping')).toHaveText('Free');
  await expect.soft(page.getByTestId('tax')).toHaveText('$6.48');
  await expect.soft(page.getByTestId('total')).toHaveText('$87.47');
});
`,
    hints: [
      "\`await expect.soft(page.getByTestId('tax')).toHaveText('$6.48');\`",
      'The discount line starts with a special minus sign (−), so use toContainText(\'$9.00\') for it.',
    ],
    checks: [{ label: 'Uses expect.soft() at least 4 times', test: ({ code }) => (code.match(/expect\.soft\(/g) ?? []).length >= 4 }],
  },

  // ------------------------------------------------------------------ Mouse, files & widgets
  {
    id: 'hover',
    chapter: 'Mouse, files & widgets',
    title: 'Hover menus',
    startPath: 'index.html',
    setup: { dismissOverlays: true, loggedInAs: 'standard@shop.test' },
    intro: `
Some UI only appears while the mouse is over it: dropdown menus, tooltips, "quick view" buttons. \`locator.hover()\` moves the mouse onto an element. Like \`click()\`, it first waits until the element is visible and not covered.

\`\`\`ts
await page.getByRole('button', { name: 'Account' }).hover();
await expect(page.getByRole('menuitem', { name: 'Settings' })).toBeVisible();
\`\`\`

To make a hover menu close again, hover over something else.

Menu buttons often report their state with \`aria-expanded\`, which you can check with \`toHaveAttribute\`.

You start this lesson logged in as Sam Standard. His name in the header opens the account menu.

> Playwright Lab fires real mouse events, but it can't trigger CSS-only \`:hover\` styles. Real Playwright can.
`,
    task: `1. Check that the **Profile** menu item is hidden.
2. Hover over the **Sam Standard** button. Check that **Profile** is visible and the button has \`aria-expanded="true"\`.
3. Hover over the **Shop all products** heading and check that **Profile** is hidden again.`,
    starter: `${IMPORT}test('account menu opens on hover', async ({ page }) => {
  await page.goto('index.html');
  const menuButton = page.getByRole('button', { name: 'Sam Standard' });
  const profile = page.getByRole('menuitem', { name: 'Profile' });

  // TODO
});
`,
    solution: `${IMPORT}test('account menu opens on hover', async ({ page }) => {
  await page.goto('index.html');
  const menuButton = page.getByRole('button', { name: 'Sam Standard' });
  const profile = page.getByRole('menuitem', { name: 'Profile' });

  await expect(profile).toBeHidden();

  await menuButton.hover();
  await expect(profile).toBeVisible();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true');

  await page.getByRole('heading', { name: 'Shop all products' }).hover();
  await expect(profile).toBeHidden();
});
`,
    hints: [
      '\`await menuButton.hover();\` opens the menu.',
      'The menu closes shortly after the mouse leaves it. toBeHidden() waits for that.',
    ],
    checks: [uses('hover', 'Hovers twice', 2), uses('toBeHidden', 'Checks the menu is hidden before and after', 2), uses('toHaveAttribute', 'Checks aria-expanded')],
  },
  {
    id: 'drag-drop',
    chapter: 'Mouse, files & widgets',
    title: 'Drag and drop',
    startPath: 'wishlist.html',
    setup: { dismissOverlays: true, loggedInAs: 'standard@shop.test', storage: { 'pp.wishlist.standard@shop.test': [1, 2, 3] } },
    intro: `
\`locator.dragTo(target)\` drags one element and drops it on another:

\`\`\`ts
await page.getByText('Task A').dragTo(page.getByText('Done'));
\`\`\`

The wishlist lets you reorder items by dragging them. Dropping an item on another item moves it to that position.

Check the order before **and** after the drag. Otherwise you can't tell whether the drag changed anything.

You're logged in as Sam Standard, and his wishlist has three items: **Wireless Headphones**, **Bluetooth Speaker** and **USB-C Charger**.
`,
    task: `On the wishlist page:
1. Check that the item names (links inside \`getByTestId('wishlist-item')\`) are in the order *Wireless Headphones, Bluetooth Speaker, USB-C Charger*.
2. Drag **Wireless Headphones** onto **USB-C Charger**.
3. Check the new order: *Bluetooth Speaker, USB-C Charger, Wireless Headphones*.`,
    starter: `${IMPORT}test('reorders the wishlist', async ({ page }) => {
  await page.goto('wishlist.html');
  const items = page.getByTestId('wishlist-item');

  // TODO
});
`,
    solution: `${IMPORT}test('reorders the wishlist', async ({ page }) => {
  await page.goto('wishlist.html');
  const items = page.getByTestId('wishlist-item');
  await expect(items.getByRole('link')).toHaveText(['Wireless Headphones', 'Bluetooth Speaker', 'USB-C Charger']);

  await items.filter({ hasText: 'Wireless Headphones' }).dragTo(items.filter({ hasText: 'USB-C Charger' }));

  await expect(items.getByRole('link')).toHaveText(['Bluetooth Speaker', 'USB-C Charger', 'Wireless Headphones']);
});
`,
    hints: [
      "Pick items by name: \`items.filter({ hasText: 'Wireless Headphones' })\`.",
      "\`await source.dragTo(target);\`, then check the list again with \`toHaveText([...])\`.",
    ],
    checks: [uses('dragTo', 'Uses dragTo()'), uses('toHaveText', 'Checks the order before and after', 2)],
  },
  {
    id: 'file-upload',
    chapter: 'Mouse, files & widgets',
    title: 'Uploading files',
    startPath: 'profile.html',
    setup: { dismissOverlays: true, loggedInAs: 'standard@shop.test' },
    intro: `
\`locator.setInputFiles()\` picks files for an \`<input type="file">\`, with no file dialog. In real Playwright you usually pass a path on disk. You can also pass the file's content directly:

\`\`\`ts
await page.getByLabel('Attachment').setInputFiles({
  name: 'notes.txt',
  mimeType: 'text/plain',
  buffer: Buffer.from('Hello!'),
});
\`\`\`

(Playwright Lab runs in the browser and has no disk, so it only supports this second form.)

The input is often hidden behind a styled button or label. That's fine, because \`setInputFiles\` doesn't need it to be visible.

The profile page accepts **PNG or JPEG images up to 1 MB**. The starter code contains a tiny valid PNG image as a base64 string.
`,
    task: `Write two tests on the profile page:
1. **Upload a picture:** upload \`avatar.png\` (\`image/png\`, from the \`PNG\` constant) using the **Upload picture** field. Check that an image named **Your profile picture** is visible.
2. **Reject other files:** upload \`notes.txt\` (\`text/plain\`, content \`hello\`). Check that \`Only PNG and JPEG images are allowed.\` is visible.`,
    starter: `${IMPORT}// A 1×1 pixel PNG image, base64-encoded.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('uploads a profile picture', async ({ page }) => {
  await page.goto('profile.html');
  // TODO
});

test('rejects a text file', async ({ page }) => {
  await page.goto('profile.html');
  // TODO
});
`,
    solution: `${IMPORT}// A 1×1 pixel PNG image, base64-encoded.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('uploads a profile picture', async ({ page }) => {
  await page.goto('profile.html');
  await page.getByLabel('Upload picture').setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG, 'base64'),
  });
  await expect(page.getByRole('img', { name: 'Your profile picture' })).toBeVisible();
});

test('rejects a text file', async ({ page }) => {
  await page.goto('profile.html');
  await page.getByLabel('Upload picture').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello'),
  });
  await expect(page.getByText('Only PNG and JPEG images are allowed.')).toBeVisible();
});
`,
    hints: [
      "The file input is labelled **Upload picture**: \`page.getByLabel('Upload picture')\`.",
      "For the image, decode the base64 string: \`buffer: Buffer.from(PNG, 'base64')\`.",
    ],
    checks: [minTests(2), uses('setInputFiles', 'Uploads a file in both tests', 2)],
  },
  {
    id: 'date-picker',
    chapter: 'Mouse, files & widgets',
    title: 'Date pickers and time',
    startPath: 'checkout.html',
    setup: { dismissOverlays: true, loggedInAs: 'standard@shop.test', storage: { 'pp.cart.standard@shop.test': [{ id: 3, qty: 1, size: null }] } },
    intro: `
Date pickers depend on **today's date**, so a test that passes today may fail next week. Playwright can control time: \`page.clock.setFixedTime()\` freezes \`Date\` in the page. Call it **before** opening the page:

\`\`\`ts
await page.clock.setFixedTime(new Date('2026-03-04T10:00:00'));
await page.goto('checkout.html');
\`\`\`

The checkout's **Choose date** button opens a calendar (\`getByRole('dialog', { name: 'Choose date' })\`). Each day is a button named like *"Monday, March 9, 2026"*.

The rules for **standard** delivery:
- no weekends
- the earliest date is 3 days from today. If that's a weekend, it moves to the next Monday.

With "today" frozen on **Wednesday, March 4, 2026**, the earliest delivery day is **Monday, March 9**.

You're logged in and there's a USB-C Charger in your cart.
`,
    task: `Freeze time at \`2026-03-04T10:00:00\` and open the checkout. In the date picker:
1. Check that **Friday, March 6, 2026** (too early) and **Saturday, March 7, 2026** (weekend) are disabled.
2. Click **Monday, March 9, 2026**.
3. Check that the **Preferred delivery date** field has the value \`2026-03-09\`.`,
    starter: `${IMPORT}test('picks the earliest delivery date', async ({ page }) => {
  // TODO: freeze time, then open checkout.html

  await page.getByRole('button', { name: 'Choose date' }).click();
  const calendar = page.getByRole('dialog', { name: 'Choose date' });

  // TODO
});
`,
    solution: `${IMPORT}test('picks the earliest delivery date', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-03-04T10:00:00'));
  await page.goto('checkout.html');

  await page.getByRole('button', { name: 'Choose date' }).click();
  const calendar = page.getByRole('dialog', { name: 'Choose date' });

  await expect(calendar.getByRole('button', { name: 'Friday, March 6, 2026' })).toBeDisabled();
  await expect(calendar.getByRole('button', { name: 'Saturday, March 7, 2026' })).toBeDisabled();

  await calendar.getByRole('button', { name: 'Monday, March 9, 2026' }).click();
  await expect(page.getByLabel('Preferred delivery date')).toHaveValue('2026-03-09');
});
`,
    hints: [
      "\`await page.clock.setFixedTime(new Date('2026-03-04T10:00:00'));\` must come before \`page.goto()\`.",
      "Days are buttons: \`calendar.getByRole('button', { name: 'Saturday, March 7, 2026' })\`. Check them with \`toBeDisabled()\`.",
    ],
    checks: [uses('clock.setFixedTime', 'Freezes time with page.clock.setFixedTime()'), uses('toBeDisabled', 'Checks two days are disabled', 2), uses('toHaveValue', 'Checks the chosen date')],
  },

  // ------------------------------------------------------------------ Organizing tests
  {
    id: 'test-steps',
    chapter: 'Organizing tests',
    title: 'Test steps',
    startPath: 'product.html?id=21',
    intro: `
Long tests are hard to read in a report. \`test.step()\` groups actions under a name you choose:

\`\`\`ts
await test.step('Log in', async () => {
  await page.getByLabel('Email').fill('…');
  await page.getByRole('button', { name: 'Log in' }).click();
});
\`\`\`

In the Results panel (and Playwright's HTML report), each step shows as one collapsible line. When something fails, you see straight away *which step* broke.

The rules for this task:
- \`WELCOME5\` takes $5 off orders of $30 or more.
- Shipping is $5.99 below $50.
- Tax is 8% of (subtotal − discount).
- The **Yoga Mat** costs $30.00.
`,
    task: `Write a test with three steps:
1. **Add the yoga mat to the cart:** on \`product.html?id=21\`, click **Add to cart** and check that the cart badge shows \`1\`.
2. **Apply WELCOME5:** on the cart page, apply the promo code and check that \`getByTestId('applied-promo')\` contains \`WELCOME5\`.
3. **Check the total:** the total (\`getByTestId('total')\`) is \`$32.99\`.`,
    starter: `${IMPORT}test('buying a yoga mat with a promo code', async ({ page }) => {
  await test.step('Add the yoga mat to the cart', async () => {
    // TODO
  });

  // TODO: two more steps
});
`,
    solution: `${IMPORT}test('buying a yoga mat with a promo code', async ({ page }) => {
  await test.step('Add the yoga mat to the cart', async () => {
    await page.goto('product.html?id=21');
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByTestId('cart-count')).toHaveText('1');
  });

  await test.step('Apply WELCOME5', async () => {
    await page.goto('cart.html');
    await page.getByLabel('Promo code').fill('WELCOME5');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByTestId('applied-promo')).toContainText('WELCOME5');
  });

  await test.step('Check the total', async () => {
    await expect(page.getByTestId('total')).toHaveText('$32.99');
  });
});
`,
    hints: [
      "The promo field is labelled **Promo code**, and the button is called **Apply**.",
      '$30.00 − $5.00 + $5.99 shipping + $2.00 tax = $32.99.',
    ],
    checks: [uses('step', 'Uses test.step() three times', 3)],
  },

  // ------------------------------------------------------------------ Network
  {
    id: 'api-request',
    chapter: 'Network',
    title: 'API testing with request',
    startPath: 'index.html',
    intro: `
Playwright can also call HTTP endpoints directly, without a page. Use the **\`request\`** fixture:

\`\`\`ts
test('API works', async ({ request }) => {
  const response = await request.get('api/users');
  expect(response.ok()).toBeTruthy();
  const users = await response.json();
  expect(users).toHaveLength(3);
});
\`\`\`

API calls are much faster than clicking through pages. Teams use them to check back-end responses, and to set up data before UI tests.

PracticeShop has one "API": \`data/products.json\`, the product list the catalog loads. You can use \`request\` and \`page\` in the same test and compare what the API says with what the page shows.
`,
    task: `Write two tests:
1. **API:** get \`data/products.json\`, check that the response is OK, that it contains **25** products, and that the first product matches \`{ name: 'Wireless Headphones', price: 89.99 }\`.
2. **API and UI agree:** get the products with \`request\`, open the catalog, and check that the result count contains \`of <number of products> products\`.`,
    starter: `${IMPORT}test('products API returns the catalog', async ({ request }) => {
  // TODO
});

test('the catalog shows every product from the API', async ({ page, request }) => {
  // TODO
});
`,
    solution: `${IMPORT}test('products API returns the catalog', async ({ request }) => {
  const response = await request.get('data/products.json');
  expect(response.ok()).toBeTruthy();

  const products = await response.json();
  expect(products).toHaveLength(25);
  expect(products[0]).toMatchObject({ name: 'Wireless Headphones', price: 89.99 });
});

test('the catalog shows every product from the API', async ({ page, request }) => {
  const products = await (await request.get('data/products.json')).json();

  await page.goto('index.html');
  await expect(page.getByTestId('result-count')).toContainText(\`of \${products.length} products\`);
});
`,
    hints: [
      "\`const response = await request.get('data/products.json');\`, then \`await response.json()\`.",
      'toMatchObject() checks only the properties you list. The product has more, and that\'s fine.',
      'Build the expected text with a template string: \\`of \\${products.length} products\\`.',
    ],
    checks: [minTests(2), uses('request.get', 'Calls the API with request.get()', 2), uses('toMatchObject', 'Uses toMatchObject()')],
  },
];
