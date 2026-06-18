export const PBS = [
  { label: "5K",       time: "18:42",   pace: "3:44/km", date: "2024" },
  { label: "10K",      time: "40:52",   pace: "4:05/km", date: "2024" },
  { label: "HM",       time: "1:32:48", pace: "4:23/km", date: "Feb 2026" },
  { label: "Marathon", time: "3:48:59", pace: "5:25/km", date: "Apr 2026" },
];

export const SHOES = [
  { name: "Metaspeed Sky Tokyo",  colour: "Green", role: "Race Day",        carbon: true  },
  { name: "Metaspeed Sky Tokyo",  colour: "Red",   role: "Carbon Trainer",  carbon: true  },
  { name: "Adidas Evo SL",        colour: "",      role: "Daily / Tempo",   carbon: false },
  { name: "Novablast 5",          colour: "",      role: "Easy / Long Run", carbon: false },
  { name: "Nike Vaporfly 3",      colour: "",      role: "Intervals",       carbon: true  },
  { name: "Nike Vaporfly 4",      colour: "",      role: "Intervals",       carbon: true  },
  { name: "Nike ZoomFly 5",       colour: "",      role: "Training",        carbon: false },
];

export const LIFTS = [
  { name: "Smith Flat Bench",    weight: "20kg/side", sets: 3, reps: 10 },
  { name: "Smith Incline Press", weight: "15kg/side", sets: 3, reps: 10 },
  { name: "Pec Deck",            weight: "73kg",      sets: 3, reps: 12 },
  { name: "Preacher Curl",       weight: "39kg",      sets: 3, reps: 10 },
  { name: "Hammer Curl",         weight: "16kg DBs",  sets: 3, reps: 12 },
  { name: "Lateral Raises",      weight: "8–10kg",    sets: 3, reps: 15 },
];

export const RACES = [
  { name: "London Marathon",   date: "2024 & Apr 2026", charity: "Duchenne Family Support Group", target: "Completed",  done: true  },
  { name: "Berlin Marathon",   date: "28 Sep 2026",     charity: "Get Kids Going",                target: "Sub 3:20",   next: true  },
  { name: "Seville Marathon",  date: "Feb 2027",        charity: "TBC",                           target: "Sub 3:00"              },
  { name: "Valencia Marathon", date: "Dec 2027",        charity: "TBC",                           target: "Sub 3:00+"             },
  { name: "Tokyo",             date: "TBC",             charity: "TBC",                           target: "Major #4"              },
  { name: "Chicago",           date: "TBC",             charity: "TBC",                           target: "Major #5"              },
  { name: "New York",          date: "TBC",             charity: "TBC",                           target: "Major #6"              },
];

export const SPONSORSHIP = [
  { name: "SiS",               status: "Product confirmed",   state: "success" },
  { name: "Tracksmith",        status: "Applied — quarterly", state: "pending" },
  { name: "Runderwear",        status: "Applied",             state: "pending" },
  { name: "Satisfy Running",   status: "DM sent",             state: "pending" },
  { name: "Adidas Testing",    status: "Registered",          state: "success" },
  { name: "Saucony Lab",       status: "Registered",          state: "success" },
  { name: "Puma Project 3",    status: "Target: post sub-3",  state: "future"  },
  { name: "Asics Frontrunner", status: "Apply Jan 2027",      state: "future"  },
];

// ── Formatters ────────────────────────────────────────────────────────────────
export const fPace = (mps) => {
  if (!mps) return "—";
  const s = 1000 / mps;
  return `${Math.floor(s/60)}:${Math.round(s%60).toString().padStart(2,"0")}`;
};

export const fTime = (secs) => {
  if (!secs) return "—";
  const h = Math.floor(secs/3600);
  const m = Math.floor((secs%3600)/60);
  const s = secs % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2,"0")}:${s.toString().padStart(2,"0")}`;
  return `${m}:${s.toString().padStart(2,"0")}`;
};

export const fDist = (m) => (m/1000).toFixed(2);
export const fDistShort = (m) => (m/1000).toFixed(1);

export const actType = (a) => {
  const n = (a.name||"").toLowerCase();
  const wt = a.workout_type || 0;
  if (a.type !== "Run") return a.type;
  if (wt === 3) return "Race";
  if (wt === 2) return "Long Run";
  if (wt === 1) return "Interval";
  if (n.match(/\d\s*[x×]\s*\d/) || n.includes("interval") || n.includes("rep")) return "Interval";
  if (n.includes("tempo") || n.includes("threshold")) return "Tempo";
  if (n.includes("easy") || n.includes("recov") || n.includes("cd") || n.includes("cool") || n.includes("jog")) return "Easy";
  if (n.includes("long")) return "Long Run";
  return "Run";
};

export const typeCol = (t) => ({
  Interval: "#e879f9", Tempo: "#fb923c", Race: "#a78bfa",
  "Long Run": "#60a5fa", Easy: "#34d399", Run: "#34d399",
}[t] || "#34d399");

export const recCol = (s) => !s ? "#374151" : s >= 67 ? "#34d399" : s >= 34 ? "#fb923c" : "#f87171";

export const weeklyVol = (activities) => {
  const runs = activities.filter(a => a.type === "Run" || a.sport_type === "Run");
  const w = {};
  runs.forEach(r => {
    const d = new Date(r.start_date_local);
    const mon = new Date(d);
    mon.setDate(d.getDate() - ((d.getDay()+6)%7));
    const k = mon.toLocaleDateString("en-GB", { day:"numeric", month:"short" });
    w[k] = (w[k]||0) + r.distance/1000;
  });
  return Object.entries(w).slice(-12).map(([week,km]) => ({ week, km: parseFloat(km.toFixed(1)) }));
};
