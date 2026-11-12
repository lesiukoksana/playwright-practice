import { initLayout, requireAuth, toast } from '../layout.js';
import { deleteUser, esc, logout, setFlash, storage, updateUser } from '../store.js';
import { bindPasswordRules, clearErrors, clearOnInput, focusFirstError, passwordValid, setError } from '../forms.js';
import { confirmDialog } from '../ui.js';

const user = requireAuth();
const $ = (id) => document.getElementById(id);
const MAX_AVATAR = 1024 * 1024;

function renderAvatar(u) {
  const initials = ((u.firstName?.[0] ?? '') + (u.lastName?.[0] ?? '')).toUpperCase();
  $('avatar-preview').innerHTML = u.avatar
    ? `<img src="${u.avatar}" alt="Your profile picture">`
    : `<span aria-label="No profile picture">${esc(initials)}</span>`;
  $('remove-avatar').hidden = !u.avatar;
}

function setupAvatar() {
  const input = $('avatar-input');
  input.addEventListener('change', () => {
    const file = input.files[0];
    const err = $('avatar-input-error');
    err.hidden = true;
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      err.textContent = 'Only PNG and JPEG images are allowed.';
      err.hidden = false;
      input.value = '';
      return;
    }
    if (file.size > MAX_AVATAR) {
      err.textContent = 'The image must be 1 MB or smaller.';
      err.hidden = false;
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const u = updateUser(user.email, { avatar: reader.result });
      renderAvatar(u);
      toast('Profile picture updated');
      input.value = '';
    };
    reader.readAsDataURL(file);
  });
  $('remove-avatar').addEventListener('click', () => {
    renderAvatar(updateUser(user.email, { avatar: null }));
    toast('Profile picture removed');
  });
  renderAvatar(user);
}

function setupDetails() {
  const form = $('details-form');
  clearOnInput(form);
  const fill = (u) => {
    $('first-name').value = u.firstName ?? '';
    $('last-name').value = u.lastName ?? '';
    $('email').value = u.email;
    $('phone').value = u.phone ?? '';
  };
  fill(user);

  let dirty = false;
  const setDirty = (v) => {
    dirty = v;
    $('unsaved').hidden = !v;
  };
  form.addEventListener('input', () => setDirty(true));
  // Leaving the page with unsaved changes triggers a "beforeunload" dialog.
  window.addEventListener('beforeunload', (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearErrors(form);
    const first = $('first-name').value.trim();
    const last = $('last-name').value.trim();
    const phone = $('phone').value.trim();
    if (!first) setError($('first-name'), 'First name is required.');
    if (!last) setError($('last-name'), 'Last name is required.');
    if (phone && !/^\+?\d{7,15}$/.test(phone.replace(/[\s()-]/g, ''))) setError($('phone'), 'Enter a valid phone number.');
    if (form.querySelector('[aria-invalid="true"]')) return focusFirstError(form);

    const u = updateUser(user.email, { firstName: first, lastName: last, phone });
    setDirty(false);
    document.querySelector('.user-name').textContent = `${u.firstName} ${u.lastName}`;
    toast('Your details have been saved.');
  });
}

function setupPassword() {
  const form = $('password-form');
  clearOnInput(form);
  bindPasswordRules($('new-password'), $('new-password-rules'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearErrors(form);
    const current = $('current-password').value;
    const next = $('new-password').value;
    const confirm = $('confirm-new-password').value;
    const fresh = storage.get('users').find((u) => u.email === user.email);
    if (!current) setError($('current-password'), 'Enter your current password.');
    else if (current !== fresh.password) setError($('current-password'), 'Current password is incorrect.');
    if (!next) setError($('new-password'), 'Enter a new password.');
    else if (!passwordValid(next)) setError($('new-password'), 'Password does not meet all requirements.');
    else if (next === current) setError($('new-password'), 'New password must be different from the current one.');
    if (!confirm) setError($('confirm-new-password'), 'Confirm your new password.');
    else if (confirm !== next) setError($('confirm-new-password'), 'Passwords do not match.');
    if (form.querySelector('[aria-invalid="true"]')) return focusFirstError(form);

    updateUser(user.email, { password: next });
    form.reset();
    $('new-password').dispatchEvent(new Event('input'));
    toast('Your password has been updated.');
  });
}

function setupDelete() {
  $('delete-account').addEventListener('click', async () => {
    // Step 1: native browser dialog. Step 2: custom modal that requires typing DELETE.
    if (!window.confirm('Are you sure you want to delete your account?')) return;
    const ok = await confirmDialog({
      title: 'Delete account',
      message: 'This cannot be undone. All your data will be lost.',
      confirmLabel: 'Delete account',
      danger: true,
      requireText: 'DELETE',
    });
    if (!ok) return;
    deleteUser(user.email);
    logout();
    setFlash('Your account has been deleted.');
    location.href = 'index.html';
  });
}

if (user) {
  initLayout();
  setupAvatar();
  setupDetails();
  setupPassword();
  setupDelete();
}
