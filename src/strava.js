const BASE = "https://www.strava.com/api/v3";

export const isConnected = () => !!localStorage.getItem("strava_refresh_token");

export function disconnect() {
  ["strava_access_token","strava_refresh_token","strava_token_expiry","strava_athlete_id","apex-activities-v1"].forEach(k => localStorage.removeItem(k));
}

async function refreshToken() {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.REACT_APP_STRAVA_CLIENT_ID,
      client_secret: process.env.REACT_APP_STRAVA_CLIENT_SECRET,
      refresh_token: localStorage.getItem("strava_refresh_token"),
      grant_type: "refresh_token",
    }),
  });
  const d = await res.json();
  if (d.access_token) {
    localStorage.setItem("strava_access_token", d.access_token);
    localStorage.setItem("strava_refresh_token", d.refresh_token);
    localStorage.setItem("strava_token_expiry", d.expires_at);
    return d.access_token;
  }
  throw new Error("Strava refresh failed");
}

async function token() {
  const t = localStorage.getItem("strava_access_token");
  const exp = localStorage.getItem("strava_token_expiry");
  if (t && exp && Date.now() / 1000 < parseInt(exp) - 300) return t;
  return refreshToken();
}

async function get(path) {
  const t = await token();
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${t}` } });
  if (!res.ok) throw new Error(`Strava ${res.status}`);
  return res.json();
}

export async function exchangeCode(code) {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.REACT_APP_STRAVA_CLIENT_ID,
      client_secret: process.env.REACT_APP_STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });
  const d = await res.json();
  if (d.access_token) {
    localStorage.setItem("strava_access_token", d.access_token);
    localStorage.setItem("strava_refresh_token", d.refresh_token);
    localStorage.setItem("strava_token_expiry", d.expires_at);
    localStorage.setItem("strava_athlete_id", d.athlete.id);
    return d;
  }
  throw new Error("Strava exchange failed");
}

export const getAthlete = () => get("/athlete");
export const getStats = (id) => get(`/athletes/${id}/stats`);
export const getActivities = (n = 50) => get(`/athlete/activities?per_page=${n}`);
export const getActivity = (id) => get(`/activities/${id}`);
export const getStreams = (id) => get(`/activities/${id}/streams?keys=time,distance,latlng,altitude,velocity_smooth,heartrate,cadence,watts,grade_smooth&key_by_type=true`);
export const getGear = (id) => get(`/gear/${id}`);

// Get all athlete gear (shoes)
export async function getAllGear(athlete) {
  if (!athlete?.shoes) return [];
  return Promise.all(athlete.shoes.map(s => getGear(s.id).catch(() => s)));
}

// Get best efforts from activities
export function extractBestEfforts(activities) {
  const efforts = { "400m": null, "1K": null, "1 mile": null, "5K": null, "10K": null, "Half-Marathon": null, "Marathon": null };
  const order = { "400m":400, "1K":1000, "1 mile":1609, "5K":5000, "10K":10000, "Half-Marathon":21097, "Marathon":42195 };
  
  for (const act of activities) {
    if (!act.best_efforts) continue;
    for (const e of act.best_efforts) {
      const key = Object.keys(efforts).find(k => k === e.name);
      if (!key) continue;
      if (!efforts[key] || e.moving_time < efforts[key].moving_time) {
        efforts[key] = { ...e, date: act.start_date_local };
      }
    }
  }
  return efforts;
}

// ── Full history ──
// Strava returns at most 200 activities a page. The first sync walks back through
// every page; after that, only the newest page is fetched and merged. History is
// kept on this device (trimmed to what APEX uses) so the app opens instantly.
const HISTORY_KEY = "apex-activities-v1";
const keep = a => ({
  id: a.id, name: a.name, type: a.type, sport_type: a.sport_type, workout_type: a.workout_type,
  start_date: a.start_date, start_date_local: a.start_date_local, timezone: a.timezone,
  distance: a.distance, moving_time: a.moving_time, elapsed_time: a.elapsed_time,
  average_speed: a.average_speed, max_speed: a.max_speed, average_heartrate: a.average_heartrate, max_heartrate: a.max_heartrate,
  total_elevation_gain: a.total_elevation_gain, average_cadence: a.average_cadence, average_watts: a.average_watts,
  start_latlng: a.start_latlng, suffer_score: a.suffer_score, kudos_count: a.kudos_count, gear_id: a.gear_id, manual: a.manual, trainer: a.trainer,
  map: a.map?.summary_polyline ? { summary_polyline: a.map.summary_polyline } : undefined,
});
function readHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || null; } catch { return null; } }
function writeHistory(h) { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch { /* storage full: keep in memory only */ } }
const byDate = (a, b) => new Date(b.start_date) - new Date(a.start_date);

export async function getActivityHistory({ onUpdate, maxPages = 25 } = {}) {
  const cached = readHistory();
  const map = new Map((cached?.items || []).map(a => [a.id, a]));
  const emit = () => { const list = [...map.values()].sort(byDate); onUpdate?.(list); return list; };
  if (map.size) emit();
  const newestCached = cached?.items?.length ? Math.max(...cached.items.map(a => new Date(a.start_date).getTime())) : 0;
  let complete = !!cached?.complete;
  for (let page = 1; page <= maxPages; page++) {
    const rows = await get(`/athlete/activities?per_page=200&page=${page}`);
    rows.forEach(a => map.set(a.id, keep(a)));
    const list = emit();
    writeHistory({ complete: complete || rows.length < 200, syncedAt: Date.now(), items: list });
    if (rows.length < 200) { complete = true; break; }
    // Once the cache is complete, stop as soon as this page overlaps what we already had.
    const oldestHere = Math.min(...rows.map(a => new Date(a.start_date).getTime()));
    if (complete && oldestHere <= newestCached) break;
  }
  writeHistory({ complete, syncedAt: Date.now(), items: [...map.values()].sort(byDate) });
  return [...map.values()].sort(byDate);
}
export const historyInfo = () => { const h = readHistory(); return h ? { count: h.items.length, complete: h.complete, oldest: h.items[h.items.length - 1]?.start_date_local, syncedAt: h.syncedAt } : null; };
export const clearHistory = () => { try { localStorage.removeItem(HISTORY_KEY); } catch {} };
