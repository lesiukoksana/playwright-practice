// Data layer: everything is kept in localStorage under the "pp." prefix.
// There is no backend. Products are fetched from data/products.json so the
// request can be intercepted or mocked with page.route().

const PREFIX = 'pp.';

export const storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  },
  remove(key) {
    localStorage.removeItem(PREFIX + key);
  },
};

/** Removes all demo data except the bug-mode setting. */
export function resetAllData() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith(PREFIX) && k !== PREFIX + 'bugs')
    .forEach((k) => localStorage.removeItem(k));
  sessionStorage.clear();
}

// ---------------------------------------------------------------- utilities

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const moneyFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const money = (n) => moneyFormat.format(n);

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export const params = () => new URLSearchParams(location.search);

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function randomToken() {
  return Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join('');
}

/** Accepts only local page names such as "orders.html?x=1" to avoid open redirects. */
export function safeReturnUrl(value, fallback = 'index.html') {
  return value && /^[a-z0-9-]+\.html(\?[^#]*)?$/i.test(value) ? value : fallback;
}

// ---------------------------------------------------------------- bug mode
// ?bugs=1 (or all) turns on every bug, ?bugs=B02,B05 turns on specific ones,
// ?bugs=0 turns bug mode off. The choice is remembered in localStorage.

export const BUG_IDS = ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'B09', 'B10', 'B11', 'B12'];

(function applyBugParam() {
  const value = new URLSearchParams(location.search).get('bugs');
  if (value === null) return;
  const v = value.trim().toLowerCase();
  if (['0', 'off', 'false', 'none'].includes(v)) storage.remove('bugs');
  else if (['1', 'on', 'true', 'all'].includes(v)) storage.set('bugs', 'all');
  else storage.set('bugs', v.split(',').map((s) => s.trim().toUpperCase()).filter((s) => BUG_IDS.includes(s)));
})();

export function activeBugs() {
  const b = storage.get('bugs');
  if (b === 'all') return [...BUG_IDS];
  return Array.isArray(b) ? b : [];
}

export const bug = (id) => activeBugs().includes(id);

// ---------------------------------------------------------------- flash messages (survive one navigation)

export function setFlash(message, type = 'success') {
  sessionStorage.setItem(PREFIX + 'flash', JSON.stringify({ message, type }));
}

export function takeFlash() {
  const raw = sessionStorage.getItem(PREFIX + 'flash');
  sessionStorage.removeItem(PREFIX + 'flash');
  return raw ? JSON.parse(raw) : null;
}

// ---------------------------------------------------------------- users

const SEED_USERS = [
  { email: 'standard@shop.test', password: 'Password123!', firstName: 'Sam', lastName: 'Standard', phone: '+1 415 555 0101', role: 'user', status: 'active' },
  { email: 'admin@shop.test', password: 'Admin123!', firstName: 'Ada', lastName: 'Admin', phone: '', role: 'admin', status: 'active' },
  { email: 'locked@shop.test', password: 'Password123!', firstName: 'Lou', lastName: 'Locked', phone: '', role: 'user', status: 'locked' },
  { email: 'slow@shop.test', password: 'Password123!', firstName: 'Sid', lastName: 'Slow', phone: '', role: 'user', status: 'active', slow: true },
];

export function getUsers() {
  const users = storage.get('users');
  if (users) return users;
  storage.set('users', SEED_USERS);
  return structuredClone(SEED_USERS);
}

export const saveUsers = (users) => storage.set('users', users);

export function findUser(email) {
  return getUsers().find((u) => u.email === String(email).trim().toLowerCase()) ?? null;
}

export function registerUser(data) {
  const users = getUsers();
  const email = data.email.trim().toLowerCase();
  if (users.some((u) => u.email === email)) throw new Error('An account with this email already exists.');
  users.push({ ...data, email, phone: '', role: 'user', status: 'active', createdAt: new Date().toISOString() });
  saveUsers(users);
}

export function updateUser(email, changes) {
  const users = getUsers();
  const user = users.find((u) => u.email === email);
  if (!user) throw new Error('User not found.');
  Object.assign(user, changes);
  saveUsers(users);
  return user;
}

export function deleteUser(email) {
  saveUsers(getUsers().filter((u) => u.email !== email));
  ['cart.', 'promo.', 'orders.', 'wishlist.'].forEach((k) => storage.remove(k + email));
}

export const fullName = (u) => [u.firstName, u.lastName].filter(Boolean).join(' ');

// ---------------------------------------------------------------- session

export function getSession() {
  const session = storage.get('session');
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    storage.remove('session');
    return null;
  }
  return session;
}

export function currentUser() {
  const session = getSession();
  if (!session) return null;
  return getUsers().find((u) => u.email === session.email) ?? null;
}

