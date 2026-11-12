// Form helpers. Convention: every control has an error element with id "<control id>-error"
// that the control references through aria-describedby.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { id: 'lower', label: 'One lowercase letter', test: (v) => /[a-z]/.test(v) },
  { id: 'number', label: 'One number', test: (v) => /\d/.test(v) },
  { id: 'special', label: 'One special character', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

export const passwordValid = (v) => PASSWORD_RULES.every((r) => r.test(v));

export function setError(el, message) {
  const err = document.getElementById(el.id + '-error');
  el.setAttribute('aria-invalid', 'true');
  if (err) {
    err.textContent = message;
    err.hidden = false;
  }
}

export function clearError(el) {
  const err = document.getElementById(el.id + '-error');
  el.removeAttribute('aria-invalid');
  if (err) {
    err.textContent = '';
    err.hidden = true;
  }
}

export function clearErrors(form) {
  form.querySelectorAll('[aria-invalid]').forEach(clearError);
  form.querySelectorAll('.error').forEach((e) => {
    e.textContent = '';
    e.hidden = true;
  });
}

export function focusFirstError(form) {
  const first = form.querySelector('[aria-invalid="true"]');
  if (!first) return;
  const target = first.matches('fieldset') ? first.querySelector('input') : first;
  target?.focus();
}

/** Clears a field's error as soon as the user edits it. */
export function clearOnInput(form) {
  form.addEventListener('input', (e) => {
    const el = e.target.closest('[aria-invalid="true"]') ?? e.target.closest('fieldset[aria-invalid="true"]');
    if (el) clearError(el);
  });
  form.addEventListener('change', (e) => {
    const fs = e.target.closest('fieldset[aria-invalid="true"]');
    if (fs) clearError(fs);
  });
}

/** Renders the live password checklist and strength meter. */
export function bindPasswordRules(input, listEl, meterEl) {
  listEl.innerHTML = PASSWORD_RULES.map(
    (r) => `<li data-rule="${r.id}" class="rule">${r.label}</li>`,
  ).join('');
  const update = () => {
    const v = input.value;
    let met = 0;
    for (const r of PASSWORD_RULES) {
      const ok = r.test(v);
      if (ok) met++;
      const li = listEl.querySelector(`[data-rule="${r.id}"]`);
      li.classList.toggle('met', ok);
      li.setAttribute('aria-label', `${r.label}: ${ok ? 'met' : 'not met'}`);
    }
    if (meterEl) {
      const labels = ['', 'Very weak', 'Weak', 'Fair', 'Good', 'Strong'];
      const score = v ? met : 0;
      meterEl.dataset.score = String(score);
      meterEl.querySelector('.meter-bar').style.width = `${score * 20}%`;
      meterEl.querySelector('.meter-label').textContent = score ? `Strength: ${labels[score]}` : '';
    }
  };
  input.addEventListener('input', update);
  update();
}

/**
 * Wires a "Show password" toggle button. Password fields are text inputs hidden with CSS
 * (class "masked"), so browsers don't offer to save the shop's fake test passwords.
 */
export function bindPasswordToggle(button, input) {
  button.addEventListener('click', () => {
    const show = !input.classList.contains('revealed');
    input.classList.toggle('revealed', show);
    button.setAttribute('aria-pressed', String(show));
    button.textContent = show ? 'Hide' : 'Show';
  });
}
