import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { isConnected, disconnect, exchangeCode, getAthlete, getStats, getActivities, getActivity, getStreams, getAllGear, extractBestEfforts } from "./strava";
import { isWhoopConnected, disconnectWhoop, exchangeWhoopCode, getWhoopAuthUrl, getWhoopData } from "./whoop";
import { loadChatHistory, saveChatHistory, loadTrainingPlan, saveTrainingPlan, loadUserPrefs, saveUserPrefs } from "./supabase";
import { LIFTS as DEFAULT_LIFTS, RACES as DEFAULT_RACES, SPONSORSHIP as DEFAULT_SPONSORSHIP, fPace, fTime, fDist, actType, typeCol, recCol, weeklyVol } from "./data";

// ─── DESIGN SYSTEM ────────────────────────────────────────────────────────────
// FitSync palette - indigo primary, clean light/dark
const C = {
  indigo:   "#5B5BD6",
  indigoL:  "rgba(91,91,214,0.08)",
  indigoB:  "rgba(91,91,214,0.18)",
  green:    "#30A46C",
  greenL:   "rgba(48,164,108,0.08)",
  red:      "#E5484D",
  redL:     "rgba(229,72,77,0.08)",
  orange:   "#F76B15",
  orangeL:  "rgba(247,107,21,0.08)",
  purple:   "#8E4EC6",
  purpleL:  "rgba(142,78,198,0.08)",
  yellow:   "#FFBD2E",
  teal:     "#12A594",
};

const LIGHT = {
  bg:       "#F2F2F7",
  card:     "#FFFFFF",
  card2:    "#F5F5F8",
  border:   "rgba(0,0,0,0.06)",
  divider:  "rgba(0,0,0,0.04)",
  text:     "#111118",
  sub:      "#6E6E85",
  muted:    "#9B9BB0",
  nav:      "#FFFFFF",
  navB:     "rgba(0,0,0,0.06)",
  input:    "#F5F5F8",
  shadow:   "0 1px 3px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.05)",
};
const DARK = {
  bg:       "#0D0D12",
  card:     "#17171F",
  card2:    "#1E1E28",
  border:   "rgba(255,255,255,0.07)",
  divider:  "rgba(255,255,255,0.04)",
  text:     "#F0F0FA",
  sub:      "#8888A0",
  muted:    "#55556A",
  nav:      "#17171F",
  navB:     "rgba(255,255,255,0.07)",
  input:    "#1E1E28",
  shadow:   "0 1px 3px rgba(0,0,0,0.3), 0 4px 16px rgba(0,0,0,0.2)",
};

const sans = "'Inter',-apple-system,BlinkMacSystemFont,sans-serif";
const WX = {0:"☀️",1:"🌤",2:"⛅",3:"☁️",45:"🌫",51:"🌦",53:"🌧",61:"🌧",63:"🌧",71:"❄️",80:"🌦",95:"⛈"};

const CSS = `
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.35}}
  @keyframes fire{0%,100%{transform:scaleY(1)}50%{transform:scaleY(1.1) scaleX(0.94)}}
  .page{animation:up .2s ease both}
  *{-webkit-tap-highlight-color:transparent;box-sizing:border-box;margin:0;padding:0}
  ::-webkit-scrollbar{width:0}
  input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
  button{font-family:inherit}
`;

function calcStreaks(activities) {
  const runs = activities.filter(a => a.type==="Run"||a.sport_type==="Run");
  const dates = [...new Set(runs.map(r => new Date(r.start_date_local).toISOString().split("T")[0]))].sort().reverse();
  if (!dates.length) return {current:0,longest:0};
  const today = new Date(); today.setHours(0,0,0,0);
  const check = new Date(today); let current = 0;
  for (const d of dates) {
    if (d === check.toISOString().split("T")[0]) { current++; check.setDate(check.getDate()-1); }
    else break;
  }
  let longest=0, streak=1;
  for (let i=1; i<dates.length; i++) {
    const diff = (new Date(dates[i-1])-new Date(dates[i]))/86400000;
    if (diff===1) { streak++; longest=Math.max(longest,streak); } else streak=1;
  }
  return {current, longest: Math.max(longest,current)};
}

async function fetchWeather(lat,lng,dateStr) {
  try {
    const r = await fetch(`/.netlify/functions/weather?lat=${lat}&lng=${lng}&date=${dateStr}`);
    const d = await r.json();
    if (!d.hourly) return null;
    return {temp:Math.round(d.hourly.temperature_2m[9]), code:d.hourly.weathercode[9]};
  } catch { return null; }
}

// ─── PRIMITIVES ───────────────────────────────────────────────────────────────
// Card with FitSync shadow style (no heavy border)
function Card({children, style={}, T, onClick}) {
  const [pressed, setPressed] = useState(false);
  return (
    <div onClick={onClick}
      onMouseDown={onClick?()=>setPressed(true):undefined}
      onMouseUp={onClick?()=>setPressed(false):undefined}
      onTouchStart={onClick?()=>setPressed(true):undefined}
      onTouchEnd={onClick?()=>setPressed(false):undefined}
      style={{
        background:T.card, borderRadius:16, boxShadow:T.shadow,
        border:`1px solid ${T.border}`,
        cursor:onClick?"pointer":"default",
        transform:pressed?"scale(0.985)":"scale(1)",
        transition:"transform .12s ease",
        ...style
      }}>
      {children}
    </div>
  );
}

const Row = ({children,style={}}) => <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",...style}}>{children}</div>;

function Chip({children, color=C.indigo, style={}}) {
  return <span style={{display:"inline-flex",alignItems:"center",background:`${color}15`,color,borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:600,fontFamily:sans,letterSpacing:"0.01em",whiteSpace:"nowrap",...style}}>{children}</span>;
}

function Btn({children, onClick, color=C.indigo, ghost=false, sm=false, full=false, style={}, disabled=false}) {
  const [p,setP]=useState(false);
  return <button onClick={onClick} disabled={disabled}
    onMouseDown={()=>setP(true)} onMouseUp={()=>setP(false)} onMouseLeave={()=>setP(false)}
    onTouchStart={()=>setP(true)} onTouchEnd={()=>setP(false)}
    style={{background:ghost?"transparent":color,color:ghost?color:"#fff",border:`1.5px solid ${color}`,borderRadius:99,
      padding:sm?"6px 14px":"10px 20px",fontSize:sm?12:14,fontWeight:600,
      width:full?"100%":"auto",cursor:disabled?"not-allowed":"pointer",fontFamily:sans,
      opacity:disabled?0.4:1,transform:p?"scale(0.96)":"scale(1)",transition:"transform .1s ease",...style}}>
    {children}
  </button>;
}

function TxtInput({value,onChange,placeholder="",style={},type="text",T}) {
  return <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
    style={{background:T.input,border:`1px solid ${T.border}`,borderRadius:10,padding:"9px 13px",
      color:T.text,fontSize:14,outline:"none",fontFamily:sans,width:"100%",...style}}/>;
}

function EditBtn({editing,onToggle,T}) {
  return <button onClick={onToggle}
    style={{background:editing?C.indigo:"transparent",color:editing?"#fff":T.muted,
      border:`1.5px solid ${editing?C.indigo:T.border}`,borderRadius:99,padding:"4px 14px",
      fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:sans}}>
    {editing?"Save":"Edit"}
  </button>;
}

function Loader({T, text="Loading..."}) {
  return <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,gap:14,minHeight:240}}>
    <div style={{width:30,height:30,border:`2px solid ${T.border}`,borderTop:`2px solid ${C.indigo}`,borderRadius:"50%",animation:"spin .7s linear infinite"}}/>
    <div style={{fontSize:13,color:T.sub,fontFamily:sans}}>{text}</div>
  </div>;
}

// FitSync section title - large bold
function SectionTitle({children, right, T, sub}) {
  return <div style={{marginBottom:14}}>
    <Row>
      <div style={{fontSize:17,fontWeight:700,color:T.text,fontFamily:sans,letterSpacing:"-0.02em"}}>{children}</div>
      {right&&<div>{right}</div>}
    </Row>
    {sub&&<div style={{fontSize:13,color:T.sub,fontFamily:sans,marginTop:2}}>{sub}</div>}
  </div>;
}

// Tooltip
const CT = ({active,payload,label,T}) => {
  if (!active||!payload?.length) return null;
  return <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:"7px 11px",fontSize:12,boxShadow:T.shadow,fontFamily:sans}}>
    <div style={{color:T.muted,marginBottom:3,fontSize:10}}>{label}</div>
    {payload.map((p,i)=><div key={i} style={{color:p.color||C.indigo,fontWeight:600}}>{p.name}: {p.value}</div>)}
  </div>;
};

// Stat mini-card (FitSync style: number dominant, chart at bottom)
function StatCard({label,value,sub,color=C.indigo,bars,onClick,T}) {
  const [p,setP]=useState(false);
  const max=bars?Math.max(...bars,1):1;
  return <div onClick={onClick}
    onMouseDown={onClick?()=>setP(true):undefined} onMouseUp={onClick?()=>setP(false):undefined}
    onTouchStart={onClick?()=>setP(true):undefined} onTouchEnd={onClick?()=>setP(false):undefined}
    style={{background:T.card,borderRadius:16,boxShadow:T.shadow,border:`1px solid ${T.border}`,
      padding:"16px 16px 12px",cursor:onClick?"pointer":"default",
      transform:p?"scale(0.96)":"scale(1)",transition:"transform .12s ease",
      display:"flex",flexDirection:"column",minHeight:110,position:"relative",overflow:"hidden"}}>
    <div style={{position:"absolute",top:-16,right:-16,width:64,height:64,borderRadius:"50%",background:`${color}12`,pointerEvents:"none"}}/>
    <div style={{fontSize:10,fontWeight:600,color:T.muted,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:sans,marginBottom:6}}>{label}</div>
    <div style={{fontSize:28,fontWeight:800,color:T.text,letterSpacing:"-0.03em",fontFamily:sans,lineHeight:1}}>{value}</div>
    {sub&&<div style={{fontSize:12,color:T.sub,fontFamily:sans,marginTop:4}}>{sub}</div>}
    {bars&&bars.length>0&&<div style={{display:"flex",alignItems:"flex-end",gap:2,marginTop:"auto",paddingTop:8,height:24}}>
      {bars.map((b,i)=><div key={i} style={{flex:1,height:`${Math.round((b/max)*100)}%`,minHeight:2,
        background:i===bars.length-1?color:`${color}40`,borderRadius:2}}/>)}
    </div>}
  </div>;
}

// Recovery ring
function RecRing({score=0,size=88}) {
  const s=8, r=(size-s)/2, circ=2*Math.PI*r;
  const col=score>=67?C.green:score>=34?C.yellow:C.red;
  const dash=(score/100)*circ;
  const label=score>=67?"PRIMED":score>=34?"MODERATE":"LOW";
  return <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
    <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={`${col}20`} strokeWidth={s}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={s}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{transition:"stroke-dasharray .8s ease"}}/>
    </svg>
    <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1}}>
      <div style={{fontSize:Math.round(size*0.21),fontWeight:800,color:col,fontFamily:sans,lineHeight:1,letterSpacing:"-0.02em"}}>{score}%</div>
      <div style={{fontSize:Math.round(size*0.09),fontWeight:700,color:col,fontFamily:sans,letterSpacing:"0.06em",opacity:0.75}}>{label}</div>
    </div>
  </div>;
}

// Activity ring (3-ring Apple Watch style)
function ArcRing({pct=0,color,size,stroke}) {
  const r=(size-stroke)/2, circ=2*Math.PI*r, dash=Math.min(1,pct/100)*circ;
  return <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={`${color}20`} strokeWidth={stroke}/>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
      strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{transition:"stroke-dasharray .8s ease"}}/>
  </svg>;
}

