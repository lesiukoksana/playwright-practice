import { requireAuth } from '../layout.js';
import { esc, formatDate, getOrders, money, params } from '../store.js';

const user = requireAuth();

if (user) {
  const root = document.getElementById('invoice-root');
  const id = params().get('order');
  const o = getOrders(user.email).find((x) => x.id === id);

  if (!o) {
    root.innerHTML = '<h1>Invoice not found</h1><p>This order does not exist in your account.</p>';
  } else {
    document.title = `Invoice ${o.id} | PracticeShop`;
    const s = o.shipping;
    root.innerHTML = `
      <div class="invoice-head">
        <div>
          <p class="logo"><span aria-hidden="true">🛒</span> PracticeShop</p>
          <p class="muted">1 Test Street, Mocksville</p>
        </div>
        <div class="right">
          <h1>Invoice</h1>
          <p data-testid="invoice-number">${esc(o.id)}</p>
          <p>${formatDate(o.date)}</p>
        </div>
      </div>
      <h2>Bill to</h2>
      <address>${esc(s.fullName)}<br>${esc(s.address1)}<br>${esc(s.city)}, ${esc(s.region)} ${esc(s.postal)}</address>
      <table class="data-table">
        <thead><tr><th scope="col">Item</th><th scope="col">Qty</th><th scope="col">Unit price</th><th scope="col">Total</th></tr></thead>
        <tbody>
          ${o.items.map((i) => `<tr><td>${esc(i.name)}${i.size ? ` (size ${esc(i.size)})` : ''}</td><td>${i.qty}</td><td>${money(i.price)}</td><td>${money(i.price * i.qty)}</td></tr>`).join('')}
        </tbody>
        <tfoot>
          <tr><th scope="row" colspan="3">Subtotal</th><td>${money(o.totals.subtotal)}</td></tr>
          ${o.totals.discount ? `<tr><th scope="row" colspan="3">Discount${o.promo ? ` (${esc(o.promo)})` : ''}</th><td>−${money(o.totals.discount)}</td></tr>` : ''}
          <tr><th scope="row" colspan="3">Shipping</th><td>${o.totals.shipping ? money(o.totals.shipping) : 'Free'}</td></tr>
          <tr><th scope="row" colspan="3">Tax</th><td>${money(o.totals.tax)}</td></tr>
          <tr class="total"><th scope="row" colspan="3">Total</th><td data-testid="invoice-total">${money(o.totals.total)}</td></tr>
        </tfoot>
      </table>
      <p class="muted">Payment: ${o.payment.method === 'cod' ? 'Pay on delivery' : `${esc(o.payment.brand)} ending in ${esc(o.payment.last4)}`} · Status: ${esc(o.status)}</p>
      <div class="button-row no-print">
        <button type="button" class="btn btn-primary" id="print">Print</button>
        <button type="button" class="btn btn-secondary" id="close">Close tab</button>
      </div>`;
    document.getElementById('print').addEventListener('click', () => window.print());
    document.getElementById('close').addEventListener('click', () => window.close());
  }
}
