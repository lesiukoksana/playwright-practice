// A small custom date picker. The input still accepts typed dates (YYYY-MM-DD);
// the "Choose date" button opens a calendar popup with disabled days.

const pad = (n) => String(n).padStart(2, '0');
export const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function parseIso(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return toIso(d) === value.trim() ? d : null;
}

export function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const LONG = new Intl.DateTimeFormat('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

/**
 * @param {HTMLInputElement} input
 * @param {HTMLButtonElement} button
 * @param {{ isDisabled: (d: Date) => boolean }} options
 */
export function attachDatePicker(input, button, { isDisabled }) {
  const popup = document.createElement('div');
  popup.className = 'datepicker';
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-label', 'Choose date');
  popup.hidden = true;
  button.after(popup);

  let view = startOfDay();

  function render() {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // weeks start on Monday
    const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const selected = input.value.trim();
    const today = toIso(new Date());
    let cells = '';
    for (let i = 0; i < offset; i++) cells += '<td></td>';
    for (let day = 1; day <= days; day++) {
      const d = new Date(view.getFullYear(), view.getMonth(), day);
      const iso = toIso(d);
      if ((offset + day - 1) % 7 === 0 && day !== 1) cells += '</tr><tr>';
      cells += `<td><button type="button" data-date="${iso}" aria-label="${LONG.format(d)}"
        ${isDisabled(d) ? 'disabled' : ''} ${iso === selected ? 'aria-pressed="true" class="selected"' : ''}
        ${iso === today ? 'aria-current="date"' : ''}>${day}</button></td>`;
    }
    popup.innerHTML = `
      <div class="dp-header">
        <button type="button" data-nav="-1" aria-label="Previous month">‹</button>
        <h3 aria-live="polite">${MONTH.format(view)}</h3>
        <button type="button" data-nav="1" aria-label="Next month">›</button>
      </div>
      <table>
        <thead><tr>${['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => `<th scope="col">${d}</th>`).join('')}</tr></thead>
        <tbody><tr>${cells}</tr></tbody>
      </table>
      <div class="dp-footer"><button type="button" class="link-button" data-action="close">Close</button></div>`;
  }

  function open() {
    view = parseIso(input.value) ?? startOfDay();
    view.setDate(1);
    render();
    popup.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    (popup.querySelector('button.selected') ?? popup.querySelector('td button:not([disabled])'))?.focus();
  }

  function close(focusInput = true) {
    popup.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (focusInput) input.focus();
  }

  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', () => (popup.hidden ? open() : close()));

  popup.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      view = new Date(view.getFullYear(), view.getMonth() + Number(nav.dataset.nav), 1);
      render();
      return;
    }
    if (e.target.closest('[data-action="close"]')) return close();
    const day = e.target.closest('[data-date]');
    if (day && !day.disabled) {
      input.value = day.dataset.date;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      close();
    }
  });
  popup.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  });
  document.addEventListener('click', (e) => {
    // composedPath() still includes nodes that were re-rendered during the click.
    const path = e.composedPath();
    if (!popup.hidden && !path.includes(popup) && !path.includes(button)) close(false);
  });
}
