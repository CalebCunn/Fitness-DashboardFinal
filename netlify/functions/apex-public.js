// Public-site helpers, one function so there's nothing extra to configure:
//   GET              → Strava capacity for the signed-in user: { open, connected, capacity, waitlisted }
//   POST {waitlist}  → put the user on the waitlist (emails the owner once)
//   POST {feedback}  → email feedback from a signed-in user to the owner
// Uses SUPABASE_SERVICE_ROLE_KEY server-side and RESEND_API_KEY for email (both already set).
// Capacity defaults to Strava's 10-athlete starter limit; raise APEX_STRAVA_CAPACITY when Strava approves more.
const env = k => process.env[k];
const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) });
const esc = s => String(s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

async function mail(subject, html, replyTo) {
  if (!env("RESEND_API_KEY")) return false;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("APEX_EMAIL_FROM") || "Apex <hello@apexrunning.app>", to: [env("APEX_OWNER_EMAIL") || "hello@apexrunning.app"], reply_to: replyTo || undefined, subject, html }),
  });
  return r.ok;
}

exports.handler = async (event) => {
  const url = env("SUPABASE_URL") || env("REACT_APP_SUPABASE_URL"), anon = env("SUPABASE_ANON_KEY") || env("REACT_APP_SUPABASE_KEY"), service = env("SUPABASE_SERVICE_ROLE_KEY");
  if (env("APEX_PUBLIC") !== "true" || !url || !anon || !service) return json(404, { error: "Not found" });
  const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Sign in first" });
  const who = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
  if (!who.ok) return json(401, { error: "Sign in again" });
  const user = await who.json();
  const svc = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
  const rows = await fetch(`${url}/rest/v1/apex_data?select=user_id,strava,prefs`, { headers: svc }).then(r => r.ok ? r.json() : []).catch(() => []);
  const mine = rows.find(r => r.user_id === user.id) || {};
  const athletes = new Set(rows.filter(r => r.strava && r.strava.refresh_token).map(r => r.strava.extra || r.user_id));
  const capacity = +(env("APEX_STRAVA_CAPACITY") || 10);
  const connected = athletes.size, hasStrava = !!(mine.strava && mine.strava.refresh_token);
  const waitlisted = !!(mine.prefs && mine.prefs.waitlist);

  if (event.httpMethod === "GET") return json(200, { open: hasStrava || connected < capacity, connected, capacity, waitlisted });

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}

  if (body.waitlist) {
    if (waitlisted) return json(200, { ok: true });
    const prefs = { ...(mine.prefs || {}), waitlist: { at: new Date().toISOString() } };
    await fetch(`${url}/rest/v1/apex_data`, { method: "POST", headers: { ...svc, Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ user_id: user.id, prefs, updated_at: new Date().toISOString() }) });
    const waiting = rows.filter(r => r.prefs && r.prefs.waitlist).length + 1;
    await mail(`Apex waitlist: ${user.email}`, `<p><b>${esc(user.email)}</b> joined the Apex waitlist.</p><p>${waiting} waiting · ${connected} of ${capacity} Strava places used.</p>`, user.email);
    return json(200, { ok: true });
  }

  if (typeof body.feedback === "string" && body.feedback.trim()) {
    const text = body.feedback.trim().slice(0, 3000), page = String(body.page || "").slice(0, 40), device = String(body.device || "").slice(0, 200);
    const ok = await mail(`Apex feedback from ${user.email}`, `<p style="white-space:pre-wrap;font-size:15px">${esc(text)}</p><hr><p style="color:#666;font-size:12px">${esc(user.email)} · page: ${esc(page)} · ${esc(device)}</p>`, user.email);
    return ok ? json(200, { ok: true }) : json(502, { error: "Couldn’t send. Please email hello@apexrunning.app instead." });
  }

  return json(400, { error: "Invalid request" });
};
