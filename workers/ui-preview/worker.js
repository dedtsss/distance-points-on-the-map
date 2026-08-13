export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'UI preview: API disabled' }), {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
