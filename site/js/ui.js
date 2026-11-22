// Shared page shell (header, footer, notices) and small UI helpers.
import { cartCount } from './cart.js';
import { loadSettings, isConfigured } from './api.js';
import { track } from './analytics.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const aed = (n) => 'AED ' + Number(n).toLocaleString('en-AE', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 });
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- Mood colours: derived from each box's theme colour ----------
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function mix(h, w, t) { const a = hexToRgb(h), b = hexToRgb(w); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
function lum(h) { return hexToRgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0); }
export function moodVars(hex = '#5B3FD9') {
  const onDark = (1.05) / (lum(hex) + 0.05) >= 4.5;   // white text passes AA?
  return {
    '--mood': hex,
    '--mood-on': onDark ? '#FFFFFF' : '#221C3A',
    '--mood-tint': mix(hex, '#FFFFFF', 0.86),
    '--mood-soft': mix(hex, '#FFFFFF', 0.62),
    '--mood-deep': mix(hex, '#000000', lum(hex) > 0.3 ? 0.45 : 0.22),
  };
}
export function applyMood(el, hex) { for (const [k, v] of Object.entries(moodVars(hex))) el.style.setProperty(k, v); }
export const moodStyle = (hex) => Object.entries(moodVars(hex)).map(([k, v]) => `${k}:${v}`).join(';');

// ---------- Toasts ----------
export function toast(message, kind = 'ok') {
  let host = $('#toasts');
  if (!host) { host = document.createElement('div'); host.id = 'toasts'; host.setAttribute('aria-live', 'polite'); document.body.append(host); }
  const t = document.createElement('div');
  t.className = `toast toast-${kind}`; t.textContent = message;
  host.append(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3700);
}

// ---------- Header / footer ----------
const NAV = [
  ['index.html', 'Home', 'home'], ['shop.html', 'Shop', 'shop'], ['builder.html', 'Build a gift box', 'builder'],
  ['about.html', 'About', 'about'], ['faq.html', 'Help & returns', 'faq'], ['contact.html', 'Contact', 'contact'],
];
const LOGO = `<svg class="logo-mark" viewBox="0 0 40 40" aria-hidden="true"><rect x="5" y="15" width="30" height="20" rx="4" fill="currentColor"/><path d="M3 11.5a3 3 0 0 1 3-3h28a3 3 0 0 1 3 3V15H3z" fill="currentColor" opacity=".55"/><path d="M20 8.5v26.5" stroke="var(--paper)" stroke-width="3"/><path d="M20 8c-3-6-11-5-8 0m8 0c3-6 11-5 8 0" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>`;

export function renderShell() {
  const page = document.body.dataset.page;
  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <div class="nav-wrap">
      <a class="brand" href="index.html" aria-label="FUMEBOX home">${LOGO}<span data-setting="store_name">FUMEBOX</span></a>
      <button class="nav-toggle" aria-expanded="false" aria-controls="site-nav"><span class="sr">Menu</span><span class="bars" aria-hidden="true"></span></button>
      <nav id="site-nav" class="site-nav" aria-label="Main">
        ${NAV.map(([href, label, key]) => `<a href="${href}"${key === page ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
      </nav>
      <a class="cart-link" href="cart.html"${page === 'cart' ? ' aria-current="page"' : ''}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16l-1.3 11.2A2 2 0 0 1 16.7 21H7.3a2 2 0 0 1-2-1.8z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>
        <span>Cart</span><span class="cart-count" data-cart-count>0</span>
      </a>
    </div>`;
  document.body.prepend(header);
  if (!isConfigured) {
    const warn = document.createElement('div');
    warn.className = 'config-warning';
    warn.textContent = 'Setup needed: add your Supabase URL and anon key in js/config.js (see docs/SETUP.md).';
    header.after(warn);
  }

  const toggle = $('.nav-toggle', header);
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    header.classList.toggle('nav-open', open);
  });

  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = `
    <div class="footer-grid">
      <div>
        <a class="brand" href="index.html">${LOGO}<span data-setting="store_name">FUMEBOX</span></a>
        <p data-setting="tagline">Gift boxes for every mood</p>
      </div>
      <div><h2>Shop</h2><a href="shop.html">Signature boxes</a><a href="builder.html">Build your own box</a><a href="cart.html">Cart</a></div>
      <div><h2>Company</h2><a href="about.html">About us</a><a href="contact.html">Contact</a><a href="faq.html">FAQ &amp; returns</a></div>
      <div><h2>Get in touch</h2><a data-setting-href="email" data-setting="email" href="#">hello@fumebox.example</a><span data-setting="phone"></span><span data-setting="address"></span></div>
    </div>
    <p class="fine">© <span data-year></span> <span data-setting="store_name">FUMEBOX</span>. Not affiliated with Chanel, Dior, Yves Saint Laurent or Versace. Brand names and trademarks belong to their owners.</p>`;
  document.body.append(footer);
  $('[data-year]', footer).textContent = new Date().getFullYear();

  const syncCount = () => $$('[data-cart-count]').forEach((n) => { const c = cartCount(); n.textContent = c; n.hidden = c === 0; });
  syncCount();
  window.addEventListener('cart:change', syncCount);
  window.addEventListener('storage', syncCount);

  if (isConfigured) loadSettings().then(applySettings).catch(() => {});
  track('page_view');
}

export function applySettings(s) {
  $$('[data-setting]').forEach((el) => { const v = s[el.dataset.setting]; if (typeof v === 'string' && v) el.textContent = v; });
  $$('[data-setting-href="email"]').forEach((el) => { if (s.email) el.href = 'mailto:' + s.email; });
  if (s.store_name) document.title = document.title.replace(/FUMEBOX/g, s.store_name);
  window.dispatchEvent(new CustomEvent('settings:ready', { detail: s }));
}

export function itemImage(p, cls = '') {
  const src = p?.image_url || 'images/items/placeholder.svg';
  return `<img class="${cls}" src="${esc(src)}" alt="${esc(p?.name || '')}" loading="lazy" width="320" height="320">`;
}

export function showError(container, message, retry) {
  container.innerHTML = `<div class="state state-error" role="alert"><p>${esc(message)}</p>${retry ? '<button class="btn btn-ghost" type="button">Try again</button>' : ''}</div>`;
  if (retry) $('button', container).addEventListener('click', retry);
}
