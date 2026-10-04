// Server-side helper for the official COROS MCP.
// Mirrors the flow in COROS's published login helper (coroslab/COROS-MCP):
// discovery -> /connect/register -> /oauth2/authorize (browser) -> /oauth2/token -> /mcp (JSON-RPC).
// Only COROS hosts are allowed so this cannot be used as an open proxy.

const GATEWAY = 'https://mcp.coros.com';
const ALLOWED = new Set(['mcp.coros.com', 'mcpeu.coros.com', 'mcpus.coros.com', 'mcpcn.coros.com']);
const SCOPES = 'openid offline_access mcp.tools';

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
const safe = url => { try { const u = new URL(url); return u.protocol === 'https:' && ALLOWED.has(u.hostname) ? u.origin + u.pathname.replace(/\/$/, '') : null; } catch { return null; } };

async function readJson(res) {
  const raw = await res.text();
  if (!raw) return {};
  if ((res.headers.get('content-type') || '').includes('text/event-stream')) {
    const events = []; let cur = [];
    for (const line of raw.split(/\r?\n/)) {
      if (!line) { if (cur.length) { events.push(cur.join('\n')); cur = []; } continue; }
      if (line.startsWith('data:')) cur.push(line.slice(5).trimStart());
    }
    if (cur.length) events.push(cur.join('\n'));
    return events.length ? JSON.parse(events[events.length - 1]) : {};
  }
  try { return JSON.parse(raw); } catch { return { raw: raw.slice(0, 300) }; }
}

async function discoverIssuer() {
  try {
    const res = await fetch(`${GATEWAY}/.well-known/openid-configuration`, { redirect: 'manual' });
    if (res.ok) { const c = await res.json(); const issuer = safe(c.issuer); if (issuer) return issuer; }
  } catch {}
  return GATEWAY;
}

const tokenResult = p => ({
  access_token: p.access_token, refresh_token: p.refresh_token, token_type: p.token_type || 'Bearer',
  scope: p.scope || SCOPES, expires_at: Date.now() + (Number(p.expires_in) || 3600) * 1000,
});

async function mcp(mcpUrl, accessToken, method, params) {
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' };
  const init = await fetch(mcpUrl, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'APEX', version: '2.0.0' } } }) });
  const initBody = await readJson(init);
  if (init.status === 401) throw Object.assign(new Error('COROS session expired. Please reconnect COROS.'), { status: 401 });
  if (!init.ok || initBody.error) throw new Error('COROS MCP could not be initialised.');
  const session = init.headers.get('mcp-session-id');
  if (session) headers['Mcp-Session-Id'] = session;
  const res = await fetch(mcpUrl, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method, params: params || {} }) });
  const body = await readJson(res);
  if (!res.ok || body.error) throw new Error(body.error?.message || `COROS ${method} failed.`);
  return body.result;
}

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid request' }); }
  try {
    if (b.action === 'register') {
      if (!/^https:\/\/[^/]+\/coros\/callback$/.test(b.redirectUri || '') && !/^http:\/\/localhost(:\d+)?\/coros\/callback$/.test(b.redirectUri || '')) return json(400, { error: 'Invalid redirect address.' });
      const issuer = await discoverIssuer();
      const res = await fetch(`${issuer}/connect/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_name: 'APEX Personal Performance', redirect_uris: [b.redirectUri], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], scope: SCOPES, token_endpoint_auth_method: 'none' }),
      });
      const p = await readJson(res);
      if (![200, 201].includes(res.status) || !p.client_id) return json(502, { error: 'COROS did not accept the app registration.' });
      return json(200, { issuer, mcpUrl: `${issuer}/mcp`, clientId: p.client_id });
    }
    if (b.action === 'token' || b.action === 'refresh') {
      const issuer = safe(b.issuer);
      if (!issuer || !b.clientId) return json(400, { error: 'Invalid COROS session.' });
      const form = b.action === 'token'
        ? { grant_type: 'authorization_code', client_id: b.clientId, code: b.code, redirect_uri: b.redirectUri, code_verifier: b.verifier }
        : { grant_type: 'refresh_token', client_id: b.clientId, refresh_token: b.refreshToken };
      const res = await fetch(`${issuer}/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() });
      const p = await readJson(res);
      if (res.status !== 200 || !p.access_token) return json(res.status === 400 ? 400 : 502, { error: p.error === 'invalid_grant' ? 'invalid_grant: COROS sign-in expired' : 'COROS sign-in could not be completed.' });
      return json(200, tokenResult(p));
    }
    if (b.action === 'list' || b.action === 'call') {
      const mcpUrl = safe(b.mcpUrl);
      if (!mcpUrl || !b.accessToken) return json(400, { error: 'COROS is not connected.' });
      const result = b.action === 'list'
        ? await mcp(mcpUrl, b.accessToken, 'tools/list', {})
        : await mcp(mcpUrl, b.accessToken, 'tools/call', { name: String(b.name || ''), arguments: b.arguments || {} });
      return json(200, b.action === 'list' ? { tools: (result?.tools || []).map(t => ({ name: t.name, description: t.description })) } : { result });
    }
    return json(400, { error: 'Unknown action' });
  } catch (e) {
    return json(e.status === 401 ? 401 : 502, { error: e.message || 'COROS request failed.' });
  }
};
