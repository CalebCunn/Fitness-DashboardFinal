exports.handler = async (event) => {
  try {
    const token = event.headers.authorization;
    if (!token) return { statusCode: 401, body: "Unauthorized" };
    const response = await fetch("https://api.prod.whoop.com/developer/v1/cycle?limit=7&order=desc", {
      headers: { Authorization: token },
    });
    const text = await response.text();
    console.log(`Cycles status: ${response.status} body: ${text.substring(0,200)}`);
    return { statusCode: response.status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: text };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
