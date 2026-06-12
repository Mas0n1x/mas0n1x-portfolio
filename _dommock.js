// Lädt admin.js in einem DOM-Mock, um Top-Level-Laufzeitfehler zu finden.
const fs = require('fs');
const noop = () => {};
const el = new Proxy(function () {}, {
  get: (t, p) => {
    if (p === 'style') return {};
    if (p === 'classList') return { add: noop, remove: noop, toggle: noop, contains: () => false };
    if (p === 'dataset') return {};
    if (p === 'value' || p === 'textContent' || p === 'innerHTML' || p === 'className') return '';
    if (p === 'querySelector') return () => null;
    if (p === 'querySelectorAll') return () => [];
    if (p === 'closest') return () => null;
    if (p === Symbol.iterator) return undefined;
    return el;
  },
  apply: () => el,
  set: () => true,
});
const handlers = [];
// Echte IDs aus dem HTML laden, damit getElementById realistisch null/Element liefert
const html = fs.readFileSync(process.argv[3], 'utf-8');
const IDS = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const doc = {
  getElementById: (id) => IDS.has(id) ? el : null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: (ev, fn) => { handlers.push([ev, fn]); },
  createElement: () => el,
  body: el, documentElement: el, cookie: '', readyState: 'complete',
  head: el,
};
process.on('unhandledRejection', (e) => {
  console.log('ASYNC-CRASH: ' + (e && e.constructor ? e.constructor.name : '') + ': ' + (e && e.message));
  console.log(((e && e.stack) || '').split('\n').slice(0, 4).join('\n'));
});
global.document = doc;
global.window = { addEventListener: noop, location: { href: '', pathname: '/admin/', search: '', hash: '' }, localStorage: { getItem: () => null, setItem: noop, removeItem: noop }, matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }), innerWidth: 1200, navigator: {} };
global.localStorage = global.window.localStorage;
global.navigator = { userAgent: 'node' };
global.location = global.window.location;
global.fetch = () => Promise.resolve({ json: () => Promise.resolve({}), ok: true, text: () => Promise.resolve('') });
global.Chart = function () { return { destroy: noop, update: noop }; };
global.requestAnimationFrame = noop;
global.setTimeout = noop; global.setInterval = noop;

const code = fs.readFileSync(process.argv[2], 'utf-8');
try {
  new Function('document', 'window', 'localStorage', 'navigator', 'location', 'fetch', 'Chart', code)(
    doc, global.window, global.localStorage, global.navigator, global.location, global.fetch, global.Chart
  );
  console.log('OK — kein Top-Level-Fehler beim Laden');
  // DOMContentLoaded-Handler ausführen
  for (const [ev, fn] of handlers) {
    if (ev === 'DOMContentLoaded' || ev === 'load') {
      try { fn(); } catch (e) { console.log('HANDLER-CRASH (' + ev + '): ' + e.constructor.name + ': ' + e.message); console.log(((e.stack)||'').split('\n').slice(0,4).join('\n')); }
    }
  }
} catch (e) {
  console.log('CRASH: ' + e.constructor.name + ': ' + e.message);
  const m = (e.stack || '').split('\n').slice(0, 4).join('\n');
  console.log(m);
}