export async function login(emailInput, password, remember = false) {
  // B12: email comparison is case-sensitive.
  const email = bug('B12') ? emailInput.trim() : emailInput.trim().toLowerCase();
  const user = getUsers().find((u) => u.email === email);
  await delay(user?.slow ? 7000 : 500);
  if (!user || user.password !== password) throw new Error('Invalid email or password.');
  if (user.status === 'locked') throw new Error('Your account is locked. Please contact support.');
  const days = remember ? 30 : 1;
  storage.set('session', { email: user.email, token: randomToken(), expiresAt: Date.now() + days * 86_400_000 });
  mergeGuestCart(user.email);
  return user;
}

export function logout() {
  // B09: the session is not removed, so the user stays logged in.
  if (!bug('B09')) storage.remove('session');
}

// ---------------------------------------------------------------- products

const EMPTY_OVERRIDES = { added: [], updated: {}, deleted: [] };

export const getOverrides = () => storage.get('productOverrides', structuredClone(EMPTY_OVERRIDES));
export const saveOverrides = (o) => storage.set('productOverrides', o);

export async function loadProducts() {
  const res = await fetch('data/products.json');
  if (!res.ok) throw new Error(`Failed to load products (HTTP ${res.status}).`);
  const base = await res.json();
  if (!Array.isArray(base)) throw new Error('Unexpected products response.');
  const o = getOverrides();
  return [...base, ...o.added]
    .filter((p) => !o.deleted.includes(p.id))
    .map((p) => ({ reviews: [], specs: {}, ...p, ...(o.updated[p.id] ?? {}) }));
}

export const CATEGORIES = ['Electronics', 'Clothing', 'Home', 'Books', 'Sports'];

// ---------------------------------------------------------------- reviews

export const getUserReviews = (productId) => storage.get('reviews.' + productId, []);

export function addReview(productId, review) {
  const list = getUserReviews(productId);
  list.unshift(review);
  storage.set('reviews.' + productId, list);
}

// ---------------------------------------------------------------- cart

export const PRICING = { shipping: 5.99, express: 9.99, freeShippingMin: 50, taxRate: 0.08, maxQty: 10 };

const owner = () => getSession()?.email ?? 'guest';

export const getCart = () => storage.get('cart.' + owner(), []);

export function saveCart(items, { notify = true } = {}) {
  storage.set('cart.' + owner(), items);
  if (notify) window.dispatchEvent(new CustomEvent('cart:change'));
}

export const cartCount = () => getCart().reduce((n, i) => n + i.qty, 0);

/** Maximum quantity of one product (per size) a customer may have in the cart. */
export function qtyLimit(product) {
  // B10: the stock level is ignored.
  return bug('B10') ? PRICING.maxQty : Math.min(product.stock, PRICING.maxQty);
}

export function addToCart(product, qty, size = null) {
  if (product.stock === 0) return { error: 'This product is out of stock.' };
  const items = getCart();
  const existing = items.find((i) => i.id === product.id && (i.size ?? null) === (size ?? null));
  const already = existing?.qty ?? 0;
  const limit = qtyLimit(product);
  if (already + qty > limit) {
    const left = limit - already;
    return {
      error: left > 0
        ? `You can add only ${left} more of this item.`
        : 'You already have the maximum quantity of this item in your cart.',
    };
  }
  if (existing) existing.qty += qty;
  else items.push({ id: product.id, size: size ?? null, qty });
  saveCart(items);
  return { added: qty };
}

function mergeGuestCart(email) {
  const guest = storage.get('cart.guest', []);
  if (!guest.length) return;
  const cart = storage.get('cart.' + email, []);
  for (const g of guest) {
    const match = cart.find((i) => i.id === g.id && i.size === g.size);
    if (match) match.qty = Math.min(match.qty + g.qty, PRICING.maxQty);
    else cart.push(g);
  }
  storage.set('cart.' + email, cart);
  storage.remove('cart.guest');
}

export const getPromo = () => storage.get('promo.' + owner(), null);
export const savePromo = (code) => (code ? storage.set('promo.' + owner(), code) : storage.remove('promo.' + owner()));

export const PROMO_CODES = {
  SAVE10: { kind: 'percent', value: 10, description: '10% off your order' },
  WELCOME5: { kind: 'fixed', value: 5, min: 30, description: '$5 off orders of $30 or more' },
  FREESHIP: { kind: 'shipping', description: 'Free standard shipping' },
  SUMMER2025: { expired: true },
};

export function validatePromo(input, subtotal) {
  const code = String(input ?? '').trim().toUpperCase();
  if (!code) return { error: 'Enter a promo code.' };
  const promo = PROMO_CODES[code];
  if (!promo) return { error: 'This promo code is not valid.' };
  if (promo.expired) return { error: 'This promo code has expired.' };
  if (promo.min && subtotal < promo.min) return { error: `This code requires a subtotal of ${money(promo.min)} or more.` };
  return { code, ...promo };
}

