import { initLayout, requireAuth, toast } from '../layout.js';
import { addToCart, esc, getWishlist, loadProducts, money, saveWishlist } from '../store.js';
import { productImage, spinner } from '../ui.js';

const user = requireAuth();
const root = document.getElementById('wishlist-root');
let products = [];

function render() {
  const ids = getWishlist().filter((id) => products.some((p) => p.id === id));
  if (!ids.length) {
    root.innerHTML = `<div class="empty-state" data-testid="empty-wishlist"><p>Your wishlist is empty.</p><a class="btn btn-primary" href="index.html">Browse products</a></div>`;
    return;
  }
  root.innerHTML = `
    <ol class="wishlist" id="wishlist" aria-describedby="wishlist-help">
      ${ids.map((id, i) => {
        const p = products.find((x) => x.id === id);
        const action = p.stock === 0
          ? '<span class="muted">Out of stock</span>'
          : p.sizes?.length
            ? `<a class="btn btn-secondary btn-sm" href="product.html?id=${p.id}">Choose size</a>`
            : `<button type="button" class="btn btn-primary btn-sm" data-action="cart" data-id="${p.id}">Move to cart</button>`;
        return `
          <li class="wishlist-item" draggable="true" data-id="${p.id}" data-testid="wishlist-item">
            <span class="drag-handle" aria-hidden="true" title="Drag to reorder">⋮⋮</span>
            <span class="position">${i + 1}</span>
            ${productImage(p, 'sm')}
            <div class="wishlist-info">
              <a href="product.html?id=${p.id}">${esc(p.name)}</a>
              <span class="muted">${money(p.price)}</span>
            </div>
            <div class="wishlist-actions">
              <button type="button" class="icon-btn" data-action="up" data-id="${p.id}" aria-label="Move ${esc(p.name)} up" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" class="icon-btn" data-action="down" data-id="${p.id}" aria-label="Move ${esc(p.name)} down" ${i === ids.length - 1 ? 'disabled' : ''}>↓</button>
              ${action}
              <button type="button" class="link-button danger" data-action="remove" data-id="${p.id}" aria-label="Remove ${esc(p.name)} from wishlist">Remove</button>
            </div>
          </li>`;
      }).join('')}
    </ol>`;
}

function move(id, delta) {
  const ids = getWishlist();
  const i = ids.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  saveWishlist(ids);
  render();
  root.querySelector(`[data-action="${delta < 0 ? 'up' : 'down'}"][data-id="${id}"]:not([disabled])`)?.focus();
}

// HTML5 drag and drop (works with Playwright's locator.dragTo()).
let dragId = null;
root.addEventListener('dragstart', (e) => {
  const li = e.target.closest('.wishlist-item');
  if (!li) return;
  dragId = Number(li.dataset.id);
  li.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(dragId));
});
root.addEventListener('dragend', (e) => {
  e.target.closest('.wishlist-item')?.classList.remove('dragging');
  root.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
});
root.addEventListener('dragover', (e) => {
  const li = e.target.closest('.wishlist-item');
  if (!li || dragId === null) return;
  e.preventDefault();
  root.querySelectorAll('.drop-target').forEach((el) => el !== li && el.classList.remove('drop-target'));
  li.classList.add('drop-target');
});
root.addEventListener('drop', (e) => {
  const li = e.target.closest('.wishlist-item');
  if (!li || dragId === null) return;
  e.preventDefault();
  const targetId = Number(li.dataset.id);
  if (targetId !== dragId) {
    const ids = getWishlist().filter((x) => x !== dragId);
    ids.splice(ids.indexOf(targetId) + (getWishlist().indexOf(dragId) < getWishlist().indexOf(targetId) ? 1 : 0), 0, dragId);
    saveWishlist(ids);
    toast('Wishlist order updated');
  }
  dragId = null;
  render();
});

root.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const p = products.find((x) => x.id === id);
  switch (btn.dataset.action) {
    case 'up': return move(id, -1);
    case 'down': return move(id, 1);
    case 'remove':
      saveWishlist(getWishlist().filter((x) => x !== id));
      toast(`${p.name} removed from wishlist`);
      return render();
    case 'cart': {
      const result = addToCart(p, 1);
      if (result.error) return toast(result.error, 'error');
      saveWishlist(getWishlist().filter((x) => x !== id));
      toast(`${p.name} moved to cart`);
      return render();
    }
  }
});

async function main() {
  initLayout({ active: 'wishlist' });
  root.innerHTML = spinner('Loading wishlist…');
  products = await loadProducts();
  render();
}

if (user) main();
