exports.handler = async (event) => {
  try {
    const token = event.headers.authorization;
    if (!token) return { statusCode: 401, body: "Unauthorized" };

    // Get the path from query params, default to recovery
    const path = event.queryStringParameters?.path || "/recovery";
    const url = `https://api.prod.whoop.com/developer/v1${path}`;

    console.log("Fetching Whoop URL:", url);

    const response = await fetch(url, {
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
    });

    const text = await response.text();
    console.log("Whoop response status:", response.status);

    return {
      statusCode: response.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
      body: text,
    };
  } catch (err) {
    console.error("Whoop proxy error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