function ThreeRings({weekKm,weekTarget,sleepScore,recoveryPct}) {
  const rings=[
    {pct:Math.min(100,weekKm/weekTarget*100),val:weekKm.toFixed(0),label:"km"},
    {pct:sleepScore,val:`${sleepScore}%`,label:"sleep"},
    {pct:recoveryPct,val:`${recoveryPct}%`,label:"recovery"},
  ];
  const size=68,stroke=6,radius=(size-stroke)/2,circ=2*Math.PI*radius;
  return <div style={{display:"flex",gap:12,flexShrink:0}}>
    {rings.map((r,i)=>{
      const dash=Math.min(1,r.pct/100)*circ;
      return <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
        <div style={{position:"relative",width:size,height:size}}>
          <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
            <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={stroke}/>
            <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth={stroke}
              strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{transition:"stroke-dasharray .8s ease"}}/>
          </svg>
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#fff",fontFamily:sans,lineHeight:1,textAlign:"center"}}>{r.val}</div>
          </div>
        </div>
        <div style={{fontSize:9,color:"rgba(255,255,255,0.55)",fontFamily:sans,textAlign:"center",lineHeight:1.2}}>{r.label}</div>
      </div>;
    })}
  </div>;
}
// ─── CONNECT SCREEN ───────────────────────────────────────────────────────────
function ConnectScreen({whoopPending, T}) {
  const id = process.env.REACT_APP_STRAVA_CLIENT_ID;
  const url = `https://www.strava.com/oauth/authorize?client_id=${id}&redirect_uri=${encodeURIComponent(window.location.origin)}&response_type=code&scope=read,activity:read_all`;
  if (whoopPending) return (
    <div style={{height:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:36,marginBottom:12}}>⌚</div>
        <div style={{fontSize:16,fontWeight:600,color:T.text,fontFamily:sans}}>Connecting Whoop...</div>
      </div>
    </div>
  );
  return (
    <div style={{height:"100vh",background:"#0D0D20",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{textAlign:"center",maxWidth:300}} className="page">
        <div style={{width:72,height:72,background:C.indigo,borderRadius:20,margin:"0 auto 24px",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 12px 40px ${C.indigo}50`}}>
          <svg viewBox="0 0 24 24" width={36} height={36} fill="none">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="white"/>
          </svg>
        </div>
        <div style={{fontSize:11,fontWeight:700,color:C.indigo,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:10,fontFamily:sans}}>FitSync</div>
        <div style={{fontSize:28,fontWeight:800,color:"#fff",marginBottom:8,letterSpacing:"-0.03em",fontFamily:sans}}>Caleb Cunningham</div>
        <div style={{fontSize:14,color:"rgba(255,255,255,0.4)",marginBottom:32,lineHeight:1.7,fontFamily:sans}}>Your personal training hub. Connect Strava to begin.</div>
        <a href={url} style={{display:"inline-block",background:C.indigo,color:"#fff",borderRadius:99,padding:"13px 32px",fontSize:15,fontWeight:700,textDecoration:"none",fontFamily:sans,boxShadow:`0 8px 32px ${C.indigo}50`}}>Connect with Strava</a>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.2)",marginTop:12,fontFamily:sans}}>Read-only · Data stays private</div>
      </div>
    </div>
  );
}

// ─── ACTIVITY DETAIL ──────────────────────────────────────────────────────────
function ActivityDetail({id,onBack,T}) {
  const [act,setAct]=useState(null); const [streams,setStreams]=useState(null); const [loading,setLoading]=useState(true);
  useEffect(()=>{Promise.all([getActivity(id),getStreams(id)]).then(([a,s])=>{setAct(a);setStreams(s);}).catch(console.error).finally(()=>setLoading(false));},[id]);
  if(loading) return <Loader T={T} text="Loading activity..."/>;
  if(!act) return <div style={{padding:20,color:T.sub,fontFamily:sans}}>Could not load.</div>;
  const type=actType(act),col=typeCol(type),laps=act.laps||[];
  const hr=streams?.heartrate?.data||[],time=streams?.time?.data||[];
  const hrChart=hr.filter((_,i)=>i%15===0).map((v,i)=>({t:Math.round((time[i*15]||i*15)/60),hr:v}));
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12,paddingBottom:24}} className="page">
      <button onClick={onBack} style={{background:"transparent",border:"none",color:C.indigo,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:sans,display:"inline-flex",alignItems:"center",gap:4,padding:0,alignSelf:"flex-start"}}>‹ Back</button>
      <Card T={T} style={{padding:18}}>
        <div style={{fontSize:19,fontWeight:700,color:T.text,fontFamily:sans,marginBottom:4,letterSpacing:"-0.02em"}}>{act.name}</div>
        <div style={{fontSize:12,color:T.sub,fontFamily:sans,marginBottom:10}}>{new Date(act.start_date_local).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}{act.gear?.name?` · ${act.gear.name}`:""}</div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <Chip color={col}>{type}</Chip>
          {act.suffer_score&&<div style={{fontSize:12,color:T.sub,fontFamily:sans}}>Suffer score <span style={{color:C.red,fontWeight:700}}>{act.suffer_score}</span></div>}
        </div>
      </Card>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <StatCard T={T} label="Distance" value={`${fDist(act.distance)}km`} color={C.indigo}/>
        <StatCard T={T} label="Time" value={fTime(act.moving_time)} color={T.text}/>
        <StatCard T={T} label="Avg Pace" value={`${fPace(act.average_speed)}/km`} color={C.indigo}/>
        {act.average_heartrate&&<StatCard T={T} label="Avg HR" value={`${Math.round(act.average_heartrate)}`} sub="bpm" color={C.red}/>}
        {act.max_heartrate&&<StatCard T={T} label="Max HR" value={`${act.max_heartrate}`} sub="bpm" color={C.red}/>}
        {act.average_cadence&&<StatCard T={T} label="Cadence" value={`${Math.round(act.average_cadence*2)}`} sub="spm" color={C.purple}/>}
        {act.total_elevation_gain>0&&<StatCard T={T} label="Elevation" value={`${Math.round(act.total_elevation_gain)}m`} color={C.green}/>}
      </div>
      {laps.length>1&&<Card T={T} style={{padding:16}}>
        <div style={{fontSize:14,fontWeight:700,color:T.text,fontFamily:sans,marginBottom:12}}>Splits</div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {laps.map((lap,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:12,background:T.card2,borderRadius:10,padding:"9px 13px"}}>
              <div style={{fontSize:11,color:T.muted,minWidth:44,fontWeight:600,fontFamily:sans}}>Lap {i+1}</div>
              <div style={{fontSize:14,fontWeight:700,color:C.indigo,flex:1,fontFamily:sans}}>{fPace(lap.average_speed)}/km</div>
              <div style={{fontSize:12,color:T.sub,fontFamily:sans}}>{(lap.distance/1000).toFixed(2)}km</div>
              {lap.average_heartrate&&<div style={{fontSize:12,color:C.red,fontFamily:sans}}>{Math.round(lap.average_heartrate)} bpm</div>}
            </div>
          ))}
        </div>
      </Card>}
      {hrChart.length>5&&<Card T={T} style={{padding:16}}>
        <div style={{fontSize:14,fontWeight:700,color:T.text,fontFamily:sans,marginBottom:10}}>Heart Rate</div>
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={hrChart}>
            <defs><linearGradient id="hrg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.red} stopOpacity={0.15}/><stop offset="95%" stopColor={C.red} stopOpacity={0}/></linearGradient></defs>
            <XAxis dataKey="t" tick={{fontSize:10,fill:T.muted,fontFamily:sans}} tickLine={false} axisLine={false} unit="m"/>
            <YAxis tick={{fontSize:10,fill:T.muted}} tickLine={false} axisLine={false} width={26} domain={["auto","auto"]}/>
            <Tooltip content={<CT T={T}/>}/>
            <Area type="monotone" dataKey="hr" name="HR" stroke={C.red} fill="url(#hrg)" strokeWidth={2} dot={false}/>
          </AreaChart>
        </ResponsiveContainer>
      </Card>}
      {act.best_efforts?.length>0&&<Card T={T} style={{padding:16}}>
        <div style={{fontSize:14,fontWeight:700,color:T.text,fontFamily:sans,marginBottom:12}}>Best Efforts</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {act.best_efforts.slice(0,6).map((b,i)=>(
            <div key={i} style={{background:T.card2,borderRadius:12,padding:"11px 13px"}}>
              <div style={{fontSize:10,fontWeight:600,color:T.muted,letterSpacing:"0.05em",textTransform:"uppercase",fontFamily:sans,marginBottom:4}}>{b.name}</div>
              <div style={{fontSize:15,fontWeight:700,color:C.indigo,fontFamily:sans}}>{fTime(b.moving_time)}</div>
              <div style={{fontSize:11,color:T.sub,fontFamily:sans,marginTop:2}}>{fPace(b.distance/b.moving_time)}/km</div>
            </div>
          ))}
        </div>
      </Card>}
    </div>
  );
}
// ─── HOME SCREEN (exact FitSync structure) ────────────────────────────────────
function Home({stats,activities,whoopData,whoopOk,onConnectWhoop,bestEfforts,userPrefs,onNav,athlete,plan,T}) {
  const ytd=stats?.ytd_run_totals||{}, all=stats?.all_run_totals||{};
  const rec=whoopData?.recoveries?.records?.[0];
  const sleep=whoopData?.sleeps?.records?.[0];
  const cyc=whoopData?.cycles?.records?.[0];
  const recScore=Math.round(rec?.score?.recovery_score||0);
  const hrv=Math.round(rec?.score?.hrv_rmssd_milli||0);
  const rhr=Math.round(rec?.score?.resting_heart_rate||0);
  const sleepH=sleep?.score?.stage_summary?.total_in_bed_time_milli?(sleep.score.stage_summary.total_in_bed_time_milli/3600000).toFixed(1):"--";
  const sleepScore=Math.round(sleep?.score?.sleep_performance_percentage||0);
  const strain=cyc?.score?.strain?.toFixed(1)||"--";
  const streaks=calcStreaks(activities);
  const vol=weeklyVol(activities);
  const recentVol=vol.slice(-8).map(w=>w.km||0);
  const recentCounts=vol.slice(-8).map(w=>w.count||0);
  const berlin=new Date("2026-09-28"); const today=new Date();
  const daysLeft=Math.max(0,Math.ceil((berlin-today)/86400000));
  const blockPct=Math.min(100,Math.max(0,Math.round(((today-new Date("2026-06-22"))/(berlin-new Date("2026-06-22")))*100)));
  const weekStart=new Date(today); weekStart.setDate(today.getDate()-((today.getDay()+6)%7)); weekStart.setHours(0,0,0,0);
  const weekKm=activities.filter(a=>(a.type==="Run"||a.sport_type==="Run")&&new Date(a.start_date_local)>=weekStart).reduce((s,r)=>s+(r.distance||0)/1000,0);
  const longestWeek=Math.max(0,...activities.filter(a=>(a.type==="Run"||a.sport_type==="Run")&&new Date(a.start_date_local)>=weekStart).map(r=>r.distance/1000),0);
  const longRunPct=Math.min(100,Math.round(longestWeek/25*100));
  const hr=today.getHours(); const greeting=hr<12?"Good morning":hr<18?"Good afternoon":"Good evening";
  const PBs=[{label:"5K",time:"18:42",pace:"3:44/km"},{label:"10K",time:"40:52",pace:"4:05/km"},{label:"Half",time:"1:32:48",pace:"4:23/km"},{label:"Marathon",time:"3:48:59",pace:"5:25/km"}];
  const pbs=bestEfforts&&Object.values(bestEfforts).some(Boolean)?Object.entries(bestEfforts).filter(([,v])=>v).map(([name,e])=>({label:name,time:fTime(e.moving_time),pace:`${fPace(e.distance/e.moving_time)}/km`})):PBs;

  // Today's sessions from plan
  const dayNames=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const todaySessions=(plan?.sessions||[]).filter(s=>s.day===dayNames[today.getDay()]&&s.type!=="Rest");
  const typeColors={Easy:C.green,Interval:C.red,Tempo:C.orange,"Long Run":C.indigo,Gym:C.purple,Rest:C.teal};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:0,paddingBottom:28}} className="page">

      {/* ── HEADER greeting (FitSync style) ── */}
      <div style={{padding:"4px 0 16px"}}>
        <div style={{fontSize:13,color:T.sub,fontFamily:sans,marginBottom:2}}>{today.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}</div>
        <div style={{fontSize:26,fontWeight:700,color:T.text,fontFamily:sans,letterSpacing:"-0.02em",lineHeight:1.15}}>{greeting}, {athlete?.firstname||"Caleb"}</div>
      </div>

      {/* ── RECOVERY card (FitSync structure exactly) ── */}
      {whoopOk?(
        <Card T={T} style={{padding:"18px 18px 16px",marginBottom:12}}>
          <Row style={{marginBottom:14}}>
            <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:sans}}>Recovery</div>
            <Chip color={C.green} style={{fontSize:10}}>WHOOP · just now</Chip>
          </Row>
          <div style={{display:"flex",gap:20,alignItems:"center",marginBottom:14}}>
            <RecRing score={recScore} size={96}/>
            <div style={{flex:1,display:"flex",flexDirection:"column",gap:11}}>
              {[{label:"HRV",value:`${hrv} ms`,color:C.green},{label:"Resting HR",value:`${rhr} bpm`,color:C.red},{label:"Sleep",value:`${sleepH}h · ${sleepScore}%`,color:C.indigo}].map((s,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontSize:13,color:T.sub,fontFamily:sans}}>{s.label}</div>
                  <div style={{fontSize:13,fontWeight:600,color:s.color,fontFamily:sans}}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{height:1,background:T.divider,marginBottom:12}}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:13,color:T.sub,fontFamily:sans}}>Daily strain</div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:90,height:5,background:T.card2,borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${Math.min(parseFloat(strain)||0,21)/21*100}%`,background:C.orange,borderRadius:3}}/>
              </div>
              <div style={{fontSize:13,fontWeight:600,color:C.orange,fontFamily:sans,minWidth:24}}>{strain}</div>
            </div>
          </div>
        </Card>
      ):(
        <Card T={T} style={{padding:18,marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:sans}}>Recovery</div>
            <div style={{fontSize:13,color:T.sub,fontFamily:sans,marginTop:3}}>Connect Whoop for live data</div>
          </div>
          <Btn onClick={onConnectWhoop} color={C.red} sm>Connect</Btn>
        </Card>
      )}

      {/* ── TODAY'S ACTIVITY (FitSync 3 rings + plan) ── */}
      <Card T={T} style={{padding:"18px 18px 16px",marginBottom:12,background:`linear-gradient(135deg,#5B5BD6 0%,#6E6EF0 100%)`}}>
        <Row style={{marginBottom:14}}>
          <div>
            <div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.75)",letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:sans,marginBottom:3}}>Coach Claude</div>
            <div style={{fontSize:15,fontWeight:700,color:"#fff",fontFamily:sans}}>Today's activity</div>
          </div>
          <ThreeRings weekKm={weekKm} weekTarget={50} sleepScore={sleepScore} recoveryPct={recScore}/>
        </Row>
        {todaySessions.length>0?(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {todaySessions.map((s,i)=>{
              const col=typeColors[s.type]||C.indigo;
              return (
                <div key={i} style={{background:"rgba(255,255,255,0.07)",borderRadius:12,padding:"11px 14px",display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:col,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:"#fff",fontFamily:sans}}>{s.type}</div>
                    <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",fontFamily:sans,marginTop:1}}>{[s.dist!=="0km"&&s.dist,s.pace!=="N/A"&&s.pace].filter(Boolean).join(" · ")}</div>
                  </div>
                  <Chip color={col}>{s.dist!=="0km"?s.dist:s.type}</Chip>
                </div>
              );
            })}
          </div>
        ):(
          <div style={{background:"rgba(255,255,255,0.06)",borderRadius:12,padding:"11px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontSize:13,color:"rgba(255,255,255,0.4)",fontFamily:sans}}>No sessions planned yet</div>
            <button onClick={()=>onNav("coach")} style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:99,padding:"5px 14px",fontSize:12,fontWeight:600,color:"#fff",cursor:"pointer",fontFamily:sans,backdropFilter:"blur(4px)"}}>Ask Claude</button>
          </div>
        )}
        {/* Berlin block */}
        <div style={{marginTop:14,paddingTop:12,borderTop:"1px solid rgba(255,255,255,0.08)"}}>
          <Row style={{marginBottom:5}}>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",fontFamily:sans}}>Berlin block · {daysLeft} days left</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.7)",fontFamily:sans,fontWeight:600}}>{blockPct}%</div>
          </Row>
          <div style={{height:4,background:"rgba(255,255,255,0.08)",borderRadius:2}}>
            <div style={{width:`${blockPct}%`,height:"100%",background:"rgba(255,255,255,0.6)",borderRadius:2,transition:"width 1s"}}/>
          </div>
        </div>
        {/* Ring legend */}
        <div style={{marginTop:10,display:"flex",gap:12}}>
          {[{c:C.red,l:"Weekly km"},{c:C.green,l:"Sleep"},{c:C.indigo,l:"Recovery"}].map((r,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:4}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:r.c}}/>
              <div style={{fontSize:9,color:"rgba(255,255,255,0.35)",fontFamily:sans}}>{r.l}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── STAT TILES ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
        <StatCard T={T} label="YTD Distance" value={ytd.distance?`${(ytd.distance/1000).toFixed(1)}km`:"449.6km"} sub={`${ytd.count||58} runs`} color={C.indigo} bars={recentVol} onClick={()=>onNav("running")}/>
        <StatCard T={T} label="YTD Time" value={ytd.moving_time?`${(ytd.moving_time/3600).toFixed(1)}h`:"36.9h"} color={T.text} bars={recentCounts} onClick={()=>onNav("running")}/>
        <StatCard T={T} label="Streak" value={`${streaks.current}d`} sub={streaks.current>2?`${streaks.current} days 🔥`:"Keep going"} color={streaks.current>2?C.orange:T.sub} bars={recentCounts} onClick={()=>onNav("running")}/>
        <StatCard T={T} label="All-Time" value={all.distance?`${(all.distance/1000).toFixed(0)}km`:"1093km"} sub={`${all.count||162} runs`} color={T.text} bars={recentCounts} onClick={()=>onNav("running")}/>
      </div>

      {/* ── PERSONAL BESTS (FitSync card style) ── */}
      <Card T={T} style={{padding:"18px 18px 14px",marginBottom:12}}>
        <Row style={{marginBottom:14}}>
          <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:sans}}>Personal Bests</div>
          <Chip color={C.green}>Strava</Chip>
        </Row>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {pbs.slice(0,4).map(pb=>(
            <div key={pb.label} style={{background:T.card2,borderRadius:12,padding:"12px 14px"}}>
              <div style={{fontSize:10,fontWeight:600,color:T.muted,letterSpacing:"0.05em",textTransform:"uppercase",fontFamily:sans,marginBottom:5}}>{pb.label}</div>
              <div style={{fontSize:21,fontWeight:800,color:C.green,letterSpacing:"-0.03em",fontFamily:sans,lineHeight:1}}>{pb.time}</div>
              <div style={{fontSize:11,color:T.sub,fontFamily:sans,marginTop:3}}>{pb.pace}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── TRAINING LOAD (FitSync: CTL/ATL + dual line chart) ── */}
      {weeklyVol(activities).filter(w=>w.km>0).length>2&&(()=>{
        const vols=weeklyVol(activities).slice(-12);
        // Simulate CTL (42-day weighted avg) and ATL (7-day weighted avg) from weekly km
        let ctl=0,atl=0;
        const chartData=vols.map((w,i)=>{
          const km=w.km||0;
          ctl=ctl+(km-ctl)/42*7; atl=atl+(km-atl)/7*7;
          return{week:w.week,fitness:Math.round(ctl*10)/10,fatigue:Math.round(atl*10)/10,km};
        });
        const latestCtl=Math.round(chartData[chartData.length-1]?.fitness||0);
        const latestAtl=Math.round(chartData[chartData.length-1]?.fatigue||0);
        const formScore=latestCtl-latestAtl;
        return (
          <Card T={T} style={{padding:"18px 18px 14px",marginBottom:12}}>
            <Row style={{marginBottom:14}}>
              <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:sans}}>Training load</div>
              <Chip color={C.indigo} style={{fontSize:10}}>Form {formScore>=0?"+":""}{formScore} · {formScore>5?"Fresh":formScore>-10?"Moderate":"Fatigued"}</Chip>
            </Row>
            <div style={{display:"flex",gap:28,marginBottom:14}}>
              <div>
                <div style={{fontSize:32,fontWeight:800,color:T.text,fontFamily:sans,letterSpacing:"-0.03em",lineHeight:1}}>{latestCtl}</div>
                <div style={{fontSize:12,color:T.sub,fontFamily:sans,marginTop:4}}>Fitness (CTL)</div>
              </div>
              <div>
                <div style={{fontSize:32,fontWeight:800,color:T.text,fontFamily:sans,letterSpacing:"-0.03em",lineHeight:1}}>{latestAtl}</div>
                <div style={{fontSize:12,color:T.sub,fontFamily:sans,marginTop:4}}>Fatigue (ATL)</div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={80}>
              <LineChart data={chartData}>
                <XAxis dataKey="week" tick={{fontSize:9,fill:T.muted,fontFamily:sans}} tickLine={false} axisLine={false} interval={3}/>
                <YAxis hide domain={["auto","auto"]}/>
                <Tooltip content={<CT T={T}/>}/>
                <Line type="monotone" dataKey="fitness" name="Fitness" stroke={C.indigo} strokeWidth={2} dot={false} connectNulls/>
                <Line type="monotone" dataKey="fatigue" name="Fatigue" stroke={C.red} strokeWidth={2} dot={false} connectNulls/>
              </LineChart>
            </ResponsiveContainer>
            <div style={{display:"flex",gap:14,marginTop:8}}>
              <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:10,height:2,background:C.indigo,borderRadius:1}}/><div style={{fontSize:10,color:T.muted,fontFamily:sans}}>Fitness</div></div>
              <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:10,height:2,background:C.red,borderRadius:1}}/><div style={{fontSize:10,color:T.muted,fontFamily:sans}}>Fatigue</div></div>
            </div>
          </Card>
        );
      })()}

      {/* ── BERLIN TARGET ── */}
      <Card T={T} style={{padding:18,marginBottom:12}}>
        <Row>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:sans}}>Berlin · Sub 3:20</div>
            <div style={{fontSize:13,color:T.sub,fontFamily:sans,marginTop:3}}>Target 4:44/km · half split 1:40</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:32,fontWeight:800,color:C.indigo,fontFamily:sans,letterSpacing:"-0.03em",lineHeight:1}}>{daysLeft}</div>
            <div style={{fontSize:11,color:T.muted,fontFamily:sans}}>days</div>
          </div>
        </Row>
        <div style={{marginTop:12,height:6,background:T.card2,borderRadius:3,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${blockPct}%`,background:C.indigo,borderRadius:3,transition:"width 1s"}}/>
        </div>
        <div style={{fontSize:11,color:T.muted,fontFamily:sans,marginTop:5}}>Block {blockPct}% complete</div>
      </Card>

    </div>
  );
}
// ─── HEATMAP ──────────────────────────────────────────────────────────────────
function Heatmap({activities,T}) {
  const runDates=new Set(activities.filter(a=>a.type==="Run"||a.sport_type==="Run").map(r=>new Date(r.start_date_local).toISOString().split("T")[0]));
  const today=new Date();today.setHours(0,0,0,0);
  const weeks=[];const start=new Date(today);
  start.setDate(today.getDate()-((today.getDay()===0?6:today.getDay()-1)));
  start.setDate(start.getDate()-13*7);
  for(let w=0;w<14;w++){const week=[];for(let d=0;d<7;d++){const date=new Date(start);date.setDate(start.getDate()+w*7+d);const key=date.toISOString().split("T")[0];week.push({date:key,isRun:runDates.has(key),isFuture:date>today});}weeks.push(week);}
  const total=[...runDates].filter(d=>new Date(d)>=start&&new Date(d)<=today).length;
  return <Card T={T} style={{padding:"18px 18px 14px"}}>
    <Row style={{marginBottom:14}}>
      <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:sans}}>Consistency</div>
      <Chip color={C.indigo}>{total} runs · 14w</Chip>
    </Row>
    <div style={{overflowX:"auto"}}>
      <div style={{display:"flex",gap:3,minWidth:"fit-content"}}>
        {weeks.map((week,wi)=><div key={wi} style={{display:"flex",flexDirection:"column",gap:3}}>
          {week.map((day,di)=><div key={di} title={day.date} style={{width:13,height:13,borderRadius:3,background:day.isFuture?T.card2:day.isRun?C.indigo:T.card2,opacity:day.isFuture?0.25:day.isRun?1:0.4}}/>)}
        </div>)}
      </div>
      <Row style={{marginTop:7,fontSize:9,color:T.muted,fontFamily:sans}}>
        <span>{new Date(weeks[0][0].date).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</span>
        <span>Today</span>
      </Row>
    </div>
  </Card>;
}

// ─── RUNNING ──────────────────────────────────────────────────────────────────
function RunCard({run:r,onSelect,T}) {
  const [weather,setWeather]=useState(null);
  const col=typeCol(actType(r));
  useEffect(()=>{if(!r.start_latlng?.[0])return;fetchWeather(r.start_latlng[0],r.start_latlng[1],new Date(r.start_date_local).toISOString().split("T")[0]).then(w=>{if(w)setWeather(w);});},[r.id]);
  return <button onClick={onSelect} style={{background:"transparent",border:"none",width:"100%",padding:"11px 0",display:"flex",alignItems:"center",gap:12,textAlign:"left",cursor:"pointer",borderBottom:`1px solid ${T.divider}`}}>
    <div style={{width:36,height:36,borderRadius:10,background:`${col}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
      <div style={{width:10,height:10,borderRadius:"50%",background:col}}/>
    </div>
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontSize:14,fontWeight:600,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontFamily:sans}}>{r.name}</div>
      <div style={{fontSize:12,color:T.sub,fontFamily:sans,marginTop:2,display:"flex",gap:8}}>
        <span>{new Date(r.start_date_local).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</span>
        {r.gear?.name&&<span>· {r.gear.name}</span>}
        {weather&&<span>{WX[weather.code]||""} {weather.temp}°C</span>}
      </div>
    </div>
    <div style={{textAlign:"right",flexShrink:0}}>
      <div style={{fontSize:15,fontWeight:700,color:C.indigo,fontFamily:sans,letterSpacing:"-0.01em"}}>{fDist(r.distance)}km</div>
      <div style={{fontSize:12,color:T.sub,fontFamily:sans,marginTop:1}}>{fPace(r.average_speed)}/km</div>
    </div>
    <span style={{color:T.muted,fontSize:14}}>›</span>
  </button>;
}

