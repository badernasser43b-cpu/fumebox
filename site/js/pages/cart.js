import { loadCatalog, refreshCatalog, cartTotals, placeOrder, BOX_MAX, FREE_DELIVERY_AED } from '../api.js';
import { renderShell, esc, aed, $, itemImage, moodStyle, showError } from '../ui.js';
import { getCart, updateLine, removeLine, clearCart } from '../cart.js';
import { track } from '../analytics.js';

renderShell();
const root = $('#cartRoot');
const TOKEN_KEY = 'moodbox-checkout-token';
let cat, submitting = false, checkoutStarted = false;

// One idempotency token per checkout attempt: a double-click, a resubmitted form or a
// retry after a dropped connection all reuse it, so the database never creates two orders.
function checkoutToken() {
  try {
    let t = sessionStorage.getItem(TOKEN_KEY);
    if (!t) { t = crypto.randomUUID(); sessionStorage.setItem(TOKEN_KEY, t); }
    return t;
  } catch { return (window.__mbToken ||= crypto.randomUUID()); }
}

function lineHtml(x) {
  const l = x.line;
  if (l.type === 'signature') {
    const b = x.box;
    const max = Math.min(BOX_MAX, b?.maxQty || 0);
    return `<article class="cart-line" style="${moodStyle(b?.theme_color || '#5B3FD9')}">
      <div class="thumb"><img src="${esc(b?.image_url || 'images/perfume/boxes/custom.webp')}" alt=""></div>
      <div>
        <h3>${esc(b ? b.name + ' Gift Set' : 'Gift set no longer available')}</h3>
        ${b ? `<ul>${b.items.map((it) => `<li>${it.quantity > 1 ? it.quantity + ' × ' : ''}${esc(it.product.name)}</li>`).join('')}</ul>` : ''}
        <label class="gift-input small"><span class="sr">Gift message</span><input type="text" maxlength="200" data-gift="${l.id}" value="${esc(l.gift_message || '')}" placeholder="Add a gift message (optional)"></label>
        ${x.problem ? `<p class="problem" role="alert">${esc(x.problem)}</p>` : ''}
      </div>
      <div class="end">
        <div class="stepper" aria-label="Quantity"><button type="button" data-step="${l.id}" data-d="-1" aria-label="Decrease quantity" ${l.quantity <= 1 ? 'disabled' : ''}>−</button><output>${l.quantity}</output><button type="button" data-step="${l.id}" data-d="1" aria-label="Increase quantity" ${l.quantity >= max ? 'disabled' : ''}>+</button></div>
        <strong>${aed(x.total)}</strong>
        <button class="link-btn" type="button" data-remove="${l.id}">Remove</button>
      </div>
    </article>`;
  }
  return `<article class="cart-line">
    <div class="thumb"><img src="images/perfume/boxes/custom.webp" alt=""></div>
    <div>
      <h3>Build-Your-Own Box</h3>
      <ul>${x.items.map((it) => `<li>${it.quantity > 1 ? it.quantity + ' × ' : ''}${esc(it.product?.name || 'Removed item')}${it.product ? ' — ' + aed(it.product.price_aed * it.quantity) : ''}</li>`).join('')}<li>Gift box &amp; wrapping — ${aed(15)}</li></ul>
      <label class="gift-input small"><span class="sr">Gift message</span><input type="text" maxlength="200" data-gift="${l.id}" value="${esc(l.gift_message || '')}" placeholder="Add a gift message (optional)"></label>
      ${x.problem ? `<p class="problem" role="alert">${esc(x.problem)}</p>` : ''}
    </div>
    <div class="end">
      <strong>${aed(x.total)}</strong>
      <button class="link-btn" type="button" data-remove="${l.id}">Remove</button>
    </div>
  </article>`;
}

function render() {
  const lines = getCart();
  if (!lines.length) {
    root.innerHTML = `<div class="state"><h2>Your cart is empty</h2><p>Pick a signature box or build one of your own.</p>
      <div class="hero-actions" style="justify-content:center"><a class="btn" href="shop.html">Shop boxes</a><a class="btn btn-ghost" href="builder.html">Build your own box</a></div></div>`;
    return;
  }
  const t = cartTotals(lines, cat);
  const existingForm = $('#checkout');
  const saved = existingForm ? Object.fromEntries(new FormData(existingForm)) : null;

  root.innerHTML = `<div class="cart-layout"><div class="cart-lines" id="lines">${t.priced.map(lineHtml).join('')}
    <p class="small muted">${t.subtotal < FREE_DELIVERY_AED ? `Add ${aed(FREE_DELIVERY_AED - t.subtotal)} more for free delivery.` : 'Your order qualifies for free delivery.'}</p></div><div id="co"></div></div>`;
  $('#co').append($('#checkoutTpl').content.cloneNode(true));
  $('#totals').innerHTML = `<div><span>Subtotal</span><span>${aed(t.subtotal)}</span></div>
    <div><span>Delivery</span><span>${t.delivery ? aed(t.delivery) : 'Free'}</span></div>
    <div class="grand"><span>Total</span><span>${aed(t.total)}</span></div>`;
  if (saved) for (const [k, v] of Object.entries(saved)) { const el = $('#checkout').elements[k]; if (el && el.type !== 'checkbox') el.value = v; }
  if (!t.ok) {
    $('#placeBtn').disabled = true;
    $('#formError').hidden = false;
    $('#formError').textContent = 'Fix the items marked in your cart before placing your order.';
  }
  bindForm();
}

