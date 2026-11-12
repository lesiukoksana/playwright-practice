import { initLayout, setupNewsletterPopup, toast } from '../layout.js';
import {
  addToCart, bug, CATEGORIES, currentUser, delay, esc, getWishlist, loadProducts, money, toggleWishlist,
} from '../store.js';
import { productImage, spinner, stockLabel } from '../ui.js';

const PAGE_SIZE = 8;
const DEFAULTS = { q: '', categories: [], maxPrice: 1000, minRating: 0, inStock: false, sort: 'featured', page: 1, view: 'grid' };
const state = structuredClone(DEFAULTS);
let products = [];

const $ = (sel) => document.querySelector(sel);
const els = {
  search: $('#search'), categories: $('#category-options'), maxPrice: $('#max-price'), maxPriceOut: $('#max-price-output'),
  minRating: $('#min-rating'), inStock: $('#in-stock'), sort: $('#sort'), list: $('#product-list'),
  count: $('#result-count'), pagination: $('#pagination'),
};

// ---------------------------------------------------------------- URL state (shareable / deep-linkable)

function readUrl() {
  const p = new URLSearchParams(location.search);
  state.q = p.get('q') ?? '';
  state.categories = (p.get('category') ?? '').split(',').filter((c) => CATEGORIES.includes(c));
  state.maxPrice = Number(p.get('maxPrice')) || DEFAULTS.maxPrice;
  state.minRating = Number(p.get('rating')) || 0;
  state.inStock = p.get('inStock') === '1';
  state.sort = p.get('sort') ?? DEFAULTS.sort;
  state.page = Math.max(1, parseInt(p.get('page'), 10) || 1);
  state.view = p.get('view') === 'list' ? 'list' : 'grid';
}

function writeUrl() {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.categories.length) p.set('category', state.categories.join(','));
  if (state.maxPrice !== DEFAULTS.maxPrice) p.set('maxPrice', state.maxPrice);
  if (state.minRating) p.set('rating', state.minRating);
  if (state.inStock) p.set('inStock', '1');
  if (state.sort !== DEFAULTS.sort) p.set('sort', state.sort);
  if (state.page > 1) p.set('page', state.page);
  if (state.view !== 'grid') p.set('view', state.view);
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

function syncControls() {
  els.search.value = state.q;
  els.categories.querySelectorAll('input').forEach((cb) => (cb.checked = state.categories.includes(cb.value)));
  els.maxPrice.value = state.maxPrice;
  els.maxPriceOut.textContent = `Up to ${money(state.maxPrice).replace('.00', '')}`;
  els.minRating.value = String(state.minRating);
  els.inStock.checked = state.inStock;
  els.sort.value = state.sort;
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
  els.list.classList.toggle('list-view', state.view === 'list');
}

// ---------------------------------------------------------------- filtering, sorting, paging

function filtered() {
  const q = state.q.trim();
  const list = products.filter((p) => {
    // B06: search is case-sensitive.
    if (q && !(bug('B06') ? p.name.includes(q) : p.name.toLowerCase().includes(q.toLowerCase()))) return false;
    if (state.categories.length && !state.categories.includes(p.category)) return false;
    if (p.price > state.maxPrice) return false;
    if (p.rating < state.minRating) return false;
    if (state.inStock && p.stock === 0) return false;
    return true;
  });
  // B05: prices compared as text ("129.5" < "25").
  const byPrice = bug('B05')
    ? (a, b) => String(a.price).localeCompare(String(b.price))
    : (a, b) => a.price - b.price;
  const sorters = {
    featured: (a, b) => a.id - b.id,
    'name-asc': (a, b) => a.name.localeCompare(b.name),
    'name-desc': (a, b) => b.name.localeCompare(a.name),
    'price-asc': byPrice,
    'price-desc': (a, b) => byPrice(b, a),
    'rating-desc': (a, b) => b.rating - a.rating || a.id - b.id,
  };
  return list.sort(sorters[state.sort] ?? sorters.featured);
}

function render() {
  syncControls();
  const list = filtered();
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  state.page = Math.min(state.page, pages);
  writeUrl();

  if (!total) {
    els.count.textContent = 'No products found';
    els.list.innerHTML = `
      <div class="empty-state" data-testid="empty-state">
        <p>No products match your filters.</p>
        <button type="button" class="btn btn-secondary" data-action="clear">Clear filters</button>
      </div>`;
    els.pagination.innerHTML = '';
    return;
  }

  const start = (state.page - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, total);
  let pageItems = list.slice(start, end);
  // B08: off-by-one, the last page loses its final product.
  if (bug('B08') && state.page === pages && pages > 1) pageItems = pageItems.slice(0, -1);

  els.count.textContent = `Showing ${start + 1}–${end} of ${total} ${total === 1 ? 'product' : 'products'}`;
  const wishlist = currentUser() ? getWishlist() : [];
  els.list.innerHTML = pageItems.map((p) => card(p, wishlist.includes(p.id))).join('');
  renderPagination(pages);
}

