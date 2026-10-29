import * as store from './store.js';
import * as views from './views.js';

const routes = {
  '#/hoje': views.today,
  '#/trilha': views.track,
  '#/recursos': views.resources,
  '#/notas': views.notes,
  '#/labs': views.labs,
  '#/painel': views.dashboard,
  '#/config': views.settings,
};

const app = document.getElementById('app');
const nav = document.getElementById('nav');
const banner = document.getElementById('banner');

function currentView() {
  return routes[location.hash] ?? views.today;
}

function render() {
  const view = currentView();
  const focus = captureFocus();
  app.innerHTML = view.render();
  document.title = `${view.title} · Trilha`;
  for (const link of nav.querySelectorAll('a')) {
    link.toggleAttribute('aria-current', link.getAttribute('href') === (routes[location.hash] ? location.hash : '#/hoje'));
  }
  renderBanner();
  restoreFocus(focus);
}

function renderBanner() {
  const messages = {
    published: 'Você está vendo a trilha publicada neste repositório. Qualquer alteração fica só no seu navegador.',
    new: 'Seus dados ficam só neste navegador. Exporte backups em Config.',
  };
  banner.hidden = store.source === 'local';
  banner.textContent = messages[store.source] ?? '';
}

// Re-rendering replaces the DOM, so keep the cursor where the user was typing.
function captureFocus() {
  const el = document.activeElement;
  if (!el?.dataset?.change) return null;
  return {
    selector: `[data-change="${el.dataset.change}"]${['field', 'id', 'wd', 'i'].map((k) => (el.dataset[k] ? `[data-${k}="${el.dataset[k]}"]` : '')).join('')}`,
    start: el.selectionStart,
    end: el.selectionEnd,
  };
}

function restoreFocus(focus) {
  if (!focus) return;
  const el = app.querySelector(focus.selector);
  if (!el) return;
  el.focus();
  try { el.setSelectionRange(focus.start, focus.end); } catch { /* not a text input */ }
}

async function run(handler, ...args) {
  if (!handler) return;
  try {
    const result = await handler(...args);
    if (result !== false) render();
  } catch (err) {
    console.error(err);
    window.alert(err.message);
  }
}

app.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (!el) return;
  event.preventDefault();
  run(currentView().actions?.[el.dataset.action], el, event);
});

// Text fields save on every keystroke but only re-render on blur ("change").
const LIVE = new Set(['TEXTAREA']);
function onChange(event) {
  const el = event.target.closest('[data-change]');
  if (!el) return;
  const live = event.type === 'input';
  const isText = LIVE.has(el.tagName) || el.type === 'search';
  if (live && !isText) return;
  if (!live && el.type === 'search') return;
  run(currentView().changes?.[el.dataset.change], el, event);
}
app.addEventListener('input', onChange);
app.addEventListener('change', onChange);

app.addEventListener('submit', (event) => {
  const form = event.target.closest('[data-submit]');
  if (!form) return;
  event.preventDefault();
  run(currentView().submits?.[form.dataset.submit], form, event);
});

window.addEventListener('hashchange', render);

store.init().then(() => {
  if (!location.hash) location.replace('#/hoje');
  render();
});
