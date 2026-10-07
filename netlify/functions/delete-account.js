// Deletes the signed-in user's account. Their apex_data, apex_profiles and apex_usage rows go with it
// (on delete cascade). Requires the user's own session token; uses the service key server-side only.
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.APEX_PUBLIC !== "true" || !url || !anon || !service) return { statusCode: 404, body: "Not found" };
  const auth = event.headers.authorization || event.headers.Authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return { statusCode: 401, body: "Sign in first" };
  const who = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
  if (!who.ok) return { statusCode: 401, body: "Sign in again" };
  const { id } = await who.json();
  const del = await fetch(`${url}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: { apikey: service, Authorization: `Bearer ${service}` } });
  return { statusCode: del.ok ? 200 : 500, body: del.ok ? "Deleted" : "Could not delete" };
};
