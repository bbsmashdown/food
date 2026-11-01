// Checks the family passcode so the app can tell you right away if it is wrong.
export async function onRequestPost({ env, request }) {
  if (!env.PASSCODE) return new Response(null, { status: 501 });
  return new Response(null, { status: request.headers.get('x-passcode') === env.PASSCODE ? 204 : 401 });
}
