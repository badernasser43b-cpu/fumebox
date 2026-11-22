import { loadCatalog } from '../api.js';
import { renderShell, esc, aed, $, moodStyle, showError } from '../ui.js';
import { itemCard, bindItemCards } from './shared.js';
import { track } from '../analytics.js';

renderShell();

const state = { q: '', mood: '', category: '', sort: 'featured' };

async function init() {
  let cat;
  try { cat = await loadCatalog(); }
  catch { showError($('#boxesGrid'), 'The shop could not be loaded. Check your connection and try again.', init); return; }

  $('#boxesGrid').innerHTML = cat.collections.map((b) => `
    <a class="box-tile" href="box.html?slug=${encodeURIComponent(b.slug)}" style="${moodStyle(b.theme_color)}">
      <img src="${esc(b.image_url || 'images/perfume/boxes/custom.webp')}" alt="" width="300" height="300" loading="lazy">
      <div>
        <h3>${esc(b.name)} Box</h3>
        <p>${esc(b.tagline)}</p>
        <div class="foot"><span>${aed(b.boxPrice)}</span><span class="small muted">${b.maxQty === 0 ? 'Out of stock' : b.items.length + ' items'}</span></div>
      </div>
    </a>`).join('') || '<p class="muted">No signature boxes are available right now.</p>';

  const params = new URLSearchParams(location.search);
  state.mood = params.get('mood') || '';

  $('#moodChips').innerHTML = [['', 'All', '#5B3FD9'], ...cat.collections.map((b) => [b.slug, b.name, b.theme_color])]
    .map(([slug, name, c]) => `<button class="chip" type="button" data-mood="${esc(slug)}" aria-pressed="${state.mood === slug}" style="${moodStyle(c)}">${slug ? '<span class="dot"></span>' : ''}${esc(name)}</button>`).join('');
  const cats = [...new Set(cat.productList.map((p) => p.category))].sort();
  $('#category').insertAdjacentHTML('beforeend', cats.map((c) => `<option>${esc(c)}</option>`).join(''));

  const render = () => {
    const q = state.q.trim().toLowerCase();
    const moodId = state.mood ? cat.bySlug.get(state.mood)?.id : null;
    let list = cat.productList.filter((p) =>
      (!q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)) &&
      (!moodId || p.collection_id === moodId) && (!state.category || p.category === state.category));
    const avail = (p) => (p.is_available && p.stock > 0 ? 0 : 1);
    const sorters = {
      featured: (a, b) => avail(a) - avail(b) || Number(b.is_featured) - Number(a.is_featured) || a.sort_order - b.sort_order,
      'price-asc': (a, b) => a.price_aed - b.price_aed, 'price-desc': (a, b) => b.price_aed - a.price_aed,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    list = list.sort(sorters[state.sort]);
    $('#count').textContent = `${list.length} ${list.length === 1 ? 'perfume' : 'perfumes'}`;
    $('#itemsGrid').innerHTML = list.map((p) => itemCard(p, cat)).join('') ||
      `<div class="state" style="grid-column:1/-1"><h2>No perfumes match</h2><p>Try a different word or clear the filters.</p><button class="btn btn-ghost" type="button" id="clear">Clear filters</button></div>`;
    $('#clear')?.addEventListener('click', () => { Object.assign(state, { q: '', mood: '', category: '' }); $('#q').value = ''; $('#category').value = ''; syncChips(); render(); });
  };
  const syncChips = () => $('#moodChips').querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.mood === state.mood)));

  let searchTimer;
  $('#q').addEventListener('input', (e) => {
    state.q = e.target.value; render();
    clearTimeout(searchTimer);
    if (state.q.trim().length >= 2) searchTimer = setTimeout(() => track('search', { detail: state.q.trim().toLowerCase() }), 1200);
  });
  $('#category').addEventListener('change', (e) => { state.category = e.target.value; render(); });
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
  $('#moodChips').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (!c) return; state.mood = c.dataset.mood; syncChips(); render(); });
  bindItemCards($('#itemsGrid'), cat);
  render();
}
init();
