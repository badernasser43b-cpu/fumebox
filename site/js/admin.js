// BLOOMBOX admin dashboard. Every read/write here is authorised by the database
// (Row Level Security + is_admin()); hiding UI is a convenience, not the security boundary.
import { sb, isConfigured } from './api.js';
import { esc, aed, $, $$, toast, moodStyle } from './ui.js';
import { trackingDisabled, setTrackingDisabled } from './analytics.js';

const view = $('#view');
const editor = $('#editor');
let data = { collections: [], products: [], links: [] };
let currentTab = 'overview';

// ---------------- Auth ----------------
async function boot() {
  if (!isConfigured) {
    $('#loginView').hidden = false;
    $('#loginError').hidden = false;
    $('#loginError').textContent = 'Setup needed: add your Supabase URL and anon key in js/config.js.';
    return;
  }
  const { data: { session } } = await sb.auth.getSession();
  if (session) await enter(session.user); else showLogin();
}
function showLogin(msg) {
  $('#appView').hidden = true; $('#loginView').hidden = false;
  if (msg) { $('#loginError').hidden = false; $('#loginError').textContent = msg; }
  $('#lemail').focus();
}
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#loginBtn'); btn.disabled = true; btn.textContent = 'Signing in…';
  $('#loginError').hidden = true;
  const { data: d, error } = await sb.auth.signInWithPassword({ email: $('#lemail').value.trim(), password: $('#lpass').value });
  btn.disabled = false; btn.textContent = 'Sign in';
  $('#lpass').value = '';
  if (error) { showLogin(/invalid/i.test(error.message) ? 'Email or password is incorrect.' : 'Sign-in failed: ' + error.message); return; }
  await enter(d.user);
});
async function enter(user) {
  const { data: ok, error } = await sb.rpc('is_admin');
  if (error || ok !== true) {
    await sb.auth.signOut();
    showLogin('This account is not an administrator. Ask the store owner to add it in the admins table.');
    return;
  }
  $('#loginView').hidden = true; $('#appView').hidden = false;
  $('#whoami').textContent = user.email;
  go(location.hash.slice(1) || 'overview');
}
$('#logout').addEventListener('click', async () => { await sb.auth.signOut(); location.hash = ''; showLogin(); });

