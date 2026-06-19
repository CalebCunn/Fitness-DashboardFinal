const BASE = "https://www.strava.com/api/v3";

export const isConnected = () => !!localStorage.getItem("strava_refresh_token");

export function disconnect() {
  ["strava_access_token","strava_refresh_token","strava_token_expiry","strava_athlete_id"].forEach(k => localStorage.removeItem(k));
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
export const getStreams = (id) => get(`/activities/${id}/streams?keys=heartrate,cadence,watts,velocity_smooth,altitude,time&key_by_type=true`);
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
