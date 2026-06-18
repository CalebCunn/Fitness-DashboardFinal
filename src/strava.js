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
