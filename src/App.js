import { useState, useEffect, useRef, useCallback } from "react";
import { AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { isConnected, disconnect, exchangeCode, getAthlete, getStats, getActivities, getActivity, getStreams, getAllGear, extractBestEfforts } from "./strava";
import { isWhoopConnected, disconnectWhoop, exchangeWhoopCode, getWhoopAuthUrl, getWhoopData } from "./whoop";
import { loadChatHistory, saveChatHistory, loadTrainingPlan, saveTrainingPlan, loadUserPrefs, saveUserPrefs } from "./supabase";
import { LIFTS as DEFAULT_LIFTS, RACES as DEFAULT_RACES, SPONSORSHIP as DEFAULT_SPONSORSHIP, fPace, fTime, fDist, actType, typeCol, recCol, weeklyVol } from "./data";

const C = {
  bg:"#08090e", surface:"#0e1117", card:"#13161f", border:"#1e2535",
  teal:"#34d399", pink:"#f472b6", amber:"#fbbf24", purple:"#a78bfa",
  blue:"#60a5fa", orange:"#fb923c", green:"#4ade80", red:"#f87171",
  text:"#f1f5f9", sub:"#94a3b8", muted:"#3d4f63",
  mono:"'JetBrains Mono',monospace",
};

const Card = ({ children, style={}, glow }) => (
  <div style={{ background:C.card, border:`1px solid ${glow?glow+"30":C.border}`, borderRadius:14, padding:16, boxShadow:glow?`0 0 20px ${glow}10`:"none", ...style }}>{children}</div>
);

const Label = ({ children, color=C.teal, action }) => (
  <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:12, justifyContent:"space-between" }}>
    <div style={{ display:"flex", alignItems:"center", gap:7 }}>
      <div style={{ width:2, height:12, background:color, borderRadius:2 }} />
      <span style={{ fontSize:9, fontWeight:700, letterSpacing:"0.15em", textTransform:"uppercase", color }}>{children}</span>
    </div>
    {action}
  </div>
);

const Stat = ({ label, value, sub, color=C.teal, size="md" }) => {
  const fs = { sm:14, md:20, lg:28, xl:36 }[size]||20;
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"11px 13px", flex:1, minWidth:0 }}>
      <div style={{ fontSize:9, fontWeight:600, color:C.muted, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:5 }}>{label}</div>
      <div style={{ fontFamily:C.mono, fontSize:fs, fontWeight:700, color, lineHeight:1.1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{value}</div>
      {sub && <div style={{ fontSize:9, color:C.muted, marginTop:3 }}>{sub}</div>}
    </div>
  );
};

const Pill = ({ children, color=C.teal }) => (
  <span style={{ fontSize:8, fontWeight:700, color, background:`${color}15`, border:`1px solid ${color}30`, borderRadius:4, padding:"2px 6px", letterSpacing:"0.1em", textTransform:"uppercase", whiteSpace:"nowrap" }}>{children}</span>
);

const Btn = ({ children, onClick, color=C.teal, sm, outline, full, style={} }) => (
  <button onClick={onClick} style={{ background:outline?"transparent":color, color:outline?color:C.bg, border:`1px solid ${color}`, borderRadius:9, padding:sm?"7px 14px":"11px 20px", fontSize:sm?11:13, fontWeight:700, width:full?"100%":"auto", cursor:"pointer", ...style }}>{children}</button>
);

const Loader = ({ text="Loading..." }) => (
  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flex:1, gap:14 }}>
    <div style={{ width:32, height:32, border:`2px solid ${C.border}`, borderTop:`2px solid ${C.teal}`, borderRadius:"50%", animation:"spin .8s linear infinite" }} />
    <div style={{ fontSize:12, color:C.muted }}>{text}</div>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);

const CT = ({ active, payload, label }) => {
  if (!active||!payload?.length) return null;
  return (
    <div style={{ background:"#0a0d14", border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 11px", fontSize:11 }}>
      <div style={{ color:C.muted, marginBottom:3, fontSize:9 }}>{label}</div>
      {payload.map((p,i) => <div key={i} style={{ color:p.color, fontWeight:600 }}>{p.name}: {p.value}</div>)}
    </div>
  );
};

const BackBtn = ({ onClick }) => (
  <button onClick={onClick} style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.sub, borderRadius:8, padding:"7px 13px", fontSize:11, fontWeight:500, display:"inline-flex", alignItems:"center", gap:5, marginBottom:14, cursor:"pointer" }}>← Back</button>
);

const EditBtn = ({ editing, onToggle }) => (
  <button onClick={onToggle} style={{ background:"transparent", border:`1px solid ${editing?C.teal:C.border}`, color:editing?C.teal:C.muted, borderRadius:6, padding:"4px 10px", fontSize:9, fontWeight:600, cursor:"pointer", letterSpacing:"0.08em" }}>
    {editing?"✓ SAVE":"✎ EDIT"}
  </button>
);

const Input = ({ value, onChange, style={}, placeholder="" }) => (
  <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{ background:C.surface, border:`1px solid ${C.teal}40`, borderRadius:6, padding:"5px 8px", color:C.text, fontSize:11, outline:"none", fontFamily:"Inter", width:"100%", ...style }} />
);