// ---------- Validation (same rules as the database) ----------
const rules = {
  name: (v) => v.trim().length >= 2 && v.trim().length <= 80 || 'Enter your full name.',
  email: (v) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v.trim()) || 'Enter a valid email, for example name@example.com.',
  phone: (v) => /^\+?[0-9][0-9 \-]{6,18}$/.test(v.trim()) || 'Enter a valid mobile number, for example +971 50 123 4567.',
  address: (v) => v.trim().length >= 5 || 'Enter your building, street and area.',
  emirate: (v) => !!v || 'Choose an emirate.',
};
function validate(form, only) {
  let ok = true;
  for (const [k, fn] of Object.entries(rules)) {
    if (only && only !== k) continue;
    const res = fn(form.elements[k].value);
    const field = form.elements[k].closest('.field');
    field.classList.toggle('invalid', res !== true);
    form.elements[k].setAttribute('aria-invalid', String(res !== true));
    form.elements[k].setAttribute('aria-describedby', `${k}-err`);
    $(`#${k}-err`).textContent = res === true ? '' : res;
    if (res !== true) ok = false;
  }
  if (!only) {
    const ack = form.elements.ack.checked;
    $('#ack-err').textContent = ack ? '' : 'Please confirm your details and accept the returns policy.';
    if (!ack) ok = false;
  }
  return ok;
}

function bindForm() {
  const form = $('#checkout');
  form.addEventListener('focusin', () => { if (!checkoutStarted) { checkoutStarted = true; track('begin_checkout'); } }, { once: true });
  Object.keys(rules).forEach((k) => form.elements[k].addEventListener('blur', () => { if (form.elements[k].value) validate(form, k); }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting) return;
    $('#formError').hidden = true;
    if (!validate(form)) { form.querySelector('[aria-invalid="true"], #ack:not(:checked)')?.focus(); return; }
    const lines = getCart();
    if (!cartTotals(lines, cat).ok) return;

    submitting = true;
    const btn = $('#placeBtn');
    btn.disabled = true; btn.textContent = 'Placing your order…';
    const f = Object.fromEntries(new FormData(form));
    try {
      const res = await placeOrder(checkoutToken(), { name: f.name, email: f.email, phone: f.phone, address: f.address, emirate: f.emirate, notes: f.notes || '' }, lines);
      try { sessionStorage.removeItem(TOKEN_KEY); } catch {}
      track('order_placed', { detail: res.reference });
      showConfirmation(res, lines, f);
      clearCart();
      refreshCatalog();
    } catch (err) {
      $('#formError').hidden = false;
      $('#formError').textContent = err.message;
      btn.disabled = false; btn.textContent = 'Place order';
      // Stock may have changed: refresh the catalogue and re-check the cart
      try { cat = await refreshCatalog(); render(); $('#formError').hidden = false; $('#formError').textContent = err.message; } catch {}
    } finally { submitting = false; }
  });
}

function showConfirmation(res, lines, f) {
  $('#head').innerHTML = '';
  const t = cartTotals(lines, cat);
  root.innerHTML = `<section class="confirm" aria-labelledby="okTitle">
    <div class="confirm-tick" aria-hidden="true"><svg width="36" height="36" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
    <h1 id="okTitle" tabindex="-1" style="font-size:clamp(2rem,5vw,3rem)">Order received</h1>
    <p class="lead" style="margin-inline:auto">Thank you, ${esc(f.name.trim().split(' ')[0])}. Your order has been received.</p>
    <p class="muted" style="margin:1.5rem auto 0">Your order reference</p>
    <div class="ref" data-ref>${esc(res.reference)}</div>
    <div class="panel" style="text-align:left">
      <ul style="margin:0 0 1rem;padding-left:1.1rem">${t.priced.map((x) => `<li>${x.line.type === 'signature' ? `${x.line.quantity} × ${esc(x.box?.name)} Gift Set` : 'Build-Your-Own Box'} — ${aed(x.total)}</li>`).join('')}</ul>
      <div class="totals" style="margin:0">
        <div><span>Subtotal</span><span>${aed(res.subtotal_aed)}</span></div>
        <div><span>Delivery</span><span>${Number(res.delivery_aed) ? aed(res.delivery_aed) : 'Free'}</span></div>
        <div class="grand"><span>Total</span><span>${aed(res.total_aed)}</span></div>
      </div>
      <p class="small muted" style="margin:1rem 0 0">Keep your order reference for any questions about your order.</p>
    </div>
    <div class="hero-actions" style="justify-content:center;margin-top:1.5rem"><a class="btn" href="shop.html">Continue shopping</a></div>
  </section>`;
  $('#okTitle').focus();
  scrollTo({ top: 0 });
}

root.addEventListener('click', (e) => {
  const s = e.target.closest('[data-step]');
  if (s) {
    const l = getCart().find((x) => x.id === s.dataset.step);
    const b = cat.byId.get(l.collection_id);
    const q = Math.max(1, Math.min(Math.min(BOX_MAX, b?.maxQty || 1), l.quantity + Number(s.dataset.d)));
    updateLine(l.id, { quantity: q }); render(); return;
  }
  const r = e.target.closest('[data-remove]');
  if (r) { removeLine(r.dataset.remove); track('remove_from_cart'); render(); }
});
root.addEventListener('change', (e) => { const g = e.target.closest('[data-gift]'); if (g) updateLine(g.dataset.gift, { gift_message: g.value.slice(0, 200) }); });

async function init() {
  try { cat = await loadCatalog(); render(); }
  catch { showError(root, 'Your cart could not be loaded. Check your connection and try again.', init); }
}
init();
