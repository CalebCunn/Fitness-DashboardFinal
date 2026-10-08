// APEX coach: streams Claude responses (no serverless timeout) and, when COROS is
// connected, gives Claude the official COROS MCP tools via the MCP connector.
// COROS write tools are disabled unless the user explicitly allows saving for that message.

const ALLOWED = new Set(['mcp.coros.com', 'mcpeu.coros.com', 'mcpus.coros.com', 'mcpcn.coros.com']);
const WRITE_TOOLS = ['createTrainingPlan', 'updateTrainingPlan', 'createSingleWorkout', 'updateWorkoutDetails', 'scheduleWorkout', 'createScheduledWorkout', 'updateScheduledWorkout'];

const err = (status, message, code) => new Response(JSON.stringify({ error: message, code }), { status, headers: { 'Content-Type': 'application/json' } });
const env = k => Netlify.env.get(k);

// Who may use the coach. Public site (APEX_PUBLIC=true): a signed-in Supabase user with credit left.
// Owner site: if APEX_ACCESS_CODE is set, requests must carry it in x-apex-access.
async function guard(request, kind) {
  if (env('APEX_PUBLIC') === 'true') {
    const url = env('SUPABASE_URL') || env('REACT_APP_SUPABASE_URL'), anon = env('SUPABASE_ANON_KEY') || env('REACT_APP_SUPABASE_KEY'), service = env('SUPABASE_SERVICE_ROLE_KEY');
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const missing = [!url && 'SUPABASE_URL', !anon && 'SUPABASE_ANON_KEY', !service && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean);
    if (missing.length) return err(500, `The coach is not configured (missing ${missing.join(', ')}).`);
    if (!token) return err(401, 'Sign in to use the coach.', 'signin');
    const who = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
    if (!who.ok) return err(401, 'Sign in again to use the coach.', 'signin');
    const user = await who.json();
    const credit = await fetch(`${url}/rest/v1/rpc/use_ai_credit`, {
      method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_user: user.id, p_kind: kind, p_free: +(env('APEX_FREE_MESSAGES') || 30), p_pro: +(env('APEX_PRO_MESSAGES') || 400) }),
    });
    if (!credit.ok) return err(503, 'The coach is unavailable. Please try again.');
    if ((await credit.json()) !== true) return err(429, 'You’ve used this month’s free coach messages.', 'limit');
    return null;
  }
  const code = env('APEX_ACCESS_CODE');
  if (code && request.headers.get('x-apex-access') !== code) return err(401, 'The coach is locked on this site.', 'access');
  return null;
}

export default async request => {
  if (request.method !== 'POST') return err(405, 'Method not allowed');
  const key = Netlify.env.get('ANTHROPIC_API_KEY');
  if (!key) return err(500, 'The coach is not configured (missing ANTHROPIC_API_KEY).');
  const denied = await guard(request, 'coach');
  if (denied) return denied;
  let body;
  try { body = await request.json(); } catch { return err(400, 'Invalid request'); }
  const { system, messages, coros, allowCorosWrites } = body || {};
  if (typeof system !== 'string' || !Array.isArray(messages) || !messages.length) return err(400, 'Invalid request');

  const payload = {
    model: Netlify.env.get('APEX_COACH_MODEL') || 'claude-sonnet-5-5',
    max_tokens: 4096,
    stream: true,
    system,
    messages: messages.slice(-24),
  };
  const headers = { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' };

  let corosUrl = null;
  try { const u = new URL(coros?.url || ''); if (u.protocol === 'https:' && ALLOWED.has(u.hostname)) corosUrl = u.href; } catch {}
  if (corosUrl && typeof coros?.token === 'string' && coros.token) {
    const existing = new Set(Array.isArray(coros.tools) ? coros.tools : []);
    const toolset = { type: 'mcp_toolset', mcp_server_name: 'coros' };
    if (!allowCorosWrites) {
      const off = WRITE_TOOLS.filter(t => existing.has(t));
      if (off.length) toolset.configs = Object.fromEntries(off.map(t => [t, { enabled: false }]));
    }
    payload.mcp_servers = [{ type: 'url', url: corosUrl, name: 'coros', authorization_token: coros.token }];
    payload.tools = [toolset];
    headers['anthropic-beta'] = 'mcp-client-2025-11-20';
  }

  const upstream = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(payload) });
  if (!upstream.ok) {
    let detail = '';
    try { const j = await upstream.json(); detail = j?.error?.message || ''; } catch {}
    return err(upstream.status, detail ? `Coach unavailable: ${detail}` : 'The coach is unavailable. Please try again.');
  }
  return new Response(upstream.body, { status: 200, headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' } });
};

export const config = { path: '/api/coach' };
