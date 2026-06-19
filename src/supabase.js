const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_KEY;

const headers = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
};

async function sbGet(table, select = "*") {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?user_id=eq.caleb&select=${select}`, { headers });
    const data = await res.json();
    return data?.[0] || null;
  } catch { return null; }
}

async function sbPatch(table, body) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?user_id=eq.caleb`, {
      method: "PATCH",
      headers: { ...headers, "Prefer": "return=minimal" },
      body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
    });
  } catch (e) { console.error(`${table} save failed`, e); }
}

export const loadChatHistory = async () => (await sbGet("chat_history", "messages"))?.messages || [];
export const saveChatHistory = (messages) => sbPatch("chat_history", { messages: messages.slice(-50) });

export const loadTrainingPlan = async () => (await sbGet("training_plan", "plan"))?.plan || null;
export const saveTrainingPlan = (plan) => sbPatch("training_plan", { plan });

// User preferences — races, goals, gym lifts, sponsorship
export const loadUserPrefs = async () => (await sbGet("user_prefs", "prefs"))?.prefs || null;
export const saveUserPrefs = (prefs) => sbPatch("user_prefs", { prefs });
