import { useState, useEffect, useRef, useCallback } from "react";
import { AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { isConnected, disconnect, exchangeCode, getAthlete, getStats, getActivities, getActivity, getStreams, getAllGear, extractBestEfforts } from "./strava";
import { isWhoopConnected, disconnectWhoop, exchangeWhoopCode, getWhoopAuthUrl, getWhoopData } from "./whoop";
import { isCorosConnected, getCorosAuthUrl, exchangeCorosCode, getCorosData } from "./coros";
import { loadChatHistory, saveChatHistory, loadTrainingPlan, saveTrainingPlan, loadUserPrefs, saveUserPrefs } from "./supabase";
import { LIFTS as DEFAULT_LIFTS, RACES as DEFAULT_RACES, SPONSORSHIP as DEFAULT_SPONSORSHIP, fPace, fTime, fDist, actType, typeCol, weeklyVol } from "./data";

// ─── TOKENS ────────────────────────────────────────────────────────────────────
const P = "#4F46E5";   // primary indigo
const G = "#10B981";   // green
const R = "#EF4444";   // red
const O = "#F59E0B";   // amber
const T2 = "#8B5CF6";  // purple
const C2 = "#06B6D4";  // cyan

const LIGHT = {
  bg:      "#F8F7F5",
  card:    "#FFFFFF",
  card2:   "#F3F3F0",
  border:  "rgba(0,0,0,0.055)",
  div:     "rgba(0,0,0,0.038)",
  text:    "#0A0A0A",
  sub:     "#5C5C5C",
  muted:   "#9E9E9E",
  nav:     "#FFFFFF",
  navB:    "rgba(0,0,0,0.055)",
  sh:      "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)",
  shLg:    "0 2px 4px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.08)",
};
const DARK = {
  bg:      "#0C0C0E",
  card:    "#1A1A1F",
  card2:   "#242429",
  border:  "rgba(255,255,255,0.075)",
  div:     "rgba(255,255,255,0.04)",
  text:    "#F5F5F5",
  sub:     "#A0A0A0",
  muted:   "#606068",
  nav:     "#1A1A1F",
  navB:    "rgba(255,255,255,0.075)",
  sh:      "0 1px 2px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.2)",
  shLg:    "0 2px 4px rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.25)",
};

const F = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',sans-serif";

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
  return {current,longest:Math.max(longest,current)};
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
::-webkit-scrollbar{width:0;height:0}
input,textarea,select{font-family:inherit}
button{font-family:inherit;cursor:pointer}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
.page{animation:fadeUp .22s ease both}
`;

// ─── PRIMITIVES ───────────────────────────────────────────────────────────────
const Row = ({children,style={}}) => <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",...style}}>{children}</div>;

function Card({children,style={},T,onClick,noPad}) {
  const [p,setP]=useState(false);
  return <div onClick={onClick}
    onMouseDown={onClick?()=>setP(true):null} onMouseUp={onClick?()=>setP(false):null}
    onTouchStart={onClick?()=>setP(true):null} onTouchEnd={onClick?()=>setP(false):null}
    style={{background:T.card,borderRadius:20,boxShadow:T.sh,
      padding:noPad?0:18,cursor:onClick?"pointer":"default",
      transform:p&&onClick?"scale(0.985)":"scale(1)",
      transition:"transform .1s ease",...style}}>
    {children}
  </div>;
}

function Btn({children,onClick,color=P,ghost=false,sm=false,full=false,style={},disabled=false,loading=false}) {
  const [p,setP]=useState(false);
  return <button onClick={onClick} disabled={disabled||loading}
    onMouseDown={()=>setP(true)} onMouseUp={()=>setP(false)} onMouseLeave={()=>setP(false)}
    onTouchStart={()=>setP(true)} onTouchEnd={()=>setP(false)}
    style={{background:ghost?"transparent":disabled?LIGHT.muted:color,
      color:ghost?color:"#fff",
      border:`1.5px solid ${ghost?color:disabled?LIGHT.muted:color}`,
      borderRadius:100,padding:sm?"8px 18px":"12px 24px",
      fontSize:sm?13:15,fontWeight:600,letterSpacing:"-0.01em",
      width:full?"100%":"auto",opacity:disabled?0.4:1,
      transform:p?"scale(0.96)":"scale(1)",transition:"transform .1s ease",
      display:"flex",alignItems:"center",justifyContent:"center",gap:6,...style}}>
    {loading&&<div style={{width:14,height:14,border:"2px solid rgba(255,255,255,0.3)",borderTop:"2px solid #fff",borderRadius:"50%",animation:"spin .7s linear infinite"}}/>}
    {children}
  </button>;
}

function Tag({children,color=P,style={}}) {
  return <span style={{background:`${color}18`,color,borderRadius:100,padding:"3px 10px",fontSize:11,fontWeight:600,letterSpacing:"-0.01em",fontFamily:F,display:"inline-flex",alignItems:"center",...style}}>{children}</span>;
}

function Loader({T}) {
  return <div style={{display:"flex",alignItems:"center",justifyContent:"center",flex:1,flexDirection:"column",gap:16,minHeight:200}}>
    <div style={{width:36,height:36,border:`2.5px solid ${T.card2}`,borderTop:`2.5px solid ${P}`,borderRadius:"50%",animation:"spin .8s linear infinite"}}/>
    <div style={{fontSize:13,color:T.muted,fontFamily:F}}>Loading...</div>
  </div>;
}

function SkeletonCard({T,height=80}) {
  return <div style={{background:`linear-gradient(90deg,${T.card2} 0%,${T.card} 50%,${T.card2} 100%)`,backgroundSize:"200% 100%",animation:"shimmer 1.5s infinite",borderRadius:20,height,boxShadow:T.sh}}/>;
}

// Ring component
function Ring({score=0,size=100,strokeW=8,color=G,label,sublabel,dark=false}) {
  const r=(size-strokeW)/2,circ=2*Math.PI*r,dash=(Math.min(score,100)/100)*circ;
  const textColor=dark?"#fff":color;
  return <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
    <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={dark?"rgba(255,255,255,0.12)":`${color}18`} strokeWidth={strokeW}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={dark?"rgba(255,255,255,0.9)":color} strokeWidth={strokeW}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{transition:"stroke-dasharray .9s cubic-bezier(.4,0,.2,1)"}}/>
    </svg>
    <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1}}>
      {label&&<div style={{fontSize:Math.round(size*.2),fontWeight:800,color:textColor,fontFamily:F,lineHeight:1,letterSpacing:"-0.03em"}}>{label}</div>}
      {sublabel&&<div style={{fontSize:Math.round(size*.09),fontWeight:600,color:dark?"rgba(255,255,255,0.5)":textColor,fontFamily:F,opacity:.8,letterSpacing:"0.04em"}}>{sublabel}</div>}
    </div>
  </div>;
}

const CT = ({active,payload,label,T}) => {
  if(!active||!payload?.length)return null;
  return <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"9px 13px",fontSize:12,boxShadow:T.shLg,fontFamily:F}}>
    <div style={{color:T.muted,marginBottom:4,fontSize:11}}>{label}</div>
    {payload.map((p,i)=><div key={i} style={{color:p.color||P,fontWeight:600}}>{p.name}: {p.value}</div>)}
  </div>;
};

// ─── CONNECT SCREEN ───────────────────────────────────────────────────────────
function ConnectScreen({whoopPending,T}) {
  const id=process.env.REACT_APP_STRAVA_CLIENT_ID;
  const url=`https://www.strava.com/oauth/authorize?client_id=${id}&redirect_uri=${encodeURIComponent(window.location.origin)}&response_type=code&scope=read,activity:read_all`;
  if(whoopPending)return(
    <div style={{height:"100vh",background:"#0C0C0E",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:20}}>
      <div style={{width:40,height:40,border:"3px solid rgba(255,255,255,0.1)",borderTop:`3px solid ${P}`,borderRadius:"50%",animation:"spin .8s linear infinite"}}/>
      <div style={{color:"rgba(255,255,255,0.4)",fontSize:14,fontFamily:F}}>Connecting Whoop...</div>
    </div>
  );
  return(
    <div style={{height:"100vh",background:"#0C0C0E",display:"flex",alignItems:"center",justifyContent:"center",padding:28}}>
      <div style={{maxWidth:340,width:"100%",textAlign:"center"}}>
        {/* Logo */}
        <div style={{marginBottom:48}}>
          <div style={{width:64,height:64,background:P,borderRadius:18,margin:"0 auto 20px",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 8px 32px ${P}50`}}>
            <svg viewBox="0 0 24 24" width={32} height={32} fill="none">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="white"/>
            </svg>
          </div>
          <div style={{fontSize:32,fontWeight:800,color:"#fff",fontFamily:F,letterSpacing:"-0.04em",marginBottom:8}}>Apex</div>
          <div style={{fontSize:15,color:"rgba(255,255,255,0.35)",fontFamily:F,lineHeight:1.6}}>Your personal training hub.</div>
        </div>
        <a href={url} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,background:"#FC4C02",color:"#fff",borderRadius:16,padding:"16px 28px",fontSize:16,fontWeight:700,textDecoration:"none",fontFamily:F,marginBottom:16,boxShadow:"0 4px 24px rgba(252,76,2,0.4)"}}>
          <svg viewBox="0 0 24 24" width={20} height={20} fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
          Connect with Strava
        </a>
        <div style={{fontSize:12,color:"rgba(255,255,255,0.18)",fontFamily:F}}>Read-only access · Your data stays private</div>
      </div>
    </div>
  );
}

// ─── ACTIVITY DETAIL ──────────────────────────────────────────────────────────
function ActivityDetail({id,onBack,T}) {
  const [act,setAct]=useState(null);const [streams,setStreams]=useState(null);const [loading,setLoading]=useState(true);
  useEffect(()=>{Promise.all([getActivity(id),getStreams(id)]).then(([a,s])=>{setAct(a);setStreams(s);}).catch(console.error).finally(()=>setLoading(false));},[id]);
  if(loading)return <Loader T={T}/>;
  if(!act)return null;
  const hr=streams?.heartrate?.data||[],time=streams?.time?.data||[];
  const hrChart=hr.filter((_,i)=>i%10===0).map((v,i)=>({t:Math.round((time[i*10]||0)/60),hr:v}));
  const type=actType(act),col=typeCol(type),laps=act.laps||[];
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14,paddingBottom:32}} className="page">
      <button onClick={onBack} style={{display:"inline-flex",alignItems:"center",gap:6,background:"transparent",border:"none",color:P,fontSize:15,fontWeight:600,fontFamily:F,padding:"4px 0",alignSelf:"flex-start"}}>
        <svg viewBox="0 0 24 24" width={18} height={18} fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></svg>
        Back
      </button>
      <Card T={T} style={{padding:20}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,marginBottom:16}}>
          <div style={{flex:1}}>
            <div style={{fontSize:20,fontWeight:700,color:T.text,fontFamily:F,letterSpacing:"-0.02em",lineHeight:1.2,marginBottom:6}}>{act.name}</div>
            <div style={{fontSize:13,color:T.sub,fontFamily:F}}>{new Date(act.start_date_local).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}</div>
          </div>
          <Tag color={col}>{type}</Tag>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
          {[{l:"Distance",v:`${(act.distance/1000).toFixed(2)}km`,c:P},{l:"Time",v:fTime(act.moving_time),c:T.text},{l:"Pace",v:`${fPace(act.average_speed)}/km`,c:P}].map((s,i)=>(
            <div key={i} style={{background:T.card2,borderRadius:14,padding:"12px 13px"}}>
              <div style={{fontSize:10,color:T.muted,fontFamily:F,marginBottom:4,fontWeight:500}}>{s.l}</div>
              <div style={{fontSize:16,fontWeight:700,color:s.c,fontFamily:F,letterSpacing:"-0.02em"}}>{s.v}</div>
            </div>
          ))}
          {act.average_heartrate&&<div style={{background:T.card2,borderRadius:14,padding:"12px 13px"}}><div style={{fontSize:10,color:T.muted,fontFamily:F,marginBottom:4,fontWeight:500}}>Avg HR</div><div style={{fontSize:16,fontWeight:700,color:R,fontFamily:F}}>{Math.round(act.average_heartrate)} bpm</div></div>}
          {act.total_elevation_gain>0&&<div style={{background:T.card2,borderRadius:14,padding:"12px 13px"}}><div style={{fontSize:10,color:T.muted,fontFamily:F,marginBottom:4,fontWeight:500}}>Elevation</div><div style={{fontSize:16,fontWeight:700,color:G,fontFamily:F}}>{Math.round(act.total_elevation_gain)}m</div></div>}
          {act.average_cadence&&<div style={{background:T.card2,borderRadius:14,padding:"12px 13px"}}><div style={{fontSize:10,color:T.muted,fontFamily:F,marginBottom:4,fontWeight:500}}>Cadence</div><div style={{fontSize:16,fontWeight:700,color:T2,fontFamily:F}}>{Math.round(act.average_cadence*2)} spm</div></div>}
        </div>
      </Card>
      {hrChart.length>5&&(
        <Card T={T} style={{padding:18}}>
          <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:F,marginBottom:14}}>Heart Rate</div>
          <ResponsiveContainer width="100%" height={110}>
            <AreaChart data={hrChart}>
              <defs><linearGradient id="hrg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={R} stopOpacity={0.15}/><stop offset="100%" stopColor={R} stopOpacity={0}/></linearGradient></defs>
              <XAxis dataKey="t" tick={{fontSize:10,fill:T.muted,fontFamily:F}} tickLine={false} axisLine={false} unit="m"/>
              <YAxis tick={{fontSize:10,fill:T.muted}} tickLine={false} axisLine={false} width={26} domain={["auto","auto"]}/>
              <Tooltip content={<CT T={T}/>}/>
              <Area type="monotone" dataKey="hr" name="HR" stroke={R} fill="url(#hrg)" strokeWidth={2} dot={false}/>
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}
      {laps.length>1&&(
        <Card T={T} style={{padding:18}}>
          <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:F,marginBottom:12}}>Splits</div>
          <div style={{display:"flex",flexDirection:"column",gap:0}}>
            {laps.map((lap,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:i<laps.length-1?`1px solid ${T.div}`:"none"}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:T.card2,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontSize:11,fontWeight:700,color:T.sub,fontFamily:F}}>{i+1}</span>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:700,color:P,fontFamily:F}}>{fPace(lap.average_speed)}/km</div>
                  <div style={{fontSize:11,color:T.sub,fontFamily:F,marginTop:1}}>{(lap.distance/1000).toFixed(2)}km</div>
                </div>
                {lap.average_heartrate&&<div style={{fontSize:12,color:R,fontFamily:F}}>{Math.round(lap.average_heartrate)} bpm</div>}
              </div>
            ))}
          </div>
        </Card>
      )}
      {act.best_efforts?.length>0&&(
        <Card T={T} style={{padding:18}}>
          <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:F,marginBottom:12}}>Best Efforts</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {act.best_efforts.slice(0,6).map((b,i)=>(
              <div key={i} style={{background:T.card2,borderRadius:14,padding:"12px 13px"}}>
                <div style={{fontSize:10,color:T.muted,fontFamily:F,marginBottom:4,fontWeight:500}}>{b.name}</div>
                <div style={{fontSize:15,fontWeight:700,color:P,fontFamily:F}}>{fTime(b.moving_time)}</div>
                <div style={{fontSize:11,color:T.sub,fontFamily:F,marginTop:2}}>{fPace(b.distance/b.moving_time)}/km</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function Home({activities,stats,whoopData,whoopOk,onConnectWhoop,bestEfforts,athlete,plan,onNav,T}) {
  const today=new Date();
  const hr=today.getHours();
  const greeting=hr<5?"Good night":hr<12?"Good morning":hr<18?"Good afternoon":"Good evening";
  const rec=whoopData?.recoveries?.records?.[0];
  const sleep=whoopData?.sleeps?.records?.[0];
  const cyc=whoopData?.cycles?.records?.[0];
  const recScore=Math.round(rec?.score?.recovery_score||0);
  const recColor=recScore>=67?G:recScore>=34?O:R;
  const hrv=Math.round(rec?.score?.hrv_rmssd_milli||0);
  const rhr=Math.round(rec?.score?.resting_heart_rate||0);
  const sleepScore=Math.round(sleep?.score?.sleep_performance_percentage||0);
  const sleepH=sleep?.score?.stage_summary?.total_in_bed_time_milli?(sleep.score.stage_summary.total_in_bed_time_milli/3600000).toFixed(1):"--";
  const strain=parseFloat(cyc?.score?.strain||0).toFixed(1);
  const weekStart=new Date(today);weekStart.setDate(today.getDate()-((today.getDay()+6)%7));weekStart.setHours(0,0,0,0);
  const weekRuns=activities.filter(a=>(a.type==="Run"||a.sport_type==="Run")&&new Date(a.start_date_local)>=weekStart);
  const weekKm=weekRuns.reduce((s,r)=>s+(r.distance||0)/1000,0);
  const ytd=stats?.ytd_run_totals||{};
  const streaks=calcStreaks(activities);
  const berlin=new Date("2026-09-28"),daysLeft=Math.max(0,Math.ceil((berlin-today)/86400000));
  const blockPct=Math.min(100,Math.max(0,Math.round(((today-new Date("2026-06-22"))/(berlin-new Date("2026-06-22")))*100)));
  const dayNames=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const todaySessions=(plan?.sessions||[]).filter(s=>s.day===dayNames[today.getDay()]&&s.type!=="Rest");
  const vol=weeklyVol(activities);
  const volData=vol.slice(-8);
  const recentRuns=activities.filter(a=>(a.type==="Run"||a.sport_type==="Run")).slice(0,3);
  const PBs=[{d:"5K",t:"18:42",p:"3:44/km"},{d:"10K",t:"40:52",p:"4:05/km"},{d:"Half",t:"1:32:48",p:"4:23/km"},{d:"Marathon",t:"3:48:59",p:"5:25/km"}];

  return <div style={{display:"flex",flexDirection:"column",gap:14,paddingBottom:32}} className="page">

    {/* Greeting */}
    <div style={{padding:"4px 0 8px"}}>
      <div style={{fontSize:13,color:T.sub,fontFamily:F,marginBottom:3}}>{today.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}</div>
      <div style={{fontSize:26,fontWeight:700,color:T.text,fontFamily:F,letterSpacing:"-0.025em",lineHeight:1.15}}>{greeting}, {athlete?.firstname||"Caleb"}</div>
    </div>

    {/* Readiness hero - full card */}
    {whoopOk&&rec?(
      <Card T={T} style={{padding:0,overflow:"hidden",background:T.card}}>
        {/* Top strip */}
        <div style={{background:`linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)`,padding:"22px 20px 18px"}}>
          <Row style={{marginBottom:20}}>
            <div>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",fontFamily:F,fontWeight:500,marginBottom:3}}>Recovery</div>
              <Tag style={{background:`${recColor}25`,color:recColor,fontSize:10}}>WHOOP · just now</Tag>
            </div>
            <Ring score={recScore} size={72} strokeW={7} color={recColor} label={`${recScore}%`} sublabel={recScore>=67?"PRIMED":recScore>=34?"MODERATE":"LOW"} dark/>
          </Row>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:0}}>
            {[{l:"HRV",v:`${hrv}ms`,c:G},{l:"Resting HR",v:`${rhr}bpm`,c:R},{l:"Sleep",v:`${sleepScore}%`,c:P}].map((s,i)=>(
              <div key={i} style={{borderRight:i<2?"1px solid rgba(255,255,255,0.08)":"none",paddingRight:i<2?16:0,paddingLeft:i>0?16:0}}>
                <div style={{fontSize:10,color:"rgba(255,255,255,0.35)",fontFamily:F,marginBottom:3}}>{s.l}</div>
                <div style={{fontSize:17,fontWeight:700,color:s.c,fontFamily:F,letterSpacing:"-0.02em"}}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Bottom strip */}
        <div style={{padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontSize:13,color:T.sub,fontFamily:F}}>Daily strain</div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:80,height:4,background:T.card2,borderRadius:2,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${Math.min(parseFloat(strain)||0,21)/21*100}%`,background:O,borderRadius:2}}/>
            </div>
            <div style={{fontSize:14,fontWeight:700,color:O,fontFamily:F}}>{strain}</div>
          </div>
        </div>
      </Card>
    ):(
      !whoopOk&&<Card T={T}>
        <Row>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:F,marginBottom:2}}>Recovery</div>
            <div style={{fontSize:13,color:T.sub,fontFamily:F}}>Connect Whoop for recovery data</div>
          </div>
          <Btn onClick={onConnectWhoop} color={R} sm>Connect</Btn>
        </Row>
      </Card>
    )}

    {/* Today's sessions / Coach card */}
    <div style={{background:`linear-gradient(135deg,${P} 0%,#6366F1 100%)`,borderRadius:20,padding:20,boxShadow:`0 4px 24px ${P}35`}}>
      <Row style={{marginBottom:todaySessions.length>0?14:0}}>
        <div>
          <div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.5)",fontFamily:F,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:3}}>Today</div>
          <div style={{fontSize:17,fontWeight:700,color:"#fff",fontFamily:F,letterSpacing:"-0.02em"}}>{todaySessions.length>0?"Your sessions":"Rest day"}</div>
        </div>
        <button onClick={()=>onNav("coach")} style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:100,padding:"7px 14px",color:"#fff",fontSize:12,fontWeight:600,fontFamily:F}}>Ask Claude</button>
      </Row>
      {todaySessions.length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {todaySessions.map((s,i)=>{
            const cols={Easy:G,Interval:R,Tempo:O,"Long Run":P,Gym:T2};
            const col=cols[s.type]||P;
            return <div key={i} style={{background:"rgba(255,255,255,0.1)",borderRadius:14,padding:"12px 14px",display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:"rgba(255,255,255,0.9)",flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:600,color:"#fff",fontFamily:F}}>{s.type}</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,0.5)",fontFamily:F,marginTop:1}}>{[s.dist!=="0km"&&s.dist,s.pace!=="N/A"&&s.pace].filter(Boolean).join(" · ")}</div>
              </div>
              {s.done&&<div style={{fontSize:11,color:G,fontWeight:600,fontFamily:F}}>Done ✓</div>}
            </div>;
          })}
        </div>
      )}
      {/* Berlin block progress */}
      <div style={{marginTop:16,paddingTop:14,borderTop:"1px solid rgba(255,255,255,0.1)"}}>
        <Row style={{marginBottom:6}}>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.4)",fontFamily:F}}>Berlin block · {daysLeft} days</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.6)",fontFamily:F,fontWeight:600}}>{blockPct}%</div>
        </Row>
        <div style={{height:3,background:"rgba(255,255,255,0.12)",borderRadius:2}}>
          <div style={{width:`${blockPct}%`,height:"100%",background:"rgba(255,255,255,0.7)",borderRadius:2,transition:"width 1s"}}/>
        </div>
      </div>
    </div>

    {/* Stats row */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
      <Card T={T} onClick={()=>onNav("running")} style={{padding:16}}>
        <div style={{fontSize:11,color:T.muted,fontFamily:F,marginBottom:6,fontWeight:500}}>This week</div>
        <div style={{fontSize:28,fontWeight:800,color:P,fontFamily:F,letterSpacing:"-0.03em",lineHeight:1}}>{weekKm.toFixed(1)}<span style={{fontSize:14,fontWeight:500,color:T.sub}}>km</span></div>
        <div style={{fontSize:12,color:T.sub,fontFamily:F,marginTop:4}}>{weekRuns.length} runs</div>
        {volData.length>1&&<div style={{display:"flex",alignItems:"flex-end",gap:2,marginTop:10,height:24}}>
          {volData.map((w,i)=>{const max=Math.max(...volData.map(x=>x.km),1);return <div key={i} style={{flex:1,height:`${Math.max(4,(w.km/max)*100)}%`,background:i===volData.length-1?P:`${P}40`,borderRadius:2,transition:"height .4s ease"}}/>;})}</div>}
      </Card>
      <Card T={T} onClick={()=>onNav("running")} style={{padding:16}}>
        <div style={{fontSize:11,color:T.muted,fontFamily:F,marginBottom:6,fontWeight:500}}>YTD Distance</div>
        <div style={{fontSize:28,fontWeight:800,color:T.text,fontFamily:F,letterSpacing:"-0.03em",lineHeight:1}}>{ytd.distance?(ytd.distance/1000).toFixed(0):"450"}<span style={{fontSize:14,fontWeight:500,color:T.sub}}>km</span></div>
        <div style={{fontSize:12,color:T.sub,fontFamily:F,marginTop:4}}>{ytd.count||58} runs · {streaks.current>0?`${streaks.current}d streak`:"Start a streak"}</div>
      </Card>
    </div>

    {/* Recent activity */}
    {recentRuns.length>0&&(
      <Card T={T} noPad>
        <div style={{padding:"18px 18px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F}}>Recent runs</div>
          <button onClick={()=>onNav("running")} style={{fontSize:13,color:P,fontWeight:600,background:"transparent",border:"none",fontFamily:F}}>See all</button>
        </div>
        {recentRuns.map((r,i)=>(
          <div key={r.id} style={{padding:"12px 18px",borderTop:`1px solid ${T.div}`,display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:40,height:40,borderRadius:12,background:`${typeCol(actType(r))}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <svg viewBox="0 0 24 24" width={18} height={18} fill="none"><path d="M13 4a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" fill={typeCol(actType(r))}/><path d="M6.5 21l2.5-6 3 2 2.5-8" stroke={typeCol(actType(r))} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/><path d="M9 15L6.5 21" stroke={typeCol(actType(r))} strokeWidth={2} strokeLinecap="round"/><path d="M12.5 9l3.5-1.5 2.5 3-3.5 1.5" stroke={typeCol(actType(r))} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:F,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
              <div style={{fontSize:12,color:T.sub,fontFamily:F,marginTop:1}}>{new Date(r.start_date_local).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}</div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:15,fontWeight:700,color:P,fontFamily:F,letterSpacing:"-0.01em"}}>{(r.distance/1000).toFixed(2)}km</div>
              <div style={{fontSize:12,color:T.sub,fontFamily:F,marginTop:1}}>{fPace(r.average_speed)}/km</div>
            </div>
          </div>
        ))}
      </Card>
    )}

    {/* PBs */}
    <Card T={T} noPad>
      <div style={{padding:"18px 18px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F}}>Personal bests</div>
        <Tag color={G} style={{fontSize:10}}>Strava</Tag>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0}}>
        {PBs.map((pb,i)=>(
          <div key={i} style={{padding:"14px 18px",borderTop:`1px solid ${T.div}`,borderRight:i%2===0?`1px solid ${T.div}`:"none"}}>
            <div style={{fontSize:10,color:T.muted,fontFamily:F,fontWeight:500,marginBottom:4}}>{pb.d}</div>
            <div style={{fontSize:20,fontWeight:800,color:G,fontFamily:F,letterSpacing:"-0.03em"}}>{pb.t}</div>
            <div style={{fontSize:11,color:T.sub,fontFamily:F,marginTop:2}}>{pb.p}</div>
          </div>
        ))}
      </div>
    </Card>

    {/* Berlin target */}
    <Card T={T}>
      <Row>
        <div>
          <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:F,marginBottom:3}}>Berlin · Sub 3:20</div>
          <div style={{fontSize:12,color:T.sub,fontFamily:F}}>28 Sep 2026 · target 4:44/km</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:36,fontWeight:800,color:P,fontFamily:F,letterSpacing:"-0.04em",lineHeight:1}}>{daysLeft}</div>
          <div style={{fontSize:11,color:T.muted,fontFamily:F}}>days</div>
        </div>
      </Row>
      <div style={{marginTop:14,height:4,background:T.card2,borderRadius:2,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${blockPct}%`,background:P,borderRadius:2,transition:"width 1s"}}/>
      </div>
      <div style={{fontSize:11,color:T.muted,fontFamily:F,marginTop:6}}>Block {blockPct}% complete</div>
    </Card>

  </div>;
}

// ─── RUNNING ──────────────────────────────────────────────────────────────────
function Running({activities,stats,gear,T}) {
  const [sel,setSel]=useState(null);
  const [filter,setFilter]=useState("all"); // all, run, workout
  const runs=activities.filter(a=>a.type==="Run"||a.sport_type==="Run");
  const vol=weeklyVol(activities);
  const ytd=stats?.ytd_run_totals||{},all=stats?.all_run_totals||{};
  const warnShoes=gear.filter(s=>(s.distance||0)/1000>650);

  if(sel)return <ActivityDetail id={sel} onBack={()=>setSel(null)} T={T}/>;

  return <div style={{display:"flex",flexDirection:"column",gap:14,paddingBottom:32}} className="page">
    {warnShoes.length>0&&(
      <div style={{background:`${R}12`,borderRadius:16,padding:"12px 16px",border:`1px solid ${R}25`,display:"flex",gap:12,alignItems:"center"}}>
        <div style={{width:36,height:36,borderRadius:10,background:`${R}18`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:18}}>👟</div>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:R,fontFamily:F}}>Replace soon</div>
          <div style={{fontSize:12,color:T.sub,fontFamily:F,marginTop:1}}>{warnShoes.map(s=>s.name).join(", ")} over 650km</div>
        </div>
      </div>
    )}

    {/* Stats */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
      <Card T={T} style={{padding:16}}>
        <div style={{fontSize:11,color:T.muted,fontFamily:F,marginBottom:6,fontWeight:500}}>YTD Distance</div>
        <div style={{fontSize:28,fontWeight:800,color:P,fontFamily:F,letterSpacing:"-0.03em",lineHeight:1}}>{ytd.distance?(ytd.distance/1000).toFixed(1):"449.6"}<span style={{fontSize:14,fontWeight:500,color:T.sub}}>km</span></div>
        <div style={{fontSize:12,color:T.sub,fontFamily:F,marginTop:4}}>{ytd.count||58} runs</div>
      </Card>
      <Card T={T} style={{padding:16}}>
        <div style={{fontSize:11,color:T.muted,fontFamily:F,marginBottom:6,fontWeight:500}}>All-Time</div>
        <div style={{fontSize:28,fontWeight:800,color:T.text,fontFamily:F,letterSpacing:"-0.03em",lineHeight:1}}>{all.distance?(all.distance/1000).toFixed(0):"1093"}<span style={{fontSize:14,fontWeight:500,color:T.sub}}>km</span></div>
        <div style={{fontSize:12,color:T.sub,fontFamily:F,marginTop:4}}>{all.count||162} runs lifetime</div>
      </Card>
    </div>

    {/* Weekly volume chart */}
    <Card T={T} style={{padding:18}}>
      <div style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F,marginBottom:14}}>Weekly volume</div>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={vol} barCategoryGap="25%">
          <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={P} stopOpacity={0.9}/><stop offset="100%" stopColor={P} stopOpacity={0.3}/></linearGradient></defs>
          <XAxis dataKey="week" tick={{fontSize:10,fill:T.muted,fontFamily:F}} tickLine={false} axisLine={false} interval={2}/>
          <YAxis tick={{fontSize:10,fill:T.muted}} tickLine={false} axisLine={false} width={24} unit="k"/>
          <Tooltip content={<CT T={T}/>}/>
          <Bar dataKey="km" name="km" fill="url(#bg)" radius={[6,6,2,2]}/>
        </BarChart>
      </ResponsiveContainer>
    </Card>

    {/* Shoe mileage */}
    {gear.length>0&&(
      <Card T={T} style={{padding:18}}>
        <div style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F,marginBottom:14}}>Shoe mileage</div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {gear.map((s,i)=>{const km=(s.distance||0)/1000,pct=Math.min(100,Math.round(km/800*100)),col=pct>80?R:pct>50?O:G;return(
            <div key={i}>
              <Row style={{marginBottom:6}}>
                <div><div style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:F}}>{s.name}</div>{s.brand_name&&<div style={{fontSize:11,color:T.sub,fontFamily:F}}>{s.brand_name}</div>}</div>
                <div style={{fontSize:15,fontWeight:700,color:col,fontFamily:F}}>{km.toFixed(0)}km</div>
              </Row>
              <div style={{height:4,background:T.card2,borderRadius:2}}><div style={{width:`${pct}%`,height:"100%",background:col,borderRadius:2}}/></div>
              <div style={{fontSize:10,color:pct>80?R:T.muted,fontFamily:F,marginTop:4}}>{pct>80?"Replace soon · ":""}{pct}% of 800km limit</div>
            </div>
          );})}
        </div>
      </Card>
    )}

    {/* Activity feed - Strava style */}
    <Card T={T} noPad>
      <div style={{padding:"18px 18px 12px"}}>
        <div style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F,marginBottom:12}}>Activities</div>
        <div style={{display:"flex",gap:8}}>
          {[["all","All"],["run","Runs"],["workout","Workouts"]].map(([id,label])=>(
            <button key={id} onClick={()=>setFilter(id)} style={{borderRadius:100,padding:"5px 14px",border:`1.5px solid ${filter===id?P:T.border}`,background:filter===id?P:"transparent",color:filter===id?"#fff":T.sub,fontSize:12,fontWeight:500,fontFamily:F,transition:"all .15s"}}>{label}</button>
          ))}
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column"}}>
        {activities.filter(a=>filter==="all"||(filter==="run"&&(a.type==="Run"||a.sport_type==="Run"))||(filter==="workout"&&a.type!=="Run"&&a.sport_type!=="Run")).slice(0,25).map((r,i)=>{
          const type=actType(r),col=typeCol(type);
          return <button key={r.id} onClick={()=>setSel(r.id)} style={{padding:"14px 18px",borderTop:`1px solid ${T.div}`,display:"flex",alignItems:"center",gap:12,background:"transparent",border:"none",textAlign:"left",cursor:"pointer"}}>
            <div style={{width:44,height:44,borderRadius:13,background:`${col}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <svg viewBox="0 0 24 24" width={20} height={20} fill="none"><path d="M13 4a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" fill={col}/><path d="M6.5 21l2.5-6 3 2 2.5-8" stroke={col} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/><path d="M9 15L6.5 21" stroke={col} strokeWidth={2} strokeLinecap="round"/><path d="M12.5 9l3.5-1.5 2.5 3-3.5 1.5" stroke={col} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:F,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:2}}>{r.name}</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <Tag color={col} style={{fontSize:10,padding:"2px 8px"}}>{type}</Tag>
                <span style={{fontSize:11,color:T.sub,fontFamily:F}}>{new Date(r.start_date_local).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</span>
              </div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:15,fontWeight:700,color:P,fontFamily:F}}>{(r.distance/1000).toFixed(2)}km</div>
              <div style={{fontSize:12,color:T.sub,fontFamily:F,marginTop:1}}>{fPace(r.average_speed)}/km</div>
            </div>
          </button>;
        })}
      </div>
    </Card>
  </div>;
}

// ─── RECOVERY ─────────────────────────────────────────────────────────────────
function Recovery({whoopData,whoopOk,onConnectWhoop,onRefreshWhoop,T}) {
  if(!whoopOk)return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,padding:40,gap:24,textAlign:"center"}} className="page">
      <div style={{width:80,height:80,borderRadius:24,background:`${R}12`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:36}}>⌚</div>
      <div><div style={{fontSize:20,fontWeight:700,color:T.text,fontFamily:F,marginBottom:8}}>Connect Whoop</div><div style={{fontSize:14,color:T.sub,fontFamily:F,lineHeight:1.7,maxWidth:260}}>Live recovery scores, HRV trends, sleep stages and daily strain.</div></div>
      <Btn onClick={onConnectWhoop} color={R}>Connect Whoop</Btn>
    </div>
  );
  const recs=whoopData?.recoveries?.records||[];
  const sleeps=whoopData?.sleeps?.records||[];
  const cycles=whoopData?.cycles?.records||[];
  const latest=recs[0],latestSleep=sleeps[0];
  const recScore=Math.round(latest?.score?.recovery_score||0);
  const recColor=recScore>=67?G:recScore>=34?O:R;
  const recLabel=recScore>=67?"Primed":recScore>=34?"Moderate":"Low";
  const hrv=Math.round(latest?.score?.hrv_rmssd_milli||0);
  const rhr=Math.round(latest?.score?.resting_heart_rate||0);
  const resp=latest?.score?.respiratory_rate?.toFixed(1)||"--";
  const sleepScore=Math.round(latestSleep?.score?.sleep_performance_percentage||0);
  const sleepH=latestSleep?.score?.stage_summary?.total_in_bed_time_milli?(latestSleep.score.stage_summary.total_in_bed_time_milli/3600000).toFixed(1):"--";
  const rem=latestSleep?.score?.stage_summary?.total_rem_sleep_time_milli?Math.round(latestSleep.score.stage_summary.total_rem_sleep_time_milli/60000):"--";
  const deep=latestSleep?.score?.stage_summary?.total_slow_wave_sleep_time_milli?Math.round(latestSleep.score.stage_summary.total_slow_wave_sleep_time_milli/60000):"--";
  const hrvChart=recs.slice(0,14).reverse().map(r=>({d:new Date(r.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"}),hrv:Math.round(r.score?.hrv_rmssd_milli||0),rhr:Math.round(r.score?.resting_heart_rate||0)}));
  const recChart=recs.slice(0,14).reverse().map(r=>({d:new Date(r.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"}),score:Math.round(r.score?.recovery_score||0)}));

  return <div style={{display:"flex",flexDirection:"column",gap:14,paddingBottom:32}} className="page">
    <div style={{display:"flex",justifyContent:"flex-end"}}><Btn onClick={onRefreshWhoop} ghost color={P} sm>Refresh</Btn></div>

    {/* Hero recovery ring */}
    <Card T={T} style={{padding:0,overflow:"hidden"}}>
      <div style={{background:`linear-gradient(135deg,#0f0f1a 0%,#1a1a2e 100%)`,padding:24}}>
        <div style={{display:"flex",alignItems:"center",gap:24}}>
          <Ring score={recScore} size={100} strokeW={9} color={recColor} label={`${recScore}%`} sublabel={recLabel} dark/>
          <div style={{flex:1,display:"flex",flexDirection:"column",gap:12}}>
            {[{l:"HRV",v:`${hrv} ms`,c:G},{l:"Resting HR",v:`${rhr} bpm`,c:R},{l:"Respiratory",v:`${resp} br/min`,c:T2}].map((s,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:i<2?"1px solid rgba(255,255,255,0.06)":"none",paddingBottom:i<2?10:0}}>
                <div style={{fontSize:13,color:"rgba(255,255,255,0.4)",fontFamily:F}}>{s.l}</div>
                <div style={{fontSize:14,fontWeight:700,color:s.c,fontFamily:F}}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>

    {/* Sleep */}
    {latestSleep&&(
      <Card T={T} style={{padding:18}}>
        <Row style={{marginBottom:16}}>
          <div style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F}}>Last night</div>
          <Tag color={P} style={{fontSize:10}}>WHOOP</Tag>
        </Row>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
          {[{l:"Score",v:`${sleepScore}%`,c:P},{l:"In bed",v:`${sleepH}h`,c:C2},{l:"REM",v:`${rem}m`,c:T2},{l:"Deep",v:`${deep}m`,c:G}].map((s,i)=>(
            <div key={i} style={{background:T.card2,borderRadius:14,padding:"12px 10px",textAlign:"center"}}>
              <div style={{fontSize:9,color:T.muted,fontFamily:F,marginBottom:5,fontWeight:500}}>{s.l}</div>
              <div style={{fontSize:16,fontWeight:800,color:s.c,fontFamily:F,letterSpacing:"-0.02em"}}>{s.v}</div>
            </div>
          ))}
        </div>
      </Card>
    )}

    {/* HRV chart */}
    {hrvChart.length>2&&(
      <Card T={T} style={{padding:18}}>
        <div style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F,marginBottom:14}}>HRV and RHR — 14 days</div>
        <ResponsiveContainer width="100%" height={130}>
          <LineChart data={hrvChart}>
            <XAxis dataKey="d" tick={{fontSize:10,fill:T.muted,fontFamily:F}} tickLine={false} axisLine={false} interval={2}/>
            <YAxis tick={{fontSize:10,fill:T.muted}} tickLine={false} axisLine={false} width={26}/>
            <Tooltip content={<CT T={T}/>}/>
            <Line type="monotone" dataKey="hrv" name="HRV" stroke={G} strokeWidth={2.5} dot={false} connectNulls/>
            <Line type="monotone" dataKey="rhr" name="RHR" stroke={R} strokeWidth={2.5} dot={false} connectNulls/>
          </LineChart>
        </ResponsiveContainer>
        <div style={{display:"flex",gap:16,marginTop:8}}>
          {[{c:G,l:"HRV"},{c:R,l:"RHR"}].map((l,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:10,height:2.5,background:l.c,borderRadius:2}}/><div style={{fontSize:11,color:T.muted,fontFamily:F}}>{l.l}</div></div>)}
        </div>
      </Card>
    )}

    {/* Recovery trend */}
    {recChart.length>2&&(
      <Card T={T} style={{padding:18}}>
        <div style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F,marginBottom:14}}>Recovery score — 14 days</div>
        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={recChart} barCategoryGap="20%">
            <XAxis dataKey="d" tick={{fontSize:10,fill:T.muted,fontFamily:F}} tickLine={false} axisLine={false} interval={2}/>
            <YAxis tick={{fontSize:10,fill:T.muted}} tickLine={false} axisLine={false} domain={[0,100]} width={26}/>
            <Tooltip content={<CT T={T}/>}/>
            <Bar dataKey="score" name="Recovery" radius={[5,5,2,2]} fill={G}/>
          </BarChart>
        </ResponsiveContainer>
      </Card>
    )}

    {/* Strain history */}
    {cycles.length>0&&(
      <Card T={T} style={{padding:18}}>
        <div style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F,marginBottom:14}}>Daily strain</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {cycles.slice(0,7).map((cyc,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{fontSize:12,color:T.sub,fontFamily:F,minWidth:52}}>{new Date(cyc.start).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</div>
              <div style={{flex:1,height:4,background:T.card2,borderRadius:2,overflow:"hidden"}}><div style={{width:`${Math.min((cyc.score?.strain||0)/21*100,100)}%`,height:"100%",background:O,borderRadius:2}}/></div>
              <div style={{fontSize:13,fontWeight:700,color:O,minWidth:28,textAlign:"right",fontFamily:F}}>{cyc.score?.strain?.toFixed(1)||"--"}</div>
            </div>
          ))}
        </div>
      </Card>
    )}
  </div>;
}

