import { loadCatalog, inStock } from '../api.js';
import { renderShell, esc, aed, $, applyMood, moodStyle, showError } from '../ui.js';
import { addSignature } from '../cart.js';
import { toast } from '../ui.js';
import { itemCard, bindItemCards } from './shared.js';
import { track } from '../analytics.js';

renderShell();

async function init() {
  let cat;
  try { cat = await loadCatalog(); }
  catch { showError($('#heroBox'), 'The catalogue could not be loaded. Check your connection and try again.', init); return; }

  const boxes = cat.collections;
  if (!boxes.length) { $('#heroBox').innerHTML = '<div class="state"><p>No boxes are available yet.</p></div>'; return; }

  // Mood switcher re-tints the hero and shows that box's contents
  const sw = $('#moodSwitch');
  sw.innerHTML = boxes.map((b, i) => `<button type="button" data-slug="${esc(b.slug)}" aria-pressed="${i === 0}" style="--sw:${esc(b.theme_color)}"><span class="swatch"></span>${esc(b.name)}</button>`).join('');
  const show = (slug, animate) => {
    const b = cat.bySlug.get(slug);
    applyMood(document.documentElement, b.theme_color);
    $('#moodWord').textContent = b.name.toLowerCase() + ' days.';
    sw.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.slug === slug)));
    const soldOut = b.maxQty === 0;
    $('#heroBox').innerHTML = `
      <article class="box-card${animate ? ' swap' : ''}">
        <img class="box-art" src="${esc(b.image_url || 'images/photos/boxes/custom.webp')}" alt="" width="500" height="340">
        <h2>${esc(b.name)} Box</h2>
        <p class="tag">${esc(b.tagline)}</p>
        <ul class="box-contents" aria-label="What's inside">${b.items.map((it) => `<li>${it.quantity > 1 ? it.quantity + ' × ' : ''}${esc(it.product.name)}</li>`).join('')}</ul>
        <div class="box-price"><strong>${aed(b.boxPrice)}</strong>${b.discount_pct > 0 ? `<s>${aed(b.listPrice)}</s><span>Save ${b.discount_pct}%</span>` : ''}</div>
        <div class="hero-actions" style="margin-top:1.25rem">
          <button class="btn" type="button" data-add ${soldOut ? 'disabled' : ''}>${soldOut ? 'Out of stock' : 'Add to cart'}</button>
          <a class="btn btn-on-mood" href="box.html?slug=${encodeURIComponent(b.slug)}">See details</a>
        </div>
      </article>`;
    $('[data-add]', $('#heroBox'))?.addEventListener('click', () => {
      addSignature(b.id, 1, b.maxQty);
      track('add_to_cart', { collectionId: b.id });
      toast(`${b.name} Box added to your cart.`);
    });
  };
  sw.addEventListener('click', (e) => { const btn = e.target.closest('button[data-slug]'); if (btn) { show(btn.dataset.slug, true); track('box_view', { collectionId: cat.bySlug.get(btn.dataset.slug).id }); } });
  show(boxes[0].slug, false);

  $('#boxesGrid').innerHTML = boxes.map((b) => `
    <a class="box-tile" href="box.html?slug=${encodeURIComponent(b.slug)}" style="${moodStyle(b.theme_color)}">
      <img src="${esc(b.image_url || 'images/photos/boxes/custom.webp')}" alt="" width="300" height="300" loading="lazy">
      <div>
        <h3>${esc(b.name)}</h3>
        <p>${esc(b.tagline)}</p>
        <div class="foot"><span>${aed(b.boxPrice)}</span><span class="small muted">${b.items.length} items</span></div>
      </div>
    </a>`).join('');

  const featured = cat.productList.filter((p) => p.is_featured && inStock(p)).slice(0, 4);
  $('#featuredGrid').innerHTML = featured.map((p) => itemCard(p, cat)).join('') || '<p class="muted">New items are coming soon.</p>';
  bindItemCards($('#featuredGrid'), cat);
}
init();