// ---------------- Navigation ----------------
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) go(b.dataset.tab); });
function go(tab) {
  if (!views[tab]) tab = 'overview';
  currentTab = tab;
  history.replaceState(null, '', '#' + tab);
  $$('#tabs [data-tab]').forEach((b) => { if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  view.innerHTML = '<div class="skeleton" style="min-height:300px"></div>';
  views[tab]().catch((err) => { view.innerHTML = `<div class="form-error">Could not load this section: ${esc(err.message || err)}</div>`; });
  view.focus({ preventScroll: true });
  refreshBadges();
}
async function refreshBadges() {
  const [o, m] = await Promise.all([
    sb.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    sb.from('contact_messages').select('id', { count: 'exact', head: true }).eq('handled', false),
  ]);
  const set = (el, n) => { el.hidden = !n; el.textContent = n || ''; };
  set($('#newOrders'), o.count); set($('#newMsgs'), m.count);
}

// ---------------- Helpers ----------------
const must = (r) => { if (r.error) throw r.error; return r.data; };
async function loadCatalogAdmin() {
  const [c, p, l] = await Promise.all([
    sb.from('collections').select('*').order('sort_order').order('id'),
    sb.from('products').select('*').order('collection_id', { nullsFirst: false }).order('sort_order').order('id'),
    sb.from('collection_items').select('*'),
  ]);
  data = { collections: must(c), products: must(p), links: must(l) };
}
const colName = (id) => data.collections.find((c) => c.id === id)?.name || '—';
function confirmAction(title, text, okLabel = 'Confirm') {
  const d = $('#confirmDlg');
  $('#confirmTitle').textContent = title; $('#confirmText').textContent = text; $('#confirmOk').textContent = okLabel;
  d.showModal();
  return new Promise((res) => d.addEventListener('close', () => res(d.returnValue === 'ok'), { once: true }));
}
function friendly(err) {
  const m = err?.message || String(err);
  if (/row-level security|permission denied/i.test(m)) return 'You do not have permission to do that. Sign in again as an administrator.';
  if (/check constraint|violates/i.test(m)) return 'Some values are not valid. Check prices, stock and lengths, then try again.';
  if (/duplicate key.*slug/i.test(m)) return 'Another box already uses that web address (slug).';
  return m;
}
const fmtDate = (s) => new Date(s).toLocaleString('en-AE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dubai' });
async function uploadImage(file, folder) {
  if (!file) return null;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Use a JPG, PNG or WebP image.');
  if (file.size > 2 * 1024 * 1024) throw new Error('Images must be 2 MB or smaller.');
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from('product-images').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error('Image upload failed: ' + error.message);
  return sb.storage.from('product-images').getPublicUrl(path).data.publicUrl;
}
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function download(name, rows) {
  const blob = new Blob(['﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ================= Views =================
const views = {};

views.overview = async () => {
  await loadCatalogAdmin();
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const [orders, msgs] = await Promise.all([
    sb.from('orders').select('reference,customer_name,total_aed,status,created_at').order('created_at', { ascending: false }).limit(5),
    sb.from('orders').select('total_aed,status').gte('created_at', since),
  ]);
  const recent = must(orders), week = must(msgs).filter((o) => o.status !== 'cancelled');
  const active = data.products.filter((p) => !p.is_archived);
  const low = active.filter((p) => p.stock <= 5).sort((a, b) => a.stock - b.stock);
  view.innerHTML = `
    <div class="admin-head"><h1>Overview</h1><a class="btn btn-ghost btn-sm" href="index.html" target="_blank" rel="noopener">Open the store</a></div>
    <div class="kpis">
      <div class="kpi"><div class="v">${week.length}</div><div class="k">Orders, last 7 days</div></div>
      <div class="kpi"><div class="v">${aed(week.reduce((s, o) => s + Number(o.total_aed), 0))}</div><div class="k">Demo revenue, last 7 days</div></div>
      <div class="kpi"><div class="v">${active.length}</div><div class="k">Active items</div></div>
      <div class="kpi"><div class="v">${data.collections.filter((c) => c.is_active).length}</div><div class="k">Active themed boxes</div></div>
      <div class="kpi"><div class="v" style="color:${low.length ? 'var(--danger)' : 'inherit'}">${low.length}</div><div class="k">Items with 5 or fewer in stock</div></div>
    </div>
    <div class="grid-2">
      <div class="card"><h2>Low stock</h2>${low.length ? `<table class="data"><tbody>${low.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(colName(p.collection_id))}</td><td class="num"><strong>${p.stock}</strong></td></tr>`).join('')}</tbody></table>
        <p class="small muted" style="margin-top:.75rem">In the ERP, raise a purchase order for these items, then record the goods receipt and update stock here.</p>` : '<p class="muted">All items have more than 5 in stock.</p>'}</div>
      <div class="card"><h2>Latest orders</h2>${recent.length ? `<table class="data"><tbody>${recent.map((o) => `<tr><td><strong>${esc(o.reference)}</strong><br><span class="small muted">${fmtDate(o.created_at)}</span></td><td>${esc(o.customer_name)}</td><td class="num">${aed(o.total_aed)}</td><td><span class="badge">${esc(o.status)}</span></td></tr>`).join('')}</tbody></table>` : '<p class="muted">No orders yet. Place a test order from the cart page to check the flow.</p>'}</div>
    </div>`;
};

// ---------- Items ----------
views.items = async () => {
  await loadCatalogAdmin();
  const state = { q: '', mood: '', showArchived: false };
  view.innerHTML = `
    <div class="admin-head"><h1>Items &amp; stock</h1><div class="actions"><button class="btn btn-ghost btn-sm" id="exportItems" type="button">Export CSV</button><button class="btn btn-sm" type="button" id="addItem">Add item</button></div></div>
    <div class="filters">
      <input type="search" id="fq" placeholder="Search items" aria-label="Search items">
      <select id="fm" aria-label="Filter by box"><option value="">All boxes</option>${data.collections.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}<option value="none">No box</option></select>
      <label class="check"><input type="checkbox" id="fa"> Show archived</label>
    </div>
    <div class="table-wrap"><table class="data"><thead><tr><th></th><th>Item</th><th>Box</th><th>Category</th><th class="num">Price</th><th class="num">Stock</th><th>Status</th><th class="num">Actions</th></tr></thead><tbody id="rows"></tbody></table></div>`;
  const render = () => {
    const q = state.q.toLowerCase();
    const list = data.products.filter((p) => (state.showArchived || !p.is_archived) && (!q || p.name.toLowerCase().includes(q))
      && (!state.mood || (state.mood === 'none' ? !p.collection_id : p.collection_id === Number(state.mood))));
    $('#rows').innerHTML = list.map((p) => `
      <tr class="${p.is_archived ? 'archived' : ''}">
        <td><img src="${esc(p.image_url || 'images/items/placeholder.svg')}" alt=""></td>
        <td><strong>${esc(p.name)}</strong>${p.is_featured ? ' <span class="badge badge-mood">Featured</span>' : ''}</td>
        <td>${esc(colName(p.collection_id))}</td><td>${esc(p.category)}</td>
        <td class="num">${aed(p.price_aed)}</td>
        <td class="num"><strong style="color:${p.stock <= 5 ? 'var(--danger)' : 'inherit'}">${p.stock}</strong></td>
        <td>${p.is_archived ? '<span class="badge">Archived</span>' : p.is_available ? '<span class="badge badge-ok">Available</span>' : '<span class="badge badge-out">Unavailable</span>'}</td>
        <td><div class="actions">
          <button class="btn btn-ghost btn-sm" type="button" data-edit="${p.id}">Edit</button>
          <button class="btn btn-ghost btn-sm" type="button" data-arch="${p.id}">${p.is_archived ? 'Restore' : 'Archive'}</button>
          <button class="btn btn-ghost btn-sm" type="button" data-del="${p.id}" aria-label="Delete ${esc(p.name)}">Delete</button>
        </div></td>
      </tr>`).join('') || '<tr class="empty-row"><td colspan="8">No items match. Use "Add item" to create one.</td></tr>';
  };
  render();
  $('#fq').addEventListener('input', (e) => { state.q = e.target.value; render(); });
  $('#fm').addEventListener('change', (e) => { state.mood = e.target.value; render(); });
  $('#fa').addEventListener('change', (e) => { state.showArchived = e.target.checked; render(); });
  $('#addItem').addEventListener('click', () => itemEditor(null));
  $('#exportItems').addEventListener('click', () => download('bloombox-items.csv', [['id', 'name', 'box', 'category', 'price_aed', 'stock', 'available', 'archived'],
    ...data.products.map((p) => [p.id, p.name, colName(p.collection_id), p.category, p.price_aed, p.stock, p.is_available, p.is_archived])]));
  $('#rows').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit]'), ar = e.target.closest('[data-arch]'), de = e.target.closest('[data-del]');
    if (ed) itemEditor(data.products.find((p) => p.id === Number(ed.dataset.edit)));
    if (ar) {
      const p = data.products.find((x) => x.id === Number(ar.dataset.arch));
      try { must(await sb.from('products').update({ is_archived: !p.is_archived }).eq('id', p.id).select()); toast(p.is_archived ? 'Item restored.' : 'Item archived. It is hidden from the store.'); views.items(); }
      catch (err) { toast(friendly(err), 'error'); }
    }
    if (de) {
      const p = data.products.find((x) => x.id === Number(de.dataset.del));
      const inBoxes = data.links.filter((l) => l.product_id === p.id).map((l) => colName(l.collection_id));
      const ok = await confirmAction(`Delete ${p.name}?`, `This permanently removes the item${inBoxes.length ? ` and takes it out of the ${inBoxes.join(', ')} box` : ''}. Past orders keep their record. To hide it temporarily, use Archive instead.`, 'Delete item');
      if (!ok) return;
      try { must(await sb.from('products').delete().eq('id', p.id).select()); toast('Item deleted.'); views.items(); }
      catch (err) { toast(friendly(err), 'error'); }
    }
  });
};

function itemEditor(p) {
  const cats = [...new Set(data.products.map((x) => x.category))].sort();
  editor.setAttribute('style', '');
  editor.innerHTML = `
    <form id="itemForm" novalidate>
      <h2 style="font-size:1.6rem">${p ? 'Edit item' : 'Add item'}</h2>
      <div id="itemErr" class="form-error" role="alert" hidden></div>
      <div class="form-grid">
        <div class="field full"><label for="i-name">Name</label><input id="i-name" name="name" type="text" required maxlength="120" value="${esc(p?.name || '')}"></div>
        <div class="field full"><label for="i-desc">Description</label><textarea id="i-desc" name="description" maxlength="2000" rows="3">${esc(p?.description || '')}</textarea></div>
        <div class="field"><label for="i-price">Price (AED)</label><input id="i-price" name="price_aed" type="number" min="0.01" max="99999" step="0.01" required value="${p ? p.price_aed : ''}"></div>
        <div class="field"><label for="i-stock">Stock on hand</label><input id="i-stock" name="stock" type="number" min="0" max="100000" step="1" required value="${p ? p.stock : 0}"><span class="hint">Units you physically have (match your ERP).</span></div>
        <div class="field"><label for="i-cat">Category</label><input id="i-cat" name="category" type="text" list="catList" required maxlength="40" value="${esc(p?.category || '')}"><datalist id="catList">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
        <div class="field"><label for="i-col">Mood / box</label><select id="i-col" name="collection_id"><option value="">No box</option>${data.collections.map((c) => `<option value="${c.id}" ${p?.collection_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field full"><label for="i-file">Image</label>
          <div style="display:flex;gap:1rem;align-items:center"><img class="img-preview" id="i-prev" src="${esc(p?.image_url || 'images/items/placeholder.svg')}" alt="">
          <div style="flex:1;display:grid;gap:.5rem"><input id="i-file" type="file" accept="image/jpeg,image/png,image/webp"><input id="i-url" name="image_url" type="text" placeholder="…or an image URL starting with https://" value="${esc(p?.image_url || '')}"></div></div>
          <span class="hint">JPG, PNG or WebP up to 2 MB. Square images look best.</span></div>
        <div class="field"><label for="i-sort">Display order</label><input id="i-sort" name="sort_order" type="number" step="1" value="${p?.sort_order ?? 0}"><span class="hint">Lower numbers appear first.</span></div>
        <div class="field" style="align-content:center;gap:.6rem">
          <label class="check"><input type="checkbox" name="is_available" ${p ? (p.is_available ? 'checked' : '') : 'checked'}> Available for sale</label>
          <label class="check"><input type="checkbox" name="is_featured" ${p?.is_featured ? 'checked' : ''}> Featured on home page</label>
        </div>
      </div>
      <div class="dlg-actions"><button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-ink" type="submit" id="saveItem">${p ? 'Save changes' : 'Add item'}</button></div>
    </form>`;
  const f = $('#itemForm');
  $('#i-file').addEventListener('change', (e) => { const file = e.target.files[0]; if (file) $('#i-prev').src = URL.createObjectURL(file); });
  $('[data-close]', f).addEventListener('click', () => editor.close());
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#itemErr'); err.hidden = true;
    const v = Object.fromEntries(new FormData(f));
    const price = Number(v.price_aed), stock = Number(v.stock);
    const problems = [];
    if (v.name.trim().length < 2) problems.push('Enter a name (at least 2 characters).');
    if (!(price > 0 && price < 100000)) problems.push('Enter a price above AED 0.');
    if (!Number.isInteger(stock) || stock < 0) problems.push('Stock must be a whole number, 0 or more.');
    if (v.category.trim().length < 2) problems.push('Enter a category.');
    if (v.image_url && !/^(https:\/\/|images\/)/.test(v.image_url.trim())) problems.push('Image URLs must start with https://');
    if (problems.length) { err.hidden = false; err.textContent = problems.join(' '); return; }
    const btn = $('#saveItem'); btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const uploaded = await uploadImage($('#i-file').files[0], 'items');
      const row = {
        name: v.name.trim(), description: v.description.trim(), price_aed: Math.round(price * 100) / 100, stock,
        category: v.category.trim(), collection_id: v.collection_id ? Number(v.collection_id) : null,
        image_url: uploaded || v.image_url.trim() || null, sort_order: Number(v.sort_order) || 0,
        is_available: f.elements.is_available.checked, is_featured: f.elements.is_featured.checked,
      };
      must(p ? await sb.from('products').update(row).eq('id', p.id).select() : await sb.from('products').insert(row).select());
      editor.close(); toast(p ? 'Item saved.' : 'Item added to the store.'); views.items();
    } catch (ex) {
      err.hidden = false; err.textContent = friendly(ex);
      btn.disabled = false; btn.textContent = p ? 'Save changes' : 'Add item';
    }
  });
  editor.showModal();
  $('#i-name').focus();
}

// ---------- Themed boxes ----------
views.boxes = async () => {
  await loadCatalogAdmin();
  const price = (c) => {
    const list = data.links.filter((l) => l.collection_id === c.id).reduce((s, l) => { const p = data.products.find((x) => x.id === l.product_id); return s + (p ? Number(p.price_aed) * l.quantity : 0); }, 0);
    return { list, box: Math.round(list * (1 - Number(c.discount_pct) / 100) * 100) / 100 };
  };
  const canMake = (c) => {
    const ls = data.links.filter((l) => l.collection_id === c.id);
    if (!ls.length) return 0;
    return Math.min(...ls.map((l) => { const p = data.products.find((x) => x.id === l.product_id); return !p || p.is_archived || !p.is_available ? 0 : Math.floor(p.stock / l.quantity); }));
  };
  view.innerHTML = `
    <div class="admin-head"><h1>Themed boxes</h1><button class="btn btn-sm" type="button" id="addBox">Add box</button></div>
    <p class="muted">A box's price is calculated from its items' prices minus the box discount. Stock is not stored per box: each sale deducts its individual items.</p>
    <div class="table-wrap"><table class="data"><thead><tr><th>Box</th><th>Contents</th><th class="num">Items value</th><th class="num">Discount</th><th class="num">Box price</th><th class="num">Can make</th><th>Status</th><th class="num">Actions</th></tr></thead>
    <tbody>${data.collections.map((c) => { const pr = price(c), mk = canMake(c); return `
      <tr><td style="${moodStyle(c.theme_color)}"><strong style="color:var(--mood-deep)">${esc(c.name)}</strong><br><span class="small muted">/box.html?slug=${esc(c.slug)}</span></td>
        <td class="small">${data.links.filter((l) => l.collection_id === c.id).map((l) => `${l.quantity > 1 ? l.quantity + '× ' : ''}${esc(data.products.find((p) => p.id === l.product_id)?.name || '?')}`).join('<br>') || '<span style="color:var(--danger)">Empty — add items</span>'}</td>
        <td class="num">${aed(pr.list)}</td><td class="num">${Number(c.discount_pct)}%</td><td class="num"><strong>${aed(pr.box)}</strong></td>
        <td class="num" style="color:${mk === 0 ? 'var(--danger)' : 'inherit'}"><strong>${mk}</strong></td>
        <td>${c.is_active ? '<span class="badge badge-ok">Live</span>' : '<span class="badge">Hidden</span>'}</td>
        <td><div class="actions"><button class="btn btn-ghost btn-sm" type="button" data-edit="${c.id}">Edit</button><button class="btn btn-ghost btn-sm" type="button" data-del="${c.id}">Delete</button></div></td></tr>`; }).join('')}</tbody></table></div>`;
  $('#addBox').addEventListener('click', () => boxEditor(null));
  view.querySelector('tbody').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit]'), de = e.target.closest('[data-del]');
    if (ed) boxEditor(data.collections.find((c) => c.id === Number(ed.dataset.edit)));
    if (de) {
      const c = data.collections.find((x) => x.id === Number(de.dataset.del));
      if (!await confirmAction(`Delete the ${c.name} box?`, 'The box and its contents list are removed. The individual items stay in the store. To hide it temporarily, edit it and untick "Show in store".', 'Delete box')) return;
      try { must(await sb.from('collections').delete().eq('id', c.id).select()); toast('Box deleted.'); views.boxes(); } catch (err) { toast(friendly(err), 'error'); }
    }
  });
};

