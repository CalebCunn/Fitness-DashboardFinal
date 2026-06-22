import { useState, useEffect, useRef, useCallback } from "react";
import { AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { isConnected, disconnect, exchangeCode, getAthlete, getStats, getActivities, getActivity, getStreams, getAllGear, extractBestEfforts } from "./strava";
import { isWhoopConnected, disconnectWhoop, exchangeWhoopCode, getWhoopAuthUrl, getWhoopData } from "./whoop";
import { loadChatHistory, saveChatHistory, loadTrainingPlan, saveTrainingPlan, loadUserPrefs, saveUserPrefs } from "./supabase";
import { LIFTS as DEFAULT_LIFTS, RACES as DEFAULT_RACES, SPONSORSHIP as DEFAULT_SPONSORSHIP, fPace, fTime, fDist, actType, typeCol, recCol, weeklyVol } from "./data";

const WX_DESC = { 0:"Clear",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Foggy",48:"Icy fog",51:"Light drizzle",53:"Drizzle",55:"Heavy drizzle",61:"Light rain",63:"Rain",65:"Heavy rain",71:"Light snow",73:"Snow",75:"Heavy snow",80:"Rain showers",81:"Showers",82:"Heavy showers",95:"Thunderstorm",96:"Thunderstorm with hail" };
const WX_EMOJI = { 0:"☀️",1:"🌤",2:"⛅",3:"☁️",45:"🌫",48:"🌫",51:"🌦",53:"🌧",55:"🌧",61:"🌧",63:"🌧",65:"🌧",71:"❄️",73:"❄️",75:"❄️",80:"🌦",81:"🌦",82:"⛈",95:"⛈",96:"⛈" };

async function fetchWeather(lat, lng, dateStr) {
  try {
    const res = await fetch(`/.netlify/functions/weather?lat=${lat}&lng=${lng}&date=${dateStr}`);
    const data = await res.json();
    if (!data.hourly) return null;
    return { temp: Math.round(data.hourly.temperature_2m[9]), code: data.hourly.weathercode[9] };
  } catch { return null; }
}

function calcStreaks(activities) {
  const runs = activities.filter(a => a.type==="Run"||a.sport_type==="Run");
  const dates = [...new Set(runs.map(r => new Date(r.start_date_local).toISOString().split("T")[0]))].sort().reverse();
  if (!dates.length) return { current: 0, longest: 0 };
  const today = new Date(); today.setHours(0,0,0,0);
  const check = new Date(today);
  let current = 0;
  for (const d of dates) {
    if (d === check.toISOString().split("T")[0]) { current++; check.setDate(check.getDate()-1); }
    else break;
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

// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────
const C = {
  bg:      "#f5f5f7",
  surface: "#ffffff",
  border:  "#e5e5ea",
  divider: "#f2f2f7",
  orange:  "#f97316",
  orangeL: "#fff7ed",
  orangeB: "#fed7aa",
  blue:    "#0071e3",
  blueL:   "#eff6ff",
  green:   "#34c759",
  greenL:  "#f0fdf4",
  red:     "#ff3b30",
  yellow:  "#ff9500",
  purple:  "#af52de",
  text:    "#1d1d1f",
  sub:     "#6e6e73",
  muted:   "#aeaeb2",
  sans:    "'Inter',-apple-system,BlinkMacSystemFont,sans-serif",
};

// ─── PRIMITIVES ───────────────────────────────────────────────────────────────
const Card = ({ children, style={} }) => (
  <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:20, padding:20, ...style }}>
    {children}
  </div>
);

const Label = ({ children, color=C.muted, style={} }) => (
  <div style={{ fontSize:11, fontWeight:600, color, letterSpacing:"0.04em", textTransform:"uppercase", fontFamily:C.sans, ...style }}>{children}</div>
);

const BigNum = ({ children, size=40, color=C.text, style={} }) => (
  <div style={{ fontSize:size, fontWeight:700, color, lineHeight:1, letterSpacing:"-0.03em", fontFamily:C.sans, ...style }}>{children}</div>
);

const Sub = ({ children, color=C.sub, style={} }) => (
  <div style={{ fontSize:12, color, fontFamily:C.sans, marginTop:3, ...style }}>{children}</div>
);

const Tag = ({ children, color=C.orange }) => (
  <span style={{ fontSize:11, fontWeight:600, color, background:`${color}18`, borderRadius:20, padding:"3px 10px", letterSpacing:"0.02em", fontFamily:C.sans, whiteSpace:"nowrap" }}>{children}</span>
);

const Pill = ({ children, onClick, color=C.orange, ghost, sm, full, style={} }) => (
  <button onClick={onClick} style={{ background:ghost?"transparent":color, color:ghost?color:"#fff", border:`1.5px solid ${color}`, borderRadius:20, padding:sm?"6px 16px":"10px 22px", fontSize:sm?12:14, fontWeight:600, width:full?"100%":"auto", cursor:"pointer", fontFamily:C.sans, transition:"opacity .15s", ...style }}>{children}</button>
);

const Row = ({ children, style={} }) => (
  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", ...style }}>{children}</div>
);

const Divider = () => <div style={{ height:1, background:C.divider, margin:"14px 0" }}/>;

const EditBtn = ({ editing, onToggle }) => (
  <button onClick={onToggle} style={{ background:editing?C.orange:"transparent", color:editing?"#fff":C.sub, border:`1.5px solid ${editing?C.orange:C.border}`, borderRadius:20, padding:"4px 14px", fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:C.sans }}>{editing?"Save":"Edit"}</button>
);

const TxtInput = ({ value, onChange, style={}, placeholder="", type="text" }) => (
  <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
    style={{ background:C.bg, border:`1.5px solid ${C.border}`, borderRadius:10, padding:"7px 11px", color:C.text, fontSize:13, outline:"none", fontFamily:C.sans, width:"100%", ...style }} />
);

const SectionHeader = ({ title, right, color=C.text }) => (
  <Row style={{ marginBottom:14 }}>
    <div style={{ fontSize:13, fontWeight:700, color, fontFamily:C.sans, letterSpacing:"-0.01em" }}>{title}</div>
    {right && <div>{right}</div>}
  </Row>
);

const Loader = ({ text="Loading..." }) => (
  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flex:1, gap:14 }}>
    <div style={{ width:28, height:28, border:`2px solid ${C.border}`, borderTop:`2px solid ${C.orange}`, borderRadius:"50%", animation:"spin .8s linear infinite" }}/>
    <div style={{ fontSize:13, color:C.sub, fontFamily:C.sans }}>{text}</div>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);

// Small metric tile — used in grids
const Tile = ({ label, value, sub, color=C.orange, bg=C.bg, size=28 }) => (
  <div style={{ background:bg, borderRadius:14, padding:"14px 16px" }}>
    <Label style={{ marginBottom:7 }}>{label}</Label>
    <BigNum size={size} color={color}>{value}</BigNum>
    {sub && <Sub>{sub}</Sub>}
  </div>
);

const CT = ({ active, payload, label }) => {
  if (!active||!payload?.length) return null;
  return (
    <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:12, padding:"8px 12px", fontSize:12, boxShadow:"0 4px 16px rgba(0,0,0,0.08)", fontFamily:C.sans }}>
      <div style={{ color:C.sub, marginBottom:4, fontSize:11 }}>{label}</div>
      {payload.map((p,i) => <div key={i} style={{ color:p.color||C.orange, fontWeight:600 }}>{p.name}: {p.value}</div>)}
    </div>
  );
};

// ─── RECOVERY RING ─────────────────────────────────────────────────────────────
function RecoveryRing({ score=0, size=120 }) {
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const col = recCol(score);
  const dash = (score / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.divider} strokeWidth={10}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={10}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition:"stroke-dasharray .6s ease" }}/>
    </svg>
  );
}

// ─── BERLIN PROGRESS ARC ──────────────────────────────────────────────────────
function BerlinArc({ progress=0, daysLeft=0 }) {
  const size = 110;
  const r = 44;
  const circ = 2 * Math.PI * r;
  const dash = (progress / 100) * circ;
  return (
    <div style={{ position:"relative", width:size, height:size }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.divider} strokeWidth={9}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.orange} strokeWidth={9}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"/>
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
        <BigNum size={24} color={C.orange}>{daysLeft}</BigNum>
        <Sub color={C.muted} style={{ fontSize:10, marginTop:1 }}>days</Sub>
      </div>
    </div>
  );
}

