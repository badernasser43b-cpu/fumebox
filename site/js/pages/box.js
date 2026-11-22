import { loadCatalog, BOX_MAX } from '../api.js';
import { renderShell, esc, aed, $, applyMood, itemImage, toast, showError } from '../ui.js';
import { addSignature, getCart, setDraft } from '../cart.js';
import { stockBadge, openItem } from './shared.js';
import { track } from '../analytics.js';

renderShell();

async function init() {
  const root = $('#boxRoot');
  let cat;
  try { cat = await loadCatalog(); }
  catch { showError(root, 'This gift set could not be loaded. Check your connection and try again.', init); return; }

  const slug = new URLSearchParams(location.search).get('slug');
  const b = cat.bySlug.get(slug);
  if (!b) {
    root.innerHTML = `<div class="state"><h2>Gift set not found</h2><p>This gift set may have been removed.</p><a class="btn" href="shop.html">See all gift sets</a></div>`;
    return;
  }
  document.title = `${b.name} Gift Set — FUMEBOX`;
  applyMood(document.documentElement, b.theme_color);
  track('box_view', { collectionId: b.id });

  const inCart = getCart().filter((l) => l.type === 'signature' && l.collection_id === b.id).reduce((n, l) => n + l.quantity, 0);
  const max = Math.max(0, Math.min(BOX_MAX, b.maxQty) - inCart);
  const limiting = b.items.filter((it) => !it.product.is_available || it.product.stock < it.quantity);

  root.innerHTML = `
    <nav class="small muted" aria-label="Breadcrumb" style="margin-bottom:1rem"><a href="shop.html">Shop</a> / ${esc(b.name)} Gift Set</nav>
    <div class="box-detail">
      <div class="box-hero">
        <img src="${esc(b.image_url || 'images/perfume/boxes/custom.webp')}" alt="${esc(b.name)} gift box" width="600" height="480">
      </div>
      <div>
        <h1>${esc(b.name)} Gift Set</h1>
        <p class="lead">${esc(b.tagline)}</p>
        <p>${esc(b.description)}</p>
        <h2 style="font-size:1.35rem;margin-top:1.5rem">What's inside</h2>
        <ul class="contents-list">
          ${b.items.map((it) => `
            <li>
              ${itemImage(it.product)}
              <div><button class="link-btn" style="color:var(--ink);font-weight:600;font-size:1rem;text-decoration:none" type="button" data-detail="${it.product.id}">${it.quantity > 1 ? it.quantity + ' × ' : ''}${esc(it.product.name)}</button><div>${stockBadge(it.product)}</div></div>
              <span>${aed(it.product.price_aed * it.quantity)}</span>
            </li>`).join('')}
        </ul>
        <div class="price-panel">
          <div class="box-price" style="display:flex;align-items:baseline;gap:.75rem;flex-wrap:wrap">
            <span class="big">${aed(b.boxPrice)}</span>
            ${b.discount_pct > 0 ? `<s class="muted">${aed(b.listPrice)}</s><span class="badge badge-mood">You save ${aed(b.listPrice - b.boxPrice)} (${b.discount_pct}%)</span>` : ''}
          </div>
          ${b.maxQty === 0
            ? `<p class="notice notice-warn" role="status">This gift set is out of stock because ${limiting.map((it) => esc(it.product.name)).join(', ') || 'a perfume'} is sold out. You can still <a href="#" data-customise>customise it</a> with other items.</p>`
            : `<div class="buy-row">
                 <div class="stepper" aria-label="Quantity"><button type="button" data-step="-1" aria-label="Decrease quantity">−</button><output id="qty" aria-live="polite">1</output><button type="button" data-step="1" aria-label="Increase quantity">+</button></div>
                 <button class="btn" type="button" id="addBtn" ${max === 0 ? 'disabled' : ''}>Add to cart</button>
               </div>
               <p class="small muted" id="stockNote">${max === 0 ? 'You already have the maximum available in your cart.' : `${b.maxQty <= 5 ? `Only ${b.maxQty} sets left in stock.` : 'In stock and ready to ship.'}`}</p>`}
          <button class="btn btn-ghost" type="button" data-customise>Customise this set</button>
        </div>
      </div>
    </div>`;

  let qty = 1, remaining = max;
  const update = () => {
    $('#qty').textContent = remaining === 0 ? 0 : qty;
    root.querySelector('[data-step="-1"]').disabled = qty <= 1 || remaining === 0;
    root.querySelector('[data-step="1"]').disabled = qty >= remaining;
    $('#addBtn').disabled = remaining === 0;
    if (remaining === 0) $('#stockNote').textContent = 'You already have the maximum available in your cart.';
  };
  if (b.maxQty > 0) {
    update();
    root.querySelectorAll('[data-step]').forEach((btn) => btn.addEventListener('click', () => { qty = Math.max(1, Math.min(remaining, qty + Number(btn.dataset.step))); update(); }));
    $('#addBtn').addEventListener('click', () => {
      if (remaining === 0) return;
      addSignature(b.id, qty, b.maxQty);
      track('add_to_cart', { collectionId: b.id });
      toast(`${qty} × ${b.name} Gift Set added to your cart.`);
      remaining -= qty; qty = 1; update();
    });
  }
  root.querySelectorAll('[data-customise]').forEach((el) => el.addEventListener('click', (e) => {
    e.preventDefault();
    setDraft({ items: b.items.filter((it) => it.product.is_available && it.product.stock > 0).map((it) => ({ product_id: it.product.id, quantity: Math.min(it.quantity, 3) })), gift_message: '' });
    location.href = 'builder.html?from=' + encodeURIComponent(b.slug);
  }));
  root.querySelectorAll('[data-detail]').forEach((el) => el.addEventListener('click', () => openItem(cat.products.get(Number(el.dataset.detail)), cat)));
}
init();
