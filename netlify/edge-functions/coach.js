// APEX coach: streams Claude responses (no serverless timeout) and, when COROS is
// connected, gives Claude the official COROS MCP tools via the MCP connector.
// COROS write tools are disabled unless the user explicitly allows saving for that message.

const ALLOWED = new Set(['mcp.coros.com', 'mcpeu.coros.com', 'mcpus.coros.com', 'mcpcn.coros.com']);
const WRITE_TOOLS = ['createTrainingPlan', 'updateTrainingPlan', 'createSingleWorkout', 'updateWorkoutDetails', 'scheduleWorkout', 'createScheduledWorkout', 'updateScheduledWorkout'];

const err = (status, message) => new Response(JSON.stringify({ error: message }), { status, headers: { 'Content-Type': 'application/json' } });

export default async request => {
  if (request.method !== 'POST') return err(405, 'Method not allowed');
  const key = Netlify.env.get('ANTHROPIC_API_KEY');
  if (!key) return err(500, 'The coach is not configured.');
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