/**
 * lines: [{ price, qty }]. Business rules:
 * - free standard shipping when subtotal (before discount) >= $50, or with FREESHIP
 * - express delivery adds $9.99 on top of standard shipping
 * - tax is 8% of (subtotal - discount); shipping is not taxed
 */
export function calcTotals(lines, promoCode = null, delivery = 'standard') {
  const subtotal = round2(lines.reduce((sum, l) => sum + l.price * l.qty, 0));
  const promoResult = promoCode ? validatePromo(promoCode, subtotal) : null;
  const promo = promoResult && !promoResult.error ? promoResult : null;

  let discount = 0;
  if (promo?.kind === 'percent') discount = round2((subtotal * promo.value) / 100);
  if (promo?.kind === 'fixed') discount = Math.min(promo.value, subtotal);

  // B03: boundary bug, exactly $50 does not qualify.
  const qualifiesFree = bug('B03') ? subtotal > PRICING.freeShippingMin : subtotal >= PRICING.freeShippingMin;
  let shipping = 0;
  if (lines.length) {
    shipping = qualifiesFree || promo?.kind === 'shipping' ? 0 : PRICING.shipping;
    if (delivery === 'express') shipping = round2(shipping + PRICING.express);
  }

  // B02: tax calculated before the discount.
  const taxable = bug('B02') ? subtotal : subtotal - discount;
  const tax = round2(taxable * PRICING.taxRate);
  const total = round2(subtotal - discount + shipping + tax);

  return {
    subtotal, discount, shipping, tax, total, promo,
    promoError: promoResult?.error ?? null,
    freeShippingRemaining: Math.max(0, round2(PRICING.freeShippingMin - subtotal)),
  };
}

// ---------------------------------------------------------------- wishlist

export const getWishlist = () => storage.get('wishlist.' + owner(), []);
export const saveWishlist = (ids) => storage.set('wishlist.' + owner(), ids);

export function toggleWishlist(id) {
  const list = getWishlist();
  const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  saveWishlist(next);
  return next.includes(id);
}

// ---------------------------------------------------------------- orders

const SEED_ADDRESS = {
  fullName: 'Sam Standard', address1: '500 Market St', address2: '', city: 'San Francisco',
  country: 'US', region: 'California', postal: '94105', phone: '+1 415 555 0101',
};

const SEED_ORDERS = [
  {
    id: 'ORD-100318', date: '2026-10-30T14:05:00.000Z', status: 'Cancelled',
    items: [{ id: 17, name: 'The Pragmatic Tester', price: 34.99, qty: 1, size: null }],
    totals: { subtotal: 34.99, discount: 0, shipping: 5.99, tax: 2.8, total: 43.78 },
    promo: null, delivery: 'standard', deliveryDate: '2026-11-04',
    shipping: SEED_ADDRESS, payment: { method: 'card', brand: 'Visa', last4: '4242' },
  },
  {
    id: 'ORD-100245', date: '2026-10-20T09:41:00.000Z', status: 'Shipped',
    items: [{ id: 9, name: 'Running Shoes', price: 110, qty: 1, size: '9' }],
    totals: { subtotal: 110, discount: 11, shipping: 0, tax: 7.92, total: 106.92 },
    promo: 'SAVE10', delivery: 'standard', deliveryDate: '2026-10-26',
    shipping: SEED_ADDRESS, payment: { method: 'card', brand: 'Mastercard', last4: '4444' },
  },
  {
    id: 'ORD-100101', date: '2026-09-14T10:22:00.000Z', status: 'Delivered',
    items: [
      { id: 1, name: 'Wireless Headphones', price: 89.99, qty: 1, size: null },
      { id: 12, name: 'Ceramic Mug', price: 12, qty: 2, size: null },
    ],
    totals: { subtotal: 113.99, discount: 0, shipping: 0, tax: 9.12, total: 123.11 },
    promo: null, delivery: 'standard', deliveryDate: '2026-09-18',
    shipping: SEED_ADDRESS, payment: { method: 'cod' },
  },
];

export function getOrders(email) {
  const orders = storage.get('orders.' + email);
  if (orders) return orders;
  const seed = email === 'standard@shop.test' ? structuredClone(SEED_ORDERS) : [];
  storage.set('orders.' + email, seed);
  return seed;
}

export const saveOrders = (email, orders) => storage.set('orders.' + email, orders);

export function createOrder(email, order) {
  const orders = getOrders(email);
  let id;
  do id = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
  while (orders.some((o) => o.id === id));
  const full = { id, date: new Date().toISOString(), status: 'Processing', ...order };
  orders.unshift(full);
  saveOrders(email, orders);
  return full;
}
