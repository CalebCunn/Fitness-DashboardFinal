// APEX · connections that follow the account (public build only).
// Strava and WHOOP refresh tokens are kept in the user's own apex_data row (row-level security:
// only they can read it), so signing in on a new device reconnects everything automatically.
// The owner build keeps tokens on the device only, exactly as before.
import {client} from './apexAuth';

const PUBLIC = process.env.REACT_APP_PUBLIC === 'true';
const LOCAL = {
  strava: { refresh: 'strava_refresh_token', access: 'strava_access_token', expiry: 'strava_token_expiry', extra: 'strava_athlete_id' },
  whoop: { refresh: 'whoop_refresh_token', access: 'whoop_access_token', expiry: 'whoop_token_expiry' },
};
let uid = null;
export const setConnectionsUser = id => { uid = id; };
const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, String(v)); } catch {} };

async function row(kind) {
  const c = await client();
  if (!c || !uid) return null;
  const { data } = await c.from('apex_data').select(kind).eq('user_id', uid).maybeSingle();
  return data?.[kind] || null;
}

// Called whenever this device gets a new refresh token (connect or refresh).
export async function saveConnection(kind) {
  if (!PUBLIC || !uid) return;
  const l = LOCAL[kind], refresh = get(l.refresh);
  if (!refresh) return;
  try {
    const c = await client();
    await c.from('apex_data').upsert({ user_id: uid, [kind]: { refresh_token: refresh, extra: l.extra ? get(l.extra) : null, saved_at: new Date().toISOString() } }, { onConflict: 'user_id' });
  } catch { /* next refresh will try again */ }
}

export async function clearConnection(kind) {
  if (!PUBLIC || !uid) return;
  try { const c = await client(); await c.from('apex_data').update({ [kind]: null }).eq('user_id', uid); } catch {}
}

// On sign-in: put the account's connections on this device if it doesn't have them yet.
export async function restoreConnections() {
  if (!PUBLIC || !uid) return;
  for (const kind of ['strava', 'whoop']) {
    const l = LOCAL[kind];
    if (get(l.refresh)) continue;
    try {
      const saved = await row(kind);
      if (!saved?.refresh_token) continue;
      set(l.refresh, saved.refresh_token);
      set(l.expiry, 0); // forces a fresh access token on first use
      set(l.access, null);
      if (l.extra && saved.extra) set(l.extra, saved.extra);
    } catch {}
  }
}

// If a refresh fails because another device already rotated the token, pick up the newer one.
export async function newerRefreshToken(kind) {
  if (!PUBLIC || !uid) return null;
  try {
    const saved = await row(kind);
    const t = saved?.refresh_token;
    return t && t !== get(LOCAL[kind].refresh) ? t : null;
  } catch { return null; }
}
