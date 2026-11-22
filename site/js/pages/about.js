import { renderShell, esc, $ } from '../ui.js';

renderShell();

window.addEventListener('settings:ready', (e) => {
  const team = Array.isArray(e.detail.team) ? e.detail.team : [];
  $('#team').innerHTML = team.map((m) => {
    const initials = String(m.name || '?').replace(/[\[\]]/g, '').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    return `<div class="member"><div class="avatar" aria-hidden="true">${esc(initials)}</div><strong>${esc(m.name)}</strong><span class="muted small">${esc(m.role)}</span></div>`;
  }).join('') || '<p class="muted">Team details will be added soon.</p>';
});
