import { loadCatalog, priceLine, PACKAGING_AED, CUSTOM_MIN, CUSTOM_MAX, ITEM_MAX } from '../api.js';
import { renderShell, esc, aed, $, moodStyle, applyMood, itemImage, toast, showError } from '../ui.js';
import { getDraft, setDraft, draftSet, draftClear, addCustom } from '../cart.js';
import { itemCard, bindItemCards, addToDraft } from './shared.js';
import { track } from '../analytics.js';

renderShell();
let cat, lastAdded = null;
const state = { q: '', mood: '' };

function renderItems() {
  const q = state.q.trim().toLowerCase();
  const moodId = state.mood ? cat.bySlug.get(state.mood)?.id : null;
  const list = cat.productList.filter((p) => (!q || (p.name + ' ' + p.category).toLowerCase().includes(q)) && (!moodId || p.collection_id === moodId))
    .sort((a, b) => Number(!(a.is_available && a.stock > 0)) - Number(!(b.is_available && b.stock > 0)));
  $('#itemsGrid').innerHTML = list.map((p) => itemCard(p, cat)).join('') ||
    '<div class="state" style="grid-column:1/-1"><p>No items match your search.</p></div>';
}

function renderBox() {
  const d = getDraft();
  // Drop items that no longer exist in the catalogue
  const known = d.items.filter((i) => cat.products.has(i.product_id));
  if (known.length !== d.items.length) { setDraft({ ...d, items: known }); return renderBox(); }

  const line = { type: 'custom', items: d.items };
  const pr = priceLine(line, cat);
  const n = d.items.length;
  const units = d.items.reduce((s, i) => s + i.quantity, 0);

  $('#countText').textContent = `${n} of ${CUSTOM_MAX} items${units > n ? ` · ${units} pieces` : ''}`;
  $('#meter').style.width = (n / CUSTOM_MAX * 100) + '%';
  const slots = d.items.map((i) => {
    const p = cat.products.get(i.product_id);
    const short = !p.is_available || p.stock < i.quantity;
    const maxQ = Math.min(ITEM_MAX, p.stock);
    return `<div class="slot${i.product_id === lastAdded ? ' added' : ''}">
      ${itemImage(p)}
      <div><div class="name">${esc(p.name)}</div><div class="small ${short ? '' : 'muted'}" style="${short ? 'color:var(--danger);font-weight:600' : ''}">${short ? (p.stock === 0 || !p.is_available ? 'Sold out — remove this item' : `Only ${p.stock} left`) : aed(p.price_aed * i.quantity)}</div></div>
      <div style="display:grid;justify-items:end;gap:.2rem">
        <div class="stepper" aria-label="Quantity of ${esc(p.name)}">
          <button type="button" data-q="${p.id}" data-d="-1" aria-label="${i.quantity === 1 ? 'Remove' : 'Decrease'} ${esc(p.name)}">${i.quantity === 1 ? '×' : '−'}</button>
          <output>${i.quantity}</output>
          <button type="button" data-q="${p.id}" data-d="1" aria-label="Increase ${esc(p.name)}" ${i.quantity >= maxQ ? 'disabled' : ''}>+</button>
        </div>
      </div>
    </div>`;
  });
  for (let k = n; k < CUSTOM_MIN; k++) slots.push(`<div class="slot empty">Add ${k === n ? 'an item' : 'another item'}</div>`);
  $('#slots').innerHTML = slots.join('');
  lastAdded = null;

  $('#itemsTotal').textContent = aed(pr.itemsTotal || 0);
  $('#wrapFee').textContent = aed(PACKAGING_AED);
  $('#boxTotal').textContent = n ? aed(pr.unit) : aed(0);
  const ready = n >= CUSTOM_MIN && pr.ok;
  $('#ruleText').textContent = n < CUSTOM_MIN ? `Add ${CUSTOM_MIN - n} more ${CUSTOM_MIN - n === 1 ? 'item' : 'items'} to complete your box.`
    : !pr.ok ? pr.problem : n >= CUSTOM_MAX ? 'Your box is full.' : `Ready to add. You can add up to ${CUSTOM_MAX - n} more.`;
  $('#ruleText').style.color = !pr.ok && n >= CUSTOM_MIN ? 'var(--danger)' : '';
  $('#addBox').disabled = !ready;
  $('#gift').value = d.gift_message;

  $('#barCount').textContent = n ? `Your box · ${n} ${n === 1 ? 'item' : 'items'}` : 'Your box is empty';
  $('#barHint').textContent = ready ? 'Ready — tap to review and add to cart' : n < CUSTOM_MIN ? `Add ${CUSTOM_MIN - n} more to complete` : 'Tap to review';
  $('#barTotal').textContent = n ? aed(pr.unit) : aed(0);

  // The box takes on the colour of the mood most of its items come from
  const tally = {};
  d.items.forEach((i) => { const c = cat.products.get(i.product_id).collection_id; if (c) tally[c] = (tally[c] || 0) + i.quantity; });
  const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  applyMood(document.documentElement, top ? cat.byId.get(Number(top[0]))?.theme_color || '#5B3FD9' : '#5B3FD9');
}

