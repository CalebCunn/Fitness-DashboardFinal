// Sends the one-time welcome email after first-run setup (public site only).
// Checks the user's session, sends once (apex_profiles.welcomed_at), via Resend's API.
// Needs RESEND_API_KEY; without it this quietly does nothing.
const page = (name) => `<!doctype html><html><body style="margin:0;background:#F3EDE2;font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;color:#0F3D2F">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3EDE2"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0F3D2F;border-radius:14px;overflow:hidden">
<tr><td style="padding:36px 36px 8px;color:#F3EDE2;font:italic 400 44px/1 Georgia,'Times New Roman',serif">Apex</td></tr>
<tr><td style="padding:18px 36px 0;color:#F3EDE2;font:800 30px/1.15 -apple-system,'Helvetica Neue',Arial,sans-serif;letter-spacing:-.5px">Welcome${name ? `, ${name}` : ''}.<br><span style="color:#FFC94A;font:italic 400 30px/1.15 Georgia,serif">Read the morning.</span></td></tr>
<tr><td style="padding:18px 36px 0;color:#D9DED6;font:400 16px/1.55 -apple-system,'Helvetica Neue',Arial,sans-serif">Every morning Apex reads your sleep, your plan and how your legs feel, and makes the call: run it, shorten it, or rest.</td></tr>
<tr><td style="padding:18px 36px 0;color:#D9DED6;font:400 16px/1.55 -apple-system,'Helvetica Neue',Arial,sans-serif">
<b style="color:#F3EDE2">Three things to try this week</b><br>
1. Check in tomorrow morning and see Today’s call.<br>
2. Ask the coach to build your next week around your race.<br>
3. Open any run and race your ghost.</td></tr>
<tr><td style="padding:26px 36px 36px"><a href="https://apexrunning.app" style="display:inline-block;background:#FFC94A;color:#0F3D2F;font:700 16px -apple-system,'Helvetica Neue',Arial,sans-serif;text-decoration:none;padding:15px 28px;border-radius:30px">Open Apex</a></td></tr>
</table>
<p style="font:400 12px/1.5 -apple-system,Arial,sans-serif;color:#4B675C;margin:18px 0 0">Apex gives training guidance, not medical advice.<br>Questions? Just reply to this email.</p>
</td></tr></table></body></html>`;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY, resend = process.env.RESEND_API_KEY;
  if (process.env.APEX_PUBLIC !== "true" || !url || !anon || !service || !resend) return { statusCode: 200, body: "skipped" };
  const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  const who = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
  if (!who.ok) return { statusCode: 401, body: "Sign in first" };
  const user = await who.json();
  const svc = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
  // Claim the welcome atomically: only the first call flips welcomed_at from null.
  await fetch(`${url}/rest/v1/apex_profiles`, { method: "POST", headers: { ...svc, Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ user_id: user.id }) });
  const claim = await fetch(`${url}/rest/v1/apex_profiles?user_id=eq.${user.id}&welcomed_at=is.null`, { method: "PATCH", headers: { ...svc, Prefer: "return=representation" }, body: JSON.stringify({ welcomed_at: new Date().toISOString() }) });
  const rows = claim.ok ? await claim.json() : [];
  if (!rows.length) return { statusCode: 200, body: "already sent" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const name = String(body.name || "").slice(0, 40).replace(/[<>&"]/g, "");
  const from = process.env.APEX_EMAIL_FROM || "Apex <hello@apexrunning.app>";
  const sent = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [user.email], subject: name ? `Welcome to Apex, ${name}` : "Welcome to Apex", html: page(name) }),
  });
  return { statusCode: sent.ok ? 200 : 502, body: sent.ok ? "sent" : "send failed" };
};
