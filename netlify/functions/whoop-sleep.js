exports.handler = async (event) => {
  try {
    const token = event.headers.authorization;
    if (!token) return { statusCode: 401, body: "Unauthorized" };
    const urls = [
      "https://api.prod.whoop.com/developer/v2/activity/sleep?limit=7",
      "https://api.prod.whoop.com/developer/v1/activity/sleep?limit=7&order=desc",
    ];
    // WHOOP saying the token is bad (401) is passed on, so the app renews it instead of giving up.
    let rejected = false;
    for (const url of urls) {
      const res = await fetch(url, { headers: { Authorization: token } });
      if (res.status === 401) rejected = true;
      const text = await res.text();
      console.log(`${url} -> ${res.status}`);
      if (res.status === 200) return { statusCode: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: text };
    }
    return { statusCode: rejected ? 401 : 404, body: "{}" };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
