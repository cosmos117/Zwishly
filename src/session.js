export const session = { user: null };

export async function api(path, { method = 'GET', body, keepalive = false } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      keepalive,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('We can’t reach Zwishly right now. Check your connection and try again.');
  }
  const isJson = res.headers.get('content-type')?.includes('application/json');
  if (!isJson) throw new Error('Accounts aren’t available on this copy of the site.');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

export async function fetchUser() {
  const { user } = await api('/me');
  session.user = user;
  return user;
}

let pendingPrefs = null;
let saveTimer = null;
let onSaveError = () => {};

export function setPrefsErrorHandler(handler) {
  onSaveError = handler;
}

export function queuePrefsSave(prefs) {
  if (!session.user) return;
  pendingPrefs = { ...prefs };
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushPrefs, 400);
}

export async function flushPrefs() {
  clearTimeout(saveTimer);
  if (!pendingPrefs) return;
  const body = pendingPrefs;
  pendingPrefs = null;
  try {
    const { user } = await api('/me/prefs', { method: 'PUT', body, keepalive: true });
    session.user = user;
  } catch {
    onSaveError();
  }
}

addEventListener('pagehide', flushPrefs);

const COPY = {
  login: {
    title: 'Welcome back',
    lead: 'Your theme and your games are waiting.',
    submit: 'Sign in',
    switchText: 'New to Zwishly?',
    switchAction: 'Sign up',
    autocomplete: 'current-password',
  },
  register: {
    title: 'Create your account',
    lead: 'Save your theme and your Chess.com and Lichess profiles, and pick up on any device.',
    submit: 'Sign up',
    switchText: 'Already have an account?',
    switchAction: 'Sign in',
    autocomplete: 'new-password',
  },
};

let dialog = null;
let mode = 'login';
let onDone = () => {};
const part = (name) => dialog.querySelector(`[data-auth="${name}"]`);

function setMode(next) {
  mode = next;
  const copy = COPY[mode];
  part('title').textContent = copy.title;
  part('lead').textContent = copy.lead;
  part('submit').textContent = copy.submit;
  part('switch-text').textContent = copy.switchText;
  part('switch').textContent = copy.switchAction;
  part('password').autocomplete = copy.autocomplete;
  part('hint').classList.toggle('hidden', mode !== 'register');
  part('error').textContent = '';
}

async function submit(e) {
  e.preventDefault();
  const button = part('submit');
  button.disabled = true;
  part('error').textContent = '';
  try {
    const { user } = await api(mode === 'register' ? '/auth/register' : '/auth/login', {
      method: 'POST',
      body: { email: part('email').value, password: part('password').value },
    });
    session.user = user;
    const isNew = mode === 'register';
    closeDialog();
    onDone(user, isNew);
  } catch (err) {
    part('error').textContent = err.message;
  } finally {
    button.disabled = false;
  }
}

const CLOSE_MS = 160;

// Plays the closing animation, then closes the dialog for real.
function closeDialog() {
  if (!dialog.open || dialog.classList.contains('closing')) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    dialog.close();
    return;
  }
  dialog.classList.add('closing');
  setTimeout(() => {
    dialog.classList.remove('closing');
    dialog.close();
  }, CLOSE_MS);
}

function createDialog() {
  dialog = document.createElement('dialog');
  dialog.className = 'auth-dialog';
  dialog.setAttribute('aria-labelledby', 'auth-title');
  dialog.innerHTML = `
    <button class="drawer-close auth-close" type="button" aria-label="Close" data-auth="close">✕</button>
    <h2 id="auth-title" data-auth="title"></h2>
    <p class="muted" data-auth="lead"></p>
    <form data-auth="form">
      <label for="auth-email">Email</label>
      <input id="auth-email" data-auth="email" type="email" autocomplete="email" required maxlength="254" />
      <label for="auth-password">Password</label>
      <input id="auth-password" data-auth="password" type="password" required maxlength="200" />
      <p class="field-hint hidden" data-auth="hint">At least 8 characters.</p>
      <p class="form-error" role="alert" data-auth="error"></p>
      <button class="primary wide" type="submit" data-auth="submit"></button>
    </form>
    <p class="auth-switch"><span data-auth="switch-text"></span> <button class="link-btn" type="button" data-auth="switch"></button></p>`;
  document.body.append(dialog);
  part('close').onclick = closeDialog;
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeDialog();
  });
  part('switch').onclick = () => setMode(mode === 'login' ? 'register' : 'login');
  part('form').onsubmit = submit;
}

export function openAuth(nextMode, done) {
  if (!dialog) createDialog();
  onDone = done;
  part('form').reset();
  setMode(nextMode);
  dialog.showModal();
  part('email').focus();
}
