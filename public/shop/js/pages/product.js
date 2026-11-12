import '../components/star-rating.js';
import { initLayout, toast } from '../layout.js';
import {
  addReview, addToCart, currentUser, delay, esc, formatDate, fullName, getUserReviews, getWishlist,
  loadProducts, money, params, qtyLimit, toggleWishlist,
} from '../store.js';
import { productImage, setupTabs, spinner, stars, stockLabel } from '../ui.js';

initLayout({ active: 'shop' });

const root = document.getElementById('product-root');
const id = Number(params().get('id'));

async function main() {
  root.innerHTML = spinner('Loading product…');
  let products;
  try {
    [products] = await Promise.all([loadProducts(), delay(300)]);
  } catch (err) {
    root.innerHTML = `<div class="error-state" role="alert"><p>${esc(err.message)}</p></div>`;
    return;
  }
  const p = products.find((x) => x.id === id);
  if (!p) {
    document.title = 'Product not found | PracticeShop';
    root.innerHTML = `
      <div class="empty-state" data-testid="not-found">
        <h1>Product not found</h1>
        <p>The product you are looking for does not exist or has been removed.</p>
        <a class="btn btn-primary" href="index.html">Back to shop</a>
      </div>`;
    return;
  }
  document.title = `${p.name} | PracticeShop`;
  render(p, products);
}

// The rating comes from all star ratings (ratingCount); only some buyers also write a review.
function ratingSummary(p) {
  if (!p.rating) return '<span>No ratings yet</span>';
  const count = p.ratingCount ? ` (${p.ratingCount} ${p.ratingCount === 1 ? 'rating' : 'ratings'})` : '';
  return `${stars(p.rating)} <span>${p.rating.toFixed(1)} out of 5${count}</span>`;
}

function allReviews(p) {
  return [...getUserReviews(p.id), ...(p.reviews ?? [])];
}

