import { initLayout, requireAuth, toast } from '../layout.js';
import {
  bug, CATEGORIES, esc, fullName, getOverrides, getUsers, loadProducts, money, round2, saveOverrides, saveUsers,
} from '../store.js';
import { clearErrors, clearOnInput, focusFirstError, setError } from '../forms.js';
import { confirmDialog, setupTabs, spinner } from '../ui.js';

const user = requireAuth();
const root = document.getElementById('admin-root');
const $ = (id) => document.getElementById(id);
let products = [];
let editingId = null;
const selected = new Set();
let productFilter = '';

// ---------------------------------------------------------------- layout

function renderShell() {
  root.innerHTML = `
    <h1>Admin</h1>
    <div class="tabs-section">
      <div role="tablist" aria-label="Admin sections" class="tabs">
        <button type="button" role="tab" id="tab-products" aria-controls="panel-products" aria-selected="true">Products</button>
        <button type="button" role="tab" id="tab-users" aria-controls="panel-users" aria-selected="false">Users</button>
      </div>
      <div role="tabpanel" id="panel-products" aria-labelledby="tab-products">
        <div class="toolbar">
          <div class="field inline">
            <label for="product-filter">Filter products</label>
            <input id="product-filter" type="search" autocomplete="off">
          </div>
          <div class="button-row">
            <button type="button" class="btn btn-danger" id="bulk-delete" disabled>Delete selected</button>
            <button type="button" class="btn btn-primary" id="add-product">Add product</button>
          </div>
        </div>
        <div id="products-table"></div>
      </div>
      <div role="tabpanel" id="panel-users" aria-labelledby="tab-users" hidden>
        <div id="users-table"></div>
      </div>
    </div>`;
  setupTabs(root.querySelector('.tabs-section'));
}

// ---------------------------------------------------------------- products

function visibleProducts() {
  const q = productFilter.trim().toLowerCase();
  return products.filter((p) => !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
}

function renderProducts() {
  const list = visibleProducts();
  const allChecked = list.length > 0 && list.every((p) => selected.has(p.id));
  const someChecked = list.some((p) => selected.has(p.id));
  $('products-table').innerHTML = `
    <div class="table-wrap">
      <table class="data-table" data-testid="admin-products">
        <caption class="visually-hidden">Products</caption>
        <thead>
          <tr>
            <th scope="col"><input type="checkbox" id="select-all" aria-label="Select all products" ${allChecked ? 'checked' : ''}></th>
            <th scope="col">ID</th><th scope="col">Name</th><th scope="col">Category</th>
            <th scope="col">Price</th><th scope="col">Stock</th><th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${list.length ? list.map((p) => `
            <tr data-product-id="${p.id}">
              <td><input type="checkbox" data-select="${p.id}" aria-label="Select ${esc(p.name)}" ${selected.has(p.id) ? 'checked' : ''}></td>
              <td>${p.id}</td>
              <th scope="row">${esc(p.name)}</th>
              <td>${esc(p.category)}</td>
              <td>${money(p.price)}</td>
              <td>${p.stock}</td>
              <td class="actions">
                <button type="button" class="link-button" data-edit="${p.id}" aria-label="Edit ${esc(p.name)}">Edit</button>
                <button type="button" class="link-button danger" data-delete="${p.id}" aria-label="Delete ${esc(p.name)}">Delete</button>
              </td>
            </tr>`).join('') : '<tr><td colspan="7" class="center muted">No products found.</td></tr>'}
        </tbody>
      </table>
    </div>`;
  const selectAll = $('select-all');
  selectAll.indeterminate = someChecked && !allChecked;
  const bulk = $('bulk-delete');
  bulk.disabled = selected.size === 0;
  bulk.textContent = selected.size ? `Delete selected (${selected.size})` : 'Delete selected';
}

async function reloadProducts() {
  products = await loadProducts();
  for (const id of [...selected]) if (!products.some((p) => p.id === id)) selected.delete(id);
  renderProducts();
}

function deleteProducts(ids) {
  const o = getOverrides();
  for (const id of ids) {
    o.added = o.added.filter((p) => p.id !== id);
    if (!o.deleted.includes(id)) o.deleted.push(id);
    delete o.updated[id];
    selected.delete(id);
  }
  saveOverrides(o);
}

function openProductDialog(product = null) {
  const form = $('product-form');
  form.reset();
  clearErrors(form);
  editingId = product?.id ?? null;
  $('product-dialog-title').textContent = product ? `Edit product: ${product.name}` : 'Add product';
  if (product) {
    $('p-name').value = product.name;
    $('p-category').value = product.category;
    $('p-emoji').value = product.emoji ?? '';
    $('p-price').value = product.price.toFixed(2);
    $('p-stock').value = product.stock;
    $('p-description').value = product.description ?? '';
  }
  $('product-dialog').showModal();
  $('p-name').focus();
}

function setupProductForm() {
  const form = $('product-form');
  $('p-category').insertAdjacentHTML('beforeend', CATEGORIES.map((c) => `<option>${c}</option>`).join(''));
  clearOnInput(form);
  form.querySelector('[data-action="cancel"]').addEventListener('click', () => $('product-dialog').close());

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    const name = $('p-name').value.trim();
    const category = $('p-category').value;
    const priceRaw = $('p-price').value.trim();
    const stockRaw = $('p-stock').value.trim();

    if (!name) setError($('p-name'), 'Name is required.');
    else if (name.length < 3) setError($('p-name'), 'Name must be at least 3 characters.');
    else if (products.some((p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== editingId)) setError($('p-name'), 'A product with this name already exists.');
    if (!category) setError($('p-category'), 'Select a category.');
    if (!priceRaw) setError($('p-price'), 'Price is required.');
    else if (!/^\d+(\.\d{1,2})?$/.test(priceRaw)) setError($('p-price'), 'Enter a price like 19.99 (max 2 decimals).');
    else if (Number(priceRaw) <= 0 || Number(priceRaw) > 10000) setError($('p-price'), 'Price must be between $0.01 and $10,000.');
    if (stockRaw === '') setError($('p-stock'), 'Stock is required.');
    else if (!/^\d+$/.test(stockRaw)) setError($('p-stock'), 'Stock must be a whole number of 0 or more.');
    if (form.querySelector('[aria-invalid="true"]')) return focusFirstError(form);

    // B11: the price is rounded to whole dollars when an existing product is edited.
    const price = editingId && bug('B11') ? Math.round(Number(priceRaw)) : round2(Number(priceRaw));
    const data = {
      name, category, price, stock: Number(stockRaw),
      emoji: $('p-emoji').value.trim() || '📦',
      description: $('p-description').value.trim() || 'No description yet.',
    };
    const o = getOverrides();
    if (editingId) {
      const added = o.added.find((p) => p.id === editingId);
      if (added) Object.assign(added, data);
      else o.updated[editingId] = { ...(o.updated[editingId] ?? {}), ...data };
    } else {
      const id = Math.max(0, ...products.map((p) => p.id), ...o.deleted) + 1;
      o.added.push({ id, rating: 0, color: '#f1f5f9', reviews: [], specs: {}, ...data });
    }
    saveOverrides(o);
    $('product-dialog').close();
    toast(editingId ? `${name} updated` : `${name} added`);
    await reloadProducts();
  });
}

