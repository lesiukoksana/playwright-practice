import { initLayout, toast } from '../layout.js';
import {
  bug, calcTotals, esc, getCart, getPromo, loadProducts, money, qtyLimit, saveCart, savePromo, validatePromo,
} from '../store.js';
import { productImage, spinner, summaryTable } from '../ui.js';

initLayout({ active: 'cart' });

const root = document.getElementById('cart-root');
let products = [];

/** Joins cart items with current product data. Items whose product was deleted are dropped. */
function cartLines() {
  const items = getCart();
  const lines = [];
  let dropped = 0;
  for (const item of items) {
    const p = products.find((x) => x.id === item.id);
    if (p) lines.push({ ...item, product: p, price: p.price });
    else dropped++;
  }
  if (dropped) {
    saveCart(items.filter((i) => products.some((p) => p.id === i.id)));
    toast(`${dropped} unavailable ${dropped === 1 ? 'item was' : 'items were'} removed from your cart.`, 'error', 5000);
  }
  return lines;
}

function render() {
  const lines = cartLines();
  if (!lines.length) {
    root.innerHTML = `
      <div class="empty-state" data-testid="empty-cart">
        <p>Your cart is empty.</p>
        <a class="btn btn-primary" href="index.html">Continue shopping</a>
      </div>`;
    return;
  }
  const promoCode = getPromo();
  const t = calcTotals(lines, promoCode);
  if (promoCode && !t.promo) savePromo(null); // e.g. subtotal dropped below the code's minimum

  root.innerHTML = `
    <div class="cart-layout">
      <div>
        <table class="cart-table" data-testid="cart-table">
          <caption class="visually-hidden">Items in your cart</caption>
          <thead>
            <tr><th scope="col">Product</th><th scope="col">Price</th><th scope="col">Quantity</th><th scope="col">Total</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr>
          </thead>
          <tbody>
            ${lines.map((l, i) => row(l, i)).join('')}
          </tbody>
        </table>
        <div class="button-row">
          <a class="btn btn-secondary" href="index.html">Continue shopping</a>
          <button type="button" class="btn btn-secondary" data-action="clear">Clear cart</button>
        </div>
      </div>

      <aside class="summary card" aria-labelledby="summary-heading">
        <h2 id="summary-heading">Order summary</h2>
        ${t.freeShippingRemaining > 0 && !(t.promo?.kind === 'shipping')
          ? `<p class="info-note" data-testid="free-shipping-note">Add ${money(t.freeShippingRemaining)} more for free shipping.</p>`
          : `<p class="info-note success" data-testid="free-shipping-note">You qualify for free shipping!</p>`}
        ${summaryTable(t)}

        <form id="promo-form" class="promo" novalidate>
          ${t.promo ? `
            <p class="promo-applied" data-testid="applied-promo"><strong>${esc(t.promo.code)}</strong> applied – ${esc(t.promo.description)}
              <button type="button" class="link-button" data-action="remove-promo">Remove</button></p>` : `
            <div class="field">
              <label for="promo-code">Promo code
                <span class="tooltip">
                  <button type="button" class="tooltip-trigger" aria-describedby="promo-tip">?</button>
                  <span role="tooltip" id="promo-tip">Try SAVE10, WELCOME5 or FREESHIP</span>
                </span>
              </label>
              <div class="input-with-button">
                <input id="promo-code" autocomplete="off" aria-describedby="promo-code-error">
                <button type="submit" class="btn btn-secondary">Apply</button>
              </div>
              <p class="error" id="promo-code-error" hidden></p>
            </div>`}
        </form>

        <a class="btn btn-primary btn-block" href="checkout.html" id="checkout-button">Proceed to checkout</a>
      </aside>
    </div>`;
}

function row(l, i) {
  const p = l.product;
  const max = qtyLimit(p);
  return `
    <tr data-testid="cart-item" data-index="${i}">
      <td>
        <div class="cart-product">
          ${productImage(p, 'sm')}
          <div>
            <a href="product.html?id=${p.id}" class="cart-product-name">${esc(p.name)}</a>
            ${l.size ? `<p class="muted">Size: ${esc(l.size)}</p>` : ''}
          </div>
        </div>
      </td>
      <td data-label="Price">${money(l.price)}</td>
      <td data-label="Quantity">
        <input type="number" class="qty-input" min="1" max="${max}" value="${l.qty}" data-index="${i}"
          aria-label="Quantity for ${esc(p.name)}${l.size ? `, size ${esc(l.size)}` : ''}">
      </td>
      <td data-label="Total" data-testid="line-total">${money(l.price * l.qty)}</td>
      <td><button type="button" class="link-button danger" data-action="remove" data-index="${i}"
        aria-label="Remove ${esc(p.name)}${l.size ? `, size ${esc(l.size)}` : ''}">Remove</button></td>
    </tr>`;
}

// ---------------------------------------------------------------- events

root.addEventListener('change', (e) => {
  const input = e.target.closest('.qty-input');
  if (!input) return;
  const items = getCart();
  const item = items[Number(input.dataset.index)];
  const p = products.find((x) => x.id === item.id);
  const max = qtyLimit(p);
  const n = Number(input.value);
  if (!Number.isInteger(n) || n < 1) {
    toast('Quantity must be at least 1. Use "Remove" to delete an item.', 'error');
    input.value = item.qty;
    return;
  }
  if (n > max) {
    toast(`Only ${max} of ${p.name} can be ordered.`, 'error');
    input.value = item.qty;
    return;
  }
  item.qty = n;
  saveCart(items);
  render();
});

root.addEventListener('click', async (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;

  if (action === 'remove') {
    const items = getCart();
    const [removed] = items.splice(Number(target.dataset.index), 1);
    // B01: the header cart badge is not notified.
    saveCart(items, { notify: !bug('B01') });
    const name = products.find((p) => p.id === removed.id)?.name ?? 'Item';
    toast(`${name} removed from cart`);
    render();
  }

  if (action === 'clear') {
    if (window.confirm('Remove all items from your cart?')) {
      saveCart([]);
      savePromo(null);
      render();
    }
  }

  if (action === 'remove-promo') {
    savePromo(null);
    render();
  }
});

root.addEventListener('submit', (e) => {
  if (e.target.id !== 'promo-form') return;
  e.preventDefault();
  const input = root.querySelector('#promo-code');
  const err = root.querySelector('#promo-code-error');
  const subtotal = calcTotals(cartLines()).subtotal;
  const result = validatePromo(input.value, subtotal);
  if (result.error) {
    input.setAttribute('aria-invalid', 'true');
    err.textContent = result.error;
    err.hidden = false;
    return;
  }
  savePromo(result.code);
  toast(`Promo code ${result.code} applied`);
  render();
});

async function main() {
  root.innerHTML = spinner('Loading cart…');
  try {
    products = await loadProducts();
    render();
  } catch (err) {
    root.innerHTML = `<div class="error-state" role="alert"><p>${esc(err.message)}</p></div>`;
  }
}

main();