function Running({activities,stats,gear,T}) {
  const [sel,setSel]=useState(null);
  const runs=activities.filter(a=>a.type==="Run"||a.sport_type==="Run"),vol=weeklyVol(activities),ytd=stats?.ytd_run_totals||{};
  const recentVol=vol.slice(-8).map(w=>w.km||0);
  if(sel) return <ActivityDetail id={sel} onBack={()=>setSel(null)} T={T}/>;
  return <div style={{display:"flex",flexDirection:"column",gap:12,paddingBottom:24}} className="page">
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
      <StatCard T={T} label="YTD Distance" value={ytd.distance?`${(ytd.distance/1000).toFixed(1)}km`:"449.6km"} sub={`${ytd.count||58} runs`} color={C.indigo} bars={recentVol}/>
      <StatCard T={T} label="YTD Time" value={ytd.moving_time?`${(ytd.moving_time/3600).toFixed(1)}h`:"36.9h"} color={T.text}/>
      <StatCard T={T} label="All-Time" value={stats?.all_run_totals?.distance?`${(stats.all_run_totals.distance/1000).toFixed(0)}km`:"1093km"} color={T.text}/>
      <StatCard T={T} label="Elevation YTD" value={ytd.elevation_gain?`${ytd.elevation_gain}m`:"846m"} color={C.green}/>
    </div>
    <Heatmap activities={activities} T={T}/>
    <Card T={T} style={{padding:"18px 18px 14px"}}>
      <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:sans,marginBottom:12}}>Weekly Volume</div>
      <ResponsiveContainer width="100%" height={110}>
        <BarChart data={vol}>
          <defs><linearGradient id="vg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.indigo} stopOpacity={0.9}/><stop offset="100%" stopColor={C.indigo} stopOpacity={0.3}/></linearGradient></defs>
          <XAxis dataKey="week" tick={{fontSize:10,fill:T.muted,fontFamily:sans}} tickLine={false} axisLine={false} interval={2}/>
          <YAxis tick={{fontSize:10,fill:T.muted}} tickLine={false} axisLine={false} unit="k" width={24}/>
          <Tooltip content={<CT T={T}/>}/>
          <Bar dataKey="km" name="km" fill="url(#vg)" radius={[5,5,0,0]}/>
        </BarChart>
      </ResponsiveContainer>
    </Card>
    {/* HR Zones */}
    {(()=>{
      const MAX_HR=208;
      const zones=[{name:"Z1 Recovery",min:0,max:0.6,color:C.teal},{name:"Z2 Aerobic",min:0.6,max:0.7,color:C.green},{name:"Z3 Tempo",min:0.7,max:0.8,color:C.yellow},{name:"Z4 Threshold",min:0.8,max:0.9,color:C.orange},{name:"Z5 Max",min:0.9,max:1.0,color:C.red}];
      const rs=activities.filter(a=>(a.type==="Run"||a.sport_type==="Run")&&a.average_heartrate).slice(0,20);
      if(!rs.length) return null;
      const zc=zones.map(z=>{const count=rs.filter(r=>{const p=r.average_heartrate/MAX_HR;return p>=z.min&&p<z.max;}).length;return{...z,pct:Math.round(count/rs.length*100)};});
      return <Card T={T} style={{padding:"18px 18px 14px"}}>
        <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:sans,marginBottom:14}}>HR Zone Distribution</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {zc.map((z,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{fontSize:12,color:T.sub,minWidth:96,fontFamily:sans}}>{z.name}</div>
            <div style={{flex:1,height:6,background:T.card2,borderRadius:3}}><div style={{width:`${z.pct}%`,height:"100%",background:z.color,borderRadius:3}}/></div>
            <div style={{fontSize:12,color:z.color,minWidth:30,textAlign:"right",fontWeight:600,fontFamily:sans}}>{z.pct}%</div>
          </div>)}
        </div>
      </Card>;
    })()}
    {gear?.length>0&&<Card T={T} style={{padding:"18px 18px 14px"}}>
      <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:sans,marginBottom:14}}>Shoe Mileage</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {gear.map((s,i)=>{const km=(s.distance||0)/1000,pct=Math.min(100,Math.round(km/800*100)),col=pct>80?C.red:pct>50?C.yellow:C.green;return(
          <div key={i}>
            <Row style={{marginBottom:6}}>
              <div><div style={{fontSize:13,fontWeight:600,color:T.text,fontFamily:sans}}>{s.name}</div>{s.brand_name&&<div style={{fontSize:11,color:T.sub,fontFamily:sans,marginTop:1}}>{s.brand_name}</div>}</div>
              <div style={{fontSize:14,fontWeight:700,color:col,fontFamily:sans}}>{km.toFixed(0)}km</div>
            </Row>
            <div style={{height:5,background:T.card2,borderRadius:3}}><div style={{width:`${pct}%`,height:"100%",background:col,borderRadius:3}}/></div>
            <div style={{fontSize:10,color:pct>80?C.red:T.muted,marginTop:4,fontFamily:sans,fontWeight:pct>80?600:400}}>{pct>80?"Replace soon · ":""}{pct}% of 800km</div>
          </div>
        );})}
      </div>
    </Card>}
    <Card T={T} style={{padding:"18px 18px 8px"}}>
      <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:sans,marginBottom:4}}>Recent Runs</div>
      <div style={{display:"flex",flexDirection:"column"}}>
        {runs.slice(0,30).map(r=><RunCard key={r.id} run={r} onSelect={()=>setSel(r.id)} T={T}/>)}
      </div>
    </Card>
  </div>;
}

