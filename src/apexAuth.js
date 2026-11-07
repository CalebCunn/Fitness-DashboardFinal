// APEX · accounts (public build only). Email + password, Google, or an emailed code,
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
  const { data } = c.auth.onAuthStateChange((e, s) => cb(s || null, e));
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

// ── Passwords ──
const friendly = m => /invalid login/i.test(m) ? 'Wrong email or password.'
  : /not confirmed/i.test(m) ? 'Confirm your email first: enter the code we sent you.'
  : /at least|short|weak/i.test(m) ? 'Use at least 8 characters.'
  : /rate|too many/i.test(m) ? 'Too many attempts. Wait a minute and try again.'
  : /expired/i.test(m) ? 'That code has expired. Send a new one.'
  : /invalid|token/i.test(m) ? 'That code didn’t work. Check it and try again.' : m;

// Returns 'signed-in' when no email confirmation is needed, otherwise 'confirm' (a code is on its way).
export async function signUpPassword(email, password) {
  const c = await client();
  const { data, error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
  if (error) throw new Error(friendly(error.message));
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error('There’s already an account with this email. Sign in, or reset your password.');
  return data.session ? 'signed-in' : 'confirm';
}
export async function signInPassword(email, password) {
  const c = await client();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) { const e = new Error(friendly(error.message)); e.unconfirmed = /not confirmed/i.test(error.message); throw e; }
}
export async function verifySignup(email, token) {
  const c = await client();
  const { error } = await c.auth.verifyOtp({ email, token, type: 'signup' });
  if (error) throw new Error(friendly(error.message));
}
export async function resendSignup(email) {
  const c = await client();
  const { error } = await c.auth.resend({ type: 'signup', email, options: { emailRedirectTo: window.location.origin } });
  if (error) throw new Error(friendly(error.message));
}
// Forgot password: email a code (works inside the home-screen app, where links open Safari instead).
export async function sendReset(email) {
  const c = await client();
  const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  if (error) throw new Error(friendly(error.message));
}
export async function verifyReset(email, token) {
  const c = await client();
  const { error } = await c.auth.verifyOtp({ email, token, type: 'recovery' });
  if (error) throw new Error(friendly(error.message));
}
export async function setPassword(password) {
  const c = await client();
  const { error } = await c.auth.updateUser({ password });
  if (error) throw new Error(/same|different/i.test(error.message) ? 'That’s already your password.' : friendly(error.message));
}
// ── Google ── (switch on with REACT_APP_AUTH_GOOGLE=true once the provider is set up in Supabase)
export const GOOGLE = process.env.REACT_APP_AUTH_GOOGLE === 'true';
export async function googleSignIn() {
  const c = await client();
  const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  if (error) throw new Error('Google sign-in isn’t available right now. Use your email instead.');
}

// Everything this device knows about the user goes when they sign out.
const DEVICE_KEYS = ['strava_access_token', 'strava_refresh_token', 'strava_token_expiry', 'strava_athlete_id', 'apex-activities-v1',
  'whoop_access_token', 'whoop_refresh_token', 'whoop_token_expiry', 'whoop_pending', 'whoop_state', 'oura_access_token', 'oura_refresh_token', 'oura_token_expiry', 'google_access_token', 'google_refresh_token', 'google_token_expiry', 'recovery_pending', 'recovery_pending_state', 'apex-anthropic-key', 'apex-coach-draft', 'apex-runs-coros-v1', 'apex-runs-whoop-v1'];
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
    c.from('apex_profiles').select('*').eq('user_id', user.id).maybeSingle(), // '*' keeps working before the payments migration adds pro_until
    c.from('apex_usage').select('coach,food').eq('user_id', user.id).eq('month', m).maybeSingle(),
  ]);
  const until = prof?.pro_until ? new Date(prof.pro_until) : null, pro = prof?.plan === 'pro' && (!until || until > new Date());
  return { id: user.id, email: user.email, plan: pro ? 'pro' : 'free', until: pro && until ? until : null, paid: !!prof?.stripe_subscription, used: (use?.coach || 0) + (use?.food || 0) };
}

// Public-site helpers (Strava capacity / waitlist / feedback).
async function publicCall(method, body) {
  const s = await session();
  const res = await fetch('/.netlify/functions/apex-public', { method, headers: { Authorization: `Bearer ${s?.access_token || ''}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || 'Something went wrong. Please try again.');
  return j;
}
export const stravaCapacity = () => publicCall('GET');
export const joinWaitlist = () => publicCall('POST', { waitlist: true });
export const sendFeedback = (feedback, page) => publicCall('POST', { feedback, page, device: navigator.userAgent });
