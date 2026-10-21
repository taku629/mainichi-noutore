import { state } from './store.js';
import { renderHome, renderWelcome } from './render.js';

/* ================= PWA ================= */
if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

if (state.seenIntro) renderHome(); else renderWelcome();
