// LOCAL TEST HARNESS ONLY — never deployed.
// Serves ./site over HTTPS and emulates the subset of the Supabase HTTP API the
// site uses (PostgREST /rest/v1, GoTrue /auth/v1, Storage /storage/v1).
// Every database call runs inside a transaction as the real Postgres role from
// the JWT (anon / authenticated) with request.jwt.claims set, exactly like
// PostgREST, so Row Level Security and grants are genuinely exercised.
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import jwt from 'jsonwebtoken';

const ROOT = path.resolve('site');
const PORT = Number(process.env.PORT || 8443);
const ORIGIN = `https://localhost:${PORT}`;
const SECRET = 'local-test-secret-not-used-anywhere-else-0123456789';
const ANON_KEY = jwt.sign({ role: 'anon', iss: 'local' }, SECRET);
const UPLOADS = '/tmp/mb-uploads';
fs.mkdirSync(UPLOADS, { recursive: true });

const USERS = {
  'admin@moodbox.test': { id: '11111111-1111-1111-1111-111111111111', password: 'Admin-Test-Pass-1' },
  'staff@moodbox.test': { id: '22222222-2222-2222-2222-222222222222', password: 'Staff-Test-Pass-1' }, // signed-in but NOT admin
};
const pool = new pg.Pool({ host: '/tmp/pg', port: 5433, user: 'postgres', database: 'cc', max: 10 });
pool.on('error', (e) => console.error('pg pool:', e.message));
const IDENT = /^[a-z_][a-z0-9_]*$/;
const TABLES = new Set(['collections', 'products', 'collection_items', 'orders', 'order_lines', 'order_line_items', 'contact_messages', 'analytics_events', 'site_settings', 'admins']);
const EMBEDS = { orders: { order_lines: 'order_id' }, order_lines: { order_line_items: 'order_line_id' } };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json' };

