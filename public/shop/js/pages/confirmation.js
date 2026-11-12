import { initLayout, requireAuth } from '../layout.js';
import { esc, getOrders, money, params } from '../store.js';
import { summaryTable } from '../ui.js';

const user = requireAuth();

if (user) {
  initLayout();
  const root = document.getElementById('confirmation-root');
  const id = params().get('order');
  const order = getOrders(user.email).find((o) => o.id === id);

  if (!order) {
    root.innerHTML = `
      <h1>Order not found</h1>
      <p>We couldn't find this order in your account.</p>
      <a class="btn btn-primary" href="orders.html">View my orders</a>`;
  } else {
    root.innerHTML = `
      <div class="success-icon" aria-hidden="true">✓</div>
      <h1>Thank you for your order!</h1>
      <p>Your order number is <strong data-testid="order-number">${esc(order.id)}</strong>.</p>
      <p>We'll deliver it on <strong data-testid="delivery-date">${esc(order.deliveryDate)}</strong> (${order.delivery === 'express' ? 'Express' : 'Standard'} delivery).</p>
      <h2>Items</h2>
      <ul class="mini-cart">
        ${order.items.map((i) => `<li><span>${i.qty} × ${esc(i.name)}${i.size ? ` <span class="muted">(${esc(i.size)})</span>` : ''}</span><span>${money(i.price * i.qty)}</span></li>`).join('')}
      </ul>
      ${summaryTable(order.totals)}
      <div class="button-row">
        <a class="btn btn-primary" href="orders.html">View my orders</a>
        <a class="btn btn-secondary" href="index.html">Continue shopping</a>
      </div>`;
  }
}