async function init() {
  try { cat = await loadCatalog(); }
  catch { showError($('#itemsGrid'), 'Items could not be loaded. Check your connection and try again.', init); return; }

  const from = cat.bySlug.get(new URLSearchParams(location.search).get('from'));
  if (from) { const n = $('#fromNotice'); n.hidden = false; n.textContent = `We've started your box with the ${from.name} Gift Set perfumes. Swap, add or remove anything you like.`; }

  $('#moodChips').innerHTML = [['', 'All', '#5B3FD9'], ...cat.collections.map((b) => [b.slug, b.name, b.theme_color])]
    .map(([slug, name, c]) => `<button class="chip" type="button" data-mood="${esc(slug)}" aria-pressed="${slug === ''}" style="${moodStyle(c)}">${slug ? '<span class="dot"></span>' : ''}${esc(name)}</button>`).join('');
  $('#moodChips').addEventListener('click', (e) => {
    const c = e.target.closest('.chip'); if (!c) return;
    state.mood = c.dataset.mood;
    $('#moodChips').querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
    renderItems();
  });
  $('#q').addEventListener('input', (e) => { state.q = e.target.value; renderItems(); });

  bindItemCards($('#itemsGrid'), cat, (p) => { const ok = addToDraft(p); if (ok) { lastAdded = p.id; renderBox(); } return ok; });

  $('#slots').addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]'); if (!b) return;
    const id = Number(b.dataset.q);
    const cur = getDraft().items.find((i) => i.product_id === id);
    const p = cat.products.get(id);
    const next = cur.quantity + Number(b.dataset.d);
    if (next > Math.min(ITEM_MAX, p.stock)) { toast(next > ITEM_MAX ? `You can add up to ${ITEM_MAX} of the same item.` : `No more ${p.name} in stock.`, 'error'); return; }
    draftSet(id, next);
    if (next > cur.quantity) track('builder_add_item', { productId: id });
    renderBox();
  });
  $('#gift').addEventListener('input', (e) => setDraft({ ...getDraft(), gift_message: e.target.value.slice(0, 200) }));
  $('#clearBox').addEventListener('click', () => { if (getDraft().items.length && confirmClear()) { draftClear(); renderBox(); } });
  $('#addBox').addEventListener('click', () => {
    const d = getDraft();
    const pr = priceLine({ type: 'custom', items: d.items }, cat);
    if (d.items.length < CUSTOM_MIN || !pr.ok) return;
    addCustom(d.items, d.gift_message);
    track('add_to_cart', { detail: 'custom' });
    draftClear();
    toast('Your box was added to the cart.');
    setTimeout(() => { location.href = 'cart.html'; }, 700);
  });

  const panel = $('#panel'), bar = $('#bar');
  bar.addEventListener('click', () => { const open = !panel.classList.contains('open'); panel.classList.toggle('open', open); bar.setAttribute('aria-expanded', String(open)); bar.hidden = open; });
  panel.addEventListener('click', (e) => { if (e.target === panel.querySelector('.lid') || e.target.closest('.lid')) { panel.classList.remove('open'); bar.hidden = false; bar.setAttribute('aria-expanded', 'false'); } });

  renderItems();
  renderBox();
}
// Inline confirmation without a blocking browser dialog
let armed = false;
function confirmClear() {
  if (armed) { armed = false; $('#clearBox').textContent = 'Empty box'; return true; }
  armed = true; $('#clearBox').textContent = 'Tap again to empty your box';
  setTimeout(() => { armed = false; $('#clearBox').textContent = 'Empty box'; }, 3000);
  return false;
}
init();
