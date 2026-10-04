// COROS via the official COROS MCP (https://mcp.coros.com/mcp).
// OAuth 2.0 with PKCE and dynamic client registration, as used by COROS's own login helper.
// Network calls go through /.netlify/functions/coros-mcp so the browser never hits CORS issues.
// Tokens are kept on this device (same single-user pattern as WHOOP).

const FN = '/.netlify/functions/coros-mcp';
const STORE = 'apex_coros';
const PENDING = 'apex_coros_pending';
export const COROS_CALLBACK_PATH = '/coros/callback';
const redirectUri = () => window.location.origin + COROS_CALLBACK_PATH;

const read = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };

async function post(body) {
  const res = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok || data.error) throw new Error(data.error || `COROS request failed (${res.status})`);
  return data;
}

const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomString = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(digest);
}

export const corosSession = () => read(STORE);
export const isCorosConnected = () => !!read(STORE)?.refresh_token;
export const isCorosCallback = () => window.location.pathname === COROS_CALLBACK_PATH;
export function disconnectCoros() { write(STORE, null); write(PENDING, null); }

export async function startCorosConnect() {
  const { issuer, mcpUrl, clientId } = await post({ action: 'register', redirectUri: redirectUri() });
  const verifier = randomString(48), state = randomString(24);
  write(PENDING, { issuer, mcpUrl, clientId, verifier, state, startedAt: Date.now() });
  const q = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: redirectUri(),
    scope: 'openid offline_access mcp.tools', code_challenge: await challengeFor(verifier),
    code_challenge_method: 'S256', resource: mcpUrl, state,
  });
  window.location.assign(`${issuer}/oauth2/authorize?${q}`);
}

export async function finishCorosConnect() {
  const params = new URLSearchParams(window.location.search);
  const pending = read(PENDING);
  if (params.get('error')) throw new Error(params.get('error_description') || 'COROS authorisation was cancelled.');
  if (!pending || !params.get('code')) throw new Error('This COROS sign-in has expired. Please try connecting again.');
  if (params.get('state') !== pending.state) throw new Error('COROS sign-in could not be verified. Please try again.');
  const tokens = await post({ action: 'token', issuer: pending.issuer, clientId: pending.clientId, code: params.get('code'), verifier: pending.verifier, redirectUri: redirectUri() });
  write(STORE, { ...tokens, issuer: pending.issuer, mcpUrl: pending.mcpUrl, clientId: pending.clientId, connectedAt: new Date().toISOString() });
  write(PENDING, null);
  try { await refreshToolCatalog(); } catch {}
  return read(STORE);
}

// Returns a valid access token, refreshing when needed.
export async function corosAccess() {
  const s = read(STORE);
  if (!s?.refresh_token) return null;
  if (s.access_token && s.expires_at && Date.now() < s.expires_at - 90_000) return s;
  try {
    const t = await post({ action: 'refresh', issuer: s.issuer, clientId: s.clientId, refreshToken: s.refresh_token });
    const next = { ...s, ...t, refresh_token: t.refresh_token || s.refresh_token };
    write(STORE, next);
    return next;
  } catch (e) {
    if (/invalid_grant|expired|revoked/i.test(e.message)) disconnectCoros();
    throw e;
  }
}

export async function refreshToolCatalog() {
  const s = await corosAccess();
  if (!s) return [];
  const { tools } = await post({ action: 'list', mcpUrl: s.mcpUrl, accessToken: s.access_token });
  write(STORE, { ...read(STORE), tools: (tools || []).map(t => t.name), toolsAt: Date.now() });
  return tools || [];
}

export async function callCorosTool(name, args = {}) {
  const s = await corosAccess();
  if (!s) throw new Error('COROS is not connected.');
  return post({ action: 'call', mcpUrl: s.mcpUrl, accessToken: s.access_token, name, arguments: args });
}

// What the coach needs to attach COROS tools to a request.
export async function corosForCoach() {
  try {
    const s = await corosAccess();
    if (!s) return null;
    let tools = s.tools;
    if (!tools || !s.toolsAt || Date.now() - s.toolsAt > 6 * 3600_000) tools = (await refreshToolCatalog()).map(t => t.name);
    return { url: s.mcpUrl, token: s.access_token, tools: tools || [] };
  } catch { return null; }
}

export const corosRegion = () => {
  const host = (() => { try { return new URL(read(STORE)?.issuer || '').hostname; } catch { return ''; } })();
  return host.startsWith('mcpeu') ? 'Europe' : host.startsWith('mcpus') ? 'United States' : host.startsWith('mcpcn') ? 'China' : host ? 'Global' : '';
};
