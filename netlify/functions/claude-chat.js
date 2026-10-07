// Short, non-streaming Claude calls (Fuel's meal estimates). Same guard as the coach:
// public site needs a signed-in user with credit left; owner site needs APEX_ACCESS_CODE if set.
const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) });

async function guard(event) {
  const h = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  if (process.env.APEX_PUBLIC === "true") {
    const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_KEY, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const token = (h.authorization || "").replace(/^Bearer\s+/i, "");
    if (!url || !anon || !service) return json(500, { error: "Not configured." });
    if (!token) return json(401, { error: "Sign in to use this.", code: "signin" });
    const who = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
    if (!who.ok) return json(401, { error: "Sign in again to use this.", code: "signin" });
    const user = await who.json();
    const credit = await fetch(`${url}/rest/v1/rpc/use_ai_credit`, {
      method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_user: user.id, p_kind: "food", p_free: +(process.env.APEX_FREE_MESSAGES || 30), p_pro: +(process.env.APEX_PRO_MESSAGES || 400) }),
    });
    if (!credit.ok) return json(503, { error: "Unavailable. Please try again." });
    if ((await credit.json()) !== true) return json(429, { error: "You’ve used this month’s free AI requests.", code: "limit" });
    return null;
  }
  const code = process.env.APEX_ACCESS_CODE;
  if (code && h["x-apex-access"] !== code) return json(401, { error: "Locked on this site.", code: "access" });
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  if (!process.env.ANTHROPIC_API_KEY) return json(500, { error: "Not configured." });
  const denied = await guard(event);
  if (denied) return denied;
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid request" }); }
  const { messages, system } = body;
  if (!Array.isArray(messages) || !messages.length || messages.length > 4 || (system && typeof system !== "string")) return json(400, { error: "Invalid request" });
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.APEX_FOOD_MODEL || "claude-sonnet-4-6", max_tokens: 600, system: (system || "").slice(0, 2000), messages }),
    });
    const data = await response.json();
    return json(response.ok ? 200 : response.status, data);
  } catch (err) {
    return json(500, { error: err.message });
  }
};