// ─── PLANS ────────────────────────────────────────────────────────────────────
function Plans({onChat,externalPlan,whoopData,activities,T}) {
  const [plan,setPlan]=useState(null);
  const [planLoaded,setPlanLoaded]=useState(false);
  const [view,setView]=useState("week"); // week | calendar
  const [debrief,setDebrief]=useState(null);
  useEffect(()=>{loadTrainingPlan().then(p=>{if(p)setPlan(p);setPlanLoaded(true);}).catch(()=>setPlanLoaded(true));},[]);
  useEffect(()=>{if(externalPlan&&planLoaded){setPlan(externalPlan);saveTrainingPlan(externalPlan);}},[externalPlan,planLoaded]);
  const savePlan=p=>{setPlan(p);saveTrainingPlan(p);};
  const toggleDone=i=>{
    const s=plan.sessions[i];const nowDone=!s.done;
    savePlan({...plan,sessions:plan.sessions.map((ss,j)=>j===i?{...ss,done:nowDone}:ss)});
    if(nowDone&&s.type!=="Rest"&&s.type!=="Gym")setDebrief({...s,index:i});
  };
  const editSession=(i,u)=>savePlan({...plan,sessions:plan.sessions.map((s,j)=>j===i?{...s,...u}:s)});
  const saveDebrief=data=>{
    if(debrief)savePlan({...plan,sessions:plan.sessions.map((s,j)=>j===debrief.index?{...s,debrief:data}:s)});
    setDebrief(null);
  };
  const rec=whoopData?.recoveries?.records?.[0];
  const recScore=Math.round(rec?.score?.recovery_score||0);
  const lowRec=rec&&recScore<34;
  const done=plan?plan.sessions.filter(s=>s.done).length:0;
  const total=plan?plan.sessions.filter(s=>s.type!=="Rest").length:0;
  const COLS={Easy:G,Interval:R,Tempo:O,"Long Run":P,Gym:T2,Rest:T.muted};

  if(!plan)return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,padding:40,gap:24,textAlign:"center"}} className="page">
      <div style={{width:80,height:80,borderRadius:24,background:`${P}12`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:36}}>📋</div>
      <div>
        <div style={{fontSize:20,fontWeight:700,color:T.text,fontFamily:F,marginBottom:8}}>No plan yet</div>
        <div style={{fontSize:14,color:T.sub,fontFamily:F,lineHeight:1.7,maxWidth:260}}>Ask Claude to build your next 1 or 2 weeks. It factors in your recovery and recent load.</div>
      </div>
      <Btn onClick={onChat} color={P}>Open Coach</Btn>
    </div>
  );

  return <div style={{display:"flex",flexDirection:"column",gap:14,paddingBottom:32}} className="page">
    {lowRec&&<div style={{background:`${R}10`,borderRadius:16,padding:"14px 16px",border:`1px solid ${R}20`,display:"flex",gap:12,alignItems:"center"}}>
      <div style={{fontSize:22}}>⚠️</div>
      <div style={{flex:1}}>
        <div style={{fontSize:13,fontWeight:700,color:R,fontFamily:F,marginBottom:2}}>Recovery {recScore}% — adjust?</div>
        <div style={{fontSize:12,color:T.sub,fontFamily:F}}>Consider a lighter session today.</div>
      </div>
      <button onClick={onChat} style={{background:R,color:"#fff",border:"none",borderRadius:100,padding:"7px 14px",fontSize:12,fontWeight:600,fontFamily:F}}>Adjust</button>
    </div>}

    {/* Plan header */}
    <Card T={T} style={{padding:18}}>
      <div style={{fontSize:18,fontWeight:700,color:T.text,fontFamily:F,letterSpacing:"-0.02em",marginBottom:3}}>{plan.title}</div>
      {plan.startDate&&<div style={{fontSize:13,color:T.sub,fontFamily:F,marginBottom:14}}>Starting {new Date(plan.startDate).toLocaleDateString("en-GB",{day:"numeric",month:"long"})}</div>}
      {total>0&&<>
        <Row style={{marginBottom:8}}>
          <div style={{fontSize:13,color:T.sub,fontFamily:F}}>{done} of {total} sessions done</div>
          <div style={{fontSize:13,fontWeight:700,color:P,fontFamily:F}}>{Math.round(done/total*100)}%</div>
        </Row>
        <div style={{height:5,background:T.card2,borderRadius:3,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${Math.round(done/total*100)}%`,background:P,borderRadius:3,transition:"width .6s"}}/>
        </div>
      </>}
      <div style={{display:"flex",gap:8,marginTop:14}}>
        <button onClick={()=>setView("week")} style={{flex:1,padding:"8px 0",borderRadius:12,border:`1.5px solid ${view==="week"?P:T.border}`,background:view==="week"?P:"transparent",color:view==="week"?"#fff":T.sub,fontSize:13,fontWeight:600,fontFamily:F}}>Sessions</button>
        <button onClick={()=>setView("calendar")} style={{flex:1,padding:"8px 0",borderRadius:12,border:`1.5px solid ${view==="calendar"?P:T.border}`,background:view==="calendar"?P:"transparent",color:view==="calendar"?"#fff":T.sub,fontSize:13,fontWeight:600,fontFamily:F}}>Calendar</button>
        <button onClick={()=>savePlan(null)} style={{padding:"8px 14px",borderRadius:12,border:`1.5px solid ${T.border}`,background:"transparent",color:T.muted,fontSize:13,fontFamily:F}}>Clear</button>
      </div>
    </Card>

    {/* Sessions list */}
    {view==="week"&&(
      <Card T={T} noPad>
        {plan.sessions.map((s,i)=>{
          const col=s.done?G:(COLS[s.type]||P);
          const isRest=s.type==="Rest";
          return <PlanRow key={i} s={s} i={i} col={col} isRest={isRest} COLS={COLS} onToggle={()=>toggleDone(i)} onEdit={u=>editSession(i,u)} T={T}/>;
        })}
      </Card>
    )}

    {/* Calendar view */}
    {view==="calendar"&&<CalendarView plan={plan} activities={activities} T={T}/>}

    <div style={{background:T.card2,borderRadius:16,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div style={{fontSize:13,color:T.sub,fontFamily:F}}>Need to adjust this plan?</div>
      <Btn onClick={onChat} color={P} sm>Ask Claude</Btn>
    </div>

    {debrief&&<DebriefModal s={debrief} onSave={saveDebrief} onSkip={()=>setDebrief(null)} T={T}/>}
  </div>;
}

function PlanRow({s,i,col,isRest,COLS,onToggle,onEdit,T}) {
  const [open,setOpen]=useState(false);
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState({...s});
  if(isRest&&!editing)return(
    <div style={{padding:"12px 18px",borderBottom:`1px solid ${T.div}`,display:"flex",alignItems:"center",gap:12,opacity:0.45}}>
      <div style={{width:32,height:32,borderRadius:"50%",border:`1.5px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><div style={{width:6,height:6,borderRadius:"50%",background:T.muted}}/></div>
      <div style={{flex:1,fontSize:13,color:T.sub,fontFamily:F}}>{s.day} · Rest</div>
      <button onClick={()=>{setDraft({...s});setEditing(true);}} style={{background:"transparent",border:"none",color:T.muted,fontSize:11,fontFamily:F}}>Edit</button>
    </div>
  );
  if(editing)return(
    <div style={{padding:"16px 18px",borderBottom:`1px solid ${T.div}`}}>
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        <select value={draft.type} onChange={e=>setDraft(p=>({...p,type:e.target.value}))} style={{flex:1,background:T.card2,border:`1px solid ${T.border}`,borderRadius:10,padding:"8px 10px",fontSize:13,color:T.text,fontFamily:F,outline:"none"}}>
          {["Easy","Interval","Tempo","Long Run","Gym","Rest"].map(t=><option key={t}>{t}</option>)}
        </select>
        <input value={draft.dist||""} onChange={e=>setDraft(p=>({...p,dist:e.target.value}))} placeholder="Distance" style={{width:90,background:T.card2,border:`1px solid ${T.border}`,borderRadius:10,padding:"8px 10px",fontSize:13,color:T.text,fontFamily:F,outline:"none"}}/>
      </div>
      <input value={draft.pace||""} onChange={e=>setDraft(p=>({...p,pace:e.target.value}))} placeholder="Target pace e.g. 5:00-5:15/km" style={{width:"100%",background:T.card2,border:`1px solid ${T.border}`,borderRadius:10,padding:"8px 10px",fontSize:13,color:T.text,fontFamily:F,outline:"none",marginBottom:8}}/>
      <input value={draft.shoe||""} onChange={e=>setDraft(p=>({...p,shoe:e.target.value}))} placeholder="Shoe" style={{width:"100%",background:T.card2,border:`1px solid ${T.border}`,borderRadius:10,padding:"8px 10px",fontSize:13,color:T.text,fontFamily:F,outline:"none",marginBottom:8}}/>
      <textarea value={draft.notes||""} onChange={e=>setDraft(p=>({...p,notes:e.target.value}))} placeholder="Session notes..." rows={2} style={{width:"100%",background:T.card2,border:`1px solid ${T.border}`,borderRadius:10,padding:"8px 10px",fontSize:13,color:T.text,fontFamily:F,outline:"none",resize:"none",marginBottom:10}}/>
      <div style={{display:"flex",gap:8}}>
        <Btn onClick={()=>{onEdit(draft);setEditing(false);}} color={P} sm style={{flex:1}}>Save</Btn>
        <Btn onClick={()=>setEditing(false)} color={T.muted} sm ghost>Cancel</Btn>
      </div>
    </div>
  );
  return(
    <div style={{borderBottom:`1px solid ${T.div}`}}>
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"14px 18px"}}>
        <button onClick={onToggle} style={{width:32,height:32,borderRadius:"50%",background:s.done?G:`${col}15`,border:`2px solid ${s.done?G:col}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .15s"}}>
          {s.done?<svg viewBox="0 0 24 24" width={14} height={14} fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"/></svg>:<div style={{width:8,height:8,borderRadius:"50%",background:col}}/>}
        </button>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:3}}>
            <span style={{fontSize:14,fontWeight:600,color:s.done?G:T.text,fontFamily:F,textDecoration:s.done?"line-through":"none"}}>{s.type}</span>
            {s.dist&&s.dist!=="0km"&&<Tag color={col} style={{fontSize:10,padding:"2px 8px"}}>{s.dist}</Tag>}
            {s.pace&&s.pace!=="N/A"&&<Tag color={P} style={{fontSize:10,padding:"2px 8px"}}>{s.pace}</Tag>}
          </div>
          {s.shoe&&s.shoe!=="N/A"&&<div style={{fontSize:11,color:T2,fontFamily:F}}>👟 {s.shoe}</div>}
          {!open&&s.notes&&<div style={{fontSize:12,color:T.sub,fontFamily:F,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.notes}</div>}
        </div>
        <div style={{fontSize:11,color:T.muted,fontFamily:F,flexShrink:0}}>{s.day?.slice(0,3)}</div>
        <button onClick={()=>{setDraft({...s});setEditing(true);}} style={{background:"transparent",border:"none",color:T.muted,padding:"4px"}}>
          <svg viewBox="0 0 24 24" width={14} height={14} fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth={2} strokeLinecap="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth={2} strokeLinecap="round"/></svg>
        </button>
        <button onClick={()=>setOpen(!open)} style={{background:"transparent",border:"none",color:T.muted,padding:"4px",fontSize:12}}>{open?"▲":"▼"}</button>
      </div>
      {open&&s.notes&&<div style={{padding:"0 18px 14px 62px",fontSize:13,color:T.sub,fontFamily:F,lineHeight:1.6}}>{s.notes}</div>}
      {open&&s.debrief&&<div style={{padding:"0 18px 14px 62px",display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:20}}>{["😵","😓","😐","😊","🔥"][s.debrief.feel-1]}</span>
        <span style={{fontSize:12,color:T.sub,fontFamily:F}}>{s.debrief.notes||"No notes"}</span>
      </div>}
    </div>
  );
}

function DebriefModal({s,onSave,onSkip,T}) {
  const [feel,setFeel]=useState(3);const [notes,setNotes]=useState("");
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:999,display:"flex",alignItems:"flex-end",justifyContent:"center",padding:"0 16px 32px"}}>
      <div style={{background:T.card,borderRadius:24,padding:24,width:"100%",maxWidth:420,animation:"fadeUp .2s ease"}}>
        <div style={{fontSize:17,fontWeight:700,color:T.text,fontFamily:F,marginBottom:2}}>How did that go?</div>
        <div style={{fontSize:13,color:T.sub,fontFamily:F,marginBottom:20}}>{s.type}{s.dist&&s.dist!=="0km"?" · "+s.dist:""}</div>
        <div style={{display:"flex",justifyContent:"space-around",marginBottom:12}}>
          {[1,2,3,4,5].map(n=><button key={n} onClick={()=>setFeel(n)} style={{width:52,height:52,borderRadius:16,background:feel===n?P:T.card2,border:`2px solid ${feel===n?P:T.border}`,fontSize:24,cursor:"pointer",transition:"all .15s"}}>{["😵","😓","😐","😊","🔥"][n-1]}</button>)}
        </div>
        <div style={{fontSize:13,color:P,fontFamily:F,fontWeight:600,textAlign:"center",marginBottom:14}}>
          {["Very hard","Hard","OK","Good","Amazing"][feel-1]}
        </div>
        <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Any notes? Legs felt heavy, great session, adjusted pace..." rows={3} style={{width:"100%",background:T.card2,border:`1px solid ${T.border}`,borderRadius:14,padding:"12px 14px",fontSize:14,color:T.text,fontFamily:F,outline:"none",resize:"none",marginBottom:14}}/>
        <div style={{display:"flex",gap:10}}>
          <Btn onClick={()=>onSave({feel,notes})} color={P} full>Save</Btn>
          <Btn onClick={onSkip} ghost color={T.muted} style={{flexShrink:0}}>Skip</Btn>
        </div>
      </div>
    </div>
  );
}

function CalendarView({plan,activities,T}) {
  const [viewDate,setViewDate]=useState(new Date());
  const y=viewDate.getFullYear(),m=viewDate.getMonth();
  const firstDay=new Date(y,m,1),lastDay=new Date(y,m+1,0);
  const startPad=(firstDay.getDay()+6)%7;
  const days=[];
  for(let i=0;i<startPad;i++)days.push(null);
  for(let d=1;d<=lastDay.getDate();d++)days.push(new Date(y,m,d));
  const planByDate={};
  if(plan?.sessions){
    const start=new Date(plan.startDate||new Date());start.setHours(0,0,0,0);
    plan.sessions.forEach((s,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);planByDate[d.toISOString().split("T")[0]]=(planByDate[d.toISOString().split("T")[0]]||[]).concat(s);});
  }
  const runByDate={};
  activities.filter(a=>a.type==="Run"||a.sport_type==="Run").forEach(a=>{const k=new Date(a.start_date_local).toISOString().split("T")[0];runByDate[k]=(runByDate[k]||[]).concat(a);});
  const today=new Date().toISOString().split("T")[0];
  const [sel,setSel]=useState(null);
  const selKey=sel?.toISOString().split("T")[0];
  const COLS={Easy:G,Interval:R,Tempo:O,"Long Run":P,Gym:T2};

  return <div style={{display:"flex",flexDirection:"column",gap:12}}>
    <Card T={T} style={{padding:16}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <button onClick={()=>setViewDate(new Date(y,m-1,1))} style={{background:T.card2,border:`1px solid ${T.border}`,borderRadius:10,padding:"6px 12px",fontSize:16,color:T.text}}>‹</button>
        <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:F}}>{viewDate.toLocaleDateString("en-GB",{month:"long",year:"numeric"})}</div>
        <button onClick={()=>setViewDate(new Date(y,m+1,1))} style={{background:T.card2,border:`1px solid ${T.border}`,borderRadius:10,padding:"6px 12px",fontSize:16,color:T.text}}>›</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:6}}>
        {["M","T","W","T","F","S","S"].map((d,i)=><div key={i} style={{textAlign:"center",fontSize:10,fontWeight:600,color:T.muted,fontFamily:F,padding:"3px 0"}}>{d}</div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
        {days.map((date,i)=>{
          if(!date)return <div key={i}/>;
          const key=date.toISOString().split("T")[0];
          const isToday=key===today;const isSel=key===selKey;
          const plans=planByDate[key]||[];const runs=runByDate[key]||[];
          const hasPlanned=plans.some(s=>s.type!=="Rest");const hasRun=runs.length>0;
          const planCol=COLS[plans[0]?.type]||P;const done=plans.some(s=>s.done);
          return <button key={key} onClick={()=>setSel(isSel?null:date)}
            style={{aspectRatio:"1",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",padding:"5px 2px 2px",background:isSel?P:isToday?`${P}12`:"transparent",borderRadius:10,border:`1.5px solid ${isToday&&!isSel?P:"transparent"}`,cursor:"pointer"}}>
            <div style={{fontSize:12,fontWeight:isToday?700:400,color:isSel?"#fff":isToday?P:T.text,fontFamily:F,lineHeight:1}}>{date.getDate()}</div>
            <div style={{display:"flex",gap:2,marginTop:3}}>
              {hasPlanned&&<div style={{width:4,height:4,borderRadius:"50%",background:isSel?"rgba(255,255,255,0.8)":done?G:planCol}}/>}
              {hasRun&&<div style={{width:4,height:4,borderRadius:"50%",background:isSel?"rgba(255,255,255,0.8)":G}}/>}
            </div>
          </button>;
        })}
      </div>
    </Card>
    {sel&&(()=>{
      const key=sel.toISOString().split("T")[0];
      const plans=planByDate[key]||[];const runs=runByDate[key]||[];
      return <Card T={T} style={{padding:18}}>
        <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:F,marginBottom:12}}>{sel.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}</div>
        {plans.map((s,i)=><div key={i} style={{background:T.card2,borderRadius:12,padding:"10px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:s.done?G:(COLS[s.type]||P),flexShrink:0}}/>
          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:T.text,fontFamily:F}}>{s.type}</div>{(s.dist||s.pace)&&<div style={{fontSize:11,color:T.sub,fontFamily:F}}>{[s.dist!=="0km"&&s.dist,s.pace!=="N/A"&&s.pace].filter(Boolean).join(" · ")}</div>}</div>
          {s.done&&<Tag color={G} style={{fontSize:10}}>Done</Tag>}
        </div>)}
        {runs.map((r,i)=><div key={i} style={{background:T.card2,borderRadius:12,padding:"10px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:G,flexShrink:0}}/>
          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:T.text,fontFamily:F}}>{r.name}</div><div style={{fontSize:11,color:T.sub,fontFamily:F}}>{(r.distance/1000).toFixed(2)}km · {fPace(r.average_speed)}/km</div></div>
        </div>)}
        {plans.length===0&&runs.length===0&&<div style={{fontSize:13,color:T.muted,fontFamily:F,textAlign:"center",padding:"8px 0"}}>Rest day</div>}
      </Card>;
    })()}
  </div>;
}


// ─── NUTRITION ────────────────────────────────────────────────────────────────
function Nutrition({userPrefs,onSavePrefs,T}) {
  const today=new Date().toISOString().split("T")[0];
  const log=userPrefs?.nutrition||{};
  const todayLog=log[today]||{kcal:"",protein:"",carbs:"",fat:"",meals:[]};
  const [entry,setEntry]=useState(todayLog);
  const [tab,setTab]=useState("today");
  const [aiInput,setAiInput]=useState("");
  const [aiLoading,setAiLoading]=useState(false);
  const [aiImage,setAiImage]=useState(null);
  const [aiPreview,setAiPreview]=useState(null);
  const fileRef=useRef(null);

  const save=(e)=>{const updated=e||entry;onSavePrefs({...userPrefs,nutrition:{...log,[today]:updated}});};

  const handleImg=ev=>{const f=ev.target.files[0];if(!f)return;const r=new FileReader();r.onload=e=>{setAiImage(e.target.result.split(",")[1]);setAiPreview(e.target.result);};r.readAsDataURL(f);};

  const analyse=async()=>{
    if(!aiInput.trim()&&!aiImage)return;
    setAiLoading(true);
    try{
      const content=[];
      if(aiImage)content.push({type:"image",source:{type:"base64",media_type:"image/jpeg",data:aiImage}});
      content.push({type:"text",text:`Analyse this food${aiImage?" shown in the image":""}${aiInput?": "+aiInput:""}. Return ONLY JSON: {"name":"meal name","kcal":number,"protein":number,"carbs":number,"fat":number}. Be accurate for UK portion sizes. No markdown, no explanation.`});
      const res=await fetch("/.netlify/functions/claude-chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:"You are a nutrition expert. Return only valid JSON with no markdown.",messages:[{role:"user",content}]})});
      const data=await res.json();
      const text=data.content?.[0]?.text||"{}";
      const parsed=JSON.parse(text.replace(/```json|```/g,"").trim());
      const meal={...parsed,time:new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}),image:aiPreview};
      const newEntry={
        ...entry,
        kcal:String(Math.round((parseFloat(entry.kcal)||0)+parsed.kcal)),
        protein:String(Math.round((parseFloat(entry.protein)||0)+parsed.protein)),
        carbs:String(Math.round((parseFloat(entry.carbs)||0)+parsed.carbs)),
        fat:String(Math.round((parseFloat(entry.fat)||0)+parsed.fat)),
        meals:[...(entry.meals||[]),meal],
      };
      setEntry(newEntry);save(newEntry);
      setAiInput("");setAiImage(null);setAiPreview(null);
    }catch(e){console.error(e);}
    setAiLoading(false);
  };

  const removeMeal=i=>{
    const meals=(entry.meals||[]).filter((_,j)=>j!==i);
    const newEntry={...entry,kcal:String(meals.reduce((s,m)=>s+(m.kcal||0),0)),protein:String(meals.reduce((s,m)=>s+(m.protein||0),0)),carbs:String(meals.reduce((s,m)=>s+(m.carbs||0),0)),fat:String(meals.reduce((s,m)=>s+(m.fat||0),0)),meals};
    setEntry(newEntry);save(newEntry);
  };

  const targets={kcal:3000,protein:140,carbs:300,fat:80};
  const macros=[{k:"kcal",l:"Calories",c:P,unit:"kcal",t:targets.kcal},{k:"protein",l:"Protein",c:R,unit:"g",t:targets.protein},{k:"carbs",l:"Carbs",c:C2,unit:"g",t:targets.carbs},{k:"fat",l:"Fat",c:O,unit:"g",t:targets.fat}];
  const history=Object.entries(log).sort(([a],[b])=>b.localeCompare(a)).slice(0,14);

  return <div style={{display:"flex",flexDirection:"column",gap:14,paddingBottom:32}} className="page">
    {/* Tabs */}
    <div style={{display:"flex",gap:0,background:T.card2,borderRadius:14,padding:4}}>
      {[["today","Today"],["history","History"],["targets","Targets"]].map(([id,l])=>(
        <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"9px 0",borderRadius:10,border:"none",fontFamily:F,fontSize:13,fontWeight:tab===id?700:400,color:tab===id?P:T.sub,background:tab===id?T.card:"transparent",transition:"all .15s",boxShadow:tab===id?T.sh:"none"}}>{l}</button>
      ))}
    </div>

    {tab==="today"&&<>
      {/* Macro overview */}
      <Card T={T} style={{padding:18}}>
        <div style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F,marginBottom:3}}>{new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}</div>
        <div style={{fontSize:13,color:T.sub,fontFamily:F,marginBottom:18}}>
          {parseFloat(entry.kcal)||0} / {targets.kcal} kcal logged
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:16}}>
          {macros.map(m=>{
            const v=parseFloat(entry[m.k])||0,pct=Math.min(100,Math.round(v/m.t*100));
            const sz=58,sw=5,r=(sz-sw)/2,ci=2*Math.PI*r,da=(pct/100)*ci;
            return <div key={m.k} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
              <div style={{position:"relative",width:sz,height:sz}}>
                <svg width={sz} height={sz} style={{transform:"rotate(-90deg)"}}>
                  <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke={`${m.c}18`} strokeWidth={sw}/>
                  <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke={m.c} strokeWidth={sw} strokeDasharray={`${da} ${ci}`} strokeLinecap="round" style={{transition:"stroke-dasharray .5s"}}/>
                </svg>
                <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <div style={{fontSize:10,fontWeight:700,color:m.c,fontFamily:F}}>{v>0?v:"—"}</div>
                </div>
              </div>
              <div style={{fontSize:9,color:T.muted,fontFamily:F,textAlign:"center",lineHeight:1.2,fontWeight:500}}>{m.l}</div>
            </div>;
          })}
        </div>

        {/* AI food logger - hero element */}
        <div style={{background:`linear-gradient(135deg,${P}08 0%,${P}04 100%)`,borderRadius:16,padding:16,border:`1px solid ${P}15`,marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <div style={{width:28,height:28,borderRadius:8,background:P,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <svg viewBox="0 0 24 24" width={14} height={14} fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth={2} strokeLinecap="round"/></svg>
            </div>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:T.text,fontFamily:F}}>AI Food Logger</div>
              <div style={{fontSize:11,color:T.sub,fontFamily:F}}>Photo or describe what you ate</div>
            </div>
          </div>
          {aiPreview&&<div style={{marginBottom:10,position:"relative",display:"inline-block"}}>
            <img src={aiPreview} alt="" style={{width:72,height:72,objectFit:"cover",borderRadius:12,border:`1px solid ${T.border}`}}/>
            <button onClick={()=>{setAiImage(null);setAiPreview(null);}} style={{position:"absolute",top:-6,right:-6,width:20,height:20,borderRadius:"50%",background:R,border:"none",color:"#fff",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>×</button>
          </div>}
          <div style={{display:"flex",gap:8}}>
            <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleImg}/>
            <button onClick={()=>fileRef.current?.click()} style={{width:44,height:44,borderRadius:12,background:T.card,border:`1px solid ${T.border}`,fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>📷</button>
            <input value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&analyse()} placeholder="e.g. porridge with banana and honey..." style={{flex:1,background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"10px 14px",fontSize:13,color:T.text,fontFamily:F,outline:"none"}}/>
            <Btn onClick={analyse} color={P} sm loading={aiLoading} disabled={!aiInput.trim()&&!aiImage} style={{flexShrink:0}}>Add</Btn>
          </div>
        </div>

        {/* Meal list */}
        {(entry.meals||[]).length>0&&(
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:600,color:T.text,fontFamily:F}}>Meals · {(entry.meals||[]).reduce((s,m)=>s+(m.kcal||0),0)}kcal logged</div>
            {(entry.meals||[]).map((meal,i)=>(
              <div key={i} style={{display:"flex",gap:10,alignItems:"center",background:T.card2,borderRadius:14,padding:"11px 13px"}}>
                {meal.image&&<img src={meal.image} alt="" style={{width:44,height:44,borderRadius:10,objectFit:"cover",flexShrink:0}}/>}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:T.text,fontFamily:F,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{meal.name}</div>
                  <div style={{fontSize:11,color:T.sub,fontFamily:F,marginTop:1}}>{meal.time} · {meal.kcal}kcal · {meal.protein}g P · {meal.carbs}g C · {meal.fat}g F</div>
                </div>
                <button onClick={()=>removeMeal(i)} style={{background:"transparent",border:"none",color:T.muted,fontSize:18,lineHeight:1,flexShrink:0}}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* Manual entry collapse */}
        <details>
          <summary style={{fontSize:12,color:T.muted,fontFamily:F,cursor:"pointer",userSelect:"none",marginBottom:8}}>Edit totals manually</summary>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8}}>
            {macros.map(m=>(
              <div key={m.k}>
                <div style={{fontSize:10,color:T.muted,fontFamily:F,marginBottom:4,fontWeight:500}}>{m.l} ({m.unit})</div>
                <input type="number" value={entry[m.k]} onChange={e=>{const n={...entry,[m.k]:e.target.value};setEntry(n);}} onBlur={()=>save()} style={{width:"100%",background:T.card2,border:`1px solid ${T.border}`,borderRadius:10,padding:"8px 10px",fontSize:15,fontWeight:700,color:m.c,fontFamily:F,outline:"none"}}/>
              </div>
            ))}
          </div>
        </details>
      </Card>

      {/* Weight */}
      <Card T={T} style={{padding:18}}>
        <Row>
          <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:F}}>Weight</div>
          <div style={{fontSize:12,color:T.sub,fontFamily:F}}>Target 65kg</div>
        </Row>
        <div style={{display:"flex",gap:10,alignItems:"center",marginTop:12}}>
          <input type="number" step="0.1" placeholder="e.g. 60.5" style={{flex:1,background:T.card2,border:`1px solid ${T.border}`,borderRadius:12,padding:"11px 14px",color:T.text,fontSize:18,fontWeight:700,fontFamily:F,outline:"none"}}
            onBlur={e=>{const w=parseFloat(e.target.value);if(!w)return;const wl=userPrefs?.weightLog||[];onSavePrefs({...userPrefs,weightLog:[...wl.filter(l=>l.date!==today),{date:today,weight:w}].slice(-60)});e.target.value="";}}/>
          <div style={{fontSize:14,color:T.sub,fontFamily:F}}>kg</div>
        </div>
      </Card>
    </>}

    {tab==="history"&&(
      <Card T={T} style={{padding:18}}>
        <div style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F,marginBottom:14}}>Food history</div>
        {history.length===0?<div style={{fontSize:13,color:T.muted,fontFamily:F,textAlign:"center",padding:"32px 0"}}>No meals logged yet</div>:(
          history.map(([date,e])=>(
            <div key={date} style={{padding:"13px 0",borderBottom:`1px solid ${T.div}`}}>
              <Row style={{marginBottom:5}}>
                <div style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:F}}>{new Date(date).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"short"})}</div>
                <div style={{fontSize:15,fontWeight:700,color:P,fontFamily:F}}>{e.kcal||0}kcal</div>
              </Row>
              <div style={{display:"flex",gap:12}}>
                <span style={{fontSize:12,color:R,fontFamily:F}}>{e.protein||0}g P</span>
                <span style={{fontSize:12,color:C2,fontFamily:F}}>{e.carbs||0}g C</span>
                <span style={{fontSize:12,color:O,fontFamily:F}}>{e.fat||0}g F</span>
              </div>
              {e.meals?.length>0&&<div style={{fontSize:11,color:T.muted,fontFamily:F,marginTop:3}}>{e.meals.map(m=>m.name).join(" · ")}</div>}
            </div>
          ))
        )}
      </Card>
    )}

    {tab==="targets"&&(
      <Card T={T} style={{padding:18}}>
        <div style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F,marginBottom:14}}>Daily targets</div>
        {[{l:"Calories",v:"2,800–3,200 kcal",c:P,note:"Higher on long run days"},{l:"Protein",v:"130–150g",c:R,note:"~2.2g per kg bodyweight"},{l:"Carbs",v:"250–350g",c:C2,note:"Front-load around training"},{l:"Fat",v:"70–90g",c:O,note:"Healthy fats where possible"},{l:"Race fuelling",v:"SiS Beta Fuel every 30 min",c:G,note:"Start from km 1, don't wait"},{l:"Race week",v:"3,500–4,000 kcal",c:T2,note:"Carb-load from 2 days before"}].map((t,i,a)=>(
          <div key={i} style={{padding:"13px 0",borderBottom:i<a.length-1?`1px solid ${T.div}`:"none"}}>
            <Row style={{marginBottom:3}}><div style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:F}}>{t.l}</div><div style={{fontSize:14,fontWeight:700,color:t.c,fontFamily:F}}>{t.v}</div></Row>
            <div style={{fontSize:11,color:T.muted,fontFamily:F}}>{t.note}</div>
          </div>
        ))}
      </Card>
    )}
  </div>;
}

// ─── COACH ────────────────────────────────────────────────────────────────────
function Coach({activities,stats,whoopData,whoopOk,corosData,onPlanSaved,onGymSaved,userPrefs,T}) {
  const [messages,setMessages]=useState([{role:"assistant",content:"Hey Caleb. I have your Strava, Whoop, nutrition and plan all loaded. What do you need?"}]);
  const [loaded,setLoaded]=useState(false);
  const [input,setInput]=useState("");
  const [sending,setSending]=useState(false);
  const [images,setImages]=useState([]);
  const bottomRef=useRef(null);
  const fileRef=useRef(null);
  useEffect(()=>{loadChatHistory().then(m=>{if(m?.length>0)setMessages(m);setLoaded(true);}).catch(()=>setLoaded(true));},[]);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[messages]);
  useEffect(()=>{if(loaded)saveChatHistory(messages);},[messages,loaded]);

  const handleFiles=e=>{Array.from(e.target.files).forEach(f=>{const r=new FileReader();r.onload=ev=>setImages(p=>[...p,{base64:ev.target.result.split(",")[1],type:f.type,preview:ev.target.result}].slice(0,4));r.readAsDataURL(f);});};

  const extractPlan=text=>{
    if(!text.includes("PLAN_START")||!text.includes("PLAN_END"))return null;
    try{
      const section=text.split("PLAN_START")[1].split("PLAN_END")[0].trim();
      const lines=section.split("\n").map(l=>l.trim()).filter(Boolean);
      let title="Training Plan";const sessions=[];
      for(const line of lines){
        if(line.startsWith("TITLE:")){title=line.replace("TITLE:","").trim();continue;}
        const parts=line.split("|").map(p=>p.trim());
        if(parts.length>=4)sessions.push({day:parts[0],type:parts[1],dist:parts[2],pace:parts[3],shoe:parts[4]||"",notes:parts[5]||""});
      }
      if(sessions.length>=3){
        const start=new Date();start.setHours(0,0,0,0);
        sessions.forEach((s,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);s.date=d.toISOString().split("T")[0];});
        return{title,startDate:new Date().toISOString().split("T")[0],sessions};
      }
    }catch{}return null;
  };

  const extractGym=text=>{
    if(!text.includes("GYM_START")||!text.includes("GYM_END"))return null;
    try{
      const section=text.split("GYM_START")[1].split("GYM_END")[0].trim();
      const lines=section.split("\n").map(l=>l.trim()).filter(Boolean);
      let title="Gym Session";const exercises=[];
      for(const line of lines){
        if(line.startsWith("TITLE:")){title=line.replace("TITLE:","").trim();continue;}
        const parts=line.split("|").map(p=>p.trim());
        if(parts.length>=3){const m=parts[1].match(/(\d+)[xX](\d+)/);exercises.push({name:parts[0],sets:m?parseInt(m[1]):3,reps:m?parseInt(m[2]):10,weight:parts[2],notes:parts[3]||""});}
      }
      return exercises.length>0?{title,exercises,date:new Date().toISOString().split("T")[0]}:null;
    }catch{}return null;
  };

  const cleanReply=text=>{
    let out=text;
    if(out.includes("PLAN_START")&&out.includes("PLAN_END")){const b=out.split("PLAN_START")[0].trim();const a=out.split("PLAN_END")[1]?.trim()||"";out=(b+(a?"\n\n"+a:"")).trim();}
    if(out.includes("GYM_START")&&out.includes("GYM_END")){const b=out.split("GYM_START")[0].trim();const a=out.split("GYM_END")[1]?.trim()||"";out=(b+(a?"\n\n"+a:"")).trim();}
    return out;
  };

  const buildContext=()=>{
    const runs=activities.filter(a=>a.type==="Run").slice(0,5),ytd=stats?.ytd_run_totals||{};
    const rec=whoopData?.recoveries?.records?.[0],sleep=whoopData?.sleeps?.records?.[0];
    const recScore=rec?Math.round(rec.score?.recovery_score||0):null;
    const sleepScore=sleep?Math.round(sleep.score?.sleep_performance_percentage||0):null;
    const recentRecs=(whoopData?.recoveries?.records||[]).slice(0,7).map(r=>`${new Date(r.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}: ${Math.round(r.score?.recovery_score||0)}% recovery, HRV ${Math.round(r.score?.hrv_rmssd_milli||0)}ms, RHR ${Math.round(r.score?.resting_heart_rate||0)}bpm`).join("\n");
    const recentNutrition=Object.entries(userPrefs?.nutrition||{}).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,7).map(([date,e])=>`${new Date(date).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}: ${[e.kcal&&e.kcal+"kcal",e.protein&&e.protein+"g P",e.carbs&&e.carbs+"g C"].filter(Boolean).join(", ")}`).join("\n");
    const planSummary=userPrefs?.currentPlan?.sessions?.map((s,i)=>{const d=new Date(userPrefs.currentPlan.startDate||new Date());d.setDate(d.getDate()+i);return `${d.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}: ${s.type}${s.dist&&s.dist!=="0km"?" "+s.dist:""}${s.pace&&s.pace!=="N/A"?" at "+s.pace:""}${s.done?" (DONE)":""}`;}).join("\n")||"No active plan";

    return `You are a personal running coach and training assistant for Caleb Cunningham. Be direct, warm and specific. Write in plain flowing sentences. Never use double dashes, markdown headers, or bullet lists. Never plan more than 2 weeks at a time.

TODAY: ${new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})} at ${new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})} UK time. Use this exact date for all planning.