function card(p, wished) {
  let action;
  if (p.stock === 0) action = `<button type="button" class="btn" disabled>Out of stock</button>`;
  else if (p.sizes?.length) action = `<a class="btn btn-secondary" href="product.html?id=${p.id}">Choose options</a>`;
  else action = `<button type="button" class="btn btn-primary" data-action="add" data-id="${p.id}">Add to cart</button>`;
  return `
    <article class="product-card" data-testid="product-card" data-product-id="${p.id}">
      <a href="product.html?id=${p.id}" class="product-thumb" tabindex="-1" aria-hidden="true">${productImage(p)}</a>
      <div class="product-body">
        <p class="product-category">${esc(p.category)}</p>
        <h3 class="product-name"><a href="product.html?id=${p.id}">${esc(p.name)}</a></h3>
        <p class="product-rating"><span aria-hidden="true">★</span> <span aria-label="Rated ${p.rating} out of 5">${p.rating.toFixed(1)}</span></p>
        <p class="product-price" data-testid="product-price">${money(p.price)}</p>
        ${stockLabel(p)}
      </div>
      <div class="product-actions">
        ${action}
        <button type="button" class="icon-btn wish-btn" data-action="wish" data-id="${p.id}" aria-pressed="${wished}" title="Wishlist">
          <span aria-hidden="true">${wished ? '♥' : '♡'}</span><span class="visually-hidden">Add to wishlist</span>
        </button>
      </div>
    </article>`;
}

function renderPagination(pages) {
  if (pages <= 1) {
    els.pagination.innerHTML = '';
    return;
  }
  const btn = (page, label, extra = '') =>
    `<button type="button" class="page-btn" data-page="${page}" ${extra}>${label}</button>`;
  let html = btn(state.page - 1, 'Previous', `aria-label="Previous page" ${state.page === 1 ? 'disabled' : ''}`);
  for (let i = 1; i <= pages; i++) {
    html += btn(i, i, `aria-label="Page ${i}" ${i === state.page ? 'aria-current="page"' : ''}`);
  }
  html += btn(state.page + 1, 'Next', `aria-label="Next page" ${state.page === pages ? 'disabled' : ''}`);
  els.pagination.innerHTML = html;
}

// ---------------------------------------------------------------- loading

async function load() {
  els.list.innerHTML = spinner('Loading products…');
  els.count.textContent = '';
  els.pagination.innerHTML = '';
  try {
    // Random delay so tests have to wait for content properly.
    const [list] = await Promise.all([loadProducts(), delay(500 + Math.random() * 1000)]);
    products = list;
    render();
  } catch (err) {
    els.list.innerHTML = `
      <div class="error-state" role="alert" data-testid="load-error">
        <p>We couldn't load products. ${esc(err.message)}</p>
        <button type="button" class="btn btn-primary" data-action="retry">Try again</button>
      </div>`;
  }
}

// ---------------------------------------------------------------- events

function bindEvents() {
  els.categories.innerHTML = CATEGORIES.map((c) => `
    <div class="checkbox">
      <input type="checkbox" id="cat-${c.toLowerCase()}" value="${c}">
      <label for="cat-${c.toLowerCase()}">${c}</label>
    </div>`).join('');

  let searchTimer;
  els.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.q = els.search.value;
      state.page = 1;
      render();
    }, 300);
  });
  els.categories.addEventListener('change', () => {
    state.categories = [...els.categories.querySelectorAll('input:checked')].map((cb) => cb.value);
    state.page = 1;
    render();
  });
  els.maxPrice.addEventListener('input', () => {
    state.maxPrice = Number(els.maxPrice.value);
    state.page = 1;
    render();
  });
  els.minRating.addEventListener('change', () => {
    state.minRating = Number(els.minRating.value);
    state.page = 1;
    render();
  });
  els.inStock.addEventListener('change', () => {
    state.inStock = els.inStock.checked;
    state.page = 1;
    render();
  });
  els.sort.addEventListener('change', () => {
    state.sort = els.sort.value;
    state.page = 1;
    render();
  });
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
    state.view = b.dataset.view;
    render();
  }));
  $('#clear-filters').addEventListener('click', clearFilters);
  document.getElementById('filters').addEventListener('submit', (e) => e.preventDefault());

  els.pagination.addEventListener('click', (e) => {
    const b = e.target.closest('[data-page]');
    if (!b || b.disabled) return;
    state.page = Number(b.dataset.page);
    render();
    document.getElementById('results-heading').scrollIntoView({ block: 'start' });
  });

  els.list.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'retry') return load();
    if (action === 'clear') return clearFilters();
    const product = products.find((p) => p.id === Number(target.dataset.id));
    if (action === 'add') addClicked(target, product);
    if (action === 'wish') wishClicked(target, product);
  });
}

function clearFilters() {
  Object.assign(state, structuredClone(DEFAULTS), { view: state.view });
  render();
}

function addClicked(button, product) {
  const result = addToCart(product, 1);
  if (result.error) return toast(result.error, 'error');
  toast(`${product.name} added to cart`);
  button.disabled = true;
  button.textContent = 'Added ✓';
  setTimeout(() => {
    button.disabled = false;
    button.textContent = 'Add to cart';
  }, 1500);
}

function wishClicked(button, product) {
  if (!currentUser()) return toast('Log in to save items to your wishlist.', 'error');
  const on = toggleWishlist(product.id);
  button.setAttribute('aria-pressed', String(on));
  button.querySelector('[aria-hidden]').textContent = on ? '♥' : '♡';
  toast(on ? `${product.name} saved to wishlist` : `${product.name} removed from wishlist`);
}

initLayout({ active: 'shop' });
readUrl();
bindEvents();
syncControls();
load();
setupNewsletterPopup();