// ─── CONNECT SCREEN ──────────────────────────────────────────────────────────
function ConnectScreen({ whoopPending }) {
  const clientId = process.env.REACT_APP_STRAVA_CLIENT_ID;
  const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(window.location.origin)}&response_type=code&scope=read,activity:read_all`;
  if (whoopPending) return (
    <div style={{ height:"100%", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center" }}><div style={{ fontSize:32, marginBottom:12 }}>⌚</div><div style={{ fontSize:16, fontWeight:700, color:C.text }}>Connecting Whoop...</div></div>
    </div>
  );
  return (
    <div style={{ height:"100%", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ textAlign:"center", maxWidth:320 }}>
        <div style={{ fontFamily:C.mono, fontSize:11, color:C.teal, letterSpacing:"0.2em", marginBottom:16 }}>FITNESS DASHBOARD</div>
        <div style={{ fontSize:28, fontWeight:800, color:C.text, marginBottom:8, letterSpacing:"-0.02em" }}>Caleb Cunningham</div>
        <div style={{ fontSize:13, color:C.sub, marginBottom:32, lineHeight:1.7 }}>Connect Strava to load your live training data.</div>
        <a href={url} style={{ display:"inline-block", background:"#fc4c02", color:"#fff", borderRadius:10, padding:"13px 28px", fontSize:13, fontWeight:700 }}>Connect with Strava</a>
        <div style={{ fontSize:9, color:C.muted, marginTop:10 }}>READ-ONLY · YOUR DATA STAYS PRIVATE</div>
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
  if (!act) return <div style={{ padding:20, color:C.muted, fontSize:12 }}>Could not load activity.</div>;

  const type = actType(act);
  const color = typeCol(type);
  const laps = act.laps || [];
  const hr = streams?.heartrate?.data || [];
  const time = streams?.time?.data || [];
  const hrChart = hr.filter((_,i) => i%15===0).map((v,i) => ({ t:Math.round((time[i*15]||i*15)/60), hr:v }));

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12, paddingBottom:20 }}>
      <BackBtn onClick={onBack} />
      <Card glow={color}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:10 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:18, fontWeight:800, color:C.text, marginBottom:5 }}>{act.name}</div>
            <div style={{ fontSize:10, color:C.sub, marginBottom:8 }}>{new Date(act.start_date_local).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}{act.gear?.name?` · ${act.gear.name}`:""}</div>
            <Pill color={color}>{type}</Pill>
          </div>
          {act.suffer_score && <div style={{ textAlign:"right" }}><div style={{ fontSize:9, color:C.muted, textTransform:"uppercase" }}>Suffer</div><div style={{ fontFamily:C.mono, fontSize:28, fontWeight:700, color:C.amber }}>{act.suffer_score}</div></div>}
        </div>
      </Card>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
        <Stat label="Distance" value={`${fDist(act.distance)}km`} />
        <Stat label="Time" value={fTime(act.moving_time)} />
        <Stat label="Avg Pace" value={fPace(act.average_speed)+"/km"} />
        {act.average_heartrate && <Stat label="Avg HR" value={`${Math.round(act.average_heartrate)}`} sub="bpm" color={C.pink} />}
        {act.max_heartrate && <Stat label="Max HR" value={`${act.max_heartrate}`} sub="bpm" color={C.pink} />}
        {act.average_watts && <Stat label="Power" value={`${Math.round(act.average_watts)}`} sub="W avg" color={C.amber} />}
        {act.average_cadence && <Stat label="Cadence" value={`${Math.round(act.average_cadence*2)}`} sub="spm" color={C.purple} />}
        {act.total_elevation_gain>0 && <Stat label="Elevation" value={`${Math.round(act.total_elevation_gain)}m`} color={C.blue} />}
      </div>
      {laps.length>1 && (
        <Card>
          <Label>Splits</Label>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {laps.map((lap,i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:10, background:C.surface, borderRadius:8, padding:"9px 12px" }}>
                <div style={{ fontSize:9, color:C.muted, minWidth:42, fontWeight:600 }}>LAP {i+1}</div>
                <div style={{ fontFamily:C.mono, fontSize:13, fontWeight:600, color:C.teal, flex:1 }}>{fPace(lap.average_speed)}/km</div>
                <div style={{ fontSize:10, color:C.sub }}>{(lap.distance/1000).toFixed(2)}km</div>
                {lap.average_heartrate && <div style={{ fontSize:10, color:C.pink }}>{Math.round(lap.average_heartrate)} bpm</div>}
              </div>
            ))}
          </div>
        </Card>
      )}
      {hrChart.length>5 && (
        <Card>
          <Label color={C.pink}>Heart Rate</Label>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={hrChart}>
              <defs><linearGradient id="hrg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.pink} stopOpacity={0.2}/><stop offset="95%" stopColor={C.pink} stopOpacity={0}/></linearGradient></defs>
              <XAxis dataKey="t" tick={{fontSize:8,fill:C.muted}} tickLine={false} axisLine={false} unit="m"/>
              <YAxis tick={{fontSize:8,fill:C.muted}} tickLine={false} axisLine={false} domain={["auto","auto"]} width={26}/>
              <Tooltip content={<CT/>}/>
              <Area type="monotone" dataKey="hr" name="HR" stroke={C.pink} fill="url(#hrg)" strokeWidth={1.5} dot={false}/>
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}
      {act.best_efforts?.length>0 && (
        <Card>
          <Label color={C.amber}>Best Efforts</Label>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
            {act.best_efforts.slice(0,6).map((b,i) => (
              <div key={i} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:9, padding:"9px 12px" }}>
                <div style={{ fontSize:9, color:C.muted, marginBottom:4 }}>{b.name}</div>
                <div style={{ fontFamily:C.mono, fontSize:14, fontWeight:700, color:C.amber }}>{fTime(b.moving_time)}</div>
                <div style={{ fontSize:9, color:C.muted, marginTop:2 }}>{fPace(b.distance/b.moving_time)}/km</div>
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
  start.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));
  start.setDate(start.getDate() - 13*7);

  for (let w = 0; w < 14; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + w*7 + d);
      const key = date.toISOString().split("T")[0];
      const isRun = runDates.has(key);
      const isFuture = date > today;
      week.push({ date:key, isRun, isFuture, day:date.getDate(), month:date.toLocaleDateString("en-GB",{month:"short"}) });
    }
    weeks.push(week);
  }

  const total = [...runDates].filter(d => {
    const date = new Date(d);
    const cutoff = new Date(start);
    return date >= cutoff && date <= today;
  }).length;

  return (
    <Card>
      <Label color={C.green}>
        Training Consistency
        <span style={{ fontSize:9, color:C.muted, fontWeight:400, marginLeft:4 }}>{total} runs in 14 weeks</span>
      </Label>
      <div style={{ overflowX:"auto" }}>
        <div style={{ display:"flex", gap:3, minWidth:"fit-content" }}>
          {weeks.map((week,wi) => (
            <div key={wi} style={{ display:"flex", flexDirection:"column", gap:3 }}>
              {week.map((day,di) => (
                <div key={di} title={`${day.date}${day.isRun?" — Run":""}`} style={{
                  width:14, height:14, borderRadius:3,
                  background: day.isFuture ? C.border : day.isRun ? C.teal : C.surface,
                  border: `1px solid ${day.isRun?C.teal+"60":C.border}`,
                  opacity: day.isFuture ? 0.3 : 1,
                  cursor:"default",
                }} />
              ))}
            </div>
          ))}
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:6, fontSize:8, color:C.muted }}>
          <span>{new Date(weeks[0][0].date).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</span>
          <span>Today</span>
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:8, fontSize:9, color:C.muted }}>
        <div style={{ width:10, height:10, borderRadius:2, background:C.surface, border:`1px solid ${C.border}` }}/>
        <span>Rest</span>
        <div style={{ width:10, height:10, borderRadius:2, background:C.teal, marginLeft:8 }}/>
        <span>Run</span>
      </div>
    </Card>
  );
}

// ─── MONTHLY SUMMARY ─────────────────────────────────────────────────────────
function MonthlySummary({ activities }) {
  const months = {};
  activities.filter(a => a.type==="Run"||a.sport_type==="Run").forEach(r => {
    const key = new Date(r.start_date_local).toLocaleDateString("en-GB",{month:"short",year:"2-digit"});
    if (!months[key]) months[key] = { km:0, runs:0, elev:0, time:0 };
    months[key].km += r.distance/1000;
    months[key].runs += 1;
    months[key].elev += r.total_elevation_gain||0;
    months[key].time += r.moving_time||0;
  });

  const data = Object.entries(months).slice(-6).map(([month,v]) => ({
    month, km:parseFloat(v.km.toFixed(1)), runs:v.runs, elev:Math.round(v.elev)
  }));

  return (
    <Card>
      <Label color={C.blue}>Monthly Summary</Label>
      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={data}>
          <XAxis dataKey="month" tick={{fontSize:8,fill:C.muted}} tickLine={false} axisLine={false}/>
          <YAxis tick={{fontSize:8,fill:C.muted}} tickLine={false} axisLine={false} unit="k" width={26}/>
          <Tooltip content={<CT/>}/>
          <Bar dataKey="km" name="km" fill={C.blue} radius={[3,3,0,0]}/>
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginTop:10 }}>
        {data.slice(-1).map(m => (
          <>
            <div key="km" style={{ background:C.surface, borderRadius:8, padding:"8px 10px", textAlign:"center" }}>
              <div style={{ fontSize:9, color:C.muted, marginBottom:3 }}>This month</div>
              <div style={{ fontFamily:C.mono, fontSize:16, fontWeight:700, color:C.blue }}>{m.km}km</div>
            </div>
            <div key="runs" style={{ background:C.surface, borderRadius:8, padding:"8px 10px", textAlign:"center" }}>
              <div style={{ fontSize:9, color:C.muted, marginBottom:3 }}>Runs</div>
              <div style={{ fontFamily:C.mono, fontSize:16, fontWeight:700, color:C.teal }}>{m.runs}</div>
            </div>
            <div key="elev" style={{ background:C.surface, borderRadius:8, padding:"8px 10px", textAlign:"center" }}>
              <div style={{ fontSize:9, color:C.muted, marginBottom:3 }}>Elevation</div>
              <div style={{ fontFamily:C.mono, fontSize:16, fontWeight:700, color:C.amber }}>{m.elev}m</div>
            </div>
          </>
        ))}
      </div>
    </Card>
  );
}

// ─── HR ZONES ────────────────────────────────────────────────────────────────
function HRZones({ activities }) {
  const MAX_HR = 208;
  const zones = [
    { name:"Z1 Recovery", min:0, max:0.6, color:"#60a5fa" },
    { name:"Z2 Aerobic",  min:0.6, max:0.7, color:"#34d399" },
    { name:"Z3 Tempo",    min:0.7, max:0.8, color:"#fbbf24" },
    { name:"Z4 Threshold",min:0.8, max:0.9, color:"#fb923c" },
    { name:"Z5 Max",      min:0.9, max:1.0,  color:"#f472b6" },
  ];

  const runs = activities.filter(a => (a.type==="Run"||a.sport_type==="Run") && a.average_heartrate).slice(0,20);
  if (!runs.length) return null;

  const zoneCounts = zones.map(z => {
    const count = runs.filter(r => {
      const pct = r.average_heartrate/MAX_HR;
      return pct >= z.min && pct < z.max;
    }).length;
    return { ...z, count, pct:Math.round(count/runs.length*100) };
  });

  return (
    <Card>
      <Label color={C.orange}>HR Zone Distribution (last 20 runs)</Label>
      <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
        {zoneCounts.map((z,i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ fontSize:9, color:C.sub, minWidth:90 }}>{z.name}</div>
            <div style={{ flex:1, height:6, background:C.border, borderRadius:3 }}>
              <div style={{ width:`${z.pct}%`, height:"100%", background:z.color, borderRadius:3, transition:"width .3s" }}/>
            </div>
            <div style={{ fontSize:9, color:z.color, fontFamily:C.mono, minWidth:28, textAlign:"right" }}>{z.pct}%</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── GOALS TRACKER ───────────────────────────────────────────────────────────
function GoalsTracker({ activities, stats, userPrefs, onSavePrefs }) {
  const [editing, setEditing] = useState(false);
  const defaultGoals = [
    { id:1, name:"Berlin Sub 3:20", type:"race", target:"3:20:00", current:"3:48:59", unit:"time", pct:0 },
    { id:2, name:"Run 200km in July", type:"monthly", target:200, current:0, unit:"km", pct:0 },
    { id:3, name:"Reach 65kg", type:"weight", target:65, current:60, unit:"kg", pct:75 },
    { id:4, name:"Sub 18 min 5K", type:"race", target:"18:00", current:"18:42", unit:"time", pct:0 },
  ];
  const goals = userPrefs?.goals || defaultGoals;
  const [editGoals, setEditGoals] = useState(goals);

  // Auto-calc July km
  const julyKm = activities.filter(a => {
    const d = new Date(a.start_date_local);
    return d.getMonth()===6 && d.getFullYear()===2026 && (a.type==="Run"||a.sport_type==="Run");
  }).reduce((s,r) => s+r.distance/1000, 0);

  const save = () => { onSavePrefs({...userPrefs, goals:editGoals}); setEditing(false); };

  return (
    <Card>
      <Label color={C.green} action={<EditBtn editing={editing} onToggle={()=>{if(editing)save();else{setEditGoals(goals);setEditing(true);}}}/>}>Goals</Label>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {(editing?editGoals:goals).map((g,i) => {
          const pct = g.name.includes("July") ? Math.min(100,Math.round(julyKm/g.target*100)) : g.pct;
          const col = pct>=100?C.teal:pct>=60?C.amber:C.orange;
          return editing ? (
            <div key={g.id||i} style={{ background:C.surface, borderRadius:9, padding:"10px 12px", display:"flex", flexDirection:"column", gap:6 }}>
              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                <Input value={g.name} onChange={v=>setEditGoals(p=>p.map((x,j)=>j===i?{...x,name:v}:x))} style={{ flex:1 }}/>
                <button onClick={()=>setEditGoals(p=>p.filter((_,j)=>j!==i))} style={{ background:"transparent", border:"none", color:C.pink, cursor:"pointer", fontSize:16 }}>×</button>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <Input value={String(g.target)} onChange={v=>setEditGoals(p=>p.map((x,j)=>j===i?{...x,target:v}:x))} style={{ width:80 }} placeholder="Target"/>
                <Input value={String(g.current)} onChange={v=>setEditGoals(p=>p.map((x,j)=>j===i?{...x,current:v,pct:Math.min(100,Math.round(parseFloat(v)/parseFloat(g.target)*100))||0}:x))} style={{ width:80 }} placeholder="Current"/>
                <Input value={g.unit} onChange={v=>setEditGoals(p=>p.map((x,j)=>j===i?{...x,unit:v}:x))} style={{ width:50 }} placeholder="Unit"/>
              </div>
            </div>
          ) : (
            <div key={g.id||i} style={{ background:C.surface, borderRadius:9, padding:"10px 12px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:7 }}>
                <div style={{ fontSize:12, fontWeight:600, color:C.text }}>{g.name}</div>
                <div style={{ fontSize:10, color:col, fontFamily:C.mono, fontWeight:700 }}>{pct}%</div>
              </div>
              <div style={{ height:5, background:C.border, borderRadius:3, marginBottom:5 }}>
                <div style={{ width:`${pct}%`, height:"100%", background:col, borderRadius:3, transition:"width .4s" }}/>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:C.muted }}>
                <span>Current: {g.name.includes("July") ? `${julyKm.toFixed(1)}km` : `${g.current}${g.unit!=="time"?" "+g.unit:""}`}</span>
                <span>Target: {g.target}{g.unit!=="time"?" "+g.unit:""}</span>
              </div>
            </div>
          );
        })}
        {editing && <button onClick={()=>setEditGoals(p=>[...p,{id:Date.now(),name:"New Goal",type:"custom",target:100,current:0,unit:"km",pct:0}])} style={{ background:"transparent", border:`1px dashed ${C.border}`, borderRadius:9, padding:"9px", color:C.muted, cursor:"pointer", fontSize:11 }}>+ Add goal</button>}
      </div>
    </Card>
  );
}

// ─── OVERVIEW ────────────────────────────────────────────────────────────────
function Overview({ stats, activities, whoopData, whoopOk, onConnectWhoop, bestEfforts, gear, userPrefs, onSavePrefs }) {
  const vol = weeklyVol(activities);
  const ytd = stats?.ytd_run_totals||{};
  const all = stats?.all_run_totals||{};
  const rec = whoopData?.recoveries?.records?.[0];
  const cyc = whoopData?.cycles?.records?.[0];
  const sleep = whoopData?.sleeps?.records?.[0];

  const paceTrend = vol.map(w => {
    const weekRuns = activities.filter(a => {
      if (a.type!=="Run") return false;
      const d = new Date(a.start_date_local);
      const mon = new Date(d); mon.setDate(d.getDate()-((d.getDay()+6)%7));
      return mon.toLocaleDateString("en-GB",{day:"numeric",month:"short"})===w.week;
    });
    const avgMps = weekRuns.length ? weekRuns.reduce((s,r)=>s+(r.average_speed||0),0)/weekRuns.length : 0;
    return { week:w.week, pace:avgMps?parseFloat((1000/avgMps/60).toFixed(2)):null, km:w.km };
  }).filter(w=>w.pace);

  const hrvTrend = (whoopData?.recoveries?.records||[]).slice(0,14).reverse().map(r=>({
    day:new Date(r.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"}),
    hrv:Math.round(r.score?.hrv_rmssd_milli||0),
    rhr:Math.round(r.score?.resting_heart_rate||0),
  }));

  const loadChart = vol.slice(-8).map(w => {
    const weekRuns = activities.filter(a=>{
      const d=new Date(a.start_date_local);
      const mon=new Date(d);mon.setDate(d.getDate()-((d.getDay()+6)%7));
      return mon.toLocaleDateString("en-GB",{day:"numeric",month:"short"})===w.week&&(a.type==="Run"||a.sport_type==="Run");
    });
    return { week:w.week, load:weekRuns.reduce((s,r)=>s+(r.suffer_score||0),0), km:w.km };
  });

  const berlin = new Date("2026-09-28");
  const today = new Date();
  const daysLeft = Math.max(0,Math.ceil((berlin-today)/(1000*60*60*24)));
  const blockStart = new Date("2026-06-22");
  const totalDays = Math.ceil((berlin-blockStart)/(1000*60*60*24));
  const daysIn = Math.max(0,Math.ceil((today-blockStart)/(1000*60*60*24)));
  const progress = Math.min(100,Math.round((daysIn/totalDays)*100));

  const PBs = [{label:"5K",time:"18:42",pace:"3:44/km",date:"2024"},{label:"10K",time:"40:52",pace:"4:05/km",date:"2024"},{label:"HM",time:"1:32:48",pace:"4:23/km",date:"Feb 2026"},{label:"Marathon",time:"3:48:59",pace:"5:25/km",date:"Apr 2026"}];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12, paddingBottom:20 }}>
      <Card>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:C.mono, fontSize:9, color:C.teal, letterSpacing:"0.18em", marginBottom:8 }}>FITNESS DASHBOARD</div>
            <div style={{ fontSize:22, fontWeight:800, color:C.text, letterSpacing:"-0.02em", marginBottom:4 }}>Caleb Cunningham</div>
            <div style={{ fontSize:11, color:C.sub, marginBottom:10 }}>Kingston · Berlin Block 22 Jun 2026</div>
            <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
              <Pill>Coros Pace 3</Pill><Pill color={C.pink}>Whoop 5.0</Pill><Pill color={C.amber}>Strava Live</Pill><Pill color={C.purple}>6 Majors</Pill>
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:4 }}>YTD Distance</div>
            <div style={{ fontFamily:C.mono, fontSize:30, fontWeight:700, color:C.teal, lineHeight:1 }}>
              {ytd.distance?(ytd.distance/1000).toFixed(1):"442.9"}<span style={{ fontSize:13, color:C.muted }}>km</span>
            </div>
            <div style={{ fontSize:9, color:C.muted, marginTop:4 }}>{ytd.count||57} runs · {ytd.moving_time?(ytd.moving_time/3600).toFixed(0):36}h</div>
          </div>
        </div>
      </Card>

      {/* Berlin countdown */}
      <Card glow={C.teal}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10, marginBottom:12 }}>
          <div>
            <div style={{ fontSize:9, color:C.teal, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:4 }}>Next Race</div>
            <div style={{ fontSize:16, fontWeight:700, color:C.text }}>Berlin Marathon</div>
            <div style={{ fontSize:10, color:C.sub, marginTop:2 }}>28 Sep 2026 · Get Kids Going · Target Sub 3:20</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontFamily:C.mono, fontSize:28, fontWeight:700, color:C.amber, lineHeight:1 }}>{daysLeft}</div>
            <div style={{ fontSize:9, color:C.muted, marginTop:2 }}>days to go</div>
          </div>
        </div>
        <div style={{ height:6, background:C.border, borderRadius:3 }}>
          <div style={{ width:`${progress}%`, height:"100%", background:`linear-gradient(90deg,${C.teal},${C.amber})`, borderRadius:3 }}/>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
          <div style={{ fontSize:9, color:C.muted }}>Block started 22 Jun</div>
          <div style={{ fontSize:9, color:C.muted }}>{progress}% through</div>
        </div>
      </Card>

      {/* Recovery */}
      {whoopOk && rec ? (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
          <Stat label="Recovery" value={`${Math.round(rec.score?.recovery_score||0)}%`} color={recCol(rec.score?.recovery_score)} size="lg"/>
          <Stat label="HRV" value={`${Math.round(rec.score?.hrv_rmssd_milli||0)}`} sub="ms" color={C.teal}/>
          <Stat label="RHR" value={`${Math.round(rec.score?.resting_heart_rate||0)}`} sub="bpm" color={C.pink}/>
          <Stat label="Strain" value={`${cyc?.score?.strain?.toFixed(1)||"—"}`} color={C.amber}/>
        </div>
      ) : !whoopOk && (
        <Card style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
          <div><div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:3 }}>Connect Whoop</div><div style={{ fontSize:11, color:C.sub }}>Unlock recovery, HRV, sleep and strain</div></div>
          <Btn onClick={onConnectWhoop} color={C.pink} sm>Connect Whoop</Btn>
        </Card>
      )}

      {/* PBs */}
      <Card>
        <Label color={C.purple}>Personal Bests</Label>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
          {bestEfforts && Object.values(bestEfforts).some(Boolean) ? (
            Object.entries(bestEfforts).filter(([,v])=>v).map(([name,effort])=>(
              <div key={name} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:9, padding:"10px 12px" }}>
                <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:4 }}>{name}</div>
                <div style={{ fontFamily:C.mono, fontSize:15, fontWeight:700, color:C.purple }}>{fTime(effort.moving_time)}</div>
                <div style={{ fontSize:9, color:C.muted, marginTop:2 }}>{fPace(effort.distance/effort.moving_time)}/km · {new Date(effort.date).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"2-digit"})}</div>
              </div>
            ))
          ) : PBs.map(pb=>(
            <div key={pb.label} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:9, padding:"10px 12px" }}>
              <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:4 }}>{pb.label}</div>
              <div style={{ fontFamily:C.mono, fontSize:15, fontWeight:700, color:C.purple }}>{pb.time}</div>
              <div style={{ fontSize:9, color:C.muted, marginTop:2 }}>{pb.pace} · {pb.date}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
        <Stat label="All-Time Dist" value={all.distance?`${(all.distance/1000).toFixed(0)}km`:"1,086km"} sub={`${all.count||161} runs`} color={C.amber}/>
        <Stat label="All-Time Time" value={all.moving_time?`${(all.moving_time/3600).toFixed(0)}h`:"97h"} sub="since Jul 2024" color={C.amber}/>
        <Stat label="Marathons" value="2" sub="both London" color={C.pink}/>
        <Stat label="Raised" value="£5k+" sub="for charity" color={C.purple}/>
      </div>

      {/* Goals */}
      <GoalsTracker activities={activities} stats={stats} userPrefs={userPrefs} onSavePrefs={onSavePrefs}/>

      {/* Consistency heatmap */}
      <ConsistencyHeatmap activities={activities}/>

      {/* Monthly summary */}
      <MonthlySummary activities={activities}/>

      {/* Weekly volume */}
      <Card>
        <Label>Weekly Volume</Label>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={vol.slice(-12)}>
            <XAxis dataKey="week" tick={{fontSize:8,fill:C.muted}} tickLine={false} axisLine={false} interval={2}/>
            <YAxis tick={{fontSize:8,fill:C.muted}} tickLine={false} axisLine={false} unit="k" width={22}/>
            <Tooltip content={<CT/>}/>
            <Bar dataKey="km" name="km" fill={C.teal} radius={[3,3,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Pace trend */}
      {paceTrend.length>2 && (
        <Card>
          <Label color={C.amber}>Avg Pace Trend (lower is faster)</Label>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={paceTrend}>
              <XAxis dataKey="week" tick={{fontSize:8,fill:C.muted}} tickLine={false} axisLine={false} interval={2}/>
              <YAxis tick={{fontSize:8,fill:C.muted}} tickLine={false} axisLine={false} width={28} reversed domain={["auto","auto"]}/>
              <Tooltip content={<CT/>}/>
              <Line type="monotone" dataKey="pace" name="min/km" stroke={C.amber} strokeWidth={2} dot={{fill:C.amber,r:2}} connectNulls/>
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Training load */}
      {loadChart.some(w=>w.load>0) && (
        <Card>
          <Label color={C.orange}>Weekly Training Load</Label>
          <ResponsiveContainer width="100%" height={110}>
            <BarChart data={loadChart}>
              <XAxis dataKey="week" tick={{fontSize:8,fill:C.muted}} tickLine={false} axisLine={false}/>
              <YAxis tick={{fontSize:8,fill:C.muted}} tickLine={false} axisLine={false} width={26}/>
              <Tooltip content={<CT/>}/>
              <Bar dataKey="load" name="Load" fill={C.orange} radius={[3,3,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* HRV trend */}
      {hrvTrend.length>2 && (
        <Card>
          <Label color={C.pink}>HRV & RHR — 14 Days</Label>
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={hrvTrend}>
              <XAxis dataKey="day" tick={{fontSize:8,fill:C.muted}} tickLine={false} axisLine={false} interval={2}/>
              <YAxis tick={{fontSize:8,fill:C.muted}} tickLine={false} axisLine={false} width={24}/>
              <Tooltip content={<CT/>}/>
              <Line type="monotone" dataKey="hrv" name="HRV" stroke={C.teal} strokeWidth={1.5} dot={{fill:C.teal,r:2}}/>
              <Line type="monotone" dataKey="rhr" name="RHR" stroke={C.pink} strokeWidth={1.5} dot={{fill:C.pink,r:2}}/>
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* HR zones */}
      <HRZones activities={activities}/>
    </div>
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
    <div style={{ display:"flex", flexDirection:"column", gap:12, paddingBottom:20 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
        <Stat label="YTD Distance" value={ytd.distance?`${(ytd.distance/1000).toFixed(1)}km`:"442.9km"} sub={`${ytd.count||57} runs`}/>
        <Stat label="YTD Time" value={ytd.moving_time?`${(ytd.moving_time/3600).toFixed(1)}h`:"36.3h"} color={C.amber}/>
        <Stat label="All-Time" value={stats?.all_run_totals?.distance?`${(stats.all_run_totals.distance/1000).toFixed(0)}km`:"1,086km"} color={C.purple}/>
        <Stat label="Elevation" value={ytd.elevation_gain?`${ytd.elevation_gain}m`:"827m"} color={C.blue}/>
      </div>

      <ConsistencyHeatmap activities={activities}/>
      <MonthlySummary activities={activities}/>
      <HRZones activities={activities}/>

      <Card>
        <Label>Weekly Volume</Label>
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={vol}>
            <defs><linearGradient id="vg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.teal} stopOpacity={0.2}/><stop offset="95%" stopColor={C.teal} stopOpacity={0}/></linearGradient></defs>
            <XAxis dataKey="week" tick={{fontSize:8,fill:C.muted}} tickLine={false} axisLine={false} interval={2}/>
            <YAxis tick={{fontSize:8,fill:C.muted}} tickLine={false} axisLine={false} unit="k" width={22}/>
            <Tooltip content={<CT/>}/>
            <Area type="monotone" dataKey="km" name="km" stroke={C.teal} fill="url(#vg)" strokeWidth={1.5} dot={false}/>
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <Label>Recent Runs — tap to expand</Label>
        <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
          {runs.slice(0,25).map(r => {
            const t=actType(r); const col=typeCol(t);
            return (
              <button key={r.id} onClick={()=>setSel(r.id)} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"11px 13px", display:"flex", alignItems:"center", gap:10, textAlign:"left", width:"100%", cursor:"pointer" }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:3, flexWrap:"wrap" }}>
                    <span style={{ fontSize:12, fontWeight:600, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:160 }}>{r.name}</span>
                    <Pill color={col}>{t}</Pill>
                  </div>
                  <div style={{ fontSize:9, color:C.sub }}>{new Date(r.start_date_local).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}{r.gear?.name?` · ${r.gear.name}`:""}</div>
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ fontFamily:C.mono, fontSize:13, fontWeight:700, color:C.teal }}>{fDist(r.distance)}km</div>
                  <div style={{ fontSize:9, color:C.muted, marginTop:2 }}>{fPace(r.average_speed)}/km</div>
                </div>
                <div style={{ color:C.muted, fontSize:14 }}>›</div>
              </button>
            );
          })}
        </div>
      </Card>

      {gear && gear.length>0 && (
        <Card>
          <Label color={C.purple}>Shoe Mileage — Live from Strava</Label>
          <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
            {gear.map((s,i) => {
              const km = (s.distance||0)/1000;
              const pct = Math.min(100,Math.round(km/800*100));
              return (
                <div key={i} style={{ background:C.surface, borderRadius:9, padding:"10px 13px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                    <div><div style={{ fontSize:12, fontWeight:600, color:C.text }}>{s.name}</div><div style={{ fontSize:9, color:C.sub, marginTop:1 }}>{s.brand_name||""}</div></div>
                    <div style={{ fontFamily:C.mono, fontSize:12, fontWeight:700, color:C.purple }}>{km.toFixed(0)}km</div>
                  </div>
                  <div style={{ height:3, background:C.border, borderRadius:2 }}>
                    <div style={{ width:`${pct}%`, height:"100%", background:pct>80?C.pink:pct>50?C.amber:C.teal, borderRadius:2 }}/>
                  </div>
                  <div style={{ fontSize:8, color:C.muted, marginTop:3 }}>{pct}% of 800km estimated life</div>
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
function Gym({ activities, userPrefs, onSavePrefs }) {
  const [editing, setEditing] = useState(false);
  const lifts = userPrefs?.lifts || DEFAULT_LIFTS;
  const [editLifts, setEditLifts] = useState(lifts);
  const sessions = activities.filter(a=>a.type==="WeightTraining"||a.sport_type==="WeightTraining"||(a.name||"").toLowerCase().includes("weight")||(a.name||"").toLowerCase().includes("gym"));
  const save = () => { onSavePrefs({...userPrefs,lifts:editLifts}); setEditing(false); };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12, paddingBottom:20 }}>
      <Card>
        <Label color={C.amber} action={<EditBtn editing={editing} onToggle={()=>{if(editing)save();else{setEditLifts(lifts);setEditing(true);}}}/>}>Current Lifts</Label>
        <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
          {(editing?editLifts:lifts).map((l,i) => (
            <div key={i} style={{ background:C.surface, borderRadius:9, padding:"10px 13px", display:"flex", justifyContent:"space-between", alignItems:"center", gap:10 }}>
              {editing ? (
                <>
                  <Input value={l.name} onChange={v=>setEditLifts(p=>p.map((x,j)=>j===i?{...x,name:v}:x))} style={{ flex:1 }}/>
                  <Input value={l.weight} onChange={v=>setEditLifts(p=>p.map((x,j)=>j===i?{...x,weight:v}:x))} style={{ width:100 }}/>
                  <Input value={`${l.sets}x${l.reps}`} onChange={v=>{const[s,r]=(v.split("x")||["3","10"]);setEditLifts(p=>p.map((x,j)=>j===i?{...x,sets:parseInt(s)||3,reps:parseInt(r)||10}:x));}} style={{ width:60 }}/>
                  <button onClick={()=>setEditLifts(p=>p.filter((_,j)=>j!==i))} style={{ background:"transparent", border:"none", color:C.pink, cursor:"pointer", fontSize:16 }}>×</button>
                </>
              ) : (
                <>
                  <div><div style={{ fontSize:12, fontWeight:600, color:C.text }}>{l.name}</div><div style={{ fontSize:9, color:C.sub, marginTop:2 }}>{l.sets} sets × {l.reps} reps</div></div>
                  <div style={{ fontFamily:C.mono, fontSize:12, fontWeight:700, color:C.amber }}>{l.weight}</div>
                </>
              )}
            </div>
          ))}
          {editing && <button onClick={()=>setEditLifts(p=>[...p,{name:"New Exercise",weight:"0kg",sets:3,reps:10}])} style={{ background:"transparent", border:`1px dashed ${C.border}`, borderRadius:9, padding:"9px", color:C.muted, cursor:"pointer", fontSize:11 }}>+ Add exercise</button>}
        </div>
      </Card>
      {sessions.length>0 && (
        <Card>
          <Label>Recent Sessions</Label>
          <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
            {sessions.slice(0,10).map(s => (
              <div key={s.id} style={{ background:C.surface, borderRadius:9, padding:"9px 12px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div><div style={{ fontSize:11, fontWeight:600, color:C.text }}>{s.name}</div><div style={{ fontSize:9, color:C.sub, marginTop:2 }}>{new Date(s.start_date_local).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</div></div>
                <div style={{ textAlign:"right" }}><div style={{ fontFamily:C.mono, fontSize:11, color:C.amber }}>{fTime(s.moving_time)}</div>{s.average_heartrate&&<div style={{ fontSize:9, color:C.pink, marginTop:2 }}>{Math.round(s.average_heartrate)} bpm</div>}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── RECOVERY ────────────────────────────────────────────────────────────────
function Recovery({ whoopData, whoopOk, onConnectWhoop }) {
  if (!whoopOk) return (
    <div style={{ display:"flex", flexDirection:"column", gap:12, paddingBottom:20 }}>
      <Card style={{ textAlign:"center", padding:"40px 20px" }}>
        <div style={{ fontSize:36, marginBottom:12 }}>⌚</div>
        <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:6 }}>Connect Whoop</div>
        <div style={{ fontSize:11, color:C.sub, marginBottom:20, lineHeight:1.7, maxWidth:260, margin:"0 auto 20px" }}>Live recovery, HRV, sleep and strain.</div>
        <Btn onClick={onConnectWhoop} color={C.pink}>Connect Whoop</Btn>
      </Card>
    </div>
  );

  const recs = whoopData?.recoveries?.records||[];
  const sleeps = whoopData?.sleeps?.records||[];
  const cycles = whoopData?.cycles?.records||[];
  const latest = recs[0];
  const latestSleep = sleeps[0];

  const hrvChart = recs.slice(0,14).reverse().map(r=>({ day:new Date(r.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"}), hrv:Math.round(r.score?.hrv_rmssd_milli||0), rhr:Math.round(r.score?.resting_heart_rate||0) }));
  const recChart = recs.slice(0,14).reverse().map(r=>({ day:new Date(r.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"}), score:Math.round(r.score?.recovery_score||0) }));
  const sleepChart = sleeps.slice(0,14).reverse().map(s=>({ day:new Date(s.start).toLocaleDateString("en-GB",{day:"numeric",month:"short"}), hours:s.score?.stage_summary?.total_in_bed_time_milli?parseFloat((s.score.stage_summary.total_in_bed_time_milli/3600000).toFixed(1)):0 }));

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12, paddingBottom:20 }}>
      {latest && (
        <Card>
          <Label color={C.pink}>Today's Recovery</Label>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
            <Stat label="Recovery Score" value={`${Math.round(latest.score?.recovery_score||0)}%`} color={recCol(latest.score?.recovery_score)} size="lg"/>
            <Stat label="HRV" value={`${Math.round(latest.score?.hrv_rmssd_milli||0)}`} sub="ms rMSSD" color={C.teal} size="lg"/>
            <Stat label="Resting HR" value={`${Math.round(latest.score?.resting_heart_rate||0)}`} sub="bpm" color={C.pink}/>
            <Stat label="Resp Rate" value={`${latest.score?.respiratory_rate?.toFixed(1)||"—"}`} sub="breaths/min" color={C.purple}/>
          </div>
        </Card>
      )}
      {latestSleep && (
        <Card>
          <Label>Last Night's Sleep</Label>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
            <Stat label="Sleep Score" value={`${Math.round(latestSleep.score?.sleep_performance_percentage||0)}%`} color={C.blue}/>
            <Stat label="Time in Bed" value={latestSleep.score?.stage_summary?.total_in_bed_time_milli?`${(latestSleep.score.stage_summary.total_in_bed_time_milli/3600000).toFixed(1)}h`:"—"} color={C.blue}/>
            <Stat label="REM" value={latestSleep.score?.stage_summary?.total_rem_sleep_time_milli?`${(latestSleep.score.stage_summary.total_rem_sleep_time_milli/60000).toFixed(0)}m`:"—"} color={C.purple}/>
            <Stat label="Deep Sleep" value={latestSleep.score?.stage_summary?.total_slow_wave_sleep_time_milli?`${(latestSleep.score.stage_summary.total_slow_wave_sleep_time_milli/60000).toFixed(0)}m`:"—"} color={C.teal}/>
          </div>
        </Card>
      )}
      {hrvChart.length>0 && (
        <Card>
          <Label color={C.teal}>HRV & Resting HR — 14 Days</Label>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={hrvChart}>
              <XAxis dataKey="day" tick={{fontSize:8,fill:C.muted}} tickLine={false} axisLine={false} interval={2}/>
              <YAxis tick={{fontSize:8,fill:C.muted}} tickLine={false} axisLine={false} width={24}/>
              <Tooltip content={<CT/>}/>
              <Line type="monotone" dataKey="hrv" name="HRV" stroke={C.teal} strokeWidth={1.5} dot={{fill:C.teal,r:2}}/>
              <Line type="monotone" dataKey="rhr" name="RHR" stroke={C.pink} strokeWidth={1.5} dot={{fill:C.pink,r:2}}/>
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}
      {recChart.length>0 && (
        <Card>
          <Label color={C.pink}>Recovery Score — 14 Days</Label>
          <ResponsiveContainer width="100%" height={110}>
            <BarChart data={recChart}>
              <XAxis dataKey="day" tick={{fontSize:8,fill:C.muted}} tickLine={false} axisLine={false} interval={2}/>
              <YAxis tick={{fontSize:8,fill:C.muted}} tickLine={false} axisLine={false} domain={[0,100]} width={24}/>
              <Tooltip content={<CT/>}/>
              <Bar dataKey="score" name="Recovery" fill={C.teal} radius={[3,3,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
      {sleepChart.length>0 && (
        <Card>
          <Label color={C.blue}>Sleep Duration — 14 Days</Label>
          <ResponsiveContainer width="100%" height={110}>
            <BarChart data={sleepChart}>
              <XAxis dataKey="day" tick={{fontSize:8,fill:C.muted}} tickLine={false} axisLine={false} interval={2}/>
              <YAxis tick={{fontSize:8,fill:C.muted}} tickLine={false} axisLine={false} width={24} unit="h"/>
              <Tooltip content={<CT/>}/>
              <Bar dataKey="hours" name="Hours" fill={C.blue} radius={[3,3,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
      {cycles.length>0 && (
        <Card>
          <Label color={C.amber}>Daily Strain — 14 Days</Label>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {cycles.slice(0,7).map((c,i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:10, background:C.surface, borderRadius:7, padding:"8px 11px" }}>
                <div style={{ fontSize:9, color:C.sub, minWidth:60 }}>{new Date(c.start).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</div>
                <div style={{ flex:1, height:3, background:C.border, borderRadius:2 }}><div style={{ width:`${Math.min((c.score?.strain||0)/21*100,100)}%`, height:"100%", background:C.amber, borderRadius:2 }}/></div>
                <div style={{ fontFamily:C.mono, fontSize:12, fontWeight:700, color:C.amber, minWidth:28, textAlign:"right" }}>{c.score?.strain?.toFixed(1)||"—"}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── SESSION CARD ─────────────────────────────────────────────────────────────
function SessionCard({ session: s, typeC }) {
  const [expanded, setExpanded] = useState(false);
  const col = typeC[s.type]||C.teal;
  const isRest = s.type==="Rest";
  return (
    <Card style={{ opacity:isRest?0.6:1 }}>
      <button onClick={()=>!isRest&&setExpanded(!expanded)} style={{ background:"transparent", border:"none", width:"100%", textAlign:"left", cursor:isRest?"default":"pointer", padding:0 }}>
        <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
          <div style={{ textAlign:"center", minWidth:40, flexShrink:0 }}>
            <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:4 }}>{s.day}</div>
            <div style={{ width:36, height:36, borderRadius:"50%", background:`${col}20`, border:`1px solid ${col}40`, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ width:10, height:10, borderRadius:"50%", background:col }}/>
            </div>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:5, flexWrap:"wrap" }}>
              <span style={{ fontSize:13, fontWeight:700, color:C.text }}>{s.type}</span>
              {s.dist&&s.dist!=="0km"&&<Pill color={col}>{s.dist}</Pill>}
              {s.pace&&s.pace!=="N/A"&&<Pill color={C.amber}>{s.pace}</Pill>}
            </div>
            {s.shoe&&s.shoe!=="N/A"&&<div style={{ fontSize:10, color:C.purple, marginBottom:3 }}>👟 {s.shoe}</div>}
            {!expanded&&s.notes&&<div style={{ fontSize:10, color:C.sub, lineHeight:1.6, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.notes}</div>}
          </div>
          {!isRest&&<div style={{ color:C.muted, fontSize:12, flexShrink:0 }}>{expanded?"▲":"▼"}</div>}
        </div>
      </button>
      {expanded && (
        <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid ${C.border}` }}>
          {s.notes&&<div style={{ fontSize:11, color:C.sub, lineHeight:1.8, marginBottom:12 }}>{s.notes}</div>}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
            {s.dist&&s.dist!=="0km"&&<Stat label="Distance" value={s.dist} size="sm"/>}
            {s.pace&&s.pace!=="N/A"&&<Stat label="Target Pace" value={s.pace} color={C.amber} size="sm"/>}
            {s.shoe&&s.shoe!=="N/A"&&<Stat label="Shoe" value={s.shoe} color={C.purple} size="sm"/>}
          </div>
          {!isRest&&s.dist!=="0km"&&<div style={{ fontSize:10, color:C.muted, textAlign:"center", padding:"8px 0 2px", borderTop:`1px solid ${C.border}`, marginTop:10 }}>Coros API integration coming soon</div>}
        </div>
      )}
    </Card>
  );
}

