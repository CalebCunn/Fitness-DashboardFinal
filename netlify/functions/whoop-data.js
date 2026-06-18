exports.handler = async (event) => {
  const token = event.headers.authorization;
  if (!token) return { statusCode: 401, body: "Unauthorized" };

  const path = event.queryStringParameters?.path || "/recovery?limit=14&order=desc";

  const response = await fetch(`https://api.prod.whoop.com/developer/v1${path}`, {
    headers: { Authorization: token },
  });

  const data = await response.text();

  return {
    statusCode: response.status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: data,
  };
};