CALEB: 20 years old, graphic design student at Kingston University London. Started running July 2024. VO2 Max 67, threshold 3:57/km, max HR 208bpm. Weight 58-61kg targeting 65kg. PBs: 5K 18:42, 10K 40:52, HM 1:32:48, Marathon 3:48:59 (London Apr 2026). Goal races: Berlin 28 Sep 2026 Sub 3:20, Seville Feb 2027 Sub 3:00, then Valencia, Tokyo, Chicago, New York. Running all 6 World Marathon Majors for charity. Brother Noah has Duchenne Muscular Dystrophy.

KEY COACHING CONTEXT: His cardiovascular fitness is ahead of his structural and muscular fitness. The Berlin block is about closing that gap. Priority is completing the 25-30km long runs he never hit in his London build. Recovery-aware planning is essential.

TODAY'S RECOVERY: ${recScore!==null?recScore+"%":"unknown"}${sleepScore!==null?", sleep "+sleepScore+"%":""}${recScore!==null&&recScore<34?" LOW RECOVERY - rest or easy only today.":""}

RECENT WHOOP (7 days):
${recentRecs||"Not connected"}

STRAVA: YTD ${ytd.distance?(ytd.distance/1000).toFixed(1):"450"}km, ${ytd.count||58} runs.
RECENT RUNS:
${runs.map(r=>`- ${r.name} (${new Date(r.start_date_local).toLocaleDateString("en-GB")}): ${(r.distance/1000).toFixed(2)}km at ${fPace(r.average_speed)}/km${r.average_heartrate?" "+Math.round(r.average_heartrate)+"bpm":""}`).join("\n")}

