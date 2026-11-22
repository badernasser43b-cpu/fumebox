import { submitContact } from '../api.js';
import { renderShell, $ } from '../ui.js';
import { track } from '../analytics.js';

renderShell();

window.addEventListener('settings:ready', (e) => {
  if (e.detail.map_query) $('#map').src = 'https://www.google.com/maps?q=' + encodeURIComponent(e.detail.map_query) + '&output=embed';
});

const form = $('#contactForm');
const rules = {
  name: (v) => v.trim().length >= 2 || 'Enter your name.',
  email: (v) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v.trim()) || 'Enter a valid email, for example name@example.com.',
  subject: (v) => !!v || 'Choose a topic.',
  message: (v) => v.trim().length >= 10 || 'Write at least 10 characters so we can help.',
};
function validate() {
  let ok = true;
  for (const [k, fn] of Object.entries(rules)) {
    const el = form.elements[k], res = fn(el.value);
    el.closest('.field').classList.toggle('invalid', res !== true);
    el.setAttribute('aria-invalid', String(res !== true));
    el.setAttribute('aria-describedby', `c-${k}-err`);
    $(`#c-${k}-err`).textContent = res === true ? '' : res;
    if (res !== true) ok = false;
  }
  return ok;
}
form.elements.message.addEventListener('input', (e) => { $('#c-count').textContent = `${e.target.value.length} / 2000`; });

let sending = false;
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (sending) return;
  const msg = $('#formMsg');
  msg.hidden = true;
  if (!validate()) { form.querySelector('[aria-invalid="true"]')?.focus(); return; }
  if (form.elements.website.value) return;   // honeypot: bots fill hidden fields
  sending = true;
  const btn = $('#sendBtn'); btn.disabled = true; btn.textContent = 'Sending…';
  const f = Object.fromEntries(new FormData(form));
  try {
    await submitContact(f);
    track('contact_submitted');
    form.innerHTML = `<h2>Message sent</h2><p>Thanks, ${f.name.trim().split(' ')[0].replace(/[<>&"]/g, '')}. We'll reply to <strong></strong> within one working day.</p><a class="btn btn-ghost" href="index.html">Back to home</a>`;
    form.querySelector('strong').textContent = f.email.trim();
    form.querySelector('h2').setAttribute('tabindex', '-1');
    form.querySelector('h2').focus();
  } catch (err) {
    msg.hidden = false; msg.className = 'form-error'; msg.textContent = err.message;
    btn.disabled = false; btn.textContent = 'Send message';
  } finally { sending = false; }
});
