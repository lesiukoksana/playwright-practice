// Shared page chrome: header, footer, toasts, cookie banner, newsletter popup,
// support chat widget (iframe), bug-mode banner and auth guards.
import {
  activeBugs, cartCount, currentUser, esc, fullName, logout, resetAllData, setFlash, storage, takeFlash,
} from './store.js';
import { EMAIL_RE } from './forms.js';

const currentPage = () => (location.pathname.split('/').pop() || 'index.html') + location.search;

/** Redirects to the login page if nobody is logged in. Returns the user or null. */
export function requireAuth() {
  const user = currentUser();
  if (!user) {
    location.replace('login.html?returnUrl=' + encodeURIComponent(currentPage()));
    return null;
  }
  return user;
}

export function initLayout({ active = '', chat = true } = {}) {
  renderBugBanner();
  renderHeader(active);
  renderFooter();
  ensureToastRegion();
  setupCookieBanner();
  if (chat) setupChat();
  const flash = takeFlash();
  if (flash) toast(flash.message, flash.type);
  window.addEventListener('cart:change', updateCartBadge);
  window.addEventListener('storage', updateCartBadge);
}

// ---------------------------------------------------------------- header

function renderHeader(active) {
  const host = document.getElementById('app-header');
  if (!host) return;
  const user = currentUser();
  const link = (key, href, label) =>
    `<a href="${href}" ${active === key ? 'aria-current="page"' : ''}>${label}</a>`;

  host.innerHTML = `
    <a class="skip-link" href="#main">Skip to main content</a>
    <header class="site-header">
      <div class="container header-inner">
        <a class="logo" href="index.html"><span aria-hidden="true">🛒</span> PracticeShop</a>
        <nav class="main-nav" aria-label="Main">
          ${link('shop', 'index.html', 'Shop')}
          ${user ? link('wishlist', 'wishlist.html', 'Wishlist') : ''}
          ${user ? link('orders', 'orders.html', 'Orders') : ''}
          ${user?.role === 'admin' ? link('admin', 'admin.html', 'Admin') : ''}
        </nav>
        <div class="header-actions">
          <a class="cart-link" href="cart.html" ${active === 'cart' ? 'aria-current="page"' : ''}>
            <span aria-hidden="true">🛍️</span> Cart <span class="badge" data-testid="cart-count"></span>
          </a>
          ${user ? userMenu(user) : `
            <a class="btn btn-secondary btn-sm" href="login.html">Log in</a>
            <a class="btn btn-primary btn-sm" href="register.html">Sign up</a>`}
        </div>
      </div>
    </header>`;
  updateCartBadge();
  if (user) bindUserMenu(host);
}

function userMenu(user) {
  const initials = (user.firstName?.[0] ?? '') + (user.lastName?.[0] ?? '');
  const avatar = user.avatar
    ? `<img class="avatar-sm" src="${user.avatar}" alt="">`
    : `<span class="avatar-sm" aria-hidden="true">${esc(initials.toUpperCase())}</span>`;
  return `
    <div class="user-menu">
      <button type="button" class="user-menu-button" aria-haspopup="menu" aria-expanded="false" aria-controls="user-menu-list" data-testid="user-menu">
        ${avatar}<span class="user-name">${esc(fullName(user))}</span> <span aria-hidden="true">▾</span>
      </button>
      <ul class="user-menu-list" id="user-menu-list" role="menu" aria-label="Account" hidden>
        <li role="none"><a role="menuitem" href="profile.html">Profile</a></li>
        <li role="none"><a role="menuitem" href="orders.html">My orders</a></li>
        <li role="none"><a role="menuitem" href="wishlist.html">Wishlist</a></li>
        <li role="none"><button type="button" role="menuitem" data-action="logout">Log out</button></li>
      </ul>
    </div>`;
}

// The menu opens on hover (with a short close delay) and on click.
function bindUserMenu(host) {
  const wrap = host.querySelector('.user-menu');
  const button = wrap.querySelector('.user-menu-button');
  const list = wrap.querySelector('.user-menu-list');
  let closeTimer;
  const open = (state) => {
    clearTimeout(closeTimer);
    list.hidden = !state;
    button.setAttribute('aria-expanded', String(state));
  };
  wrap.addEventListener('mouseenter', () => open(true));
  wrap.addEventListener('mouseleave', () => {
    closeTimer = setTimeout(() => open(false), 300);
  });
  // A mouse click always opens (hover already did); keyboard activation (detail 0) toggles.
  button.addEventListener('click', (e) => open(e.detail === 0 ? list.hidden : true));
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      open(false);
      button.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) open(false);
  });
  list.querySelector('[data-action="logout"]').addEventListener('click', () => {
    logout();
    setFlash('You have been logged out.');
    location.href = 'login.html';
  });
}

export function updateCartBadge() {
  const badge = document.querySelector('[data-testid="cart-count"]');
  if (!badge) return;
  const n = cartCount();
  badge.textContent = String(n);
  badge.hidden = n === 0;
  badge.closest('a').setAttribute('aria-label', `Cart, ${n} ${n === 1 ? 'item' : 'items'}`);
}

// ---------------------------------------------------------------- footer & banners

function renderFooter() {
  const host = document.getElementById('app-footer');
  if (!host) return;
  host.innerHTML = `
    <footer class="site-footer">
      <div class="container footer-inner">
        <p>PracticeShop is a demo store for practicing Playwright. Nothing here is real.</p>
        <div class="footer-actions">
          <a href="index.html?bugs=1">Turn on bug mode</a>
          <button type="button" class="link-button" data-action="reset">Reset demo data</button>
        </div>
      </div>
    </footer>`;
  host.querySelector('[data-action="reset"]').addEventListener('click', () => {
    // Native confirm() on purpose: practice page.on('dialog').
    if (window.confirm('Reset all demo data? Users, carts, orders and products return to their initial state.')) {
      resetAllData();
      setFlash('Demo data has been reset.');
      location.href = 'index.html';
    }
  });
}

