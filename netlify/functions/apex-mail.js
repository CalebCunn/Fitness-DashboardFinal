// Owner-only email to Apex users, from hello@apexrunning.app via Resend (replies go to the hello@ inbox).
// POST { subject, text, to: [emails], send: true } with the owner key. Without send:true it only reports who would get it.
// It can only email people with an Apex account, never the owner's own, test, review, friends or family accounts,
// and each person gets their own email (no shared BCC). Max 50 a call. Caleb gets a copy of every send.
const { isTest, hasOwnerKey } = require("../lib/owner");
const env = k => process.env[k];
const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) });
const esc = s => String(s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
// Plain paragraphs, with apexrunning.app links made clickable.
const html = text => esc(text).split(/\n{2,}/).map(p => `<p style="margin:0 0 14px;font:15px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#1b1b1b">${p.replace(/\n/g, "<br>").replace(/\b(apexrunning\.app(?:\/[\w\-/]*)?)/g, '<a href="https://$1" style="color:#0F3D2F">$1</a>')}</p>`).join("");

exports.handler = async (event) => {
  const url = env("SUPABASE_URL") || env("REACT_APP_SUPABASE_URL"), service = env("SUPABASE_SERVICE_ROLE_KEY"), resend = env("RESEND_API_KEY");
  if (event.httpMethod !== "POST" || !url || !service || !hasOwnerKey(event)) return json(404, { error: "Not found" });
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const subject = String(body.subject || "").trim().slice(0, 150), text = String(body.text || "").trim().slice(0, 5000);
  const asked = [...new Set((Array.isArray(body.to) ? body.to : []).map(e => String(e).trim().toLowerCase()).filter(Boolean))];
  if (!subject || !text || !asked.length || asked.length > 50) return json(400, { error: "Need subject, text and 1–50 recipients" });

  // Only real Apex accounts can be emailed.
  const accounts = new Set();
  for (let page = 1; page <= 20; page++) {
    const r = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=1000`, { headers: { apikey: service, Authorization: `Bearer ${service}` } });
    const list = r.ok ? (await r.json()).users || [] : [];
    list.forEach(u => u.email && accounts.add(u.email.toLowerCase()));
    if (list.length < 1000) break;
  }
  const ok = asked.filter(e => accounts.has(e) && !isTest(e));
  const refused = asked.filter(e => !ok.includes(e)).map(e => ({ email: e, why: isTest(e) ? "owner, test or personal contact" : "not an Apex account" }));
  if (!body.send) return json(200, { dryRun: true, wouldSend: ok, refused, subject });
  if (!resend) return json(500, { error: "RESEND_API_KEY not set" });

  const from = env("APEX_EMAIL_FROM") || "Caleb at Apex <hello@apexrunning.app>";
  const sent = [], failed = [];
  for (const to of ok) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], reply_to: "hello@apexrunning.app", subject, text, html: html(text) }),
    }).catch(() => null);
    (r && r.ok ? sent : failed).push(to);
  }
  // Caleb always gets a copy of what went out, so he can see it arrived and what it said.
  const copyTo = env("APEX_MAIL_COPY") || "caleb.cunn7@gmail.com";
  const copy = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [copyTo], reply_to: "hello@apexrunning.app", subject: `[Copy sent to ${sent.length}] ${subject}`, text, html: html(text) + `<p style="font:12px Arial;color:#888">Sent to ${sent.length}${failed.length ? `, ${failed.length} failed` : ""}${refused.length ? `, ${refused.length} refused` : ""}.</p>` }),
  }).then(r => r.ok).catch(() => false);
  console.log(`apex-mail "${subject}": sent ${sent.length}, failed ${failed.length}, refused ${refused.length}, copy ${copy ? "ok" : "failed"}`);
  return json(200, { sent, failed, refused, copy });
};
