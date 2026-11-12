import { addDays, attachDatePicker, parseIso, startOfDay, toIso } from '../components/date-picker.js';
import { initLayout, requireAuth } from '../layout.js';
import {
  bug, calcTotals, createOrder, delay, esc, getCart, getPromo, loadProducts, money, saveCart, savePromo, fullName,
} from '../store.js';
import { clearErrors, clearOnInput, focusFirstError, setError } from '../forms.js';
import { spinner, summaryTable } from '../ui.js';

const REGIONS = {
  US: {
    regionLabel: 'State', postalLabel: 'ZIP code', postalHint: '5 digits, e.g. 94105',
    // B07: US ZIP accepts 4 digits.
    postal: () => (bug('B07') ? /^\d{4,5}$/ : /^\d{5}$/),
    options: ['Alabama', 'Alaska', 'Arizona', 'California', 'Colorado', 'Florida', 'Georgia', 'Illinois', 'New York', 'Texas', 'Washington'],
  },
  GB: {
    regionLabel: 'County', postalLabel: 'Postcode', postalHint: 'e.g. SW1A 1AA',
    postal: () => /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i,
    options: ['Greater London', 'Greater Manchester', 'West Midlands', 'Merseyside', 'Kent', 'Essex'],
  },
  CA: {
    regionLabel: 'Province', postalLabel: 'Postal code', postalHint: 'e.g. K1A 0B1',
    postal: () => /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i,
    options: ['Alberta', 'British Columbia', 'Manitoba', 'Nova Scotia', 'Ontario', 'Quebec'],
  },
};
const DECLINED_CARD = '4000000000000002';

const $ = (id) => document.getElementById(id);
const user = requireAuth();
let lines = [];
const order = { shipping: null, payment: null, delivery: 'standard', deliveryDate: '' };

// ---------------------------------------------------------------- helpers

const delivery = () => document.querySelector('input[name="delivery"]:checked').value;

function earliestDate(method) {
  let d = addDays(startOfDay(), method === 'express' ? 1 : 3);
  while ([0, 6].includes(d.getDay())) d = addDays(d, 1);
  return d;
}

function isDeliveryDateDisabled(d) {
  return [0, 6].includes(d.getDay()) || d < earliestDate(delivery()) || d > addDays(startOfDay(), 30);
}

function totals() {
  return calcTotals(lines, getPromo(), delivery());
}

function renderSummary() {
  const t = totals();
  $('mini-cart').innerHTML = lines.map((l) => `
    <li><span>${l.qty} × ${esc(l.product.name)}${l.size ? ` <span class="muted">(${esc(l.size)})</span>` : ''}</span><span>${money(l.price * l.qty)}</span></li>`).join('');
  $('checkout-totals').innerHTML = summaryTable(t);
  const standard = calcTotals(lines, getPromo(), 'standard').shipping;
  $('standard-price').textContent = standard ? money(standard) : 'Free';
  $('earliest-date').textContent = toIso(earliestDate(delivery()));
}

function showStep(n) {
  [1, 2, 3].forEach((i) => ($(`step-${i}`).hidden = i !== n));
  document.querySelectorAll('.stepper li').forEach((li) => {
    const step = Number(li.dataset.step);
    li.classList.toggle('done', step < n);
    if (step === n) li.setAttribute('aria-current', 'step');
    else li.removeAttribute('aria-current');
  });
  $(`step-${n}-title`).focus();
  window.scrollTo({ top: 0 });
}

// ---------------------------------------------------------------- step 1: shipping

