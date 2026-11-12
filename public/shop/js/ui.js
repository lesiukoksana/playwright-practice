import { esc, money, PRICING } from './store.js';

export function productImage(p, size = 'md') {
  return `<div class="product-image product-image-${size}" style="--tint:${esc(p.color ?? '#f1f5f9')}" role="img" aria-label="${esc(p.name)}"><span aria-hidden="true">${esc(p.emoji ?? '📦')}</span></div>`;
}

export function stockLabel(p) {
  if (p.stock === 0) return `<p class="stock stock-out" data-testid="stock-status">Out of stock</p>`;
  if (p.stock <= 3) return `<p class="stock stock-low" data-testid="stock-status">Only ${p.stock} left</p>`;
  return `<p class="stock stock-in" data-testid="stock-status">In stock</p>`;
}

export function stars(rating) {
  const full = Math.round(rating);
  return `<span class="stars" aria-hidden="true">${'★'.repeat(full)}${'☆'.repeat(5 - full)}</span>`;
}

export const spinner = (text = 'Loading…') =>
  `<div class="loading" role="status"><span class="spinner" aria-hidden="true"></span>${esc(text)}</div>`;

/** Accessible tabs: role=tablist with role=tab buttons controlling role=tabpanel elements. */
export function setupTabs(root) {
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const select = (tab, focus = false) => {
    for (const t of tabs) {
      const selected = t === tab;
      t.setAttribute('aria-selected', String(selected));
      t.tabIndex = selected ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !selected;
    }
    if (focus) tab.focus();
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      const delta = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (delta) select(tabs[(i + delta + tabs.length) % tabs.length], true);
      if (e.key === 'Home') select(tabs[0], true);
      if (e.key === 'End') select(tabs[tabs.length - 1], true);
    });
  });
  select(tabs.find((t) => t.getAttribute('aria-selected') === 'true') ?? tabs[0]);
  return { select: (id) => select(tabs.find((t) => t.id === id)) };
}

/**
 * Styled confirmation dialog (a <dialog> element, unlike the native window.confirm()).
 * If `requireText` is set, the user must type that text before confirming.
 */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, requireText = null }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'modal';
    dlg.setAttribute('aria-labelledby', 'confirm-title');
    dlg.innerHTML = `
      <form method="dialog" class="modal-body">
        <h2 id="confirm-title">${esc(title)}</h2>
        <p>${esc(message)}</p>
        ${requireText ? `
          <div class="field">
            <label for="confirm-text">Type <strong>${esc(requireText)}</strong> to confirm</label>
            <input id="confirm-text" autocomplete="off">
          </div>` : ''}
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" value="cancel">Cancel</button>
          <button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" value="ok" ${requireText ? 'disabled' : ''}>${esc(confirmLabel)}</button>
        </div>
      </form>`;
    document.body.append(dlg);
    const ok = dlg.querySelector('button[value="ok"]');
    dlg.querySelector('button[value="cancel"]').addEventListener('click', () => dlg.close('cancel'));
    if (requireText) {
      dlg.querySelector('#confirm-text').addEventListener('input', (e) => {
        ok.disabled = e.target.value !== requireText;
      });
    }
    dlg.addEventListener('close', () => {
      resolve(dlg.returnValue === 'ok');
      dlg.remove();
    });
    dlg.showModal();
  });
}

export function downloadFile(filename, content, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Order totals list used by the cart, checkout and confirmation pages. */
export function summaryTable(t) {
  return `
    <dl class="totals" data-testid="order-totals">
      <div><dt>Subtotal</dt><dd data-testid="subtotal">${money(t.subtotal)}</dd></div>
      ${t.discount ? `<div><dt>Discount</dt><dd data-testid="discount">−${money(t.discount)}</dd></div>` : ''}
      <div>
        <dt>Shipping
          <span class="tooltip">
            <button type="button" class="tooltip-trigger" aria-describedby="shipping-tip">?</button>
            <span role="tooltip" id="shipping-tip">Free standard shipping on orders of ${money(PRICING.freeShippingMin)} or more, otherwise ${money(PRICING.shipping)}.</span>
          </span>
        </dt>
        <dd data-testid="shipping">${t.shipping ? money(t.shipping) : 'Free'}</dd>
      </div>
      <div><dt>Tax (8%)</dt><dd data-testid="tax">${money(t.tax)}</dd></div>
      <div class="total"><dt>Total</dt><dd data-testid="total">${money(t.total)}</dd></div>
    </dl>`;
}