// ─── CONNECT SCREEN ───────────────────────────────────────────────────────────
function ConnectScreen({ whoopPending }) {
  const clientId = process.env.REACT_APP_STRAVA_CLIENT_ID;
  const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(window.location.origin)}&response_type=code&scope=read,activity:read_all`;
  if (whoopPending) return (
    <div style={{ height:"100%", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:40, marginBottom:12 }}>⌚</div>
        <div style={{ fontSize:17, fontWeight:600, color:C.text, fontFamily:C.sans }}>Connecting Whoop...</div>
      </div>
    </div>
  );
  return (
    <div style={{ height:"100%", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ textAlign:"center", maxWidth:320 }}>
        <div style={{ width:72, height:72, background:C.orange, borderRadius:20, margin:"0 auto 24px", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <svg viewBox="0 0 36 36" width={40} height={40}><circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="4"/><path d="M18 4 a14 14 0 0 1 14 14" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round"/><rect x="11" y="13" width="14" height="2.5" rx="1.25" fill="white"/><rect x="11" y="17" width="11" height="2.5" rx="1.25" fill="white"/><rect x="11" y="21" width="8" height="2.5" rx="1.25" fill="white"/></svg>
        </div>
        <div style={{ fontSize:11, fontWeight:700, color:C.orange, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10, fontFamily:C.sans }}>Fitness Dashboard</div>
        <div style={{ fontSize:28, fontWeight:800, color:C.text, marginBottom:6, letterSpacing:"-0.03em", fontFamily:C.sans }}>Caleb Cunningham</div>
        <div style={{ fontSize:14, color:C.sub, marginBottom:32, lineHeight:1.6, fontFamily:C.sans }}>Connect Strava to load your live training data.</div>
        <a href={url} style={{ display:"inline-block", background:"#fc4c02", color:"#fff", borderRadius:24, padding:"14px 32px", fontSize:15, fontWeight:700, textDecoration:"none", fontFamily:C.sans }}>Connect with Strava</a>
        <div style={{ fontSize:11, color:C.muted, marginTop:10, fontFamily:C.sans }}>Read-only · Your data stays private</div>
      </div>
    </div>
  );
}

// ─── ACTIVITY DETAIL ──────────────────────────────────────────────────────────
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
  if (loading) return <div style={{ flex:1, display:"flex" }}><Loader text="Loading activity..."/></div>;
  if (!act) return <div style={{ padding:20, color:C.sub, fontSize:14, fontFamily:C.sans }}>Could not load.</div>;
  const type = actType(act);
  const color = typeCol(type);
  const laps = act.laps||[];
  const hr = streams?.heartrate?.data||[];
  const time = streams?.time?.data||[];
  const hrChart = hr.filter((_,i) => i%15===0).map((v,i) => ({ t:Math.round((time[i*15]||i*15)/60), hr:v }));
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12, paddingBottom:20 }}>
      <button onClick={onBack} style={{ background:"transparent", border:"none", color:C.orange, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:C.sans, display:"inline-flex", alignItems:"center", gap:4, marginBottom:4, padding:0 }}>← Back</button>
      <Card>
        <Row style={{ flexWrap:"wrap", gap:10, alignItems:"flex-start" }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:20, fontWeight:800, color:C.text, marginBottom:4, letterSpacing:"-0.02em", fontFamily:C.sans }}>{act.name}</div>
            <div style={{ fontSize:12, color:C.sub, marginBottom:10, fontFamily:C.sans }}>{new Date(act.start_date_local).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}{act.gear?.name?` · ${act.gear.name}`:""}</div>
            <Tag color={color}>{type}</Tag>
          </div>
          {act.suffer_score && <div style={{ textAlign:"right" }}><Label>Suffer</Label><BigNum size={28} color={C.orange} style={{ marginTop:4 }}>{act.suffer_score}</BigNum></div>}
        </Row>
      </Card>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
        <Tile label="Distance" value={`${fDist(act.distance)}km`}/>
        <Tile label="Time" value={fTime(act.moving_time)} color={C.text}/>
        <Tile label="Avg Pace" value={fPace(act.average_speed)+"/km"}/>
        {act.average_heartrate && <Tile label="Avg HR" value={`${Math.round(act.average_heartrate)}`} sub="bpm" color={C.red}/>}
        {act.max_heartrate && <Tile label="Max HR" value={`${act.max_heartrate}`} sub="bpm" color={C.red}/>}
        {act.average_cadence && <Tile label="Cadence" value={`${Math.round(act.average_cadence*2)}`} sub="spm" color={C.blue}/>}
        {act.total_elevation_gain>0 && <Tile label="Elevation" value={`${Math.round(act.total_elevation_gain)}m`} color={C.green}/>}
      </div>
      {laps.length>1 && (
        <Card>
          <SectionHeader title="Splits"/>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {laps.map((lap,i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:12, background:C.bg, borderRadius:12, padding:"10px 14px" }}>
                <div style={{ fontSize:11, color:C.muted, minWidth:44, fontWeight:600, fontFamily:C.sans }}>Lap {i+1}</div>
                <div style={{ fontSize:15, fontWeight:700, color:C.orange, flex:1, fontFamily:C.sans }}>{fPace(lap.average_speed)}/km</div>
                <div style={{ fontSize:12, color:C.sub, fontFamily:C.sans }}>{(lap.distance/1000).toFixed(2)}km</div>
                {lap.average_heartrate && <div style={{ fontSize:12, color:C.red, fontFamily:C.sans }}>{Math.round(lap.average_heartrate)} bpm</div>}
              </div>
            ))}
          </div>
        </Card>
      )}
      {hrChart.length>5 && (
        <Card>
          <SectionHeader title="Heart Rate" color={C.red}/>
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
          <SectionHeader title="Best Efforts"/>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
            {act.best_efforts.slice(0,6).map((b,i) => (
              <div key={i} style={{ background:C.bg, borderRadius:12, padding:"12px 14px" }}>
                <Label style={{ marginBottom:5 }}>{b.name}</Label>
                <div style={{ fontSize:16, fontWeight:700, color:C.orange, fontFamily:C.sans }}>{fTime(b.moving_time)}</div>
                <Sub>{fPace(b.distance/b.moving_time)}/km</Sub>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── HEATMAP ──────────────────────────────────────────────────────────────────
function ConsistencyHeatmap({ activities }) {
  const runDates = new Set(activities.filter(a=>a.type==="Run"||a.sport_type==="Run").map(r=>new Date(r.start_date_local).toISOString().split("T")[0]));
  const today = new Date(); today.setHours(0,0,0,0);
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
      <SectionHeader title="Consistency" right={<span style={{ fontSize:12, color:C.sub, fontFamily:C.sans }}>{total} runs in 14 weeks</span>}/>
      <div style={{ overflowX:"auto" }}>
        <div style={{ display:"flex", gap:4, minWidth:"fit-content" }}>
          {weeks.map((week,wi) => (
            <div key={wi} style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {week.map((day,di) => (
                <div key={di} title={day.date} style={{ width:14, height:14, borderRadius:4, background:day.isFuture?C.bg:day.isRun?C.orange:C.divider, opacity:day.isFuture?0.3:1 }}/>
              ))}
            </div>
          ))}
        </div>
        <Row style={{ marginTop:8, fontSize:10, color:C.muted, fontFamily:C.sans }}>
          <span>{new Date(weeks[0][0].date).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</span>
          <span>Today</span>
        </Row>
      </div>
    </Card>
  );
}

// ─── HR ZONES ─────────────────────────────────────────────────────────────────
function HRZones({ activities }) {
  const MAX_HR = 208;
  const zones = [
    { name:"Z1 Recovery", min:0,   max:0.6,  color:"#3b82f6" },
    { name:"Z2 Aerobic",  min:0.6, max:0.7,  color:"#10b981" },
    { name:"Z3 Tempo",    min:0.7, max:0.8,  color:"#f59e0b" },
    { name:"Z4 Threshold",min:0.8, max:0.9,  color:C.orange },
    { name:"Z5 Max",      min:0.9, max:1.0,  color:C.red },
  ];
  const runs = activities.filter(a=>(a.type==="Run"||a.sport_type==="Run")&&a.average_heartrate).slice(0,20);
  if (!runs.length) return null;
  const zoneCounts = zones.map(z=>{
    const count = runs.filter(r=>{const p=r.average_heartrate/MAX_HR;return p>=z.min&&p<z.max;}).length;
    return {...z, count, pct:Math.round(count/runs.length*100)};
  });
  return (
    <Card>
      <SectionHeader title="HR Zone Distribution"/>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {zoneCounts.map((z,i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ fontSize:11, color:C.sub, minWidth:92, fontFamily:C.sans }}>{z.name}</div>
            <div style={{ flex:1, height:7, background:C.divider, borderRadius:4 }}>
              <div style={{ width:`${z.pct}%`, height:"100%", background:z.color, borderRadius:4, transition:"width .4s ease" }}/>
            </div>
            <div style={{ fontSize:12, color:z.color, minWidth:30, textAlign:"right", fontWeight:700, fontFamily:C.sans }}>{z.pct}%</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── RACE PREDICTOR ───────────────────────────────────────────────────────────
function RacePredictor({ activities }) {
  const runs = activities.filter(a=>(a.type==="Run"||a.sport_type==="Run")&&a.distance>3000&&a.average_speed).slice(0,10);
  if (runs.length<3) return null;
  const avgSpeed = runs.reduce((s,r)=>s+r.average_speed,0)/runs.length;
  const avgHR = runs.filter(r=>r.average_heartrate).reduce((s,r,i,a)=>s+r.average_heartrate/a.length,0);
  const hrFactor = avgHR ? Math.max(0.7, Math.min(1.1, 1-((avgHR/208)-0.75)*2)) : 1;
  const preds = [
    { dist:"5K", m:5000 }, { dist:"10K", m:10000 }, { dist:"Half", m:21097 }, { dist:"Full", m:42195 }
  ].map(r => {
    const fatigue = 1 + (r.m/42195)*0.08;
    const secs = Math.round(r.m/(avgSpeed*hrFactor/fatigue));
    return { ...r, time:fTime(secs), pace:fPace(r.m/secs) };
  });
  return (
    <Card>
      <SectionHeader title="Race Predictor" right={<span style={{ fontSize:11, color:C.muted, fontFamily:C.sans }}>Based on last {runs.length} runs</span>}/>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
        {preds.map(p => (
          <div key={p.dist} style={{ background:C.bg, borderRadius:14, padding:"13px 15px" }}>
            <Label style={{ marginBottom:6 }}>{p.dist}</Label>
            <div style={{ fontSize:18, fontWeight:700, color:C.orange, fontFamily:C.sans }}>{p.time}</div>
            <Sub>{p.pace}/km</Sub>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── BERLIN SPLIT CALC ────────────────────────────────────────────────────────
function BerlinSplitCalc() {
  const targets = [
    { label:"Sub 3:20", secs:200*60 },
    { label:"Sub 3:15", secs:195*60 },
    { label:"Sub 3:10", secs:190*60 },
  ];
  return (
    <Card>
      <SectionHeader title="Berlin Pace Targets"/>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {targets.map((t,i) => {
          const paceSecs = t.secs / 42.195;
          const mins = Math.floor(paceSecs / 60);
          const secs = Math.round(paceSecs % 60);
          const half = fTime(t.secs / 2);
          const isTarget = i === 0;
          return (
            <div key={i} style={{ background:isTarget?C.orangeL:C.bg, borderRadius:14, padding:"12px 16px", border:isTarget?`1.5px solid ${C.orangeB}`:"none" }}>
              <Row>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:isTarget?C.orange:C.text, fontFamily:C.sans }}>{t.label}</div>
                  <Sub>Half split: {half}</Sub>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:16, fontWeight:700, color:isTarget?C.orange:C.sub, fontFamily:C.sans }}>{mins}:{secs.toString().padStart(2,"0")}/km</div>
                </div>
              </Row>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── OVERVIEW ─────────────────────────────────────────────────────────────────
function Overview({ stats, activities, whoopData, whoopOk, onConnectWhoop, bestEfforts, gear, userPrefs, onSavePrefs, onRefreshWhoop, onGoToChat }) {
  const ytd = stats?.ytd_run_totals||{};
  const all = stats?.all_run_totals||{};
  const rec = whoopData?.recoveries?.records?.[0];
  const cyc = whoopData?.cycles?.records?.[0];
  const sleep = whoopData?.sleeps?.records?.[0];
  const streaks = calcStreaks(activities);
  const berlin = new Date("2026-09-28T00:00:00");
  const today = new Date();
  const daysLeft = Math.max(0, Math.ceil((berlin-today)/(1000*60*60*24)));
  const blockStart = new Date("2026-06-22T00:00:00");
  const progress = Math.min(100, Math.max(0, Math.round(((today-blockStart)/(berlin-blockStart))*100)));
  const recoveryScore = Math.round(rec?.score?.recovery_score||0);
  const vol = weeklyVol(activities);
  const paceTrend = vol.map(w => {
    const wr = activities.filter(a => {
      if (a.type!=="Run") return false;
      const d = new Date(a.start_date_local);
      const mon = new Date(d); mon.setDate(d.getDate()-((d.getDay()+6)%7));
      return mon.toLocaleDateString("en-GB",{day:"numeric",month:"short"})===w.week;
    });
    const avg = wr.length ? wr.reduce((s,r)=>s+(r.average_speed||0),0)/wr.length : 0;
    return { week:w.week, pace:avg?parseFloat((1000/avg/60).toFixed(2)):null };
  }).filter(w=>w.pace);
  const PBs = [{label:"5K",time:"18:42",pace:"3:44/km"},{label:"10K",time:"40:52",pace:"4:05/km"},{label:"HM",time:"1:32:48",pace:"4:23/km"},{label:"Mar",time:"3:48:59",pace:"5:25/km"}];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14, paddingBottom:20 }}>

      {/* Low recovery alert */}
      {whoopOk && rec && recoveryScore < 34 && (
        <div style={{ background:"#fff1f2", border:`1.5px solid #fecdd3`, borderRadius:16, padding:"12px 16px", display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:18 }}>⚠️</span>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:C.red, fontFamily:C.sans }}>Low recovery today ({recoveryScore}%)</div>
            <div style={{ fontSize:12, color:"#9f1239", fontFamily:C.sans, marginTop:2 }}>Consider an easy session or rest. Ask Claude to adjust your plan.</div>
          </div>
          <button onClick={onGoToChat} style={{ marginLeft:"auto", background:C.red, color:"#fff", border:"none", borderRadius:20, padding:"6px 14px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:C.sans, flexShrink:0 }}>Ask Claude</button>
        </div>
      )}

      {/* Hero row: Recovery + Berlin */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        {/* Recovery */}
        <Card style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"22px 16px", gap:10 }}>
          {whoopOk && rec ? (
            <>
              <div style={{ position:"relative" }}>
                <RecoveryRing score={recoveryScore} size={108}/>
                <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
                  <BigNum size={26} color={recCol(recoveryScore)}>{recoveryScore}%</BigNum>
                </div>
              </div>
              <Label style={{ textAlign:"center" }}>Recovery</Label>
              <Sub style={{ textAlign:"center", fontSize:11 }}>HRV {Math.round(rec.score?.hrv_rmssd_milli||0)}ms · RHR {Math.round(rec.score?.resting_heart_rate||0)}</Sub>
            </>
          ) : (
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:32, marginBottom:8 }}>💤</div>
              <div style={{ fontSize:13, fontWeight:600, color:C.text, fontFamily:C.sans, marginBottom:6 }}>Connect Whoop</div>
              <Pill onClick={onConnectWhoop} color={C.red} sm>Connect</Pill>
            </div>
          )}
        </Card>

        {/* Berlin countdown */}
        <Card style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"22px 16px", gap:8 }}>
          <BerlinArc progress={progress} daysLeft={daysLeft}/>
          <Label style={{ textAlign:"center" }}>Berlin Marathon</Label>
          <Sub style={{ textAlign:"center", fontSize:11 }}>Sub 3:20 · {progress}% through block</Sub>
        </Card>
      </div>

      {/* YTD stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
        <Tile label="YTD Distance" value={ytd.distance?`${(ytd.distance/1000).toFixed(1)}km`:"449.6km"} sub={`${ytd.count||58} runs`} color={C.orange}/>
        <Tile label="YTD Time" value={ytd.moving_time?`${(ytd.moving_time/3600).toFixed(1)}h`:"36.9h"} color={C.text}/>
        <Tile label="Current Streak" value={`${streaks.current}d`} color={streaks.current>6?C.green:streaks.current>2?C.orange:C.sub}/>
        <Tile label="All-Time" value={all.distance?`${(all.distance/1000).toFixed(0)}km`:"1093km"} sub={`${all.count||161} runs`} color={C.text}/>
      </div>

      {/* Today's sleep & strain */}
      {whoopOk && sleep && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
          <Tile label="Sleep Score" value={`${Math.round(sleep.score?.sleep_performance_percentage||0)}%`} color={C.blue}/>
          <Tile label="In Bed" value={sleep.score?.stage_summary?.total_in_bed_time_milli?`${(sleep.score.stage_summary.total_in_bed_time_milli/3600000).toFixed(1)}h`:"--"} color={C.blue}/>
          <Tile label="Strain" value={cyc?.score?.strain?.toFixed(1)||"--"} color={C.orange}/>
        </div>
      )}

      {/* PBs */}
      <Card>
        <SectionHeader title="Personal Bests"/>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
          {bestEfforts&&Object.values(bestEfforts).some(Boolean) ? (
            Object.entries(bestEfforts).filter(([,v])=>v).map(([name,effort]) => (
              <div key={name} style={{ background:C.bg, borderRadius:14, padding:"12px 14px" }}>
                <Label style={{ marginBottom:5 }}>{name}</Label>
                <div style={{ fontSize:17, fontWeight:700, color:C.orange, fontFamily:C.sans }}>{fTime(effort.moving_time)}</div>
                <Sub>{fPace(effort.distance/effort.moving_time)}/km</Sub>
              </div>
            ))
          ) : PBs.map(pb => (
            <div key={pb.label} style={{ background:C.bg, borderRadius:14, padding:"12px 14px" }}>
              <Label style={{ marginBottom:5 }}>{pb.label}</Label>
              <div style={{ fontSize:17, fontWeight:700, color:C.orange, fontFamily:C.sans }}>{pb.time}</div>
              <Sub>{pb.pace}</Sub>
            </div>
          ))}
        </div>
      </Card>

      {/* Pace trend */}
      {paceTrend.length>2 && (
        <Card>
          <SectionHeader title="Pace Trend" right={<span style={{ fontSize:11, color:C.muted, fontFamily:C.sans }}>min/km, lower = faster</span>}/>
          <ResponsiveContainer width="100%" height={110}>
            <LineChart data={paceTrend}>
              <XAxis dataKey="week" tick={{fontSize:10,fill:C.muted,fontFamily:C.sans}} tickLine={false} axisLine={false} interval={2}/>
              <YAxis tick={{fontSize:10,fill:C.muted}} tickLine={false} axisLine={false} width={26} reversed domain={["auto","auto"]}/>
              <Tooltip content={<CT/>}/>
              <Line type="monotone" dataKey="pace" name="min/km" stroke={C.orange} strokeWidth={2.5} dot={{fill:C.orange,r:3}} connectNulls/>
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      <BerlinSplitCalc/>
      <RacePredictor activities={activities}/>

      {/* Weight trend */}
      {userPrefs?.weightLog && userPrefs.weightLog.length>1 && (() => {
        const log = userPrefs.weightLog.slice(-14);
        return (
          <Card>
            <SectionHeader title="Weight" right={<span style={{ fontSize:12, color:C.sub, fontFamily:C.sans }}>Target 65kg</span>}/>
            <ResponsiveContainer width="100%" height={100}>
              <LineChart data={log}>
                <XAxis dataKey="date" tick={{fontSize:9,fill:C.muted,fontFamily:C.sans}} tickLine={false} axisLine={false} interval={2}/>
                <YAxis tick={{fontSize:9,fill:C.muted}} tickLine={false} axisLine={false} width={30} domain={["auto","auto"]} unit="kg"/>
                <Tooltip content={<CT/>}/>
                <Line type="monotone" dataKey="weight" name="kg" stroke={C.orange} strokeWidth={2} dot={{fill:C.orange,r:3}} connectNulls/>
              </LineChart>
            </ResponsiveContainer>
            <Row style={{ marginTop:8, fontSize:12, color:C.sub, fontFamily:C.sans }}>
              <span>Now: {log[log.length-1]?.weight}kg</span>
              <span style={{ color:C.orange }}>+{(65-log[log.length-1]?.weight).toFixed(1)}kg to go</span>
            </Row>
          </Card>
        );
      })()}

      {/* Fundraising */}
      <Card>
        <SectionHeader title="Fundraising"/>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {[
            { race:"London 2024", charity:"DFSG", raised:2500, target:2500, done:true },
            { race:"London 2026", charity:"DFSG", raised:2500, target:2500, done:true },
            { race:"Berlin 2026", charity:"Get Kids Going", raised:0, target:2000, done:false },
          ].map((f,i) => (
            <div key={i} style={{ background:C.bg, borderRadius:14, padding:"12px 16px" }}>
              <Row style={{ marginBottom:7 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:C.text, fontFamily:C.sans }}>{f.race}</div>
                  <Sub>{f.charity}</Sub>
                </div>
                <div style={{ fontSize:15, fontWeight:700, color:f.done?C.green:C.orange, fontFamily:C.sans }}>£{f.raised.toLocaleString()}</div>
              </Row>
              <div style={{ height:5, background:C.divider, borderRadius:3 }}>
                <div style={{ width:`${Math.min(100,Math.round(f.raised/f.target*100))}%`, height:"100%", background:f.done?C.green:C.orange, borderRadius:3 }}/>
              </div>
              <Row style={{ marginTop:5, fontSize:10, color:C.muted, fontFamily:C.sans }}>
                <span>{Math.round(f.raised/f.target*100)}% of £{f.target.toLocaleString()}</span>
                {f.done && <span style={{ color:C.green, fontWeight:600 }}>Complete</span>}
              </Row>
            </div>
          ))}
          <div style={{ background:C.orangeL, borderRadius:14, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ fontSize:13, fontWeight:700, color:C.orange, fontFamily:C.sans }}>Total Raised</div>
            <div style={{ fontSize:20, fontWeight:800, color:C.orange, fontFamily:C.sans }}>£5,000+</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── RUNNING ──────────────────────────────────────────────────────────────────
function RunCard({ run: r, onSelect }) {
  const [weather, setWeather] = useState(null);
  const t = actType(r);
  const col = typeCol(t);
  useEffect(() => {
    if (!r.start_latlng?.[0]) return;
    fetchWeather(r.start_latlng[0], r.start_latlng[1], new Date(r.start_date_local).toISOString().split("T")[0]).then(w => { if(w) setWeather(w); });
  }, [r.id]);
  return (
    <button onClick={onSelect} style={{ background:C.bg, border:"none", borderRadius:14, padding:"13px 16px", display:"flex", alignItems:"center", gap:12, textAlign:"left", width:"100%", cursor:"pointer" }}>
      <div style={{ width:8, height:8, borderRadius:"50%", background:col, flexShrink:0 }}/>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:600, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontFamily:C.sans, marginBottom:3 }}>{r.name}</div>
        <div style={{ fontSize:11, color:C.sub, fontFamily:C.sans, display:"flex", gap:8, alignItems:"center" }}>
          <span>{new Date(r.start_date_local).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</span>
          {r.gear?.name && <span>· {r.gear.name}</span>}
          {weather && <span>{WX_EMOJI[weather.code]||""} {weather.temp}°C</span>}
        </div>
      </div>
      <div style={{ textAlign:"right", flexShrink:0 }}>
        <div style={{ fontSize:14, fontWeight:700, color:C.orange, fontFamily:C.sans }}>{fDist(r.distance)}km</div>
        <Sub style={{ fontSize:11 }}>{fPace(r.average_speed)}/km</Sub>
      </div>
      <div style={{ color:C.muted, fontSize:16 }}>›</div>
    </button>
  );
}

function Running({ activities, stats, gear }) {
  const [sel, setSel] = useState(null);
  const runs = activities.filter(a=>a.type==="Run"||a.sport_type==="Run");
  const vol = weeklyVol(activities);
  const ytd = stats?.ytd_run_totals||{};
  if (sel) return <ActivityDetail id={sel} onBack={()=>setSel(null)}/>;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14, paddingBottom:20 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
        <Tile label="YTD Distance" value={ytd.distance?`${(ytd.distance/1000).toFixed(1)}km`:"449.6km"} sub={`${ytd.count||58} runs`} color={C.orange}/>
        <Tile label="YTD Time" value={ytd.moving_time?`${(ytd.moving_time/3600).toFixed(1)}h`:"36.9h"} color={C.text}/>
        <Tile label="All-Time" value={stats?.all_run_totals?.distance?`${(stats.all_run_totals.distance/1000).toFixed(0)}km`:"1093km"} color={C.text}/>
        <Tile label="Elevation YTD" value={ytd.elevation_gain?`${ytd.elevation_gain}m`:"846m"} color={C.green}/>
      </div>
      <ConsistencyHeatmap activities={activities}/>
      <Card>
        <SectionHeader title="Weekly Volume"/>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={vol}>
            <XAxis dataKey="week" tick={{fontSize:10,fill:C.muted,fontFamily:C.sans}} tickLine={false} axisLine={false} interval={2}/>
            <YAxis tick={{fontSize:10,fill:C.muted}} tickLine={false} axisLine={false} unit="k" width={26}/>
            <Tooltip content={<CT/>}/>
            <Bar dataKey="km" name="km" fill={C.orange} radius={[5,5,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <HRZones activities={activities}/>
      {gear?.length>0 && (
        <Card>
          <SectionHeader title="Shoe Mileage"/>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {gear.map((s,i) => {
              const km = (s.distance||0)/1000;
              const pct = Math.min(100, Math.round(km/800*100));
              return (
                <div key={i} style={{ background:C.bg, borderRadius:14, padding:"12px 16px" }}>
                  <Row style={{ marginBottom:8 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:C.text, fontFamily:C.sans }}>{s.name}</div>
                      {s.brand_name && <Sub>{s.brand_name}</Sub>}
                    </div>
                    <div style={{ fontSize:14, fontWeight:700, color:pct>80?C.red:C.orange, fontFamily:C.sans }}>{km.toFixed(0)}km</div>
                  </Row>
                  <div style={{ height:6, background:C.divider, borderRadius:3 }}>
                    <div style={{ width:`${pct}%`, height:"100%", background:pct>80?C.red:pct>50?C.yellow:C.green, borderRadius:3 }}/>
                  </div>
                  <div style={{ fontSize:10, color:pct>80?C.red:C.muted, marginTop:4, fontFamily:C.sans, fontWeight:pct>80?600:400 }}>{pct>80?"Replace soon: ":""}{pct}% of 800km</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
      <Card>
        <SectionHeader title="Recent Runs"/>
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {runs.slice(0,30).map(r => <RunCard key={r.id} run={r} onSelect={()=>setSel(r.id)}/>)}
        </div>
      </Card>
    </div>
  );
}

// ─── GYM ──────────────────────────────────────────────────────────────────────
function Gym({ activities, userPrefs, onSavePrefs, savedWorkout }) {
  const [editing, setEditing] = useState(false);
  const [workout, setWorkout] = useState(null);
  const lifts = userPrefs?.lifts||DEFAULT_LIFTS;
  const [editLifts, setEditLifts] = useState(lifts);
  const sessions = activities.filter(a=>a.type==="WeightTraining"||(a.name||"").toLowerCase().includes("gym")||(a.name||"").toLowerCase().includes("weight"));
  useEffect(() => { if(savedWorkout) setWorkout(savedWorkout); }, [savedWorkout]);
  const save = () => { onSavePrefs({...userPrefs,lifts:editLifts}); setEditing(false); };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14, paddingBottom:20 }}>
      {workout && (
        <Card style={{ border:`1.5px solid ${C.orangeB}`, background:C.orangeL }}>
          <Row style={{ marginBottom:14 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:C.text, fontFamily:C.sans }}>{workout.title}</div>
              <Sub>{new Date(workout.date).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}</Sub>
            </div>
            <button onClick={()=>setWorkout(null)} style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.sub, borderRadius:20, padding:"3px 10px", fontSize:11, cursor:"pointer", fontFamily:C.sans }}>Clear</button>
          </Row>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {workout.exercises.map((ex,i) => (
              <div key={i} style={{ background:C.surface, borderRadius:14, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:C.text, fontFamily:C.sans }}>{ex.name}</div>
                  {ex.notes && <Sub style={{ marginTop:2 }}>{ex.notes}</Sub>}
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:C.orange, fontFamily:C.sans }}>{ex.sets}x{ex.reps}</div>
                  <Sub style={{ fontSize:11 }}>{ex.weight}</Sub>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop:10, fontSize:11, color:C.orange, fontFamily:C.sans }}>Generated by Claude</div>
        </Card>
      )}
      <Card>
        <SectionHeader title="Current Lifts" right={<EditBtn editing={editing} onToggle={()=>{if(editing)save();else{setEditLifts(lifts);setEditing(true);}}}/>}/>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {(editing?editLifts:lifts).map((l,i) => (
            <div key={i} style={{ background:C.bg, borderRadius:14, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", gap:10 }}>
              {editing ? (
                <>
                  <TxtInput value={l.name} onChange={v=>setEditLifts(p=>p.map((x,j)=>j===i?{...x,name:v}:x))} style={{ flex:1 }}/>
                  <TxtInput value={l.weight} onChange={v=>setEditLifts(p=>p.map((x,j)=>j===i?{...x,weight:v}:x))} style={{ width:100 }}/>
                  <TxtInput value={`${l.sets}x${l.reps}`} onChange={v=>{const[s,r]=(v.split("x")||["3","10"]);setEditLifts(p=>p.map((x,j)=>j===i?{...x,sets:parseInt(s)||3,reps:parseInt(r)||10}:x));}} style={{ width:60 }}/>
                  <button onClick={()=>setEditLifts(p=>p.filter((_,j)=>j!==i))} style={{ background:"transparent", border:"none", color:C.red, cursor:"pointer", fontSize:18 }}>×</button>
                </>
              ) : (
                <>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:C.text, fontFamily:C.sans }}>{l.name}</div>
                    <Sub>{l.sets} sets x {l.reps} reps</Sub>
                  </div>
                  <div style={{ fontSize:14, fontWeight:700, color:C.orange, fontFamily:C.sans }}>{l.weight}</div>
                </>
              )}
            </div>
          ))}
          {editing && <button onClick={()=>setEditLifts(p=>[...p,{name:"New Exercise",weight:"0kg",sets:3,reps:10}])} style={{ background:"transparent", border:`1.5px dashed ${C.border}`, borderRadius:14, padding:"10px", color:C.sub, cursor:"pointer", fontSize:13, fontFamily:C.sans }}>+ Add exercise</button>}
        </div>
      </Card>
      {sessions.length>0 && (
        <Card>
          <SectionHeader title="Recent Sessions"/>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {sessions.slice(0,8).map(s => (
              <div key={s.id} style={{ background:C.bg, borderRadius:14, padding:"11px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:C.text, fontFamily:C.sans }}>{s.name}</div>
                  <Sub>{new Date(s.start_date_local).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</Sub>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:C.orange, fontFamily:C.sans }}>{fTime(s.moving_time)}</div>
                  {s.average_heartrate && <Sub style={{ color:C.red }}>{Math.round(s.average_heartrate)} bpm</Sub>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── RECOVERY ─────────────────────────────────────────────────────────────────
function Recovery({ whoopData, whoopOk, onConnectWhoop, onRefreshWhoop }) {
  if (!whoopOk) return (
    <Card style={{ textAlign:"center", padding:"56px 24px" }}>
      <div style={{ fontSize:48, marginBottom:16 }}>⌚</div>
      <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:6, fontFamily:C.sans }}>Connect Whoop</div>
      <div style={{ fontSize:14, color:C.sub, marginBottom:24, lineHeight:1.6, maxWidth:260, margin:"0 auto 24px", fontFamily:C.sans }}>Live recovery, HRV, sleep stages, daily strain and respiratory rate.</div>
      <Pill onClick={onConnectWhoop} color={C.red}>Connect Whoop</Pill>
    </Card>
  );
  const recs = whoopData?.recoveries?.records||[];
  const sleeps = whoopData?.sleeps?.records||[];
  const cycles = whoopData?.cycles?.records||[];
  const latest = recs[0];
  const latestSleep = sleeps[0];
  if (!latest && !latestSleep) return (
    <Card style={{ textAlign:"center", padding:"40px 24px" }}>
      <div style={{ fontSize:14, color:C.sub, marginBottom:16, fontFamily:C.sans }}>No Whoop data loaded yet.</div>
      <Pill onClick={onRefreshWhoop} color={C.orange} sm>Load Data</Pill>
    </Card>
  );
  const hrvChart = recs.slice(0,14).reverse().map(r=>({ day:new Date(r.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"}), hrv:Math.round(r.score?.hrv_rmssd_milli||0), rhr:Math.round(r.score?.resting_heart_rate||0) }));
  const recChart = recs.slice(0,14).reverse().map(r=>({ day:new Date(r.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"}), score:Math.round(r.score?.recovery_score||0) }));
  const sleepChart = sleeps.slice(0,14).reverse().map(s=>({ day:new Date(s.start).toLocaleDateString("en-GB",{day:"numeric",month:"short"}), hours:s.score?.stage_summary?.total_in_bed_time_milli?parseFloat((s.score.stage_summary.total_in_bed_time_milli/3600000).toFixed(1)):0 }));
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14, paddingBottom:20 }}>
      <div style={{ display:"flex", justifyContent:"flex-end" }}>
        <Pill onClick={onRefreshWhoop} color={C.orange} sm ghost>Refresh Whoop</Pill>
      </div>
      {latest && (
        <Card>
          <SectionHeader title="Today's Recovery" color={C.red}/>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
            <Tile label="Recovery Score" value={`${Math.round(latest.score?.recovery_score||0)}%`} color={recCol(latest.score?.recovery_score)} size={30}/>
            <Tile label="HRV" value={`${Math.round(latest.score?.hrv_rmssd_milli||0)}`} sub="ms rMSSD" color={C.green} size={30}/>
            <Tile label="Resting HR" value={`${Math.round(latest.score?.resting_heart_rate||0)}`} sub="bpm" color={C.red}/>
            <Tile label="Resp Rate" value={latest.score?.respiratory_rate?`${latest.score.respiratory_rate.toFixed(1)}`:"--"} sub="breaths/min" color={C.purple}/>
          </div>
        </Card>
      )}
      {latestSleep && (
        <Card>
          <SectionHeader title="Last Night's Sleep"/>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
            <Tile label="Sleep Score" value={`${Math.round(latestSleep.score?.sleep_performance_percentage||0)}%`} color={C.blue}/>
            <Tile label="In Bed" value={latestSleep.score?.stage_summary?.total_in_bed_time_milli?`${(latestSleep.score.stage_summary.total_in_bed_time_milli/3600000).toFixed(1)}h`:"--"} color={C.blue}/>
            <Tile label="REM" value={latestSleep.score?.stage_summary?.total_rem_sleep_time_milli?`${(latestSleep.score.stage_summary.total_rem_sleep_time_milli/60000).toFixed(0)}m`:"--"} color={C.purple}/>
            <Tile label="Deep Sleep" value={latestSleep.score?.stage_summary?.total_slow_wave_sleep_time_milli?`${(latestSleep.score.stage_summary.total_slow_wave_sleep_time_milli/60000).toFixed(0)}m`:"--"} color={C.green}/>
          </div>
        </Card>
      )}
      {hrvChart.length>0 && (
        <Card>
          <SectionHeader title="HRV and Resting HR — 14 Days"/>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={hrvChart}>
              <XAxis dataKey="day" tick={{fontSize:10,fill:C.muted,fontFamily:C.sans}} tickLine={false} axisLine={false} interval={2}/>
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
          <SectionHeader title="Recovery Score — 14 Days"/>
          <ResponsiveContainer width="100%" height={110}>
            <BarChart data={recChart}>
              <XAxis dataKey="day" tick={{fontSize:10,fill:C.muted,fontFamily:C.sans}} tickLine={false} axisLine={false} interval={2}/>
              <YAxis tick={{fontSize:10,fill:C.muted}} tickLine={false} axisLine={false} domain={[0,100]} width={28}/>
              <Tooltip content={<CT/>}/>
              <Bar dataKey="score" name="Recovery" fill={C.green} radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
      {sleepChart.length>0 && (
        <Card>
          <SectionHeader title="Sleep Duration — 14 Days"/>
          <ResponsiveContainer width="100%" height={110}>
            <BarChart data={sleepChart}>
              <XAxis dataKey="day" tick={{fontSize:10,fill:C.muted,fontFamily:C.sans}} tickLine={false} axisLine={false} interval={2}/>
              <YAxis tick={{fontSize:10,fill:C.muted}} tickLine={false} axisLine={false} width={28} unit="h"/>
              <Tooltip content={<CT/>}/>
              <Bar dataKey="hours" name="Hours" fill={C.blue} radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
      {cycles.length>0 && (
        <Card>
          <SectionHeader title="Daily Strain"/>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {cycles.slice(0,7).map((c,i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:12, background:C.bg, borderRadius:12, padding:"10px 14px" }}>
                <div style={{ fontSize:11, color:C.sub, minWidth:60, fontFamily:C.sans }}>{new Date(c.start).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</div>
                <div style={{ flex:1, height:7, background:C.divider, borderRadius:4 }}>
                  <div style={{ width:`${Math.min((c.score?.strain||0)/21*100,100)}%`, height:"100%", background:C.orange, borderRadius:4 }}/>
                </div>
                <div style={{ fontSize:13, fontWeight:700, color:C.orange, minWidth:30, textAlign:"right", fontFamily:C.sans }}>{c.score?.strain?.toFixed(1)||"--"}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── PLAN ─────────────────────────────────────────────────────────────────────
function SessionCard({ session: s, typeC, onToggleDone }) {
  const [expanded, setExpanded] = useState(false);
  const col = s.done ? C.green : (typeC[s.type]||C.orange);
  const isRest = s.type==="Rest";
  return (
    <div style={{ background:s.done?C.greenL:C.surface, border:`1px solid ${s.done?C.green+"30":C.border}`, borderRadius:16, padding:16, opacity:isRest?0.5:1 }}>
      <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
        <div style={{ textAlign:"center", minWidth:40, flexShrink:0 }}>
          <Label style={{ marginBottom:5, fontSize:9 }}>{s.day?.slice(0,3)?.toUpperCase()}</Label>
          <button onClick={()=>onToggleDone&&onToggleDone()} style={{ width:36, height:36, borderRadius:"50%", background:s.done?C.green:`${col}15`, border:`2px solid ${s.done?C.green:col+"50"}`, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0 }}>
            {s.done ? <span style={{ color:"#fff", fontSize:14 }}>✓</span> : <div style={{ width:10, height:10, borderRadius:"50%", background:col }}/>}
          </button>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <button onClick={()=>!isRest&&setExpanded(!expanded)} style={{ background:"transparent", border:"none", width:"100%", textAlign:"left", cursor:isRest?"default":"pointer", padding:0 }}>
            <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5, flexWrap:"wrap" }}>
                  <span style={{ fontSize:14, fontWeight:700, color:s.done?C.green:C.text, textDecoration:s.done?"line-through":"none", fontFamily:C.sans }}>{s.type}</span>
                  {s.dist&&s.dist!=="0km"&&<Tag color={col}>{s.dist}</Tag>}
                  {s.pace&&s.pace!=="N/A"&&<Tag color={s.done?C.green:C.orange}>{s.pace}</Tag>}
                </div>
                {s.shoe&&s.shoe!=="N/A"&&<div style={{ fontSize:12, color:C.purple, marginBottom:3, fontFamily:C.sans }}>👟 {s.shoe}</div>}
                {!expanded&&s.notes&&<div style={{ fontSize:12, color:C.sub, lineHeight:1.5, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontFamily:C.sans }}>{s.notes}</div>}
              </div>
              {!isRest&&<div style={{ color:C.muted, fontSize:13, flexShrink:0 }}>{expanded?"▲":"▼"}</div>}
            </div>
          </button>
          {expanded && (
            <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid ${C.divider}` }}>
              {s.notes && <div style={{ fontSize:13, color:C.sub, lineHeight:1.7, marginBottom:12, fontFamily:C.sans }}>{s.notes}</div>}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
                {s.dist&&s.dist!=="0km"&&<Tile label="Distance" value={s.dist} size={16} color={C.text}/>}
                {s.pace&&s.pace!=="N/A"&&<Tile label="Target Pace" value={s.pace} size={16} color={C.orange} bg={C.orangeL}/>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TrainingPlan({ onChat, externalPlan, whoopData, onGoToChat }) {
  const [plan, setPlan] = useState(null);
  const [planLoaded, setPlanLoaded] = useState(false);
  useEffect(() => { loadTrainingPlan().then(p => { if(p) setPlan(p); setPlanLoaded(true); }).catch(()=>setPlanLoaded(true)); }, []);
  const savePlan = p => { setPlan(p); saveTrainingPlan(p); };
  useEffect(() => { if(externalPlan&&planLoaded) savePlan(externalPlan); }, [externalPlan,planLoaded]);
  const typeC = { Rest:C.muted, Easy:C.green, Interval:C.red, Tempo:C.yellow, "Long Run":C.blue, Gym:C.orange };
  const toggleDone = i => savePlan({ ...plan, sessions: plan.sessions.map((s,j)=>j===i?{...s,done:!s.done}:s) });
  const rec = whoopData?.recoveries?.records?.[0];
  const recoveryScore = Math.round(rec?.score?.recovery_score||0);
  const lowRecovery = rec && recoveryScore < 34;
  const done = plan ? plan.sessions.filter(s=>s.done).length : 0;
  const total = plan ? plan.sessions.filter(s=>s.type!=="Rest").length : 0;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14, paddingBottom:20 }}>
      {!plan ? (
        <Card style={{ textAlign:"center", padding:"56px 24px" }}>
          <div style={{ fontSize:44, marginBottom:16 }}>📋</div>
          <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:6, fontFamily:C.sans }}>No training plan yet</div>
          <div style={{ fontSize:14, color:C.sub, marginBottom:8, lineHeight:1.6, maxWidth:280, margin:"0 auto 8px", fontFamily:C.sans }}>Ask Claude to build your next 1 or 2 weeks.</div>
          <div style={{ fontSize:12, color:C.muted, marginBottom:24, fontFamily:C.sans }}>Plans adapt based on your recovery and how sessions actually go.</div>
          <Pill onClick={onChat} color={C.orange} sm>Open Chat</Pill>
        </Card>
      ) : (
        <>
          {/* Recovery-aware banner */}
          {lowRecovery && (
            <div style={{ background:"#fff1f2", border:`1.5px solid #fecdd3`, borderRadius:16, padding:"12px 16px", display:"flex", alignItems:"center", gap:10 }}>
              <span>⚠️</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700, color:C.red, fontFamily:C.sans }}>Recovery {recoveryScore}% today</div>
                <div style={{ fontSize:12, color:"#9f1239", fontFamily:C.sans, marginTop:2 }}>Your plan may need adjusting. Ask Claude to shift sessions or swap in a rest day.</div>
              </div>
              <button onClick={onGoToChat} style={{ background:C.red, color:"#fff", border:"none", borderRadius:20, padding:"6px 14px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:C.sans, flexShrink:0 }}>Ask Claude</button>
            </div>
          )}
          <Card>
            <Row style={{ flexWrap:"wrap", gap:10 }}>
              <div>
                <div style={{ fontSize:16, fontWeight:700, color:C.text, fontFamily:C.sans }}>{plan.title}</div>
                {plan.startDate && <Sub>Starting {new Date(plan.startDate).toLocaleDateString("en-GB",{day:"numeric",month:"long"})}</Sub>}
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <div style={{ fontSize:12, color:C.sub, fontFamily:C.sans }}>{done}/{total} sessions done</div>
                <Pill onClick={async()=>{
                  try {
                    const res=await fetch("/.netlify/functions/export-plan-pdf",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({plan})});
                    const data=await res.json();
                    if(data.html){const blob=new Blob([data.html],{type:"text/html"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`${plan.title.replace(/\s+/g,"-")}.html`;a.click();URL.revokeObjectURL(url);}
                  }catch(e){console.error(e);}
                }} color={C.blue} sm ghost>Export</Pill>
                <Pill onClick={()=>savePlan(null)} color={C.muted} sm ghost>Clear</Pill>
              </div>
            </Row>
            {total>0 && (
              <div style={{ marginTop:14 }}>
                <div style={{ height:6, background:C.divider, borderRadius:3 }}>
                  <div style={{ width:`${Math.round(done/total*100)}%`, height:"100%", background:C.green, borderRadius:3, transition:"width .4s ease" }}/>
                </div>
                <div style={{ fontSize:11, color:C.muted, marginTop:4, fontFamily:C.sans }}>{Math.round(done/total*100)}% complete</div>
              </div>
            )}
          </Card>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {plan.sessions.map((s,i) => <SessionCard key={i} session={s} typeC={typeC} onToggleDone={()=>toggleDone(i)}/>)}
          </div>
          <div style={{ background:C.bg, borderRadius:16, padding:"14px 16px", textAlign:"center" }}>
            <div style={{ fontSize:13, color:C.sub, fontFamily:C.sans, marginBottom:10 }}>Need to adjust this plan? Ask Claude.</div>
            <Pill onClick={onGoToChat} color={C.orange} sm>Open Chat</Pill>
          </div>
        </>
      )}
    </div>
  );
}

// ─── NUTRITION ────────────────────────────────────────────────────────────────
function Nutrition({ userPrefs, onSavePrefs }) {
  const today = new Date().toISOString().split("T")[0];
  const log = userPrefs?.nutrition||{};
  const todayLog = log[today]||{ kcal:"", carbs:"", protein:"", notes:"" };
  const [entry, setEntry] = useState(todayLog);
  const [saved, setSaved] = useState(false);
  const targets = { kcal:3000, carbs:300, protein:140 };
  const save = () => {
    onSavePrefs({...userPrefs, nutrition:{...log,[today]:entry}});
    setSaved(true); setTimeout(()=>setSaved(false),2000);
  };
  const recent = Object.entries(log).sort(([a],[b])=>b.localeCompare(a)).slice(0,7);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14, paddingBottom:20 }}>
      <Card>
        <SectionHeader title="Today's Nutrition"/>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:14 }}>
          {[
            { key:"kcal",    label:"Calories", target:targets.kcal,    unit:"kcal", color:C.orange },
            { key:"carbs",   label:"Carbs",    target:targets.carbs,   unit:"g",    color:C.blue },
            { key:"protein", label:"Protein",  target:targets.protein, unit:"g",    color:C.red },
          ].map(f => {
            const val = parseFloat(entry[f.key])||0;
            const pct = Math.min(100, Math.round(val/f.target*100));
            return (
              <div key={f.key} style={{ background:C.bg, borderRadius:14, padding:"12px 14px" }}>
                <Label style={{ marginBottom:6 }}>{f.label}</Label>
                <input type="number" value={entry[f.key]} onChange={e=>setEntry(prev=>({...prev,[f.key]:e.target.value}))} placeholder={String(f.target)}
                  style={{ width:"100%", background:"transparent", border:"none", borderBottom:`2px solid ${f.color}`, padding:"2px 0", fontSize:20, fontWeight:700, color:f.color, fontFamily:C.sans, outline:"none" }}/>
                <div style={{ fontSize:9, color:C.muted, marginTop:5, fontFamily:C.sans }}>of {f.target}{f.unit}</div>
                <div style={{ height:4, background:C.divider, borderRadius:2, marginTop:6 }}>
                  <div style={{ width:`${pct}%`, height:"100%", background:f.color, borderRadius:2 }}/>
                </div>
              </div>
            );
          })}
        </div>
        <TxtInput value={entry.notes} onChange={v=>setEntry(prev=>({...prev,notes:v}))} placeholder="Notes (pre-run meal, gel timing...)" style={{ marginBottom:10 }}/>
        <Pill onClick={save} color={saved?C.green:C.orange} full sm>{saved?"Saved!":"Save Today"}</Pill>
      </Card>
      <Card>
        <SectionHeader title="Daily Targets"/>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {[
            { label:"Calories",     val:"2,800 to 3,200 kcal", color:C.orange },
            { label:"Carbohydrates",val:"250 to 350g",          color:C.blue },
            { label:"Protein",      val:"130 to 150g",          color:C.red },
            { label:"Long runs",    val:"SiS Beta Fuel x30min", color:C.green },
          ].map((t,i) => (
            <Row key={i} style={{ background:C.bg, borderRadius:12, padding:"10px 14px" }}>
              <span style={{ fontSize:13, color:C.sub, fontFamily:C.sans }}>{t.label}</span>
              <span style={{ fontSize:13, fontWeight:600, color:t.color, fontFamily:C.sans }}>{t.val}</span>
            </Row>
          ))}
        </div>
        <Divider/>
        <div style={{ fontSize:11, fontWeight:600, color:C.sub, textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:10, fontFamily:C.sans }}>Log Weight</div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <input type="number" step="0.1" placeholder="e.g. 60.5"
            style={{ flex:1, background:C.bg, border:`1px solid ${C.border}`, borderRadius:10, padding:"8px 12px", color:C.text, fontSize:15, fontFamily:C.sans, fontWeight:700, outline:"none" }}
            onBlur={e=>{
              const w=parseFloat(e.target.value);
              if(!w)return;
              const wlog=userPrefs?.weightLog||[];
              const updated=[...wlog.filter(l=>l.date!==today),{date:today,weight:w}].slice(-60);
              onSavePrefs({...userPrefs,weightLog:updated});
              e.target.value="";
            }}/>
          <span style={{ fontSize:12, color:C.sub, fontFamily:C.sans, flexShrink:0 }}>kg · target 65kg</span>
        </div>
      </Card>
      {recent.length>0 && (
        <Card>
          <SectionHeader title="Recent Log"/>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {recent.map(([date,e]) => (
              <Row key={date} style={{ background:C.bg, borderRadius:12, padding:"10px 14px" }}>
                <div style={{ fontSize:12, color:C.sub, fontFamily:C.sans }}>{new Date(date).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}</div>
                <div style={{ display:"flex", gap:10 }}>
                  {e.kcal&&<span style={{ fontSize:12, color:C.orange, fontFamily:C.sans, fontWeight:600 }}>{e.kcal}kcal</span>}
                  {e.protein&&<span style={{ fontSize:12, color:C.red, fontFamily:C.sans }}>{e.protein}g P</span>}
                  {e.carbs&&<span style={{ fontSize:12, color:C.blue, fontFamily:C.sans }}>{e.carbs}g C</span>}
                </div>
              </Row>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── RACES ────────────────────────────────────────────────────────────────────
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
        <SectionHeader title="World Marathon Majors Mission" color={C.purple}/>
        <div style={{ fontSize:14, color:C.sub, lineHeight:1.7, marginBottom:14, fontFamily:C.sans }}>Running all six World Marathon Majors for a different charity each time, for brother Noah who has Duchenne Muscular Dystrophy. £5,000+ raised.</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
          <Tile label="Completed" value="2 / 6" sub="Both London" color={C.green}/>
          <Tile label="Raised" value="£5k+" sub="for charity" color={C.orange} bg={C.orangeL}/>
          <Tile label="Next Race" value="Berlin" sub="28 Sep 2026" color={C.orange}/>
          <Tile label="Sub-3 Goal" value="Seville" sub="Feb 2027" color={C.purple}/>
        </div>
      </Card>
      <Card>
        <SectionHeader title="Race Pipeline" right={<EditBtn editing={editing} onToggle={()=>{if(editing)save();else{setEditRaces(races);setEditSponsorship(sponsorship);setEditing(true);}}}/>}/>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {(editing?editRaces:races).map((r,i) => (
            <div key={i} style={{ background:r.next?C.orangeL:C.bg, borderRadius:14, padding:"14px 16px", border:r.next?`1.5px solid ${C.orangeB}`:`1px solid transparent`, opacity:r.done?0.5:1 }}>
              {editing ? (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  <div style={{ display:"flex", gap:8 }}>
                    <TxtInput value={r.name} onChange={v=>setEditRaces(p=>p.map((x,j)=>j===i?{...x,name:v}:x))} style={{ flex:1 }}/>
                    <TxtInput value={r.date} onChange={v=>setEditRaces(p=>p.map((x,j)=>j===i?{...x,date:v}:x))} style={{ width:120 }}/>
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <TxtInput value={r.charity} onChange={v=>setEditRaces(p=>p.map((x,j)=>j===i?{...x,charity:v}:x))} style={{ flex:1 }}/>
                    <TxtInput value={r.target} onChange={v=>setEditRaces(p=>p.map((x,j)=>j===i?{...x,target:v}:x))} style={{ width:100 }}/>
                  </div>
                  <button onClick={()=>setEditRaces(p=>p.filter((_,j)=>j!==i))} style={{ background:"transparent", border:"none", color:C.red, cursor:"pointer", fontSize:12, textAlign:"left", fontFamily:C.sans }}>Remove</button>
                </div>
              ) : (
                <Row style={{ flexWrap:"wrap", gap:8 }}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color:r.done?C.muted:r.next?C.orange:C.text, fontFamily:C.sans }}>{r.done?"✓ ":""}{r.name}</div>
                    <Sub>{r.date} · {r.charity}</Sub>
                  </div>
                  <Tag color={r.next?C.orange:C.sub}>{r.target}</Tag>
                </Row>
              )}
            </div>
          ))}
          {editing && <button onClick={()=>setEditRaces(p=>[...p,{name:"New Race",date:"TBC",charity:"TBC",target:"TBC"}])} style={{ background:"transparent", border:`1.5px dashed ${C.border}`, borderRadius:14, padding:"10px", color:C.sub, cursor:"pointer", fontSize:13, fontFamily:C.sans }}>+ Add race</button>}
        </div>
      </Card>
      <Card>
        <SectionHeader title="Sponsorship Tracker"/>
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {(editing?editSponsorship:sponsorship).map((s,i) => {
            const col = {success:C.green,pending:C.orange,future:C.purple}[s.state]||C.muted;
            return (
              <Row key={i} style={{ background:C.bg, borderRadius:12, padding:"10px 14px", gap:10 }}>
                {editing ? (
                  <>
                    <TxtInput value={s.name} onChange={v=>setEditSponsorship(p=>p.map((x,j)=>j===i?{...x,name:v}:x))} style={{ flex:1 }}/>
                    <TxtInput value={s.status} onChange={v=>setEditSponsorship(p=>p.map((x,j)=>j===i?{...x,status:v}:x))} style={{ flex:1 }}/>
                    <select value={s.state} onChange={e=>setEditSponsorship(p=>p.map((x,j)=>j===i?{...x,state:e.target.value}:x))} style={{ background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,padding:"5px 8px",fontSize:11,fontFamily:C.sans }}>
                      <option value="success">Success</option><option value="pending">Pending</option><option value="future">Future</option>
                    </select>
                    <button onClick={()=>setEditSponsorship(p=>p.filter((_,j)=>j!==i))} style={{ background:"transparent",border:"none",color:C.red,cursor:"pointer",fontSize:18 }}>×</button>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize:13, color:C.text, fontFamily:C.sans }}>{s.name}</span>
                    <span style={{ fontSize:11, color:col, fontWeight:600, fontFamily:C.sans }}>{s.status}</span>
                  </>
                )}
              </Row>
            );
          })}
          {editing && <button onClick={()=>setEditSponsorship(p=>[...p,{name:"New Brand",status:"Applied",state:"pending"}])} style={{ background:"transparent",border:`1.5px dashed ${C.border}`,borderRadius:12,padding:"8px",color:C.sub,cursor:"pointer",fontSize:13,fontFamily:C.sans }}>+ Add brand</button>}
        </div>
      </Card>
    </div>
  );
}

// ─── CHAT ─────────────────────────────────────────────────────────────────────
function Chat({ activities, stats, whoopData, whoopOk, onPlanSaved, onGymSaved, userPrefs }) {
  const [messages, setMessages] = useState([{role:"assistant",content:"Hi Caleb! I have your Strava data, Whoop recovery, nutrition logs and training plan all loaded. Ask me anything, or use a suggestion below to get started."}]);
  const [chatLoaded, setChatLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState([]);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);
  useEffect(() => { loadChatHistory().then(msgs=>{if(msgs&&msgs.length>0)setMessages(msgs);setChatLoaded(true);}).catch(()=>setChatLoaded(true)); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:"smooth"}); }, [messages]);
  useEffect(() => { if(chatLoaded) saveChatHistory(messages); }, [messages,chatLoaded]);

  const handleImages = e => {
    const files = Array.from(e.target.files);
    if(!files.length) return;
    let loaded=0; const newImgs=[];
    files.forEach(file=>{
      const reader=new FileReader();
      reader.onload=ev=>{newImgs.push({base64:ev.target.result.split(",")[1],mediaType:file.type,preview:ev.target.result});loaded++;if(loaded===files.length)setImages(prev=>[...prev,...newImgs].slice(0,5));};
      reader.readAsDataURL(file);
    });
  };

  const extractPlan = text => {
    if(!text.includes("PLAN_START")||!text.includes("PLAN_END"))return null;
    try {
      const section=text.split("PLAN_START")[1].split("PLAN_END")[0].trim();
      const lines=section.split("\n").map(l=>l.trim()).filter(Boolean);
      let title="Training Plan"; const sessions=[];
      for(const line of lines){
        if(line.startsWith("TITLE:")){title=line.replace("TITLE:","").trim();continue;}
        const parts=line.split("|").map(p=>p.trim());
        if(parts.length>=4)sessions.push({day:parts[0],type:parts[1],dist:parts[2],pace:parts[3],shoe:parts[4]||"",notes:parts[5]||""});
      }
      if(sessions.length>=3)return{title,startDate:new Date().toISOString().split("T")[0],sessions};
    }catch(e){console.error(e);}
    return null;
  };

  const extractGym = text => {
    if(!text.includes("GYM_START")||!text.includes("GYM_END"))return null;
    try {
      const section=text.split("GYM_START")[1].split("GYM_END")[0].trim();
      const lines=section.split("\n").map(l=>l.trim()).filter(Boolean);
      let title="Gym Session"; const exercises=[];
      for(const line of lines){
        if(line.startsWith("TITLE:")){title=line.replace("TITLE:","").trim();continue;}
        const parts=line.split("|").map(p=>p.trim());
        if(parts.length>=3){const nums=parts[1].match(/(\d+)[xX](\d+)/);exercises.push({name:parts[0],sets:nums?parseInt(nums[1]):3,reps:nums?parseInt(nums[2]):10,weight:parts[2],notes:parts[3]||""});}
      }
      if(exercises.length>=1)return{title,exercises,date:new Date().toISOString().split("T")[0]};
    }catch(e){console.error(e);}
    return null;
  };

  const cleanReply = text => {
    let out=text;
    if(out.includes("PLAN_START")&&out.includes("PLAN_END")){const b=out.split("PLAN_START")[0].trim();const a=out.split("PLAN_END")[1]?.trim()||"";out=(b+(a?"\n\n"+a:"")).trim();}
    if(out.includes("GYM_START")&&out.includes("GYM_END")){const b=out.split("GYM_START")[0].trim();const a=out.split("GYM_END")[1]?.trim()||"";out=(b+(a?"\n\n"+a:"")).trim();}
    return out;
  };

  const buildContext = () => {
    const runs=activities.filter(a=>a.type==="Run").slice(0,5);
    const ytd=stats?.ytd_run_totals||{};
    const rec=whoopData?.recoveries?.records?.[0];
    const sleep=whoopData?.sleeps?.records?.[0];
    const cyc=whoopData?.cycles?.records?.[0];
    const recentRecs=(whoopData?.recoveries?.records||[]).slice(0,7).map(r=>`${new Date(r.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}: recovery ${Math.round(r.score?.recovery_score||0)}%, HRV ${Math.round(r.score?.hrv_rmssd_milli||0)}ms, RHR ${Math.round(r.score?.resting_heart_rate||0)}bpm`).join("\n");
    const recentSleeps=(whoopData?.sleeps?.records||[]).slice(0,7).map(s=>`${new Date(s.start).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}: sleep ${Math.round(s.score?.sleep_performance_percentage||0)}%, ${s.score?.stage_summary?.total_in_bed_time_milli?(s.score.stage_summary.total_in_bed_time_milli/3600000).toFixed(1):0}h in bed`).join("\n");
    const recentNutrition=Object.entries(userPrefs?.nutrition||{}).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,7).map(([date,log])=>`${new Date(date).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}: ${[log.kcal&&log.kcal+"kcal",log.protein&&log.protein+"g protein",log.carbs&&log.carbs+"g carbs"].filter(Boolean).join(", ")}`).join("\n");
    const todayRec=rec?Math.round(rec.score?.recovery_score||0):null;
    const sleepScore=sleep?Math.round(sleep.score?.sleep_performance_percentage||0):null;
    return `You are a personal running coach and fitness assistant for Caleb Cunningham. Be direct, conversational, use his actual data. Never use double dashes (--). Use plain language not markdown headers.

WHO HE IS: 20 years old, graphic design student at Kingston University London, from Southport. Lives in Kingston with girlfriend Taylor (Taz). Started running July 2024. Raised over £5,000 for the Duchenne Family Support Group. Brother Noah has Duchenne Muscular Dystrophy. Mission: all six World Marathon Majors for a different charity each time.

RUNNING PBs: 5K 18:42, 10K 40:52, HM 1:32:48, Marathon 3:48:59 (London Apr 2026). VO2 Max 67, threshold pace 3:57/km, max HR 208bpm.

RACE PIPELINE: Berlin 28 Sep 2026 (Get Kids Going, Sub 3:20 target). Seville Feb 2027 (Sub 3:00). Valencia Dec 2027. Then Tokyo, Chicago, New York.

KEY COACHING INSIGHT: His cardiovascular engine is significantly ahead of his structural/muscular fitness. The Berlin block (started 22 Jun 2026) is about closing that gap. Priority: hitting 25-30km long runs he never completed in London build. Do not plan more than 1 or 2 weeks at a time.

SHOES: Metaspeed Sky Tokyo Green (race), Metaspeed Sky Tokyo Red (carbon trainer), Vaporfly 3+4 (intervals), ZoomFly 5 (training), Novablast 5 with Superfeet (easy/long), Adidas Evo SL (daily/tempo). Low-medium arches, burning sole/arch pain in non-carbon shoes.

RECOVERY-AWARE PLANNING: Always check recovery before recommending hard sessions. If recovery is below 34%, suggest rest or easy only. If sleep score is below 60%, flag it. When adjusting a plan due to poor recovery, shift sessions forward rather than dropping them entirely where possible.

GYM: Chest focus. Smith flat bench 20kg/side 3x10, incline 15kg/side 3x10, pec deck 73kg 3x12, preacher curl 39kg 3x10, hammer curl 16kg 3x12, lateral raises 8-10kg 3x15. Weight 58-61kg, targeting 65kg.

NUTRITION TARGETS: 2800-3200 kcal/day, 130-150g protein, 250-350g carbs. SiS Beta Fuel gels on long runs.

TODAY: Recovery ${todayRec!==null?todayRec+"%":"unknown"}${sleepScore!==null?`, sleep score ${sleepScore}%`:""}.${todayRec!==null&&todayRec<34?" LOW RECOVERY DAY - do not recommend hard sessions.":" "}

LIVE STRAVA: YTD ${ytd.distance?(ytd.distance/1000).toFixed(1):"449.6"}km, ${ytd.count||58} runs.

RECENT RUNS:
${runs.map(r=>`- ${r.name} (${new Date(r.start_date_local).toLocaleDateString("en-GB")}): ${(r.distance/1000).toFixed(2)}km at ${fPace(r.average_speed)}/km${r.average_heartrate?`, ${Math.round(r.average_heartrate)}bpm`:""}`).join("\n")}

WHOOP HISTORY (7 days):
${recentRecs||"No data"}

SLEEP HISTORY (7 days):
${recentSleeps||"No data"}

NUTRITION (last 7 days):
${recentNutrition||"No nutrition logged"}

PLAN FORMAT: when asked for a training plan, reply conversationally first (2-3 sentences about the logic, referencing recovery/sleep if relevant), then use exactly this format:
PLAN_START
TITLE: [title]
Mon | [type] | [X]km | [pace]/km | [shoe] | [description]
...one line per day for all 7 days (or 14 for 2 weeks)...
PLAN_END
Rest days: Mon | Rest | 0km | N/A | N/A | Rest day
Types: Easy, Interval, Tempo, Long Run, Rest, Gym
Do not plan more than 2 weeks at a time.

GYM FORMAT: when asked for a gym session, reply conversationally first, then:
GYM_START
TITLE: [session title]
[Exercise] | [Sets]x[Reps] | [Weight] | [Notes]
...one line per exercise...
GYM_END
Always reference current lifts and suggest progressive overload.`;
  };

  const send = async () => {
    if((!input.trim()&&!images.length)||loading) return;
    const contentArr=[];
    images.forEach(img=>contentArr.push({type:"image",source:{type:"base64",media_type:img.mediaType,data:img.base64}}));
    if(input.trim()) contentArr.push({type:"text",text:input.trim()});
    const userMsg={role:"user",content:images.length?contentArr:input.trim()};
    const displayMsg={role:"user",content:input.trim()||(images.length>0?`${images.length} image${images.length>1?"s":""} attached`:""),imagePreviews:images.map(i=>i.preview)};
    setMessages(prev=>[...prev,displayMsg]);
    setInput(""); setImages([]); setLoading(true);
    try {
      const apiMsgs=[...messages.filter(m=>m.role!=="system"),userMsg].map(m=>({role:m.role,content:m.content}));
      const res=await fetch("/.netlify/functions/claude-chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:buildContext(),messages:apiMsgs})});
      const data=await res.json();
      const reply=data.content?.[0]?.text||"Something went wrong. Please try again.";
      const plan=extractPlan(reply);
      const gym=extractGym(reply);
      const cleaned=cleanReply(reply);
      const suffix=(plan?"\n\nTraining plan saved to your Plan tab.":"")+(gym?"\n\nGym workout saved to your Gym tab.":"");
      setMessages(prev=>[...prev,{role:"assistant",content:cleaned+suffix}]);
      if(plan&&onPlanSaved) onPlanSaved(plan);
      if(gym&&onGymSaved) onGymSaved(gym);
    } catch(e) {
      setMessages(prev=>[...prev,{role:"assistant",content:"Something went wrong. Please try again."}]);
    }
    setLoading(false);
  };

  const SUGGESTIONS = ["How's my recovery today?","Plan my next week","Gym session today","Am I on track for Berlin sub 3:20?","Analyse my recent runs"];

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", fontFamily:C.sans }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10, flexShrink:0 }}>
        {messages.length<=1 && (
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", flex:1, marginRight:8 }}>
            {SUGGESTIONS.map(s=>(
              <button key={s} onClick={()=>setInput(s)} style={{ background:C.orangeL, border:`1px solid ${C.orangeB}`, color:C.orange, borderRadius:20, padding:"5px 12px", fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:C.sans, whiteSpace:"nowrap" }}>{s}</button>
            ))}
          </div>
        )}
        <button onClick={()=>{const f=[{role:"assistant",content:"Hi Caleb! I have your Strava data, Whoop recovery, nutrition logs and training plan all loaded. Ask me anything, or use a suggestion below to get started."}];setMessages(f);saveChatHistory(f);}} style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.sub, borderRadius:20, padding:"4px 12px", fontSize:11, cursor:"pointer", fontFamily:C.sans, flexShrink:0, marginLeft:"auto" }}>Clear</button>
      </div>
      <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:10, paddingBottom:12 }}>
        {messages.map((m,i)=>(
          <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
            <div style={{ maxWidth:"82%", padding:"11px 15px", borderRadius:18, background:m.role==="user"?C.orange:C.surface, color:m.role==="user"?"#fff":C.text, border:m.role==="assistant"?`1px solid ${C.border}`:"none", fontSize:13, lineHeight:1.6, fontFamily:C.sans, whiteSpace:"pre-wrap", borderBottomRightRadius:m.role==="user"?4:18, borderBottomLeftRadius:m.role==="assistant"?4:18 }}>
              {m.imagePreviews?.length>0 && (
                <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:6 }}>
                  {m.imagePreviews.map((p,j)=><img key={j} src={p} alt="" style={{ height:52, width:52, objectFit:"cover", borderRadius:8, opacity:0.9 }}/>)}
                </div>
              )}
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display:"flex", justifyContent:"flex-start" }}>
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:18, borderBottomLeftRadius:4, padding:"11px 16px", display:"flex", gap:5 }}>
              {[0,1,2].map(i=><div key={i} style={{ width:6, height:6, borderRadius:"50%", background:C.muted, animation:`bounce .9s ${i*0.15}s infinite` }}/>)}
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>
      {images.length>0 && (
        <div style={{ display:"flex", gap:8, marginBottom:8, flexWrap:"wrap", flexShrink:0 }}>
          {images.map((img,i)=>(
            <div key={i} style={{ position:"relative" }}>
              <img src={img.preview} alt="" style={{ height:52, width:52, objectFit:"cover", borderRadius:8, border:`1px solid ${C.border}` }}/>
              <button onClick={()=>setImages(prev=>prev.filter((_,j)=>j!==i))} style={{ position:"absolute", top:-5, right:-5, background:C.red, color:"#fff", border:"none", borderRadius:"50%", width:16, height:16, fontSize:11, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
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

// ─── NAV ──────────────────────────────────────────────────────────────────────
const NAV = [
  {id:"overview",  label:"Overview",  icon:"⚡"},
  {id:"running",   label:"Running",   icon:"🏃"},
  {id:"gym",       label:"Gym",       icon:"💪"},
  {id:"recovery",  label:"Recovery",  icon:"💤"},
  {id:"plan",      label:"Plan",      icon:"📋"},
  {id:"nutrition", label:"Nutrition", icon:"🥗"},
  {id:"races",     label:"Races",     icon:"🏅"},
  {id:"chat",      label:"Chat",      icon:"💬"},
];

// ─── APP ──────────────────────────────────────────────────────────────────────
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
  const [savedWorkout, setSavedWorkout] = useState(null);
  const [userPrefs, setUserPrefs] = useState(null);

  useEffect(() => {
    const params=new URLSearchParams(window.location.search);
    const code=params.get("code");
    const pending=localStorage.getItem("whoop_pending");
    if(!code) return;
    if(pending){setWhoopPending(true);exchangeWhoopCode(code).then(()=>{setWhoopOk(true);setWhoopPending(false);}).catch(e=>{console.error(e);setWhoopPending(false);}).finally(()=>window.history.replaceState({},"","/"));}
    else if(!isConnected()){exchangeCode(code).then(()=>setConnected(true)).catch(console.error).finally(()=>window.history.replaceState({},"","/"));}
  },[]);

  useEffect(() => {
    if(!connected) return;
    setLoading(true);
    Promise.all([getAthlete(),getActivities(100)])
      .then(([a,acts])=>{setAthlete(a);setActivities(acts);setBestEfforts(extractBestEfforts(acts));return Promise.all([getStats(a.id),getAllGear(a)]);})
      .then(([s,g])=>{setStats(s);setGear(g.filter(Boolean));})
      .catch(console.error)
      .finally(()=>setLoading(false));
  },[connected]);

  const loadWhoop = useCallback(()=>{ if(whoopOk) getWhoopData().then(setWhoopData).catch(console.error); },[whoopOk]);
  useEffect(()=>{loadWhoop();},[loadWhoop]);
  useEffect(()=>{loadUserPrefs().then(p=>{if(p)setUserPrefs(p);});},[]);

  const handleSavePrefs = useCallback(prefs=>{setUserPrefs(prefs);saveUserPrefs(prefs);},[]);
  const handleConnectWhoop = ()=>window.location.assign(getWhoopAuthUrl());
  const goToChat = ()=>setPage("chat");

  if(!connected||whoopPending) return <ConnectScreen whoopPending={whoopPending}/>;

  const sharedProps = { activities, stats, whoopData, whoopOk, onConnectWhoop:handleConnectWhoop, onRefreshWhoop:loadWhoop };

  const views = {
    overview:  <Overview {...sharedProps} bestEfforts={bestEfforts} gear={gear} userPrefs={userPrefs} onSavePrefs={handleSavePrefs} onGoToChat={goToChat}/>,
    running:   <Running activities={activities} stats={stats} gear={gear}/>,
    gym:       <Gym activities={activities} userPrefs={userPrefs} onSavePrefs={handleSavePrefs} savedWorkout={savedWorkout}/>,
    recovery:  <Recovery {...sharedProps}/>,
    plan:      <TrainingPlan onChat={goToChat} onGoToChat={goToChat} externalPlan={savedPlan} whoopData={whoopData}/>,
    nutrition: <Nutrition userPrefs={userPrefs} onSavePrefs={handleSavePrefs}/>,
    races:     <Races userPrefs={userPrefs} onSavePrefs={handleSavePrefs}/>,
    chat:      <Chat {...sharedProps} onPlanSaved={setSavedPlan} onGymSaved={setSavedWorkout} userPrefs={userPrefs}/>,
  };

  return (
    <div style={{ display:"flex", height:"100vh", background:C.bg, color:C.text, fontFamily:C.sans, overflow:"hidden" }}>
      {/* Sidebar */}
      <div style={{ width:sidebarOpen?196:0, minWidth:sidebarOpen?196:0, background:C.surface, borderRight:`1px solid ${C.border}`, flexShrink:0, height:"100vh", overflowY:"auto", overflowX:"hidden", transition:"width 0.22s ease, min-width 0.22s ease" }}>
        <div style={{ width:196, minWidth:196 }}>
          <div style={{ padding:"20px 18px 16px" }}>
            <div style={{ width:36, height:36, background:C.orange, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:12 }}>
              <svg viewBox="0 0 24 24" width={20} height={20}><circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5"/><path d="M12 3 a9 9 0 0 1 9 9" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"/><rect x="7" y="10" width="10" height="1.8" rx="0.9" fill="white"/><rect x="7" y="13" width="8" height="1.8" rx="0.9" fill="white"/><rect x="7" y="16" width="6" height="1.8" rx="0.9" fill="white"/></svg>
            </div>
            <div style={{ fontSize:14, fontWeight:700, color:C.text, fontFamily:C.sans }}>Caleb Cunningham</div>
            <div style={{ fontSize:11, color:C.sub, marginTop:2, fontFamily:C.sans }}>{athlete?.city||"Kingston"}</div>
          </div>
          <nav style={{ padding:"4px 10px 12px" }}>
            {NAV.map(n=>(
              <button key={n.id} onClick={()=>{setPage(n.id);if(window.innerWidth<=640)setSidebarOpen(false);}} style={{ display:"flex", alignItems:"center", gap:10, width:"100%", padding:"9px 12px", background:page===n.id?C.orangeL:"transparent", borderRadius:12, color:page===n.id?C.orange:C.sub, fontSize:13, fontWeight:page===n.id?600:400, marginBottom:1, cursor:"pointer", border:"none", fontFamily:C.sans, transition:"background .15s" }}>
                <span style={{ fontSize:15 }}>{n.icon}</span>
                <span>{n.label}</span>
              </button>
            ))}
          </nav>
          <div style={{ padding:"12px 18px 20px", borderTop:`1px solid ${C.divider}` }}>
            {!whoopOk && <button onClick={handleConnectWhoop} style={{ width:"100%", background:C.red, color:"#fff", border:"none", borderRadius:20, padding:"8px", fontSize:12, fontWeight:700, cursor:"pointer", marginBottom:10, fontFamily:C.sans }}>Connect Whoop</button>}
            {whoopOk && <div style={{ fontSize:11, color:C.green, marginBottom:6, fontWeight:600, fontFamily:C.sans }}>✓ Whoop connected</div>}
            <div style={{ fontSize:11, color:C.orange, marginBottom:10, fontFamily:C.sans }}>Running for Noah 🧡</div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              <button onClick={()=>{disconnect();setConnected(false);setActivities([]);}} style={{ fontSize:10, color:C.muted, background:"transparent", border:`1px solid ${C.border}`, borderRadius:20, padding:"3px 10px", cursor:"pointer", fontFamily:C.sans }}>Strava</button>
              {whoopOk && <button onClick={()=>{disconnectWhoop();setWhoopOk(false);setWhoopData(null);}} style={{ fontSize:10, color:C.muted, background:"transparent", border:`1px solid ${C.border}`, borderRadius:20, padding:"3px 10px", cursor:"pointer", fontFamily:C.sans }}>Whoop</button>}
            </div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", height:"100vh", overflow:"hidden" }}>
        {/* Top bar */}
        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 18px", borderBottom:`1px solid ${C.border}`, background:C.surface, flexShrink:0 }}>
          <button onClick={()=>setSidebarOpen(!sidebarOpen)} style={{ background:"transparent", border:"none", color:C.sub, fontSize:18, cursor:"pointer", lineHeight:1, padding:"2px 4px" }}>{sidebarOpen?"✕":"☰"}</button>
          <div style={{ fontSize:12, fontWeight:700, color:C.orange, letterSpacing:"0.06em", textTransform:"uppercase" }}>Fitness Dashboard</div>
          <div style={{ flex:1 }}/>
          <div style={{ fontSize:13, color:C.sub, fontWeight:500 }}>{NAV.find(n=>n.id===page)?.label}</div>
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:page==="chat"?"hidden":"auto", padding:"16px 18px", display:"flex", flexDirection:"column" }}>
          {loading ? <Loader text="Loading your data..."/> : views[page]}
        </div>
      </div>
    </div>
  );
}
