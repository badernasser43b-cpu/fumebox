// Item card, item detail dialog and "add to box" behaviour shared by several pages.
import { esc, aed, itemImage, toast, moodStyle, $ } from '../ui.js';
import { draftAdd, getDraft } from '../cart.js';
import { CUSTOM_MAX, ITEM_MAX } from '../api.js';
import { track } from '../analytics.js';

export function stockBadge(p) {
  if (!p.is_available) return '<span class="badge badge-out">Unavailable</span>';
  if (p.stock <= 0) return '<span class="badge badge-out">Out of stock</span>';
  if (p.stock <= 5) return `<span class="badge badge-low">Only ${p.stock} left</span>`;
  return '<span class="badge badge-ok">In stock</span>';
}

export function itemCard(p, cat) {
  const box = p.collection_id ? cat.byId.get(p.collection_id) : null;
  const can = p.is_available && p.stock > 0;
  return `
    <article class="item-card" style="${moodStyle(box?.theme_color || '#5B3FD9')}">
      <button class="img-btn" type="button" data-detail="${p.id}" aria-label="View details: ${esc(p.name)}">${itemImage(p)}</button>
      <div class="body">
        <div class="meta">${box ? `<span class="badge badge-mood">${esc(box.name)}</span>` : ''}${stockBadge(p)}</div>
        <h3><button type="button" data-detail="${p.id}">${esc(p.name)}</button></h3>
        <div class="row">
          <span class="price">${aed(p.price_aed)}</span>
          <button class="btn btn-sm" type="button" data-addbox="${p.id}" ${can ? '' : 'disabled'}>${can ? 'Add to box' : 'Sold out'}</button>
        </div>
      </div>
    </article>`;
}

/** Adds one unit of an item to the Build-Your-Own draft with clear feedback. */
export function addToDraft(p) {
  const r = draftAdd(p.id, p.is_available ? p.stock : 0);
  if (!r.ok) {
    const msg = { box_full: `Your box is full — ${CUSTOM_MAX} different items is the maximum.`,
                  item_max: `You can add up to ${ITEM_MAX} of the same item.`,
                  stock: `No more ${p.name} in stock.` }[r.reason];
    toast(msg, 'error');
    return false;
  }
  track('builder_add_item', { productId: p.id });
  const d = getDraft();
  toast(`${p.name} added to your box (${d.items.length} of ${CUSTOM_MAX} items).`);
  return true;
}

let dialog;
export function openItem(p, cat, onAdd) {
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.className = 'sheet';
    document.body.append(dialog);
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  }
  const box = p.collection_id ? cat.byId.get(p.collection_id) : null;
  const can = p.is_available && p.stock > 0;
  dialog.setAttribute('style', moodStyle(box?.theme_color || '#5B3FD9'));
  dialog.setAttribute('aria-labelledby', 'itemTitle');
  dialog.innerHTML = `
    <div class="sheet-inner">
      <div class="art">${itemImage(p)}</div>
      <div class="info">
        <div class="meta" style="display:flex;gap:.4rem;flex-wrap:wrap">${box ? `<span class="badge badge-mood">${esc(box.name)} mood</span>` : ''}<span class="badge">${esc(p.category)}</span>${stockBadge(p)}</div>
        <h2 id="itemTitle" style="font-size:2rem">${esc(p.name)}</h2>
        <p class="muted">${esc(p.description)}</p>
        <p class="price" style="font-size:1.6rem">${aed(p.price_aed)}</p>
        <button class="btn" type="button" data-add ${can ? '' : 'disabled'}>${can ? 'Add to my box' : 'Not available right now'}</button>
        ${box && box.items.some((it) => it.product.id === p.id) ? `<p class="small muted">Also included in the <a href="box.html?slug=${encodeURIComponent(box.slug)}">${esc(box.name)} signature box</a>.</p>` : ''}
        <p class="small muted">Items are sold inside a Build-Your-Own box (3–8 items, plus AED 15 gift box and wrapping).</p>
      </div>
    </div>
    <button class="sheet-close" type="button" aria-label="Close">×</button>`;
  $('.sheet-close', dialog).addEventListener('click', () => dialog.close());
  $('[data-add]', dialog).addEventListener('click', () => { if ((onAdd || addToDraft)(p)) dialog.close(); });
  dialog.showModal();
  track('product_view', { productId: p.id });
}

export function bindItemCards(container, cat, onAdd) {
  container.addEventListener('click', (e) => {
    const d = e.target.closest('[data-detail]');
    if (d) { openItem(cat.products.get(Number(d.dataset.detail)), cat, onAdd); return; }
    const a = e.target.closest('[data-addbox]');
    if (a) (onAdd || addToDraft)(cat.products.get(Number(a.dataset.addbox)));
  });
}