function claimsFrom(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : req.headers.apikey;
  try { return jwt.verify(token, SECRET); } catch { return null; }
}
async function asRole(claims, fn) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${claims.role === 'authenticated' ? 'authenticated' : 'anon'}`);
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) { await c.query('rollback').catch(() => {}); throw e; }
  finally { c.release(); }
}
function pgError(res, e) {
  const status = e.code === '42501' ? 403 : e.code === 'P0001' ? 400 : e.code === '23505' ? 409 : e.code?.startsWith('23') ? 400 : 400;
  send(res, status, { code: e.code, message: e.message, details: e.detail || null, hint: e.hint || null });
}
function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...headers });
  res.end(body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body));
}
const readBody = (req) => new Promise((ok) => { const ch = []; req.on('data', (d) => ch.push(d)); req.on('end', () => ok(Buffer.concat(ch))); });

// --- PostgREST select parser: "*, order_lines(*, order_line_items(*))" ---
function parseSelect(s) {
  const out = { cols: [], embeds: [] }; let depth = 0, cur = '';
  const parts = [];
  for (const ch of s) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch; }
  if (cur.trim()) parts.push(cur.trim());
  for (const p of parts) {
    const m = p.match(/^([a-z_]+)\((.*)\)$/s);
    if (m) out.embeds.push({ name: m[1], sel: parseSelect(m[2]) });
    else if (p === '*' || IDENT.test(p)) out.cols.push(p); else throw new Error('bad select ' + p);
  }
  return out;
}
function selectSql(table, alias, sel, depth = 0) {
  const cols = sel.cols.map((c) => (c === '*' ? `${alias}.*` : `${alias}.${c}`));
  for (const e of sel.embeds) {
    const fk = EMBEDS[table]?.[e.name]; if (!fk) throw new Error('unknown embed ' + e.name);
    const a = `e${depth}`;
    cols.push(`(select coalesce(json_agg(x${depth}), '[]'::json) from (${selectSql(e.name, a, e.sel, depth + 1)} where ${a}.${fk} = ${alias}.id) x${depth}) as ${e.name}`);
  }
  return `select ${cols.join(', ')} from public.${table} ${alias}`;
}
function whereSql(params, vals) {
  const conds = [];
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'columns'].includes(k)) continue;
    if (!IDENT.test(k)) throw new Error('bad column');
    const m = v.match(/^(eq|neq|gt|gte|lt|lte|is)\.(.*)$/s); if (!m) throw new Error('bad filter ' + v);
    if (m[1] === 'is') { conds.push(`t.${k} is ${m[2] === 'null' ? 'null' : m[2] === 'true' ? 'true' : 'false'}`); continue; }
    vals.push(m[2]);
    conds.push(`t.${k} ${{ eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[m[1]]} $${vals.length}`);
  }
  return conds.length ? ' where ' + conds.join(' and ') : '';
}
function orderSql(o) {
  if (!o) return '';
  return ' order by ' + o.split(',').map((p) => { const [c, dir = 'asc', nulls] = p.split('.'); if (!IDENT.test(c)) throw new Error('bad order'); return `t.${c} ${dir === 'desc' ? 'desc' : 'asc'}${nulls === 'nullslast' ? ' nulls last' : nulls === 'nullsfirst' ? ' nulls first' : ''}`; }).join(', ');
}

async function rest(req, res, url) {
  const claims = claimsFrom(req);
  if (!claims) return send(res, 401, { message: 'Invalid JWT' });
  const parts = url.pathname.replace('/rest/v1/', '').split('/');
  try {
    if (parts[0] === 'rpc') {
      const fn = parts[1]; if (!IDENT.test(fn)) throw new Error('bad fn');
      const args = JSON.parse((await readBody(req)).toString() || '{}');
      const keys = Object.keys(args).filter((k) => IDENT.test(k));
      const vals = keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]));
      const r = await asRole(claims, (c) => c.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as v`, vals));
      const v = r.rows[0].v;
      return v === '' ? send(res, 204) : send(res, 200, JSON.stringify(v));
    }
    const table = parts[0]; if (!TABLES.has(table)) return send(res, 404, { message: 'relation not found' });
    const params = [...url.searchParams.entries()];
    const vals = [];
    const prefer = req.headers.prefer || '';
    const single = (req.headers.accept || '').includes('vnd.pgrst.object');
    const finish = (rows) => {
      if (single) { if (rows.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }); return send(res, 200, rows[0]); }
      return send(res, prefer.includes('return=minimal') ? 201 : 200, rows);
    };
    if (req.method === 'GET' || req.method === 'HEAD') {
      const where = whereSql(params, vals);
      if (req.method === 'HEAD' || prefer.includes('count=exact')) {
        const r = await asRole(claims, (c) => c.query(`select count(*)::int n from public.${table} t${where}`, vals));
        if (req.method === 'HEAD') return send(res, 200, undefined, { 'content-range': `*/${r.rows[0].n}` });
      }
      const sel = parseSelect(url.searchParams.get('select') || '*');
      const lim = url.searchParams.get('limit');
      const sql = `select coalesce(json_agg(r), '[]'::json) as v from (${selectSql(table, 't', sel)}${where}${orderSql(url.searchParams.get('order'))}${lim ? ' limit ' + Number(lim) : ''}) r`;
      const r = await asRole(claims, (c) => c.query(sql, vals));
      return finish(r.rows[0].v);
    }
    if (req.method === 'POST') {
      let body = JSON.parse((await readBody(req)).toString()); if (!Array.isArray(body)) body = [body];
      const rows = await asRole(claims, async (c) => {
        const out = [];
        for (const row of body) {
          const ks = Object.keys(row).filter((k) => IDENT.test(k));
          const r = await c.query(`insert into public.${table} (${ks.join(',')}) values (${ks.map((_, i) => '$' + (i + 1)).join(',')}) returning *`, ks.map((k) => (row[k] !== null && typeof row[k] === 'object' ? JSON.stringify(row[k]) : row[k])));
          out.push(...r.rows);
        }
        return out;
      });
      return send(res, 201, rows);
    }
    if (req.method === 'PATCH') {
      const row = JSON.parse((await readBody(req)).toString());
      const ks = Object.keys(row).filter((k) => IDENT.test(k));
      ks.forEach((k) => vals.push(row[k] !== null && typeof row[k] === 'object' ? JSON.stringify(row[k]) : row[k]));
      const set = ks.map((k, i) => `${k} = $${i + 1}`).join(', ');
      const where = whereSql(params, vals);
      const r = await asRole(claims, (c) => c.query(`update public.${table} t set ${set}${where} returning t.*`, vals));
      return send(res, 200, r.rows);
    }
    if (req.method === 'DELETE') {
      const where = whereSql(params, vals);
      const r = await asRole(claims, (c) => c.query(`delete from public.${table} t${where} returning t.*`, vals));
      return send(res, 200, r.rows);
    }
    send(res, 405, { message: 'method not allowed' });
  } catch (e) { pgError(res, e); }
}

