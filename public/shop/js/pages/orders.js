import { initLayout, requireAuth, toast } from '../layout.js';
import { esc, formatDate, getOrders, money, saveOrders } from '../store.js';
import { downloadFile } from '../ui.js';

const user = requireAuth();
const sort = { key: 'date', dir: 'desc' };
const root = document.getElementById('orders-root');
const filter = document.getElementById('status-filter');

const COLUMNS = [
  { key: 'id', label: 'Order', value: (o) => o.id },
  { key: 'date', label: 'Date', value: (o) => o.date },
  { key: 'items', label: 'Items', value: (o) => o.items.reduce((n, i) => n + i.qty, 0) },
  { key: 'total', label: 'Total', value: (o) => o.totals.total },
  { key: 'status', label: 'Status', value: (o) => o.status },
];

function render() {
  const all = getOrders(user.email);
  const status = filter.value;
  const col = COLUMNS.find((c) => c.key === sort.key);
  const list = all
    .filter((o) => !status || o.status === status)
    .sort((a, b) => {
      const x = col.value(a);
      const y = col.value(b);
      const cmp = typeof x === 'number' ? x - y : String(x).localeCompare(String(y));
      return sort.dir === 'asc' ? cmp : -cmp;
    });

  document.getElementById('order-count').textContent = `${list.length} ${list.length === 1 ? 'order' : 'orders'}`;

  if (!all.length) {
    root.innerHTML = `<div class="empty-state" data-testid="no-orders"><p>You haven't placed any orders yet.</p><a class="btn btn-primary" href="index.html">Start shopping</a></div>`;
    return;
  }
  if (!list.length) {
    root.innerHTML = `<div class="empty-state" data-testid="no-orders"><p>No orders with status "${esc(status)}".</p></div>`;
    return;
  }

  root.innerHTML = `
    <div class="table-wrap">
      <table class="data-table" data-testid="orders-table">
        <caption class="visually-hidden">Your orders, sorted by ${col.label.toLowerCase()} ${sort.dir === 'asc' ? 'ascending' : 'descending'}</caption>
        <thead>
          <tr>
            ${COLUMNS.map((c) => `
              <th scope="col" ${c.key === sort.key ? `aria-sort="${sort.dir === 'asc' ? 'ascending' : 'descending'}"` : ''}>
                <button type="button" class="sort-btn" data-sort="${c.key}">${c.label}<span aria-hidden="true">${c.key === sort.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</span></button>
              </th>`).join('')}
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((o) => `
            <tr data-order-id="${esc(o.id)}">
              <th scope="row">${esc(o.id)}</th>
              <td>${formatDate(o.date)}</td>
              <td>${o.items.reduce((n, i) => n + i.qty, 0)}</td>
              <td>${money(o.totals.total)}</td>
              <td><span class="status status-${o.status.toLowerCase()}">${esc(o.status)}</span></td>
              <td class="actions">
                <a href="invoice.html?order=${encodeURIComponent(o.id)}" target="_blank" rel="noopener">View invoice</a>
                <button type="button" class="link-button" data-action="download" data-id="${esc(o.id)}">Download</button>
                ${o.status === 'Processing' ? `<button type="button" class="link-button danger" data-action="cancel" data-id="${esc(o.id)}">Cancel</button>` : ''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function invoiceCsv(o) {
  const rows = [
    ['Invoice', o.id],
    ['Date', o.date.slice(0, 10)],
    ['Status', o.status],
    [],
    ['Item', 'Size', 'Quantity', 'Unit price', 'Line total'],
    ...o.items.map((i) => [i.name, i.size ?? '', i.qty, i.price.toFixed(2), (i.price * i.qty).toFixed(2)]),
    [],
    ['Subtotal', '', '', '', o.totals.subtotal.toFixed(2)],
    ['Discount', '', '', '', o.totals.discount.toFixed(2)],
    ['Shipping', '', '', '', o.totals.shipping.toFixed(2)],
    ['Tax', '', '', '', o.totals.tax.toFixed(2)],
    ['Total', '', '', '', o.totals.total.toFixed(2)],
  ];
  return rows.map((r) => r.map((c) => (/[",]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\n') + '\n';
}

if (user) {
  initLayout({ active: 'orders' });
  filter.addEventListener('change', render);

  root.addEventListener('click', (e) => {
    const sortBtn = e.target.closest('[data-sort]');
    if (sortBtn) {
      const key = sortBtn.dataset.sort;
      sort.dir = sort.key === key && sort.dir === 'asc' ? 'desc' : 'asc';
      sort.key = key;
      return render();
    }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const orders = getOrders(user.email);
    const o = orders.find((x) => x.id === btn.dataset.id);
    if (btn.dataset.action === 'download') {
      downloadFile(`invoice-${o.id}.csv`, invoiceCsv(o));
    }
    if (btn.dataset.action === 'cancel') {
      // Native dialog on purpose.
      if (!window.confirm(`Cancel order ${o.id}? This cannot be undone.`)) return;
      o.status = 'Cancelled';
      saveOrders(user.email, orders);
      toast(`Order ${o.id} has been cancelled.`);
      render();
    }
  });

  render();
}
