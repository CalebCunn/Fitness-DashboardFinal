const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_KEY;

const headers = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
};

export async function loadChatHistory() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/chat_history?user_id=eq.caleb&select=messages`, { headers });
    const data = await res.json();
    return data?.[0]?.messages || [];
  } catch { return []; }
}

export async function saveChatHistory(messages) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/chat_history?user_id=eq.caleb`, {
      method: "PATCH",
      headers: { ...headers, "Prefer": "return=minimal" },
      body: JSON.stringify({ messages: messages.slice(-50), updated_at: new Date().toISOString() }),
    });
  } catch (e) { console.error("Chat save failed", e); }
}

export async function loadTrainingPlan() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/training_plan?user_id=eq.caleb&select=plan`, { headers });
    const data = await res.json();
    return data?.[0]?.plan || null;
  } catch { return null; }
}

export async function saveTrainingPlan(plan) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/training_plan?user_id=eq.caleb`, {
      method: "PATCH",
      headers: { ...headers, "Prefer": "return=minimal" },
      body: JSON.stringify({ plan, updated_at: new Date().toISOString() }),
    });
  } catch (e) { console.error("Plan save failed", e); }
}