function render(p, products) {
  const user = currentUser();
  const wished = user && getWishlist().includes(p.id);
  const reviews = allReviews(p);
  const max = qtyLimit(p);
  const related = products.filter((x) => x.category === p.category && x.id !== p.id).slice(0, 4);

  root.innerHTML = `
    <nav aria-label="Breadcrumb" class="breadcrumb">
      <ol>
        <li><a href="index.html">Shop</a></li>
        <li><a href="index.html?category=${encodeURIComponent(p.category)}">${esc(p.category)}</a></li>
        <li><span aria-current="page">${esc(p.name)}</span></li>
      </ol>
    </nav>

    <div class="product-detail" data-product-id="${p.id}">
      <button type="button" class="image-button" id="open-image" aria-label="Enlarge image of ${esc(p.name)}">
        ${productImage(p, 'lg')}
      </button>

      <div class="product-info">
        <p class="product-category">${esc(p.category)}</p>
        <h1>${esc(p.name)}</h1>
        <p class="product-rating">${ratingSummary(p)} · <a href="#tab-reviews" id="reviews-link">${reviews.length === 0 ? 'No reviews yet' : `${reviews.length} ${reviews.length === 1 ? 'review' : 'reviews'}`}</a></p>
        <p class="price-lg" data-testid="product-price">${money(p.price)}</p>
        ${stockLabel(p)}
        <p>${esc(p.description)}</p>

        <form id="add-form" novalidate>
          ${p.sizes?.length ? `
            <fieldset class="field" id="size" aria-describedby="size-error">
              <legend>Size</legend>
              <div class="size-options">
                ${p.sizes.map((s) => `<div class="size-option"><input type="radio" name="size" id="size-${esc(s)}" value="${esc(s)}"><label for="size-${esc(s)}">${esc(s)}</label></div>`).join('')}
              </div>
              <p class="error" id="size-error" hidden></p>
            </fieldset>` : ''}

          <div class="field">
            <label for="quantity">Quantity</label>
            <div class="stepper">
              <button type="button" class="icon-btn" data-step="-1" aria-label="Decrease quantity">−</button>
              <input id="quantity" type="number" inputmode="numeric" min="1" max="${max}" value="1" aria-describedby="quantity-error" ${p.stock === 0 ? 'disabled' : ''}>
              <button type="button" class="icon-btn" data-step="1" aria-label="Increase quantity">+</button>
            </div>
            <p class="error" id="quantity-error" hidden></p>
          </div>

          <div class="button-row">
            <button type="submit" class="btn btn-primary" id="add-to-cart" ${p.stock === 0 ? 'disabled' : ''}>
              ${p.stock === 0 ? 'Out of stock' : 'Add to cart'}
            </button>
            <button type="button" class="btn btn-secondary" id="wishlist-button" aria-pressed="${!!wished}">
              <span aria-hidden="true">${wished ? '♥' : '♡'}</span> ${wished ? 'Saved to wishlist' : 'Add to wishlist'}
            </button>
          </div>
        </form>
      </div>
    </div>

    <section class="tabs-section">
      <div role="tablist" aria-label="Product information" class="tabs">
        <button type="button" role="tab" id="tab-description" aria-controls="panel-description" aria-selected="true">Description</button>
        <button type="button" role="tab" id="tab-specs" aria-controls="panel-specs" aria-selected="false">Specifications</button>
        <button type="button" role="tab" id="tab-reviews" aria-controls="panel-reviews" aria-selected="false">Reviews (<span data-testid="review-count">${reviews.length}</span>)</button>
      </div>
      <div role="tabpanel" id="panel-description" aria-labelledby="tab-description" tabindex="0">
        <p>${esc(p.description)}</p>
        <p>Free standard shipping on orders of $50 or more. Returns accepted within 30 days.</p>
      </div>
      <div role="tabpanel" id="panel-specs" aria-labelledby="tab-specs" tabindex="0" hidden>
        <table class="specs">
          <tbody>
            <tr><th scope="row">SKU</th><td>PS-${String(p.id).padStart(4, '0')}</td></tr>
            <tr><th scope="row">Category</th><td>${esc(p.category)}</td></tr>
            ${Object.entries(p.specs ?? {}).map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div role="tabpanel" id="panel-reviews" aria-labelledby="tab-reviews" tabindex="0" hidden>
        <div id="review-form-host"></div>
        <ul class="review-list" id="review-list"></ul>
      </div>
    </section>

    ${related.length ? `
      <section class="related" aria-labelledby="related-heading">
        <h2 id="related-heading">You may also like</h2>
        <ul class="related-list">
          ${related.map((r) => `<li><a href="product.html?id=${r.id}">${productImage(r, 'sm')}<span>${esc(r.name)}</span><span class="muted">${money(r.price)}</span></a></li>`).join('')}
        </ul>
      </section>` : ''}

    <dialog id="image-dialog" class="modal modal-image" aria-label="${esc(p.name)} image">
      <button type="button" class="modal-close" aria-label="Close image">×</button>
      ${productImage(p, 'xl')}
    </dialog>`;

  const tabs = setupTabs(root.querySelector('.tabs-section'));
  root.querySelector('#reviews-link').addEventListener('click', (e) => {
    e.preventDefault();
    tabs.select('tab-reviews');
    document.getElementById('tab-reviews').focus();
  });

  const dlg = root.querySelector('#image-dialog');
  root.querySelector('#open-image').addEventListener('click', () => dlg.showModal());
  dlg.querySelector('.modal-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close(); // click on the backdrop
  });

  bindAddForm(p, max);
  bindWishlist(p);
  renderReviews(p);
  renderReviewForm(p, user);
}

function bindAddForm(p, max) {
  const form = root.querySelector('#add-form');
  const qty = root.querySelector('#quantity');
  const qtyError = root.querySelector('#quantity-error');
  const showQtyError = (msg) => {
    qty.setAttribute('aria-invalid', String(!!msg));
    qtyError.textContent = msg;
    qtyError.hidden = !msg;
  };

  form.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    if (p.stock === 0) return;
    const next = (parseInt(qty.value, 10) || 1) + Number(b.dataset.step);
    qty.value = String(Math.min(max, Math.max(1, next)));
    showQtyError('');
  }));
  qty.addEventListener('input', () => showQtyError(''));

  form.addEventListener('change', (e) => {
    if (e.target.name === 'size') {
      const fs = root.querySelector('#size');
      fs.removeAttribute('aria-invalid');
      root.querySelector('#size-error').hidden = true;
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const n = Number(qty.value);
    let size = null;
    if (p.sizes?.length) {
      size = form.querySelector('input[name="size"]:checked')?.value ?? null;
      if (!size) {
        const fs = root.querySelector('#size');
        fs.setAttribute('aria-invalid', 'true');
        const err = root.querySelector('#size-error');
        err.textContent = 'Please select a size.';
        err.hidden = false;
        fs.querySelector('input').focus();
        return;
      }
    }
    if (!Number.isInteger(n) || n < 1) return showQtyError('Enter a quantity of at least 1.');
    if (n > max) return showQtyError(`You can buy at most ${max} of this item.`);

    const result = addToCart(p, n, size);
    if (result.error) return toast(result.error, 'error');
    toast(`Added ${n} × ${p.name}${size ? ` (size ${size})` : ''} to cart`);
  });
}

