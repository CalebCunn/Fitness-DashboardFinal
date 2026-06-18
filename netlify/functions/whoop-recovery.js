exports.handler = async (event) => {
  try {
    const token = event.headers.authorization;
    if (!token) return { statusCode: 401, body: "Unauthorized" };
    
    // Try v2 API first, fall back to v1
    const urls = [
      "https://api.prod.whoop.com/developer/v2/cycle?limit=7",
      "https://api.prod.whoop.com/developer/v1/recovery?limit=7&order=desc",
    ];
    
    let lastStatus, lastText;
    for (const url of urls) {
      const res = await fetch(url, { headers: { Authorization: token } });
      lastText = await res.text();
      lastStatus = res.status;
      console.log(`${url} -> ${res.status}: ${lastText.substring(0, 300)}`);
      if (res.status === 200) {
        return { statusCode: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: lastText };
      }
    }
    
    return { statusCode: lastStatus, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: lastText };
  } catch (err) {
    console.error(err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
