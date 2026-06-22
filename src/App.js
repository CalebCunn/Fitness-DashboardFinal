import { useState, useEffect, useRef, useCallback } from "react";
import { AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { isConnected, disconnect, exchangeCode, getAthlete, getStats, getActivities, getActivity, getStreams, getAllGear, extractBestEfforts } from "./strava";
import { isWhoopConnected, disconnectWhoop, exchangeWhoopCode, getWhoopAuthUrl, getWhoopData } from "./whoop";
import { loadChatHistory, saveChatHistory, loadTrainingPlan, saveTrainingPlan, loadUserPrefs, saveUserPrefs } from "./supabase";
import { LIFTS as DEFAULT_LIFTS, RACES as DEFAULT_RACES, SPONSORSHIP as DEFAULT_SPONSORSHIP, fPace, fTime, fDist, actType, typeCol, recCol, weeklyVol } from "./data";

// Weather code to description
const WX_DESC = {
  0:"Clear",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Foggy",48:"Icy fog",
  51:"Light drizzle",53:"Drizzle",55:"Heavy drizzle",61:"Light rain",63:"Rain",65:"Heavy rain",
  71:"Light snow",73:"Snow",75:"Heavy snow",80:"Rain showers",81:"Showers",82:"Heavy showers",
  95:"Thunderstorm",96:"Thunderstorm with hail",
};
const WX_EMOJI = {
  0:"☀️",1:"🌤",2:"⛅",3:"☁️",45:"🌫",48:"🌫",51:"🌦",53:"🌧",55:"🌧",
  61:"🌧",63:"🌧",65:"🌧",71:"❄️",73:"❄️",75:"❄️",80:"🌦",81:"🌦",82:"⛈",95:"⛈",96:"⛈",
};

async function fetchWeather(lat, lng, dateStr) {
  try {
    const res = await fetch(`/.netlify/functions/weather?lat=${lat}&lng=${lng}&date=${dateStr}`);
    const data = await res.json();
    if (!data.hourly) return null;
    const hour = 9; // use 9am as default
    return {
      temp: Math.round(data.hourly.temperature_2m[hour]),
      code: data.hourly.weathercode[hour],
    };
  } catch { return null; }
}

function calcStreaks(activities) {
  const runs = activities.filter(a => a.type==="Run"||a.sport_type==="Run");
  const dates = [...new Set(runs.map(r => new Date(r.start_date_local).toISOString().split("T")[0]))].sort();
  if (!dates.length) return { current: 0, longest: 0 };
  let current = 1, longest = 1, temp = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = (new Date(dates[i]) - new Date(dates[i-1])) / 86400000;
    if (diff === 1) { temp++; longest = Math.max(longest, temp); }
    else { temp = 1; }
  }
  const lastDate = new Date(dates[dates.length-1]);
  const today = new Date();
  today.setHours(0,0,0,0);
  const diffToday = (today - lastDate) / 86400000;
  current = diffToday <= 1 ? temp : 0;
  return { current, longest };
}

function predictRaces(activities, vo2max=67) {
  const runs = activities.filter(a => a.type==="Run"&&a.average_speed&&a.distance>2000).slice(0,10);
  if (!runs.length) return null;
  const avgMps = runs.reduce((s,r)=>s+r.average_speed,0)/runs.length;
  const vdot = vo2max;
  const preds = [
    { dist:"5K",  secs: Math.round(5000/avgMps * 0.85) },
    { dist:"10K", secs: Math.round(10000/avgMps * 0.87) },
    { dist:"HM",  secs: Math.round(21097/avgMps * 0.90) },
    { dist:"Mar", secs: Math.round(42195/avgMps * 0.93) },
  ];
  return preds.map(p => ({ ...p, time: fTime(p.secs), pace: fPace(p.secs>0?p.dist==="5K"?5000/p.secs:p.dist==="10K"?10000/p.secs:p.dist==="HM"?21097/p.secs:42195/p.secs:0) }));
}

// Apple-inspired light design system
// Inject Inter font
if (!document.getElementById("inter-font")) {
  const link = document.createElement("link");
  link.id = "inter-font";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap";
  document.head.appendChild(link);
}

const C = {
  bg:       "#f5f5f7",
  surface:  "#ffffff",
  card:     "#ffffff",
  border:   "#e5e5e7",
  divider:  "#f0f0f2",
  orange:   "#f97316",
  orangeL:  "#fff7ed",
  orangeB:  "#fed7aa",
  blue:     "#0071e3",
  blueL:    "#eff6ff",
  green:    "#34c759",
  greenL:   "#f0fdf4",
  red:      "#ff3b30",
  yellow:   "#ff9500",
  purple:   "#af52de",
  text:     "#1d1d1f",
  sub:      "#6e6e73",
  muted:    "#aeaeb2",
  mono:     "'SF Mono','JetBrains Mono',monospace",
  sans:     "'Inter',-apple-system,BlinkMacSystemFont,sans-serif",
};

// ─── UI PRIMITIVES ────────────────────────────────────────────────────────────
const Card = ({ children, style={} }) => (
  <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:20, boxShadow:"0 1px 3px rgba(0,0,0,0.06)", ...style }}>
    {children}
  </div>
);

const SectionTitle = ({ children, action, color=C.text }) => (
  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
    <span style={{ fontSize:13, fontWeight:700, color, letterSpacing:"-0.01em", fontFamily:C.sans }}>{children}</span>
    {action}
  </div>
);

const StatTile = ({ label, value, sub, color=C.orange, bg, size="md" }) => {
  const fs = { sm:15, md:22, lg:30, xl:38 }[size]||22;
  return (
    <div style={{ background:bg||C.bg, borderRadius:12, padding:"14px 16px", flex:1, minWidth:0 }}>
      <div style={{ fontSize:10, fontWeight:600, color:C.sub, letterSpacing:"0.04em", textTransform:"uppercase", marginBottom:6, fontFamily:C.sans }}>{label}</div>
      <div style={{ fontFamily:C.mono, fontSize:fs, fontWeight:700, color, lineHeight:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:C.muted, marginTop:4, fontFamily:C.sans }}>{sub}</div>}
    </div>
  );
};

const Tag = ({ children, color=C.orange }) => (
  <span style={{ fontSize:10, fontWeight:600, color, background:`${color}18`, borderRadius:6, padding:"3px 8px", letterSpacing:"0.03em", whiteSpace:"nowrap", fontFamily:C.sans }}>{children}</span>
);

const PillBtn = ({ children, onClick, color=C.orange, outline, sm, full, style={} }) => (
  <button onClick={onClick} style={{ background:outline?"transparent":color, color:outline?color:"#fff", border:`1.5px solid ${color}`, borderRadius:20, padding:sm?"6px 14px":"10px 20px", fontSize:sm?12:14, fontWeight:600, width:full?"100%":"auto", cursor:"pointer", fontFamily:C.sans, ...style }}>{children}</button>
);

const EditBtn = ({ editing, onToggle }) => (
  <button onClick={onToggle} style={{ background:editing?C.orange:"transparent", color:editing?"#fff":C.sub, border:`1.5px solid ${editing?C.orange:C.border}`, borderRadius:20, padding:"4px 12px", fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:C.sans }}>
    {editing ? "Save" : "Edit"}
  </button>
);

const TxtInput = ({ value, onChange, style={}, placeholder="" }) => (
  <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
    style={{ background:C.bg, border:`1.5px solid ${C.border}`, borderRadius:8, padding:"6px 10px", color:C.text, fontSize:12, outline:"none", fontFamily:C.sans, width:"100%", ...style }} />
);

const Loader = ({ text="Loading..." }) => (
  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flex:1, gap:14 }}>
    <div style={{ width:28, height:28, border:`2px solid ${C.border}`, borderTop:`2px solid ${C.orange}`, borderRadius:"50%", animation:"spin .8s linear infinite" }} />
    <div style={{ fontSize:13, color:C.sub, fontFamily:C.sans }}>{text}</div>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);

const CT = ({ active, payload, label }) => {
  if (!active||!payload?.length) return null;
  return (
    <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:10, padding:"8px 12px", fontSize:12, boxShadow:"0 4px 12px rgba(0,0,0,0.1)", fontFamily:C.sans }}>
      <div style={{ color:C.sub, marginBottom:4, fontSize:11 }}>{label}</div>
      {payload.map((p,i) => <div key={i} style={{ color:p.color||C.orange, fontWeight:600 }}>{p.name}: {p.value}</div>)}
    </div>
  );
};

const BackBtn = ({ onClick }) => (
  <button onClick={onClick} style={{ background:"transparent", border:"none", color:C.orange, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:C.sans, display:"inline-flex", alignItems:"center", gap:4, marginBottom:16, padding:0 }}>
    ← Back
  </button>
);

