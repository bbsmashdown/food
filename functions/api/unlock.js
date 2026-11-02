// Checks a passcode (and household name, when logins are on) so the app can tell you right away if it is wrong.
function same(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
export async function onRequestPost({ env, request }) {
  const pass = request.headers.get('x-passcode') || '';
  if (env.HOUSEHOLDS) {
    let raw;
    try { raw = JSON.parse(env.HOUSEHOLDS); } catch (e) { return new Response(null, { status: 500 }); }
    const id = (request.headers.get('x-household') || '').trim().toLowerCase();
    for (const k of Object.keys(raw)) {
      if (k.trim().toLowerCase() === id && pass !== '' && same(pass, raw[k])) return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 401 });
  }
  if (!env.PASSCODE) return new Response(null, { status: 501 });
  return new Response(null, { status: same(pass, env.PASSCODE) ? 204 : 401 });
}
