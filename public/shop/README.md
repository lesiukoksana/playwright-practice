# PracticeShop: a demo store for Playwright practice

A small online shop built with plain HTML, CSS and JavaScript (ES modules). There is no backend:
all data lives in the browser's `localStorage`. Products are loaded with `fetch()` from
`data/products.json`, so you can intercept or mock that request with `page.route()`.

## Run it

PracticeShop is part of Playwright Practice Lab and is served at `/shop/` (for example
`http://localhost:5173/shop/index.html` with `npm run dev`, or `https://<user>.github.io/<repo>/shop/` on GitHub Pages).

It is plain static HTML, so any static server works too. Opening the files directly (`file://`) does **not** work,
because ES modules and `fetch()` need HTTP:

```bash
cd public/shop && python3 -m http.server 3000   # then open http://localhost:3000
```

For real Playwright, set `baseURL` to the shop folder (note the trailing slash) and use relative paths
such as `page.goto('index.html')`:

```ts
use: { baseURL: 'https://<user>.github.io/<repo>/shop/' },
```

## Test accounts

| Email | Password | Behaviour |
|---|---|---|
| `standard@shop.test` | `Password123!` | Regular customer with 3 past orders |
| `admin@shop.test` | `Admin123!` | Can open the Admin page |
| `locked@shop.test` | `Password123!` | Login fails: "Your account is locked…" |
| `slow@shop.test` | `Password123!` | Login takes 7 seconds |

You can also register new users. Use **Reset demo data** in the footer to restore everything.

Password fields are text inputs that show dots (CSS `-webkit-text-security`), not `type="password"`, so browsers
don't offer to save these fake passwords. Locate them by label: `page.getByLabel('Password')`.

## Pages

| Page | What's there |
|---|---|
| `index.html` | Catalog: search (debounced), category checkboxes, price range slider, rating select, in-stock checkbox, sort, grid/list toggle, pagination (8 per page), random 0.5–1.5 s loading delay, error state with **Try again**. Filters are kept in the URL (`?q=mug&category=Home&sort=price-asc&page=2`). |
| `product.html?id=N` | Size radio buttons (clothing), quantity stepper, add to cart, wishlist toggle, image lightbox (`<dialog>`), tabs (Description / Specifications / Reviews), review form with a shadow-DOM star rating. `?id=999` shows "Product not found". |
| `cart.html` | Change quantity, remove item, clear cart (native `confirm()`), promo codes, totals, free-shipping hint, tooltips. |
| `checkout.html` | 3 steps: Shipping → Payment → Review. Login required, redirects to the cart when the cart is empty. |
| `confirmation.html?order=…` | Order number and summary. |
| `orders.html` | Sortable table, status filter, **View invoice** opens a new tab, **Download** saves a CSV, **Cancel** (Processing orders only) uses native `confirm()`. |
| `invoice.html?order=…` | Printable invoice (opened in a new tab). |
| `wishlist.html` | Drag-and-drop reordering (HTML5 DnD), Move up/down buttons, move to cart. |
| `profile.html` | Avatar upload (PNG/JPEG ≤ 1 MB), personal details with an unsaved-changes `beforeunload` prompt, change password, delete account (native `confirm()` and then a modal that requires typing `DELETE`). |
| `admin.html` | Admin only (others get 403). Products tab: filter, add/edit in a modal, delete, bulk delete with select-all (indeterminate state). Users tab: lock/unlock users. |

## Where to practice what

| Skill | Where |
|---|---|
| Role/label locators | Everything has labels and roles. Some names repeat on purpose (every card has "Add to cart"), so scope to the card: `page.getByTestId('product-card').filter({ hasText: 'Yoga Mat' })` |
| Strict mode | `getByLabel('Quantity')` on the product page matches 3 elements. Use `getByRole('spinbutton', { name: 'Quantity' })` |
| Auto-waiting / timing | Catalog loading delay, debounced search, 2 s "Processing payment…", slow user login, toasts that disappear after 3 s, the "Added ✓" button state |
| Overlays that block clicks | Cookie banner (after 1 s) and newsletter modal (after 4 s, catalog only). Good for `page.addLocatorHandler()`, or pre-set `localStorage` |
| Auth & `storageState` | Session is in `localStorage` (`pp.session`), so `storageState` captures it. Protected pages redirect to `login.html?returnUrl=…` |
| Native dialogs | Reset demo data, clear cart, cancel order, bulk delete, delete account (`page.on('dialog')`) |
| `beforeunload` | Edit profile details and navigate away without saving |
| Custom dialogs | Product image lightbox, terms modal (the **I agree** button enables after you scroll), admin product form, delete confirmation |
| Shadow DOM | `<star-rating>` in the review form: `getByRole('radio', { name: '4 stars' })` |
| iframes | **Chat with us** widget (iframe created on first open): `page.frameLocator('iframe[title="Support chat"]')` |
| New tabs | Orders → **View invoice** (`context.waitForEvent('page')`) |
| Downloads | Orders → **Download** (`page.waitForEvent('download')`) |
| File upload | Profile picture (`setInputFiles`), with type and size validation |
| Drag and drop | Wishlist (`locator.dragTo()`) |
| Hover | User menu in the header opens on hover; tooltips (`?` icons) |
| Keyboard | Tabs (arrow keys), star rating (arrow keys), Escape closes menus and dialogs |
| Custom date picker | Checkout delivery date: weekends and out-of-range days are disabled; you can also type `YYYY-MM-DD` |
| Dependent fields | Checkout: country → state/county/province and postal code rules. Register: Business account → Company name |
| Tables | Orders (sortable, `aria-sort`), admin products (checkboxes, select-all) |
| Network mocking | `page.route('**/data/products.json', …)`: return your own products, an empty list, or a 500 to see the error state |
| Visual / responsive | Layout adapts at 900 px and 640 px |