// ─── GYM ──────────────────────────────────────────────────────────────────────
function Gym({activities,userPrefs,onSavePrefs,savedWorkout,T}) {
  const [editing,setEditing]=useState(false);const [workout,setWorkout]=useState(null);
  const lifts=userPrefs?.lifts||DEFAULT_LIFTS;const [editLifts,setEditLifts]=useState(lifts);
  const sessions=activities.filter(a=>a.type==="WeightTraining"||(a.name||"").toLowerCase().includes("gym")||(a.name||"").toLowerCase().includes("weight"));
  useEffect(()=>{if(savedWorkout)setWorkout(savedWorkout);},[savedWorkout]);
  const save=()=>{onSavePrefs({...userPrefs,lifts:editLifts});setEditing(false);};
  return <div style={{display:"flex",flexDirection:"column",gap:12,paddingBottom:24}} className="page">
    {workout&&<Card T={T} style={{padding:18,border:`1.5px solid ${C.indigo}30`,background:`${C.indigo}06`}}>
      <Row style={{marginBottom:14}}>
        <div><div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:sans}}>{workout.title}</div><div style={{fontSize:12,color:T.sub,fontFamily:sans,marginTop:2}}>{new Date(workout.date).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}</div></div>
        <button onClick={()=>setWorkout(null)} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.sub,borderRadius:99,padding:"4px 12px",fontSize:11,cursor:"pointer",fontFamily:sans}}>Clear</button>
      </Row>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {workout.exercises.map((ex,i)=>(
          <div key={i} style={{background:T.card2,borderRadius:12,padding:"11px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
            <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:T.text,fontFamily:sans}}>{ex.name}</div>{ex.notes&&<div style={{fontSize:11,color:T.sub,fontFamily:sans,marginTop:2}}>{ex.notes}</div>}</div>
            <div style={{textAlign:"right",flexShrink:0}}><div style={{fontSize:13,fontWeight:700,color:C.indigo,fontFamily:sans}}>{ex.sets}×{ex.reps}</div><div style={{fontSize:11,color:T.sub,fontFamily:sans}}>{ex.weight}</div></div>
          </div>
        ))}
      </div>
      <div style={{marginTop:10,fontSize:11,color:C.indigo,fontFamily:sans,fontWeight:600}}>Generated by Claude</div>
    </Card>}
    <Card T={T} style={{padding:18}}>
      <Row style={{marginBottom:14}}>
        <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:sans}}>Current Lifts</div>
        <EditBtn T={T} editing={editing} onToggle={()=>{if(editing)save();else{setEditLifts(lifts);setEditing(true);}}}/>
      </Row>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {(editing?editLifts:lifts).map((l,i)=>(
          <div key={i} style={{background:T.card2,borderRadius:12,padding:"11px 14px",display:"flex",alignItems:"center",gap:10}}>
            {editing?<>
              <TxtInput T={T} value={l.name} onChange={v=>setEditLifts(p=>p.map((x,j)=>j===i?{...x,name:v}:x))} style={{flex:1}}/>
              <TxtInput T={T} value={l.weight} onChange={v=>setEditLifts(p=>p.map((x,j)=>j===i?{...x,weight:v}:x))} style={{width:80}}/>
              <TxtInput T={T} value={`${l.sets}x${l.reps}`} onChange={v=>{const[s,r]=(v.split("x")||["3","10"]);setEditLifts(p=>p.map((x,j)=>j===i?{...x,sets:parseInt(s)||3,reps:parseInt(r)||10}:x));}} style={{width:54}}/>
              <button onClick={()=>setEditLifts(p=>p.filter((_,j)=>j!==i))} style={{background:"transparent",border:"none",color:C.red,cursor:"pointer",fontSize:18}}>×</button>
            </>:<>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:T.text,fontFamily:sans}}>{l.name}</div><div style={{fontSize:11,color:T.sub,fontFamily:sans,marginTop:2}}>{l.sets} sets × {l.reps} reps</div></div>
              <div style={{fontSize:14,fontWeight:700,color:C.indigo,fontFamily:sans}}>{l.weight}</div>
            </>}
          </div>
        ))}
        {editing&&<button onClick={()=>setEditLifts(p=>[...p,{name:"New Exercise",weight:"0kg",sets:3,reps:10}])} style={{background:"transparent",border:`1.5px dashed ${T.border}`,borderRadius:12,padding:"10px",color:T.sub,cursor:"pointer",fontSize:13,fontFamily:sans}}>+ Add exercise</button>}
      </div>
    </Card>
    {sessions.length>0&&<Card T={T} style={{padding:"18px 18px 10px"}}>
      <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:sans,marginBottom:14}}>Recent Sessions</div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {sessions.slice(0,8).map(s=>(
          <div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${T.divider}`}}>
            <div><div style={{fontSize:13,fontWeight:600,color:T.text,fontFamily:sans}}>{s.name}</div><div style={{fontSize:11,color:T.sub,fontFamily:sans,marginTop:2}}>{new Date(s.start_date_local).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</div></div>
            <div style={{textAlign:"right"}}><div style={{fontSize:13,fontWeight:600,color:C.indigo,fontFamily:sans}}>{fTime(s.moving_time)}</div>{s.average_heartrate&&<div style={{fontSize:11,color:C.red,fontFamily:sans,marginTop:1}}>{Math.round(s.average_heartrate)} bpm</div>}</div>
          </div>
        ))}
      </div>
    </Card>}
  </div>;
}

// ─── RECOVERY PAGE ────────────────────────────────────────────────────────────
function RecoveryPage({whoopData,whoopOk,onConnectWhoop,onRefreshWhoop,T}) {
  if(!whoopOk) return <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,textAlign:"center",padding:40,gap:20}} className="page">
    <div style={{width:72,height:72,background:C.redL,borderRadius:20,display:"flex",alignItems:"center",justifyContent:"center",fontSize:32}}>⌚</div>
    <div><div style={{fontSize:18,fontWeight:700,color:T.text,fontFamily:sans,marginBottom:8}}>Connect Whoop</div><div style={{fontSize:14,color:T.sub,lineHeight:1.7,maxWidth:250,fontFamily:sans}}>Live recovery, HRV, sleep stages and daily strain.</div></div>
    <Btn onClick={onConnectWhoop} color={C.red}>Connect Whoop</Btn>
  </div>;
  const recs=whoopData?.recoveries?.records||[],sleeps=whoopData?.sleeps?.records||[],cycles=whoopData?.cycles?.records||[];
  const latest=recs[0],latestSleep=sleeps[0];
  if(!latest&&!latestSleep) return <div style={{textAlign:"center",padding:40}}><Btn onClick={onRefreshWhoop} color={C.indigo} sm>Load Data</Btn></div>;
  const hrvChart=recs.slice(0,14).reverse().map(r=>({day:new Date(r.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"}),hrv:Math.round(r.score?.hrv_rmssd_milli||0),rhr:Math.round(r.score?.resting_heart_rate||0)}));
  const recChart=recs.slice(0,14).reverse().map(r=>({day:new Date(r.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"}),score:Math.round(r.score?.recovery_score||0)}));
  const sleepChart=sleeps.slice(0,14).reverse().map(s=>({day:new Date(s.start).toLocaleDateString("en-GB",{day:"numeric",month:"short"}),hours:s.score?.stage_summary?.total_in_bed_time_milli?parseFloat((s.score.stage_summary.total_in_bed_time_milli/3600000).toFixed(1)):0}));
  return <div style={{display:"flex",flexDirection:"column",gap:12,paddingBottom:24}} className="page">
    <div style={{display:"flex",justifyContent:"flex-end"}}><Btn onClick={onRefreshWhoop} color={C.indigo} sm ghost>Refresh</Btn></div>
    {latest&&<Card T={T} style={{padding:18}}>
      <Row style={{marginBottom:14}}>
        <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:sans}}>Today's Recovery</div>
        <Chip color={C.green} style={{fontSize:10}}>WHOOP</Chip>
      </Row>
      <div style={{display:"flex",gap:20,alignItems:"center",marginBottom:14}}>
        <RecRing score={Math.round(latest.score?.recovery_score||0)} size={100}/>
        <div style={{flex:1,display:"flex",flexDirection:"column",gap:12}}>
          {[{l:"HRV",v:`${Math.round(latest.score?.hrv_rmssd_milli||0)}ms`,c:C.green},{l:"Resting HR",v:`${Math.round(latest.score?.resting_heart_rate||0)} bpm`,c:C.red},{l:"Resp Rate",v:`${latest.score?.respiratory_rate?.toFixed(1)||"--"} br/min`,c:C.purple}].map((s,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between"}}>
              <div style={{fontSize:13,color:T.sub,fontFamily:sans}}>{s.l}</div>
              <div style={{fontSize:13,fontWeight:600,color:s.c,fontFamily:sans}}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>}
    {latestSleep&&<Card T={T} style={{padding:18}}>
      <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:sans,marginBottom:14}}>Last Night's Sleep</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {[{l:"Sleep Score",v:`${Math.round(latestSleep.score?.sleep_performance_percentage||0)}%`,c:C.indigo},{l:"In Bed",v:latestSleep.score?.stage_summary?.total_in_bed_time_milli?`${(latestSleep.score.stage_summary.total_in_bed_time_milli/3600000).toFixed(1)}h`:"--",c:C.teal},{l:"REM",v:latestSleep.score?.stage_summary?.total_rem_sleep_time_milli?`${(latestSleep.score.stage_summary.total_rem_sleep_time_milli/60000).toFixed(0)}m`:"--",c:C.purple},{l:"Deep Sleep",v:latestSleep.score?.stage_summary?.total_slow_wave_sleep_time_milli?`${(latestSleep.score.stage_summary.total_slow_wave_sleep_time_milli/60000).toFixed(0)}m`:"--",c:C.green}].map((s,i)=>(
          <div key={i} style={{background:T.card2,borderRadius:12,padding:"12px 14px"}}>
            <div style={{fontSize:10,fontWeight:600,color:T.muted,letterSpacing:"0.05em",textTransform:"uppercase",fontFamily:sans,marginBottom:5}}>{s.l}</div>
            <div style={{fontSize:22,fontWeight:800,color:s.c,fontFamily:sans,letterSpacing:"-0.02em"}}>{s.v}</div>
          </div>
        ))}
      </div>
    </Card>}
    {hrvChart.length>0&&<Card T={T} style={{padding:"18px 18px 14px"}}>
      <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:sans,marginBottom:12}}>HRV and RHR — 14 Days</div>
      <ResponsiveContainer width="100%" height={130}>
        <LineChart data={hrvChart}>
          <XAxis dataKey="day" tick={{fontSize:10,fill:T.muted,fontFamily:sans}} tickLine={false} axisLine={false} interval={2}/>
          <YAxis tick={{fontSize:10,fill:T.muted}} tickLine={false} axisLine={false} width={26}/>
          <Tooltip content={<CT T={T}/>}/>
          <Line type="monotone" dataKey="hrv" name="HRV" stroke={C.green} strokeWidth={2} dot={{fill:C.green,r:3}}/>
          <Line type="monotone" dataKey="rhr" name="RHR" stroke={C.red} strokeWidth={2} dot={{fill:C.red,r:3}}/>
        </LineChart>
      </ResponsiveContainer>
    </Card>}
    {recChart.length>0&&<Card T={T} style={{padding:"18px 18px 14px"}}>
      <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:sans,marginBottom:12}}>Recovery Score — 14 Days</div>
      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={recChart}>
          <defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.green} stopOpacity={0.9}/><stop offset="100%" stopColor={C.green} stopOpacity={0.3}/></linearGradient></defs>
          <XAxis dataKey="day" tick={{fontSize:10,fill:T.muted,fontFamily:sans}} tickLine={false} axisLine={false} interval={2}/>
          <YAxis tick={{fontSize:10,fill:T.muted}} tickLine={false} axisLine={false} domain={[0,100]} width={26}/>
          <Tooltip content={<CT T={T}/>}/>
          <Bar dataKey="score" name="Recovery" fill="url(#rg)" radius={[4,4,0,0]}/>
        </BarChart>
      </ResponsiveContainer>
    </Card>}
    {sleepChart.length>0&&<Card T={T} style={{padding:"18px 18px 14px"}}>
      <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:sans,marginBottom:12}}>Sleep Duration — 14 Days</div>
      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={sleepChart}>
          <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.indigo} stopOpacity={0.9}/><stop offset="100%" stopColor={C.indigo} stopOpacity={0.3}/></linearGradient></defs>
          <XAxis dataKey="day" tick={{fontSize:10,fill:T.muted,fontFamily:sans}} tickLine={false} axisLine={false} interval={2}/>
          <YAxis tick={{fontSize:10,fill:T.muted}} tickLine={false} axisLine={false} width={26} unit="h"/>
          <Tooltip content={<CT T={T}/>}/>
          <Bar dataKey="hours" name="Hours" fill="url(#sg)" radius={[4,4,0,0]}/>
        </BarChart>
      </ResponsiveContainer>
    </Card>}
    {cycles.length>0&&<Card T={T} style={{padding:"18px 18px 14px"}}>
      <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:sans,marginBottom:12}}>Daily Strain</div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {cycles.slice(0,7).map((cyc,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{fontSize:11,color:T.sub,minWidth:56,fontFamily:sans}}>{new Date(cyc.start).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</div>
            <div style={{flex:1,height:5,background:T.card2,borderRadius:3}}><div style={{width:`${Math.min((cyc.score?.strain||0)/21*100,100)}%`,height:"100%",background:C.orange,borderRadius:3}}/></div>
            <div style={{fontSize:13,fontWeight:600,color:C.orange,minWidth:28,textAlign:"right",fontFamily:sans}}>{cyc.score?.strain?.toFixed(1)||"--"}</div>
          </div>
        ))}
      </div>
    </Card>}
  </div>;
}
// ─── PLAN ─────────────────────────────────────────────────────────────────────
function SessionRow({s,typeC,onToggle,T}) {
  const [open,setOpen]=useState(false);
  const col=s.done?C.green:(typeC[s.type]||C.indigo);
  const isRest=s.type==="Rest";
  if(isRest) return <div style={{padding:"10px 0",borderBottom:`1px solid ${T.divider}`,display:"flex",alignItems:"center",gap:12,opacity:0.4}}>
    <div style={{width:36,height:36,borderRadius:99,border:`1.5px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><div style={{width:8,height:8,borderRadius:"50%",background:T.muted}}/></div>
    <div style={{fontSize:13,fontWeight:500,color:T.sub,fontFamily:sans,flex:1}}>{s.day} · Rest</div>
  </div>;
  return <div style={{borderBottom:`1px solid ${T.divider}`}}>
    <div style={{display:"flex",alignItems:"center",gap:12,padding:"11px 0"}}>
      <button onClick={()=>onToggle&&onToggle()} style={{width:36,height:36,borderRadius:99,background:s.done?C.green:`${col}12`,border:`1.5px solid ${s.done?C.green:col}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,transition:"all .15s"}}>
        {s.done?<span style={{color:"#fff",fontSize:13,fontWeight:700}}>✓</span>:<div style={{width:9,height:9,borderRadius:"50%",background:col}}/>}
      </button>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{fontSize:14,fontWeight:600,color:s.done?C.green:T.text,textDecoration:s.done?"line-through":"none",fontFamily:sans}}>{s.type}</span>
          {s.dist&&s.dist!=="0km"&&<Chip color={col}>{s.dist}</Chip>}
          {s.pace&&s.pace!=="N/A"&&<Chip color={C.indigo}>{s.pace}</Chip>}
        </div>
        {s.shoe&&s.shoe!=="N/A"&&<div style={{fontSize:11,color:C.purple,fontFamily:sans,marginTop:2}}>👟 {s.shoe}</div>}
        {!open&&s.notes&&<div style={{fontSize:12,color:T.sub,fontFamily:sans,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.notes}</div>}
      </div>
      <div style={{fontSize:12,color:T.muted,fontFamily:sans,flexShrink:0}}>{s.day?.slice(0,3)}</div>
      <button onClick={()=>setOpen(!open)} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:12,padding:4}}>{open?"▲":"▼"}</button>
    </div>
    {open&&s.notes&&<div style={{padding:"0 0 12px 48px",fontSize:13,color:T.sub,fontFamily:sans,lineHeight:1.6}}>{s.notes}</div>}
  </div>;
}

function Plans({onChat,externalPlan,whoopData,onGoToChat,T}) {
  const [plan,setPlan]=useState(null);const [planLoaded,setPlanLoaded]=useState(false);
  useEffect(()=>{loadTrainingPlan().then(p=>{if(p)setPlan(p);setPlanLoaded(true);}).catch(()=>setPlanLoaded(true));},[]);
  const savePlan=p=>{setPlan(p);saveTrainingPlan(p);};
  useEffect(()=>{if(externalPlan&&planLoaded)savePlan(externalPlan);},[externalPlan,planLoaded]);
  const typeC={Rest:T.muted,Easy:C.green,Interval:C.red,Tempo:C.orange,"Long Run":C.indigo,Gym:C.purple};
  const toggleDone=i=>savePlan({...plan,sessions:plan.sessions.map((s,j)=>j===i?{...s,done:!s.done}:s)});
  const rec=whoopData?.recoveries?.records?.[0],recScore=Math.round(rec?.score?.recovery_score||0),lowRec=rec&&recScore<34;
  const done=plan?plan.sessions.filter(s=>s.done).length:0,total=plan?plan.sessions.filter(s=>s.type!=="Rest").length:0;
  return <div style={{display:"flex",flexDirection:"column",gap:12,paddingBottom:24}} className="page">
    {!plan?(
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",padding:"56px 24px",gap:16}}>
        <div style={{width:64,height:64,background:C.indigoL,borderRadius:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>📋</div>
        <div>
          <div style={{fontSize:18,fontWeight:700,color:T.text,fontFamily:sans,marginBottom:6}}>No plan yet</div>
          <div style={{fontSize:14,color:T.sub,lineHeight:1.6,maxWidth:250,fontFamily:sans}}>Ask Claude to build your next 1 or 2 weeks. It factors in your recovery and recent load.</div>
        </div>
        <Btn onClick={onChat} color={C.indigo}>Open Coach</Btn>
      </div>
    ):(
      <>
        {lowRec&&<div style={{background:C.redL,borderRadius:14,padding:"12px 14px",display:"flex",alignItems:"center",gap:10,border:`1px solid ${C.red}25`}}>
          <span>⚠️</span><div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:C.red,fontFamily:sans}}>Recovery {recScore}% today</div><div style={{fontSize:12,color:T.sub,fontFamily:sans,marginTop:1}}>Consider shifting sessions. Ask Claude to adjust.</div></div>
          <Btn onClick={onGoToChat} color={C.red} sm>Adjust</Btn>
        </div>}
        <Card T={T} style={{padding:18}}>
          <Row style={{flexWrap:"wrap",gap:10,marginBottom:total>0?14:0}}>
            <div>
              <div style={{fontSize:17,fontWeight:700,color:T.text,fontFamily:sans,letterSpacing:"-0.02em"}}>{plan.title}</div>
              {plan.startDate&&<div style={{fontSize:12,color:T.sub,fontFamily:sans,marginTop:2}}>Starting {new Date(plan.startDate).toLocaleDateString("en-GB",{day:"numeric",month:"long"})}</div>}
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <Chip color={C.indigo}>{done}/{total} done</Chip>
              <Btn onClick={()=>savePlan(null)} color={T.muted} sm ghost>Clear</Btn>
            </div>
          </Row>
          {total>0&&<>
            <div style={{height:5,background:T.card2,borderRadius:3}}><div style={{width:`${Math.round(done/total*100)}%`,height:"100%",background:C.indigo,borderRadius:3,transition:"width .5s"}}/></div>
            <div style={{fontSize:11,color:T.muted,fontFamily:sans,marginTop:5}}>{Math.round(done/total*100)}% complete</div>
          </>}
        </Card>
        <Card T={T} style={{padding:"4px 18px 8px"}}>
          {plan.sessions.map((s,i)=><SessionRow key={i} s={s} typeC={typeC} onToggle={()=>toggleDone(i)} T={T}/>)}
        </Card>
        <div style={{background:T.card2,borderRadius:14,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",border:`1px solid ${T.border}`}}>
          <div style={{fontSize:13,color:T.sub,fontFamily:sans}}>Need to adjust this plan?</div>
          <Btn onClick={onGoToChat} color={C.indigo} sm>Ask Claude</Btn>
        </div>
      </>
    )}
  </div>;
}

// ─── NUTRITION ────────────────────────────────────────────────────────────────
function Nutrition({userPrefs,onSavePrefs,T}) {
  const today=new Date().toISOString().split("T")[0],log=userPrefs?.nutrition||{},todayLog=log[today]||{kcal:"",carbs:"",protein:"",notes:""};
  const [entry,setEntry]=useState(todayLog);const [saved,setSaved]=useState(false);
  const targets={kcal:3000,carbs:300,protein:140};
  const save=()=>{onSavePrefs({...userPrefs,nutrition:{...log,[today]:entry}});setSaved(true);setTimeout(()=>setSaved(false),2000);};
  const recent=Object.entries(log).sort(([a],[b])=>b.localeCompare(a)).slice(0,7);
  const fields=[{key:"kcal",label:"Calories",target:3000,unit:"kcal",color:C.indigo},{key:"carbs",label:"Carbs",target:300,unit:"g",color:C.teal},{key:"protein",label:"Protein",target:140,unit:"g",color:C.red}];
  return <div style={{display:"flex",flexDirection:"column",gap:12,paddingBottom:24}} className="page">
    <Card T={T} style={{padding:18}}>
      <div style={{fontSize:17,fontWeight:700,color:T.text,fontFamily:sans,marginBottom:4,letterSpacing:"-0.02em"}}>Today</div>
      <div style={{fontSize:12,color:T.sub,fontFamily:sans,marginBottom:16}}>{new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
        {fields.map(f=>{const val=parseFloat(entry[f.key])||0,pct=Math.min(100,Math.round(val/f.target*100));return(
          <div key={f.key} style={{background:T.card2,borderRadius:14,padding:"13px 12px"}}>
            <div style={{fontSize:9,fontWeight:600,color:T.muted,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:sans,marginBottom:6}}>{f.label}</div>
            <input type="number" value={entry[f.key]} onChange={e=>setEntry(prev=>({...prev,[f.key]:e.target.value}))} placeholder={String(f.target)}
              style={{width:"100%",background:"transparent",border:"none",borderBottom:`2px solid ${f.color}`,padding:"2px 0",fontSize:20,fontWeight:800,color:f.color,fontFamily:sans,outline:"none",letterSpacing:"-0.02em"}}/>
            <div style={{fontSize:9,color:T.muted,marginTop:5,fontFamily:sans}}>of {f.target}{f.unit}</div>
            <div style={{height:3,background:T.divider,borderRadius:2,marginTop:6}}><div style={{width:`${pct}%`,height:"100%",background:f.color,borderRadius:2}}/></div>
          </div>
        );})}
      </div>
      <TxtInput T={T} value={entry.notes} onChange={v=>setEntry(prev=>({...prev,notes:v}))} placeholder="Notes (pre-run meal, gel timing...)" style={{marginBottom:12,fontSize:13}}/>
      <Btn onClick={save} color={saved?C.green:C.indigo} full>{saved?"Saved!":"Save Today"}</Btn>
    </Card>
    <Card T={T} style={{padding:18}}>
      <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:sans,marginBottom:14}}>Daily Targets</div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {[{l:"Calories",v:"2,800 to 3,200 kcal",c:C.indigo},{l:"Carbohydrates",v:"250 to 350g",c:C.teal},{l:"Protein",v:"130 to 150g",c:C.red},{l:"Long runs",v:"SiS Beta Fuel every 30 min",c:C.green}].map((t,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${T.divider}`}}>
            <div style={{fontSize:13,color:T.sub,fontFamily:sans}}>{t.l}</div>
            <div style={{fontSize:13,fontWeight:600,color:t.c,fontFamily:sans}}>{t.v}</div>
          </div>
        ))}
      </div>
      <div style={{marginTop:14}}>
        <div style={{fontSize:12,fontWeight:600,color:T.muted,fontFamily:sans,marginBottom:8}}>Log weight</div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <input type="number" step="0.1" placeholder="e.g. 60.5"
            style={{flex:1,background:T.card2,border:`1px solid ${T.border}`,borderRadius:10,padding:"9px 13px",color:T.text,fontSize:16,fontFamily:sans,fontWeight:700,outline:"none"}}
            onBlur={e=>{const w=parseFloat(e.target.value);if(!w)return;const wl=userPrefs?.weightLog||[];const up=[...wl.filter(l=>l.date!==today),{date:today,weight:w}].slice(-60);onSavePrefs({...userPrefs,weightLog:up});e.target.value="";}}/>
          <span style={{fontSize:12,color:T.sub,fontFamily:sans,flexShrink:0}}>kg · target 65kg</span>
        </div>
      </div>
    </Card>
    {recent.length>0&&<Card T={T} style={{padding:"18px 18px 10px"}}>
      <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:sans,marginBottom:4}}>Recent Log</div>
      <div style={{display:"flex",flexDirection:"column"}}>
        {recent.map(([date,e])=>(
          <div key={date} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${T.divider}`}}>
            <div style={{fontSize:12,color:T.sub,fontFamily:sans}}>{new Date(date).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}</div>
            <div style={{display:"flex",gap:10}}>
              {e.kcal&&<span style={{fontSize:12,color:C.indigo,fontFamily:sans,fontWeight:600}}>{e.kcal}kcal</span>}
              {e.protein&&<span style={{fontSize:12,color:C.red,fontFamily:sans}}>{e.protein}g P</span>}
              {e.carbs&&<span style={{fontSize:12,color:C.teal,fontFamily:sans}}>{e.carbs}g C</span>}
            </div>
          </div>
        ))}
      </div>
    </Card>}
  </div>;
}

// ─── RACES ────────────────────────────────────────────────────────────────────
function Races({userPrefs,onSavePrefs,T}) {
  const [editing,setEditing]=useState(false);
  const races=userPrefs?.races||DEFAULT_RACES,sponsorship=userPrefs?.sponsorship||DEFAULT_SPONSORSHIP;
  const [editRaces,setEditRaces]=useState(races);const [editSponsor,setEditSponsor]=useState(sponsorship);
  const save=()=>{onSavePrefs({...userPrefs,races:editRaces,sponsorship:editSponsor});setEditing(false);};
  return <div style={{display:"flex",flexDirection:"column",gap:12,paddingBottom:24}} className="page">
    <Card T={T} style={{padding:18}}>
      <div style={{fontSize:17,fontWeight:700,color:T.text,fontFamily:sans,marginBottom:4,letterSpacing:"-0.02em"}}>World Marathon Majors</div>
      <div style={{fontSize:13,color:T.sub,fontFamily:sans,marginBottom:14,lineHeight:1.6}}>Running all six Majors for different charities. £5,000+ raised.</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {[{l:"Completed",v:"2 / 6",s:"Both London",c:C.green},{l:"Raised",v:"£5k+",s:"for charity",c:C.indigo},{l:"Next Race",v:"Berlin",s:"28 Sep 2026",c:C.orange},{l:"Sub-3 Goal",v:"Seville",s:"Feb 2027",c:C.purple}].map((s,i)=>(
          <div key={i} style={{background:T.card2,borderRadius:12,padding:"12px 14px"}}>
            <div style={{fontSize:10,fontWeight:600,color:T.muted,letterSpacing:"0.05em",textTransform:"uppercase",fontFamily:sans,marginBottom:5}}>{s.l}</div>
            <div style={{fontSize:20,fontWeight:800,color:s.c,fontFamily:sans,letterSpacing:"-0.02em"}}>{s.v}</div>
            <div style={{fontSize:11,color:T.sub,fontFamily:sans,marginTop:3}}>{s.s}</div>
          </div>
        ))}
      </div>
    </Card>
    <Card T={T} style={{padding:18}}>
      <Row style={{marginBottom:14}}>
        <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:sans}}>Race Pipeline</div>
        <EditBtn T={T} editing={editing} onToggle={()=>{if(editing)save();else{setEditRaces(races);setEditSponsor(sponsorship);setEditing(true);}}}/>
      </Row>
      <div style={{display:"flex",flexDirection:"column"}}>
        {(editing?editRaces:races).map((r,i)=>(
          <div key={i} style={{padding:"12px 0",borderBottom:`1px solid ${T.divider}`,opacity:r.done?0.45:1}}>
            {editing?(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <div style={{display:"flex",gap:8}}><TxtInput T={T} value={r.name} onChange={v=>setEditRaces(p=>p.map((x,j)=>j===i?{...x,name:v}:x))} style={{flex:1}}/><TxtInput T={T} value={r.date} onChange={v=>setEditRaces(p=>p.map((x,j)=>j===i?{...x,date:v}:x))} style={{width:110}}/></div>
                <div style={{display:"flex",gap:8}}><TxtInput T={T} value={r.charity} onChange={v=>setEditRaces(p=>p.map((x,j)=>j===i?{...x,charity:v}:x))} style={{flex:1}}/><TxtInput T={T} value={r.target} onChange={v=>setEditRaces(p=>p.map((x,j)=>j===i?{...x,target:v}:x))} style={{width:100}}/></div>
                <button onClick={()=>setEditRaces(p=>p.filter((_,j)=>j!==i))} style={{background:"transparent",border:"none",color:C.red,cursor:"pointer",fontSize:12,textAlign:"left",fontFamily:sans}}>Remove</button>
              </div>
            ):(
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:14,fontWeight:600,color:r.done?T.muted:r.next?C.indigo:T.text,fontFamily:sans}}>{r.done?"✓ ":""}{r.name}</div>
                  <div style={{fontSize:12,color:T.sub,fontFamily:sans,marginTop:2}}>{r.date} · {r.charity}</div>
                </div>
                <Chip color={r.next?C.indigo:T.muted}>{r.target}</Chip>
              </div>
            )}
          </div>
        ))}
        {editing&&<button onClick={()=>setEditRaces(p=>[...p,{name:"New Race",date:"TBC",charity:"TBC",target:"TBC"}])} style={{background:"transparent",border:`1.5px dashed ${T.border}`,borderRadius:10,padding:"10px",color:T.sub,cursor:"pointer",fontSize:13,fontFamily:sans,marginTop:8}}>+ Add race</button>}
      </div>
    </Card>
    <Card T={T} style={{padding:18}}>
      <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:sans,marginBottom:4}}>Sponsorship</div>
      <div style={{display:"flex",flexDirection:"column"}}>
        {(editing?editSponsor:sponsorship).map((s,i)=>{const col={success:C.green,pending:C.orange,future:C.purple}[s.state]||T.muted;return(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${T.divider}`}}>
            {editing?<>
              <TxtInput T={T} value={s.name} onChange={v=>setEditSponsor(p=>p.map((x,j)=>j===i?{...x,name:v}:x))} style={{flex:1,marginRight:8}}/>
              <TxtInput T={T} value={s.status} onChange={v=>setEditSponsor(p=>p.map((x,j)=>j===i?{...x,status:v}:x))} style={{flex:1,marginRight:8}}/>
              <select value={s.state} onChange={e=>setEditSponsor(p=>p.map((x,j)=>j===i?{...x,state:e.target.value}:x))} style={{background:T.card2,border:`1px solid ${T.border}`,color:T.text,borderRadius:8,padding:"5px 8px",fontSize:11,fontFamily:sans}}>
                <option value="success">Success</option><option value="pending">Pending</option><option value="future">Future</option>
              </select>
            </>:<>
              <div style={{fontSize:13,color:T.text,fontFamily:sans}}>{s.name}</div>
              <Chip color={col}>{s.status}</Chip>
            </>}
          </div>
        );})}
        {editing&&<button onClick={()=>setEditSponsor(p=>[...p,{name:"New Brand",status:"Applied",state:"pending"}])} style={{background:"transparent",border:`1.5px dashed ${T.border}`,borderRadius:10,padding:"8px",color:T.sub,cursor:"pointer",fontSize:13,fontFamily:sans,marginTop:8}}>+ Add brand</button>}
      </div>
    </Card>
  </div>;
}

