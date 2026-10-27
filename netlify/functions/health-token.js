// OAuth token exchange for the extra sleep and recovery sources (Oura, Google Health).
// The client secrets stay here on the server; the browser only ever sends a code or a refresh token.
const PROVIDERS = {
  oura: { url: "https://api.ouraring.com/oauth/token", id: "OURA_CLIENT_ID", secret: "OURA_CLIENT_SECRET" },
  google: { url: "https://oauth2.googleapis.com/token", id: "GOOGLE_HEALTH_CLIENT_ID", secret: "GOOGLE_HEALTH_CLIENT_SECRET" },
};
const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid request" }); }
  const p = PROVIDERS[body.provider];
  if (!p) return json(400, { error: "Unknown provider" });
  const clientId = process.env[p.id] || process.env["REACT_APP_" + p.id], clientSecret = process.env[p.secret];
  if (!clientId || !clientSecret) return json(500, { error: "This connection is not set up yet." });
  const allowed = ["grant_type", "code", "refresh_token", "redirect_uri"];
  const extra = Object.fromEntries(Object.entries(body).filter(([k, v]) => allowed.includes(k) && typeof v === "string"));
  if (!["authorization_code", "refresh_token"].includes(extra.grant_type)) return json(400, { error: "Invalid grant" });
  const res = await fetch(p.url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...extra, client_id: clientId, client_secret: clientSecret }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  return json(res.status, data);
};
