// Stripe tells us when someone pays or cancels; we switch their Apex plan between free and pro.
// Needs STRIPE_WEBHOOK_SECRET (from the webhook in Stripe) and the Supabase service key.
const crypto = require("crypto");
const env = k => process.env[k];
const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// Stripe signs every webhook: header "t=<time>,v1=<hmac>" over "<time>.<raw body>".
function verified(raw, header, secret) {
  const parts = Object.fromEntries(String(header || "").split(",").map(p => p.split("=")));
  if (!parts.t || !parts.v1 || Math.abs(Date.now() / 1000 - +parts.t) > 600) return false;
  const want = crypto.createHmac("sha256", secret).update(`${parts.t}.${raw}`).digest("hex");
  const sigs = String(header).split(",").filter(p => p.startsWith("v1=")).map(p => p.slice(3));
  return sigs.some(s => s.length === want.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want)));
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  const secret = env("STRIPE_WEBHOOK_SECRET"), url = env("SUPABASE_URL") || env("REACT_APP_SUPABASE_URL"), service = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !url || !service) return json(500, { error: "Payments are not set up" });
  const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : (event.body || "");
  if (!verified(raw, event.headers["stripe-signature"] || event.headers["Stripe-Signature"], secret)) return json(400, { error: "Bad signature" });
  const ev = JSON.parse(raw), o = ev.data && ev.data.object || {};
  const svc = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
  const setPlan = async (filter, fields) => {
    const r = await fetch(`${url}/rest/v1/apex_profiles?${filter}`, { method: "PATCH", headers: { ...svc, Prefer: "return=representation" }, body: JSON.stringify(fields) });
    return r.ok ? r.json() : [];
  };
  const uuid = /^[0-9a-f-]{36}$/i;

  if (ev.type === "checkout.session.completed" && uuid.test(o.client_reference_id || "")) {
    const id = o.client_reference_id;
    await fetch(`${url}/rest/v1/apex_profiles`, { method: "POST", headers: { ...svc, Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ user_id: id }) });
    await setPlan(`user_id=eq.${id}`, { plan: "pro", stripe_customer: o.customer || null, stripe_subscription: o.subscription || null, pro_since: new Date().toISOString() });
  }
  if ((ev.type === "customer.subscription.deleted" || ev.type === "customer.subscription.updated") && o.id) {
    const live = ["active", "trialing", "past_due"].includes(o.status) && ev.type !== "customer.subscription.deleted";
    await setPlan(`stripe_subscription=eq.${encodeURIComponent(o.id)}`, { plan: live ? "pro" : "free" });
  }
  return json(200, { received: true });
};
