// Owner-only numbers for the public site: sign-ups, who's active, connections, coach use and Pro.
// Answers only for the owner's accounts (APEX_ADMIN_EMAILS, comma separated; defaults below), using the
// service key server-side. Everyone else gets a 404, as if it didn't exist.
const { isTest, hasOwnerKey } = require("../lib/owner");
const env = k => process.env[k];
const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) });
const ADMINS = (env("APEX_ADMIN_EMAILS") || "caleb.cunn7@gmail.com,hello@apexrunning.app").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const DAY = 86400000, PRICE = 4.99;

exports.handler = async (event) => {
  const url = env("SUPABASE_URL") || env("REACT_APP_SUPABASE_URL"), anon = env("SUPABASE_ANON_KEY") || env("REACT_APP_SUPABASE_KEY"), service = env("SUPABASE_SERVICE_ROLE_KEY");
  if (env("APEX_PUBLIC") !== "true" || !url || !anon || !service) return json(404, { error: "Not found" });
  // Either the owner signed in, or Claude with the private stats key (APEX_STATS_KEY on Netlify, a copy on Caleb's Mac).
  if (!hasOwnerKey(event)) {
    const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
    const who = token ? await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } }) : null;
    const me = who && who.ok ? await who.json() : null;
    if (!me || !ADMINS.includes(String(me.email || "").toLowerCase())) return json(404, { error: "Not found" });
  }

  const svc = { apikey: service, Authorization: `Bearer ${service}` };
  const get = p => fetch(`${url}${p}`, { headers: svc }).then(r => r.ok ? r.json() : null).catch(() => null);
  // Every account (the admin API pages at up to 1000).
  const users = [];
  for (let page = 1; page <= 20; page++) {
    const d = await get(`/auth/v1/admin/users?page=${page}&per_page=1000`);
    const list = d?.users || [];
    users.push(...list.filter(u => !isTest(u.email)));
    if (list.length < 1000) break;
  }
  // Rows, without the heavy fields. Oura and Google columns only exist on newer databases, so fall back.
  const cols = "user_id,updated_at,strava,whoop,onboarded:prefs->onboarded,runsChosen:prefs->runsChosen,waitlist:prefs->waitlist,runSource:prefs->settings->runSource";
  const data = (await get(`/rest/v1/apex_data?select=${cols},oura,google`)) || (await get(`/rest/v1/apex_data?select=${cols}`)) || [];
  const profiles = (await get(`/rest/v1/apex_profiles?select=*`)) || [];
  const now = new Date(), m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const usage = (await get(`/rest/v1/apex_usage?select=user_id,coach,food&month=eq.${m}`)) || [];

  const byId = (rows) => Object.fromEntries(rows.map(r => [r.user_id, r]));
  const D = byId(data), P = byId(profiles), U = byId(usage);
  const t = v => v ? new Date(v).getTime() : 0;
  const rows = users.map(u => {
    const d = D[u.id] || {}, p = P[u.id] || {}, use = U[u.id] || {};
    const until = t(p.pro_until), pro = p.plan === "pro" && (!until || until > now.getTime());
    const conns = ["strava", "whoop", "oura", "google"].filter(k => d[k] && d[k].refresh_token);
    return {
      email: u.email, joined: u.created_at, seen: new Date(Math.max(t(u.last_sign_in_at), t(d.updated_at), t(u.created_at))).toISOString(),
      onboarded: !!d.onboarded, conns, runSource: d.runSource || null, waitlist: !!d.waitlist,
      plan: pro ? (p.stripe_subscription ? "paid" : "founding") : "free", coach: use.coach || 0, food: use.food || 0,
    };
  });
  const within = (k, days) => rows.filter(r => now.getTime() - t(r[k]) < days * DAY).length;
  const count = f => rows.filter(f).length;
  // Sign-ups per day for the last 30 days, oldest first.
  const daily = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now.getTime() - (29 - i) * DAY), key = d.toISOString().slice(0, 10);
    return { day: key, signups: rows.filter(r => String(r.joined).slice(0, 10) === key).length };
  });
  const paid = count(r => r.plan === "paid");
  return json(200, {
    at: now.toISOString(),
    users: rows.length, signups: { today: within("joined", 1), week: within("joined", 7), month: within("joined", 30) }, daily,
    active: { day: within("seen", 1), week: within("seen", 7), month: within("seen", 30) },
    onboarded: count(r => r.onboarded), connected: count(r => r.conns.length > 0),
    connections: Object.fromEntries(["strava", "whoop", "oura", "google"].map(k => [k, count(r => r.conns.includes(k))])),
    coach: { users: count(r => r.coach > 0), messages: rows.reduce((n, r) => n + r.coach, 0), photos: rows.reduce((n, r) => n + r.food, 0) },
    pro: { paid, founding: count(r => r.plan === "founding"), mrr: Math.round(paid * PRICE * 100) / 100 },
    waitlist: count(r => r.waitlist),
    recent: [...rows].sort((a, b) => t(b.joined) - t(a.joined)).slice(0, 25),
  });
};