function setupProductEvents() {
  $('add-product').addEventListener('click', () => openProductDialog());
  $('product-filter').addEventListener('input', (e) => {
    productFilter = e.target.value;
    renderProducts();
  });

  $('products-table').addEventListener('change', (e) => {
    if (e.target.id === 'select-all') {
      for (const p of visibleProducts()) {
        if (e.target.checked) selected.add(p.id);
        else selected.delete(p.id);
      }
    } else if (e.target.dataset.select) {
      const id = Number(e.target.dataset.select);
      if (e.target.checked) selected.add(id);
      else selected.delete(id);
    }
    renderProducts();
  });

  $('products-table').addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-edit]');
    if (edit) return openProductDialog(products.find((p) => p.id === Number(edit.dataset.edit)));
    const del = e.target.closest('[data-delete]');
    if (del) {
      const p = products.find((x) => x.id === Number(del.dataset.delete));
      const ok = await confirmDialog({
        title: 'Delete product', message: `Delete "${p.name}"? Customers will no longer see it.`, confirmLabel: 'Delete', danger: true,
      });
      if (!ok) return;
      deleteProducts([p.id]);
      toast(`${p.name} deleted`);
      await reloadProducts();
    }
  });

  $('bulk-delete').addEventListener('click', async () => {
    const n = selected.size;
    // Native confirm() for bulk actions.
    if (!window.confirm(`Delete ${n} selected ${n === 1 ? 'product' : 'products'}?`)) return;
    deleteProducts([...selected]);
    toast(`${n} ${n === 1 ? 'product' : 'products'} deleted`);
    await reloadProducts();
  });
}

// ---------------------------------------------------------------- users

function renderUsers() {
  const users = getUsers();
  $('users-table').innerHTML = `
    <div class="table-wrap">
      <table class="data-table" data-testid="admin-users">
        <caption class="visually-hidden">Users</caption>
        <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
        <tbody>
          ${users.map((u) => `
            <tr data-email="${esc(u.email)}">
              <th scope="row">${esc(fullName(u))}</th>
              <td>${esc(u.email)}</td>
              <td>${u.role === 'admin' ? 'Admin' : 'Customer'}</td>
              <td><span class="status status-${u.status}">${u.status === 'locked' ? 'Locked' : 'Active'}</span></td>
              <td>${u.email === user.email
                ? '<span class="muted">You</span>'
                : `<button type="button" class="link-button" data-toggle-lock="${esc(u.email)}">${u.status === 'locked' ? 'Unlock' : 'Lock'}</button>`}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function setupUserEvents() {
  $('users-table').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-toggle-lock]');
    if (!btn) return;
    const users = getUsers();
    const u = users.find((x) => x.email === btn.dataset.toggleLock);
    u.status = u.status === 'locked' ? 'active' : 'locked';
    saveUsers(users);
    toast(`${fullName(u)} is now ${u.status === 'locked' ? 'locked' : 'active'}`);
    renderUsers();
  });
}

// ---------------------------------------------------------------- init

async function main() {
  initLayout({ active: 'admin' });
  if (user.role !== 'admin') {
    document.title = 'Access denied | PracticeShop';
    root.innerHTML = `
      <div class="empty-state" data-testid="access-denied">
        <h1>403 – Access denied</h1>
        <p>You need an administrator account to view this page.</p>
        <a class="btn btn-primary" href="index.html">Back to shop</a>
      </div>`;
    return;
  }
  renderShell();
  $('products-table').innerHTML = spinner('Loading products…');
  setupProductForm();
  setupProductEvents();
  setupUserEvents();
  renderUsers();
  await reloadProducts();
}

if (user) main();
