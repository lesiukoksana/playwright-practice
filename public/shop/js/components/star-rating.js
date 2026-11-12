// <star-rating label="Your rating" name="rating"></star-rating>
// A custom element that renders its stars inside an (open) shadow root.
// It exposes `.value` and fires a "change" event that crosses the shadow boundary.

const LABELS = ['', 'Terrible', 'Poor', 'Average', 'Good', 'Excellent'];

class StarRating extends HTMLElement {
  #value = 0;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    if (this.shadowRoot.childElementCount) return;
    const label = this.getAttribute('label') ?? 'Rating';
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: inline-flex; align-items: center; gap: .5rem; }
        .stars { display: inline-flex; gap: 2px; }
        button { font-size: 1.75rem; line-height: 1; background: none; border: 0; padding: 2px; cursor: pointer; color: #cbd5e1; border-radius: 4px; }
        button.on { color: #f59e0b; }
        button:focus-visible { outline: 2px solid #4f46e5; outline-offset: 1px; }
        .text { font-size: .9rem; color: #475569; min-width: 6rem; }
        :host([invalid]) .stars { outline: 2px solid #b91c1c; border-radius: 6px; }
      </style>
      <div class="stars" role="radiogroup" aria-label="${label}">
        ${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" aria-checked="false" aria-label="${n} star${n > 1 ? 's' : ''}" data-value="${n}" tabindex="${n === 1 ? 0 : -1}">★</button>`).join('')}
      </div>
      <span class="text" part="text" aria-live="polite"></span>`;

    const buttons = [...this.shadowRoot.querySelectorAll('button')];
    buttons.forEach((b, i) => {
      b.addEventListener('click', () => this.#select(i + 1));
      b.addEventListener('mouseenter', () => this.#paint(i + 1));
      b.addEventListener('keydown', (e) => {
        const delta = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
        if (!delta) return;
        e.preventDefault();
        const next = Math.min(5, Math.max(1, (this.#value || i + 1) + delta));
        this.#select(next);
        buttons[next - 1].focus();
      });
    });
    this.shadowRoot.querySelector('.stars').addEventListener('mouseleave', () => this.#paint(this.#value));
    this.#update();
  }

  get value() {
    return this.#value;
  }

  set value(v) {
    this.#value = Math.max(0, Math.min(5, Number(v) || 0));
    this.#update();
  }

  #select(n) {
    this.#value = n;
    this.removeAttribute('invalid');
    this.#update();
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  #paint(n) {
    this.shadowRoot.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i < n));
  }

  #update() {
    if (!this.shadowRoot.childElementCount) return;
    this.#paint(this.#value);
    this.shadowRoot.querySelectorAll('button').forEach((b, i) => {
      const checked = i + 1 === this.#value;
      b.setAttribute('aria-checked', String(checked));
      b.tabIndex = checked || (!this.#value && i === 0) ? 0 : -1;
    });
    this.shadowRoot.querySelector('.text').textContent = this.#value ? `${this.#value} – ${LABELS[this.#value]}` : 'Not rated';
  }
}

customElements.define('star-rating', StarRating);
