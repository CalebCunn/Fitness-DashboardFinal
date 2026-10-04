// Deterministic date handling for APEX. The AI never decides what day a date is.
// All dates are local calendar dates in YYYY-MM-DD form, parsed at midday to avoid
// daylight-saving and UTC shifts.

export const localDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parseDay = key => new Date(key + 'T12:00:00');
export const isISODate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && Number.isFinite(parseDay(s).getTime());
export const addDays = (key, n) => { const d = parseDay(key); d.setDate(d.getDate() + n); return localDate(d); };
export const weekdayLong = key => parseDay(key).toLocaleDateString('en-GB', { weekday: 'long' });
export const weekdayShort = key => parseDay(key).toLocaleDateString('en-GB', { weekday: 'short' });
export const prettyDate = (key, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => parseDay(key).toLocaleDateString('en-GB', opts);
export const mondayOf = key => { const d = parseDay(key); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return localDate(d); };

const DAY_INDEX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const dayIndex = s => DAY_INDEX[(s || '').trim().toLowerCase().slice(0, 3)];

// A calendar the model can read instead of calculating weekdays itself.
export function calendarTable(todayKey, back = 7, forward = 28) {
  const rows = [];
  for (let i = -back; i <= forward; i++) {
    const key = addDays(todayKey, i);
    const flag = i === 0 ? '  <= TODAY' : i === 1 ? '  (tomorrow)' : i === -1 ? '  (yesterday)' : '';
    const monday = weekdayShort(key) === 'Mon' ? '  [week starts]' : '';
    rows.push(`${key} ${weekdayShort(key)} ${prettyDate(key, { day: 'numeric', month: 'short' })}${flag}${monday}`);
  }
  return rows.join('\n');
}

// Parses a PLAN_START ... PLAN_END block.
// Preferred row: 2026-10-06 | Mon | Easy | 8km | 5:30-5:50/km | Shoe | Notes
// Legacy row:    Mon | Easy | 8km | 5:30-5:50/km | Shoe | Notes  (mapped to the next matching date)
export function parsePlanBlock(text, todayKey) {
  if (!text || !text.includes('PLAN_START') || !text.includes('PLAN_END')) return null;
  const section = text.split('PLAN_START')[1].split('PLAN_END')[0];
  const lines = section.split('\n').map(l => l.trim()).filter(Boolean);
  let title = 'Training plan';
  const sessions = [], corrections = [];
  let cursor = todayKey;
  for (const line of lines) {
    if (/^TITLE:/i.test(line)) { title = line.replace(/^TITLE:/i, '').trim() || title; continue; }
    const parts = line.split('|').map(p => p.trim());
    if (parts.length < 3) continue;
    let date = null, rest = parts;
    if (isISODate(parts[0])) {
      date = parts[0];
      rest = parts.slice(1);
      if (dayIndex(rest[0]) !== undefined) {
        if (dayIndex(rest[0]) !== parseDay(date).getDay()) corrections.push(`${rest[0]} → ${weekdayShort(date)} ${prettyDate(date, { day: 'numeric', month: 'short' })}`);
        rest = rest.slice(1);
      }
    } else if (dayIndex(parts[0]) !== undefined) {
      // Legacy weekday-only row: next occurrence on or after the cursor.
      const target = dayIndex(parts[0]);
      let probe = cursor;
      for (let i = 0; i < 7 && parseDay(probe).getDay() !== target; i++) probe = addDays(probe, 1);
      date = probe;
      rest = parts.slice(1);
    } else continue;
    if (rest.length < 2) continue;
    const [type, dist = '', pace = '', shoe = '', ...notes] = rest;
    sessions.push({ date, day: weekdayLong(date), type: normaliseType(type), dist: dist === '0km' ? '0km' : dist, pace, shoe, notes: notes.join(' | ') });
    cursor = addDays(date, 1);
  }
  if (!sessions.length) return null;
  sessions.sort((a, b) => a.date.localeCompare(b.date));
  return { title, startDate: sessions[0].date, endDate: sessions[sessions.length - 1].date, sessions, corrections };
}

const TYPES = ['Easy', 'Interval', 'Tempo', 'Long Run', 'Gym', 'Rest'];
function normaliseType(t) {
  const s = (t || '').toLowerCase();
  if (s.includes('long')) return 'Long Run';
  if (s.includes('interval') || s.includes('rep') || s.includes('track') || s.includes('speed')) return 'Interval';
  if (s.includes('tempo') || s.includes('threshold') || s.includes('progress')) return 'Tempo';
  if (s.includes('gym') || s.includes('strength') || s.includes('lift')) return 'Gym';
  if (s.includes('rest') || s.includes('off')) return 'Rest';
  if (s.includes('easy') || s.includes('recovery') || s.includes('shake')) return 'Easy';
  return TYPES.find(x => x.toLowerCase() === s) || (t || 'Easy');
}

// Applies a proposal over an existing plan: sessions inside the proposal's date
// range are replaced, sessions outside it are kept.
export function mergePlan(existing, proposal) {
  const keep = (existing?.sessions || []).map((s, i) => {
    if (s.date) return s;
    if (existing?.startDate) return { ...s, date: addDays(existing.startDate, i) };
    return s;
  }).filter(s => !s.date || s.date < proposal.startDate || s.date > proposal.endDate);
  const sessions = [...keep, ...proposal.sessions.map(({ ...s }) => s)].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return { title: proposal.title, startDate: sessions[0]?.date || proposal.startDate, sessions };
}

// Session type to track surface.
export const SURFACE = {
  'Long Run': { name: 'Long run', bg: '#5B45C0', ink: '#F5F4F0', soft: '#E8E0F0' },
  Easy: { name: 'Easy', bg: '#2F6A4F', ink: '#F5F4F0', soft: '#E4EADD' },
  Tempo: { name: 'Tempo', bg: '#A85A3B', ink: '#F5F4F0', soft: '#EAE2D8' },
  Interval: { name: 'Intervals', bg: '#BF3A2B', ink: '#F5F4F0', soft: '#F3DDD8' },
  Gym: { name: 'Strength', bg: '#25242E', ink: '#F5F4F0', soft: '#E6E4EA' },
  Rest: { name: 'Rest', bg: '#8072A7', ink: '#F5F4F0', soft: '#E8E0F0' },
};
export const surfaceFor = type => SURFACE[type] || SURFACE.Easy;