NUTRITION (last 7 days):
${recentNutrition||"None logged"}

CURRENT PLAN:
${planSummary}

SHOES: Metaspeed Sky Tokyo Green (race), Red (carbon trainer), Vaporfly 3&4 (intervals), ZoomFly 5 (training), Novablast 5 with Superfeet (easy/long), Adidas Evo SL (daily/tempo).
GYM: Chest focus. Smith flat bench 20kg/side 3x10, incline 15kg/side 3x10, pec deck 73kg 3x12, preacher curl 39kg 3x10, hammer curl 16kg 3x12, lateral raises 8-10kg 3x15.

PLAN FORMAT - use exactly when asked for a plan:
PLAN_START
TITLE: [title]
[Day] | [Type] | [Xkm] | [pace]/km | [Shoe] | [description]
(7 or 14 lines, one per day, rest days as: Mon | Rest | 0km | N/A | N/A | Rest)
PLAN_END

GYM FORMAT:
GYM_START
TITLE: [title]
[Exercise] | [S]x[R] | [Weight] | [Notes]
GYM_END`;
  };

  const send=async()=>{
    if((!input.trim()&&!images.length)||sending)return;
    const content=[];
    images.forEach(img=>content.push({type:"image",source:{type:"base64",media_type:img.type,data:img.base64}}));
    if(input.trim())content.push({type:"text",text:input.trim()});
    const userMsg={role:"user",content:images.length?content:input.trim()};
    const display={role:"user",content:input.trim()||(images.length?`${images.length} image${images.length>1?"s":""}`:""),previews:images.map(i=>i.preview)};
    setMessages(p=>[...p,display]);setInput("");setImages([]);setSending(true);
    try{
      const apiMsgs=[...messages,userMsg].map(m=>({role:m.role,content:m.content}));
      const res=await fetch("/.netlify/functions/claude-chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:buildContext(),messages:apiMsgs})});
      const data=await res.json();
      const reply=data.content?.[0]?.text||"Something went wrong.";
      const plan=extractPlan(reply),gym=extractGym(reply),cleaned=cleanReply(reply);
      const suffix=(plan?"\n\nPlan saved to your Plans tab.":"")+(gym?"\n\nWorkout saved to your Gym tab.":"");
      setMessages(p=>[...p,{role:"assistant",content:cleaned+suffix}]);
      if(plan){onPlanSaved(plan);if(userPrefs)userPrefs.currentPlan=plan;}
      if(gym)onGymSaved(gym);
    }catch{setMessages(p=>[...p,{role:"assistant",content:"Something went wrong. Try again."}]);}
    setSending(false);
  };

  const SUGGESTIONS=["How is my recovery today?","Build my next training week","Give me a gym session","Am I on track for Sub 3:20 Berlin?","Analyse my recent runs"];

  return <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
    {/* Header */}
    <div style={{flexShrink:0,marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
        <div style={{width:40,height:40,borderRadius:13,background:P,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`0 4px 12px ${P}40`}}>
          <svg viewBox="0 0 24 24" width={20} height={20} fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth={2} strokeLinecap="round"/></svg>
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:F}}>Coach Claude</div>
          <div style={{fontSize:12,color:G,fontFamily:F}}>● Online · adapts to your data</div>
        </div>
        <button onClick={()=>{const f=[{role:"assistant",content:"Hey Caleb. I have your Strava, Whoop, nutrition and plan all loaded. What do you need?"}];setMessages(f);saveChatHistory(f);}} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.muted,borderRadius:100,padding:"5px 12px",fontSize:11,fontFamily:F}}>Clear</button>
      </div>
      {messages.length<=1&&(
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {SUGGESTIONS.map(s=><button key={s} onClick={()=>setInput(s)} style={{background:`${P}10`,border:`1px solid ${P}20`,color:P,borderRadius:100,padding:"6px 14px",fontSize:12,fontWeight:500,fontFamily:F,whiteSpace:"nowrap"}}>{s}</button>)}
        </div>
      )}
    </div>

    {/* Messages */}
    <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:10,paddingBottom:12}}>
      {messages.map((m,i)=>(
        <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
          <div style={{maxWidth:"84%",padding:"12px 16px",borderRadius:20,background:m.role==="user"?P:T.card,color:m.role==="user"?"#fff":T.text,border:m.role==="assistant"?`1px solid ${T.border}`:"none",fontSize:14,lineHeight:1.65,fontFamily:F,whiteSpace:"pre-wrap",borderBottomRightRadius:m.role==="user"?6:20,borderBottomLeftRadius:m.role==="assistant"?6:20,boxShadow:m.role==="user"?`0 2px 16px ${P}40`:T.sh}}>
            {m.previews?.length>0&&<div style={{display:"flex",gap:6,marginBottom:8}}>{m.previews.map((p,j)=><img key={j} src={p} alt="" style={{width:56,height:56,borderRadius:10,objectFit:"cover"}}/>)}</div>}
            {m.content}
          </div>
        </div>
      ))}
      {sending&&<div style={{display:"flex"}}><div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:20,borderBottomLeftRadius:6,padding:"14px 18px",display:"flex",gap:6,alignItems:"center"}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:T.muted,animation:`pulse .9s ${i*.2}s infinite`}}/>)}</div></div>}
      <div ref={bottomRef}/>
    </div>

    {/* Image preview */}
    {images.length>0&&<div style={{display:"flex",gap:8,marginBottom:8,flexShrink:0}}>
      {images.map((img,i)=><div key={i} style={{position:"relative"}}>
        <img src={img.preview} alt="" style={{width:52,height:52,borderRadius:10,objectFit:"cover",border:`1px solid ${T.border}`}}/>
        <button onClick={()=>setImages(p=>p.filter((_,j)=>j!==i))} style={{position:"absolute",top:-5,right:-5,width:18,height:18,borderRadius:"50%",background:R,border:"none",color:"#fff",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
      </div>)}
    </div>}

    {/* Input */}
    <div style={{flexShrink:0,display:"flex",gap:8,paddingTop:10,borderTop:`1px solid ${T.div}`,alignItems:"flex-end"}}>
      <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={handleFiles}/>
      <button onClick={()=>fileRef.current?.click()} style={{width:44,height:44,borderRadius:13,background:T.card2,border:`1px solid ${T.border}`,fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>📷</button>
      <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()} placeholder="Ask your coach..." style={{flex:1,background:T.card2,border:`1.5px solid ${T.border}`,borderRadius:13,padding:"11px 16px",fontSize:14,color:T.text,fontFamily:F,outline:"none"}}/>
      <Btn onClick={send} color={P} sm loading={sending} disabled={!input.trim()&&!images.length} style={{flexShrink:0,height:44,borderRadius:13}}>Send</Btn>
    </div>
  </div>;
}

// ─── PROFILE + MORE ───────────────────────────────────────────────────────────
function More({page,setPage,T,whoopOk,onConnectWhoop,corosOk,darkMode,setDarkMode,athlete,onDisconnect,onDisconnectWhoop,stats,activities,whoopData}) {
  const [section,setSection]=useState("menu");
  if(section==="profile")return <ProfileSection onBack={()=>setSection("menu")} athlete={athlete} whoopData={whoopData} stats={stats} activities={activities} whoopOk={whoopOk} corosOk={corosOk} darkMode={darkMode} setDarkMode={setDarkMode} onConnectWhoop={onConnectWhoop} onDisconnect={onDisconnect} onDisconnectWhoop={onDisconnectWhoop} T={T}/>;

  const PAGES=[
    {id:"gym",label:"Gym",sub:"Lift tracker and sessions",icon:"💪"},
    {id:"races",label:"Races & Goals",sub:"Pipeline and sponsorship",icon:"🏅"},
  ];
  return <div style={{display:"flex",flexDirection:"column",gap:14,paddingBottom:32}} className="page">
    {/* Profile card */}
    <Card T={T} onClick={()=>setSection("profile")} style={{padding:18}}>
      <div style={{display:"flex",alignItems:"center",gap:14}}>
        <div style={{width:54,height:54,borderRadius:17,background:P,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`0 4px 16px ${P}35`}}>
          <span style={{fontSize:22,fontWeight:800,color:"#fff",fontFamily:F}}>C</span>
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:17,fontWeight:700,color:T.text,fontFamily:F,letterSpacing:"-0.02em"}}>{athlete?.firstname||"Caleb"} {athlete?.lastname||"Cunningham"}</div>
          <div style={{fontSize:13,color:T.sub,fontFamily:F,marginTop:1}}>{athlete?.city||"Kingston"} · View profile</div>
        </div>
        <svg viewBox="0 0 24 24" width={16} height={16} fill="none"><path d="M9 18l6-6-6-6" stroke={T.muted} strokeWidth={2} strokeLinecap="round"/></svg>
      </div>
    </Card>

    {/* Quick links */}
    <Card T={T} noPad>
      {PAGES.map((p,i)=>(
        <button key={p.id} onClick={()=>setPage(p.id)} style={{display:"flex",alignItems:"center",gap:14,width:"100%",padding:"16px 18px",background:"transparent",border:"none",textAlign:"left",cursor:"pointer",borderBottom:i<PAGES.length-1?`1px solid ${T.div}`:"none"}}>
          <div style={{width:40,height:40,borderRadius:12,background:T.card2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{p.icon}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:F}}>{p.label}</div>
            <div style={{fontSize:12,color:T.sub,fontFamily:F,marginTop:1}}>{p.sub}</div>
          </div>
          <svg viewBox="0 0 24 24" width={14} height={14} fill="none"><path d="M9 18l6-6-6-6" stroke={T.muted} strokeWidth={2} strokeLinecap="round"/></svg>
        </button>
      ))}
    </Card>

    {/* Connected apps */}
    <Card T={T} style={{padding:18}}>
      <Row style={{marginBottom:14}}>
        <div style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F}}>Connected apps</div>
        <Tag color={G} style={{fontSize:10}}>{[true,whoopOk,corosOk].filter(Boolean).length} synced</Tag>
      </Row>
      {[{name:"Strava",sub:"Runs & activities · synced",icon:"S",bg:"#FC4C02",ok:true},{name:"WHOOP",sub:whoopOk?"Recovery & strain · synced":"Not connected",icon:"W",bg:"#111",ok:whoopOk,action:onConnectWhoop},{name:"Coros",sub:corosOk?"GPS workouts · synced":"Not connected — coming soon",icon:"C",bg:"#2D6BE4",ok:corosOk,action:null}].map((app,i,a)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:i<a.length-1?`1px solid ${T.div}`:"none"}}>
          <div style={{width:40,height:40,borderRadius:12,background:app.bg,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:14,fontWeight:700,fontFamily:F,flexShrink:0}}>{app.icon}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:F}}>{app.name}</div>
            <div style={{fontSize:11,color:T.sub,fontFamily:F,marginTop:1}}>{app.sub}</div>
          </div>
          {app.ok?<Tag color={G} style={{fontSize:10}}>Synced</Tag>:app.action?<button onClick={app.action} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:100,padding:"5px 13px",fontSize:12,color:T.sub,fontFamily:F}}>Connect</button>:<Tag color={T.muted} style={{fontSize:10}}>Soon</Tag>}
        </div>
      ))}
    </Card>

    {/* Settings */}
    <Card T={T} noPad>
      <button onClick={()=>setDarkMode(d=>!d)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"16px 18px",background:"transparent",border:"none",cursor:"pointer",borderBottom:`1px solid ${T.div}`}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:18}}>{darkMode?"☀️":"🌙"}</span>
          <span style={{fontSize:14,color:T.text,fontFamily:F}}>{darkMode?"Light mode":"Dark mode"}</span>
        </div>
        <div style={{width:46,height:27,background:darkMode?P:T.card2,border:`1.5px solid ${darkMode?P:T.border}`,borderRadius:14,position:"relative",transition:"all .2s"}}>
          <div style={{position:"absolute",top:2,left:darkMode?20:2,width:19,height:19,background:"#fff",borderRadius:"50%",transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,0.2)"}}/>
        </div>
      </button>
      <div style={{display:"flex"}}>
        <button onClick={onDisconnect} style={{flex:1,padding:"13px 18px",background:"transparent",border:"none",borderRight:`1px solid ${T.div}`,color:T.muted,fontSize:12,fontFamily:F,cursor:"pointer",textAlign:"left"}}>Disconnect Strava</button>
        {whoopOk&&<button onClick={onDisconnectWhoop} style={{flex:1,padding:"13px 18px",background:"transparent",border:"none",color:T.muted,fontSize:12,fontFamily:F,cursor:"pointer",textAlign:"right"}}>Disconnect Whoop</button>}
      </div>
    </Card>
  </div>;
}

function ProfileSection({onBack,athlete,whoopData,stats,activities,whoopOk,corosOk,darkMode,setDarkMode,onConnectWhoop,onDisconnect,onDisconnectWhoop,T}) {
  const streaks=calcStreaks(activities);
  const ytd=stats?.ytd_run_totals||{};
  const rec=whoopData?.recoveries?.records?.[0];
  const rhr=Math.round(rec?.score?.resting_heart_rate||48);
  return <div style={{display:"flex",flexDirection:"column",gap:14,paddingBottom:32}} className="page">
    <button onClick={onBack} style={{display:"inline-flex",alignItems:"center",gap:6,background:"transparent",border:"none",color:P,fontSize:15,fontWeight:600,fontFamily:F,padding:"4px 0",alignSelf:"flex-start"}}>
      <svg viewBox="0 0 24 24" width={18} height={18} fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></svg>
      Back
    </button>
    <Card T={T} style={{padding:20}}>
      <div style={{display:"flex",gap:16,alignItems:"center",marginBottom:18}}>
        <div style={{width:64,height:64,borderRadius:20,background:P,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`0 6px 24px ${P}40`}}>
          <span style={{fontSize:28,fontWeight:800,color:"#fff",fontFamily:F}}>C</span>
        </div>
        <div>
          <div style={{fontSize:20,fontWeight:700,color:T.text,fontFamily:F,letterSpacing:"-0.02em"}}>{athlete?.firstname||"Caleb"} {athlete?.lastname||"Cunningham"}</div>
          <div style={{fontSize:13,color:T.sub,fontFamily:F,marginTop:2}}>Marathon runner · since July 2024</div>
        </div>
      </div>
      <div style={{display:"flex",borderTop:`1px solid ${T.div}`,paddingTop:16}}>
        {[{l:"VO₂ Max",v:"67"},{l:"Resting HR",v:`${rhr}`},{l:"Weight",v:"60kg"}].map((s,i)=>(
          <div key={i} style={{flex:1,textAlign:"center",borderRight:i<2?`1px solid ${T.div}`:"none"}}>
            <div style={{fontSize:22,fontWeight:800,color:T.text,fontFamily:F,letterSpacing:"-0.03em"}}>{s.v}</div>
            <div style={{fontSize:11,color:T.sub,fontFamily:F,marginTop:2}}>{s.l}</div>
          </div>
        ))}
      </div>
    </Card>
    <Card T={T} style={{padding:18}}>
      <div style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F,marginBottom:14}}>Stats</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {[{l:"YTD Distance",v:ytd.distance?`${(ytd.distance/1000).toFixed(0)}km`:"450km",c:P},{l:"YTD Runs",v:String(ytd.count||58),c:T.text},{l:"Best 5K",v:"18:42",c:G},{l:"Best Marathon",v:"3:48:59",c:G},{l:"Streak",v:`${streaks.current}d`,c:streaks.current>2?O:T.sub},{l:"All-time",v:"1,093km",c:T.text}].map((s,i)=>(
          <div key={i} style={{background:T.card2,borderRadius:14,padding:"12px 14px"}}>
            <div style={{fontSize:10,color:T.muted,fontFamily:F,fontWeight:500,marginBottom:4}}>{s.l}</div>
            <div style={{fontSize:20,fontWeight:800,color:s.c,fontFamily:F,letterSpacing:"-0.02em"}}>{s.v}</div>
          </div>
        ))}
      </div>
    </Card>
  </div>;
}

// ─── GYM ──────────────────────────────────────────────────────────────────────
function Gym({activities,userPrefs,onSavePrefs,savedWorkout,T}) {
  const [editing,setEditing]=useState(false);
  const lifts=userPrefs?.lifts||DEFAULT_LIFTS;
  const [editLifts,setEditLifts]=useState(lifts);
  const [workout,setWorkout]=useState(savedWorkout);
  useEffect(()=>{if(savedWorkout)setWorkout(savedWorkout);},[savedWorkout]);
  const sessions=activities.filter(a=>a.type==="WeightTraining"||(a.name||"").toLowerCase().includes("gym")||(a.name||"").toLowerCase().includes("weight"));
  const save=()=>{onSavePrefs({...userPrefs,lifts:editLifts});setEditing(false);};
  return <div style={{display:"flex",flexDirection:"column",gap:14,paddingBottom:32}} className="page">
    {workout&&<Card T={T} style={{padding:18,border:`1.5px solid ${P}25`}}>
      <Row style={{marginBottom:14}}>
        <div><div style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F}}>{workout.title}</div><div style={{fontSize:12,color:T.sub,fontFamily:F,marginTop:2}}>Generated by Claude</div></div>
        <button onClick={()=>setWorkout(null)} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:100,padding:"5px 12px",fontSize:12,color:T.muted,fontFamily:F}}>Clear</button>
      </Row>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {workout.exercises.map((ex,i)=>(
          <div key={i} style={{background:T.card2,borderRadius:14,padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:F}}>{ex.name}</div>{ex.notes&&<div style={{fontSize:12,color:T.sub,fontFamily:F,marginTop:1}}>{ex.notes}</div>}</div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:14,fontWeight:700,color:P,fontFamily:F}}>{ex.sets}×{ex.reps}</div>
              <div style={{fontSize:12,color:T.sub,fontFamily:F}}>{ex.weight}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>}
    <Card T={T} style={{padding:18}}>
      <Row style={{marginBottom:14}}>
        <div style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F}}>Current lifts</div>
        <button onClick={()=>{if(editing)save();else{setEditLifts(lifts);setEditing(true);}}} style={{background:editing?P:"transparent",border:`1.5px solid ${editing?P:T.border}`,color:editing?"#fff":T.sub,borderRadius:100,padding:"6px 16px",fontSize:12,fontWeight:600,fontFamily:F}}>{editing?"Save":"Edit"}</button>
      </Row>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {(editing?editLifts:lifts).map((l,i)=>(
          <div key={i} style={{background:T.card2,borderRadius:14,padding:"12px 14px",display:"flex",alignItems:"center",gap:12}}>
            {editing?<>
              <input value={l.name} onChange={e=>setEditLifts(p=>p.map((x,j)=>j===i?{...x,name:e.target.value}:x))} style={{flex:1,background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",fontSize:13,color:T.text,fontFamily:F,outline:"none"}}/>
              <input value={l.weight} onChange={e=>setEditLifts(p=>p.map((x,j)=>j===i?{...x,weight:e.target.value}:x))} style={{width:80,background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",fontSize:13,color:T.text,fontFamily:F,outline:"none"}}/>
            </>:<>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:F}}>{l.name}</div>
                <div style={{fontSize:12,color:T.sub,fontFamily:F,marginTop:1}}>{l.sets} × {l.reps} reps</div>
              </div>
              <div style={{fontSize:15,fontWeight:700,color:P,fontFamily:F}}>{l.weight}</div>
            </>}
          </div>
        ))}
      </div>
    </Card>
    {sessions.length>0&&<Card T={T} style={{padding:18}}>
      <div style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F,marginBottom:14}}>Recent sessions</div>
      <div style={{display:"flex",flexDirection:"column"}}>
        {sessions.slice(0,8).map((s,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 0",borderBottom:i<sessions.length-1?`1px solid ${T.div}`:"none"}}>
            <div><div style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:F}}>{s.name}</div><div style={{fontSize:12,color:T.sub,fontFamily:F,marginTop:1}}>{new Date(s.start_date_local).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}</div></div>
            <div style={{textAlign:"right"}}><div style={{fontSize:14,fontWeight:700,color:P,fontFamily:F}}>{fTime(s.moving_time)}</div>{s.average_heartrate&&<div style={{fontSize:12,color:R,fontFamily:F,marginTop:1}}>{Math.round(s.average_heartrate)} bpm</div>}</div>
          </div>
        ))}
      </div>
    </Card>}
  </div>;
}

// ─── RACES ────────────────────────────────────────────────────────────────────
function Races({userPrefs,onSavePrefs,T}) {
  const [editing,setEditing]=useState(false);
  const races=userPrefs?.races||DEFAULT_RACES;
  const [editRaces,setEditRaces]=useState(races);
  const save=()=>{onSavePrefs({...userPrefs,races:editRaces});setEditing(false);};
  const berlin=new Date("2026-09-28"),daysLeft=Math.max(0,Math.ceil((berlin-new Date())/86400000));
  return <div style={{display:"flex",flexDirection:"column",gap:14,paddingBottom:32}} className="page">
    <div style={{background:`linear-gradient(135deg,${P} 0%,#6366F1 100%)`,borderRadius:20,padding:20}}>
      <div style={{fontSize:12,color:"rgba(255,255,255,0.5)",fontFamily:F,marginBottom:4}}>Next race</div>
      <div style={{fontSize:24,fontWeight:800,color:"#fff",fontFamily:F,letterSpacing:"-0.03em",marginBottom:3}}>Berlin Marathon</div>
      <div style={{fontSize:14,color:"rgba(255,255,255,0.6)",fontFamily:F,marginBottom:16}}>28 September 2026 · Sub 3:20</div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
        <div>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",fontFamily:F}}>Target pace</div>
          <div style={{fontSize:18,fontWeight:700,color:"#fff",fontFamily:F}}>4:44/km</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:48,fontWeight:900,color:"#fff",fontFamily:F,letterSpacing:"-0.04em",lineHeight:1}}>{daysLeft}</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.4)",fontFamily:F}}>days to go</div>
        </div>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
      {[{l:"Completed",v:"2 / 6",s:"Both London",c:G},{l:"Raised",v:"£5k+",s:"for charity",c:P},{l:"Next goal",v:"Sub 3:00",s:"Seville Feb 2027",c:O},{l:"Majors left",v:"4 of 6",s:"Tokyo → New York",c:T2}].map((s,i)=>(
        <Card T={T} key={i} style={{padding:14}}>
          <div style={{fontSize:10,color:T.muted,fontFamily:F,fontWeight:500,marginBottom:5}}>{s.l}</div>
          <div style={{fontSize:20,fontWeight:800,color:s.c,fontFamily:F,letterSpacing:"-0.02em"}}>{s.v}</div>
          <div style={{fontSize:11,color:T.sub,fontFamily:F,marginTop:3}}>{s.s}</div>
        </Card>
      ))}
    </div>
    <Card T={T} style={{padding:18}}>
      <Row style={{marginBottom:14}}>
        <div style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F}}>Race pipeline</div>
        <button onClick={()=>{if(editing)save();else{setEditRaces(races);setEditing(true);}}} style={{background:editing?P:"transparent",border:`1.5px solid ${editing?P:T.border}`,color:editing?"#fff":T.sub,borderRadius:100,padding:"6px 16px",fontSize:12,fontWeight:600,fontFamily:F}}>{editing?"Save":"Edit"}</button>
      </Row>
      <div style={{display:"flex",flexDirection:"column"}}>
        {(editing?editRaces:races).map((r,i,a)=>(
          <div key={i} style={{padding:"13px 0",borderBottom:i<a.length-1?`1px solid ${T.div}`:"none",opacity:r.done?0.45:1}}>
            {editing?(
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <input value={r.name} onChange={e=>setEditRaces(p=>p.map((x,j)=>j===i?{...x,name:e.target.value}:x))} style={{flex:1,background:T.card2,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 10px",fontSize:13,color:T.text,fontFamily:F,outline:"none"}}/>
                <input value={r.date} onChange={e=>setEditRaces(p=>p.map((x,j)=>j===i?{...x,date:e.target.value}:x))} style={{width:110,background:T.card2,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 10px",fontSize:13,color:T.text,fontFamily:F,outline:"none"}}/>
                <input value={r.target} onChange={e=>setEditRaces(p=>p.map((x,j)=>j===i?{...x,target:e.target.value}:x))} style={{width:100,background:T.card2,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 10px",fontSize:13,color:T.text,fontFamily:F,outline:"none"}}/>
              </div>
            ):(
              <Row>
                <div>
                  <div style={{fontSize:14,fontWeight:600,color:r.done?T.muted:r.next?P:T.text,fontFamily:F}}>{r.done?"✓ ":""}{r.name}</div>
                  <div style={{fontSize:12,color:T.sub,fontFamily:F,marginTop:2}}>{r.date} · {r.charity}</div>
                </div>
                <Tag color={r.next?P:T.muted}>{r.target}</Tag>
              </Row>
            )}
          </div>
        ))}
      </div>
    </Card>
  </div>;
}

// ─── NAV ──────────────────────────────────────────────────────────────────────
const TABS=[
  {id:"home",    label:"Home",     icon:(a,c)=><svg width={22} height={22} viewBox="0 0 24 24" fill="none"><path d="M3 12L12 3l9 9" stroke={a?c:"currentColor"} strokeWidth={a?2.5:2} strokeLinecap="round" strokeLinejoin="round"/><path d="M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" stroke={a?c:"currentColor"} strokeWidth={a?2.5:2} strokeLinecap="round" strokeLinejoin="round" fill={a?`${c}15`:"none"}/></svg>},
  {id:"running", label:"Running",  icon:(a,c)=><svg width={22} height={22} viewBox="0 0 24 24" fill="none"><circle cx="14" cy="4" r="2" fill={a?c:"currentColor"}/><path d="M6.5 21l2.5-6 3 2 2.5-8" stroke={a?c:"currentColor"} strokeWidth={a?2.5:2} strokeLinecap="round" strokeLinejoin="round"/><path d="M9 15L6.5 21" stroke={a?c:"currentColor"} strokeWidth={a?2.5:2} strokeLinecap="round"/><path d="M12.5 9l3.5-1.5 2.5 3-3.5 1.5" stroke={a?c:"currentColor"} strokeWidth={a?2.5:2} strokeLinecap="round" strokeLinejoin="round"/></svg>},
  {id:"plans",   label:"Plans",    icon:(a,c)=><svg width={22} height={22} viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="3" stroke={a?c:"currentColor"} strokeWidth={a?2.5:2} fill={a?`${c}15`:"none"}/><path d="M16 2v4M8 2v4M3 10h18" stroke={a?c:"currentColor"} strokeWidth={a?2.5:2} strokeLinecap="round"/><path d="M8 14h4M8 17h6" stroke={a?c:"currentColor"} strokeWidth={a?2.5:2} strokeLinecap="round"/></svg>},
  {id:"recovery",label:"Recovery", icon:(a,c)=><svg width={22} height={22} viewBox="0 0 24 24" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke={a?c:"currentColor"} strokeWidth={a?2.5:2} strokeLinecap="round" strokeLinejoin="round"/></svg>},
  {id:"coach",   label:"Coach",    icon:(a,c)=><svg width={22} height={22} viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke={a?c:"currentColor"} strokeWidth={a?2.5:2} strokeLinecap="round" strokeLinejoin="round" fill={a?`${c}15`:"none"}/></svg>},
  {id:"nutrition",label:"Fuel",    icon:(a,c)=><svg width={22} height={22} viewBox="0 0 24 24" fill="none"><path d="M12 22C6.5 22 2 17.5 2 12S6.5 2 12 2s10 4.5 10 10-4.5 10-10 10z" stroke={a?c:"currentColor"} strokeWidth={a?2.5:2} fill={a?`${c}15`:"none"}/><path d="M8 12h8M12 8v8" stroke={a?c:"currentColor"} strokeWidth={a?2.5:2} strokeLinecap="round"/></svg>},
  {id:"more",    label:"More",     icon:(a,c)=><svg width={22} height={22} viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r={a?2:1.5} fill={a?c:"currentColor"}/><circle cx="12" cy="12" r={a?2:1.5} fill={a?c:"currentColor"}/><circle cx="19" cy="12" r={a?2:1.5} fill={a?c:"currentColor"}/></svg>},
];

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [page,setPage]=useState("home");
  const [connected,setConnected]=useState(isConnected());
  const [whoopOk,setWhoopOk]=useState(isWhoopConnected());
  const [corosOk,setCorosOk]=useState(isCorosConnected());
  const [activities,setActivities]=useState([]);
  const [stats,setStats]=useState(null);
  const [athlete,setAthlete]=useState(null);
  const [gear,setGear]=useState([]);
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
    const p=new URLSearchParams(window.location.search),code=p.get("code"),coros=p.get("coros"),whoopP=localStorage.getItem("whoop_pending");
    if(coros&&code){exchangeCorosCode(code).then(()=>setCorosOk(true)).catch(console.error).finally(()=>window.history.replaceState({},"","/"));return;}
    if(!code)return;
    if(whoopP){setWhoopPending(true);exchangeWhoopCode(code).then(()=>{setWhoopOk(true);setWhoopPending(false);}).catch(e=>{console.error(e);setWhoopPending(false);}).finally(()=>window.history.replaceState({},"","/"));}
    else if(!isConnected()){exchangeCode(code).then(()=>setConnected(true)).catch(console.error).finally(()=>window.history.replaceState({},"","/"));}
  },[]);

  useEffect(()=>{
    if(!connected)return;setLoading(true);
    Promise.all([getAthlete(),getActivities(100)]).then(([a,acts])=>{setAthlete(a);setActivities(acts);return Promise.all([getStats(a.id),getAllGear(a)]);}).then(([s,g])=>{setStats(s);setGear(g.filter(Boolean));}).catch(console.error).finally(()=>setLoading(false));
  },[connected]);

  const loadWhoop=useCallback(()=>{if(whoopOk)getWhoopData().then(setWhoopData).catch(console.error);},[whoopOk]);
  useEffect(()=>{loadWhoop();},[loadWhoop]);
  useEffect(()=>{loadUserPrefs().then(p=>{if(p){setUserPrefs(p);if(p.currentPlan)setSavedPlan(p.currentPlan);}});},[]);
  const savePrefs=useCallback(p=>{setUserPrefs(p);saveUserPrefs(p);},[]);
  const connectWhoop=()=>window.location.assign(getWhoopAuthUrl());

  if(!connected||whoopPending)return(<><style>{CSS}</style><ConnectScreen whoopPending={whoopPending} T={T}/></>);

  const recScore=whoopData?.recoveries?.records?.[0]?Math.round(whoopData.recoveries.records[0].score?.recovery_score||0):null;
  const recCol=recScore!=null?(recScore>=67?G:recScore>=34?O:R):null;
  const PAGE_TITLES={home:"Home",running:"Running",plans:"Plans",recovery:"Recovery",coach:"Coach",nutrition:"Fuel",more:"More",gym:"Gym",races:"Races"};
  const inMainTab=TABS.find(t=>t.id===page);
  const activeTab=inMainTab?page:(["gym","races"].includes(page)?"more":"home");
  const isCoachPage=page==="coach";

  const views={
    home:<Home activities={activities} stats={stats} whoopData={whoopData} whoopOk={whoopOk} onConnectWhoop={connectWhoop} athlete={athlete} plan={savedPlan} onNav={setPage} T={T}/>,
    running:<Running activities={activities} stats={stats} gear={gear} T={T}/>,
    plans:<Plans onChat={()=>setPage("coach")} externalPlan={savedPlan} whoopData={whoopData} activities={activities} T={T}/>,
    recovery:<Recovery whoopData={whoopData} whoopOk={whoopOk} onConnectWhoop={connectWhoop} onRefreshWhoop={loadWhoop} T={T}/>,
    coach:<Coach activities={activities} stats={stats} whoopData={whoopData} whoopOk={whoopOk} corosData={null} onPlanSaved={p=>{setSavedPlan(p);savePrefs({...userPrefs,currentPlan:p});}} onGymSaved={setSavedWorkout} userPrefs={userPrefs} T={T}/>,
    nutrition:<Nutrition userPrefs={userPrefs} onSavePrefs={savePrefs} T={T}/>,
    gym:<Gym activities={activities} userPrefs={userPrefs} onSavePrefs={savePrefs} savedWorkout={savedWorkout} T={T}/>,
    races:<Races userPrefs={userPrefs} onSavePrefs={savePrefs} T={T}/>,
    more:<More page={page} setPage={setPage} T={T} whoopOk={whoopOk} onConnectWhoop={connectWhoop} corosOk={corosOk} darkMode={darkMode} setDarkMode={setDarkMode} athlete={athlete} onDisconnect={()=>{disconnect();setConnected(false);setActivities([]);}} onDisconnectWhoop={()=>{disconnectWhoop();setWhoopOk(false);setWhoopData(null);}} stats={stats} activities={activities} whoopData={whoopData}/>,
  };

  return(
    <div style={{height:"100vh",background:T.bg,color:T.text,fontFamily:F,overflow:"hidden",display:"flex"}}>
      <style>{CSS}</style>
      <style>{`@media(min-width:800px){.dsk{display:flex!important}}.mobtab{display:flex}@media(min-width:800px){.mobtab{display:none!important}}`}</style>

      {/* Desktop sidebar */}
      <div className="dsk" style={{display:"none",flexDirection:"column",width:230,borderRight:`1px solid ${T.navB}`,background:T.nav,flexShrink:0,height:"100vh",overflowY:"auto"}}>
        <div style={{padding:"26px 20px 22px",display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:34,height:34,background:P,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 4px 12px ${P}40`}}>
            <svg viewBox="0 0 24 24" width={18} height={18} fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="white"/></svg>
          </div>
          <div style={{fontSize:18,fontWeight:800,color:T.text,fontFamily:F,letterSpacing:"-0.03em"}}>Apex</div>
        </div>
        <nav style={{padding:"0 10px",flex:1}}>
          {[...TABS.filter(t=>t.id!=="more"),{id:"gym",label:"Gym",icon:(a,c)=><span style={{fontSize:16}}>💪</span>},{id:"races",label:"Races",icon:(a,c)=><span style={{fontSize:16}}>🏅</span>}].map(n=>{
            const isA=page===n.id;
            return <button key={n.id} onClick={()=>setPage(n.id)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"10px 13px",background:isA?`${P}10`:"transparent",borderRadius:12,border:"none",cursor:"pointer",color:isA?P:T.sub,fontSize:14,fontWeight:isA?600:400,fontFamily:F,textAlign:"left",marginBottom:2,transition:"all .12s"}}>
              <span style={{display:"flex",color:isA?P:T.muted,flexShrink:0}}>{typeof n.icon==="function"?n.icon(isA,P):n.icon(isA,P)}</span>
              <span>{n.label}</span>
            </button>;
          })}
        </nav>
        <div style={{padding:"14px 18px 28px",borderTop:`1px solid ${T.div}`}}>
          {recScore!=null&&<div style={{background:T.card2,borderRadius:12,padding:"10px 13px",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:recCol,boxShadow:`0 0 8px ${recCol}`}}/>
            <div style={{fontSize:13,color:T.sub,fontFamily:F}}><span style={{color:recCol,fontWeight:700}}>{recScore}%</span> recovery</div>
          </div>}
          <button onClick={()=>setDarkMode(d=>!d)} style={{display:"flex",alignItems:"center",gap:8,background:T.card2,border:`1px solid ${T.border}`,borderRadius:10,padding:"8px 12px",fontSize:12,color:T.sub,fontFamily:F,width:"100%",marginBottom:8}}>
            <span>{darkMode?"☀️":"🌙"}</span><span>{darkMode?"Light":"Dark"} mode</span>
          </button>
          {whoopOk?<div style={{fontSize:12,color:G,fontWeight:600,fontFamily:F}}>✓ Whoop connected</div>:<button onClick={connectWhoop} style={{background:"transparent",border:`1px solid ${R}`,borderRadius:10,padding:"7px 12px",color:R,fontSize:12,fontWeight:600,fontFamily:F,width:"100%"}}>Connect Whoop</button>}
        </div>
      </div>

      {/* Main column */}
      <div style={{flex:1,display:"flex",flexDirection:"column",height:"100vh",overflow:"hidden",minWidth:0}}>
        {/* Top bar */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 18px 12px",flexShrink:0}}>
          <div>
            <div style={{fontSize:11,fontWeight:600,color:T.muted,fontFamily:F,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:2}}>Apex</div>
            <div style={{fontSize:22,fontWeight:700,color:T.text,fontFamily:F,letterSpacing:"-0.025em",lineHeight:1.15}}>{PAGE_TITLES[page]||"More"}</div>
          </div>
          {recScore!=null&&<div style={{display:"flex",alignItems:"center",gap:6,background:T.card,boxShadow:T.sh,borderRadius:100,padding:"6px 13px 6px 9px",border:`1px solid ${T.border}`}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:recCol,boxShadow:`0 0 6px ${recCol}`}}/>
            <span style={{fontSize:13,fontWeight:700,color:T.text,fontFamily:F}}>{recScore}%</span>
          </div>}
        </div>

        {/* Content */}
        <div style={{flex:1,overflowY:isCoachPage?"hidden":"auto",padding:"0 16px",WebkitOverflowScrolling:"touch",display:"flex",flexDirection:"column"}}>
          {loading?<Loader T={T}/>:(views[page]||views.more)}
        </div>

        {/* Tab bar */}
        <div className="mobtab" style={{flexShrink:0,padding:"8px 14px",paddingBottom:"calc(env(safe-area-inset-bottom,20px) + 8px)",background:"transparent",display:"flex"}}>
          <div style={{display:"flex",alignItems:"center",background:T.nav,borderRadius:40,boxShadow:"0 4px 28px rgba(0,0,0,0.12),0 1px 4px rgba(0,0,0,0.06)",padding:"6px 4px",width:"100%",gap:0}}>
            {TABS.map(tab=>{
              const isA=activeTab===tab.id;
              return <button key={tab.id} onClick={()=>setPage(tab.id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,background:"transparent",border:"none",padding:"7px 2px",transition:"all .1s",WebkitTapHighlightColor:"transparent"}}>
                <span style={{color:isA?P:T.muted,display:"flex",transition:"color .1s"}}>{tab.icon(isA,P)}</span>
                <span style={{fontSize:9,fontWeight:isA?700:400,color:isA?P:T.muted,fontFamily:F,letterSpacing:"0.01em"}}>{tab.label}</span>
              </button>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