function setupShipping() {
  const form = $('shipping-form');
  clearOnInput(form);
  $('full-name').value = fullName(user);
  $('phone').value = user.phone ?? '';

  $('country').addEventListener('change', () => {
    const c = REGIONS[$('country').value];
    const region = $('region');
    $('region-label').textContent = c ? c.regionLabel : 'State / region';
    $('postal-label').textContent = c ? c.postalLabel : 'Postal code';
    $('postal-hint').textContent = c ? c.postalHint : '';
    region.disabled = !c;
    region.innerHTML = c
      ? `<option value="">Select a ${c.regionLabel.toLowerCase()}</option>${c.options.map((o) => `<option>${o}</option>`).join('')}`
      : '<option value="">Select a country first</option>';
  });

  attachDatePicker($('delivery-date'), $('delivery-date-button'), { isDisabled: isDeliveryDateDisabled });
  form.querySelectorAll('input[name="delivery"]').forEach((r) => r.addEventListener('change', renderSummary));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearErrors(form);
    const v = (id) => $(id).value.trim();
    if (!v('full-name')) setError($('full-name'), 'Full name is required.');
    if (!v('address1')) setError($('address1'), 'Address is required.');
    if (!v('city')) setError($('city'), 'City is required.');
    const c = REGIONS[v('country')];
    if (!c) setError($('country'), 'Select a country.');
    else {
      if (!v('region')) setError($('region'), `Select a ${c.regionLabel.toLowerCase()}.`);
      if (!v('postal')) setError($('postal'), `${c.postalLabel} is required.`);
      else if (!c.postal().test(v('postal'))) setError($('postal'), `Enter a valid ${c.postalLabel} (${c.postalHint}).`);
    }
    const digits = v('phone').replace(/[\s()-]/g, '');
    if (!digits) setError($('phone'), 'Phone number is required.');
    else if (!/^\+?\d{7,15}$/.test(digits)) setError($('phone'), 'Enter a valid phone number.');

    const date = parseIso(v('delivery-date'));
    if (!v('delivery-date')) setError($('delivery-date'), 'Choose a delivery date.');
    else if (!date) setError($('delivery-date'), 'Enter the date as YYYY-MM-DD.');
    else if (isDeliveryDateDisabled(date)) setError($('delivery-date'), 'This date is not available. Choose a weekday within the allowed range.');

    if (form.querySelector('[aria-invalid="true"]')) return focusFirstError(form);

    order.shipping = {
      fullName: v('full-name'), address1: v('address1'), address2: v('address2'), city: v('city'),
      country: v('country'), region: v('region'), postal: v('postal').toUpperCase(), phone: v('phone'),
    };
    order.delivery = delivery();
    order.deliveryDate = v('delivery-date');
    showStep(2);
  });
}

// ---------------------------------------------------------------- step 2: payment

function luhn(num) {
  let sum = 0;
  for (let i = 0; i < num.length; i++) {
    let d = Number(num[num.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

function cardBrand(num) {
  if (/^4/.test(num)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(num)) return 'Mastercard';
  if (/^3[47]/.test(num)) return 'American Express';
  return '';
}

function setupPayment() {
  const form = $('payment-form');
  clearOnInput(form);
  $('card-name').value = fullName(user);

  form.querySelectorAll('input[name="method"]').forEach((r) => r.addEventListener('change', () => {
    const card = form.method.value === 'card';
    $('card-fields').hidden = !card;
    $('cod-note').hidden = card;
  }));

  // Auto-format: groups of 4 digits (4-6-5 for Amex).
  $('card-number').addEventListener('input', (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 19);
    const brand = cardBrand(digits);
    const groups = brand === 'American Express'
      ? [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10, 15)]
      : digits.match(/.{1,4}/g) ?? [];
    e.target.value = groups.filter(Boolean).join(' ');
    $('card-brand').textContent = brand;
  });
  $('card-expiry').addEventListener('input', (e) => {
    let d = e.target.value.replace(/\D/g, '').slice(0, 4);
    if (d.length >= 3) d = `${d.slice(0, 2)}/${d.slice(2)}`;
    e.target.value = d;
  });
  $('card-cvv').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '');
  });

  form.querySelector('[data-goto="1"]').addEventListener('click', () => showStep(1));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearErrors(form);
    if (form.method.value === 'cod') {
      order.payment = { method: 'cod' };
      renderReview();
      return showStep(3);
    }
    const name = $('card-name').value.trim();
    const num = $('card-number').value.replace(/\s/g, '');
    const brand = cardBrand(num);
    const exp = $('card-expiry').value.trim();
    const cvv = $('card-cvv').value.trim();

    if (!name) setError($('card-name'), 'Name on card is required.');
    if (!num) setError($('card-number'), 'Card number is required.');
    else if (!brand) setError($('card-number'), 'We accept Visa, Mastercard and American Express.');
    else if (num.length !== (brand === 'American Express' ? 15 : 16) || !luhn(num)) setError($('card-number'), 'Enter a valid card number.');

    const m = /^(\d{2})\/(\d{2})$/.exec(exp);
    if (!exp) setError($('card-expiry'), 'Expiry date is required.');
    else if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) setError($('card-expiry'), 'Enter the expiry date as MM/YY.');
    else {
      const endOfMonth = new Date(2000 + Number(m[2]), Number(m[1]), 0, 23, 59, 59);
      if (endOfMonth < new Date()) setError($('card-expiry'), 'This card has expired.');
    }
    const cvvLen = brand === 'American Express' ? 4 : 3;
    if (!cvv) setError($('card-cvv'), 'Security code is required.');
    else if (!new RegExp(`^\\d{${cvvLen}}$`).test(cvv)) setError($('card-cvv'), `Security code must be ${cvvLen} digits.`);

    if (form.querySelector('[aria-invalid="true"]')) return focusFirstError(form);
    order.payment = { method: 'card', brand, last4: num.slice(-4), number: num };
    renderReview();
    showStep(3);
  });
}

