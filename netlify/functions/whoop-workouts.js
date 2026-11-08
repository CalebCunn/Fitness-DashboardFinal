exports.handler = async (event) => {
  try {
    const token = event.headers.authorization;
    if (!token) return { statusCode: 401, body: "Unauthorized" };
    // History paging (limit + nextToken) for runs from WHOOP; without them, the latest 20 as before.
    const q = event.queryStringParameters || {};
    const limit = Math.min(25, Math.max(1, parseInt(q.limit, 10) || 20));
    const next = q.nextToken ? `&nextToken=${encodeURIComponent(q.nextToken)}` : "";
    const urls = [
      `https://api.prod.whoop.com/developer/v2/activity/workout?limit=${limit}${next}`,
      ...(next ? [] : [`https://api.prod.whoop.com/developer/v1/activity/workout?limit=${limit}&order=desc`]),
    ];
    // WHOOP saying the token is bad (401) is passed on, so the app renews it instead of giving up.
    let rejected = false;
    for (const url of urls) {
      const res = await fetch(url, { headers: { Authorization: token } });
      if (res.status === 401) rejected = true;
      const text = await res.text();
      console.log(`${url.split("?")[0]} -> ${res.status}`);
      if (res.status === 200) return { statusCode: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: text };
    }
    return { statusCode: rejected ? 401 : 404, body: "{}" };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