// ─── TRAINING PLAN ───────────────────────────────────────────────────────────
function TrainingPlan({ onChat, externalPlan }) {
  const [plan, setPlan] = useState(null);
  const [planLoaded, setPlanLoaded] = useState(false);
  useEffect(() => { loadTrainingPlan().then(p=>{if(p)setPlan(p);setPlanLoaded(true);}); }, []);
  const savePlan = p => { setPlan(p); saveTrainingPlan(p); };
  useEffect(() => { if(externalPlan&&planLoaded) savePlan(externalPlan); }, [externalPlan,planLoaded]);
  const typeC = { Rest:C.muted, Easy:C.teal, Interval:C.pink, Tempo:C.amber, "Long Run":C.blue, Gym:C.orange };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12, paddingBottom:20 }}>
      {!plan ? (
        <Card style={{ textAlign:"center", padding:"32px 20px" }}>
          <div style={{ fontSize:36, marginBottom:12 }}>📋</div>
          <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:6 }}>No training plan yet</div>
          <div style={{ fontSize:11, color:C.sub, marginBottom:20, lineHeight:1.7, maxWidth:260, margin:"0 auto 20px" }}>Ask Claude in Chat to build your Berlin block.</div>
          <Btn onClick={onChat} color={C.teal} sm>Open Chat</Btn>
        </Card>
      ) : (
        <>
          <Card>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
              <div><div style={{ fontSize:14, fontWeight:700, color:C.text }}>{plan.title}</div>{plan.startDate&&<div style={{ fontSize:10, color:C.sub, marginTop:3 }}>Starting {new Date(plan.startDate).toLocaleDateString("en-GB",{day:"numeric",month:"long"})}</div>}</div>
              <Btn onClick={()=>savePlan(null)} color={C.muted} sm outline>Clear</Btn>
            </div>
          </Card>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {plan.sessions.map((s,i)=><SessionCard key={i} session={s} typeC={typeC}/>)}
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
    <div style={{ display:"flex", flexDirection:"column", gap:12, paddingBottom:20 }}>
      <Card>
        <Label color={C.purple}>World Marathon Majors Mission</Label>
        <div style={{ fontSize:12, color:C.sub, lineHeight:1.8, marginBottom:14 }}>Running all six World Marathon Majors for a different charity each time. For brother Noah who has Duchenne Muscular Dystrophy. £5,000+ raised so far.</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
          <Stat label="Completed" value="2 / 6" sub="Both London" color={C.teal}/>
          <Stat label="Raised" value="£5k+" sub="for charity" color={C.pink}/>
          <Stat label="Next" value="Berlin" sub="28 Sep 2026" color={C.amber}/>
          <Stat label="Sub-3 Goal" value="Seville" sub="Feb 2027" color={C.purple}/>
        </div>
      </Card>
      <Card>
        <Label action={<EditBtn editing={editing} onToggle={()=>{if(editing)save();else{setEditRaces(races);setEditSponsorship(sponsorship);setEditing(true);}}}/>}>Race Pipeline</Label>
        <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
          {(editing?editRaces:races).map((r,i) => (
            <div key={i} style={{ background:C.surface, border:`1px solid ${r.next?C.teal+"40":C.border}`, borderRadius:9, padding:"11px 13px", opacity:r.done?0.5:1 }}>
              {editing ? (
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    <Input value={r.name} onChange={v=>setEditRaces(p=>p.map((x,j)=>j===i?{...x,name:v}:x))} style={{ flex:1 }}/>
                    <Input value={r.date} onChange={v=>setEditRaces(p=>p.map((x,j)=>j===i?{...x,date:v}:x))} style={{ width:120 }}/>
                  </div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    <Input value={r.charity} onChange={v=>setEditRaces(p=>p.map((x,j)=>j===i?{...x,charity:v}:x))} style={{ flex:1 }}/>
                    <Input value={r.target} onChange={v=>setEditRaces(p=>p.map((x,j)=>j===i?{...x,target:v}:x))} style={{ width:100 }}/>
                  </div>
                  <button onClick={()=>setEditRaces(p=>p.filter((_,j)=>j!==i))} style={{ background:"transparent", border:"none", color:C.pink, cursor:"pointer", fontSize:10, textAlign:"left" }}>Remove</button>
                </div>
              ) : (
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
                  <div><div style={{ fontSize:12, fontWeight:700, color:r.done?C.muted:r.next?C.teal:C.text }}>{r.done?"✓ ":""}{r.name}</div><div style={{ fontSize:9, color:C.muted, marginTop:2 }}>{r.date} · {r.charity}</div></div>
                  <div style={{ fontFamily:C.mono, fontSize:11, fontWeight:700, color:C.amber }}>{r.target}</div>
                </div>
              )}
            </div>
          ))}
          {editing&&<button onClick={()=>setEditRaces(p=>[...p,{name:"New Race",date:"TBC",charity:"TBC",target:"TBC"}])} style={{ background:"transparent", border:`1px dashed ${C.border}`, borderRadius:9, padding:"9px", color:C.muted, cursor:"pointer", fontSize:11 }}>+ Add race</button>}
        </div>
      </Card>
      <Card>
        <Label color={C.pink}>Sponsorship Tracker</Label>
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {(editing?editSponsorship:sponsorship).map((s,i) => {
            const col={success:C.teal,pending:C.amber,future:C.purple}[s.state]||C.muted;
            return (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:C.surface, borderRadius:7, padding:"8px 11px", gap:8 }}>
                {editing ? (
                  <>
                    <Input value={s.name} onChange={v=>setEditSponsorship(p=>p.map((x,j)=>j===i?{...x,name:v}:x))} style={{ flex:1 }}/>
                    <Input value={s.status} onChange={v=>setEditSponsorship(p=>p.map((x,j)=>j===i?{...x,status:v}:x))} style={{ flex:1 }}/>
                    <select value={s.state} onChange={e=>setEditSponsorship(p=>p.map((x,j)=>j===i?{...x,state:e.target.value}:x))} style={{ background:C.card, border:`1px solid ${C.border}`, color:C.text, borderRadius:5, padding:"4px 6px", fontSize:10 }}>
                      <option value="success">Success</option><option value="pending">Pending</option><option value="future">Future</option>
                    </select>
                    <button onClick={()=>setEditSponsorship(p=>p.filter((_,j)=>j!==i))} style={{ background:"transparent", border:"none", color:C.pink, cursor:"pointer", fontSize:16 }}>×</button>
                  </>
                ) : (
                  <><span style={{ fontSize:11, color:C.text }}>{s.name}</span><span style={{ fontSize:9, color:col, fontWeight:600 }}>{s.status}</span></>
                )}
              </div>
            );
          })}
          {editing&&<button onClick={()=>setEditSponsorship(p=>[...p,{name:"New Brand",status:"Applied",state:"pending"}])} style={{ background:"transparent", border:`1px dashed ${C.border}`, borderRadius:7, padding:"7px", color:C.muted, cursor:"pointer", fontSize:11 }}>+ Add brand</button>}
        </div>
      </Card>
    </div>
  );
}

