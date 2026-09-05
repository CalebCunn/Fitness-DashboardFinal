exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return { statusCode: 405, body: "Method not allowed" };
  const token = event.headers.authorization?.replace("Bearer ", "");
  if (!token) return { statusCode: 401, body: "No token" };

  // Coros MCP endpoint - fetch recent workouts and health data
  const headers = { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };
  
  try {
    // Get recent workouts (last 30 days)
    const endDate = new Date().toISOString().split("T")[0].replace(/-/g,"");
    const startDate = new Date(Date.now() - 30*86400000).toISOString().split("T")[0].replace(/-/g,"");
    
    const workoutsRes = await fetch(`https://open.coros.com/v2/coros/sport/list?startDay=${startDate}&endDay=${endDate}&size=20`, { headers });
    const workouts = workoutsRes.ok ? await workoutsRes.json() : { data: [] };

    // Get daily metrics (HRV, sleep, etc)
    const metricsRes = await fetch(`https://open.coros.com/v2/coros/daily-activity/list?startDay=${startDate}&endDay=${endDate}`, { headers });
    const metrics = metricsRes.ok ? await metricsRes.json() : { data: [] };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ workouts: workouts.data || [], metrics: metrics.data || [] }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