## Business rules (use these as your test oracle)

**Cart and totals**
- Maximum quantity per product (per size) is 10, and never more than the stock.
- Standard shipping: **$5.99**, free when the subtotal (before discount) is **$50.00 or more**.
- Express delivery: adds **$9.99** on top of standard shipping.
- Tax: **8%** of (subtotal − discount). Shipping is not taxed. Amounts are rounded to cents.
- One promo code at a time. Codes are case-insensitive:

  | Code | Effect |
  |---|---|
  | `SAVE10` | 10% off the subtotal |
  | `WELCOME5` | $5 off, requires a subtotal of $30 or more |
  | `FREESHIP` | Free standard shipping |
  | `SUMMER2025` | Expired, shows an error |

**Checkout**
- US ZIP: exactly 5 digits. UK postcode: e.g. `SW1A 1AA`. Canadian postal code: e.g. `K1A 0B1`.
- Phone: 7–15 digits, optional leading `+`, spaces/dashes/brackets allowed.
- Delivery date: weekdays only; earliest is 3 days from today for Standard and 1 day for Express (moved to Monday if it falls on a weekend); latest is 30 days from today.
- Cards: Visa / Mastercard (16 digits, 3-digit CVV) or American Express (15 digits, 4-digit CVV), Luhn-valid, expiry `MM/YY` not in the past.

  | Test card | Result |
  |---|---|
  | `4242 4242 4242 4242` | Visa, succeeds |
  | `5555 5555 5555 4444` | Mastercard, succeeds |
  | `3782 822463 10005` | Amex, succeeds |
  | `4000 0000 0000 0002` | Declined at "Place order" |
  | `4242 4242 4242 4241` | Fails Luhn check |

**Accounts**
- Password: 8+ characters with uppercase, lowercase, number and special character.
- Registration: must be 18 or older; email must be unique.
- Admin product price: greater than 0, at most $10,000, max 2 decimals; stock is a whole number ≥ 0.

## Bug mode

The shop works correctly by default. To practise catching regressions, turn on known bugs:

- `?bugs=1` turns on all bugs (remembered until turned off)
- `?bugs=B02,B05` turns on specific bugs
- `?bugs=0` turns bug mode off

A red banner shows while bug mode is on. The bug list is in [BUGS.md](BUGS.md). Try writing your
tests first and only look at the list afterwards.

## Test hooks

- `data-testid` is used only where roles and labels aren't enough: `product-card`, `product-price`,
  `cart-count`, `toast`, `result-count`, `cart-item`, `subtotal`, `discount`, `shipping`, `tax`, `total`,
  `order-number`, `invoice-number`, `wishlist-item`, `cookie-banner`, `newsletter-popup`, `bug-banner`, `user-menu`, and a few others.
- Every `localStorage` key starts with `pp.` (`pp.session`, `pp.users`, `pp.cart.<email>`,
  `pp.orders.<email>`, `pp.productOverrides`, `pp.cookieConsent`, `pp.newsletterDismissed`, `pp.bugs`, …),
  so you can seed state in `addInitScript` or `storageState`.

## Project structure

```
index.html … admin.html   one HTML file per page
chat.html                 support chat (loaded in an iframe)
css/styles.css
data/products.json        25 products
js/store.js               data layer: storage, users, session, cart, pricing, orders, bug flags
js/layout.js              header, footer, toasts, cookie banner, newsletter, chat widget, auth guard
js/forms.js               validation helpers
js/ui.js                  shared UI helpers (tabs, confirm modal, download, totals)
js/components/            <star-rating> (shadow DOM), date picker
js/pages/                 one script per page
```

Passwords are stored in plain text in `localStorage`. This is a demo, so never reuse real credentials.
