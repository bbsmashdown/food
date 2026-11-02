// Shared plan storage.
//
// Two modes, chosen by which settings exist in Cloudflare:
//  - HOUSEHOLDS set (JSON like {"smiths":"passcode","jones":"other"}): everyone must sign in
//    with a household name and passcode, and each household has its own separate plan.
//  - HOUSEHOLDS not set: one shared plan. Anyone can view; editing needs the PASSCODE setting.
const EMPTY = { version: 0, meals: { b: false, l: false, d: true, s: false }, weeks: {} };
const H = { 'content-type': 'application/json', 'cache-control': 'no-store' };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: H });

function same(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

// Returns { error } or { key, household, canEdit, canView }.
function who(env, request) {
  let list = null;
  if (env.HOUSEHOLDS) {
    try {
      const raw = JSON.parse(env.HOUSEHOLDS);
      list = {};
      for (const k of Object.keys(raw)) list[k.trim().toLowerCase()] = String(raw[k]);
    } catch (e) { return { error: json({ error: 'The HOUSEHOLDS setting is not valid JSON.' }, 500) }; }
  }
  const pass = request.headers.get('x-passcode') || '';
  if (!list) {
    const ok = !!env.PASSCODE && same(pass, env.PASSCODE);
    return { key: 'plan', household: '', canView: true, canEdit: ok };
  }
  const id = (request.headers.get('x-household') || '').trim().toLowerCase();
  const ok = Object.prototype.hasOwnProperty.call(list, id) && pass !== '' && same(pass, list[id]);
  if (!ok) return { error: json({ login: true, error: 'sign in required' }, 401) };
  return { key: 'plan:' + id, household: id, canView: true, canEdit: true };
}

export async function onRequestGet({ env, request }) {
  if (!env.FOOD) return json({ error: 'storage not connected' }, 501);
  const w = who(env, request);
  if (w.error) return w.error;
  const doc = (await env.FOOD.get(w.key, 'json')) || EMPTY;
  return json(w.household ? Object.assign({}, doc, { household: w.household }) : doc);
}

export async function onRequestPut({ env, request }) {
  if (!env.FOOD) return json({ error: 'storage not connected' }, 501);
  const w = who(env, request);
  if (w.error) return w.error;
  if (!w.canEdit) return json({ error: 'wrong passcode' }, 401);
  const text = await request.text();
  if (text.length > 500000) return json({ error: 'too large' }, 413);
  let body;
  try { body = JSON.parse(text); } catch (e) { return json({ error: 'bad json' }, 400); }
  if (!body || typeof body.weeks !== 'object' || typeof body.meals !== 'object') return json({ error: 'bad shape' }, 400);
  const cur = (await env.FOOD.get(w.key, 'json')) || EMPTY;
  if ((body.baseVersion || 0) !== cur.version) return json({ conflict: true, doc: cur }, 409);
  const prefs = body.prefs && typeof body.prefs === 'object' ? body.prefs : (cur.prefs || null);
  const doc = { version: cur.version + 1, meals: body.meals, weeks: body.weeks, prefs, updated: new Date().toISOString() };
  await env.FOOD.put(w.key, JSON.stringify(doc));
  return json(doc);
}
