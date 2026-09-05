const COROS_MCP = "https://mcp.coros.com/mcp";
const COROS_AUTH = "https://open.coros.com/oauth2/authorize";
const COROS_TOKEN = "https://open.coros.com/oauth2/accesstoken";

export const isCorosConnected = () => !!localStorage.getItem("coros_access_token");

export function disconnectCoros() {
  ["coros_access_token","coros_refresh_token","coros_token_expiry","coros_pending"].forEach(k => localStorage.removeItem(k));
}

export function getCorosAuthUrl() {
  const clientId = process.env.REACT_APP_COROS_CLIENT_ID;
  const redirect = encodeURIComponent(window.location.origin + "?coros=1");
  localStorage.setItem("coros_pending", "1");
  return `${COROS_AUTH}?client_id=${clientId}&redirect_uri=${redirect}&response_type=code&scope=workout,health`;
}

async function refreshCorosToken() {
  const res = await fetch("/.netlify/functions/coros-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: localStorage.getItem("coros_refresh_token"),
    }),
  });
  const d = await res.json();
  if (d.access_token) {
    localStorage.setItem("coros_access_token", d.access_token);
    if (d.refresh_token) localStorage.setItem("coros_refresh_token", d.refresh_token);
    localStorage.setItem("coros_token_expiry", Date.now() + (d.expires_in||3600) * 1000);
    return d.access_token;
  }
  throw new Error("Coros refresh failed");
}

async function corosToken() {
  const t = localStorage.getItem("coros_access_token");
  const exp = localStorage.getItem("coros_token_expiry");
  if (t && exp && Date.now() < parseInt(exp) - 60000) return t;
  return refreshCorosToken();
}

export async function exchangeCorosCode(code) {
  const res = await fetch("/.netlify/functions/coros-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: window.location.origin + "?coros=1" }),
  });
  const d = await res.json();
  if (d.access_token) {
    localStorage.setItem("coros_access_token", d.access_token);
    localStorage.setItem("coros_refresh_token", d.refresh_token);
    localStorage.setItem("coros_token_expiry", Date.now() + (d.expires_in||3600) * 1000);
    localStorage.removeItem("coros_pending");
    return d;
  }
  throw new Error("Coros exchange failed: " + JSON.stringify(d));
}

export async function getCorosData() {
  try {
    const token = await corosToken();
    const res = await fetch("/.netlify/functions/coros-data", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Coros data ${res.status}`);
    return res.json();
  } catch (e) {
    console.error("Coros data failed:", e);
    return null;
  }
}
