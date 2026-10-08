// Strava OAuth on the server, so the client secret never ships in the website bundle.
// POST { code } to connect, or { refresh_token } to refresh.
// Reads STRAVA_CLIENT_SECRET (falls back to the old REACT_APP_ name so existing sites keep working).
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  const id = process.env.STRAVA_CLIENT_ID || process.env.REACT_APP_STRAVA_CLIENT_ID;
  const secret = process.env.STRAVA_CLIENT_SECRET || process.env.REACT_APP_STRAVA_CLIENT_SECRET;
  if (!id || !secret) return json(500, { error: "Strava is not configured." });
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid request" }); }
  // Revoke Apex's access for this athlete (account deletion).
  if (typeof body.deauthorize === "string" && body.deauthorize) {
    const r = await fetch("https://www.strava.com/oauth/deauthorize", { method: "POST", headers: { Authorization: `Bearer ${body.deauthorize}` } });
    return json(r.ok ? 200 : r.status, { ok: r.ok });
  }
  const grant = typeof body.code === "string" && body.code
    ? { grant_type: "authorization_code", code: body.code }
    : typeof body.refresh_token === "string" && body.refresh_token
      ? { grant_type: "refresh_token", refresh_token: body.refresh_token }
      : null;
  if (!grant) return json(400, { error: "Missing code or refresh_token" });
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: id, client_secret: secret, ...grant }),
  });
  const data = await res.json().catch(() => ({}));
  return json(res.status, data);
};

const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) });