function bindWishlist(p) {
  const button = root.querySelector('#wishlist-button');
  button.addEventListener('click', () => {
    if (!currentUser()) return toast('Log in to save items to your wishlist.', 'error');
    const on = toggleWishlist(p.id);
    button.setAttribute('aria-pressed', String(on));
    button.innerHTML = `<span aria-hidden="true">${on ? '♥' : '♡'}</span> ${on ? 'Saved to wishlist' : 'Add to wishlist'}`;
    toast(on ? 'Saved to wishlist' : 'Removed from wishlist');
  });
}

function renderReviews(p) {
  const list = allReviews(p);
  root.querySelector('[data-testid="review-count"]').textContent = String(list.length);
  root.querySelector('#review-list').innerHTML = list.length
    ? list.map((r) => `
        <li class="review" data-testid="review">
          <p class="review-head">${stars(r.rating)} <span class="visually-hidden">${r.rating} out of 5 stars</span> <strong>${esc(r.title)}</strong></p>
          <p>${esc(r.text)}</p>
          <p class="muted">${esc(r.author)} · ${formatDate(r.date)}</p>
        </li>`).join('')
    : '<li class="muted">No reviews yet. Be the first to write one!</li>';
}

function renderReviewForm(p, user) {
  const host = root.querySelector('#review-form-host');
  if (!user) {
    host.innerHTML = `<p><a href="login.html?returnUrl=${encodeURIComponent(`product.html?id=${p.id}`)}">Log in</a> to write a review.</p>`;
    return;
  }
  host.innerHTML = `
    <form id="review-form" class="review-form" novalidate aria-labelledby="review-form-title">
      <h3 id="review-form-title">Write a review</h3>
      <div class="field">
        <span class="label" id="rating-label">Your rating</span>
        <star-rating id="rating" label="Your rating" aria-describedby="rating-error"></star-rating>
        <p class="error" id="rating-error" hidden></p>
      </div>
      <div class="field">
        <label for="review-title">Title</label>
        <input id="review-title" maxlength="60" aria-describedby="review-title-error">
        <p class="error" id="review-title-error" hidden></p>
      </div>
      <div class="field">
        <label for="review-text">Review</label>
        <textarea id="review-text" rows="4" maxlength="500" aria-describedby="review-text-count review-text-error"></textarea>
        <p class="hint" id="review-text-count" aria-live="polite">0 / 500</p>
        <p class="error" id="review-text-error" hidden></p>
      </div>
      <button type="submit" class="btn btn-primary">Submit review</button>
    </form>`;

  const form = host.querySelector('#review-form');
  const rating = form.querySelector('#rating');
  const title = form.querySelector('#review-title');
  const text = form.querySelector('#review-text');
  const setErr = (id, msg) => {
    const el = form.querySelector(`#${id}-error`);
    el.textContent = msg;
    el.hidden = !msg;
    const input = form.querySelector(`#${id}`);
    if (msg) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  };

  text.addEventListener('input', () => {
    form.querySelector('#review-text-count').textContent = `${text.value.length} / 500`;
  });
  rating.addEventListener('change', () => setErr('rating', ''));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let ok = true;
    if (!rating.value) {
      setErr('rating', 'Please select a rating.');
      rating.setAttribute('invalid', '');
      ok = false;
    } else setErr('rating', '');
    if (!title.value.trim()) {
      setErr('review-title', 'Title is required.');
      ok = false;
    } else setErr('review-title', '');
    if (text.value.trim().length < 10) {
      setErr('review-text', 'Review must be at least 10 characters.');
      ok = false;
    } else setErr('review-text', '');
    if (!ok) return;

    addReview(p.id, {
      author: fullName(user), rating: rating.value, title: title.value.trim(), text: text.value.trim(),
      date: new Date().toISOString(),
    });
    form.reset();
    rating.value = 0;
    form.querySelector('#review-text-count').textContent = '0 / 500';
    renderReviews(p);
    toast('Thanks! Your review has been posted.');
  });
}

main();
