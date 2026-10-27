// Read-only proxy for Oura and Google Health data. Only these paths can be requested,
// and the user's own access token is passed straight through.
const BASES = { oura: "https://api.ouraring.com/v2/usercollection/", google: "https://health.googleapis.com/v4/users/me/dataTypes/" };
const PATHS = {
  oura: /^(daily_readiness|daily_sleep|sleep)\?[\w=&.-]+$/,
  google: /^(sleep|daily-heart-rate-variability|daily-resting-heart-rate)\/dataPoints\?[\w=&.%+-]+$/,
};

exports.handler = async (event) => {
  const token = event.headers.authorization;
  const { provider, path } = event.queryStringParameters || {};
  if (!token) return { statusCode: 401, body: "Unauthorized" };
  if (!BASES[provider] || !PATHS[provider].test(path || "")) return { statusCode: 400, body: "Invalid request" };
  const res = await fetch(BASES[provider] + path, { headers: { Authorization: token } });
  return { statusCode: res.status, headers: { "Content-Type": "application/json" }, body: await res.text() };
};
