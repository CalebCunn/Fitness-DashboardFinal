// APEX · accounts (public build only). Email sign-in with a 6-digit code or a magic link,
// via Supabase Auth. The client loads lazily, so the owner build never ships it.
const PUBLIC = process.env.REACT_APP_PUBLIC === 'true';
let clientP = null;

export function client() {
  if (!PUBLIC) return null;
  if (!clientP) clientP = import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'apex-auth' },
    }));
  return clientP;
}

export async function session() {
  const c = await client();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session || null;
}

export async function onAuth(cb) {
  const c = await client();
  if (!c) return () => {};
  const { data } = c.auth.onAuthStateChange((_e, s) => cb(s || null));
  return () => data.subscription.unsubscribe();
}

export async function sendCode(email) {
  const c = await client();
  const { error } = await c.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: window.location.origin } });
  if (error) throw new Error(error.message);
}

export async function verifyCode(email, token) {
  const c = await client();
  const { data, error } = await c.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw new Error(error.message.includes('expired') ? 'That code has expired. Send a new one.' : 'That code didn’t work. Check it and try again.');
  return data.session;
}

// Everything this device knows about the user goes when they sign out.
const DEVICE_KEYS = ['strava_access_token', 'strava_refresh_token', 'strava_token_expiry', 'strava_athlete_id', 'apex-activities-v1',
  'whoop_access_token', 'whoop_refresh_token', 'whoop_token_expiry', 'whoop_pending', 'whoop_state', 'apex-anthropic-key', 'apex-coach-draft'];
export async function signOut() {
  const c = await client();
  if (c) await c.auth.signOut();
  try {
    DEVICE_KEYS.forEach(k => localStorage.removeItem(k));
    Object.keys(localStorage).filter(k => k.startsWith('apex-v3:') || k.startsWith('coros')).forEach(k => localStorage.removeItem(k));
  } catch {}
  window.location.replace('/');
}

// Deletes the account and all saved data (server checks the session before deleting).
export async function deleteAccount() {
  try { const { deauthorizeStrava } = await import('./strava'); await deauthorizeStrava(); } catch {}
  const s = await session();
  const res = await fetch('/.netlify/functions/delete-account', { method: 'POST', headers: { Authorization: `Bearer ${s?.access_token || ''}` } });
  if (!res.ok) throw new Error('Your account could not be deleted. Please try again or email us.');
  await signOut();
}

// Asks the server to send the one-time welcome email (it checks the session and only sends once).
export async function sendWelcome(name) {
  try { const s = await session(); if (s) await fetch('/.netlify/functions/welcome-email', { method: 'POST', headers: { Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }); } catch {}
}

// Email, plan and this month's AI use, for the Account screen (reads only the user's own rows).
export async function accountSummary() {
  const c = await client();
  if (!c) return null;
  const { data: { user } } = await c.auth.getUser();
  if (!user) return null;
  const month = new Date(); month.setDate(1);
  const m = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-01`;
  const [{ data: prof }, { data: use }] = await Promise.all([
    c.from('apex_profiles').select('plan').eq('user_id', user.id).maybeSingle(),
    c.from('apex_usage').select('coach,food').eq('user_id', user.id).eq('month', m).maybeSingle(),
  ]);
  return { email: user.email, plan: prof?.plan || 'free', used: (use?.coach || 0) + (use?.food || 0) };
}
