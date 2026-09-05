exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  const body = JSON.parse(event.body);
  const clientId = process.env.REACT_APP_COROS_CLIENT_ID;
  const clientSecret = process.env.REACT_APP_COROS_CLIENT_SECRET;
  const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...body });
  const res = await fetch("https://open.coros.com/oauth2/accesstoken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const data = await res.json();
  return { statusCode: res.status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(data) };
};
