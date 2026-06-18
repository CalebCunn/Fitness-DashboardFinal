exports.handler = async (event) => {
  try {
    const token = event.headers.authorization;
    if (!token) return { statusCode: 401, body: "Unauthorized" };
    const urls = [
      "https://api.prod.whoop.com/developer/v2/activity/workout?limit=20",
      "https://api.prod.whoop.com/developer/v1/activity/workout?limit=20&order=desc",
    ];
    for (const url of urls) {
      const res = await fetch(url, { headers: { Authorization: token } });
      const text = await res.text();
      console.log(`${url} -> ${res.status}`);
      if (res.status === 200) return { statusCode: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: text };
    }
    return { statusCode: 404, body: "{}" };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