// ─── CHAT ────────────────────────────────────────────────────────────────────
function Chat({ activities, stats, whoopData, whoopOk, onPlanSaved, corosSession, onCorosSessionHandled }) {
  const [messages, setMessages] = useState([{role:"assistant",content:"Hi Caleb! I know everything about you and your training. Ask me anything — running, recovery, plans, race strategy, gym, nutrition. Ask me to make a training plan and it'll save to your Plan tab!"}]);
  const [chatLoaded, setChatLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(()=>{loadChatHistory().then(msgs=>{if(msgs&&msgs.length>0)setMessages(msgs);setChatLoaded(true);});},[]);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[messages]);
  useEffect(()=>{if(chatLoaded)saveChatHistory(messages);},[messages,chatLoaded]);
  useEffect(()=>{
    if(corosSession&&chatLoaded){
      setInput(`Please add this session to my Coros calendar: ${corosSession.day} - ${corosSession.type}, ${corosSession.dist}, target pace ${corosSession.pace}, shoe: ${corosSession.shoe}. Notes: ${corosSession.notes}`);
      if(onCorosSessionHandled)onCorosSessionHandled();
    }
  },[corosSession,chatLoaded]);

  const extractPlan = text => {
    if(!text.includes("PLAN_START")||!text.includes("PLAN_END")) return null;
    try {
      const section = text.split("PLAN_START")[1].split("PLAN_END")[0].trim();
      const lines = section.split("\n").map(l=>l.trim()).filter(Boolean);
      let title="Training Plan"; const sessions=[];
      for(const line of lines){
        if(line.startsWith("TITLE:")){title=line.replace("TITLE:","").trim();continue;}
        const parts=line.split("|").map(p=>p.trim());
        if(parts.length>=4)sessions.push({day:parts[0],type:parts[1],dist:parts[2],pace:parts[3],shoe:parts[4]||"",notes:parts[5]||""});
      }
      if(sessions.length>=3)return{title,startDate:new Date().toISOString().split("T")[0],sessions};
    } catch(e){console.error(e);}
    return null;
  };

  const cleanReply = text => {
    if(!text.includes("PLAN_START"))return text;
    const before=text.split("PLAN_START")[0].trim();
    const after=text.split("PLAN_END")[1]?.trim()||"";
    return(before+(after?"\n\n"+after:"")).trim();
  };

  const buildContext = () => {
    const runs=activities.filter(a=>a.type==="Run").slice(0,5);
    const ytd=stats?.ytd_run_totals||{};
    const rec=whoopData?.recoveries?.records?.[0];
    const sleep=whoopData?.sleeps?.records?.[0];
    return `You are a personal running coach and fitness assistant for Caleb Cunningham. Be direct, use his actual data, never use double dashes.

WHO HE IS: 20 years old, graphic design student at Kingston University London, from Southport. Lives in Kingston with girlfriend Taylor (Taz). Started running July 2024, progressed rapidly, took a break at university, restarted Christmas 2025. Raised over 5000 pounds for the Duchenne Family Support Group across two London Marathons. Brother Noah has Duchenne Muscular Dystrophy, this is why he runs. Mission: all six World Marathon Majors for a different charity each time.

RUNNING PBs: 5K 18:42 (3:44/km). 10K 40:52 (4:05/km). HM 1:32:48 (4:23/km). Marathon 3:48:59 London April 2026. He managed ankle pain from 6km, stopped to see family, had a fun day, did NOT hit the wall. Hampton Court HM March 2026: 1:33:16 trail with headwind, equivalent to around 1:29-1:30 road.

COROS FITNESS (March 2026): VO2 Max 67, threshold pace 3:57/km, threshold HR 186bpm, max HR 208bpm. Kaizen prediction 3:16. KEY: cardiovascular engine well ahead of structural fitness. Berlin block closes that gap.

RACE PIPELINE: Berlin Marathon 28 Sep 2026, Get Kids Going, target Sub 3:20. Seville Feb 2027 Sub 3:00. Valencia Dec 2027 Sub 3:00+. Then Tokyo, Chicago, New York. GFA for London requires around 2:52.

SHOES: Metaspeed Sky Tokyo Green (race day, size 8), Metaspeed Sky Tokyo Red (carbon trainer), Vaporfly 3 and 4 (intervals/tempo), ZoomFly 5 (training), Novablast 5 (easy/long runs), Adidas Evo SL (daily/tempo). Wants Saucony Endorphin Azura and Asics Megablast for Berlin block.

GYM: Smith flat bench 20kg/side 3x10, Smith incline 15kg/side 3x10, Pec deck 73kg 3x12, Preacher curl 39kg 3x10, Hammer curl 16kg 3x12, Lateral raises 8-10kg 3x15. Weight 58-61kg, height 5ft7, targeting 65kg.

NUTRITION: 2800-3200 kcal/day, 130-150g protein, 250-350g carbs. SiS Beta Fuel gels every 30 mins on long runs.

INJURIES: Ankle pain London Marathon from 6km. Arch pain in non-carbon shoes, uses Superfeet insoles. Upper left shin pain appeared during post-marathon intervals, monitor carefully.

SPONSORSHIP: SiS product confirmed. Tracksmith applied quarterly review. Adidas and Saucony testing registered. Puma Project 3 after sub-3. Asics Frontrunner apply Jan 2027.

LIVE DATA:
YTD: ${ytd.distance?(ytd.distance/1000).toFixed(1):"442.9"}km, ${ytd.count||57} runs
${rec?`Recovery: ${Math.round(rec.score?.recovery_score||0)}%, HRV: ${Math.round(rec.score?.hrv_rmssd_milli||0)}ms, RHR: ${Math.round(rec.score?.resting_heart_rate||0)}bpm`:"Recovery: Whoop not available"}
${sleep?`Last sleep: ${Math.round(sleep.score?.sleep_performance_percentage||0)}% score`:""}

RECENT RUNS:
${runs.map(r=>`- ${r.name} (${new Date(r.start_date_local).toLocaleDateString("en-GB")}): ${(r.distance/1000).toFixed(2)}km at ${fPace(r.average_speed)}/km${r.average_heartrate?`, ${Math.round(r.average_heartrate)}bpm`:""}`).join("\n")}

CRITICAL TRAINING PLAN FORMAT: When asked for a plan, reply conversationally first (2-3 sentences), then use this EXACT format. Every day needs distance, pace and shoe:

PLAN_START
TITLE: [title]
Mon | [type] | [X]km | [pace]/km | [shoe] | [description with full workout structure]
Tue | [type] | [X]km | [pace]/km | [shoe] | [description]
Wed | [type] | [X]km | [pace]/km | [shoe] | [description]
Thu | [type] | [X]km | [pace]/km | [shoe] | [description]
Fri | [type] | [X]km | [pace]/km | [shoe] | [description]
Sat | [type] | [X]km | [pace]/km | [shoe] | [description]
Sun | [type] | [X]km | [pace]/km | [shoe] | [description]
PLAN_END

Rest days: Mon | Rest | 0km | N/A | N/A | Full rest or gym only
Types: Easy, Interval, Tempo, Long Run, Rest, Gym`;
  };

  const send = async () => {
    if(!input.trim()||loading)return;
    const userMsg={role:"user",content:input.trim()};
    setMessages(prev=>[...prev,userMsg]);
    setInput("");
    setLoading(true);
    try {
      const res=await fetch("/.netlify/functions/claude-chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:buildContext(),messages:[...messages.filter(m=>m.role!=="system"),userMsg].map(m=>({role:m.role,content:m.content}))})});
      const data=await res.json();
      const reply=data.content?.[0]?.text||"Sorry, something went wrong.";
      const plan=extractPlan(reply);
      const cleaned=cleanReply(reply);
      const final=plan?cleaned+"\n\n✓ Training plan saved to your Plan tab!":cleaned;
      setMessages(prev=>[...prev,{role:"assistant",content:final}]);
      if(plan&&onPlanSaved)onPlanSaved(plan);
    } catch(e){setMessages(prev=>[...prev,{role:"assistant",content:"Something went wrong. Please try again."}]);}
    setLoading(false);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", gap:0 }}>
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:8 }}>
        <button onClick={()=>{const f=[{role:"assistant",content:"Hi Caleb! How can I help today?"}];setMessages(f);saveChatHistory(f);}} style={{ fontSize:9, color:C.muted, background:"transparent", border:`1px solid ${C.border}`, borderRadius:5, padding:"3px 8px", cursor:"pointer" }}>Clear chat</button>
      </div>
      <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:10, paddingBottom:12 }}>
        {messages.map((m,i)=>(
          <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
            <div style={{ maxWidth:"85%", padding:"10px 13px", borderRadius:12, background:m.role==="user"?C.teal:C.card, color:m.role==="user"?C.bg:C.text, border:m.role==="assistant"?`1px solid ${C.border}`:"none", fontSize:12, lineHeight:1.7, fontWeight:m.role==="user"?500:400, whiteSpace:"pre-wrap" }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading&&(
          <div style={{ display:"flex", justifyContent:"flex-start" }}>
            <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"10px 14px", display:"flex", gap:4 }}>
              {[0,1,2].map(i=><div key={i} style={{ width:5, height:5, borderRadius:"50%", background:C.muted, animation:`bounce .9s ${i*0.15}s infinite` }}/>)}
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>
      <div style={{ display:"flex", gap:8, paddingTop:10, borderTop:`1px solid ${C.border}` }}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()} placeholder="Ask me anything about your training..." style={{ flex:1, background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 13px", color:C.text, fontSize:12, outline:"none", fontFamily:"Inter" }}/>
        <button onClick={send} disabled={loading||!input.trim()} style={{ background:C.teal, color:C.bg, border:"none", borderRadius:10, padding:"10px 16px", fontSize:13, fontWeight:700, cursor:"pointer", opacity:loading||!input.trim()?0.4:1 }}>→</button>
      </div>
      <style>{`@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}`}</style>
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

  useEffect(()=>{if(whoopOk)getWhoopData().then(setWhoopData).catch(console.error);},[whoopOk]);
  useEffect(()=>{loadUserPrefs().then(p=>{if(p)setUserPrefs(p);});},[]);

  const handleSavePrefs=useCallback(prefs=>{setUserPrefs(prefs);saveUserPrefs(prefs);},[]);
  const handleConnectWhoop=()=>window.location.assign(getWhoopAuthUrl());

  if(!connected||whoopPending)return <ConnectScreen whoopPending={whoopPending}/>;

  const sharedProps={activities,stats,whoopData,whoopOk,onConnectWhoop:handleConnectWhoop};

  const views={
    overview:<Overview {...sharedProps} bestEfforts={bestEfforts} gear={gear} userPrefs={userPrefs} onSavePrefs={handleSavePrefs}/>,
    running:<Running activities={activities} stats={stats} gear={gear}/>,
    gym:<Gym activities={activities} userPrefs={userPrefs} onSavePrefs={handleSavePrefs}/>,
    recovery:<Recovery whoopData={whoopData} whoopOk={whoopOk} onConnectWhoop={handleConnectWhoop}/>,
    plan:<TrainingPlan onChat={()=>setPage("chat")} externalPlan={savedPlan}/>,
    races:<Races userPrefs={userPrefs} onSavePrefs={handleSavePrefs}/>,
    chat:<Chat {...sharedProps} onPlanSaved={setSavedPlan} corosSession={corosSession} onCorosSessionHandled={()=>setCorosSession(null)}/>,
  };

  const NavItem=({n})=>(
    <button onClick={()=>{setPage(n.id);if(window.innerWidth<=640)setSidebarOpen(false);}} style={{ display:"flex", alignItems:"center", gap:9, width:"100%", padding:"9px 12px", background:page===n.id?`${C.teal}12`:"transparent", border:`1px solid ${page===n.id?C.teal+"25":"transparent"}`, borderRadius:8, color:page===n.id?C.teal:C.muted, fontSize:12, fontWeight:page===n.id?600:400, marginBottom:2, cursor:"pointer" }}>
      <span style={{ fontSize:14 }}>{n.icon}</span><span>{n.label}</span>
    </button>
  );

  return (
    <div style={{ display:"flex", height:"100vh", background:C.bg, color:C.text, fontFamily:"Inter,sans-serif", overflow:"hidden" }}>
      <div style={{ width:sidebarOpen?185:0, minWidth:sidebarOpen?185:0, background:C.surface, borderRight:sidebarOpen?`1px solid ${C.border}`:"none", flexShrink:0, height:"100vh", overflowY:"auto", overflowX:"hidden", transition:"width 0.25s ease, min-width 0.25s ease" }}>
        <div style={{ width:185, minWidth:185 }}>
          <div style={{ padding:"18px 16px 14px", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ fontFamily:C.mono, fontSize:9, color:C.teal, letterSpacing:"0.18em", marginBottom:6 }}>FITNESS DASHBOARD</div>
            <div style={{ fontSize:13, fontWeight:700, color:C.text }}>Caleb Cunningham</div>
            {athlete&&<div style={{ fontSize:9, color:C.muted, marginTop:2 }}>{athlete.city||"Kingston"}</div>}
          </div>
          <nav style={{ padding:"10px 8px" }}>
            {NAV.map(n=><NavItem key={n.id} n={n}/>)}
          </nav>
          <div style={{ padding:"12px 16px", borderTop:`1px solid ${C.border}` }}>
            {!whoopOk&&<button onClick={handleConnectWhoop} style={{ width:"100%", background:C.pink, color:C.bg, border:"none", borderRadius:8, padding:"8px", fontSize:11, fontWeight:700, cursor:"pointer", marginBottom:8 }}>+ Connect Whoop</button>}
            {whoopOk&&<div style={{ fontSize:9, color:C.teal, marginBottom:6, letterSpacing:"0.08em" }}>✓ WHOOP CONNECTED</div>}
            <div style={{ fontSize:9, color:C.muted }}>Strava · Coros · Whoop</div>
            <div style={{ fontSize:9, color:`${C.pink}80`, marginTop:2 }}>Running for Noah 🧡</div>
            <div style={{ display:"flex", gap:6, marginTop:10 }}>
              <button onClick={()=>{disconnect();setConnected(false);setActivities([]);}} style={{ fontSize:8, color:C.muted, background:"transparent", border:`1px solid ${C.border}`, borderRadius:4, padding:"3px 7px", cursor:"pointer" }}>STRAVA</button>
              {whoopOk&&<button onClick={()=>{disconnectWhoop();setWhoopOk(false);setWhoopData(null);}} style={{ fontSize:8, color:C.muted, background:"transparent", border:`1px solid ${C.border}`, borderRadius:4, padding:"3px 7px", cursor:"pointer" }}>WHOOP</button>}
            </div>
          </div>
        </div>
      </div>
      <div style={{ flex:1, display:"flex", flexDirection:"column", height:"100vh", overflow:"hidden" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 16px", borderBottom:`1px solid ${C.border}`, background:C.surface, flexShrink:0 }}>
          <button onClick={()=>setSidebarOpen(!sidebarOpen)} style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.sub, borderRadius:7, padding:"5px 9px", fontSize:14, cursor:"pointer", flexShrink:0, lineHeight:1 }}>{sidebarOpen?"✕":"☰"}</button>
          <div style={{ fontFamily:C.mono, fontSize:9, color:C.teal, letterSpacing:"0.18em" }}>FITNESS DASHBOARD</div>
          <div style={{ flex:1 }}/>
          <div style={{ fontSize:10, color:C.muted }}>{NAV.find(n=>n.id===page)?.label}</div>
        </div>
        <div style={{ flex:1, overflowY:page==="chat"?"hidden":"auto", padding:"16px", display:"flex", flexDirection:"column" }}>
          {loading?<Loader text="Loading your data..."/>:views[page]}
        </div>
      </div>
    </div>
  );
}