function session(email) {
  const u = USERS[email];
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: u.id, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-11-01T00:00:00Z' };
  return { access_token: jwt.sign({ sub: u.id, role: 'authenticated', email, aud: 'authenticated', exp }, SECRET), token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: Buffer.from(email).toString('base64url'), user };
}
async function auth(req, res, url) {
  const route = url.pathname.replace('/auth/v1/', '');
  if (route === 'token') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    if (url.searchParams.get('grant_type') === 'password') {
      const u = USERS[body.email];
      if (!u || u.password !== body.password) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' });
      return send(res, 200, session(body.email));
    }
    if (url.searchParams.get('grant_type') === 'refresh_token') {
      const email = Buffer.from(body.refresh_token || '', 'base64url').toString();
      return USERS[email] ? send(res, 200, session(email)) : send(res, 400, { error: 'invalid_grant' });
    }
  }
  if (route === 'user') { const c = claimsFrom(req); return c?.email ? send(res, 200, session(c.email).user) : send(res, 401, { message: 'invalid token' }); }
  if (route === 'logout') return send(res, 204);
  if (route === 'signup') return send(res, 422, { msg: 'Signups not allowed for this instance' });
  send(res, 404, { message: 'not found' });
}
async function storage(req, res, url) {
  const pub = url.pathname.match(/^\/storage\/v1\/object\/public\/product-images\/([a-z0-9/_.-]+)$/i);
  if (pub && req.method === 'GET') {
    const f = path.join(UPLOADS, pub[1]); if (!f.startsWith(UPLOADS) || !fs.existsSync(f)) return send(res, 404, { message: 'not found' });
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(res);
  }
  const up = url.pathname.match(/^\/storage\/v1\/object\/product-images\/([a-z0-9/_.-]+)$/i);
  if (up && req.method === 'POST') {
    const claims = claimsFrom(req);
    if (!claims || claims.role !== 'authenticated') return send(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
    const ok = await asRole(claims, (c) => c.query('select public.is_admin() v')).then((r) => r.rows[0].v);
    if (!ok) return send(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
    let type = req.headers['content-type'] || '';
    let buf = await readBody(req);
    const bm = type.match(/^multipart\/form-data;\s*boundary=(.+)$/);
    if (bm) {   // supabase-js sends File objects as multipart with the file in the "" field
      const boundary = Buffer.from('--' + bm[1]);
      let start = buf.indexOf(boundary);
      let file = null;
      while (start !== -1) {
        const next = buf.indexOf(boundary, start + boundary.length);
        if (next === -1) break;
        const part = buf.subarray(start + boundary.length + 2, next - 2);
        const sep = part.indexOf('\r\n\r\n');
        const head = part.subarray(0, sep).toString();
        if (/filename=|name=""/.test(head)) { file = { type: (head.match(/Content-Type:\s*(\S+)/i) || [])[1] || '', body: part.subarray(sep + 4) }; }
        start = next;
      }
      if (!file) return send(res, 400, { message: 'no file' });
      type = file.type; buf = file.body;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].some((t) => type.startsWith(t))) return send(res, 415, { message: 'mime type not supported' });
    if (buf.length > 2097152) return send(res, 413, { message: 'payload too large' });
    const f = path.join(UPLOADS, up[1]); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf);
    return send(res, 200, { Key: 'product-images/' + up[1], Id: crypto.randomUUID() });
  }
  send(res, 404, { message: 'not found' });
}

const server = https.createServer({ key: fs.readFileSync('/tmp/mb-key.pem'), cert: fs.readFileSync('/tmp/mb-cert.pem') }, async (req, res) => {
  const url = new URL(req.url, ORIGIN);
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }); return res.end(); }
  if (url.pathname.startsWith('/rest/v1/')) return rest(req, res, url);
  if (url.pathname.startsWith('/auth/v1/')) return auth(req, res, url);
  if (url.pathname.startsWith('/storage/v1/')) return storage(req, res, url);
  if (url.pathname === '/js/config.js') {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    return res.end(`export const CONFIG = { SUPABASE_URL: '${ORIGIN}', SUPABASE_ANON_KEY: '${ANON_KEY}' };`);
  }
  let p = decodeURIComponent(url.pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('<h1>404</h1>'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
server.listen(PORT, () => console.log('dev server on ' + ORIGIN));
