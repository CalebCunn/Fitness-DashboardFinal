// APEX · who is allowed to use the AI, and how.
// Owner build: an access code you type once on each device (never in the website bundle).
// Public build (REACT_APP_PUBLIC=true): the signed-in user's session, with a monthly allowance.
// Either build: "bring your own key" sends requests straight to Anthropic from this device,
// billed to the user's own Anthropic account. The key never touches our server.
import {session} from './apexAuth';

export const PUBLIC = process.env.REACT_APP_PUBLIC === 'true';
const CODE_KEY = 'apex-access-code', BYOK_KEY = 'apex-anthropic-key';
const read = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const write = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} };

export const accessCode = () => read(CODE_KEY);
export const setAccessCode = v => write(CODE_KEY, v.trim());
export const ownKey = () => read(BYOK_KEY);
export const setOwnKey = v => write(BYOK_KEY, v.trim());

export async function aiHeaders() {
  const h = { 'Content-Type': 'application/json' };
  const code = accessCode();
  if (code) h['x-apex-access'] = code;
  if (PUBLIC) { const s = await session(); if (s?.access_token) h.Authorization = `Bearer ${s.access_token}`; }
  return h;
}

// Straight to Anthropic with the user's own key (CORS is allowed with this header).
export function anthropicDirect(payload, beta) {
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': ownKey(),
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  if (beta) headers['anthropic-beta'] = beta;
  return fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(payload) });
}

// Friendly messages for the guard's error codes.
export function accessMessage(code, fallback) {
  if (code === 'access') return 'The coach is locked on this site. Add your access code in Customise → Coach.';
  if (code === 'signin') return 'Sign in again to use the coach.';
  if (code === 'limit') return 'You’ve used this month’s free coach messages. Add your own Anthropic key in Customise → Coach to keep going.';
  return fallback;
}
