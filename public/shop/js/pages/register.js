import { initLayout } from '../layout.js';
import { bug, esc, login, registerUser, setFlash } from '../store.js';
import {
  bindPasswordRules, bindPasswordToggle, clearErrors, clearOnInput, EMAIL_RE, passwordValid, setError,
} from '../forms.js';

initLayout();

const $ = (id) => document.getElementById(id);
const form = $('register-form');
const f = {
  firstName: $('first-name'), lastName: $('last-name'), email: $('email'), password: $('password'),
  confirm: $('confirm-password'), dob: $('dob'), company: $('company'), terms: $('terms'), newsletter: $('newsletter'),
};
const summary = $('error-summary');

bindPasswordRules(f.password, $('password-rules'), $('password-meter'));
bindPasswordToggle($('toggle-password'), f.password);
clearOnInput(form);

// Dependent field: "Company name" appears only for business accounts.
form.querySelectorAll('input[name="accountType"]').forEach((r) => r.addEventListener('change', () => {
  $('company-field').hidden = form.accountType.value !== 'business';
}));

// Terms dialog: "I agree" is enabled only after scrolling to the bottom.
const dlg = $('terms-dialog');
const scrollBox = dlg.querySelector('.scroll-box');
$('open-terms').addEventListener('click', () => dlg.showModal());
dlg.querySelector('[data-action="close"]').addEventListener('click', () => dlg.close());
scrollBox.addEventListener('scroll', () => {
  if (scrollBox.scrollTop + scrollBox.clientHeight >= scrollBox.scrollHeight - 4) {
    dlg.querySelector('[data-action="agree"]').disabled = false;
  }
});
dlg.querySelector('[data-action="agree"]').addEventListener('click', () => {
  f.terms.checked = true;
  f.terms.dispatchEvent(new Event('input', { bubbles: true }));
  dlg.close();
});

function age(dateStr) {
  const dob = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  if (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) years--;
  return years;
}

function validate() {
  const nameRe = /^[A-Za-zÀ-ÿ' -]{2,40}$/;
  for (const [el, label] of [[f.firstName, 'First name'], [f.lastName, 'Last name']]) {
    const v = el.value.trim();
    if (!v) setError(el, `${label} is required.`);
    else if (!nameRe.test(v)) setError(el, `${label} must be 2–40 letters.`);
  }
  const email = f.email.value.trim();
  if (!email) setError(f.email, 'Email is required.');
  else if (!EMAIL_RE.test(email)) setError(f.email, 'Enter a valid email address.');

  if (!f.password.value) setError(f.password, 'Password is required.');
  else if (!passwordValid(f.password.value)) setError(f.password, 'Password does not meet all requirements.');

  // B04: the confirmation is never compared with the password.
  if (!f.confirm.value) setError(f.confirm, 'Please confirm your password.');
  else if (!bug('B04') && f.confirm.value !== f.password.value) setError(f.confirm, 'Passwords do not match.');

  if (!f.dob.value) setError(f.dob, 'Date of birth is required.');
  else if (new Date(f.dob.value) > new Date()) setError(f.dob, 'Date of birth cannot be in the future.');
  else if (age(f.dob.value) < 18) setError(f.dob, 'You must be at least 18 years old.');
  else if (age(f.dob.value) > 120) setError(f.dob, 'Enter a valid date of birth.');

  if (form.accountType.value === 'business' && !f.company.value.trim()) setError(f.company, 'Company name is required for business accounts.');
  if (!f.terms.checked) setError(f.terms, 'You must accept the Terms and Conditions.');
}

function showSummary() {
  const invalid = [...form.querySelectorAll('[aria-invalid="true"]')];
  if (!invalid.length) {
    summary.hidden = true;
    return false;
  }
  summary.innerHTML = `<p><strong>Please fix ${invalid.length} ${invalid.length === 1 ? 'error' : 'errors'}:</strong></p>
    <ul>${invalid.map((el) => `<li><a href="#${el.id}">${esc(document.getElementById(el.id + '-error').textContent)}</a></li>`).join('')}</ul>`;
  summary.hidden = false;
  summary.focus();
  return true;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors(form);
  validate();
  if (showSummary()) return;

  const button = $('register-button');
  button.disabled = true;
  button.textContent = 'Creating account…';
  try {
    registerUser({
      firstName: f.firstName.value.trim(),
      lastName: f.lastName.value.trim(),
      email: f.email.value.trim(),
      password: f.password.value,
      dob: f.dob.value,
      accountType: form.accountType.value,
      company: form.accountType.value === 'business' ? f.company.value.trim() : '',
      newsletter: f.newsletter.checked,
    });
    await login(f.email.value, f.password.value);
    setFlash('Your account has been created. Welcome!');
    location.href = 'index.html';
  } catch (err) {
    setError(f.email, err.message);
    showSummary();
    button.disabled = false;
    button.textContent = 'Create account';
  }
});