function renderBugBanner() {
  const bugs = activeBugs();
  if (!bugs.length) return;
  const el = document.createElement('div');
  el.className = 'bug-banner';
  el.dataset.testid = 'bug-banner';
  el.innerHTML = `<span aria-hidden="true">🐞</span> Bug mode is on (${bugs.length === 12 ? 'all bugs' : esc(bugs.join(', '))}). <a href="${location.pathname}?bugs=0">Turn off</a>`;
  document.body.prepend(el);
}

function setupCookieBanner() {
  if (storage.get('cookieConsent')) return;
  // Appears after a delay and covers the bottom of the page until dismissed.
  setTimeout(() => {
    if (storage.get('cookieConsent') || document.querySelector('.cookie-banner')) return;
    const el = document.createElement('section');
    el.className = 'cookie-banner';
    el.setAttribute('aria-label', 'Cookie consent');
    el.dataset.testid = 'cookie-banner';
    el.innerHTML = `
      <p>We use cookies to improve your shopping experience. You can accept all cookies or reject the optional ones.</p>
      <div class="cookie-actions">
        <button type="button" class="btn btn-secondary" data-choice="rejected">Reject optional</button>
        <button type="button" class="btn btn-primary" data-choice="accepted">Accept all</button>
      </div>`;
    el.addEventListener('click', (e) => {
      const choice = e.target.closest('[data-choice]')?.dataset.choice;
      if (!choice) return;
      storage.set('cookieConsent', choice);
      el.remove();
    });
    document.body.append(el);
  }, 1000);
}

/** Newsletter popup: shown once, a few seconds after the page loads (catalog page only). */
export function setupNewsletterPopup(delayMs = 4000) {
  if (storage.get('newsletterDismissed')) return;
  setTimeout(() => {
    if (storage.get('newsletterDismissed')) return;
    const dlg = document.createElement('dialog');
    dlg.className = 'modal newsletter';
    dlg.setAttribute('aria-labelledby', 'newsletter-title');
    dlg.dataset.testid = 'newsletter-popup';
    dlg.innerHTML = `
      <button type="button" class="modal-close" aria-label="Close">×</button>
      <form class="modal-body" novalidate>
        <h2 id="newsletter-title">Get 10% off your first order</h2>
        <p>Subscribe to our newsletter and we'll send you a code.</p>
        <div class="field">
          <label for="newsletter-email">Email address</label>
          <input id="newsletter-email" type="email" autocomplete="email" aria-describedby="newsletter-email-error">
          <p class="error" id="newsletter-email-error" hidden></p>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" data-action="dismiss">No thanks</button>
          <button type="submit" class="btn btn-primary">Subscribe</button>
        </div>
      </form>`;
    document.body.append(dlg);
    const close = () => {
      storage.set('newsletterDismissed', true);
      dlg.close();
      dlg.remove();
    };
    dlg.querySelector('.modal-close').addEventListener('click', close);
    dlg.querySelector('[data-action="dismiss"]').addEventListener('click', close);
    dlg.addEventListener('cancel', () => storage.set('newsletterDismissed', true));
    dlg.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = dlg.querySelector('#newsletter-email');
      const err = dlg.querySelector('#newsletter-email-error');
      if (!EMAIL_RE.test(input.value.trim())) {
        input.setAttribute('aria-invalid', 'true');
        err.textContent = 'Enter a valid email address.';
        err.hidden = false;
        return;
      }
      close();
      toast('Thanks for subscribing! Use code SAVE10 at checkout.');
    });
    dlg.showModal();
  }, delayMs);
}

// ---------------------------------------------------------------- support chat (iframe)

function setupChat() {
  const wrap = document.createElement('div');
  wrap.className = 'chat-widget';
  wrap.innerHTML = `
    <div class="chat-panel" id="chat-panel" hidden>
      <div class="chat-panel-header">
        <span>Customer support</span>
        <button type="button" class="modal-close" aria-label="Close chat">×</button>
      </div>
    </div>
    <button type="button" class="chat-toggle" aria-expanded="false" aria-controls="chat-panel">
      <span aria-hidden="true">💬</span> Chat with us
    </button>`;
  document.body.append(wrap);
  const panel = wrap.querySelector('#chat-panel');
  const toggle = wrap.querySelector('.chat-toggle');
  const setOpen = (open) => {
    // The iframe is created lazily the first time the chat is opened.
    if (open && !panel.querySelector('iframe')) {
      const frame = document.createElement('iframe');
      frame.title = 'Support chat';
      frame.src = 'chat.html';
      panel.append(frame);
    }
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  panel.querySelector('.modal-close').addEventListener('click', () => setOpen(false));
}

// ---------------------------------------------------------------- toasts

function ensureToastRegion() {
  if (document.getElementById('toast-region')) return;
  const region = document.createElement('div');
  region.id = 'toast-region';
  region.className = 'toast-region';
  document.body.append(region);
}

/** Shows a notification that disappears after `timeout` ms. */
export function toast(message, type = 'success', timeout = 3000) {
  ensureToastRegion();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.dataset.testid = 'toast';
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `<span class="toast-message">${esc(message)}</span><button type="button" class="toast-close" aria-label="Dismiss notification">×</button>`;
  const remove = () => el.remove();
  el.querySelector('button').addEventListener('click', remove);
  document.getElementById('toast-region').append(el);
  setTimeout(remove, timeout);
}
