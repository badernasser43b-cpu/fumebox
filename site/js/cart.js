// Shopping cart and Build-Your-Own draft, kept in the visitor's browser (localStorage).
import { BOX_MAX, CUSTOM_MAX, ITEM_MAX } from './api.js';

const CART_KEY = 'moodbox-cart-v1';
const DRAFT_KEY = 'moodbox-builder-v1';

function read(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
  window.dispatchEvent(new CustomEvent('cart:change'));
}
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(n) || 0)));

export function getCart() {
  const lines = read(CART_KEY, []);
  return Array.isArray(lines) ? lines.filter((l) => l && (l.type === 'signature' || l.type === 'custom')) : [];
}
export const setCart = (lines) => write(CART_KEY, lines);
export const cartCount = () => getCart().reduce((n, l) => n + (l.type === 'signature' ? l.quantity : 1), 0);

export function addSignature(collectionId, quantity, maxQty = BOX_MAX) {
  const lines = getCart();
  const existing = lines.find((l) => l.type === 'signature' && l.collection_id === collectionId);
  if (existing) existing.quantity = clamp(existing.quantity + quantity, 1, Math.min(BOX_MAX, maxQty));
  else lines.push({ id: uid(), type: 'signature', collection_id: collectionId, quantity: clamp(quantity, 1, Math.min(BOX_MAX, maxQty)), gift_message: '' });
  setCart(lines);
}
export function addCustom(items, giftMessage = '') {
  const lines = getCart();
  lines.push({ id: uid(), type: 'custom', items: items.map((i) => ({ product_id: i.product_id, quantity: clamp(i.quantity, 1, ITEM_MAX) })), gift_message: giftMessage.slice(0, 200) });
  setCart(lines);
}
export function updateLine(id, patch) {
  setCart(getCart().map((l) => (l.id === id ? { ...l, ...patch } : l)));
}
export const removeLine = (id) => setCart(getCart().filter((l) => l.id !== id));
export const clearCart = () => setCart([]);

// ---- Build-Your-Own draft ----
export function getDraft() {
  const d = read(DRAFT_KEY, { items: [], gift_message: '' });
  return { items: Array.isArray(d.items) ? d.items : [], gift_message: typeof d.gift_message === 'string' ? d.gift_message : '' };
}
export const setDraft = (d) => write(DRAFT_KEY, d);
export function draftAdd(productId, stock) {
  const d = getDraft();
  const hit = d.items.find((i) => i.product_id === productId);
  if (hit) {
    if (hit.quantity >= Math.min(ITEM_MAX, stock)) return { ok: false, reason: stock <= hit.quantity ? 'stock' : 'item_max' };
    hit.quantity += 1;
  } else {
    if (d.items.length >= CUSTOM_MAX) return { ok: false, reason: 'box_full' };
    if (stock < 1) return { ok: false, reason: 'stock' };
    d.items.push({ product_id: productId, quantity: 1 });
  }
  setDraft(d);
  return { ok: true };
}
export function draftSet(productId, quantity) {
  const d = getDraft();
  d.items = quantity <= 0 ? d.items.filter((i) => i.product_id !== productId)
    : d.items.map((i) => (i.product_id === productId ? { ...i, quantity: clamp(quantity, 1, ITEM_MAX) } : i));
  setDraft(d);
}
export const draftClear = () => setDraft({ items: [], gift_message: '' });
