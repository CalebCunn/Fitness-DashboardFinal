const WHOOP_BASE = "https://api.prod.whoop.com/developer/v1";

export const isWhoopConnected = () => !!localStorage.getItem("whoop_refresh_token");

export function disconnectWhoop() {
  ["whoop_access_token","whoop_refresh_token","whoop_token_expiry","whoop_pending","whoop_state"].forEach(k => localStorage.removeItem(k));
}

async function tokenExchange(params) {
  const isNetlify = window.location.hostname !== "localhost";
  if (isNetlify) {
    const res = await fetch("/.netlify/functions/whoop-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return res.json();
  } else {
    const res = await fetch("https://api.prod.whoop.com/oauth/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.REACT_APP_WHOOP_CLIENT_ID,
        client_secret: process.env.REACT_APP_WHOOP_CLIENT_SECRET,
        ...params,
      }),
    });
    return res.json();
  }
}

async function refreshWhoopToken() {
  const d = await tokenExchange({
    grant_type: "refresh_token",
    refresh_token: localStorage.getItem("whoop_refresh_token"),
    redirect_uri: window.location.origin,
  });
  if (d.access_token) {
    localStorage.setItem("whoop_access_token", d.access_token);
    localStorage.setItem("whoop_refresh_token", d.refresh_token);
    localStorage.setItem("whoop_token_expiry", Date.now() + d.expires_in * 1000);
    return d.access_token;
  }
  throw new Error("Whoop refresh failed");
}

async function whoopToken() {
  const t = localStorage.getItem("whoop_access_token");
  const exp = localStorage.getItem("whoop_token_expiry");
  if (t && exp && Date.now() < parseInt(exp) - 60000) return t;
  return refreshWhoopToken();
}

async function whoopGet(path) {
  const t = await whoopToken();
  const isNetlify = window.location.hostname !== "localhost";

  if (isNetlify) {
    // Use Netlify proxy to avoid CORS
    const res = await fetch(`/.netlify/functions/whoop-data?path=${encodeURIComponent(path)}`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) throw new Error(`Whoop proxy ${res.status}`);
    return res.json();
  } else {
    const res = await fetch(`${WHOOP_BASE}${path}`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) throw new Error(`Whoop ${res.status}`);
    return res.json();
  }
}

export async function exchangeWhoopCode(code) {
  const d = await tokenExchange({
    grant_type: "authorization_code",
    code,
    redirect_uri: window.location.origin,
  });
  if (d.access_token) {
    localStorage.setItem("whoop_access_token", d.access_token);
    localStorage.setItem("whoop_refresh_token", d.refresh_token);
    localStorage.setItem("whoop_token_expiry", Date.now() + d.expires_in * 1000);
    localStorage.removeItem("whoop_pending");
    localStorage.removeItem("whoop_state");
    return d;
  }
  throw new Error("Whoop exchange failed: " + JSON.stringify(d));
}

export function getWhoopAuthUrl() {
  const state = "whoop_" + Math.random().toString(36).substring(2, 15);
  localStorage.setItem("whoop_pending", "1");
  localStorage.setItem("whoop_state", state);
  const clientId = process.env.REACT_APP_WHOOP_CLIENT_ID;
  const redirectUri = encodeURIComponent(window.location.origin);
  const scope = encodeURIComponent("offline read:recovery read:sleep read:workout read:body_measurement read:cycles read:profile");
  return `https://api.prod.whoop.com/oauth/oauth2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}`;
}

export async function getWhoopData() {
  const [recoveries, sleeps, workouts, cycles] = await Promise.all([
    whoopGet("/recovery?limit=14&order=desc"),
    whoopGet("/activity/sleep?limit=14&order=desc"),
    whoopGet("/activity/workout?limit=20&order=desc"),
    whoopGet("/cycle?limit=14&order=desc"),
  ]);
  return { recoveries, sleeps, workouts, cycles };
}