function boxEditor(c) {
  const links = c ? data.links.filter((l) => l.collection_id === c.id).map((l) => ({ ...l })) : [];
  const productOptions = (sel) => data.products.filter((p) => !p.is_archived).map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)} — ${aed(p.price_aed)}</option>`).join('');
  editor.innerHTML = `
    <form id="boxForm" novalidate>
      <h2 style="font-size:1.6rem">${c ? `Edit ${esc(c.name)} box` : 'Add a themed box'}</h2>
      <div id="boxErr" class="form-error" role="alert" hidden></div>
      <div class="form-grid">
        <div class="field"><label for="b-name">Box name</label><input id="b-name" name="name" required maxlength="60" value="${esc(c?.name || '')}" placeholder="e.g. Ramadan"></div>
        <div class="field"><label for="b-slug">Web address (slug)</label><input id="b-slug" name="slug" required maxlength="40" pattern="[a-z0-9-]+" value="${esc(c?.slug || '')}" placeholder="ramadan"><span class="hint">Lowercase letters, numbers and dashes.</span></div>
        <div class="field full"><label for="b-tag">Tagline</label><input id="b-tag" name="tagline" maxlength="120" value="${esc(c?.tagline || '')}"></div>
        <div class="field full"><label for="b-desc">Description</label><textarea id="b-desc" name="description" maxlength="1500" rows="3">${esc(c?.description || '')}</textarea></div>
        <div class="field"><label for="b-color">Mood colour</label><input id="b-color" name="theme_color" type="color" value="${esc(c?.theme_color || '#5B3FD9')}" style="min-height:48px;padding:.25rem"></div>
        <div class="field"><label for="b-disc">Box discount (%)</label><input id="b-disc" name="discount_pct" type="number" min="0" max="50" step="0.5" value="${c ? Number(c.discount_pct) : 10}"></div>
        <div class="field"><label for="b-sort">Display order</label><input id="b-sort" name="sort_order" type="number" step="1" value="${c?.sort_order ?? data.collections.length + 1}"></div>
        <div class="field" style="align-content:center"><label class="check"><input type="checkbox" name="is_active" ${c ? (c.is_active ? 'checked' : '') : 'checked'}> Show in store</label></div>
        <div class="field full"><label for="b-file">Box image</label>
          <div style="display:flex;gap:1rem;align-items:center"><img class="img-preview" id="b-prev" src="${esc(c?.image_url || 'images/photos/boxes/custom.webp')}" alt="">
          <div style="flex:1;display:grid;gap:.5rem"><input id="b-file" type="file" accept="image/jpeg,image/png,image/webp"><input id="b-url" name="image_url" type="text" placeholder="…or an image URL starting with https://" value="${esc(c?.image_url || '')}"></div></div></div>
      </div>
      <h3 style="font-family:var(--body);font-size:1.1rem;margin-top:.5rem">Contents</h3>
      <div id="contents"></div>
      <button class="btn btn-ghost btn-sm" type="button" id="addRow">Add an item to this box</button>
      <p class="small muted" id="boxCalc"></p>
      <div class="dlg-actions"><button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-ink" type="submit" id="saveBox">${c ? 'Save box' : 'Add box'}</button></div>
    </form>`;
  const f = $('#boxForm');
  const draw = () => {
    $('#contents').innerHTML = links.map((l, i) => `<div class="contents-row"><select data-i="${i}" data-k="product_id" aria-label="Item">${productOptions(l.product_id)}</select><input data-i="${i}" data-k="quantity" type="number" min="1" max="5" value="${l.quantity}" aria-label="Quantity"><button class="btn btn-ghost btn-sm" type="button" data-rm="${i}" aria-label="Remove item">Remove</button></div>`).join('') || '<p class="muted small">No items yet.</p>';
    const list = links.reduce((s, l) => s + Number(data.products.find((p) => p.id === Number(l.product_id))?.price_aed || 0) * l.quantity, 0);
    const disc = Number(f.elements.discount_pct.value) || 0;
    $('#boxCalc').textContent = `Items value ${aed(list)} − ${disc}% = box price ${aed(Math.round(list * (1 - disc / 100) * 100) / 100)}`;
  };
  draw();
  $('#addRow').addEventListener('click', () => { const free = data.products.find((p) => !p.is_archived && !links.some((l) => Number(l.product_id) === p.id)); if (free) { links.push({ product_id: free.id, quantity: 1 }); draw(); } });
  $('#contents').addEventListener('change', (e) => { const el = e.target.closest('[data-i]'); if (!el) return; links[el.dataset.i][el.dataset.k] = Number(el.value); draw(); });
  $('#contents').addEventListener('click', (e) => { const r = e.target.closest('[data-rm]'); if (r) { links.splice(Number(r.dataset.rm), 1); draw(); } });
  f.elements.discount_pct.addEventListener('input', draw);
  f.elements.name.addEventListener('input', (e) => { if (!c && !f.elements.slug.dataset.touched) f.elements.slug.value = e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); });
  f.elements.slug.addEventListener('input', (e) => { e.target.dataset.touched = '1'; });
  $('#b-file').addEventListener('change', (e) => { const file = e.target.files[0]; if (file) $('#b-prev').src = URL.createObjectURL(file); });
  $('[data-close]', f).addEventListener('click', () => editor.close());
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#boxErr'); err.hidden = true;
    const v = Object.fromEntries(new FormData(f));
    const ids = links.map((l) => Number(l.product_id));
    const problems = [];
    if (v.name.trim().length < 2) problems.push('Enter a box name.');
    if (!/^[a-z0-9-]{2,40}$/.test(v.slug)) problems.push('The slug can only use lowercase letters, numbers and dashes.');
    if (new Set(ids).size !== ids.length) problems.push('Each item can only appear once — use the quantity instead.');
    if (links.some((l) => !(l.quantity >= 1 && l.quantity <= 5))) problems.push('Quantities must be between 1 and 5.');
    if (f.elements.is_active.checked && !links.length) problems.push('A box shown in the store needs at least one item.');
    if (problems.length) { err.hidden = false; err.textContent = problems.join(' '); return; }
    const btn = $('#saveBox'); btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const uploaded = await uploadImage($('#b-file').files[0], 'boxes');
      const row = { name: v.name.trim(), slug: v.slug, tagline: v.tagline.trim(), description: v.description.trim(), theme_color: v.theme_color.toUpperCase(),
        discount_pct: Number(v.discount_pct) || 0, sort_order: Number(v.sort_order) || 0, is_active: f.elements.is_active.checked, image_url: uploaded || v.image_url.trim() || null };
      const saved = must(c ? await sb.from('collections').update(row).eq('id', c.id).select() : await sb.from('collections').insert(row).select())[0];
      // Replace the contents list
      must(await sb.from('collection_items').delete().eq('collection_id', saved.id).select());
      if (links.length) must(await sb.from('collection_items').insert(links.map((l) => ({ collection_id: saved.id, product_id: Number(l.product_id), quantity: l.quantity }))).select());
      editor.close(); toast(c ? 'Box saved.' : 'Box added to the store.'); views.boxes();
    } catch (ex) { err.hidden = false; err.textContent = friendly(ex); btn.disabled = false; btn.textContent = c ? 'Save box' : 'Add box'; }
  });
  editor.showModal();
}

// ---------- Orders ----------
views.orders = async () => {
  const state = { status: '' };
  view.innerHTML = `
    <div class="admin-head"><h1>Orders</h1><button class="btn btn-ghost btn-sm" type="button" id="exportOrders">Export CSV</button></div>
    <p class="muted">All orders are demonstration orders: no payment was taken. Customer details are visible only to administrators.</p>
    <div class="filters"><select id="fs" aria-label="Filter by status"><option value="">All statuses</option><option>new</option><option>processing</option><option>fulfilled</option><option>cancelled</option></select></div>
    <div class="table-wrap"><table class="data"><thead><tr><th>Reference</th><th>Date (UAE)</th><th>Customer</th><th>Emirate</th><th class="num">Total</th><th>Status</th><th></th></tr></thead><tbody id="orows"></tbody></table></div>`;
  let orders = [];
  const load = async () => {
    let q = sb.from('orders').select('*, order_lines(*, order_line_items(*))').order('created_at', { ascending: false }).limit(500);
    if (state.status) q = q.eq('status', state.status);
    orders = must(await q);
    $('#orows').innerHTML = orders.map((o) => `
      <tr><td><strong>${esc(o.reference)}</strong></td><td>${fmtDate(o.created_at)}</td><td>${esc(o.customer_name)}</td><td>${esc(o.emirate)}</td><td class="num">${aed(o.total_aed)}</td>
        <td><select class="status-select" data-status="${o.id}" aria-label="Status for ${esc(o.reference)}">${['new', 'processing', 'fulfilled', 'cancelled'].map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
        <td><button class="btn btn-ghost btn-sm" type="button" data-open="${o.id}" aria-expanded="false">Details</button></td></tr>
      <tr class="order-detail" id="d-${o.id}" hidden><td colspan="7"><div class="grid-2">
        <div><strong>Boxes</strong>${o.order_lines.map((l) => `<div style="margin-top:.5rem"><strong>${l.quantity} × ${esc(l.title)}</strong> — ${aed(l.line_total_aed)}${l.gift_message ? `<br><span class="small muted">Gift message: “${esc(l.gift_message)}”</span>` : ''}
          <ul>${l.order_line_items.map((i) => `<li>${i.qty_total} × ${esc(i.product_name)} (${aed(i.unit_price_aed)} each)</li>`).join('')}</ul></div>`).join('')}
          <div class="small">Subtotal ${aed(o.subtotal_aed)} · Delivery ${aed(o.delivery_aed)} · <strong>Total ${aed(o.total_aed)}</strong></div></div>
        <div><strong>Customer</strong><p class="small" style="margin:.5rem 0">${esc(o.customer_name)}<br>${esc(o.email)}<br>${esc(o.phone)}<br>${esc(o.address)}, ${esc(o.emirate)}</p>${o.notes ? `<p class="small"><strong>Notes:</strong> ${esc(o.notes)}</p>` : ''}</div>
      </div></td></tr>`).join('') || '<tr class="empty-row"><td colspan="7">No orders yet.</td></tr>';
  };
  await load();
  $('#fs').addEventListener('change', async (e) => { state.status = e.target.value; await load(); });
  $('#orows').addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (!b) return; const row = $('#d-' + b.dataset.open); row.hidden = !row.hidden; b.setAttribute('aria-expanded', String(!row.hidden)); });
  $('#orows').addEventListener('change', async (e) => {
    const s = e.target.closest('[data-status]'); if (!s) return;
    try { must(await sb.from('orders').update({ status: s.value }).eq('id', s.dataset.status).select()); toast(`Order marked ${s.value}.`); refreshBadges(); }
    catch (err) { toast(friendly(err), 'error'); }
  });
  $('#exportOrders').addEventListener('click', () => download('bloombox-orders.csv', [['reference', 'created_at_utc', 'status', 'emirate', 'box', 'type', 'box_qty', 'item', 'item_units', 'item_unit_price_aed', 'order_subtotal_aed', 'order_delivery_aed', 'order_total_aed'],
    ...orders.flatMap((o) => o.order_lines.flatMap((l) => l.order_line_items.map((i) => [o.reference, o.created_at, o.status, o.emirate, l.title, l.line_type, l.quantity, i.product_name, i.qty_total, i.unit_price_aed, o.subtotal_aed, o.delivery_aed, o.total_aed])))]));
};

// ---------- Messages ----------
views.messages = async () => {
  const rows = must(await sb.from('contact_messages').select('*').order('created_at', { ascending: false }).limit(300));
  view.innerHTML = `<div class="admin-head"><h1>Messages</h1></div><div id="msgList">
    ${rows.length ? rows.map((m) => `<div class="card" style="${m.handled ? 'opacity:.6' : ''}">
      <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap"><div><strong>${esc(m.subject)}</strong><br><span class="small muted">${esc(m.name)} · <a href="mailto:${esc(m.email)}">${esc(m.email)}</a> · ${fmtDate(m.created_at)}</span></div>
      <label class="check"><input type="checkbox" data-handled="${m.id}" ${m.handled ? 'checked' : ''}> Handled</label></div>
      <p style="margin:.75rem 0 0;white-space:pre-wrap">${esc(m.message)}</p></div>`).join('') : '<div class="card"><p class="muted">No messages yet.</p></div>'}</div>`;
  $('#msgList').addEventListener('change', async (e) => {
    const c = e.target.closest('[data-handled]'); if (!c) return;
    try { must(await sb.from('contact_messages').update({ handled: c.checked }).eq('id', c.dataset.handled).select()); c.closest('.card').style.opacity = c.checked ? .6 : 1; refreshBadges(); }
    catch (err) { toast(friendly(err), 'error'); }
  });
};

// ---------- Analytics (Stage 3) ----------
function dubaiDate(d) { return new Date(d.getTime() + 4 * 3600e3).toISOString().slice(0, 10); }
function rangeFromInputs(from, to) {
  return { from: new Date(from + 'T00:00:00+04:00').toISOString(), to: new Date(new Date(to + 'T00:00:00+04:00').getTime() + 864e5).toISOString() };
}
function barChart(daily, key, label, color) {
  const W = 640, H = 200, P = 28, max = Math.max(1, ...daily.map((d) => Number(d[key])));
  const bw = (W - P * 2) / daily.length;
  return `<svg class="chart" viewBox="0 0 ${W} ${H + 30}" role="img" aria-label="${esc(label)} per day">
    ${[0, .5, 1].map((t) => `<line x1="${P}" x2="${W - P}" y1="${H - t * (H - 20)}" y2="${H - t * (H - 20)}" stroke="#DCD7EA"/><text x="${P - 6}" y="${H - t * (H - 20) + 4}" font-size="11" text-anchor="end" fill="#5E5875">${Math.round(max * t * 100) / 100}</text>`).join('')}
    ${daily.map((d, i) => { const h = (Number(d[key]) / max) * (H - 20); return `<rect x="${P + i * bw + bw * .15}" y="${H - h}" width="${bw * .7}" height="${Math.max(h, 0)}" rx="3" fill="${color}"><title>${d.day}: ${d[key]}</title></rect>
      ${daily.length <= 16 ? `<text x="${P + i * bw + bw / 2}" y="${H + 16}" font-size="11" text-anchor="middle" fill="#5E5875">${d.day.slice(5)}</text>` : ''}
      ${Number(d[key]) > 0 && daily.length <= 16 ? `<text x="${P + i * bw + bw / 2}" y="${H - h - 5}" font-size="11" text-anchor="middle" fill="#221C3A">${d[key]}</text>` : ''}`; }).join('')}
  </svg>`;
}
views.analytics = async () => {
  const today = dubaiDate(new Date());
  const weekAgo = dubaiDate(new Date(Date.now() - 6 * 864e5));
  view.innerHTML = `
    <div class="admin-head"><h1>Analytics</h1><div class="actions no-print"><button class="btn btn-ghost btn-sm" type="button" id="csv">Export CSV</button><button class="btn btn-ghost btn-sm" type="button" id="print">Print / save as PDF</button></div></div>
    <div class="card no-print">
      <div class="filters" style="margin:0">
        <label>From <input type="date" id="from" value="${weekAgo}"></label>
        <label>To <input type="date" id="to" value="${today}"></label>
        <button class="btn btn-sm btn-ink" type="button" id="run">Show report</button>
        <label class="check" style="margin-left:auto"><input type="checkbox" id="optout" ${trackingDisabled() ? 'checked' : ''}> Don't count visits from this browser</label>
      </div>
      <p class="small muted" style="margin:.75rem 0 0">Set the dates to each reporting week (for example Week 13: Sunday to Saturday). Data comes only from real visits to this website. Automated browsers and visits from browsers with the box above ticked are not counted.</p>
    </div>
    <div id="report"></div>`;
  $('#optout').addEventListener('change', (e) => { setTrackingDisabled(e.target.checked); toast(e.target.checked ? 'Visits from this browser will no longer be counted.' : 'Visits from this browser will be counted.'); });
  $('#print').addEventListener('click', () => print());
  let rep = null;
  const run = async () => {
    const { from, to } = rangeFromInputs($('#from').value, $('#to').value);
    if (!(new Date(to) > new Date(from))) { toast('The end date must be on or after the start date.', 'error'); return; }
    $('#report').innerHTML = '<div class="skeleton" style="min-height:300px"></div>';
    const r = await sb.rpc('analytics_report', { p_from: from, p_to: to });
    if (r.error) { $('#report').innerHTML = `<div class="form-error">${esc(friendly(r.error))}</div>`; return; }
    rep = r.data; const t = rep.totals;
    const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 + '%' : '—');
    const funnel = [['Sessions', t.sessions], ['Added to cart', t.cart_sessions], ['Started checkout', t.checkout_sessions], ['Placed an order', t.order_sessions]];
    const tbl = (rows, cols) => rows.length ? `<table class="data"><thead><tr>${cols.map(([, h, n]) => `<th class="${n ? 'num' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map(([k, , n]) => `<td class="${n ? 'num' : ''}">${esc(r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="muted small">No data in this period.</p>';
    $('#report').innerHTML = `
      <p class="muted">Report period: <strong>${esc($('#from').value)}</strong> to <strong>${esc($('#to').value)}</strong> (UAE time). Generated ${fmtDate(new Date())}.</p>
      <div class="kpis">
        <div class="kpi"><div class="v">${t.sessions}</div><div class="k">Sessions (visits)</div></div>
        <div class="kpi"><div class="v">${t.page_views}</div><div class="k">Page views</div></div>
        <div class="kpi"><div class="v">${t.orders}</div><div class="k">Orders</div></div>
        <div class="kpi"><div class="v">${pct(t.order_sessions, t.sessions)}</div><div class="k">Conversion rate (sessions → order)</div></div>
        <div class="kpi"><div class="v">${aed(t.revenue_aed)}</div><div class="k">Demo sales value</div></div>
        <div class="kpi"><div class="v">${aed(t.avg_order_aed)}</div><div class="k">Average order value</div></div>
        <div class="kpi"><div class="v">${pct(t.cart_sessions - t.order_sessions, t.cart_sessions)}</div><div class="k">Cart abandonment</div></div>
        <div class="kpi"><div class="v">${t.builder_adds}</div><div class="k">Items added in box builder</div></div>
      </div>
      <div class="grid-2">
        <div class="card"><h2>Sessions per day</h2>${barChart(rep.daily, 'sessions', 'Sessions', '#5B3FD9')}</div>
        <div class="card"><h2>Orders per day</h2>${barChart(rep.daily, 'orders', 'Orders', '#10A374')}</div>
      </div>
      <div class="card"><h2>Shopping funnel</h2><div class="funnel">${funnel.map(([k, v]) => `<div class="step"><span>${k}</span><div class="bar" style="width:${t.sessions ? (v / t.sessions) * 100 : 0}%"></div><strong style="text-align:right">${v} <span class="muted small">${pct(v, t.sessions)}</span></strong></div>`).join('')}</div></div>
      <div class="grid-2">
        <div class="card"><h2>Pages</h2>${tbl(rep.pages, [['page', 'Page'], ['views', 'Views', 1]])}</div>
        <div class="card"><h2>Devices</h2>${tbl(rep.devices, [['device', 'Device'], ['sessions', 'Sessions', 1]])}<h2 style="margin-top:1.25rem">Traffic sources</h2>${tbl(rep.referrers, [['source', 'Source'], ['sessions', 'Sessions', 1]])}</div>
      </div>
      <div class="grid-2">
        <div class="card"><h2>Signature boxes</h2>${tbl(rep.boxes, [['name', 'Box'], ['views', 'Views', 1], ['adds', 'Added to cart', 1], ['units_sold', 'Sold', 1]])}</div>
        <div class="card"><h2>Box types ordered</h2>${tbl(rep.order_types.map((x) => ({ ...x, type: x.type === 'custom' ? 'Build-Your-Own' : 'Signature' })), [['type', 'Type'], ['boxes', 'Boxes', 1]])}<h2 style="margin-top:1.25rem">Searches</h2>${tbl(rep.searches, [['term', 'Search term'], ['count', 'Times', 1]])}</div>
      </div>
      <div class="card"><h2>Items</h2>${tbl(rep.items, [['name', 'Item'], ['views', 'Detail views', 1], ['builder_adds', 'Added to a box', 1], ['units_sold', 'Units sold', 1]])}</div>`;
  };
  $('#run').addEventListener('click', run);
  $('#csv').addEventListener('click', () => {
    if (!rep) return toast('Run a report first.', 'error');
    const t = rep.totals;
    download(`bloombox-analytics-${$('#from').value}-to-${$('#to').value}.csv`, [
      ['BLOOMBOX analytics export', `${$('#from').value} to ${$('#to').value} (UAE)`], [],
      ['Metric', 'Value'], ...Object.entries(t), [],
      ['Day', 'Sessions', 'Page views', 'Add to cart', 'Orders', 'Revenue AED'], ...rep.daily.map((d) => [d.day, d.sessions, d.page_views, d.add_to_cart, d.orders, d.revenue_aed]), [],
      ['Page', 'Views'], ...rep.pages.map((p) => [p.page, p.views]), [],
      ['Box', 'Views', 'Added to cart', 'Sold'], ...rep.boxes.map((b) => [b.name, b.views, b.adds, b.units_sold]), [],
      ['Item', 'Detail views', 'Added to a box', 'Units sold'], ...rep.items.map((i) => [i.name, i.views, i.builder_adds, i.units_sold]), [],
      ['Device', 'Sessions'], ...rep.devices.map((d) => [d.device, d.sessions]), [],
      ['Source', 'Sessions'], ...rep.referrers.map((d) => [d.source, d.sessions]), [],
      ['Search term', 'Times'], ...rep.searches.map((s) => [s.term, s.count]),
    ]);
  });
  run();
};

// ---------- Site content ----------
views.content = async () => {
  const row = must(await sb.from('site_settings').select('content').eq('id', 1).maybeSingle());
  const s = row?.content || {};
  const team = Array.isArray(s.team) ? s.team.map((m) => ({ ...m })) : [];
  const fields = [['store_name', 'Store name', 'input'], ['tagline', 'Tagline', 'input'], ['about', 'About the company', 'text'], ['mission', 'Mission', 'text'], ['vision', 'Vision', 'text'],
    ['strategy', 'Strategy', 'text'], ['target_customers', 'Target customers', 'text'], ['management', 'Management and employment', 'text'],
    ['email', 'Contact email', 'input'], ['phone', 'Phone', 'input'], ['address', 'Address shown on the site', 'input'], ['map_query', 'Map location (place name or address)', 'input'], ['hours', 'Opening hours', 'input']];
  view.innerHTML = `
    <div class="admin-head"><h1>Site content</h1></div>
    <p class="muted">These texts appear on the Home, About, Contact and Help pages. Replace every placeholder in [brackets] with your group's real information. Do not publish student ID numbers or private phone numbers.</p>
    <form id="contentForm" class="card" novalidate>
      ${fields.map(([k, label, type]) => `<div class="field"><label for="s-${k}">${label}</label>${type === 'text' ? `<textarea id="s-${k}" name="${k}" rows="3" maxlength="1500">${esc(s[k] || '')}</textarea>` : `<input id="s-${k}" name="${k}" type="text" maxlength="200" value="${esc(s[k] || '')}">`}</div>`).join('')}
      <h2>Owners and team</h2><div id="teamRows"></div>
      <button class="btn btn-ghost btn-sm" type="button" id="addMember">Add a team member</button>
      <div class="dlg-actions" style="position:static;padding-bottom:0"><button class="btn btn-ink" type="submit" id="saveContent">Save content</button></div>
    </form>`;
  const draw = () => { $('#teamRows').innerHTML = team.map((m, i) => `<div class="team-row"><input aria-label="Name" data-i="${i}" data-k="name" value="${esc(m.name)}" maxlength="80" placeholder="Full name"><input aria-label="Role" data-i="${i}" data-k="role" value="${esc(m.role)}" maxlength="80" placeholder="Role"><button class="btn btn-ghost btn-sm" type="button" data-rm="${i}">Remove</button></div>`).join(''); };
  draw();
  $('#teamRows').addEventListener('input', (e) => { const el = e.target.closest('[data-i]'); if (el) team[el.dataset.i][el.dataset.k] = el.value; });
  $('#teamRows').addEventListener('click', (e) => { const r = e.target.closest('[data-rm]'); if (r) { team.splice(Number(r.dataset.rm), 1); draw(); } });
  $('#addMember').addEventListener('click', () => { team.push({ name: '', role: '' }); draw(); });
  $('#contentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    const content = { ...s, ...Object.fromEntries(fields.map(([k]) => [k, (v[k] || '').trim()])), team: team.filter((m) => m.name.trim()).map((m) => ({ name: m.name.trim(), role: m.role.trim() })) };
    const btn = $('#saveContent'); btn.disabled = true;
    try { must(await sb.from('site_settings').update({ content }).eq('id', 1).select()); toast('Site content saved. Refresh the store to see it.'); }
    catch (err) { toast(friendly(err), 'error'); } finally { btn.disabled = false; }
  });
};

sb.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT' && !$('#appView').hidden) showLogin('You have been signed out.'); });
boot();   // module scripts run after the document is parsed
