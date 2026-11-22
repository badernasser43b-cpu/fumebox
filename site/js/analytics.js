// First-party, privacy-light analytics for the Stage 3 weekly reports.
// Stores: event type, page name, item/box id, a random per-tab session id,
// device class (mobile/tablet/desktop) and the referring website's domain.
// Does NOT store: IP address, cookies, user agent, names or contact details.
import { sb, isConfigured } from './api.js';

const SESSION_KEY = 'moodbox-session';
const OPT_OUT_KEY = 'moodbox-no-track';   // set from the admin dashboard to exclude team testing

function sessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(SESSION_KEY, id); }
    return id;
  } catch { return null; }
}
const device = () => (innerWidth < 640 ? 'mobile' : innerWidth < 1024 ? 'tablet' : 'desktop');
function referrerDomain() {
  try {
    if (!document.referrer) return null;
    const host = new URL(document.referrer).hostname;
    return host === location.hostname ? null : host.replace(/^www\./, '');
  } catch { return null; }
}
export function trackingDisabled() {
  try { return localStorage.getItem(OPT_OUT_KEY) === '1'; } catch { return false; }
}
export function setTrackingDisabled(off) {
  try { off ? localStorage.setItem(OPT_OUT_KEY, '1') : localStorage.removeItem(OPT_OUT_KEY); } catch {}
}

export function track(type, { productId = null, collectionId = null, detail = null } = {}) {
  if (!isConfigured || trackingDisabled() || navigator.webdriver && !window.__MB_TEST_TRACK) return;
  const sid = sessionId();
  if (!sid) return;
  sb.rpc('track_event', {
    p_event_type: type,
    p_page: document.body.dataset.page || 'unknown',
    p_session_id: sid,
    p_device: device(),
    p_product_id: productId,
    p_collection_id: collectionId,
    p_referrer: type === 'page_view' ? referrerDomain() : null,
    p_detail: detail ? String(detail).slice(0, 80) : null,
  }).then(() => {}, () => {});
}
