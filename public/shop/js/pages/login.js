import { initLayout } from '../layout.js';
import { currentUser, fullName, login, params, safeReturnUrl, setFlash } from '../store.js';
import { bindPasswordToggle, clearErrors, clearOnInput, EMAIL_RE, focusFirstError, setError } from '../forms.js';

const returnUrl = safeReturnUrl(params().get('returnUrl'));

if (currentUser() && params().get('returnUrl')) {
  location.replace(returnUrl);
} else {
  initLayout();
  const form = document.getElementById('login-form');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const remember = document.getElementById('remember');
  const button = document.getElementById('login-button');
  const alertBox = document.getElementById('login-error');

  bindPasswordToggle(document.getElementById('toggle-password'), password);
  clearOnInput(form);

  if (params().get('returnUrl')) {
    alertBox.className = 'alert alert-info';
    alertBox.setAttribute('role', 'status');
    alertBox.textContent = 'Please log in to continue.';
    alertBox.hidden = false;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    alertBox.hidden = true;

    if (!email.value.trim()) setError(email, 'Email is required.');
    else if (!EMAIL_RE.test(email.value.trim())) setError(email, 'Enter a valid email address.');
    if (!password.value) setError(password, 'Password is required.');
    if (form.querySelector('[aria-invalid="true"]')) return focusFirstError(form);

    button.disabled = true;
    button.innerHTML = '<span class="spinner spinner-sm" aria-hidden="true"></span> Logging in…';
    try {
      const user = await login(email.value, password.value, remember.checked);
      setFlash(`Welcome back, ${fullName(user)}!`);
      location.href = returnUrl;
    } catch (err) {
      alertBox.className = 'alert alert-error';
      alertBox.setAttribute('role', 'alert');
      alertBox.textContent = err.message;
      alertBox.hidden = false;
      button.disabled = false;
      button.textContent = 'Log in';
      password.value = '';
      password.focus();
    }
  });
}
