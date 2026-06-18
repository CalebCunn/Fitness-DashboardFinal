exports.handler = async (event) => {
  try {
    const token = event.headers.authorization;
    if (!token) return { statusCode: 401, body: "Unauthorized" };
    
    // Try multiple endpoints
    const endpoints = [
      "https://api.prod.whoop.com/developer/v1/recovery?limit=7&order=desc",
      "https://api.prod.whoop.com/developer/v1/recovery?limit=7",
    ];
    
    let response, text;
    for (const url of endpoints) {
      response = await fetch(url, { headers: { Authorization: token } });
      text = await response.text();
      console.log(`URL: ${url} Status: ${response.status} Body: ${text.substring(0, 200)}`);
      if (response.status === 200) break;
    }
    
    return {
      statusCode: response.status,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: text,
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
