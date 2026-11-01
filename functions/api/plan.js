// Shared family plan. GET is public. PUT needs the family passcode.
const KEY = 'plan';
const EMPTY = { version: 0, meals: { b: false, l: false, d: true, s: false }, weeks: {} };
const H = { 'content-type': 'application/json', 'cache-control': 'no-store' };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: H });

export async function onRequestGet({ env }) {
  if (!env.FOOD) return json({ error: 'storage not connected' }, 501);
  const doc = await env.FOOD.get(KEY, 'json');
  return json(doc || EMPTY);
}

export async function onRequestPut({ env, request }) {
  if (!env.FOOD) return json({ error: 'storage not connected' }, 501);
  if (!env.PASSCODE || request.headers.get('x-passcode') !== env.PASSCODE) return json({ error: 'wrong passcode' }, 401);
  const text = await request.text();
  if (text.length > 500000) return json({ error: 'too large' }, 413);
  let body;
  try { body = JSON.parse(text); } catch (e) { return json({ error: 'bad json' }, 400); }
  if (!body || typeof body.weeks !== 'object' || typeof body.meals !== 'object') return json({ error: 'bad shape' }, 400);
  const cur = (await env.FOOD.get(KEY, 'json')) || EMPTY;
  if ((body.baseVersion || 0) !== cur.version) return json({ conflict: true, doc: cur }, 409);
  const doc = { version: cur.version + 1, meals: body.meals, weeks: body.weeks, updated: new Date().toISOString() };
  await env.FOOD.put(KEY, JSON.stringify(doc));
  return json(doc);
}