// ---------------------------------------------------------------- step 3: review & place order

function renderReview() {
  const s = order.shipping;
  const countries = { US: 'United States', GB: 'United Kingdom', CA: 'Canada' };
  $('order-error').hidden = true;
  $('review-content').innerHTML = `
    <div class="review-grid">
      <div>
        <h3>Ship to <button type="button" class="link-button" data-goto="1">Edit</button></h3>
        <address data-testid="review-address">
          ${esc(s.fullName)}<br>${esc(s.address1)}${s.address2 ? `, ${esc(s.address2)}` : ''}<br>
          ${esc(s.city)}, ${esc(s.region)} ${esc(s.postal)}<br>${countries[s.country]}<br>${esc(s.phone)}
        </address>
      </div>
      <div>
        <h3>Delivery</h3>
        <p data-testid="review-delivery">${order.delivery === 'express' ? 'Express' : 'Standard'} · ${esc(order.deliveryDate)}</p>
      </div>
      <div>
        <h3>Payment <button type="button" class="link-button" data-goto="2">Edit</button></h3>
        <p data-testid="review-payment">${order.payment.method === 'cod' ? 'Pay on delivery' : `${esc(order.payment.brand)} ending in ${esc(order.payment.last4)}`}</p>
      </div>
    </div>`;
}

function setupPlaceOrder() {
  const form = $('place-form');
  clearOnInput(form);
  document.getElementById('step-3').addEventListener('click', (e) => {
    const go = e.target.closest('[data-goto]');
    if (go) showStep(Number(go.dataset.goto));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    $('order-error').hidden = true;
    if (!$('accept-terms').checked) {
      setError($('accept-terms'), 'You must accept the Terms and Conditions.');
      return $('accept-terms').focus();
    }
    const button = $('place-order');
    button.disabled = true;
    button.innerHTML = '<span class="spinner spinner-sm" aria-hidden="true"></span> Processing payment…';
    await delay(2000);

    if (order.payment.number === DECLINED_CARD) {
      $('order-error').textContent = 'Your card was declined. Please use a different card.';
      $('order-error').hidden = false;
      button.disabled = false;
      button.textContent = 'Place order';
      return;
    }

    const t = totals();
    const { number, ...payment } = order.payment;
    const created = createOrder(user.email, {
      items: lines.map((l) => ({ id: l.id, name: l.product.name, price: l.price, qty: l.qty, size: l.size })),
      totals: { subtotal: t.subtotal, discount: t.discount, shipping: t.shipping, tax: t.tax, total: t.total },
      promo: t.promo?.code ?? null,
      delivery: order.delivery,
      deliveryDate: order.deliveryDate,
      shipping: order.shipping,
      payment,
    });
    saveCart([]);
    savePromo(null);
    location.href = `confirmation.html?order=${created.id}`;
  });
}

// ---------------------------------------------------------------- init

async function main() {
  initLayout();
  const main = document.querySelector('.checkout-layout');
  const items = getCart();
  if (!items.length) {
    location.replace('cart.html');
    return;
  }
  const backup = main.innerHTML;
  main.innerHTML = spinner('Loading checkout…');
  const products = await loadProducts();
  main.innerHTML = backup;
  lines = items
    .map((i) => ({ ...i, product: products.find((p) => p.id === i.id) }))
    .filter((l) => l.product)
    .map((l) => ({ ...l, price: l.product.price }));

  setupShipping();
  setupPayment();
  setupPlaceOrder();
  renderSummary();
  showStep(1);
}

if (user) main();
