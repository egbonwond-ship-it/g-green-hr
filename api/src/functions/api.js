// Azure Functions (Node v4 programming model) entry point.
// A single catch-all HTTP function serves every /api/* route through the shared router.
const { app } = require('@azure/functions');
const { handle } = require('../lib/router');

app.http('api', {
  route: '{*path}',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  authLevel: 'anonymous',
  handler: async (request) => {
    const url = new URL(request.url);
    let body = {};
    if (!['GET', 'DELETE'].includes(request.method)) {
      try { body = await request.json(); } catch { body = {}; }
    }
    const headers = {};
    request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    const res = await handle({
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      body,
      headers,
    });
    return { status: res.status, jsonBody: res.body, headers: { 'Cache-Control': 'no-store' } };
  },
});
