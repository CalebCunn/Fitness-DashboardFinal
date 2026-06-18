exports.handler = async (event) => {
  try {
    const token = event.headers.authorization;
    if (!token) return { statusCode: 401, body: "Unauthorized" };
    
    const urls = [
      "https://api.prod.whoop.com/developer/v1/recovery?limit=7&order=desc",
      "https://api.prod.whoop.com/developer/v2/recovery?limit=7",
      "https://api.prod.whoop.com/developer/v1/cycle?limit=7&order=desc",
    ];
    
    for (const url of urls) {
      const res = await fetch(url, { headers: { Authorization: token } });
      const text = await res.text();
      console.log(`${url} -> ${res.status}: ${text.substring(0, 400)}`);
      if (res.status === 200) {
        return { statusCode: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: text };
      }
    }
    
    return { statusCode: 404, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ records: [] }) };
  } catch (err) {
    console.error(err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