// ─── CONNECT SCREEN ──────────────────────────────────────────────────────────
function ConnectScreen({ whoopPending }) {
  const clientId = process.env.REACT_APP_STRAVA_CLIENT_ID;
  const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(window.location.origin)}&response_type=code&scope=read,activity:read_all`;
  if (whoopPending) return (
    <div style={{ height:"100%", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center" }}><div style={{ fontSize:40, marginBottom:12 }}>⌚</div><div style={{ fontSize:17, fontWeight:600, color:C.text, fontFamily:C.sans }}>Connecting Whoop...</div></div>
    </div>
  );
  return (
    <div style={{ height:"100%", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ textAlign:"center", maxWidth:340 }}>
        <div style={{ fontSize:13, fontWeight:600, color:C.orange, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:16, fontFamily:C.sans }}>Fitness Dashboard</div>
        <div style={{ fontSize:32, fontWeight:800, color:C.text, marginBottom:8, letterSpacing:"-0.03em", fontFamily:C.sans }}>Caleb Cunningham</div>
        <div style={{ fontSize:15, color:C.sub, marginBottom:36, lineHeight:1.6, fontFamily:C.sans }}>Connect Strava to load your live training data.</div>
        <a href={url} style={{ display:"inline-block", background:"#fc4c02", color:"#fff", borderRadius:24, padding:"14px 32px", fontSize:15, fontWeight:700, textDecoration:"none", fontFamily:C.sans }}>Connect with Strava</a>
        <div style={{ fontSize:11, color:C.muted, marginTop:12, fontFamily:C.sans }}>Read-only · Your data stays private</div>
      </div>
    </div>
  );
}

// ─── ACTIVITY DETAIL ─────────────────────────────────────────────────────────
function ActivityDetail({ id, onBack }) {
  const [act, setAct] = useState(null);
  const [streams, setStreams] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getActivity(id), getStreams(id)])
      .then(([a,s]) => { setAct(a); setStreams(s); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ flex:1, display:"flex" }}><Loader text="Loading activity..." /></div>;
  if (!act) return <div style={{ padding:20, color:C.sub, fontSize:14, fontFamily:C.sans }}>Could not load.</div>;

  const type = actType(act);
  const color = typeCol(type);
  const laps = act.laps || [];
  const hr = streams?.heartrate?.data || [];
  const time = streams?.time?.data || [];
  const hrChart = hr.filter((_,i) => i%15===0).map((v,i) => ({ t:Math.round((time[i*15]||i*15)/60), hr:v }));

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12, paddingBottom:20 }}>
      <BackBtn onClick={onBack} />
      <Card>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:10 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:20, fontWeight:800, color:C.text, marginBottom:4, letterSpacing:"-0.02em", fontFamily:C.sans }}>{act.name}</div>
            <div style={{ fontSize:12, color:C.sub, marginBottom:10, fontFamily:C.sans }}>{new Date(act.start_date_local).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}{act.gear?.name?` · ${act.gear.name}`:""}</div>
            <Tag color={color}>{type}</Tag>
          </div>
          {act.suffer_score && <div style={{ textAlign:"right" }}><div style={{ fontSize:10, color:C.muted, textTransform:"uppercase", letterSpacing:"0.04em", fontFamily:C.sans }}>Suffer</div><div style={{ fontFamily:C.mono, fontSize:28, fontWeight:700, color:C.orange }}>{act.suffer_score}</div></div>}
        </div>
      </Card>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
        <StatTile label="Distance" value={`${fDist(act.distance)}km`} />
        <StatTile label="Time" value={fTime(act.moving_time)} />
        <StatTile label="Avg Pace" value={fPace(act.average_speed)+"/km"} />
        {act.average_heartrate && <StatTile label="Avg HR" value={`${Math.round(act.average_heartrate)}`} sub="bpm" color={C.red} />}
        {act.max_heartrate && <StatTile label="Max HR" value={`${act.max_heartrate}`} sub="bpm" color={C.red} />}
        {act.average_watts && <StatTile label="Power" value={`${Math.round(act.average_watts)}`} sub="W avg" color={C.purple} />}
        {act.average_cadence && <StatTile label="Cadence" value={`${Math.round(act.average_cadence*2)}`} sub="spm" color={C.blue} />}
        {act.total_elevation_gain>0 && <StatTile label="Elevation" value={`${Math.round(act.total_elevation_gain)}m`} color={C.green} />}
      </div>
      {laps.length>1 && (
        <Card>
          <SectionTitle>Splits</SectionTitle>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {laps.map((lap,i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:12, background:C.bg, borderRadius:10, padding:"10px 14px" }}>
                <div style={{ fontSize:11, color:C.muted, minWidth:44, fontWeight:600, fontFamily:C.sans }}>Lap {i+1}</div>
                <div style={{ fontFamily:C.mono, fontSize:14, fontWeight:600, color:C.orange, flex:1 }}>{fPace(lap.average_speed)}/km</div>
                <div style={{ fontSize:12, color:C.sub, fontFamily:C.sans }}>{(lap.distance/1000).toFixed(2)}km</div>
                {lap.average_heartrate && <div style={{ fontSize:12, color:C.red, fontFamily:C.sans }}>{Math.round(lap.average_heartrate)} bpm</div>}
              </div>
            ))}
          </div>
        </Card>
      )}
      {hrChart.length>5 && (
        <Card>
          <SectionTitle color={C.red}>Heart Rate</SectionTitle>
          <ResponsiveContainer width="100%" height={130}>
            <AreaChart data={hrChart}>
              <defs><linearGradient id="hrg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.red} stopOpacity={0.15}/><stop offset="95%" stopColor={C.red} stopOpacity={0}/></linearGradient></defs>
              <XAxis dataKey="t" tick={{fontSize:10,fill:C.muted,fontFamily:C.sans}} tickLine={false} axisLine={false} unit="m"/>
              <YAxis tick={{fontSize:10,fill:C.muted}} tickLine={false} axisLine={false} domain={["auto","auto"]} width={28}/>
              <Tooltip content={<CT/>}/>
              <Area type="monotone" dataKey="hr" name="HR" stroke={C.red} fill="url(#hrg)" strokeWidth={2} dot={false}/>
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}
      {act.best_efforts?.length>0 && (
        <Card>
          <SectionTitle color={C.orange}>Best Efforts</SectionTitle>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
            {act.best_efforts.slice(0,6).map((b,i) => (
              <div key={i} style={{ background:C.bg, borderRadius:10, padding:"10px 14px" }}>
                <div style={{ fontSize:10, color:C.muted, marginBottom:4, textTransform:"uppercase", letterSpacing:"0.04em", fontFamily:C.sans }}>{b.name}</div>
                <div style={{ fontFamily:C.mono, fontSize:15, fontWeight:700, color:C.orange }}>{fTime(b.moving_time)}</div>
                <div style={{ fontSize:11, color:C.sub, marginTop:2, fontFamily:C.sans }}>{fPace(b.distance/b.moving_time)}/km</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── CONSISTENCY HEATMAP ─────────────────────────────────────────────────────
function ConsistencyHeatmap({ activities }) {
  const runs = activities.filter(a => a.type==="Run"||a.sport_type==="Run");
  const runDates = new Set(runs.map(r => new Date(r.start_date_local).toISOString().split("T")[0]));
  const today = new Date();
  const weeks = [];
  const start = new Date(today);
  start.setDate(today.getDate() - (today.getDay()===0?6:today.getDay()-1));
  start.setDate(start.getDate() - 13*7);
  for (let w=0; w<14; w++) {
    const week = [];
    for (let d=0; d<7; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + w*7 + d);
      const key = date.toISOString().split("T")[0];
      week.push({ date:key, isRun:runDates.has(key), isFuture:date>today });
    }
    weeks.push(week);
  }
  const total = [...runDates].filter(d => new Date(d)>=start && new Date(d)<=today).length;
  return (
    <Card>
      <SectionTitle action={<span style={{ fontSize:12, color:C.sub, fontFamily:C.sans }}>{total} runs in 14 weeks</span>}>Training Consistency</SectionTitle>
      <div style={{ overflowX:"auto" }}>
        <div style={{ display:"flex", gap:3, minWidth:"fit-content" }}>
          {weeks.map((week,wi) => (
            <div key={wi} style={{ display:"flex", flexDirection:"column", gap:3 }}>
              {week.map((day,di) => (
                <div key={di} title={day.date} style={{ width:13, height:13, borderRadius:3, background:day.isFuture?C.bg:day.isRun?C.orange:C.divider, opacity:day.isFuture?0.4:1 }} />
              ))}
            </div>
          ))}
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:6, fontSize:10, color:C.muted, fontFamily:C.sans }}>
          <span>{new Date(weeks[0][0].date).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</span>
          <span>Today</span>
        </div>
      </div>
    </Card>
  );
}

// ─── MONTHLY SUMMARY ─────────────────────────────────────────────────────────
function MonthlySummary({ activities }) {
  const months = {};
  activities.filter(a=>a.type==="Run"||a.sport_type==="Run").forEach(r=>{
    const key=new Date(r.start_date_local).toLocaleDateString("en-GB",{month:"short",year:"2-digit"});
    if(!months[key])months[key]={km:0,runs:0};
    months[key].km+=r.distance/1000;
    months[key].runs+=1;
  });
  const data=Object.entries(months).slice(-6).map(([month,v])=>({month,km:parseFloat(v.km.toFixed(1)),runs:v.runs}));
  const thisMonth = data[data.length-1];
  return (
    <Card>
      <SectionTitle>Monthly Volume</SectionTitle>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={data}>
          <XAxis dataKey="month" tick={{fontSize:10,fill:C.sub,fontFamily:C.sans}} tickLine={false} axisLine={false}/>
          <YAxis tick={{fontSize:10,fill:C.muted}} tickLine={false} axisLine={false} unit="k" width={26}/>
          <Tooltip content={<CT/>}/>
          <Bar dataKey="km" name="km" fill={C.orange} radius={[4,4,0,0]}/>
        </BarChart>
      </ResponsiveContainer>
      {thisMonth && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10, marginTop:12 }}>
          <div style={{ background:C.orangeL, borderRadius:10, padding:"10px 14px", textAlign:"center" }}>
            <div style={{ fontSize:10, color:C.orange, textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:4, fontFamily:C.sans }}>This Month</div>
            <div style={{ fontFamily:C.mono, fontSize:20, fontWeight:700, color:C.orange }}>{thisMonth.km}km</div>
          </div>
          <div style={{ background:C.bg, borderRadius:10, padding:"10px 14px", textAlign:"center" }}>
            <div style={{ fontSize:10, color:C.sub, textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:4, fontFamily:C.sans }}>Runs</div>
            <div style={{ fontFamily:C.mono, fontSize:20, fontWeight:700, color:C.text }}>{thisMonth.runs}</div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── HR ZONES ────────────────────────────────────────────────────────────────
function HRZones({ activities }) {
  const MAX_HR = 208;
  const zones = [
    { name:"Z1 Recovery", min:0,   max:0.6, color:"#3b82f6" },
    { name:"Z2 Aerobic",  min:0.6, max:0.7, color:"#10b981" },
    { name:"Z3 Tempo",    min:0.7, max:0.8, color:"#f59e0b" },
    { name:"Z4 Threshold",min:0.8, max:0.9, color:"#f97316" },
    { name:"Z5 Max",      min:0.9, max:1.0, color:"#ef4444" },
  ];
  const runs = activities.filter(a=>(a.type==="Run"||a.sport_type==="Run")&&a.average_heartrate).slice(0,20);
  if (!runs.length) return null;
  const zoneCounts = zones.map(z=>{
    const count=runs.filter(r=>{const p=r.average_heartrate/MAX_HR;return p>=z.min&&p<z.max;}).length;
    return {...z,count,pct:Math.round(count/runs.length*100)};
  });
  return (
    <Card>
      <SectionTitle>HR Zone Distribution</SectionTitle>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {zoneCounts.map((z,i)=>(
          <div key={i} style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ fontSize:11, color:C.sub, minWidth:90, fontFamily:C.sans }}>{z.name}</div>
            <div style={{ flex:1, height:8, background:C.bg, borderRadius:4 }}>
              <div style={{ width:`${z.pct}%`, height:"100%", background:z.color, borderRadius:4 }}/>
            </div>
            <div style={{ fontSize:11, color:z.color, fontFamily:C.mono, minWidth:28, textAlign:"right", fontWeight:600 }}>{z.pct}%</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── GOALS ───────────────────────────────────────────────────────────────────
function GoalsTracker({ activities, userPrefs, onSavePrefs }) {
  const [editing, setEditing] = useState(false);
  const defaultGoals = [
    { id:1, name:"Berlin Sub 3:20",     target:200, current:159, unit:"min", pct:20 },
    { id:2, name:"Run 200km in July",   target:200, current:0,   unit:"km",  pct:0  },
    { id:3, name:"Reach 65kg",          target:65,  current:60,  unit:"kg",  pct:75 },
    { id:4, name:"Sub 18 min 5K",       target:18,  current:18.7,unit:"min", pct:60 },
  ];
  const goals = userPrefs?.goals || defaultGoals;
  const [editGoals, setEditGoals] = useState(goals);
  const julyKm = activities.filter(a=>{const d=new Date(a.start_date_local);return d.getMonth()===6&&d.getFullYear()===2026&&(a.type==="Run"||a.sport_type==="Run");}).reduce((s,r)=>s+r.distance/1000,0);
  const save = () => { onSavePrefs({...userPrefs,goals:editGoals}); setEditing(false); };
  return (
    <Card>
      <SectionTitle action={<EditBtn editing={editing} onToggle={()=>{if(editing)save();else{setEditGoals(goals);setEditing(true);}}}/>}>Goals</SectionTitle>
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {(editing?editGoals:goals).map((g,i)=>{
          const current = g.name.includes("July") ? julyKm : parseFloat(g.current)||0;
          const pct = Math.min(100,Math.round(current/parseFloat(g.target)*100))||g.pct||0;
          const col = pct>=100?C.green:pct>=60?C.orange:C.yellow;
          return editing ? (
            <div key={g.id||i} style={{ background:C.bg, borderRadius:12, padding:"12px 14px", display:"flex", flexDirection:"column", gap:8 }}>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <TxtInput value={g.name} onChange={v=>setEditGoals(p=>p.map((x,j)=>j===i?{...x,name:v}:x))} style={{ flex:1 }}/>
                <button onClick={()=>setEditGoals(p=>p.filter((_,j)=>j!==i))} style={{ background:"transparent", border:"none", color:C.red, cursor:"pointer", fontSize:18 }}>×</button>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <TxtInput value={String(g.target)} onChange={v=>setEditGoals(p=>p.map((x,j)=>j===i?{...x,target:v}:x))} style={{ width:80 }} placeholder="Target"/>
                <TxtInput value={String(g.current)} onChange={v=>setEditGoals(p=>p.map((x,j)=>j===i?{...x,current:v,pct:Math.min(100,Math.round(parseFloat(v)/parseFloat(g.target)*100))||0}:x))} style={{ width:80 }} placeholder="Current"/>
                <TxtInput value={g.unit} onChange={v=>setEditGoals(p=>p.map((x,j)=>j===i?{...x,unit:v}:x))} style={{ width:50 }} placeholder="Unit"/>
              </div>
            </div>
          ) : (
            <div key={g.id||i} style={{ background:C.bg, borderRadius:12, padding:"12px 16px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <div style={{ fontSize:13, fontWeight:600, color:C.text, fontFamily:C.sans }}>{g.name}</div>
                <div style={{ fontSize:12, color:col, fontFamily:C.mono, fontWeight:700 }}>{pct}%</div>
              </div>
              <div style={{ height:6, background:C.divider, borderRadius:3, marginBottom:6 }}>
                <div style={{ width:`${pct}%`, height:"100%", background:col, borderRadius:3 }}/>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:C.muted, fontFamily:C.sans }}>
                <span>{g.name.includes("July")?`${julyKm.toFixed(1)}km`:g.current} {g.unit}</span>
                <span>Target: {g.target} {g.unit}</span>
              </div>
            </div>
          );
        })}
        {editing && <button onClick={()=>setEditGoals(p=>[...p,{id:Date.now(),name:"New Goal",target:100,current:0,unit:"km",pct:0}])} style={{ background:"transparent", border:`1.5px dashed ${C.border}`, borderRadius:12, padding:"10px", color:C.sub, cursor:"pointer", fontSize:13, fontFamily:C.sans }}>+ Add goal</button>}
      </div>
    </Card>
  );
}


// ─── RUN STREAK ───────────────────────────────────────────────────────────────
function getRunStreak(activities) {
  const runs = activities.filter(a => a.type==="Run"||a.sport_type==="Run");
  const dates = [...new Set(runs.map(r => new Date(r.start_date_local).toISOString().split("T")[0]))].sort().reverse();
  if (!dates.length) return { current: 0, longest: 0 };

  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now()-86400000).toISOString().split("T")[0];

  let current = 0;
  if (dates[0] === today || dates[0] === yesterday) {
    let check = new Date(dates[0]);
    for (const d of dates) {
      if (d === check.toISOString().split("T")[0]) { current++; check.setDate(check.getDate()-1); }
      else break;
    }
  }

  let longest = 0, streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = (new Date(dates[i-1]) - new Date(dates[i])) / 86400000;
    if (diff === 1) { streak++; longest = Math.max(longest, streak); }
    else streak = 1;
  }
  longest = Math.max(longest, current);
  return { current, longest };
}


// ─── RACE PREDICTOR ──────────────────────────────────────────────────────────
function RacePredictor({ activities }) {
  const runs = activities.filter(a => (a.type==="Run"||a.sport_type==="Run") && a.distance > 3000 && a.average_speed).slice(0,10);
  if (runs.length < 3) return null;

  const avgSpeed = runs.reduce((s,r) => s+r.average_speed,0)/runs.length;
  const avgHR = runs.filter(r=>r.average_heartrate).reduce((s,r,i,a)=>s+r.average_heartrate/a.length,0);
  const maxHR = 208;
  const hrReserve = maxHR - 50;
  const hrFactor = avgHR ? Math.max(0.7, Math.min(1.1, 1 - ((avgHR/maxHR) - 0.75)*2)) : 1;

  const predictions = [
    { dist: "5K",      m: 5000  },
    { dist: "10K",     m: 10000 },
    { dist: "Half",    m: 21097 },
    { dist: "Full",    m: 42195 },
  ].map(r => {
    const fatigueFactor = 1 + (r.m / 42195) * 0.08;
    const secs = Math.round((r.m / (avgSpeed * hrFactor / fatigueFactor)));
    return { ...r, time: secs };
  });

  return (
    <Card>
      <SectionTitle>Race Predictor</SectionTitle>
      <div style={{ fontSize:11, color:C.sub, marginBottom:14, fontFamily:C.sans }}>Based on your last {runs.length} runs. Estimates only.</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
        {predictions.map(p => (
          <div key={p.dist} style={{ background:C.bg, borderRadius:12, padding:"12px 14px" }}>
            <div style={{ fontSize:10, color:C.muted, textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:5, fontFamily:C.sans }}>{p.dist}</div>
            <div style={{ fontFamily:C.mono, fontSize:17, fontWeight:700, color:C.orange }}>{fTime(p.time)}</div>
            <div style={{ fontSize:11, color:C.sub, marginTop:2, fontFamily:C.sans }}>{fPace(p.m/p.time)}/km</div>
          </div>
        ))}
      </div>
    </Card>
  );
}


// ─── NUTRITION ────────────────────────────────────────────────────────────────
function Nutrition({ userPrefs, onSavePrefs }) {
  const today = new Date().toISOString().split("T")[0];
  const log = userPrefs?.nutrition || {};
  const todayLog = log[today] || { kcal: "", carbs: "", protein: "", notes: "" };
  const [entry, setEntry] = useState(todayLog);
  const [saved, setSaved] = useState(false);

  const targets = { kcal: 3000, carbs: 300, protein: 140 };

  const save = () => {
    const updated = { ...log, [today]: entry };
    onSavePrefs({ ...userPrefs, nutrition: updated });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const recent = Object.entries(log).sort(([a],[b]) => b.localeCompare(a)).slice(0,7);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14, paddingBottom:20 }}>
      <Card>
        <SectionTitle>Today's Nutrition</SectionTitle>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:14 }}>
          {[
            { key:"kcal", label:"Calories", target:targets.kcal, unit:"kcal", color:C.orange },
            { key:"carbs", label:"Carbs", target:targets.carbs, unit:"g", color:C.blue },
            { key:"protein", label:"Protein", target:targets.protein, unit:"g", color:C.red },
          ].map(f => {
            const val = parseFloat(entry[f.key])||0;
            const pct = Math.min(100, Math.round(val/f.target*100));
            return (
              <div key={f.key} style={{ background:C.bg, borderRadius:12, padding:"12px 14px" }}>
                <div style={{ fontSize:10, color:C.muted, textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:6, fontFamily:C.sans }}>{f.label}</div>
                <input
                  type="number"
                  value={entry[f.key]}
                  onChange={e => setEntry(prev => ({...prev, [f.key]: e.target.value}))}
                  placeholder={String(f.target)}
                  style={{ width:"100%", background:"transparent", border:"none", borderBottom:`2px solid ${f.color}`, padding:"2px 0", fontSize:18, fontWeight:700, color:f.color, fontFamily:C.mono, outline:"none" }}
                />
                <div style={{ fontSize:9, color:C.muted, marginTop:4, fontFamily:C.sans }}>Target: {f.target}{f.unit}</div>
                <div style={{ height:4, background:C.divider, borderRadius:2, marginTop:6 }}>
                  <div style={{ width:`${pct}%`, height:"100%", background:f.color, borderRadius:2 }}/>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginBottom:12 }}>
          <TxtInput value={entry.notes} onChange={v=>setEntry(prev=>({...prev,notes:v}))} placeholder="Notes (e.g. pre-run meal, gel timing)" style={{ width:"100%" }}/>
        </div>
        <PillBtn onClick={save} color={saved?C.green:C.orange} full sm>{saved ? "Saved!" : "Save Today"}</PillBtn>
      </Card>

      <Card>
        <SectionTitle>Daily Targets</SectionTitle>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {[
            { label:"Calories", val:"2,800 to 3,200 kcal/day", color:C.orange },
            { label:"Carbohydrates", val:"250 to 350g/day", color:C.blue },
            { label:"Protein", val:"130 to 150g/day", color:C.red },
            { label:"On long runs", val:"SiS Beta Fuel every 30 mins", color:C.green },
          ].map((t,i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", background:C.bg, borderRadius:10, padding:"10px 14px" }}>
              <span style={{ fontSize:13, color:C.sub, fontFamily:C.sans }}>{t.label}</span>
              <span style={{ fontSize:13, fontWeight:600, color:t.color, fontFamily:C.sans }}>{t.val}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop:12, background:C.bg, borderRadius:12, padding:"12px 16px" }}>
          <div style={{ fontSize:11, fontWeight:600, color:C.sub, textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:8, fontFamily:C.sans }}>Log Today's Weight</div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <input type="number" step="0.1" placeholder="e.g. 60.5"
              style={{ flex:1, background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"7px 10px", color:C.text, fontSize:14, fontFamily:C.mono, fontWeight:700, outline:"none" }}
              onBlur={e=>{
                const w = parseFloat(e.target.value);
                if (!w) return;
                const log = userPrefs?.weightLog || [];
                const today = new Date().toISOString().split("T")[0];
                const updated = [...log.filter(l=>l.date!==today),{date:today,weight:w}].slice(-60);
                onSavePrefs({...userPrefs,weightLog:updated});
                e.target.value = "";
              }}
            />
            <span style={{ fontSize:12, color:C.sub, fontFamily:C.sans }}>kg · target 65kg</span>
          </div>
        </div>
      </Card>

      {recent.length > 0 && (
        <Card>
          <SectionTitle>Recent Log</SectionTitle>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {recent.map(([date, e]) => (
              <div key={date} style={{ background:C.bg, borderRadius:10, padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ fontSize:12, color:C.sub, fontFamily:C.sans }}>{new Date(date).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</div>
                <div style={{ display:"flex", gap:12 }}>
                  {e.kcal && <span style={{ fontSize:12, color:C.orange, fontFamily:C.mono, fontWeight:600 }}>{e.kcal}kcal</span>}
                  {e.protein && <span style={{ fontSize:12, color:C.red, fontFamily:C.sans }}>{e.protein}g P</span>}
                  {e.carbs && <span style={{ fontSize:12, color:C.blue, fontFamily:C.sans }}>{e.carbs}g C</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── OVERVIEW ────────────────────────────────────────────────────────────────
function Overview({ stats, activities, whoopData, whoopOk, onConnectWhoop, bestEfforts, gear, userPrefs, onSavePrefs, onRefreshWhoop }) {
  const vol = weeklyVol(activities);
  const ytd = stats?.ytd_run_totals||{};
  const all = stats?.all_run_totals||{};
  const rec = whoopData?.recoveries?.records?.[0];
  const cyc = whoopData?.cycles?.records?.[0];
  const sleep = whoopData?.sleeps?.records?.[0];

  const paceTrend = vol.map(w=>{
    const wr=activities.filter(a=>{if(a.type!=="Run")return false;const d=new Date(a.start_date_local);const mon=new Date(d);mon.setDate(d.getDate()-((d.getDay()+6)%7));return mon.toLocaleDateString("en-GB",{day:"numeric",month:"short"})===w.week;});
    const avg=wr.length?wr.reduce((s,r)=>s+(r.average_speed||0),0)/wr.length:0;
    return{week:w.week,pace:avg?parseFloat((1000/avg/60).toFixed(2)):null};
  }).filter(w=>w.pace);

  const berlin = new Date("2026-09-28T00:00:00");
  const today = new Date();
  const daysLeft = Math.max(0,Math.ceil((berlin-today)/(1000*60*60*24)));
  const blockStart = new Date("2026-06-22T00:00:00");
  const totalMs = berlin.getTime() - blockStart.getTime();
  const elapsedMs = today.getTime() - blockStart.getTime();
  const progress = Math.min(100,Math.max(0,Math.round((elapsedMs/totalMs)*100)));

  const PBs = [{label:"5K",time:"18:42",pace:"3:44/km"},{label:"10K",time:"40:52",pace:"4:05/km"},{label:"HM",time:"1:32:48",pace:"4:23/km"},{label:"Marathon",time:"3:48:59",pace:"5:25/km"}];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14, paddingBottom:20 }}>

      {/* Hero */}
      <Card>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, fontWeight:600, color:C.orange, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:8, fontFamily:C.sans }}>Fitness Dashboard</div>
            <div style={{ fontSize:24, fontWeight:800, color:C.text, letterSpacing:"-0.03em", marginBottom:4, fontFamily:C.sans }}>Caleb Cunningham</div>
            <div style={{ fontSize:13, color:C.sub, marginBottom:12, fontFamily:C.sans }}>Kingston · Berlin Block 22 Jun 2026</div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              <Tag>Coros Pace 3</Tag>
              <Tag color={C.red}>Whoop 5.0</Tag>
              <Tag color={C.green}>Strava Live</Tag>
              <Tag color={C.purple}>6 Majors</Tag>
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:10, color:C.muted, textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:4, fontFamily:C.sans }}>YTD Distance</div>
            <div style={{ fontFamily:C.mono, fontSize:32, fontWeight:700, color:C.orange, lineHeight:1 }}>
              {ytd.distance?(ytd.distance/1000).toFixed(1):"442.9"}<span style={{ fontSize:14, color:C.muted }}>km</span>
            </div>
            <div style={{ fontSize:11, color:C.muted, marginTop:4, fontFamily:C.sans }}>{ytd.count||57} runs</div>
          </div>
        </div>
      </Card>

      {/* Low recovery alert */}
      {whoopOk && rec && Math.round(rec.score?.recovery_score||0) < 34 && (
        <div style={{ background:"#fff1f2", border:"1.5px solid #fecdd3", borderRadius:14, padding:"12px 16px", display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:18 }}>⚠️</span>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:C.red, fontFamily:C.sans }}>Low recovery today ({Math.round(rec.score?.recovery_score||0)}%)</div>
            <div style={{ fontSize:12, color:"#9f1239", fontFamily:C.sans, marginTop:2 }}>Consider an easy session or rest day. Your body needs it.</div>
          </div>
        </div>
      )}

      {/* Berlin countdown */}
      <Card style={{ background:`linear-gradient(135deg,#fff7ed,#fff)` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10, marginBottom:14 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:600, color:C.orange, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4, fontFamily:C.sans }}>Next Race</div>
            <div style={{ fontSize:18, fontWeight:700, color:C.text, letterSpacing:"-0.02em", fontFamily:C.sans }}>Berlin Marathon</div>
            <div style={{ fontSize:12, color:C.sub, marginTop:3, fontFamily:C.sans }}>28 Sep 2026 · Get Kids Going · Sub 3:20</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontFamily:C.mono, fontSize:34, fontWeight:700, color:C.orange, lineHeight:1 }}>{daysLeft}</div>
            <div style={{ fontSize:11, color:C.sub, marginTop:2, fontFamily:C.sans }}>days to go</div>
          </div>
        </div>
        <div style={{ height:8, background:C.orangeB, borderRadius:4 }}>
          <div style={{ width:`${progress}%`, height:"100%", background:C.orange, borderRadius:4 }}/>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:6, fontSize:11, color:C.sub, fontFamily:C.sans }}>
          <span>Block start</span><span>{progress}% complete</span>
        </div>
      </Card>

      {/* Whoop recovery */}
      {whoopOk && rec ? (
        <Card>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <SectionTitle color={C.red}>Today's Recovery</SectionTitle>
            <button onClick={onRefreshWhoop} style={{ background:"transparent", border:"none", color:C.orange, fontSize:12, cursor:"pointer", fontFamily:C.sans, fontWeight:600 }}>Refresh</button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
            <StatTile label="Recovery" value={`${Math.round(rec.score?.recovery_score||0)}%`} color={recCol(rec.score?.recovery_score)} bg={C.bg} size="lg"/>
            <StatTile label="HRV" value={`${Math.round(rec.score?.hrv_rmssd_milli||0)}`} sub="ms rMSSD" color={C.green} bg={C.bg} size="lg"/>
            <StatTile label="Resting HR" value={`${Math.round(rec.score?.resting_heart_rate||0)}`} sub="bpm" color={C.red} bg={C.bg}/>
            <StatTile label="Strain" value={`${cyc?.score?.strain?.toFixed(1)||"—"}`} color={C.orange} bg={C.bg}/>
          </div>
          {sleep && (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10, marginTop:10 }}>
              <StatTile label="Sleep Score" value={`${Math.round(sleep.score?.sleep_performance_percentage||0)}%`} color={C.blue} bg={C.bg}/>
              <StatTile label="Time in Bed" value={sleep.score?.stage_summary?.total_in_bed_time_milli?`${(sleep.score.stage_summary.total_in_bed_time_milli/3600000).toFixed(1)}h`:"—"} color={C.blue} bg={C.bg}/>
            </div>
          )}
        </Card>
      ) : whoopOk ? (
        <Card style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
          <div style={{ fontSize:13, color:C.sub, fontFamily:C.sans }}>Loading Whoop data...</div>
          <PillBtn onClick={onRefreshWhoop} color={C.orange} sm>Refresh</PillBtn>
        </Card>
      ) : (
        <Card style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
          <div><div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:3, fontFamily:C.sans }}>Connect Whoop</div><div style={{ fontSize:12, color:C.sub, fontFamily:C.sans }}>Unlock recovery, HRV, sleep and strain</div></div>
          <PillBtn onClick={onConnectWhoop} color={C.red} sm>Connect</PillBtn>
        </Card>
      )}

      {/* PBs */}
      <Card>
        <SectionTitle>Personal Bests</SectionTitle>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
          {bestEfforts&&Object.values(bestEfforts).some(Boolean) ? (
            Object.entries(bestEfforts).filter(([,v])=>v).map(([name,effort])=>(
              <div key={name} style={{ background:C.bg, borderRadius:12, padding:"12px 14px" }}>
                <div style={{ fontSize:10, color:C.muted, textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:5, fontFamily:C.sans }}>{name}</div>
                <div style={{ fontFamily:C.mono, fontSize:16, fontWeight:700, color:C.orange }}>{fTime(effort.moving_time)}</div>
                <div style={{ fontSize:11, color:C.sub, marginTop:2, fontFamily:C.sans }}>{fPace(effort.distance/effort.moving_time)}/km</div>
              </div>
            ))
          ) : PBs.map(pb=>(
            <div key={pb.label} style={{ background:C.bg, borderRadius:12, padding:"12px 14px" }}>
              <div style={{ fontSize:10, color:C.muted, textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:5, fontFamily:C.sans }}>{pb.label}</div>
              <div style={{ fontFamily:C.mono, fontSize:16, fontWeight:700, color:C.orange }}>{pb.time}</div>
              <div style={{ fontSize:11, color:C.sub, marginTop:2, fontFamily:C.sans }}>{pb.pace}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Career stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
        <StatTile label="All-Time Dist" value={all.distance?`${(all.distance/1000).toFixed(0)}km`:"1,086km"} sub={`${all.count||161} runs`} bg={C.surface} color={C.text}/>
        <StatTile label="All-Time Time" value={all.moving_time?`${(all.moving_time/3600).toFixed(0)}h`:"97h"} sub="since Jul 2024" bg={C.surface} color={C.text}/>
        <StatTile label="Marathons" value="2" sub="both London" bg={C.surface} color={C.text}/>
        <StatTile label="Raised" value="£5k+" sub="for charity" bg={C.orangeL} color={C.orange}/>
      </div>

      {/* Streak + Race Predictor */}
      {(() => {
        const streaks = calcStreaks(activities);
        const preds = predictRaces(activities);
        return (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
              <StatTile label="Current Streak" value={`${streaks.current}`} sub={streaks.current===1?"day":"days"} color={streaks.current>6?C.green:streaks.current>2?C.orange:C.sub} bg={C.surface}/>
              <StatTile label="Longest Streak" value={`${streaks.longest}`} sub="days" color={C.orange} bg={C.surface}/>
            </div>
            {preds && (
              <Card>
                <SectionTitle>Race Predictions (based on recent training)</SectionTitle>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
                  {preds.map(p => (
                    <div key={p.dist} style={{ background:C.bg, borderRadius:12, padding:"12px 16px" }}>
                      <div style={{ fontSize:10, color:C.muted, textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:5, fontFamily:C.sans }}>{p.dist}</div>
                      <div style={{ fontFamily:C.mono, fontSize:16, fontWeight:700, color:C.orange }}>{p.time}</div>
                      <div style={{ fontSize:11, color:C.sub, marginTop:2, fontFamily:C.sans }}>{p.pace}/km</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize:11, color:C.muted, marginTop:10, fontFamily:C.sans }}>Based on your last 10 runs. Race day performance typically exceeds training averages.</div>
              </Card>
            )}
          </>
        );
      })()}

      {/* Weight trend */}
      {userPrefs?.weightLog && userPrefs.weightLog.length > 1 && (() => {
        const log = userPrefs.weightLog.slice(-14);
        return (
          <Card>
            <SectionTitle>Weight Trend</SectionTitle>
            <ResponsiveContainer width="100%" height={110}>
              <LineChart data={log}>
                <XAxis dataKey="date" tick={{fontSize:9,fill:C.sub,fontFamily:C.sans}} tickLine={false} axisLine={false} interval={2}/>
                <YAxis tick={{fontSize:9,fill:C.muted}} tickLine={false} axisLine={false} width={30} domain={["auto","auto"]} unit="kg"/>
                <Tooltip content={<CT/>}/>
                <Line type="monotone" dataKey="weight" name="kg" stroke={C.orange} strokeWidth={2} dot={{fill:C.orange,r:3}} connectNulls/>
              </LineChart>
            </ResponsiveContainer>
            <div style={{ display:"flex", justifyContent:"space-between", marginTop:8, fontSize:11, color:C.sub, fontFamily:C.sans }}>
              <span>Current: {log[log.length-1]?.weight}kg</span>
              <span>Target: 65kg</span>
            </div>
          </Card>
        );
      })()}

      {/* Fundraising tracker */}
      <Card>
        <SectionTitle>Fundraising</SectionTitle>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {[
            { race:"London 2024", charity:"DFSG", raised:2500, target:2500, done:true },
            { race:"London 2026", charity:"DFSG", raised:2500, target:2500, done:true },
            { race:"Berlin 2026", charity:"Get Kids Going", raised:0, target:2000, done:false },
          ].map((f,i)=>(
            <div key={i} style={{ background:C.bg, borderRadius:12, padding:"12px 16px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:C.text, fontFamily:C.sans }}>{f.race}</div>
                  <div style={{ fontSize:11, color:C.sub, fontFamily:C.sans }}>{f.charity}</div>
                </div>
                <div style={{ fontFamily:C.mono, fontSize:14, fontWeight:700, color:f.done?C.green:C.orange }}>£{f.raised.toLocaleString()}</div>
              </div>
              <div style={{ height:5, background:C.divider, borderRadius:3 }}>
                <div style={{ width:`${Math.min(100,Math.round(f.raised/f.target*100))}%`, height:"100%", background:f.done?C.green:C.orange, borderRadius:3 }}/>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:C.muted, marginTop:4, fontFamily:C.sans }}>
                <span>{Math.round(f.raised/f.target*100)}% of £{f.target.toLocaleString()} target</span>
                {f.done&&<span style={{ color:C.green, fontWeight:600 }}>✓ Complete</span>}
              </div>
            </div>
          ))}
          <div style={{ background:C.orangeL, borderRadius:12, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ fontSize:13, fontWeight:700, color:C.orange, fontFamily:C.sans }}>Total Raised</div>
            <div style={{ fontFamily:C.mono, fontSize:18, fontWeight:800, color:C.orange }}>£5,000+</div>
          </div>
        </div>
      </Card>

      <GoalsTracker activities={activities} userPrefs={userPrefs} onSavePrefs={onSavePrefs}/>
      <ConsistencyHeatmap activities={activities}/>
      <MonthlySummary activities={activities}/>

      {/* Pace trend */}
      {paceTrend.length>2 && (
        <Card>
          <SectionTitle>Pace Trend (min/km — lower is faster)</SectionTitle>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={paceTrend}>
              <XAxis dataKey="week" tick={{fontSize:10,fill:C.sub,fontFamily:C.sans}} tickLine={false} axisLine={false} interval={2}/>
              <YAxis tick={{fontSize:10,fill:C.muted}} tickLine={false} axisLine={false} width={28} reversed domain={["auto","auto"]}/>
              <Tooltip content={<CT/>}/>
              <Line type="monotone" dataKey="pace" name="min/km" stroke={C.orange} strokeWidth={2.5} dot={{fill:C.orange,r:3}} connectNulls/>
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      <HRZones activities={activities}/>
    </div>
  );
}

// ─── RUN CARD WITH WEATHER ───────────────────────────────────────────────────
function RunCard({ run: r, type: t, color: col, onSelect }) {
  const [weather, setWeather] = useState(null);
  useEffect(() => {
    if (!r.start_latlng?.[0]) return;
    const dateStr = new Date(r.start_date_local).toISOString().split("T")[0];
    fetchWeather(r.start_latlng[0], r.start_latlng[1], dateStr).then(w => {
      if (w) setWeather(w);
    });
  }, [r.id]);

  return (
    <button onClick={onSelect} style={{ background:C.bg, border:"none", borderRadius:12, padding:"12px 16px", display:"flex", alignItems:"center", gap:12, textAlign:"left", width:"100%", cursor:"pointer" }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
          <span style={{ fontSize:14, fontWeight:600, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:160, fontFamily:C.sans }}>{r.name}</span>
          <Tag color={col}>{t}</Tag>
          {weather && <span style={{ fontSize:11, color:C.sub }}>{WX_EMOJI[weather.code]||""} {weather.temp}°C</span>}
        </div>
        <div style={{ fontSize:11, color:C.sub, fontFamily:C.sans }}>{new Date(r.start_date_local).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}{r.gear?.name?` · ${r.gear.name}`:""}</div>
      </div>
      <div style={{ textAlign:"right", flexShrink:0 }}>
        <div style={{ fontFamily:C.mono, fontSize:14, fontWeight:700, color:C.orange }}>{fDist(r.distance)}km</div>
        <div style={{ fontSize:11, color:C.sub, marginTop:2, fontFamily:C.sans }}>{fPace(r.average_speed)}/km</div>
      </div>
      <div style={{ color:C.muted, fontSize:16 }}>›</div>
    </button>
  );
}

// ─── RUNNING ─────────────────────────────────────────────────────────────────
function Running({ activities, stats, gear }) {
  const [sel, setSel] = useState(null);
  const runs = activities.filter(a=>a.type==="Run"||a.sport_type==="Run");
  const vol = weeklyVol(activities);
  const ytd = stats?.ytd_run_totals||{};
  if (sel) return <ActivityDetail id={sel} onBack={()=>setSel(null)}/>;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14, paddingBottom:20 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
        <StatTile label="YTD Distance" value={ytd.distance?`${(ytd.distance/1000).toFixed(1)}km`:"442.9km"} sub={`${ytd.count||57} runs`} bg={C.surface} color={C.orange}/>
        <StatTile label="YTD Time" value={ytd.moving_time?`${(ytd.moving_time/3600).toFixed(1)}h`:"36.3h"} bg={C.surface} color={C.text}/>
        <StatTile label="All-Time" value={stats?.all_run_totals?.distance?`${(stats.all_run_totals.distance/1000).toFixed(0)}km`:"1,086km"} bg={C.surface} color={C.text}/>
        <StatTile label="Elevation" value={ytd.elevation_gain?`${ytd.elevation_gain}m`:"827m"} bg={C.surface} color={C.text}/>
      </div>
      <ConsistencyHeatmap activities={activities}/>
      <MonthlySummary activities={activities}/>
      <Card>
        <SectionTitle>Weekly Volume</SectionTitle>
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={vol}>
            <XAxis dataKey="week" tick={{fontSize:10,fill:C.sub,fontFamily:C.sans}} tickLine={false} axisLine={false} interval={2}/>
            <YAxis tick={{fontSize:10,fill:C.muted}} tickLine={false} axisLine={false} unit="k" width={26}/>
            <Tooltip content={<CT/>}/>
            <Bar dataKey="km" name="km" fill={C.orange} radius={[4,4,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <HRZones activities={activities}/>
      <Card>
        <SectionTitle>Recent Runs</SectionTitle>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {runs.slice(0,25).map(r=>{
            const t=actType(r);const col=typeCol(t);
            return (
              <RunCard key={r.id} run={r} type={t} color={col} onSelect={()=>setSel(r.id)}/>
            );
          })}
        </div>
      </Card>
      {gear&&gear.length>0 && (
        <Card>
          <SectionTitle>Shoe Mileage</SectionTitle>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {gear.map((s,i)=>{
              const km=(s.distance||0)/1000;
              const pct=Math.min(100,Math.round(km/800*100));
              return (
                <div key={i} style={{ background:C.bg, borderRadius:12, padding:"12px 16px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                    <div><div style={{ fontSize:13, fontWeight:600, color:C.text, fontFamily:C.sans }}>{s.name}</div><div style={{ fontSize:11, color:C.muted, marginTop:2, fontFamily:C.sans }}>{s.brand_name||""}</div></div>
                    <div style={{ fontFamily:C.mono, fontSize:13, fontWeight:700, color:C.orange }}>{km.toFixed(0)}km</div>
                  </div>
                  <div style={{ height:6, background:C.divider, borderRadius:3 }}>
                    <div style={{ width:`${pct}%`, height:"100%", background:pct>80?C.red:pct>50?C.yellow:C.green, borderRadius:3 }}/>
                  </div>
                  <div style={{ fontSize:10, color:C.muted, marginTop:4, fontFamily:C.sans }}>{pct}% of 800km life</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── GYM ─────────────────────────────────────────────────────────────────────
function Gym({ activities, userPrefs, onSavePrefs, savedWorkout, externalWorkout }) {
  const [editing, setEditing] = useState(false);
  const [generatedWorkout, setGeneratedWorkout] = useState(savedWorkout || externalWorkout || null);
  const lifts = userPrefs?.lifts||DEFAULT_LIFTS;

  // Accept external workout from chat
  useEffect(() => { if (externalWorkout) setGeneratedWorkout(externalWorkout); }, [externalWorkout]);
  const [editLifts, setEditLifts] = useState(lifts);
  const [workout, setWorkout] = useState(null);
  const sessions = activities.filter(a=>a.type==="WeightTraining"||(a.name||"").toLowerCase().includes("gym")||(a.name||"").toLowerCase().includes("weight"));
  const typeC = { Rest:C.muted, Easy:C.green, Interval:C.red, Tempo:C.yellow, "Long Run":C.blue, Gym:C.orange };
  const save = () => { onSavePrefs({...userPrefs,lifts:editLifts}); setEditing(false); };

  useEffect(()=>{ if(savedWorkout) setWorkout(savedWorkout); },[savedWorkout]);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14, paddingBottom:20 }}>

      {workout && (
        <Card style={{ border:`1.5px solid ${C.orangeB}`, background:C.orangeL }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:C.text, fontFamily:C.sans }}>{workout.title}</div>
              <div style={{ fontSize:12, color:C.sub, marginTop:2, fontFamily:C.sans }}>{new Date(workout.date).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}</div>
            </div>
            <button onClick={()=>setWorkout(null)} style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.sub, borderRadius:20, padding:"3px 10px", fontSize:11, cursor:"pointer", fontFamily:C.sans }}>Clear</button>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {workout.exercises.map((ex,i)=>(
              <div key={i} style={{ background:C.surface, borderRadius:12, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:C.text, fontFamily:C.sans }}>{ex.name}</div>
                  {ex.notes && <div style={{ fontSize:11, color:C.sub, marginTop:3, fontFamily:C.sans }}>{ex.notes}</div>}
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ fontFamily:C.mono, fontSize:13, fontWeight:700, color:C.orange }}>{ex.sets}</div>
                  <div style={{ fontSize:11, color:C.sub, marginTop:2, fontFamily:C.sans }}>{ex.weight}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop:12, fontSize:11, color:C.orange, fontFamily:C.sans }}>Generated by Claude in Chat tab</div>
        </Card>
      )}

      <Card>
        <SectionTitle action={<EditBtn editing={editing} onToggle={()=>{if(editing)save();else{setEditLifts(lifts);setEditing(true);}}}/>}>Current Lifts</SectionTitle>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {(editing?editLifts:lifts).map((l,i)=>(
            <div key={i} style={{ background:C.bg, borderRadius:12, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", gap:10 }}>
              {editing ? (
                <>
                  <TxtInput value={l.name} onChange={v=>setEditLifts(p=>p.map((x,j)=>j===i?{...x,name:v}:x))} style={{ flex:1 }}/>
                  <TxtInput value={l.weight} onChange={v=>setEditLifts(p=>p.map((x,j)=>j===i?{...x,weight:v}:x))} style={{ width:100 }}/>
                  <TxtInput value={`${l.sets}x${l.reps}`} onChange={v=>{const[s,r]=(v.split("x")||["3","10"]);setEditLifts(p=>p.map((x,j)=>j===i?{...x,sets:parseInt(s)||3,reps:parseInt(r)||10}:x));}} style={{ width:60 }}/>
                  <button onClick={()=>setEditLifts(p=>p.filter((_,j)=>j!==i))} style={{ background:"transparent", border:"none", color:C.red, cursor:"pointer", fontSize:18 }}>×</button>
                </>
              ) : (
                <>
                  <div><div style={{ fontSize:13, fontWeight:600, color:C.text, fontFamily:C.sans }}>{l.name}</div><div style={{ fontSize:11, color:C.sub, marginTop:2, fontFamily:C.sans }}>{l.sets} sets × {l.reps} reps</div></div>
                  <div style={{ fontFamily:C.mono, fontSize:13, fontWeight:700, color:C.orange }}>{l.weight}</div>
                </>
              )}
            </div>
          ))}
          {editing && <button onClick={()=>setEditLifts(p=>[...p,{name:"New Exercise",weight:"0kg",sets:3,reps:10}])} style={{ background:"transparent", border:`1.5px dashed ${C.border}`, borderRadius:12, padding:"10px", color:C.sub, cursor:"pointer", fontSize:13, fontFamily:C.sans }}>+ Add exercise</button>}
        </div>
      </Card>
      {generatedWorkout && (
        <Card style={{ border:`1.5px solid ${C.orangeB}`, background:C.orangeL }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:C.text, fontFamily:C.sans }}>{generatedWorkout.title}</div>
              <div style={{ fontSize:11, color:C.sub, marginTop:2, fontFamily:C.sans }}>Generated by Claude · {generatedWorkout.date}</div>
            </div>
            <button onClick={()=>setGeneratedWorkout(null)} style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.sub, borderRadius:20, padding:"4px 10px", fontSize:11, cursor:"pointer", fontFamily:C.sans }}>Dismiss</button>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {generatedWorkout.exercises.map((ex,i)=>(
              <div key={i} style={{ background:C.surface, borderRadius:12, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", gap:10 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:C.text, fontFamily:C.sans }}>{ex.name}</div>
                  {ex.notes && <div style={{ fontSize:11, color:C.sub, marginTop:2, fontFamily:C.sans }}>{ex.notes}</div>}
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ fontFamily:C.mono, fontSize:13, fontWeight:700, color:C.orange }}>{ex.sets}x{ex.reps}</div>
                  <div style={{ fontSize:11, color:C.sub, marginTop:1, fontFamily:C.sans }}>{ex.weight}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {sessions.length>0 && (
        <Card>
          <SectionTitle>Recent Sessions</SectionTitle>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {sessions.slice(0,10).map(s=>(
              <div key={s.id} style={{ background:C.bg, borderRadius:12, padding:"10px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div><div style={{ fontSize:13, fontWeight:600, color:C.text, fontFamily:C.sans }}>{s.name}</div><div style={{ fontSize:11, color:C.sub, marginTop:2, fontFamily:C.sans }}>{new Date(s.start_date_local).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</div></div>
                <div style={{ textAlign:"right" }}><div style={{ fontFamily:C.mono, fontSize:12, color:C.orange }}>{fTime(s.moving_time)}</div>{s.average_heartrate&&<div style={{ fontSize:11, color:C.red, marginTop:2, fontFamily:C.sans }}>{Math.round(s.average_heartrate)} bpm</div>}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── RECOVERY ────────────────────────────────────────────────────────────────
function Recovery({ whoopData, whoopOk, onConnectWhoop, onRefreshWhoop }) {
  if (!whoopOk) return (
    <div style={{ display:"flex", flexDirection:"column", gap:14, paddingBottom:20 }}>
      <Card style={{ textAlign:"center", padding:"48px 24px" }}>
        <div style={{ fontSize:48, marginBottom:16 }}>⌚</div>
        <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:6, fontFamily:C.sans }}>Connect Whoop</div>
        <div style={{ fontSize:14, color:C.sub, marginBottom:24, lineHeight:1.6, maxWidth:280, margin:"0 auto 24px", fontFamily:C.sans }}>Live recovery, HRV, sleep stages, daily strain and respiratory rate.</div>
        <PillBtn onClick={onConnectWhoop} color={C.red}>Connect Whoop</PillBtn>
      </Card>
    </div>
  );

  const recs = whoopData?.recoveries?.records||[];
  const sleeps = whoopData?.sleeps?.records||[];
  const cycles = whoopData?.cycles?.records||[];
  const latest = recs[0];
  const latestSleep = sleeps[0];

  if (!latest && !latestSleep) return (
    <div style={{ display:"flex", flexDirection:"column", gap:14, paddingBottom:20 }}>
      <Card style={{ textAlign:"center", padding:"40px 24px" }}>
        <div style={{ fontSize:14, color:C.sub, marginBottom:16, fontFamily:C.sans }}>No Whoop data loaded yet.</div>
        <PillBtn onClick={onRefreshWhoop} color={C.orange} sm>Load Data</PillBtn>
      </Card>
    </div>
  );

  const hrvChart = recs.slice(0,14).reverse().map(r=>({ day:new Date(r.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"}), hrv:Math.round(r.score?.hrv_rmssd_milli||0), rhr:Math.round(r.score?.resting_heart_rate||0) }));
  const recChart = recs.slice(0,14).reverse().map(r=>({ day:new Date(r.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"}), score:Math.round(r.score?.recovery_score||0) }));
  const sleepChart = sleeps.slice(0,14).reverse().map(s=>({ day:new Date(s.start).toLocaleDateString("en-GB",{day:"numeric",month:"short"}), hours:s.score?.stage_summary?.total_in_bed_time_milli?parseFloat((s.score.stage_summary.total_in_bed_time_milli/3600000).toFixed(1)):0 }));

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14, paddingBottom:20 }}>
      <div style={{ display:"flex", justifyContent:"flex-end" }}>
        <PillBtn onClick={onRefreshWhoop} color={C.orange} sm outline>Refresh Whoop</PillBtn>
      </div>
      {latest && (
        <Card>
          <SectionTitle color={C.red}>Today's Recovery</SectionTitle>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
            <StatTile label="Recovery Score" value={`${Math.round(latest.score?.recovery_score||0)}%`} color={recCol(latest.score?.recovery_score)} bg={C.bg} size="lg"/>
            <StatTile label="HRV" value={`${Math.round(latest.score?.hrv_rmssd_milli||0)}`} sub="ms rMSSD" color={C.green} bg={C.bg} size="lg"/>
            <StatTile label="Resting HR" value={`${Math.round(latest.score?.resting_heart_rate||0)}`} sub="bpm" color={C.red} bg={C.bg}/>
            <StatTile label="Resp Rate" value={`${latest.score?.respiratory_rate?.toFixed(1)||"—"}`} sub="breaths/min" color={C.purple} bg={C.bg}/>
          </div>
        </Card>
      )}
      {latestSleep && (
        <Card>
          <SectionTitle>Last Night's Sleep</SectionTitle>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
            <StatTile label="Sleep Score" value={`${Math.round(latestSleep.score?.sleep_performance_percentage||0)}%`} color={C.blue} bg={C.bg}/>
            <StatTile label="Time in Bed" value={latestSleep.score?.stage_summary?.total_in_bed_time_milli?`${(latestSleep.score.stage_summary.total_in_bed_time_milli/3600000).toFixed(1)}h`:"—"} color={C.blue} bg={C.bg}/>
            <StatTile label="REM" value={latestSleep.score?.stage_summary?.total_rem_sleep_time_milli?`${(latestSleep.score.stage_summary.total_rem_sleep_time_milli/60000).toFixed(0)}m`:"—"} color={C.purple} bg={C.bg}/>
            <StatTile label="Deep Sleep" value={latestSleep.score?.stage_summary?.total_slow_wave_sleep_time_milli?`${(latestSleep.score.stage_summary.total_slow_wave_sleep_time_milli/60000).toFixed(0)}m`:"—"} color={C.green} bg={C.bg}/>
          </div>
        </Card>
      )}
      {hrvChart.length>0 && (
        <Card>
          <SectionTitle>HRV and Resting HR — 14 Days</SectionTitle>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={hrvChart}>
              <XAxis dataKey="day" tick={{fontSize:10,fill:C.sub,fontFamily:C.sans}} tickLine={false} axisLine={false} interval={2}/>
              <YAxis tick={{fontSize:10,fill:C.muted}} tickLine={false} axisLine={false} width={28}/>
              <Tooltip content={<CT/>}/>
              <Line type="monotone" dataKey="hrv" name="HRV" stroke={C.green} strokeWidth={2} dot={{fill:C.green,r:3}}/>
              <Line type="monotone" dataKey="rhr" name="RHR" stroke={C.red} strokeWidth={2} dot={{fill:C.red,r:3}}/>
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}
      {recChart.length>0 && (
        <Card>
          <SectionTitle>Recovery Score — 14 Days</SectionTitle>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={recChart}>
              <XAxis dataKey="day" tick={{fontSize:10,fill:C.sub,fontFamily:C.sans}} tickLine={false} axisLine={false} interval={2}/>
              <YAxis tick={{fontSize:10,fill:C.muted}} tickLine={false} axisLine={false} domain={[0,100]} width={28}/>
              <Tooltip content={<CT/>}/>
              <Bar dataKey="score" name="Recovery" fill={C.green} radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
      {sleepChart.length>0 && (
        <Card>
          <SectionTitle>Sleep Duration — 14 Days</SectionTitle>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={sleepChart}>
              <XAxis dataKey="day" tick={{fontSize:10,fill:C.sub,fontFamily:C.sans}} tickLine={false} axisLine={false} interval={2}/>
              <YAxis tick={{fontSize:10,fill:C.muted}} tickLine={false} axisLine={false} width={28} unit="h"/>
              <Tooltip content={<CT/>}/>
              <Bar dataKey="hours" name="Hours" fill={C.blue} radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
      {cycles.length>0 && (
        <Card>
          <SectionTitle>Daily Strain</SectionTitle>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {cycles.slice(0,7).map((c,i)=>(
              <div key={i} style={{ display:"flex", alignItems:"center", gap:12, background:C.bg, borderRadius:10, padding:"10px 14px" }}>
                <div style={{ fontSize:11, color:C.sub, minWidth:64, fontFamily:C.sans }}>{new Date(c.start).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</div>
                <div style={{ flex:1, height:8, background:C.divider, borderRadius:4 }}>
                  <div style={{ width:`${Math.min((c.score?.strain||0)/21*100,100)}%`, height:"100%", background:C.orange, borderRadius:4 }}/>
                </div>
                <div style={{ fontFamily:C.mono, fontSize:13, fontWeight:700, color:C.orange, minWidth:32, textAlign:"right" }}>{c.score?.strain?.toFixed(1)||"—"}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── SESSION CARD ─────────────────────────────────────────────────────────────
function SessionCard({ session: s, typeC, onToggleDone }) {
  const [expanded, setExpanded] = useState(false);
  const col = s.done ? C.green : (typeC[s.type]||C.orange);
  const isRest = s.type==="Rest";
  return (
    <Card style={{ opacity:isRest?0.5:1, background:s.done?C.greenL:C.card }}>
      <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
        <div style={{ textAlign:"center", minWidth:44, flexShrink:0 }}>
          <div style={{ fontSize:10, color:C.muted, textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:5, fontFamily:C.sans }}>{s.day}</div>
          <button onClick={()=>onToggleDone&&onToggleDone()} style={{ width:38, height:38, borderRadius:"50%", background:s.done?C.green:`${col}18`, border:`2px solid ${s.done?C.green:col+"40"}`, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0 }}>
            {s.done ? <span style={{ color:"#fff", fontSize:16, lineHeight:1 }}>✓</span> : <div style={{ width:12, height:12, borderRadius:"50%", background:col }}/>}
          </button>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <button onClick={()=>!isRest&&setExpanded(!expanded)} style={{ background:"transparent", border:"none", width:"100%", textAlign:"left", cursor:isRest?"default":"pointer", padding:0 }}>
            <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, flexWrap:"wrap" }}>
                  <span style={{ fontSize:14, fontWeight:700, color:s.done?C.green:C.text, textDecoration:s.done?"line-through":"none", fontFamily:C.sans }}>{s.type}</span>
                  {s.dist&&s.dist!=="0km"&&<Tag color={col}>{s.dist}</Tag>}
                  {s.pace&&s.pace!=="N/A"&&<Tag color={s.done?C.green:C.orange}>{s.pace}</Tag>}
                </div>
                {s.shoe&&s.shoe!=="N/A"&&<div style={{ fontSize:12, color:C.purple, marginBottom:3, fontFamily:C.sans }}>👟 {s.shoe}</div>}
                {!expanded&&s.notes&&<div style={{ fontSize:12, color:C.sub, lineHeight:1.5, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontFamily:C.sans }}>{s.notes}</div>}
              </div>
              {!isRest&&<div style={{ color:C.muted, fontSize:14, flexShrink:0 }}>{expanded?"▲":"▼"}</div>}
            </div>
          </button>
          {expanded && (
            <div style={{ marginTop:14, paddingTop:14, borderTop:`1px solid ${C.divider}` }}>
              {s.notes&&<div style={{ fontSize:13, color:C.sub, lineHeight:1.7, marginBottom:14, fontFamily:C.sans }}>{s.notes}</div>}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
                {s.dist&&s.dist!=="0km"&&<StatTile label="Distance" value={s.dist} size="sm" bg={C.bg} color={C.text}/>}
                {s.pace&&s.pace!=="N/A"&&<StatTile label="Target Pace" value={s.pace} color={C.orange} size="sm" bg={C.orangeL}/>}
                {s.shoe&&s.shoe!=="N/A"&&<StatTile label="Shoe" value={s.shoe} color={C.purple} size="sm" bg={C.bg}/>}
              </div>
              {!isRest&&<div style={{ fontSize:11, color:C.muted, textAlign:"center", marginTop:12, fontFamily:C.sans }}>Coros API integration coming soon</div>}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─── PLAN ────────────────────────────────────────────────────────────────────
function TrainingPlan({ onChat, externalPlan }) {
  const [plan, setPlan] = useState(null);
  const [planLoaded, setPlanLoaded] = useState(false);
  useEffect(()=>{loadTrainingPlan().then(p=>{if(p)setPlan(p);setPlanLoaded(true);});},[]);
  const savePlan = p => { setPlan(p); saveTrainingPlan(p); };
  useEffect(()=>{if(externalPlan&&planLoaded)savePlan(externalPlan);},[externalPlan,planLoaded]);
  const typeC = { Rest:C.muted, Easy:C.green, Interval:C.red, Tempo:C.yellow, "Long Run":C.blue, Gym:C.orange };

  const toggleDone = (i) => {
    const updated = { ...plan, sessions: plan.sessions.map((s,j) => j===i ? {...s, done:!s.done} : s) };
    savePlan(updated);
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14, paddingBottom:20 }}>
      {!plan ? (
        <Card style={{ textAlign:"center", padding:"48px 24px" }}>
          <div style={{ fontSize:48, marginBottom:16 }}>📋</div>
          <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:6, fontFamily:C.sans }}>No training plan yet</div>
          <div style={{ fontSize:14, color:C.sub, marginBottom:24, lineHeight:1.6, maxWidth:280, margin:"0 auto 24px", fontFamily:C.sans }}>Ask Claude in Chat to build your Berlin block.</div>
          <PillBtn onClick={onChat} color={C.orange} sm>Open Chat</PillBtn>
        </Card>
      ) : (
        <>
          <Card>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
              <div><div style={{ fontSize:16, fontWeight:700, color:C.text, fontFamily:C.sans }}>{plan.title}</div>{plan.startDate&&<div style={{ fontSize:12, color:C.sub, marginTop:3, fontFamily:C.sans }}>Starting {new Date(plan.startDate).toLocaleDateString("en-GB",{day:"numeric",month:"long"})}</div>}</div>
              <div style={{ display:"flex", gap:8 }}>
                <PillBtn onClick={async()=>{
                  try {
                    const res=await fetch("/.netlify/functions/export-plan-pdf",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({plan})});
                    const data=await res.json();
                    if(data.html){
                      const blob=new Blob([data.html],{type:"text/html"});
                      const url=URL.createObjectURL(blob);
                      const a=document.createElement("a");
                      a.href=url;a.download=`${plan.title.replace(/\s+/g,"-")}.html`;
                      a.click();URL.revokeObjectURL(url);
                    }
                  }catch(e){console.error(e);}
                }} color={C.blue} sm outline>Export</PillBtn>
                <PillBtn onClick={()=>savePlan(null)} color={C.muted} sm outline>Clear</PillBtn>
              </div>
            </div>
          </Card>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {plan.sessions.map((s,i)=><SessionCard key={i} session={s} typeC={typeC} onToggleDone={()=>toggleDone(i)}/>)}
          </div>
        </>
      )}
    </div>
  );
}

// ─── RACES ───────────────────────────────────────────────────────────────────
function Races({ userPrefs, onSavePrefs }) {
  const [editing, setEditing] = useState(false);
  const races = userPrefs?.races||DEFAULT_RACES;
  const sponsorship = userPrefs?.sponsorship||DEFAULT_SPONSORSHIP;
  const [editRaces, setEditRaces] = useState(races);
  const [editSponsorship, setEditSponsorship] = useState(sponsorship);
  const save = () => { onSavePrefs({...userPrefs,races:editRaces,sponsorship:editSponsorship}); setEditing(false); };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14, paddingBottom:20 }}>
      <Card>
        <SectionTitle color={C.purple}>World Marathon Majors Mission</SectionTitle>
        <div style={{ fontSize:14, color:C.sub, lineHeight:1.7, marginBottom:16, fontFamily:C.sans }}>Running all six World Marathon Majors for a different charity each time. For brother Noah who has Duchenne Muscular Dystrophy. £5,000+ raised so far.</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
          <StatTile label="Completed" value="2 / 6" sub="Both London" bg={C.bg} color={C.green}/>
          <StatTile label="Raised" value="£5k+" sub="for charity" bg={C.orangeL} color={C.orange}/>
          <StatTile label="Next Race" value="Berlin" sub="28 Sep 2026" bg={C.bg} color={C.orange}/>
          <StatTile label="Sub-3 Goal" value="Seville" sub="Feb 2027" bg={C.bg} color={C.purple}/>
        </div>
      </Card>
      <Card>
        <SectionTitle action={<EditBtn editing={editing} onToggle={()=>{if(editing)save();else{setEditRaces(races);setEditSponsorship(sponsorship);setEditing(true);}}}/>}>Race Pipeline</SectionTitle>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {(editing?editRaces:races).map((r,i)=>(
            <div key={i} style={{ background:r.next?C.orangeL:C.bg, borderRadius:12, padding:"14px 16px", border:r.next?`1.5px solid ${C.orangeB}`:`1px solid ${C.divider}`, opacity:r.done?0.5:1 }}>
              {editing ? (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  <div style={{ display:"flex", gap:8 }}><TxtInput value={r.name} onChange={v=>setEditRaces(p=>p.map((x,j)=>j===i?{...x,name:v}:x))} style={{ flex:1 }}/><TxtInput value={r.date} onChange={v=>setEditRaces(p=>p.map((x,j)=>j===i?{...x,date:v}:x))} style={{ width:120 }}/></div>
                  <div style={{ display:"flex", gap:8 }}><TxtInput value={r.charity} onChange={v=>setEditRaces(p=>p.map((x,j)=>j===i?{...x,charity:v}:x))} style={{ flex:1 }}/><TxtInput value={r.target} onChange={v=>setEditRaces(p=>p.map((x,j)=>j===i?{...x,target:v}:x))} style={{ width:100 }}/></div>
                  <button onClick={()=>setEditRaces(p=>p.filter((_,j)=>j!==i))} style={{ background:"transparent", border:"none", color:C.red, cursor:"pointer", fontSize:12, textAlign:"left", fontFamily:C.sans }}>Remove</button>
                </div>
              ) : (
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
                  <div><div style={{ fontSize:14, fontWeight:700, color:r.done?C.muted:r.next?C.orange:C.text, fontFamily:C.sans }}>{r.done?"✓ ":""}{r.name}</div><div style={{ fontSize:11, color:C.sub, marginTop:3, fontFamily:C.sans }}>{r.date} · {r.charity}</div></div>
                  <Tag color={r.next?C.orange:C.sub}>{r.target}</Tag>
                </div>
              )}
            </div>
          ))}
          {editing&&<button onClick={()=>setEditRaces(p=>[...p,{name:"New Race",date:"TBC",charity:"TBC",target:"TBC"}])} style={{ background:"transparent", border:`1.5px dashed ${C.border}`, borderRadius:12, padding:"10px", color:C.sub, cursor:"pointer", fontSize:13, fontFamily:C.sans }}>+ Add race</button>}
        </div>
      </Card>
      <Card>
        <SectionTitle>Sponsorship Tracker</SectionTitle>
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {(editing?editSponsorship:sponsorship).map((s,i)=>{
            const col={success:C.green,pending:C.orange,future:C.purple}[s.state]||C.muted;
            return (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:C.bg, borderRadius:10, padding:"10px 14px", gap:10 }}>
                {editing ? (
                  <>
                    <TxtInput value={s.name} onChange={v=>setEditSponsorship(p=>p.map((x,j)=>j===i?{...x,name:v}:x))} style={{ flex:1 }}/>
                    <TxtInput value={s.status} onChange={v=>setEditSponsorship(p=>p.map((x,j)=>j===i?{...x,status:v}:x))} style={{ flex:1 }}/>
                    <select value={s.state} onChange={e=>setEditSponsorship(p=>p.map((x,j)=>j===i?{...x,state:e.target.value}:x))} style={{ background:C.surface, border:`1px solid ${C.border}`, color:C.text, borderRadius:8, padding:"5px 8px", fontSize:11, fontFamily:C.sans }}>
                      <option value="success">Success</option><option value="pending">Pending</option><option value="future">Future</option>
                    </select>
                    <button onClick={()=>setEditSponsorship(p=>p.filter((_,j)=>j!==i))} style={{ background:"transparent", border:"none", color:C.red, cursor:"pointer", fontSize:18 }}>×</button>
                  </>
                ) : (
                  <><span style={{ fontSize:13, color:C.text, fontFamily:C.sans }}>{s.name}</span><span style={{ fontSize:11, color:col, fontWeight:600, fontFamily:C.sans }}>{s.status}</span></>
                )}
              </div>
            );
          })}
          {editing&&<button onClick={()=>setEditSponsorship(p=>[...p,{name:"New Brand",status:"Applied",state:"pending"}])} style={{ background:"transparent", border:`1.5px dashed ${C.border}`, borderRadius:10, padding:"8px", color:C.sub, cursor:"pointer", fontSize:13, fontFamily:C.sans }}>+ Add brand</button>}
        </div>
      </Card>
    </div>
  );
}

// ─── CHAT ────────────────────────────────────────────────────────────────────
function Chat({ activities, stats, whoopData, whoopOk, onPlanSaved, onGymSaved, corosSession, onCorosSessionHandled, userPrefs }) {
  const [messages, setMessages] = useState([{role:"assistant",content:"Hi Caleb! I know everything about you — your training, Strava data, Whoop recovery, nutrition logs and goals. Ask me anything, or tap a suggestion below to get started."}]);
  const [chatLoaded, setChatLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState([]);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => { loadChatHistory().then(msgs => { if(msgs&&msgs.length>0) setMessages(msgs); setChatLoaded(true); }); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:"smooth"}); }, [messages]);
  useEffect(() => { if(chatLoaded) saveChatHistory(messages); }, [messages, chatLoaded]);
  useEffect(() => {
    if(corosSession && chatLoaded) {
      setInput(`Please add this session to my Coros calendar: ${corosSession.day} - ${corosSession.type}, ${corosSession.dist}, target pace ${corosSession.pace}, shoe: ${corosSession.shoe}. Notes: ${corosSession.notes}`);
      if(onCorosSessionHandled) onCorosSessionHandled();
    }
  }, [corosSession, chatLoaded]);

  const handleImages = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    let loaded = 0;
    const newImgs = [];
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        newImgs.push({ base64: ev.target.result.split(",")[1], mediaType: file.type, preview: ev.target.result });
        loaded++;
        if (loaded === files.length) setImages(prev => [...prev, ...newImgs].slice(0, 5));
      };
      reader.readAsDataURL(file);
    });
  };

  const extractPlan = text => {
    if (!text.includes("PLAN_START") || !text.includes("PLAN_END")) return null;
    try {
      const section = text.split("PLAN_START")[1].split("PLAN_END")[0].trim();
      const lines = section.split("\n").map(l => l.trim()).filter(Boolean);
      let title = "Training Plan"; const sessions = [];
      for (const line of lines) {
        if (line.startsWith("TITLE:")) { title = line.replace("TITLE:", "").trim(); continue; }
        const parts = line.split("|").map(p => p.trim());
        if (parts.length >= 4) sessions.push({ day:parts[0], type:parts[1], dist:parts[2], pace:parts[3], shoe:parts[4]||"", notes:parts[5]||"" });
      }
      if (sessions.length >= 3) return { title, startDate: new Date().toISOString().split("T")[0], sessions };
    } catch(e) { console.error(e); }
    return null;
  };

  const extractGym = text => {
    if (!text.includes("GYM_START") || !text.includes("GYM_END")) return null;
    try {
      const section = text.split("GYM_START")[1].split("GYM_END")[0].trim();
      const lines = section.split("\n").map(l => l.trim()).filter(Boolean);
      let title = "Gym Session"; const exercises = [];
      for (const line of lines) {
        if (line.startsWith("TITLE:")) { title = line.replace("TITLE:", "").trim(); continue; }
        const parts = line.split("|").map(p => p.trim());
        if (parts.length >= 3) {
          const nums = parts[1].match(/(\d+)[xX](\d+)/);
          exercises.push({ name:parts[0], sets:nums?parseInt(nums[1]):3, reps:nums?parseInt(nums[2]):10, weight:parts[2], notes:parts[3]||"" });
        }
      }
      if (exercises.length >= 1) return { title, exercises, date: new Date().toISOString().split("T")[0] };
    } catch(e) { console.error(e); }
    return null;
  };

  const cleanReply = text => {
    let out = text;
    if (out.includes("PLAN_START") && out.includes("PLAN_END")) {
      const b = out.split("PLAN_START")[0].trim();
      const a = out.split("PLAN_END")[1]?.trim() || "";
      out = (b + (a ? "\n\n" + a : "")).trim();
    }
    if (out.includes("GYM_START") && out.includes("GYM_END")) {
      const b = out.split("GYM_START")[0].trim();
      const a = out.split("GYM_END")[1]?.trim() || "";
      out = (b + (a ? "\n\n" + a : "")).trim();
    }
    return out;
  };

  const buildContext = () => {
    const runs = activities.filter(a => a.type==="Run").slice(0, 5);
    const ytd = stats?.ytd_run_totals || {};
    const rec = whoopData?.recoveries?.records?.[0];
    const sleep = whoopData?.sleeps?.records?.[0];
    const cyc = whoopData?.cycles?.records?.[0];
    const recentRecs = (whoopData?.recoveries?.records || []).slice(0, 7)
      .map(r => `${new Date(r.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}: recovery ${Math.round(r.score?.recovery_score||0)}%, HRV ${Math.round(r.score?.hrv_rmssd_milli||0)}ms, RHR ${Math.round(r.score?.resting_heart_rate||0)}bpm`).join("\n");
    const recentSleeps = (whoopData?.sleeps?.records || []).slice(0, 7)
      .map(s => `${new Date(s.start).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}: sleep ${Math.round(s.score?.sleep_performance_percentage||0)}%, ${s.score?.stage_summary?.total_in_bed_time_milli?(s.score.stage_summary.total_in_bed_time_milli/3600000).toFixed(1):0}h in bed`).join("\n");
    const nutrition = userPrefs?.nutrition || {};
    const recentNutrition = Object.entries(nutrition).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,7)
      .map(([date,log]) => `${new Date(date).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}: ${[log.kcal&&log.kcal+"kcal",log.protein&&log.protein+"g protein",log.carbs&&log.carbs+"g carbs"].filter(Boolean).join(", ")}`).join("\n");

    return `You are a personal running coach and fitness assistant for Caleb Cunningham. Be direct, conversational, use his actual data. Never use double dashes.

WHO HE IS: 20 years old, graphic design student at Kingston University London, from Southport. Lives in Kingston with girlfriend Taylor (Taz). Started running July 2024. Raised over £5,000 for the Duchenne Family Support Group. Brother Noah has Duchenne Muscular Dystrophy. Mission: all six World Marathon Majors for a different charity each time.

RUNNING PBs: 5K 18:42, 10K 40:52, HM 1:32:48, Marathon 3:48:59 (London Apr 2026). VO2 Max 67, threshold pace 3:57/km, max HR 208bpm.

RACE PIPELINE: Berlin 28 Sep 2026 (Get Kids Going, Sub 3:20). Seville Feb 2027 (Sub 3:00). Valencia Dec 2027. Then Tokyo, Chicago, New York.

SHOES: Metaspeed Sky Tokyo Green (race), Metaspeed Sky Tokyo Red (carbon trainer), Vaporfly 3+4 (intervals), ZoomFly 5 (training), Novablast 5 (easy/long), Adidas Evo SL (daily/tempo).

GYM: Chest focus. Smith flat bench 20kg/side 3x10, incline 15kg/side 3x10, pec deck 73kg 3x12, preacher curl 39kg 3x10, hammer curl 16kg 3x12, lateral raises 8-10kg 3x15. Weight 58-61kg, targeting 65kg.

NUTRITION TARGETS: 2800-3200 kcal/day, 130-150g protein, 250-350g carbs. SiS Beta Fuel gels on long runs.

INJURIES: Ankle pain London Marathon. Arch pain in non-carbon shoes (Superfeet insoles). Left shin to monitor.

LIVE STRAVA: YTD ${ytd.distance?(ytd.distance/1000).toFixed(1):"442.9"}km, ${ytd.count||57} runs

RECENT RUNS:
${runs.map(r=>`- ${r.name} (${new Date(r.start_date_local).toLocaleDateString("en-GB")}): ${(r.distance/1000).toFixed(2)}km at ${fPace(r.average_speed)}/km${r.average_heartrate?`, ${Math.round(r.average_heartrate)}bpm`:""}`).join("\n")}

LIVE WHOOP:
${rec?`Today: recovery ${Math.round(rec.score?.recovery_score||0)}%, HRV ${Math.round(rec.score?.hrv_rmssd_milli||0)}ms, RHR ${Math.round(rec.score?.resting_heart_rate||0)}bpm`:"Recovery: not loaded"}
${cyc?`Strain: ${cyc.score?.strain?.toFixed(1)||"N/A"}`:""}
${sleep?`Last sleep: ${Math.round(sleep.score?.sleep_performance_percentage||0)}% score, ${sleep.score?.stage_summary?.total_in_bed_time_milli?(sleep.score.stage_summary.total_in_bed_time_milli/3600000).toFixed(1):0}h in bed`:"Sleep: not loaded"}

WHOOP HISTORY (7 days):
${recentRecs||"No data"}

SLEEP HISTORY (7 days):
${recentSleeps||"No data"}

NUTRITION (last 7 days):
${recentNutrition||"No nutrition logged"}

TRAINING PLAN FORMAT — when asked, reply conversationally first (2-3 sentences) then use:
PLAN_START
TITLE: [title]
Mon | [type] | [X]km | [pace]/km | [shoe] | [description]
...repeat for all 7 days...
PLAN_END
Rest days: Mon | Rest | 0km | N/A | N/A | Rest
Types: Easy, Interval, Tempo, Long Run, Rest, Gym

GYM WORKOUT FORMAT — when asked, reply conversationally first then use:
GYM_START
TITLE: [session title]
[Exercise] | [Sets]x[Reps] | [Weight] | [Notes]
...repeat for all exercises...
GYM_END
Always reference current lifts and suggest progressive overload.`;
  };

  const send = async () => {
    if ((!input.trim() && !images.length) || loading) return;
    const contentArr = [];
    images.forEach(img => contentArr.push({ type:"image", source:{type:"base64", media_type:img.mediaType, data:img.base64} }));
    if (input.trim()) contentArr.push({ type:"text", text:input.trim() });
    const userMsg = { role:"user", content: images.length ? contentArr : input.trim() };
    const displayMsg = { role:"user", content: input.trim() || `${images.length} image${images.length>1?"s":""} attached`, imagePreviews: images.map(i=>i.preview) };
    setMessages(prev => [...prev, displayMsg]);
    setInput("");
    setImages([]);
    setLoading(true);
    try {
      const apiMsgs = [...messages.filter(m=>m.role!=="system"), userMsg].map(m => ({ role:m.role, content:m.content }));
      const res = await fetch("/.netlify/functions/claude-chat", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ system: buildContext(), messages: apiMsgs })
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || "Something went wrong. Please try again.";
      const plan = extractPlan(reply);
      const gym = extractGym(reply);
      const cleaned = cleanReply(reply);
      const suffix = (plan ? "\n\n✓ Training plan saved to your Plan tab!" : "") + (gym ? "\n\n💪 Gym workout saved to your Gym tab!" : "");
      setMessages(prev => [...prev, { role:"assistant", content: cleaned + suffix }]);
      if (plan && onPlanSaved) onPlanSaved(plan);
      if (gym && onGymSaved) onGymSaved(gym);
    } catch(e) {
      setMessages(prev => [...prev, { role:"assistant", content:"Something went wrong. Please try again." }]);
    }
    setLoading(false);
  };

  const SUGGESTIONS = ["How am I recovering?", "Make me a training plan", "Gym session today", "Am I on track for Berlin?", "Analyse my recent runs"];

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", fontFamily:C.sans }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10, flexShrink:0 }}>
        {messages.length <= 1 && (
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", flex:1, marginRight:8 }}>
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={()=>setInput(s)} style={{ background:C.orangeL, border:`1px solid ${C.orangeB}`, color:C.orange, borderRadius:20, padding:"5px 12px", fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:C.sans, whiteSpace:"nowrap" }}>{s}</button>
            ))}
          </div>
        )}
        <button onClick={()=>{ const f=[{role:"assistant",content:"Hi Caleb! How can I help today?"}]; setMessages(f); saveChatHistory(f); }} style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.sub, borderRadius:20, padding:"4px 12px", fontSize:11, cursor:"pointer", fontFamily:C.sans, flexShrink:0, marginLeft:"auto" }}>Clear</button>
      </div>

      <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:10, paddingBottom:12 }}>
        {messages.map((m,i) => (
          <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
            <div style={{ maxWidth:"82%", padding:"11px 15px", borderRadius:18, background:m.role==="user"?C.orange:C.surface, color:m.role==="user"?"#fff":C.text, border:m.role==="assistant"?`1px solid ${C.border}`:"none", fontSize:13, lineHeight:1.6, fontFamily:C.sans, whiteSpace:"pre-wrap" }}>
              {m.imagePreviews?.length > 0 && (
                <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:6 }}>
                  {m.imagePreviews.map((p,j) => <img key={j} src={p} alt="" style={{ height:52, width:52, objectFit:"cover", borderRadius:8, opacity:0.9 }}/>)}
                </div>
              )}
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display:"flex", justifyContent:"flex-start" }}>
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:18, padding:"11px 16px", display:"flex", gap:5 }}>
              {[0,1,2].map(i => <div key={i} style={{ width:6, height:6, borderRadius:"50%", background:C.muted, animation:`bounce .9s ${i*0.15}s infinite` }}/>)}
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {images.length > 0 && (
        <div style={{ display:"flex", gap:8, marginBottom:8, flexWrap:"wrap", flexShrink:0 }}>
          {images.map((img,i) => (
            <div key={i} style={{ position:"relative" }}>
              <img src={img.preview} alt="" style={{ height:52, width:52, objectFit:"cover", borderRadius:8, border:`1px solid ${C.border}` }}/>
              <button onClick={()=>setImages(prev=>prev.filter((_,j)=>j!==i))} style={{ position:"absolute", top:-5, right:-5, background:C.red, color:"#fff", border:"none", borderRadius:"50%", width:16, height:16, fontSize:11, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 }}>×</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display:"flex", gap:8, paddingTop:10, borderTop:`1px solid ${C.divider}`, alignItems:"flex-end", flexShrink:0 }}>
        <button onClick={()=>fileRef.current?.click()} style={{ background:C.bg, border:`1px solid ${C.border}`, color:C.sub, borderRadius:20, padding:"10px 13px", fontSize:16, cursor:"pointer", flexShrink:0 }}>📷</button>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display:"none" }} onChange={handleImages}/>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()} placeholder="Ask me anything..." style={{ flex:1, background:C.bg, border:`1px solid ${C.border}`, borderRadius:20, padding:"10px 16px", color:C.text, fontSize:13, outline:"none", fontFamily:C.sans }}/>
        <button onClick={send} disabled={loading||(!input.trim()&&!images.length)} style={{ background:C.orange, color:"#fff", border:"none", borderRadius:20, padding:"10px 20px", fontSize:13, fontWeight:600, cursor:"pointer", opacity:loading||(!input.trim()&&!images.length)?0.4:1, fontFamily:C.sans, flexShrink:0 }}>Send</button>
      </div>
      <style>{`@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}`}</style>
    </div>
  );
}

// ─── NAV ─────────────────────────────────────────────────────────────────────
const NAV = [
  {id:"overview",label:"Overview",icon:"⚡"},
  {id:"running",label:"Running",icon:"🏃"},
  {id:"gym",label:"Gym",icon:"💪"},
  {id:"recovery",label:"Recovery",icon:"💤"},
  {id:"plan",label:"Plan",icon:"📋"},
  {id:"nutrition",label:"Nutrition",icon:"🥗"},
  {id:"races",label:"Races",icon:"🏅"},
  {id:"chat",label:"Chat",icon:"💬"},
];

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("overview");
  const [connected, setConnected] = useState(isConnected());
  const [whoopOk, setWhoopOk] = useState(isWhoopConnected());
  const [activities, setActivities] = useState([]);
  const [stats, setStats] = useState(null);
  const [athlete, setAthlete] = useState(null);
  const [gear, setGear] = useState([]);
  const [bestEfforts, setBestEfforts] = useState({});
  const [whoopData, setWhoopData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth>640);
  const [whoopPending, setWhoopPending] = useState(false);
  const [savedPlan, setSavedPlan] = useState(null);
  const [gymWorkout, setGymWorkout] = useState(null);
  const [savedWorkout, setSavedWorkout] = useState(null);
  const [corosSession, setCorosSession] = useState(null);
  const [userPrefs, setUserPrefs] = useState(null);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const code=params.get("code");
    const pending=localStorage.getItem("whoop_pending");
    if(!code)return;
    if(pending){setWhoopPending(true);exchangeWhoopCode(code).then(()=>{setWhoopOk(true);setWhoopPending(false);}).catch(e=>{console.error(e);setWhoopPending(false);}).finally(()=>window.history.replaceState({},"","/"));}
    else if(!isConnected()){exchangeCode(code).then(()=>setConnected(true)).catch(console.error).finally(()=>window.history.replaceState({},"","/"));}
  },[]);

  useEffect(()=>{
    if(!connected)return;
    setLoading(true);
    Promise.all([getAthlete(),getActivities(100)])
      .then(([a,acts])=>{setAthlete(a);setActivities(acts);setBestEfforts(extractBestEfforts(acts));return Promise.all([getStats(a.id),getAllGear(a)]);})
      .then(([s,g])=>{setStats(s);setGear(g.filter(Boolean));})
      .catch(console.error)
      .finally(()=>setLoading(false));
  },[connected]);

  const loadWhoop = useCallback(()=>{
    if(whoopOk) getWhoopData().then(setWhoopData).catch(console.error);
  },[whoopOk]);

  useEffect(()=>{ loadWhoop(); },[loadWhoop]);
  useEffect(()=>{loadUserPrefs().then(p=>{if(p)setUserPrefs(p);});},[]);

  const handleSavePrefs=useCallback(prefs=>{setUserPrefs(prefs);saveUserPrefs(prefs);},[]);
  const handleConnectWhoop=()=>window.location.assign(getWhoopAuthUrl());

  if(!connected||whoopPending)return <ConnectScreen whoopPending={whoopPending}/>;

  const sharedProps={activities,stats,whoopData,whoopOk,onConnectWhoop:handleConnectWhoop,onRefreshWhoop:loadWhoop};

  const views={
    overview:<Overview {...sharedProps} bestEfforts={bestEfforts} gear={gear} userPrefs={userPrefs} onSavePrefs={handleSavePrefs}/>,
    running:<Running activities={activities} stats={stats} gear={gear}/>,
    gym:<Gym activities={activities} userPrefs={userPrefs} onSavePrefs={handleSavePrefs} savedWorkout={savedWorkout}/>,
    recovery:<Recovery {...sharedProps}/>,
    plan:<TrainingPlan onChat={()=>setPage("chat")} externalPlan={savedPlan}/>,
    nutrition:<Nutrition userPrefs={userPrefs} onSavePrefs={handleSavePrefs}/>,
    races:<Races userPrefs={userPrefs} onSavePrefs={handleSavePrefs}/>,
    chat:<Chat {...sharedProps} onPlanSaved={setSavedPlan} onGymSaved={setSavedWorkout} corosSession={corosSession} onCorosSessionHandled={()=>setCorosSession(null)} userPrefs={userPrefs}/>,
  };

  const NavItem=({n})=>(
    <button onClick={()=>{setPage(n.id);if(window.innerWidth<=640)setSidebarOpen(false);}} style={{ display:"flex", alignItems:"center", gap:10, width:"100%", padding:"10px 14px", background:page===n.id?C.orangeL:"transparent", borderRadius:10, color:page===n.id?C.orange:C.sub, fontSize:13, fontWeight:page===n.id?600:400, marginBottom:2, cursor:"pointer", border:"none", fontFamily:C.sans }}>
      <span style={{ fontSize:16 }}>{n.icon}</span><span>{n.label}</span>
    </button>
  );

  return (
    <div style={{ display:"flex", height:"100vh", background:C.bg, color:C.text, fontFamily:C.sans, overflow:"hidden" }}>
      {/* Sidebar */}
      <div style={{ width:sidebarOpen?200:0, minWidth:sidebarOpen?200:0, background:C.surface, borderRight:`1px solid ${C.border}`, flexShrink:0, height:"100vh", overflowY:"auto", overflowX:"hidden", transition:"width 0.25s ease, min-width 0.25s ease" }}>
        <div style={{ width:200, minWidth:200 }}>
          <div style={{ padding:"22px 18px 18px", borderBottom:`1px solid ${C.divider}` }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.orange, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6 }}>Fitness Dashboard</div>
            <div style={{ fontSize:15, fontWeight:700, color:C.text }}>Caleb Cunningham</div>
            {athlete&&<div style={{ fontSize:12, color:C.sub, marginTop:2 }}>{athlete.city||"Kingston"}</div>}
          </div>
          <nav style={{ padding:"12px 10px" }}>
            {NAV.map(n=><NavItem key={n.id} n={n}/>)}
          </nav>
          <div style={{ padding:"14px 18px", borderTop:`1px solid ${C.divider}` }}>
            {!whoopOk&&<button onClick={handleConnectWhoop} style={{ width:"100%", background:C.red, color:"#fff", border:"none", borderRadius:20, padding:"9px", fontSize:12, fontWeight:700, cursor:"pointer", marginBottom:10, fontFamily:C.sans }}>+ Connect Whoop</button>}
            {whoopOk&&<div style={{ fontSize:11, color:C.green, marginBottom:8, fontWeight:600 }}>✓ Whoop connected</div>}
            <div style={{ fontSize:11, color:C.muted }}>Strava · Coros · Whoop</div>
            <div style={{ fontSize:11, color:C.orange, marginTop:2 }}>Running for Noah 🧡</div>
            <div style={{ display:"flex", gap:8, marginTop:12 }}>
              <button onClick={()=>{disconnect();setConnected(false);setActivities([]);}} style={{ fontSize:10, color:C.sub, background:"transparent", border:`1px solid ${C.border}`, borderRadius:20, padding:"3px 10px", cursor:"pointer", fontFamily:C.sans }}>Strava</button>
              {whoopOk&&<button onClick={()=>{disconnectWhoop();setWhoopOk(false);setWhoopData(null);}} style={{ fontSize:10, color:C.sub, background:"transparent", border:`1px solid ${C.border}`, borderRadius:20, padding:"3px 10px", cursor:"pointer", fontFamily:C.sans }}>Whoop</button>}
            </div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", height:"100vh", overflow:"hidden" }}>
        {/* Top bar */}
        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 20px", borderBottom:`1px solid ${C.border}`, background:C.surface, flexShrink:0 }}>
          <button onClick={()=>setSidebarOpen(!sidebarOpen)} style={{ background:"transparent", border:"none", color:C.sub, fontSize:18, cursor:"pointer", lineHeight:1, padding:"2px 4px" }}>{sidebarOpen?"✕":"☰"}</button>
          <div style={{ fontSize:13, fontWeight:700, color:C.orange, letterSpacing:"0.04em" }}>Fitness Dashboard</div>
          <div style={{ flex:1 }}/>
          <div style={{ fontSize:13, color:C.sub, fontWeight:500 }}>{NAV.find(n=>n.id===page)?.label}</div>

        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:page==="chat"?"hidden":"auto", padding:"18px 20px", display:"flex", flexDirection:"column" }}>
          {loading?<Loader text="Loading your data..."/>:views[page]}
        </div>
      </div>
    </div>
  );
}
