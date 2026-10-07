exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const body = JSON.parse(event.body);
  const clientId = process.env.WHOOP_CLIENT_ID || process.env.REACT_APP_WHOOP_CLIENT_ID;
  const clientSecret = process.env.WHOOP_CLIENT_SECRET || process.env.REACT_APP_WHOOP_CLIENT_SECRET;

  // Only pass through the OAuth fields we expect; never let the browser override the client credentials.
  const allowed = ["grant_type", "code", "refresh_token", "redirect_uri", "scope"];
  const extra = Object.fromEntries(Object.entries(body || {}).filter(([k, v]) => allowed.includes(k) && typeof v === "string"));
  const params = new URLSearchParams({ ...extra, client_id: clientId, client_secret: clientSecret });

  const response = await fetch("https://api.prod.whoop.com/oauth/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await response.json();

  return {
    statusCode: response.status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
};