// ─── CHAT ─────────────────────────────────────────────────────────────────────
function Coach({activities,stats,whoopData,whoopOk,onPlanSaved,onGymSaved,userPrefs,T}) {
  const [messages,setMessages]=useState([{role:"assistant",content:"Hey Caleb! I've got your Strava, Whoop, nutrition and training plan loaded. What do you need?"}]);
  const [chatLoaded,setChatLoaded]=useState(false);
  const [input,setInput]=useState("");const [loading,setLoading]=useState(false);const [images,setImages]=useState([]);
  const bottomRef=useRef(null);const fileRef=useRef(null);
  useEffect(()=>{loadChatHistory().then(msgs=>{if(msgs&&msgs.length>0)setMessages(msgs);setChatLoaded(true);}).catch(()=>setChatLoaded(true));},[]);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[messages]);
  useEffect(()=>{if(chatLoaded)saveChatHistory(messages);},[messages,chatLoaded]);
  const handleImages=e=>{const files=Array.from(e.target.files);if(!files.length)return;let loaded=0;const newImgs=[];files.forEach(file=>{const r=new FileReader();r.onload=ev=>{newImgs.push({base64:ev.target.result.split(",")[1],mediaType:file.type,preview:ev.target.result});loaded++;if(loaded===files.length)setImages(prev=>[...prev,...newImgs].slice(0,5));};r.readAsDataURL(file);});};
  const extractPlan=text=>{if(!text.includes("PLAN_START")||!text.includes("PLAN_END"))return null;try{const section=text.split("PLAN_START")[1].split("PLAN_END")[0].trim();const lines=section.split("\n").map(l=>l.trim()).filter(Boolean);let title="Training Plan";const sessions=[];for(const line of lines){if(line.startsWith("TITLE:")){title=line.replace("TITLE:","").trim();continue;}const parts=line.split("|").map(p=>p.trim());if(parts.length>=4)sessions.push({day:parts[0],type:parts[1],dist:parts[2],pace:parts[3],shoe:parts[4]||"",notes:parts[5]||""});}if(sessions.length>=3)return{title,startDate:new Date().toISOString().split("T")[0],sessions};}catch{}return null;};
  const extractGym=text=>{if(!text.includes("GYM_START")||!text.includes("GYM_END"))return null;try{const section=text.split("GYM_START")[1].split("GYM_END")[0].trim();const lines=section.split("\n").map(l=>l.trim()).filter(Boolean);let title="Gym Session";const exercises=[];for(const line of lines){if(line.startsWith("TITLE:")){title=line.replace("TITLE:","").trim();continue;}const parts=line.split("|").map(p=>p.trim());if(parts.length>=3){const nums=parts[1].match(/(\d+)[xX](\d+)/);exercises.push({name:parts[0],sets:nums?parseInt(nums[1]):3,reps:nums?parseInt(nums[2]):10,weight:parts[2],notes:parts[3]||""});}}if(exercises.length>=1)return{title,exercises,date:new Date().toISOString().split("T")[0]};}catch{}return null;};
  const cleanReply=text=>{let out=text;if(out.includes("PLAN_START")&&out.includes("PLAN_END")){const b=out.split("PLAN_START")[0].trim();const a=out.split("PLAN_END")[1]?.trim()||"";out=(b+(a?"\n\n"+a:"")).trim();}if(out.includes("GYM_START")&&out.includes("GYM_END")){const b=out.split("GYM_START")[0].trim();const a=out.split("GYM_END")[1]?.trim()||"";out=(b+(a?"\n\n"+a:"")).trim();}return out;};
  const buildContext=()=>{
    const runs=activities.filter(a=>a.type==="Run").slice(0,5),ytd=stats?.ytd_run_totals||{},rec=whoopData?.recoveries?.records?.[0],sleep=whoopData?.sleeps?.records?.[0];
    const recentRecs=(whoopData?.recoveries?.records||[]).slice(0,7).map(r=>`${new Date(r.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}: recovery ${Math.round(r.score?.recovery_score||0)}%, HRV ${Math.round(r.score?.hrv_rmssd_milli||0)}ms, RHR ${Math.round(r.score?.resting_heart_rate||0)}bpm`).join("\n");
    const recentSleeps=(whoopData?.sleeps?.records||[]).slice(0,7).map(s=>`${new Date(s.start).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}: sleep ${Math.round(s.score?.sleep_performance_percentage||0)}%, ${s.score?.stage_summary?.total_in_bed_time_milli?(s.score.stage_summary.total_in_bed_time_milli/3600000).toFixed(1):0}h in bed`).join("\n");
    const recentNutrition=Object.entries(userPrefs?.nutrition||{}).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,7).map(([date,log])=>`${new Date(date).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}: ${[log.kcal&&log.kcal+"kcal",log.protein&&log.protein+"g protein",log.carbs&&log.carbs+"g carbs"].filter(Boolean).join(", ")}`).join("\n");
    const todayRec=rec?Math.round(rec.score?.recovery_score||0):null,sleepScore=sleep?Math.round(sleep.score?.sleep_performance_percentage||0):null;
    return `You are a personal running coach and fitness assistant for Caleb Cunningham. Be direct and conversational. Never use double dashes. Never use markdown headers or bullet points, write in plain flowing sentences.

WHO HE IS: 20 years old, graphic design student at Kingston University London. Lives in Kingston with girlfriend Taylor (Taz). Started running July 2024. Raised over £5,000 for the Duchenne Family Support Group. Brother Noah has Duchenne Muscular Dystrophy. Mission: all six World Marathon Majors for different charities.

RUNNING PBs: 5K 18:42, 10K 40:52, HM 1:32:48, Marathon 3:48:59 (London Apr 2026). VO2 Max 67, threshold pace 3:57/km, max HR 208bpm.

RACE PIPELINE: Berlin 28 Sep 2026 (Get Kids Going, Sub 3:20). Seville Feb 2027 (Sub 3:00). Valencia Dec 2027. Tokyo, Chicago, New York after that.

KEY COACHING INSIGHT: His cardiovascular engine is well ahead of his structural and muscular fitness. The Berlin block (started 22 Jun 2026) is about closing that gap. Main priority is completing 25 to 30km long runs he never hit in London build. Never plan more than 2 weeks at a time.

SHOES: Metaspeed Sky Tokyo Green (race), Metaspeed Sky Tokyo Red (carbon trainer), Vaporfly 3 and 4 (intervals), ZoomFly 5 (training), Novablast 5 with Superfeet (easy/long), Adidas Evo SL (daily/tempo). Low-medium arches.

RECOVERY-AWARE PLANNING: Always check recovery before recommending hard sessions. Under 34% recovery means rest or easy only. Under 60% sleep score, flag it. When adjusting a plan due to poor recovery, shift sessions forward rather than dropping them.

GYM: Chest focus. Smith flat bench 20kg/side 3x10, incline 15kg/side 3x10, pec deck 73kg 3x12, preacher curl 39kg 3x10, hammer curl 16kg 3x12, lateral raises 8-10kg 3x15. Weight 58-61kg targeting 65kg.

NUTRITION TARGETS: 2800-3200 kcal/day, 130-150g protein, 250-350g carbs. SiS Beta Fuel gels on long runs.

TODAY: Recovery ${todayRec!==null?todayRec+"%":"unknown"}${sleepScore!==null?`, sleep ${sleepScore}%`:""}.${todayRec!==null&&todayRec<34?" LOW RECOVERY - do not suggest hard sessions.":" "}

LIVE STRAVA: YTD ${ytd.distance?(ytd.distance/1000).toFixed(1):"449.6"}km, ${ytd.count||58} runs.

RECENT RUNS:\n${runs.map(r=>`- ${r.name} (${new Date(r.start_date_local).toLocaleDateString("en-GB")}): ${(r.distance/1000).toFixed(2)}km at ${fPace(r.average_speed)}/km${r.average_heartrate?`, ${Math.round(r.average_heartrate)}bpm`:""}`).join("\n")}

WHOOP HISTORY (7 days):\n${recentRecs||"No data"}

SLEEP HISTORY (7 days):\n${recentSleeps||"No data"}

NUTRITION (last 7 days):\n${recentNutrition||"No nutrition logged"}

PLAN FORMAT: When asked for a training plan, reply conversationally first (2-3 sentences), then use exactly this format:
PLAN_START
TITLE: [title]
Mon | [type] | [X]km | [pace]/km | [shoe] | [description]
(one line per day, 7 days or 14 for 2 weeks)
PLAN_END
Rest days: Mon | Rest | 0km | N/A | N/A | Rest day
Types: Easy, Interval, Tempo, Long Run, Rest, Gym. Never plan more than 2 weeks.

GYM FORMAT: When asked for a gym session, reply conversationally first, then:
GYM_START
TITLE: [session title]
[Exercise] | [Sets]x[Reps] | [Weight] | [Notes]
GYM_END
Always reference current lifts and suggest progressive overload.`;
  };
  const send=async()=>{
    if((!input.trim()&&!images.length)||loading)return;
    const contentArr=[];images.forEach(img=>contentArr.push({type:"image",source:{type:"base64",media_type:img.mediaType,data:img.base64}}));if(input.trim())contentArr.push({type:"text",text:input.trim()});
    const userMsg={role:"user",content:images.length?contentArr:input.trim()};
    const displayMsg={role:"user",content:input.trim()||(images.length>0?`${images.length} image${images.length>1?"s":""} attached`:""),imagePreviews:images.map(i=>i.preview)};
    setMessages(prev=>[...prev,displayMsg]);setInput("");setImages([]);setLoading(true);
    try{
      const apiMsgs=[...messages.filter(m=>m.role!=="system"),userMsg].map(m=>({role:m.role,content:m.content}));
      const res=await fetch("/.netlify/functions/claude-chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:buildContext(),messages:apiMsgs})});
      const data=await res.json();const reply=data.content?.[0]?.text||"Something went wrong. Try again.";
      const plan=extractPlan(reply),gym=extractGym(reply),cleaned=cleanReply(reply);
      const suffix=(plan?"\n\nTraining plan saved to your Plans tab.":"")+(gym?"\n\nGym workout saved to your Gym tab.":"");
      setMessages(prev=>[...prev,{role:"assistant",content:cleaned+suffix}]);
      if(plan&&onPlanSaved)onPlanSaved(plan);if(gym&&onGymSaved)onGymSaved(gym);
    }catch{setMessages(prev=>[...prev,{role:"assistant",content:"Something went wrong. Try again."}]);}
    setLoading(false);
  };
  const SUGGESTIONS=["How's my recovery?","Plan my next week","Gym session please","Am I on track for sub 3:20?","Analyse my recent runs"];
  return <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
    {/* Coach header */}
    <div style={{paddingBottom:12,flexShrink:0}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
        <div style={{width:36,height:36,borderRadius:10,background:C.indigo,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:T.text,fontFamily:sans}}>Coach Claude</div>
          <div style={{fontSize:11,color:C.green,fontFamily:sans}}>● Online · adapts to your data</div>
        </div>
        <button onClick={()=>{const f=[{role:"assistant",content:"Hey Caleb! I've got your Strava, Whoop, nutrition and training plan loaded. What do you need?"}];setMessages(f);saveChatHistory(f);}} style={{marginLeft:"auto",background:"transparent",border:`1px solid ${T.border}`,color:T.muted,borderRadius:99,padding:"4px 12px",fontSize:11,cursor:"pointer",fontFamily:sans}}>Clear</button>
      </div>
      {messages.length<=1&&<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {SUGGESTIONS.map(s=><button key={s} onClick={()=>setInput(s)} style={{background:C.indigoL,border:`1px solid ${C.indigoB}`,color:C.indigo,borderRadius:99,padding:"5px 12px",fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:sans,whiteSpace:"nowrap"}}>{s}</button>)}
      </div>}
    </div>
    {/* Messages */}
    <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:8,paddingBottom:12}}>
      {messages.map((m,i)=>(
        <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
          <div style={{maxWidth:"82%",padding:"11px 15px",borderRadius:18,background:m.role==="user"?C.indigo:T.card,color:m.role==="user"?"#fff":T.text,border:m.role==="assistant"?`1px solid ${T.border}`:"none",fontSize:14,lineHeight:1.65,fontFamily:sans,whiteSpace:"pre-wrap",borderBottomRightRadius:m.role==="user"?4:18,borderBottomLeftRadius:m.role==="assistant"?4:18,boxShadow:m.role==="user"?`0 2px 12px ${C.indigo}40`:T.shadow}}>
            {m.imagePreviews?.length>0&&<div style={{display:"flex",gap:4,marginBottom:6}}>{m.imagePreviews.map((p,j)=><img key={j} src={p} alt="" style={{height:52,width:52,objectFit:"cover",borderRadius:8}}/>)}</div>}
            {m.content}
          </div>
        </div>
      ))}
      {loading&&<div style={{display:"flex",justifyContent:"flex-start"}}><div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:18,borderBottomLeftRadius:4,padding:"12px 16px",display:"flex",gap:5}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:T.muted,animation:`pulse .9s ${i*0.2}s infinite`}}/>)}</div></div>}
      <div ref={bottomRef}/>
    </div>
    {images.length>0&&<div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap",flexShrink:0}}>{images.map((img,i)=><div key={i} style={{position:"relative"}}><img src={img.preview} alt="" style={{height:48,width:48,objectFit:"cover",borderRadius:8,border:`1px solid ${T.border}`}}/><button onClick={()=>setImages(prev=>prev.filter((_,j)=>j!==i))} style={{position:"absolute",top:-4,right:-4,background:C.red,color:"#fff",border:"none",borderRadius:"50%",width:15,height:15,fontSize:10,cursor:"pointer"}}>×</button></div>)}</div>}
    <div style={{display:"flex",gap:8,paddingTop:10,borderTop:`1px solid ${T.divider}`,alignItems:"flex-end",flexShrink:0}}>
      <button onClick={()=>fileRef.current?.click()} style={{background:T.card2,border:`1px solid ${T.border}`,color:T.sub,borderRadius:99,padding:"9px 12px",fontSize:16,cursor:"pointer",flexShrink:0}}>📷</button>
      <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={handleImages}/>
      <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()} placeholder="Message Coach Claude..." style={{flex:1,background:T.card2,border:`1.5px solid ${T.border}`,borderRadius:99,padding:"10px 16px",color:T.text,fontSize:14,outline:"none",fontFamily:sans,transition:"border-color .15s"}}/>
      <button onClick={send} disabled={loading||(!input.trim()&&!images.length)} style={{background:C.indigo,color:"#fff",border:"none",borderRadius:99,padding:"10px 18px",fontSize:14,fontWeight:600,cursor:"pointer",opacity:loading||(!input.trim()&&!images.length)?0.35:1,fontFamily:sans,flexShrink:0,boxShadow:`0 2px 12px ${C.indigo}40`}}>Send</button>
    </div>
    <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>
  </div>;
}

