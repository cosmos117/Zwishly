export const $ = (id) => document.getElementById(id);

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

export function setHidden(element, hidden) {
  element.classList.toggle('hidden', hidden);
}

const TOAST_MS = 2600;
let toastTimer;

export function toast(message) {
  let element = document.querySelector('.toast');
  if (!element) {
    element = document.createElement('div');
    element.className = 'toast';
    document.body.append(element);
  }
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), TOAST_MS);
}
