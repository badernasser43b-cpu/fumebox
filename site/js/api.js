// Data access layer: every call to Supabase goes through this file.
import { CONFIG } from './config.js';

export const isConfigured = !CONFIG.SUPABASE_URL.includes('YOUR-PROJECT');

export const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, storageKey: 'moodbox-admin-session', autoRefreshToken: true },
});

export const PACKAGING_AED = 15;      // Build-Your-Own gift box & wrapping (mirrors place_order)
export const FREE_DELIVERY_AED = 200;
export const DELIVERY_AED = 15;
export const CUSTOM_MIN = 3, CUSTOM_MAX = 8, ITEM_MAX = 3, BOX_MAX = 10;

const round2 = (n) => Math.round(n * 100) / 100;

let catalogPromise = null;
export function refreshCatalog() { catalogPromise = null; return loadCatalog(); }

/** Loads the public catalogue and derives box prices and availability. */
export function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const [c, p, ci] = await Promise.all([
        sb.from('collections').select('*').eq('is_active', true).order('sort_order').order('id'),
        sb.from('products').select('*').eq('is_archived', false).order('sort_order').order('id'),
        sb.from('collection_items').select('*'),
      ]);
      for (const r of [c, p, ci]) if (r.error) throw r.error;
      const products = new Map(p.data.map((x) => [x.id, { ...x, price_aed: Number(x.price_aed) }]));
      const collections = c.data.map((col) => {
        const items = ci.data
          .filter((r) => r.collection_id === col.id && products.has(r.product_id))
          .map((r) => ({ product: products.get(r.product_id), quantity: r.quantity }));
        const listPrice = round2(items.reduce((s, it) => s + it.product.price_aed * it.quantity, 0));
        const boxPrice = round2(listPrice * (1 - Number(col.discount_pct) / 100));
        const sellable = items.length > 0 && items.every((it) => it.product.is_available);
        const maxQty = sellable ? Math.min(BOX_MAX, ...items.map((it) => Math.floor(it.product.stock / it.quantity))) : 0;
        return { ...col, discount_pct: Number(col.discount_pct), items, listPrice, boxPrice, maxQty };
      });
      return {
        collections,
        bySlug: new Map(collections.map((x) => [x.slug, x])),
        byId: new Map(collections.map((x) => [x.id, x])),
        products,
        productList: [...products.values()],
      };
    })();
    catalogPromise.catch(() => { catalogPromise = null; });
  }
  return catalogPromise;
}

export function inStock(product) { return product.is_available && product.stock > 0; }

/** Client-side price estimate; the database recalculates authoritatively at checkout. */
export function priceLine(line, cat) {
  if (line.type === 'signature') {
    const box = cat.byId.get(line.collection_id);
    if (!box) return { ok: false, unit: 0, total: 0, problem: 'This box is no longer available.' };
    const problem = box.maxQty === 0 ? 'Currently out of stock.'
      : line.quantity > box.maxQty ? `Only ${box.maxQty} available.` : null;
    return { ok: !problem, unit: box.boxPrice, total: round2(box.boxPrice * line.quantity), problem, box };
  }
  let sum = 0, problem = null;
  const items = line.items.map((it) => {
    const p = cat.products.get(it.product_id);
    if (!p || !p.is_available) problem = 'An item in this box is no longer available.';
    else if (p.stock < it.quantity) problem = `Only ${p.stock} × ${p.name} left.`;
    if (p) sum += p.price_aed * it.quantity;
    return { ...it, product: p };
  });
  if (items.length < CUSTOM_MIN) problem = `Add at least ${CUSTOM_MIN} different items.`;
  const unit = round2(sum + PACKAGING_AED);
  return { ok: !problem, unit, total: unit, itemsTotal: round2(sum), problem, items };
}

export function cartTotals(lines, cat) {
  const priced = lines.map((l) => ({ line: l, ...priceLine(l, cat) }));
  const subtotal = round2(priced.reduce((s, x) => s + x.total, 0));
  const delivery = subtotal === 0 || subtotal >= FREE_DELIVERY_AED ? 0 : DELIVERY_AED;
  return { priced, subtotal, delivery, total: round2(subtotal + delivery), ok: priced.every((x) => x.ok) };
}

export async function loadSettings() {
  const { data, error } = await sb.from('site_settings').select('content').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data?.content || {};
}

export async function placeOrder(clientToken, customer, lines) {
  const payload = lines.map((l) => l.type === 'signature'
    ? { type: 'signature', collection_id: l.collection_id, quantity: l.quantity, gift_message: l.gift_message || '' }
    : { type: 'custom', items: l.items.map(({ product_id, quantity }) => ({ product_id, quantity })), gift_message: l.gift_message || '' });
  const { data, error } = await sb.rpc('place_order', { p_client_token: clientToken, p_customer: customer, p_lines: payload });
  if (error) throw new Error(explainError(error.message));
  return data;
}

export async function submitContact(f) {
  const { error } = await sb.rpc('submit_contact', { p_name: f.name, p_email: f.email, p_subject: f.subject, p_message: f.message });
  if (error) throw new Error(explainError(error.message));
}

/** Turns database error codes into messages a customer can act on. */
export function explainError(msg = '') {
  const [code, a, b] = msg.split(':');
  const map = {
    INSUFFICIENT_STOCK: `Sorry — only ${b} × ${a} left in stock. Lower the quantity or swap the item, then try again.`,
    PRODUCT_UNAVAILABLE: `${a || 'An item'} is no longer available. Remove it from your cart and try again.`,
    BOX_UNAVAILABLE: 'One of the boxes in your cart is no longer available. Remove it and try again.',
    CUSTOM_BOX_SIZE: `A Build-Your-Own box needs between ${CUSTOM_MIN} and ${CUSTOM_MAX} different items.`,
    INVALID_QUANTITY: 'One of the quantities in your cart is not valid.',
    INVALID_CART: 'Your cart is empty or not valid. Refresh the page and try again.',
    INVALID_NAME: 'Enter your full name (2–80 characters).',
    INVALID_EMAIL: 'Enter a valid email address, for example name@example.com.',
    INVALID_PHONE: 'Enter a valid phone number, for example +971 50 123 4567.',
    INVALID_ADDRESS: 'Enter a delivery address (at least 5 characters).',
    INVALID_EMIRATE: 'Choose an emirate.',
    INVALID_NOTES: 'Delivery notes must be 500 characters or fewer.',
    INVALID_SUBJECT: 'Enter a subject (2–120 characters).',
    INVALID_MESSAGE: 'Write a message of at least 10 characters.',
    RATE_LIMITED: 'The store is receiving a lot of requests. Wait a few minutes and try again.',
  };
  if (map[code]) return map[code];
  if (/fetch|network/i.test(msg)) return 'Could not reach the store. Check your connection and try again.';
  return 'Something went wrong on our side. Try again in a moment.';
}
