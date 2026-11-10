// Shared by the owner-only functions (apex-stats, apex-mail).
const crypto = require("crypto");

// The owner's own and test accounts don't count (APEX_STATS_EXCLUDE adds more; "+review" catches App Store review logins).
// Kept as short SHA-256 fingerprints, not addresses, because this repo is public. Includes friends and family.
const EXCLUDE = new Set(["4c12cdbcc55de796","0247d859833189a5","7953a0f90a284180","070e6ec137a9a8c9","2ddd56923cfe33ba","cbc2ff4c41ae2d77", ...(process.env.APEX_STATS_EXCLUDE || "").split(",").map(s => s.trim()).filter(Boolean)]);
const fingerprint = e => crypto.createHash("sha256").update(String(e || "").trim().toLowerCase()).digest("hex").slice(0, 16);
const isTest = e => EXCLUDE.has(fingerprint(e)) || String(e || "").toLowerCase().includes("+review@");

// Claude's private key: APEX_STATS_KEY on Netlify, a copy in ~/.config/apex/stats-key on Caleb's Mac.
// Trimmed: a key pasted into Netlify often brings a line break with it.
function hasOwnerKey(event) {
  const key = String(event.headers["x-apex-stats-key"] || "").trim(), secret = String(process.env.APEX_STATS_KEY || "").trim();
  const ok = secret.length >= 32 && key.length === secret.length && crypto.timingSafeEqual(Buffer.from(key), Buffer.from(secret));
  if (key && !ok) console.log(`owner key refused: sent ${key.length} chars, Netlify has ${secret.length}`);
  return ok;
}

module.exports = { isTest, fingerprint, hasOwnerKey };