// ─── MORE MENU ────────────────────────────────────────────────────────────────
const MORE_PAGES = [
  {id:"gym",     label:"Gym",     icon:(a,c)=><svg width={22} height={22} viewBox="0 0 24 24" fill="none"><path d="M6 5v14M18 5v14M2 9h4M18 9h4M2 15h4M18 15h4M6 9h12M6 15h12" stroke={a?c:"currentColor"} strokeWidth={2} strokeLinecap="round"/></svg>},
  {id:"races",   label:"Races",   icon:(a,c)=><svg width={22} height={22} viewBox="0 0 24 24" fill="none"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" stroke={a?c:"currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill={a?`${c}15`:"none"}/><line x1="4" y1="22" x2="4" y2="15" stroke={a?c:"currentColor"} strokeWidth={2} strokeLinecap="round"/></svg>},
  {id:"profile", label:"Profile", icon:(a,c)=><svg width={22} height={22} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke={a?c:"currentColor"} strokeWidth={2} fill={a?`${c}15`:"none"}/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke={a?c:"currentColor"} strokeWidth={2} strokeLinecap="round"/></svg>},
];

function MoreMenu({page,setPage,T,whoopOk,onConnectWhoop,darkMode,setDarkMode,athlete,onDisconnect,onDisconnectWhoop}) {
  return <div style={{display:"flex",flexDirection:"column",gap:12,paddingBottom:24}} className="page">
    {/* Pages grid */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
      {MORE_PAGES.map(n=>(
        <Card key={n.id} T={T} onClick={()=>setPage(n.id==="coach"?"chat":n.id)} style={{padding:20,display:"flex",flexDirection:"column",gap:10}}>
          <div style={{color:C.indigo}}>{n.icon(true,C.indigo)}</div>
          <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:sans}}>{n.label}</div>
        </Card>
      ))}
    </div>
    {/* Settings */}
    <Card T={T} style={{padding:0,overflow:"hidden"}}>
      <button onClick={()=>setDarkMode(!darkMode)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"15px 18px",background:"transparent",border:"none",cursor:"pointer",borderBottom:`1px solid ${T.divider}`}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:18}}>{darkMode?"☀️":"🌙"}</span><span style={{fontSize:14,color:T.text,fontFamily:sans,fontWeight:500}}>{darkMode?"Light Mode":"Dark Mode"}</span></div>
        <div style={{width:44,height:26,background:darkMode?C.indigo:T.card2,border:`1.5px solid ${darkMode?C.indigo:T.border}`,borderRadius:13,position:"relative",transition:"all .2s"}}>
          <div style={{position:"absolute",top:2,left:darkMode?18:2,width:18,height:18,background:"#fff",borderRadius:"50%",transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,0.2)"}}/>
        </div>
      </button>
      {!whoopOk?(
        <button onClick={onConnectWhoop} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"15px 18px",background:"transparent",border:"none",cursor:"pointer",borderBottom:`1px solid ${T.divider}`}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}><span>⌚</span><span style={{fontSize:14,color:T.text,fontFamily:sans,fontWeight:500}}>Connect Whoop</span></div>
          <span style={{fontSize:13,color:C.red,fontWeight:600,fontFamily:sans}}>Connect →</span>
        </button>
      ):(
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"15px 18px",borderBottom:`1px solid ${T.divider}`}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}><span>⌚</span><span style={{fontSize:14,color:T.text,fontFamily:sans,fontWeight:500}}>Whoop</span></div>
          <Chip color={C.green} style={{fontSize:10}}>Connected</Chip>
        </div>
      )}
      <div style={{display:"flex"}}>
        <button onClick={onDisconnect} style={{flex:1,padding:"12px 16px",background:"transparent",border:"none",borderRight:`1px solid ${T.divider}`,cursor:"pointer",fontSize:12,color:T.muted,fontFamily:sans}}>Disconnect Strava</button>
        {whoopOk&&<button onClick={onDisconnectWhoop} style={{flex:1,padding:"12px 16px",background:"transparent",border:"none",cursor:"pointer",fontSize:12,color:T.muted,fontFamily:sans}}>Disconnect Whoop</button>}
      </div>
    </Card>
    {/* Connected apps (FitSync style) */}
    <Card T={T} style={{padding:18}}>
      <Row style={{marginBottom:14}}>
        <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:sans}}>Connected apps</div>
        <Chip color={C.green}>{[true,whoopOk].filter(Boolean).length} synced</Chip>
      </Row>
      {[{name:"Strava",sub:"Runs & activities",icon:"S",color:"#FC4C02",ok:true},{name:"WHOOP",sub:"Recovery & strain",icon:"W",color:"#000",ok:whoopOk},{name:"Coros",sub:"GPS workouts",icon:"C",color:"#1A1A2E",ok:false}].map((app,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid ${T.divider}`}}>
          <div style={{width:36,height:36,borderRadius:10,background:app.color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:14,fontWeight:700,fontFamily:sans,flexShrink:0}}>{app.icon}</div>
          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:T.text,fontFamily:sans}}>{app.name}</div><div style={{fontSize:11,color:T.sub,fontFamily:sans,marginTop:1}}>{app.sub}</div></div>
          {app.ok?<Chip color={C.green} style={{fontSize:10}}>Synced</Chip>:<Chip color={T.muted} style={{fontSize:10}}>Connect</Chip>}
        </div>
      ))}
    </Card>
  </div>;
}

// ─── NAV TABS ─────────────────────────────────────────────────────────────────
function Profile({athlete,whoopData,stats,activities,whoopOk,darkMode,setDarkMode,onConnectWhoop,T}) {
  const rec=whoopData?.recoveries?.records?.[0];
  const recScore=Math.round(rec?.score?.recovery_score||0);
  const hrv=Math.round(rec?.score?.hrv_rmssd_milli||0);
  const rhr=Math.round(rec?.score?.resting_heart_rate||0);
  const ytd=stats?.ytd_run_totals||{};
  const streaks=calcStreaks(activities);
  // VO2 max from Coros data (stored as 67 from known data)
  const vo2=67;
  return <div style={{display:"flex",flexDirection:"column",gap:12,paddingBottom:24}} className="page">
    {/* Profile header - FitSync style */}
    <Card T={T} style={{padding:20}}>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
        <div style={{width:52,height:52,borderRadius:16,background:C.indigo,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <span style={{fontSize:22,fontWeight:800,color:"#fff",fontFamily:sans}}>C</span>
        </div>
        <div>
          <div style={{fontSize:18,fontWeight:700,color:T.text,fontFamily:sans,letterSpacing:"-0.02em"}}>Caleb Cunningham</div>
          <div style={{fontSize:13,color:T.sub,fontFamily:sans,marginTop:2}}>Marathon training · since 2024</div>
        </div>
      </div>
      <div style={{display:"flex",gap:0,borderTop:`1px solid ${T.divider}`,paddingTop:14}}>
        {[{label:"VO₂ Max",value:vo2},{label:"Resting HR",value:rhr||48},{label:"Weight kg",value:"60"}].map((s,i)=>(
          <div key={i} style={{flex:1,textAlign:"center",borderRight:i<2?`1px solid ${T.divider}`:"none"}}>
            <div style={{fontSize:20,fontWeight:800,color:T.text,fontFamily:sans,letterSpacing:"-0.02em"}}>{s.value}</div>
            <div style={{fontSize:11,color:T.sub,fontFamily:sans,marginTop:2}}>{s.label}</div>
          </div>
        ))}
      </div>
    </Card>
    {/* Stats */}
    <Card T={T} style={{padding:18}}>
      <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:sans,marginBottom:14}}>Stats</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {[
          {l:"YTD Distance",v:ytd.distance?`${(ytd.distance/1000).toFixed(0)}km`:"450km",c:C.indigo},
          {l:"YTD Runs",v:String(ytd.count||58),c:T.text},
          {l:"Best 5K",v:"18:42",c:C.green},
          {l:"Best Marathon",v:"3:48:59",c:C.green},
          {l:"Current Streak",v:`${streaks.current}d`,c:streaks.current>2?C.orange:T.sub},
          {l:"Longest Streak",v:`${streaks.longest}d`,c:T.text},
        ].map((s,i)=>(
          <div key={i} style={{background:T.card2,borderRadius:12,padding:"12px 14px"}}>
            <div style={{fontSize:10,fontWeight:600,color:T.muted,letterSpacing:"0.05em",textTransform:"uppercase",fontFamily:sans,marginBottom:5}}>{s.l}</div>
            <div style={{fontSize:20,fontWeight:800,color:s.c,fontFamily:sans,letterSpacing:"-0.02em"}}>{s.v}</div>
          </div>
        ))}
      </div>
    </Card>
    {/* Connected apps */}
    <Card T={T} style={{padding:18}}>
      <Row style={{marginBottom:14}}>
        <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:sans}}>Connected apps</div>
        <Chip color={C.green} style={{fontSize:10}}>{[true,whoopOk].filter(Boolean).length} synced</Chip>
      </Row>
      {[{name:"Strava",sub:"Runs & rides · just now",icon:"S",color:"#FC4C02",ok:true},{name:"WHOOP",sub:"Recovery & strain · just now",icon:"W",color:"#1A1A2E",ok:whoopOk},{name:"Coros",sub:"GPS workouts",icon:"C",color:"#2D6BE4",ok:false}].map((app,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 0",borderBottom:`1px solid ${T.divider}`}}>
          <div style={{width:38,height:38,borderRadius:11,background:app.color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:14,fontWeight:700,fontFamily:sans,flexShrink:0}}>{app.icon}</div>
          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:T.text,fontFamily:sans}}>{app.name}</div><div style={{fontSize:11,color:T.sub,fontFamily:sans,marginTop:1}}>{app.sub}</div></div>
          {app.ok?<Chip color={C.green} style={{fontSize:10}}>Synced</Chip>:<button onClick={app.name==="WHOOP"?onConnectWhoop:undefined} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:99,padding:"4px 12px",fontSize:11,color:T.sub,cursor:"pointer",fontFamily:sans}}>Connect</button>}
        </div>
      ))}
    </Card>
    {/* Goals & targets */}
    <Card T={T} style={{padding:0,overflow:"hidden"}}>
      {[
        {label:"Goals & targets",right:"Berlin · Sub 3:20 →"},
        {label:"Units",right:"Metric (km, kg)"},
        {label:"Dark mode",right:null,toggle:true},
      ].map((item,i)=>(
        <button key={i} onClick={item.toggle?()=>setDarkMode(d=>!d):undefined}
          style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"15px 18px",background:"transparent",border:"none",borderBottom:i<2?`1px solid ${T.divider}`:"none",cursor:"pointer",fontFamily:sans}}>
          <span style={{fontSize:14,color:T.text,fontFamily:sans}}>{item.label}</span>
          {item.toggle
            ? <div style={{width:44,height:26,background:darkMode?C.indigo:T.card2,border:`1.5px solid ${darkMode?C.indigo:T.border}`,borderRadius:13,position:"relative",transition:"all .2s"}}><div style={{position:"absolute",top:2,left:darkMode?18:2,width:18,height:18,background:"#fff",borderRadius:"50%",transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,0.2)"}}/></div>
            : <span style={{fontSize:13,color:T.sub,fontFamily:sans}}>{item.right} ›</span>
          }
        </button>
      ))}
    </Card>
  </div>;
}

const TABS = [
  {id:"overview",  label:"Home",      icon:(a,c)=><svg width={20} height={20} viewBox="0 0 24 24" fill="none"><path d="M3 12L12 3l9 9" stroke={a?c:"currentColor"} strokeWidth={a?2.5:1.8} strokeLinecap="round" strokeLinejoin="round"/><path d="M5 10v9a1 1 0 001 1h4v-4h4v4h4a1 1 0 001-1v-9" stroke={a?c:"currentColor"} strokeWidth={a?2.5:1.8} strokeLinecap="round" strokeLinejoin="round" fill={a?`${c}15`:"none"}/></svg>},
  {id:"running",   label:"Running",   icon:(a,c)=><svg width={20} height={20} viewBox="0 0 24 24" fill="none"><circle cx="14" cy="4" r="2" fill={a?c:"currentColor"}/><path d="M6 21l2.5-6L12 17l2.5-8" stroke={a?c:"currentColor"} strokeWidth={a?2.5:1.8} strokeLinecap="round" strokeLinejoin="round"/><path d="M8.5 15L6 21" stroke={a?c:"currentColor"} strokeWidth={a?2.5:1.8} strokeLinecap="round"/><path d="M12.5 9l3.5-1.5 2.5 3-3.5 1.5" stroke={a?c:"currentColor"} strokeWidth={a?2.5:1.8} strokeLinecap="round" strokeLinejoin="round"/></svg>},
  {id:"coach",     label:"Chat",      icon:(a,c)=><svg width={20} height={20} viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke={a?c:"currentColor"} strokeWidth={a?2.5:1.8} strokeLinecap="round" strokeLinejoin="round" fill={a?`${c}15`:"none"}/></svg>},
  {id:"plan",      label:"Plans",     icon:(a,c)=><svg width={20} height={20} viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="3" stroke={a?c:"currentColor"} strokeWidth={a?2.5:1.8} fill={a?`${c}15`:"none"}/><path d="M16 2v4M8 2v4M3 10h18" stroke={a?c:"currentColor"} strokeWidth={a?2.5:1.8} strokeLinecap="round"/><path d="M8 14h4M8 17h6" stroke={a?c:"currentColor"} strokeWidth={a?2.5:1.8} strokeLinecap="round"/></svg>},
  {id:"recovery",  label:"Recovery",  icon:(a,c)=><svg width={20} height={20} viewBox="0 0 24 24" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke={a?c:"currentColor"} strokeWidth={a?2.5:1.8} strokeLinecap="round" strokeLinejoin="round"/></svg>},
  {id:"nutrition", label:"Nutrition", icon:(a,c)=><svg width={20} height={20} viewBox="0 0 24 24" fill="none"><path d="M12 22C6.5 22 2 17.5 2 12S6.5 2 12 2s10 4.5 10 10-4.5 10-10 10z" stroke={a?c:"currentColor"} strokeWidth={a?2.5:1.8} fill={a?`${c}15`:"none"}/><path d="M8 12h8M12 8v8" stroke={a?c:"currentColor"} strokeWidth={a?2.5:1.8} strokeLinecap="round"/></svg>},
  {id:"more",      label:"More",      icon:(a,c)=><svg width={20} height={20} viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r={a?2:1.5} fill={a?c:"currentColor"}/><circle cx="12" cy="12" r={a?2:1.5} fill={a?c:"currentColor"}/><circle cx="19" cy="12" r={a?2:1.5} fill={a?c:"currentColor"}/></svg>},
];

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [page,setPage]=useState("overview");
  const [connected,setConnected]=useState(isConnected());
  const [whoopOk,setWhoopOk]=useState(isWhoopConnected());
  const [activities,setActivities]=useState([]);
  const [stats,setStats]=useState(null);
  const [athlete,setAthlete]=useState(null);
  const [gear,setGear]=useState([]);
  const [bestEfforts,setBestEfforts]=useState({});
  const [whoopData,setWhoopData]=useState(null);
  const [loading,setLoading]=useState(false);
  const [whoopPending,setWhoopPending]=useState(false);
  const [savedPlan,setSavedPlan]=useState(null);
  const [savedWorkout,setSavedWorkout]=useState(null);
  const [userPrefs,setUserPrefs]=useState(null);
  const [darkMode,setDarkMode]=useState(()=>localStorage.getItem("theme")==="dark");
  const T=darkMode?DARK:LIGHT;

  useEffect(()=>{localStorage.setItem("theme",darkMode?"dark":"light");},[darkMode]);
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search),code=params.get("code"),pending=localStorage.getItem("whoop_pending");
    if(!code)return;
    if(pending){setWhoopPending(true);exchangeWhoopCode(code).then(()=>{setWhoopOk(true);setWhoopPending(false);}).catch(e=>{console.error(e);setWhoopPending(false);}).finally(()=>window.history.replaceState({},"","/"));}
    else if(!isConnected()){exchangeCode(code).then(()=>setConnected(true)).catch(console.error).finally(()=>window.history.replaceState({},"","/"));}
  },[]);
  useEffect(()=>{
    if(!connected)return;setLoading(true);
    Promise.all([getAthlete(),getActivities(100)]).then(([a,acts])=>{setAthlete(a);setActivities(acts);setBestEfforts(extractBestEfforts(acts));return Promise.all([getStats(a.id),getAllGear(a)]);}).then(([s,g])=>{setStats(s);setGear(g.filter(Boolean));}).catch(console.error).finally(()=>setLoading(false));
  },[connected]);
  const loadWhoop=useCallback(()=>{if(whoopOk)getWhoopData().then(setWhoopData).catch(console.error);},[whoopOk]);
  useEffect(()=>{loadWhoop();},[loadWhoop]);
  useEffect(()=>{loadUserPrefs().then(p=>{if(p)setUserPrefs(p);});},[]);
  const handleSavePrefs=useCallback(prefs=>{setUserPrefs(prefs);saveUserPrefs(prefs);},[]);
  const handleConnectWhoop=()=>window.location.assign(getWhoopAuthUrl());
  const goToChat=()=>setPage("coach");

  if(!connected||whoopPending)return <ConnectScreen whoopPending={whoopPending} T={T}/>;

  const shared={activities,stats,whoopData,whoopOk,onConnectWhoop:handleConnectWhoop,onRefreshWhoop:loadWhoop,T};
  const views={
    overview:<Home {...shared} bestEfforts={bestEfforts} userPrefs={userPrefs} onNav={setPage} athlete={athlete} plan={savedPlan}/>,
    running:<Running activities={activities} stats={stats} gear={gear} T={T}/>,
    plan:<Plans onChat={goToChat} onGoToChat={goToChat} externalPlan={savedPlan} whoopData={whoopData} T={T}/>,
    recovery:<RecoveryPage {...shared}/>,
    coach:<Coach {...shared} onPlanSaved={setSavedPlan} onGymSaved={setSavedWorkout} userPrefs={userPrefs}/>,
    chat:<Coach {...shared} onPlanSaved={setSavedPlan} onGymSaved={setSavedWorkout} userPrefs={userPrefs}/>,
    profile:<Profile athlete={athlete} whoopData={whoopData} stats={stats} activities={activities} whoopOk={whoopOk} darkMode={darkMode} setDarkMode={setDarkMode} onConnectWhoop={handleConnectWhoop} T={T}/>,
    gym:<Gym activities={activities} userPrefs={userPrefs} onSavePrefs={handleSavePrefs} savedWorkout={savedWorkout} T={T}/>,
    nutrition:<Nutrition userPrefs={userPrefs} onSavePrefs={handleSavePrefs} T={T}/>,
    races:<Races userPrefs={userPrefs} onSavePrefs={handleSavePrefs} T={T}/>,
    more:<MoreMenu page={page} setPage={setPage} T={T} whoopOk={whoopOk} onConnectWhoop={handleConnectWhoop} darkMode={darkMode} setDarkMode={setDarkMode} athlete={athlete} onDisconnect={()=>{disconnect();setConnected(false);setActivities([]);}} onDisconnectWhoop={()=>{disconnectWhoop();setWhoopOk(false);setWhoopData(null);}}/>,
  };
  const currentView=views[page]||views.more;
  const activeTab=TABS.find(t=>t.id===page)?page:(MORE_PAGES.find(p=>p.id===page)?"more":"overview");
  const recScore=whoopData?.recoveries?.records?.[0]?Math.round(whoopData.recoveries.records[0].score?.recovery_score||0):null;
  const pageTitles={overview:"Home",running:"Running",plan:"Plans",recovery:"Recovery",chat:"Coach",coach:"Coach",gym:"Gym",nutrition:"Nutrition",races:"Races",more:"More",profile:"Profile",nutrition:"Nutrition"};

  return (
    <div style={{height:"100vh",background:T.bg,color:T.text,fontFamily:sans,overflow:"hidden",display:"flex"}}>
      <style>{CSS}</style>
      <style>{`@media(min-width:800px){.dsk{display:flex!important}}.mobile-tab{display:flex}@media(min-width:800px){.mobile-tab{display:none!important}}.chat-fab{position:fixed;bottom:calc(env(safe-area-inset-bottom,0px)+70px);right:16px;z-index:99}@media(min-width:800px){.chat-fab{display:none!important}}`}</style>

      {/* ── DESKTOP SIDEBAR (FitSync style) ── */}
      <div className="dsk" style={{display:"none",flexDirection:"column",width:220,borderRight:`1px solid ${T.navB}`,background:T.nav,flexShrink:0,height:"100vh",overflowY:"auto"}}>
        {/* Logo */}
        <div style={{padding:"24px 20px 20px",display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,background:C.indigo,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <svg viewBox="0 0 24 24" width={17} height={17} fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="white"/></svg>
          </div>
          <div style={{fontSize:15,fontWeight:800,color:T.text,fontFamily:sans,letterSpacing:"-0.02em"}}>FitSync</div>
        </div>
        <nav style={{padding:"0 10px",flex:1}}>
          {[...TABS.filter(t=>t.id!=="more"),...MORE_PAGES].map(n=>{
            const nid=n.id;
            const isActive=page===nid||(n.id==="coach"&&page==="chat");
            return (
              <button key={n.id} onClick={()=>setPage(nid)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 12px",background:isActive?C.indigoL:"transparent",borderRadius:10,border:"none",cursor:"pointer",color:isActive?C.indigo:T.sub,fontSize:13,fontWeight:isActive?600:400,fontFamily:sans,textAlign:"left",marginBottom:1,transition:"all .12s"}}>
                <span style={{display:"flex",color:isActive?C.indigo:T.muted}}>{typeof n.icon==="function"?n.icon(isActive,C.indigo):null}</span>
                <span>{n.label}</span>
              </button>
            );
          })}
        </nav>
        <div style={{padding:"12px 18px 24px",borderTop:`1px solid ${T.divider}`}}>
          {recScore!=null&&<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,background:T.card2,borderRadius:10,padding:"8px 10px"}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:recScore>=67?C.green:recScore>=34?C.yellow:C.red}}/>
            <div style={{fontSize:12,color:T.sub,fontFamily:sans}}><span style={{color:recScore>=67?C.green:recScore>=34?C.yellow:C.red,fontWeight:600}}>{recScore}%</span> recovery</div>
          </div>}
          <button onClick={()=>setDarkMode(d=>!d)} style={{display:"flex",alignItems:"center",gap:8,background:T.card2,border:`1px solid ${T.border}`,borderRadius:10,padding:"7px 10px",cursor:"pointer",fontSize:11,color:T.sub,fontFamily:sans,width:"100%",marginBottom:8}}>
            <span>{darkMode?"☀️":"🌙"}</span><span>{darkMode?"Light mode":"Dark mode"}</span>
          </button>
          {whoopOk?<div style={{fontSize:11,color:C.green,fontWeight:600,fontFamily:sans}}>✓ Whoop connected</div>:<button onClick={handleConnectWhoop} style={{background:"transparent",border:`1px solid ${C.red}`,borderRadius:10,padding:"6px 10px",color:C.red,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:sans,width:"100%"}}>Connect Whoop</button>}
        </div>
      </div>

      {/* ── MAIN ── */}
      <div style={{flex:1,display:"flex",flexDirection:"column",height:"100vh",overflow:"hidden",minWidth:0}}>
        {/* Top bar */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 18px 10px",flexShrink:0}}>
          <div>
            <div style={{fontSize:11,fontWeight:600,color:T.muted,fontFamily:sans,letterSpacing:"0.05em",textTransform:"uppercase"}}>FitSync</div>
            <div style={{fontSize:22,fontWeight:700,color:T.text,fontFamily:sans,letterSpacing:"-0.025em",lineHeight:1.15,marginTop:1}}>{pageTitles[page]||"More"}</div>
          </div>
          {recScore!=null&&<div style={{display:"flex",alignItems:"center",gap:6,background:T.card,boxShadow:T.shadow,border:`1px solid ${T.border}`,borderRadius:99,padding:"5px 11px"}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:recScore>=67?C.green:recScore>=34?C.yellow:C.red,boxShadow:`0 0 5px ${recScore>=67?C.green:recScore>=34?C.yellow:C.red}`}}/>
            <span style={{fontSize:12,fontWeight:600,color:T.text,fontFamily:sans}}>{recScore}%</span>
          </div>}
        </div>

        {/* Content */}
        <div style={{flex:1,overflowY:page==="coach"||page==="chat"?"hidden":"auto",padding:"0 16px",WebkitOverflowScrolling:"touch",display:"flex",flexDirection:"column"}}>
          {loading?<Loader T={T} text="Loading your data..."/>:currentView}
        </div>

        {/* ── BOTTOM TABS: full-width floating pill, iPhone 17 Pro ── */}
        <div className="mobile-tab" style={{
          flexShrink:0,
          padding:"8px 16px",
          paddingBottom:"calc(env(safe-area-inset-bottom, 20px) + 8px)",
          background:"transparent",
        }}>
          <div style={{
            display:"flex", alignItems:"center",
            background:T.nav,
            borderRadius:40,
            boxShadow:"0 2px 20px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)",
            padding:"5px 2px",
          }}>
            {TABS.map(tab=>{
              const isActive=activeTab===tab.id;
              return (
                <button key={tab.id} onClick={()=>setPage(tab.id)}
                  style={{
                    flex:1, display:"flex", flexDirection:"column",
                    alignItems:"center", justifyContent:"center",
                    gap:2, background:"transparent", border:"none",
                    cursor:"pointer", padding:"7px 2px",
                    WebkitTapHighlightColor:"transparent",
                  }}>
                  <span style={{color:isActive?C.indigo:T.muted,display:"flex"}}>
                    {tab.icon(isActive,C.indigo)}
                  </span>
                  <span style={{
                    fontSize:9, fontWeight:isActive?700:400,
                    fontFamily:sans, color:isActive?C.indigo:T.muted,
                    letterSpacing:"0.01em",
                  }}>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>


    </div>
  );
}
