exports.handler = async (event) => {
  try {
    const { lat, lng, date } = event.queryStringParameters;
    if (!lat || !lng || !date) return { statusCode: 400, body: "Missing params" };

    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${date}&end_date=${date}&hourly=temperature_2m,weathercode&timezone=Europe%2FLondon`;
    const res = await fetch(url);
    const data = await res.json();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
