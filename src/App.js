import { useState, useEffect, useRef, useCallback } from "react";
import { AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { isConnected, disconnect, exchangeCode, getAthlete, getStats, getActivities, getActivity, getStreams, getAllGear, extractBestEfforts } from "./strava";
import { isWhoopConnected, disconnectWhoop, exchangeWhoopCode, getWhoopAuthUrl, getWhoopData } from "./whoop";
import { loadChatHistory, saveChatHistory, loadTrainingPlan, saveTrainingPlan, loadUserPrefs, saveUserPrefs } from "./supabase";
import { LIFTS as DEFAULT_LIFTS, RACES as DEFAULT_RACES, SPONSORSHIP as DEFAULT_SPONSORSHIP, fPace, fTime, fDist, actType, typeCol, recCol, weeklyVol } from "./data";

// ─── THEMES ──────────────────────────────────────────────────────────────────
const THEMES = {
  light: {
    bg:"#f2f2f7", surface:"#ffffff", surface2:"#f8f8fa", border:"rgba(0,0,0,0.07)",
    text:"#1d1d1f", sub:"#6e6e73", muted:"#aeaeb2", divider:"rgba(0,0,0,0.05)",
    navBg:"#ffffff", navBorder:"rgba(0,0,0,0.07)", inputBg:"#f2f2f7",
    heroFrom:"#1c1c1e",
  },
  dark: {
    bg:"#0a0a0f", surface:"#141418", surface2:"#1c1c22", border:"rgba(255,255,255,0.08)",
    text:"#f5f5f7", sub:"#8e8e93", muted:"#48484a", divider:"rgba(255,255,255,0.05)",
    navBg:"#141418", navBorder:"rgba(255,255,255,0.08)", inputBg:"#1c1c22",
    heroFrom:"#0a0a0f",
  }
};
const A = {
  blue:"#007AFF", blueL:"rgba(0,122,255,0.12)", coral:"#FF3B5C", coralL:"rgba(255,59,92,0.12)",
  green:"#30D158", greenL:"rgba(48,209,88,0.12)", yellow:"#FFD60A", purple:"#BF5AF2", teal:"#5AC8FA",
};
const WX_EMOJI = {0:"☀️",1:"🌤",2:"⛅",3:"☁️",45:"🌫",48:"🌫",51:"🌦",53:"🌧",55:"🌧",61:"🌧",63:"🌧",65:"🌧",71:"❄️",73:"❄️",75:"❄️",80:"🌦",81:"🌦",82:"⛈",95:"⛈",96:"⛈"};
const GLOBAL_CSS = `
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
  @keyframes fireFlicker{0%,100%{transform:scaleY(1) scaleX(1);opacity:1}25%{transform:scaleY(1.1) scaleX(0.93);opacity:0.9}50%{transform:scaleY(0.94) scaleX(1.06);opacity:1}75%{transform:scaleY(1.06) scaleX(0.96);opacity:0.95}}
  .fire{animation:fireFlicker 1.4s ease-in-out infinite;display:inline-block;transform-origin:bottom center}
  .page-enter{animation:fadeUp 0.22s ease both}
  *{-webkit-tap-highlight-color:transparent;box-sizing:border-box}
  ::-webkit-scrollbar{width:0px}
  input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none}
`;
const sans = "'Inter',-apple-system,BlinkMacSystemFont,sans-serif";

async function fetchWeather(lat,lng,dateStr) {
  try {
    const res=await fetch(`/.netlify/functions/weather?lat=${lat}&lng=${lng}&date=${dateStr}`);
    const d=await res.json();
    if(!d.hourly) return null;
    return{temp:Math.round(d.hourly.temperature_2m[9]),code:d.hourly.weathercode[9]};
  }catch{return null;}
}
function calcStreaks(activities) {
  const runs=activities.filter(a=>a.type==="Run"||a.sport_type==="Run");
  const dates=[...new Set(runs.map(r=>new Date(r.start_date_local).toISOString().split("T")[0]))].sort().reverse();
  if(!dates.length) return{current:0,longest:0};
  const today=new Date();today.setHours(0,0,0,0);
  const check=new Date(today);let current=0;
  for(const d of dates){if(d===check.toISOString().split("T")[0]){current++;check.setDate(check.getDate()-1);}else break;}
  let longest=0,streak=1;
  for(let i=1;i<dates.length;i++){const diff=(new Date(dates[i-1])-new Date(dates[i]))/86400000;if(diff===1){streak++;longest=Math.max(longest,streak);}else streak=1;}
  return{current,longest:Math.max(longest,current)};
}

// ─── PRIMITIVES ───────────────────────────────────────────────────────────────
function Card({children,style={},T}){return <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:20,padding:20,...style}}>{children}</div>;}
function Label({children,color,style={},T}){return <div style={{fontSize:11,fontWeight:600,color:color||T.muted,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:sans,...style}}>{children}</div>;}
function Sub({children,color,style={},T}){return <div style={{fontSize:12,color:color||T.sub,fontFamily:sans,marginTop:3,lineHeight:1.4,...style}}>{children}</div>;}
function Tag({children,color=A.blue}){return <span style={{fontSize:11,fontWeight:600,color,background:`${color}18`,borderRadius:20,padding:"3px 10px",letterSpacing:"0.02em",fontFamily:sans,whiteSpace:"nowrap"}}>{children}</span>;}
function Btn({children,onClick,color=A.blue,ghost=false,sm=false,full=false,style={},disabled=false}){
  return <button onClick={onClick} disabled={disabled} style={{background:ghost?"transparent":color,color:ghost?color:"#fff",border:`1.5px solid ${color}`,borderRadius:22,padding:sm?"7px 16px":"11px 24px",fontSize:sm?12:14,fontWeight:600,width:full?"100%":"auto",cursor:disabled?"not-allowed":"pointer",fontFamily:sans,opacity:disabled?0.5:1,transition:"all 0.15s ease",...style}}>{children}</button>;
}
const Row=({children,style={}})=><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",...style}}>{children}</div>;
function TxtInput({value,onChange,placeholder="",style={},type="text",T}){
  return <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{background:T.inputBg,border:`1.5px solid ${T.border}`,borderRadius:12,padding:"8px 12px",color:T.text,fontSize:13,outline:"none",fontFamily:sans,width:"100%",...style}}/>;
}
function SectionHeader({title,right,T,accent}){
  return <Row style={{marginBottom:16}}><div style={{display:"flex",alignItems:"center",gap:8}}>{accent&&<div style={{width:3,height:14,background:accent,borderRadius:2}}/>}<div style={{fontSize:14,fontWeight:700,color:T.text,fontFamily:sans,letterSpacing:"-0.01em"}}>{title}</div></div>{right&&<div>{right}</div>}</Row>;
}
function Loader({text="Loading...",T}){
  return <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,gap:16,minHeight:200}}><div style={{width:32,height:32,border:`2.5px solid ${T.border}`,borderTop:`2.5px solid ${A.blue}`,borderRadius:"50%",animation:"spin .7s linear infinite"}}/><div style={{fontSize:13,color:T.sub,fontFamily:sans}}>{text}</div></div>;
}
function EditBtn({editing,onToggle,T}){
  return <button onClick={onToggle} style={{background:editing?A.blue:"transparent",color:editing?"#fff":T.sub,border:`1.5px solid ${editing?A.blue:T.border}`,borderRadius:20,padding:"4px 14px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:sans}}>{editing?"Save":"Edit"}</button>;
}
function Tile({label,value,sub,color=A.blue,bg,size=26,T}){
  const bgColor=bg||T.surface2;
  return <div style={{background:bgColor,borderRadius:16,padding:"15px 16px"}}><Label color={T.muted} style={{marginBottom:8}} T={T}>{label}</Label><div style={{fontSize:size,fontWeight:800,color,lineHeight:1,letterSpacing:"-0.02em",fontFamily:sans}}>{value}</div>{sub&&<Sub color={T.sub} style={{marginTop:5,fontSize:11}} T={T}>{sub}</Sub>}</div>;
}
function TapTile({label,value,sub,color=A.blue,bg,size=26,T,onClick,bars}){
  const [pressed,setPressed]=useState(false);
  const bgColor=bg||T.surface2;
  // mini sparkline bars
  const maxBar=bars?Math.max(...bars,1):1;
  return (
    <div onClick={onClick} onMouseDown={()=>setPressed(true)} onMouseUp={()=>setPressed(false)} onMouseLeave={()=>setPressed(false)} onTouchStart={()=>setPressed(true)} onTouchEnd={()=>setPressed(false)}
      style={{background:bgColor,borderRadius:20,padding:"16px 16px 12px",cursor:"pointer",transform:pressed?"scale(0.96)":"scale(1)",transition:"transform 0.12s ease",WebkitTapHighlightColor:"transparent",display:"flex",flexDirection:"column",gap:0,overflow:"hidden",position:"relative",minHeight:100}}>
      {/* Subtle glow on active color */}
      <div style={{position:"absolute",top:-20,right:-20,width:80,height:80,borderRadius:"50%",background:`${color}18`,pointerEvents:"none"}}/>
      <Label color={T.muted} style={{marginBottom:6,fontSize:10}} T={T}>{label}</Label>
      <div style={{fontSize:size,fontWeight:800,color,lineHeight:1,letterSpacing:"-0.03em",fontFamily:sans}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:T.sub,fontFamily:sans,marginTop:4,letterSpacing:"-0.01em"}}>{sub}</div>}
      {bars&&bars.length>0&&(
        <div style={{display:"flex",alignItems:"flex-end",gap:3,marginTop:"auto",paddingTop:10,height:28}}>
          {bars.map((b,i)=>(
            <div key={i} style={{flex:1,height:`${Math.round((b/maxBar)*100)}%`,minHeight:2,background:`${color}${i===bars.length-1?"ff":"50"}`,borderRadius:2,transition:"height .4s ease"}}/>
          ))}
        </div>
      )}
    </div>
  );
}
const CT=({active,payload,label,T})=>{
  if(!active||!payload?.length) return null;
  return <div style={{background:T?.surface||"#fff",border:`1px solid ${T?.border||"#eee"}`,borderRadius:12,padding:"8px 12px",fontSize:12,boxShadow:"0 8px 32px rgba(0,0,0,0.12)",fontFamily:sans}}><div style={{color:T?.sub||"#666",marginBottom:4,fontSize:11}}>{label}</div>{payload.map((p,i)=><div key={i} style={{color:p.color||A.blue,fontWeight:700}}>{p.name}: {p.value}</div>)}</div>;
};
// ─── ACTIVITY RINGS ───────────────────────────────────────────────────────────
function ActivityRing({pct=0,color=A.blue,size=60,stroke=7}){
  const r=(size-stroke)/2,circ=2*Math.PI*r,dash=Math.min(1,pct/100)*circ;
  return <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={`${color}22`} strokeWidth={stroke}/><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{transition:"stroke-dasharray 1s ease"}}/></svg>;
}
function ThreeRings({weekKm=0,weekTarget=50,longRunDonePct=0,recoveryPct=0}){
  return <div style={{position:"relative",width:130,height:130,flexShrink:0}}>
    <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><ActivityRing pct={Math.min(100,weekKm/weekTarget*100)} color={A.coral} size={130} stroke={10}/></div>
    <div style={{position:"absolute",inset:12,display:"flex",alignItems:"center",justifyContent:"center"}}><ActivityRing pct={longRunDonePct} color={A.green} size={106} stroke={9}/></div>
    <div style={{position:"absolute",inset:24,display:"flex",alignItems:"center",justifyContent:"center"}}><ActivityRing pct={recoveryPct} color={A.blue} size={82} stroke={8}/></div>
    <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{textAlign:"center"}}><div style={{fontSize:13,fontWeight:800,color:"#fff",fontFamily:sans,lineHeight:1}}>{weekKm.toFixed(0)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:sans}}>km</div></div></div>
  </div>;
}
function RecoveryRing({score=0,size=100}){
  const r=(size-12)/2,circ=2*Math.PI*r;
  const col=score>=67?A.green:score>=34?A.yellow:A.coral;
  const dash=(score/100)*circ;
  return <div style={{position:"relative",width:size,height:size}}>
    <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={`${col}22`} strokeWidth={10}/><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={10} strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{transition:"stroke-dasharray .8s ease"}}/></svg>
    <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}><div style={{fontSize:22,fontWeight:800,color:col,fontFamily:sans,lineHeight:1}}>{score}%</div></div>
  </div>;
}

// ─── HERO CARD ────────────────────────────────────────────────────────────────
function HeroCard({athlete,activities,stats,whoopData,whoopOk,userPrefs,T}){
  const [todayBrief,setTodayBrief]=useState(null);
  const [briefLoading,setBriefLoading]=useState(false);
  const rec=whoopData?.recoveries?.records?.[0];
  const sleep=whoopData?.sleeps?.records?.[0];
  const berlin=new Date("2026-09-28T00:00:00");
  const today=new Date();
  const daysLeft=Math.max(0,Math.ceil((berlin-today)/86400000));
  const recoveryScore=Math.round(rec?.score?.recovery_score||0);
  const blockStart=new Date("2026-06-22T00:00:00");
  const blockPct=Math.min(100,Math.max(0,Math.round(((today-blockStart)/(berlin-blockStart))*100)));
  const weekStart=new Date(today);weekStart.setDate(today.getDate()-((today.getDay()+6)%7));weekStart.setHours(0,0,0,0);
  const weekKm=activities.filter(a=>(a.type==="Run"||a.sport_type==="Run")&&new Date(a.start_date_local)>=weekStart).reduce((s,r)=>s+(r.distance||0)/1000,0);
  const todayKey=today.toISOString().split("T")[0];
  const todayNutrition=userPrefs?.nutrition?.[todayKey]||{};
  const sleepScore=Math.round(sleep?.score?.sleep_performance_percentage||0);
  // Long run ring: did you do a run >=18km this week?
  const weekStart2=new Date();weekStart2.setDate(weekStart2.getDate()-((weekStart2.getDay()+6)%7));weekStart2.setHours(0,0,0,0);
  const longestThisWeek=Math.max(0,...activities.filter(a=>(a.type==="Run"||a.sport_type==="Run")&&new Date(a.start_date_local)>=weekStart2).map(r=>r.distance/1000));
  const longRunDonePct=Math.min(100,Math.round(longestThisWeek/25*100));
  const greeting=today.getHours()<12?"Good morning":today.getHours()<18?"Good afternoon":"Good evening";
  useEffect(()=>{
    if(!whoopOk||briefLoading||todayBrief) return;
    setBriefLoading(true);
    const runs=activities.slice(0,3);
    const prompt=`In exactly one short sentence (max 15 words), tell Caleb what to focus on today. Recovery: ${recoveryScore}%, sleep: ${sleepScore}%. Recent runs: ${runs.map(r=>`${(r.distance/1000).toFixed(1)}km`).join(", ")}. Berlin is ${daysLeft} days away. Be direct, no fluff.`;
    fetch("/.netlify/functions/claude-chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:"You are a concise running coach. One sentence only, no punctuation at the end.",messages:[{role:"user",content:prompt}]})})
      .then(r=>r.json()).then(d=>{setTodayBrief(d.content?.[0]?.text||null);}).catch(()=>{}).finally(()=>setBriefLoading(false));
  },[whoopOk,recoveryScore]);
  return <div style={{background:`linear-gradient(135deg, ${T.heroFrom} 0%, #1a1a2e 50%, #0d1b2a 100%)`,borderRadius:24,padding:"24px 24px 20px",position:"relative",overflow:"hidden"}}>
    <div style={{position:"absolute",top:-40,right:-40,width:200,height:200,borderRadius:"50%",background:"radial-gradient(circle, rgba(0,122,255,0.15) 0%, transparent 70%)",pointerEvents:"none"}}/>
    <div style={{position:"absolute",bottom:-60,left:20,width:150,height:150,borderRadius:"50%",background:"radial-gradient(circle, rgba(255,59,92,0.1) 0%, transparent 70%)",pointerEvents:"none"}}/>
    <Row style={{alignItems:"flex-start",gap:16}}>
      <div style={{flex:1}}>
        <div style={{fontSize:12,color:"rgba(255,255,255,0.5)",fontFamily:sans,marginBottom:4}}>{today.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}</div>
        <div style={{fontSize:22,fontWeight:800,color:"#fff",fontFamily:sans,letterSpacing:"-0.03em",marginBottom:2}}>{greeting}, Caleb</div>
        <div style={{fontSize:12,color:"rgba(255,255,255,0.45)",fontFamily:sans,marginBottom:16}}>{athlete?.city||"Kingston"} · Berlin in {daysLeft} days</div>
        <div style={{background:"rgba(255,255,255,0.07)",borderRadius:14,padding:"10px 14px",backdropFilter:"blur(10px)",minHeight:38}}>
          {briefLoading?<div style={{display:"flex",gap:4}}>{[0,1,2].map(i=><div key={i} style={{width:5,height:5,borderRadius:"50%",background:"rgba(255,255,255,0.4)",animation:`pulse 1s ${i*0.2}s infinite`}}/>)}</div>
          :todayBrief?<div style={{fontSize:13,color:"rgba(255,255,255,0.9)",fontFamily:sans,lineHeight:1.5,fontStyle:"italic"}}>"{todayBrief}"</div>
          :<div style={{fontSize:12,color:"rgba(255,255,255,0.4)",fontFamily:sans}}>Connect Whoop to get your daily briefing</div>}
        </div>
        <div style={{marginTop:14}}>
          <Row style={{marginBottom:6}}><div style={{fontSize:11,color:"rgba(255,255,255,0.5)",fontFamily:sans}}>Berlin block</div><div style={{fontSize:11,color:A.blue,fontFamily:sans,fontWeight:600}}>{blockPct}%</div></Row>
          <div style={{height:4,background:"rgba(255,255,255,0.1)",borderRadius:2}}><div style={{width:`${blockPct}%`,height:"100%",background:`linear-gradient(90deg, ${A.blue}, ${A.teal})`,borderRadius:2,transition:"width 1s ease"}}/></div>
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
        <ThreeRings weekKm={weekKm} weekTarget={50} longRunDonePct={longRunDonePct} recoveryPct={recoveryScore}/>
        <div style={{display:"flex",flexDirection:"column",gap:3}}>
          {[{color:A.coral,label:"Weekly km"},{color:A.green,label:"Long run"},{color:A.blue,label:"Recovery"}].map((r,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:6,height:6,borderRadius:"50%",background:r.color,flexShrink:0}}/><div style={{fontSize:9,color:"rgba(255,255,255,0.4)",fontFamily:sans}}>{r.label}</div></div>
          ))}
        </div>
      </div>
    </Row>
    {whoopOk&&rec&&<div style={{marginTop:16,paddingTop:16,borderTop:"1px solid rgba(255,255,255,0.08)",display:"flex",gap:20}}>
      {[{label:"Recovery",value:`${recoveryScore}%`,color:recoveryScore>=67?A.green:recoveryScore>=34?A.yellow:A.coral},{label:"HRV",value:`${Math.round(rec.score?.hrv_rmssd_milli||0)}ms`,color:"rgba(255,255,255,0.7)"},{label:"RHR",value:`${Math.round(rec.score?.resting_heart_rate||0)}`,color:"rgba(255,255,255,0.7)"},{label:"This week",value:`${weekKm.toFixed(1)}km`,color:A.teal}].map((s,i)=>(
        <div key={i}><div style={{fontSize:10,color:"rgba(255,255,255,0.35)",fontFamily:sans,marginBottom:2,letterSpacing:"0.05em",textTransform:"uppercase"}}>{s.label}</div><div style={{fontSize:14,fontWeight:700,color:s.color,fontFamily:sans}}>{s.value}</div></div>
      ))}
    </div>}
  </div>;
}

// ─── CONNECT SCREEN ───────────────────────────────────────────────────────────
function ConnectScreen({whoopPending,T}){
  const clientId=process.env.REACT_APP_STRAVA_CLIENT_ID;
  const url=`https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(window.location.origin)}&response_type=code&scope=read,activity:read_all`;
  if(whoopPending) return <div style={{height:"100%",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{textAlign:"center"}}><div style={{fontSize:40,marginBottom:12}}>⌚</div><div style={{fontSize:17,fontWeight:600,color:T.text,fontFamily:sans}}>Connecting Whoop...</div></div></div>;
  return <div style={{height:"100vh",background:"linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #0d1b2a 100%)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
    <div style={{textAlign:"center",maxWidth:320}} className="page-enter">
      <div style={{width:80,height:80,background:`linear-gradient(135deg, ${A.blue}, ${A.teal})`,borderRadius:24,margin:"0 auto 28px",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 20px 60px ${A.blue}40`}}>
        <svg viewBox="0 0 36 36" width={44} height={44}><circle cx="18" cy="18" r="12" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="3"/><path d="M18 6 a12 12 0 0 1 12 12" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"/><rect x="11" y="14" width="14" height="2" rx="1" fill="white"/><rect x="11" y="18" width="10" height="2" rx="1" fill="white"/><rect x="11" y="22" width="7" height="2" rx="1" fill="white"/></svg>
      </div>
      <div style={{fontSize:11,fontWeight:700,color:A.blue,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:12,fontFamily:sans}}>Fitness Dashboard</div>
      <div style={{fontSize:32,fontWeight:800,color:"#fff",marginBottom:8,letterSpacing:"-0.03em",fontFamily:sans}}>Caleb Cunningham</div>
      <div style={{fontSize:14,color:"rgba(255,255,255,0.45)",marginBottom:36,lineHeight:1.7,fontFamily:sans}}>Your personal training hub. Connect Strava to get started.</div>
      <a href={url} style={{display:"inline-block",background:A.blue,color:"#fff",borderRadius:28,padding:"15px 36px",fontSize:15,fontWeight:700,textDecoration:"none",fontFamily:sans,boxShadow:`0 12px 40px ${A.blue}50`}}>Connect with Strava</a>
      <div style={{fontSize:11,color:"rgba(255,255,255,0.25)",marginTop:14,fontFamily:sans}}>Read-only access · Data stays private</div>
    </div>
  </div>;
}

// ─── ACTIVITY DETAIL ──────────────────────────────────────────────────────────
function ActivityDetail({id,onBack,T}){
  const [act,setAct]=useState(null);const [streams,setStreams]=useState(null);const [loading,setLoading]=useState(true);
  useEffect(()=>{Promise.all([getActivity(id),getStreams(id)]).then(([a,s])=>{setAct(a);setStreams(s);}).catch(console.error).finally(()=>setLoading(false));},[id]);
  if(loading) return <Loader T={T} text="Loading activity..."/>;
  if(!act) return <div style={{color:T.sub,fontSize:14,fontFamily:sans,padding:20}}>Could not load.</div>;
  const type=actType(act),color=typeCol(type),laps=act.laps||[];
  const hr=streams?.heartrate?.data||[],time=streams?.time?.data||[];
  const hrChart=hr.filter((_,i)=>i%15===0).map((v,i)=>({t:Math.round((time[i*15]||i*15)/60),hr:v}));
  return <div style={{display:"flex",flexDirection:"column",gap:12,paddingBottom:20}} className="page-enter">
    <button onClick={onBack} style={{background:"transparent",border:"none",color:A.blue,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:sans,display:"inline-flex",alignItems:"center",gap:6,padding:0,marginBottom:4}}><span style={{fontSize:18}}>‹</span> Back</button>
    <Card T={T}>
      <Row style={{flexWrap:"wrap",gap:10,alignItems:"flex-start"}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:20,fontWeight:800,color:T.text,marginBottom:4,letterSpacing:"-0.02em",fontFamily:sans}}>{act.name}</div>
          <div style={{fontSize:12,color:T.sub,marginBottom:10,fontFamily:sans}}>{new Date(act.start_date_local).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}{act.gear?.name?` · ${act.gear.name}`:""}</div>
          <Tag color={color}>{type}</Tag>
        </div>
        {act.suffer_score&&<div style={{textAlign:"right"}}><Label T={T} color={T.muted}>Suffer score</Label><div style={{fontSize:28,fontWeight:800,color:A.coral,fontFamily:sans,marginTop:4}}>{act.suffer_score}</div></div>}
      </Row>
    </Card>
    <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
      <Tile T={T} label="Distance" value={`${fDist(act.distance)}km`} color={A.blue}/>
      <Tile T={T} label="Time" value={fTime(act.moving_time)} color={T.text}/>
      <Tile T={T} label="Avg Pace" value={`${fPace(act.average_speed)}/km`} color={A.blue}/>
      {act.average_heartrate&&<Tile T={T} label="Avg HR" value={`${Math.round(act.average_heartrate)}`} sub="bpm" color={A.coral}/>}
      {act.max_heartrate&&<Tile T={T} label="Max HR" value={`${act.max_heartrate}`} sub="bpm" color={A.coral}/>}
      {act.average_cadence&&<Tile T={T} label="Cadence" value={`${Math.round(act.average_cadence*2)}`} sub="spm" color={A.purple}/>}
      {act.total_elevation_gain>0&&<Tile T={T} label="Elevation" value={`${Math.round(act.total_elevation_gain)}m`} color={A.green}/>}
    </div>
    {laps.length>1&&<Card T={T}><SectionHeader T={T} title="Splits" accent={A.blue}/><div style={{display:"flex",flexDirection:"column",gap:6}}>{laps.map((lap,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:12,background:T.surface2,borderRadius:12,padding:"10px 14px"}}><div style={{fontSize:11,color:T.muted,minWidth:44,fontWeight:600,fontFamily:sans}}>Lap {i+1}</div><div style={{fontSize:15,fontWeight:700,color:A.blue,flex:1,fontFamily:sans}}>{fPace(lap.average_speed)}/km</div><div style={{fontSize:12,color:T.sub,fontFamily:sans}}>{(lap.distance/1000).toFixed(2)}km</div>{lap.average_heartrate&&<div style={{fontSize:12,color:A.coral,fontFamily:sans}}>{Math.round(lap.average_heartrate)} bpm</div>}</div>)}</div></Card>}
    {hrChart.length>5&&<Card T={T}><SectionHeader T={T} title="Heart Rate" accent={A.coral}/><ResponsiveContainer width="100%" height={130}><AreaChart data={hrChart}><defs><linearGradient id="hrg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={A.coral} stopOpacity={0.2}/><stop offset="95%" stopColor={A.coral} stopOpacity={0}/></linearGradient></defs><XAxis dataKey="t" tick={{fontSize:10,fill:T.muted,fontFamily:sans}} tickLine={false} axisLine={false} unit="m"/><YAxis tick={{fontSize:10,fill:T.muted}} tickLine={false} axisLine={false} domain={["auto","auto"]} width={28}/><Tooltip content={<CT T={T}/>}/><Area type="monotone" dataKey="hr" name="HR" stroke={A.coral} fill="url(#hrg)" strokeWidth={2} dot={false}/></AreaChart></ResponsiveContainer></Card>}
    {act.best_efforts?.length>0&&<Card T={T}><SectionHeader T={T} title="Best Efforts" accent={A.green}/><div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>{act.best_efforts.slice(0,6).map((b,i)=><div key={i} style={{background:T.surface2,borderRadius:14,padding:"12px 14px"}}><Label T={T} style={{marginBottom:5}}>{b.name}</Label><div style={{fontSize:16,fontWeight:700,color:A.blue,fontFamily:sans}}>{fTime(b.moving_time)}</div><Sub T={T}>{fPace(b.distance/b.moving_time)}/km</Sub></div>)}</div></Card>}
  </div>;
}

// ─── HEATMAP ──────────────────────────────────────────────────────────────────
function ConsistencyHeatmap({activities,T}){
  const runDates=new Set(activities.filter(a=>a.type==="Run"||a.sport_type==="Run").map(r=>new Date(r.start_date_local).toISOString().split("T")[0]));
  const today=new Date();today.setHours(0,0,0,0);
  const weeks=[];const start=new Date(today);
  start.setDate(today.getDate()-((today.getDay()===0?6:today.getDay()-1)));
  start.setDate(start.getDate()-13*7);
  for(let w=0;w<14;w++){const week=[];for(let d=0;d<7;d++){const date=new Date(start);date.setDate(start.getDate()+w*7+d);const key=date.toISOString().split("T")[0];week.push({date:key,isRun:runDates.has(key),isFuture:date>today});}weeks.push(week);}
  const total=[...runDates].filter(d=>new Date(d)>=start&&new Date(d)<=today).length;
  return <Card T={T}><SectionHeader T={T} title="Consistency" accent={A.blue} right={<span style={{fontSize:12,color:T.sub,fontFamily:sans}}>{total} runs · 14 weeks</span>}/>
    <div style={{overflowX:"auto"}}><div style={{display:"flex",gap:3,minWidth:"fit-content"}}>{weeks.map((week,wi)=><div key={wi} style={{display:"flex",flexDirection:"column",gap:3}}>{week.map((day,di)=><div key={di} title={day.date} style={{width:13,height:13,borderRadius:3,background:day.isFuture?T.divider:day.isRun?A.blue:T.surface2,opacity:day.isFuture?0.2:1}}/>)}</div>)}</div>
    <Row style={{marginTop:8,fontSize:10,color:T.muted,fontFamily:sans}}><span>{new Date(weeks[0][0].date).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</span><span>Today</span></Row></div>
  </Card>;
}

// ─── HR ZONES ─────────────────────────────────────────────────────────────────
function HRZones({activities,T}){
  const MAX_HR=208;
  const zones=[{name:"Z1 Recovery",min:0,max:0.6,color:A.blue},{name:"Z2 Aerobic",min:0.6,max:0.7,color:A.green},{name:"Z3 Tempo",min:0.7,max:0.8,color:A.yellow},{name:"Z4 Threshold",min:0.8,max:0.9,color:"#FF9500"},{name:"Z5 Max",min:0.9,max:1.0,color:A.coral}];
  const runs=activities.filter(a=>(a.type==="Run"||a.sport_type==="Run")&&a.average_heartrate).slice(0,20);
  if(!runs.length) return null;
  const zoneCounts=zones.map(z=>{const count=runs.filter(r=>{const p=r.average_heartrate/MAX_HR;return p>=z.min&&p<z.max;}).length;return{...z,count,pct:Math.round(count/runs.length*100)};});
  return <Card T={T}><SectionHeader T={T} title="HR Zones" accent={A.coral}/><div style={{display:"flex",flexDirection:"column",gap:10}}>{zoneCounts.map((z,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:12}}><div style={{fontSize:11,color:T.sub,minWidth:94,fontFamily:sans}}>{z.name}</div><div style={{flex:1,height:6,background:T.surface2,borderRadius:3}}><div style={{width:`${z.pct}%`,height:"100%",background:z.color,borderRadius:3,transition:"width .6s ease"}}/></div><div style={{fontSize:12,color:z.color,minWidth:30,textAlign:"right",fontWeight:700,fontFamily:sans}}>{z.pct}%</div></div>)}</div></Card>;
}
function RacePredictor({activities,T}){
  const runs=activities.filter(a=>(a.type==="Run"||a.sport_type==="Run")&&a.distance>3000&&a.average_speed).slice(0,10);
  if(runs.length<3) return null;
  const avgSpeed=runs.reduce((s,r)=>s+r.average_speed,0)/runs.length;
  const avgHR=runs.filter(r=>r.average_heartrate).reduce((s,r,_,a)=>s+r.average_heartrate/a.length,0);
  const hrFactor=avgHR?Math.max(0.7,Math.min(1.1,1-((avgHR/208)-0.75)*2)):1;
  const preds=[{dist:"5K",m:5000},{dist:"10K",m:10000},{dist:"Half",m:21097},{dist:"Full",m:42195}].map(r=>{const fatigue=1+(r.m/42195)*0.08;const secs=Math.round(r.m/(avgSpeed*hrFactor/fatigue));return{...r,time:fTime(secs),pace:fPace(r.m/secs)};});
  return <Card T={T}><SectionHeader T={T} title="Race Predictor" accent={A.purple} right={<span style={{fontSize:11,color:T.muted,fontFamily:sans}}>Last {runs.length} runs</span>}/><div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>{preds.map(p=><div key={p.dist} style={{background:T.surface2,borderRadius:14,padding:"14px 15px"}}><Label T={T} style={{marginBottom:7}}>{p.dist}</Label><div style={{fontSize:20,fontWeight:800,color:A.purple,fontFamily:sans}}>{p.time}</div><Sub T={T}>{p.pace}/km</Sub></div>)}</div></Card>;
}
function BerlinTargets({T}){
  const targets=[{label:"Sub 3:20",secs:200*60,isGoal:true},{label:"Sub 3:15",secs:195*60,isGoal:false},{label:"Sub 3:10",secs:190*60,isGoal:false}];
  return <Card T={T}><SectionHeader T={T} title="Berlin Pace Targets" accent={A.blue}/><div style={{display:"flex",flexDirection:"column",gap:8}}>{targets.map((t,i)=>{const ps=t.secs/42.195,mins=Math.floor(ps/60),secs=Math.round(ps%60);return <div key={i} style={{background:t.isGoal?`${A.blue}12`:T.surface2,borderRadius:14,padding:"13px 16px",border:t.isGoal?`1.5px solid ${A.blue}30`:"none"}}><Row><div><div style={{fontSize:14,fontWeight:700,color:t.isGoal?A.blue:T.text,fontFamily:sans}}>{t.label}</div><Sub T={T}>Half: {fTime(t.secs/2)}</Sub></div><div style={{fontSize:17,fontWeight:800,color:t.isGoal?A.blue:T.sub,fontFamily:sans}}>{mins}:{secs.toString().padStart(2,"0")}/km</div></Row></div>;})}
  </div></Card>;
}
// ─── OVERVIEW ─────────────────────────────────────────────────────────────────
function Overview({stats,activities,whoopData,whoopOk,onConnectWhoop,bestEfforts,gear,userPrefs,onSavePrefs,onGoToChat,onNav,athlete,T}){
  const ytd=stats?.ytd_run_totals||{},all=stats?.all_run_totals||{};
  const rec=whoopData?.recoveries?.records?.[0],sleep=whoopData?.sleeps?.records?.[0],cyc=whoopData?.cycles?.records?.[0];
  const streaks=calcStreaks(activities),recoveryScore=Math.round(rec?.score?.recovery_score||0);
  const vol=weeklyVol(activities);
  const paceTrend=vol.map(w=>{const wr=activities.filter(a=>{if(a.type!=="Run")return false;const d=new Date(a.start_date_local);const mon=new Date(d);mon.setDate(d.getDate()-((d.getDay()+6)%7));return mon.toLocaleDateString("en-GB",{day:"numeric",month:"short"})===w.week;});const avg=wr.length?wr.reduce((s,r)=>s+(r.average_speed||0),0)/wr.length:0;return{week:w.week,pace:avg?parseFloat((1000/avg/60).toFixed(2)):null};}).filter(w=>w.pace);
  const PBs=[{label:"5K",time:"18:42",pace:"3:44/km"},{label:"10K",time:"40:52",pace:"4:05/km"},{label:"HM",time:"1:32:48",pace:"4:23/km"},{label:"Marathon",time:"3:48:59",pace:"5:25/km"}];
  return <div style={{display:"flex",flexDirection:"column",gap:14,paddingBottom:24}} className="page-enter">
    {whoopOk&&rec&&recoveryScore<34&&<div style={{background:A.coralL,border:`1.5px solid ${A.coral}30`,borderRadius:18,padding:"13px 16px",display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:20}}>⚠️</span><div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:A.coral,fontFamily:sans}}>Low recovery today ({recoveryScore}%)</div><div style={{fontSize:12,color:T.sub,fontFamily:sans,marginTop:2}}>Consider easy or rest. Ask Claude to adjust your plan.</div></div><Btn onClick={onGoToChat} color={A.coral} sm>Ask Claude</Btn></div>}
    <HeroCard athlete={athlete} activities={activities} stats={stats} whoopData={whoopData} whoopOk={whoopOk} userPrefs={userPrefs} T={T}/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
      {(()=>{
        const recentVol=vol.slice(-8).map(w=>w.km||0);
        const recentCounts=vol.slice(-8).map(w=>w.count||0);
        return <>
          <TapTile T={T} label="YTD Distance" value={ytd.distance?`${(ytd.distance/1000).toFixed(1)}km`:"449.6km"} sub={`${ytd.count||58} runs`} color={A.blue} onClick={()=>onNav("running")} bars={recentVol}/>
          <TapTile T={T} label="YTD Time" value={ytd.moving_time?`${(ytd.moving_time/3600).toFixed(1)}h`:"36.9h"} color={T.text} onClick={()=>onNav("running")} bars={recentCounts}/>
          <TapTile T={T} label="Streak" value={`${streaks.current}d`} sub={streaks.current>2?`🔥 ${streaks.current} days`:""} color={streaks.current>6?A.green:streaks.current>2?"#FF9500":T.sub} onClick={()=>onNav("running")} bars={recentCounts}/>
          <TapTile T={T} label="All-Time" value={all.distance?`${(all.distance/1000).toFixed(0)}km`:"1093km"} sub={`${all.count||161} runs`} color={T.text} onClick={()=>onNav("running")} bars={recentCounts}/>
        </>;
      })()}
    </div>
    {whoopOk&&sleep&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
      <Tile T={T} label="Sleep Score" value={`${Math.round(sleep.score?.sleep_performance_percentage||0)}%`} color={A.blue}/>
      <Tile T={T} label="In Bed" value={sleep.score?.stage_summary?.total_in_bed_time_milli?`${(sleep.score.stage_summary.total_in_bed_time_milli/3600000).toFixed(1)}h`:"--"} color={A.teal}/>
      <Tile T={T} label="Strain" value={cyc?.score?.strain?.toFixed(1)||"--"} color={"#FF9500"}/>
    </div>}
    <Card T={T}><SectionHeader T={T} title="Personal Bests" accent={A.green}/><div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>{(bestEfforts&&Object.values(bestEfforts).some(Boolean)?Object.entries(bestEfforts).filter(([,v])=>v).map(([name,e])=>({label:name,time:fTime(e.moving_time),pace:`${fPace(e.distance/e.moving_time)}/km`})):PBs).map(pb=><div key={pb.label} style={{background:T.surface2,borderRadius:14,padding:"13px 15px"}}><Label T={T} style={{marginBottom:7}}>{pb.label}</Label><div style={{fontSize:19,fontWeight:800,color:A.green,fontFamily:sans}}>{pb.time}</div><Sub T={T}>{pb.pace}</Sub></div>)}</div></Card>
    {paceTrend.length>2&&<Card T={T}><SectionHeader T={T} title="Pace Trend" accent={A.blue} right={<span style={{fontSize:11,color:T.muted,fontFamily:sans}}>min/km, lower = faster</span>}/><ResponsiveContainer width="100%" height={110}><LineChart data={paceTrend}><defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={A.blue}/><stop offset="100%" stopColor={A.teal}/></linearGradient></defs><XAxis dataKey="week" tick={{fontSize:10,fill:T.muted,fontFamily:sans}} tickLine={false} axisLine={false} interval={2}/><YAxis tick={{fontSize:10,fill:T.muted}} tickLine={false} axisLine={false} width={26} reversed domain={["auto","auto"]}/><Tooltip content={<CT T={T}/>}/><Line type="monotone" dataKey="pace" name="min/km" stroke="url(#pg)" strokeWidth={2.5} dot={{fill:A.blue,r:3}} connectNulls/></LineChart></ResponsiveContainer></Card>}
    <BerlinTargets T={T}/>
    <RacePredictor activities={activities} T={T}/>
    {userPrefs?.weightLog?.length>1&&(()=>{const log=userPrefs.weightLog.slice(-14),curr=log[log.length-1]?.weight;return <Card T={T}><SectionHeader T={T} title="Weight" accent={A.purple} right={<span style={{fontSize:12,color:T.sub,fontFamily:sans}}>{curr}kg of 65kg</span>}/><ResponsiveContainer width="100%" height={90}><LineChart data={log}><XAxis dataKey="date" tick={{fontSize:9,fill:T.muted,fontFamily:sans}} tickLine={false} axisLine={false} interval={2}/><YAxis tick={{fontSize:9,fill:T.muted}} tickLine={false} axisLine={false} width={30} domain={["auto","auto"]} unit="kg"/><Tooltip content={<CT T={T}/>}/><Line type="monotone" dataKey="weight" name="kg" stroke={A.purple} strokeWidth={2} dot={{fill:A.purple,r:3}} connectNulls/></LineChart></ResponsiveContainer></Card>})()}

  </div>;
}

// ─── RUNNING ──────────────────────────────────────────────────────────────────
function RunCard({run:r,onSelect,T}){
  const [weather,setWeather]=useState(null);
  const t=actType(r),col=typeCol(t);
  useEffect(()=>{if(!r.start_latlng?.[0])return;fetchWeather(r.start_latlng[0],r.start_latlng[1],new Date(r.start_date_local).toISOString().split("T")[0]).then(w=>{if(w)setWeather(w);});},[r.id]);
  return <button onClick={onSelect} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:16,padding:"13px 16px",display:"flex",alignItems:"center",gap:12,textAlign:"left",width:"100%",cursor:"pointer",transition:"all 0.15s"}}>
    <div style={{width:10,height:10,borderRadius:"50%",background:col,flexShrink:0,boxShadow:`0 0 8px ${col}60`}}/>
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontSize:13,fontWeight:600,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontFamily:sans,marginBottom:3}}>{r.name}</div>
      <div style={{fontSize:11,color:T.sub,fontFamily:sans,display:"flex",gap:8}}><span>{new Date(r.start_date_local).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</span>{r.gear?.name&&<span>· {r.gear.name}</span>}{weather&&<span>{WX_EMOJI[weather.code]||""} {weather.temp}°C</span>}</div>
    </div>
    <div style={{textAlign:"right",flexShrink:0}}><div style={{fontSize:14,fontWeight:800,color:A.blue,fontFamily:sans}}>{fDist(r.distance)}km</div><Sub T={T} style={{fontSize:11,marginTop:2}}>{fPace(r.average_speed)}/km</Sub></div>
    <span style={{color:T.muted,fontSize:16}}>›</span>
  </button>;
}
function Running({activities,stats,gear,T}){
  const [sel,setSel]=useState(null);
  const runs=activities.filter(a=>a.type==="Run"||a.sport_type==="Run"),vol=weeklyVol(activities),ytd=stats?.ytd_run_totals||{};
  if(sel) return <ActivityDetail id={sel} onBack={()=>setSel(null)} T={T}/>;
  return <div style={{display:"flex",flexDirection:"column",gap:14,paddingBottom:24}} className="page-enter">
    <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
      <Tile T={T} label="YTD Distance" value={ytd.distance?`${(ytd.distance/1000).toFixed(1)}km`:"449.6km"} sub={`${ytd.count||58} runs`} color={A.blue}/>
      <Tile T={T} label="YTD Time" value={ytd.moving_time?`${(ytd.moving_time/3600).toFixed(1)}h`:"36.9h"} color={T.text}/>
      <Tile T={T} label="All-Time" value={stats?.all_run_totals?.distance?`${(stats.all_run_totals.distance/1000).toFixed(0)}km`:"1093km"} color={T.text}/>
      <Tile T={T} label="Elevation YTD" value={ytd.elevation_gain?`${ytd.elevation_gain}m`:"846m"} color={A.green}/>
    </div>
    <ConsistencyHeatmap activities={activities} T={T}/>
    <Card T={T}><SectionHeader T={T} title="Weekly Volume" accent={A.blue}/><ResponsiveContainer width="100%" height={120}><BarChart data={vol}><defs><linearGradient id="vg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={A.blue} stopOpacity={1}/><stop offset="100%" stopColor={A.blue} stopOpacity={0.3}/></linearGradient></defs><XAxis dataKey="week" tick={{fontSize:10,fill:T.muted,fontFamily:sans}} tickLine={false} axisLine={false} interval={2}/><YAxis tick={{fontSize:10,fill:T.muted}} tickLine={false} axisLine={false} unit="k" width={26}/><Tooltip content={<CT T={T}/>}/><Bar dataKey="km" name="km" fill="url(#vg)" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></Card>
    <HRZones activities={activities} T={T}/>
    {gear?.length>0&&<Card T={T}><SectionHeader T={T} title="Shoe Mileage" accent={A.purple}/><div style={{display:"flex",flexDirection:"column",gap:10}}>{gear.map((s,i)=>{const km=(s.distance||0)/1000,pct=Math.min(100,Math.round(km/800*100)),color=pct>80?A.coral:pct>50?A.yellow:A.green;return <div key={i} style={{background:T.surface2,borderRadius:14,padding:"13px 16px"}}><Row style={{marginBottom:9}}><div><div style={{fontSize:13,fontWeight:600,color:T.text,fontFamily:sans}}>{s.name}</div>{s.brand_name&&<Sub T={T}>{s.brand_name}</Sub>}</div><div style={{fontSize:14,fontWeight:800,color,fontFamily:sans}}>{km.toFixed(0)}km</div></Row><div style={{height:6,background:T.divider,borderRadius:3}}><div style={{width:`${pct}%`,height:"100%",background:color,borderRadius:3,transition:"width .6s ease"}}/></div><div style={{fontSize:10,color:pct>80?A.coral:T.muted,marginTop:5,fontFamily:sans,fontWeight:pct>80?700:400}}>{pct>80?"Replace soon · ":""}{pct}% of 800km</div></div>;})}
    </div></Card>}
    <Card T={T}><SectionHeader T={T} title="Recent Runs" accent={A.blue}/><div style={{display:"flex",flexDirection:"column",gap:6}}>{runs.slice(0,30).map(r=><RunCard key={r.id} run={r} onSelect={()=>setSel(r.id)} T={T}/>)}</div></Card>
  </div>;
}

// ─── GYM ──────────────────────────────────────────────────────────────────────
function Gym({activities,userPrefs,onSavePrefs,savedWorkout,T}){
  const [editing,setEditing]=useState(false);const [workout,setWorkout]=useState(null);
  const lifts=userPrefs?.lifts||DEFAULT_LIFTS;const [editLifts,setEditLifts]=useState(lifts);
  const sessions=activities.filter(a=>a.type==="WeightTraining"||(a.name||"").toLowerCase().includes("gym")||(a.name||"").toLowerCase().includes("weight"));
  useEffect(()=>{if(savedWorkout)setWorkout(savedWorkout);},[savedWorkout]);
  const save=()=>{onSavePrefs({...userPrefs,lifts:editLifts});setEditing(false);};
  return <div style={{display:"flex",flexDirection:"column",gap:14,paddingBottom:24}} className="page-enter">
    {workout&&<Card T={T} style={{border:`1.5px solid ${A.blue}30`,background:`${A.blue}08`}}>
      <Row style={{marginBottom:14}}><div><div style={{fontSize:15,fontWeight:800,color:T.text,fontFamily:sans}}>{workout.title}</div><Sub T={T}>{new Date(workout.date).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}</Sub></div><button onClick={()=>setWorkout(null)} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.sub,borderRadius:20,padding:"4px 12px",fontSize:11,cursor:"pointer",fontFamily:sans}}>Clear</button></Row>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>{workout.exercises.map((ex,i)=><div key={i} style={{background:T.surface,borderRadius:14,padding:"13px 16px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}><div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:T.text,fontFamily:sans}}>{ex.name}</div>{ex.notes&&<Sub T={T} style={{marginTop:3}}>{ex.notes}</Sub>}</div><div style={{textAlign:"right",flexShrink:0}}><div style={{fontSize:14,fontWeight:800,color:A.blue,fontFamily:sans}}>{ex.sets}x{ex.reps}</div><Sub T={T} style={{fontSize:11}}>{ex.weight}</Sub></div></div>)}</div>
      <div style={{marginTop:12,fontSize:11,color:A.blue,fontFamily:sans,fontWeight:600}}>Generated by Claude</div>
    </Card>}
    <Card T={T}><SectionHeader T={T} title="Current Lifts" accent={A.coral} right={<EditBtn T={T} editing={editing} onToggle={()=>{if(editing)save();else{setEditLifts(lifts);setEditing(true);}}}/>}/><div style={{display:"flex",flexDirection:"column",gap:8}}>{(editing?editLifts:lifts).map((l,i)=><div key={i} style={{background:T.surface2,borderRadius:14,padding:"13px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>{editing?<><TxtInput T={T} value={l.name} onChange={v=>setEditLifts(p=>p.map((x,j)=>j===i?{...x,name:v}:x))} style={{flex:1}}/><TxtInput T={T} value={l.weight} onChange={v=>setEditLifts(p=>p.map((x,j)=>j===i?{...x,weight:v}:x))} style={{width:90}}/><TxtInput T={T} value={`${l.sets}x${l.reps}`} onChange={v=>{const[s,r]=(v.split("x")||["3","10"]);setEditLifts(p=>p.map((x,j)=>j===i?{...x,sets:parseInt(s)||3,reps:parseInt(r)||10}:x));}} style={{width:56}}/><button onClick={()=>setEditLifts(p=>p.filter((_,j)=>j!==i))} style={{background:"transparent",border:"none",color:A.coral,cursor:"pointer",fontSize:18}}>×</button></>:<><div><div style={{fontSize:13,fontWeight:600,color:T.text,fontFamily:sans}}>{l.name}</div><Sub T={T}>{l.sets} sets × {l.reps} reps</Sub></div><div style={{fontSize:14,fontWeight:800,color:A.blue,fontFamily:sans}}>{l.weight}</div></>}</div>)}{editing&&<button onClick={()=>setEditLifts(p=>[...p,{name:"New Exercise",weight:"0kg",sets:3,reps:10}])} style={{background:"transparent",border:`1.5px dashed ${T.border}`,borderRadius:14,padding:"10px",color:T.sub,cursor:"pointer",fontSize:13,fontFamily:sans}}>+ Add exercise</button>}</div></Card>
    {sessions.length>0&&<Card T={T}><SectionHeader T={T} title="Recent Sessions" accent={A.green}/><div style={{display:"flex",flexDirection:"column",gap:8}}>{sessions.slice(0,8).map(s=><div key={s.id} style={{background:T.surface2,borderRadius:14,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:13,fontWeight:600,color:T.text,fontFamily:sans}}>{s.name}</div><Sub T={T}>{new Date(s.start_date_local).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</Sub></div><div style={{textAlign:"right"}}><div style={{fontSize:13,fontWeight:700,color:A.blue,fontFamily:sans}}>{fTime(s.moving_time)}</div>{s.average_heartrate&&<Sub T={T} style={{color:A.coral}}>{Math.round(s.average_heartrate)} bpm</Sub>}</div></div>)}</div></Card>}
  </div>;
}
// ─── RECOVERY ─────────────────────────────────────────────────────────────────
function Recovery({whoopData,whoopOk,onConnectWhoop,onRefreshWhoop,T}){
  if(!whoopOk) return <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,textAlign:"center",padding:40,gap:20}} className="page-enter"><div style={{width:80,height:80,background:`${A.coral}15`,borderRadius:24,display:"flex",alignItems:"center",justifyContent:"center",fontSize:36}}>⌚</div><div><div style={{fontSize:20,fontWeight:800,color:T.text,marginBottom:8,fontFamily:sans}}>Connect Whoop</div><div style={{fontSize:14,color:T.sub,marginBottom:24,lineHeight:1.7,maxWidth:260,fontFamily:sans}}>Live recovery, HRV, sleep stages, daily strain and more.</div></div><Btn onClick={onConnectWhoop} color={A.coral}>Connect Whoop</Btn></div>;
  const recs=whoopData?.recoveries?.records||[],sleeps=whoopData?.sleeps?.records||[],cycles=whoopData?.cycles?.records||[];
  const latest=recs[0],latestSleep=sleeps[0];
  if(!latest&&!latestSleep) return <div style={{textAlign:"center",padding:40}}><div style={{fontSize:14,color:T.sub,marginBottom:20,fontFamily:sans}}>No Whoop data loaded yet.</div><Btn onClick={onRefreshWhoop} color={A.blue} sm>Load Data</Btn></div>;
  const hrvChart=recs.slice(0,14).reverse().map(r=>({day:new Date(r.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"}),hrv:Math.round(r.score?.hrv_rmssd_milli||0),rhr:Math.round(r.score?.resting_heart_rate||0)}));
  const recChart=recs.slice(0,14).reverse().map(r=>({day:new Date(r.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"}),score:Math.round(r.score?.recovery_score||0)}));
  const sleepChart=sleeps.slice(0,14).reverse().map(s=>({day:new Date(s.start).toLocaleDateString("en-GB",{day:"numeric",month:"short"}),hours:s.score?.stage_summary?.total_in_bed_time_milli?parseFloat((s.score.stage_summary.total_in_bed_time_milli/3600000).toFixed(1)):0}));
  return <div style={{display:"flex",flexDirection:"column",gap:14,paddingBottom:24}} className="page-enter">
    <div style={{display:"flex",justifyContent:"flex-end"}}><Btn onClick={onRefreshWhoop} color={A.blue} sm ghost>Refresh</Btn></div>
    {latest&&<Card T={T}><SectionHeader T={T} title="Today's Recovery" accent={A.coral}/><div style={{display:"flex",gap:20,alignItems:"center",marginBottom:16}}><RecoveryRing score={Math.round(latest.score?.recovery_score||0)} size={110}/><div style={{flex:1,display:"flex",flexDirection:"column",gap:12}}>{[{label:"HRV",value:`${Math.round(latest.score?.hrv_rmssd_milli||0)}ms`,color:A.green},{label:"Resting HR",value:`${Math.round(latest.score?.resting_heart_rate||0)} bpm`,color:A.coral},{label:"Resp Rate",value:`${latest.score?.respiratory_rate?.toFixed(1)||"--"} br/min`,color:A.purple}].map((s,i)=><div key={i}><Label T={T} style={{marginBottom:3}}>{s.label}</Label><div style={{fontSize:16,fontWeight:700,color:s.color,fontFamily:sans}}>{s.value}</div></div>)}</div></div></Card>}
    {latestSleep&&<Card T={T}><SectionHeader T={T} title="Last Night's Sleep" accent={A.blue}/><div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}><Tile T={T} label="Sleep Score" value={`${Math.round(latestSleep.score?.sleep_performance_percentage||0)}%`} color={A.blue}/><Tile T={T} label="In Bed" value={latestSleep.score?.stage_summary?.total_in_bed_time_milli?`${(latestSleep.score.stage_summary.total_in_bed_time_milli/3600000).toFixed(1)}h`:"--"} color={A.teal}/><Tile T={T} label="REM" value={latestSleep.score?.stage_summary?.total_rem_sleep_time_milli?`${(latestSleep.score.stage_summary.total_rem_sleep_time_milli/60000).toFixed(0)}m`:"--"} color={A.purple}/><Tile T={T} label="Deep Sleep" value={latestSleep.score?.stage_summary?.total_slow_wave_sleep_time_milli?`${(latestSleep.score.stage_summary.total_slow_wave_sleep_time_milli/60000).toFixed(0)}m`:"--"} color={A.green}/></div></Card>}
    {hrvChart.length>0&&<Card T={T}><SectionHeader T={T} title="HRV and RHR - 14 Days" accent={A.green}/><ResponsiveContainer width="100%" height={140}><LineChart data={hrvChart}><XAxis dataKey="day" tick={{fontSize:10,fill:T.muted,fontFamily:sans}} tickLine={false} axisLine={false} interval={2}/><YAxis tick={{fontSize:10,fill:T.muted}} tickLine={false} axisLine={false} width={28}/><Tooltip content={<CT T={T}/>}/><Line type="monotone" dataKey="hrv" name="HRV" stroke={A.green} strokeWidth={2} dot={{fill:A.green,r:3}}/><Line type="monotone" dataKey="rhr" name="RHR" stroke={A.coral} strokeWidth={2} dot={{fill:A.coral,r:3}}/></LineChart></ResponsiveContainer></Card>}
    {recChart.length>0&&<Card T={T}><SectionHeader T={T} title="Recovery Score - 14 Days" accent={A.green}/><ResponsiveContainer width="100%" height={110}><BarChart data={recChart}><defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={A.green} stopOpacity={1}/><stop offset="100%" stopColor={A.green} stopOpacity={0.3}/></linearGradient></defs><XAxis dataKey="day" tick={{fontSize:10,fill:T.muted,fontFamily:sans}} tickLine={false} axisLine={false} interval={2}/><YAxis tick={{fontSize:10,fill:T.muted}} tickLine={false} axisLine={false} domain={[0,100]} width={28}/><Tooltip content={<CT T={T}/>}/><Bar dataKey="score" name="Recovery" fill="url(#rg)" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></Card>}
    {sleepChart.length>0&&<Card T={T}><SectionHeader T={T} title="Sleep Duration - 14 Days" accent={A.blue}/><ResponsiveContainer width="100%" height={110}><BarChart data={sleepChart}><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={A.blue} stopOpacity={1}/><stop offset="100%" stopColor={A.blue} stopOpacity={0.3}/></linearGradient></defs><XAxis dataKey="day" tick={{fontSize:10,fill:T.muted,fontFamily:sans}} tickLine={false} axisLine={false} interval={2}/><YAxis tick={{fontSize:10,fill:T.muted}} tickLine={false} axisLine={false} width={28} unit="h"/><Tooltip content={<CT T={T}/>}/><Bar dataKey="hours" name="Hours" fill="url(#sg)" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></Card>}
    {cycles.length>0&&<Card T={T}><SectionHeader T={T} title="Daily Strain" accent={"#FF9500"}/><div style={{display:"flex",flexDirection:"column",gap:8}}>{cycles.slice(0,7).map((c,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:12,background:T.surface2,borderRadius:12,padding:"10px 14px"}}><div style={{fontSize:11,color:T.sub,minWidth:60,fontFamily:sans}}>{new Date(c.start).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</div><div style={{flex:1,height:6,background:T.divider,borderRadius:3}}><div style={{width:`${Math.min((c.score?.strain||0)/21*100,100)}%`,height:"100%",background:`linear-gradient(90deg, #FF9500, ${A.coral})`,borderRadius:3}}/></div><div style={{fontSize:13,fontWeight:700,color:"#FF9500",minWidth:30,textAlign:"right",fontFamily:sans}}>{c.score?.strain?.toFixed(1)||"--"}</div></div>)}</div></Card>}
  </div>;
}

// ─── PLAN ─────────────────────────────────────────────────────────────────────
function SessionCard({session:s,typeC,onToggleDone,T}){
  const [expanded,setExpanded]=useState(false);
  const col=s.done?A.green:(typeC[s.type]||A.blue),isRest=s.type==="Rest";
  return <div style={{background:s.done?`${A.green}0a`:T.surface,border:`1px solid ${s.done?A.green+"30":T.border}`,borderRadius:18,padding:16,opacity:isRest?0.45:1}}>
    <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
      <div style={{textAlign:"center",minWidth:40,flexShrink:0,paddingTop:2}}>
        <Label T={T} style={{marginBottom:5,fontSize:9}}>{s.day?.slice(0,3)?.toUpperCase()}</Label>
        <button onClick={()=>onToggleDone&&onToggleDone()} style={{width:36,height:36,borderRadius:"50%",background:s.done?A.green:`${col}15`,border:`2px solid ${s.done?A.green:col+"50"}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,transition:"all .2s"}}>{s.done?<span style={{color:"#fff",fontSize:14,fontWeight:800}}>✓</span>:<div style={{width:10,height:10,borderRadius:"50%",background:col}}/>}</button>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <button onClick={()=>!isRest&&setExpanded(!expanded)} style={{background:"transparent",border:"none",width:"100%",textAlign:"left",cursor:isRest?"default":"pointer",padding:0}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5,flexWrap:"wrap"}}><span style={{fontSize:14,fontWeight:700,color:s.done?A.green:T.text,textDecoration:s.done?"line-through":"none",fontFamily:sans}}>{s.type}</span>{s.dist&&s.dist!=="0km"&&<Tag color={col}>{s.dist}</Tag>}{s.pace&&s.pace!=="N/A"&&<Tag color={s.done?A.green:A.blue}>{s.pace}</Tag>}</div>
              {s.shoe&&s.shoe!=="N/A"&&<div style={{fontSize:12,color:A.purple,marginBottom:3,fontFamily:sans}}>👟 {s.shoe}</div>}
              {!expanded&&s.notes&&<div style={{fontSize:12,color:T.sub,lineHeight:1.5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontFamily:sans}}>{s.notes}</div>}
            </div>
            {!isRest&&<div style={{color:T.muted,fontSize:12}}>{expanded?"▲":"▼"}</div>}
          </div>
        </button>
        {expanded&&<div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${T.divider}`}}>{s.notes&&<div style={{fontSize:13,color:T.sub,lineHeight:1.7,marginBottom:12,fontFamily:sans}}>{s.notes}</div>}<div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>{s.dist&&s.dist!=="0km"&&<Tile T={T} label="Distance" value={s.dist} size={16} color={T.text}/>}{s.pace&&s.pace!=="N/A"&&<Tile T={T} label="Target Pace" value={s.pace} size={16} color={A.blue}/>}</div></div>}
      </div>
    </div>
  </div>;
}

function TrainingPlan({onChat,externalPlan,whoopData,onGoToChat,T}){
  const [plan,setPlan]=useState(null);const [planLoaded,setPlanLoaded]=useState(false);
  useEffect(()=>{loadTrainingPlan().then(p=>{if(p)setPlan(p);setPlanLoaded(true);}).catch(()=>setPlanLoaded(true));},[]);
  const savePlan=p=>{setPlan(p);saveTrainingPlan(p);};
  useEffect(()=>{if(externalPlan&&planLoaded)savePlan(externalPlan);},[externalPlan,planLoaded]);
  const typeC={Rest:T.muted,Easy:A.green,Interval:A.coral,Tempo:"#FF9500","Long Run":A.blue,Gym:A.purple};
  const toggleDone=i=>savePlan({...plan,sessions:plan.sessions.map((s,j)=>j===i?{...s,done:!s.done}:s)});
  const rec=whoopData?.recoveries?.records?.[0],recoveryScore=Math.round(rec?.score?.recovery_score||0),lowRec=rec&&recoveryScore<34;
  const done=plan?plan.sessions.filter(s=>s.done).length:0,total=plan?plan.sessions.filter(s=>s.type!=="Rest").length:0;
  return <div style={{display:"flex",flexDirection:"column",gap:14,paddingBottom:24}} className="page-enter">
    {!plan?<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",padding:"60px 24px",gap:20}}><div style={{width:80,height:80,background:`${A.blue}15`,borderRadius:24,display:"flex",alignItems:"center",justifyContent:"center",fontSize:36}}>📋</div><div><div style={{fontSize:20,fontWeight:800,color:T.text,marginBottom:6,fontFamily:sans}}>No plan yet</div><div style={{fontSize:14,color:T.sub,marginBottom:6,lineHeight:1.6,maxWidth:260,fontFamily:sans}}>Ask Claude to build your next 1 or 2 weeks. It factors in your recovery and recent load.</div></div><Btn onClick={onChat} color={A.blue}>Open Chat</Btn></div>
    :<>
      {lowRec&&<div style={{background:A.coralL,border:`1.5px solid ${A.coral}30`,borderRadius:18,padding:"13px 16px",display:"flex",alignItems:"center",gap:12}}><span>⚠️</span><div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:A.coral,fontFamily:sans}}>Recovery {recoveryScore}% today</div><div style={{fontSize:12,color:T.sub,fontFamily:sans,marginTop:2}}>Your plan may need adjusting. Ask Claude to shift sessions or add a rest day.</div></div><Btn onClick={onGoToChat} color={A.coral} sm>Ask Claude</Btn></div>}
      <Card T={T}><Row style={{flexWrap:"wrap",gap:10}}><div><div style={{fontSize:16,fontWeight:800,color:T.text,fontFamily:sans}}>{plan.title}</div>{plan.startDate&&<Sub T={T}>Starting {new Date(plan.startDate).toLocaleDateString("en-GB",{day:"numeric",month:"long"})}</Sub>}</div><div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{fontSize:12,color:T.sub,fontFamily:sans}}>{done}/{total} done</span><Btn onClick={async()=>{try{const res=await fetch("/.netlify/functions/export-plan-pdf",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({plan})});const data=await res.json();if(data.html){const blob=new Blob([data.html],{type:"text/html"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`${plan.title.replace(/\s+/g,"-")}.html`;a.click();URL.revokeObjectURL(url);}}catch(e){console.error(e);}}} color={A.blue} sm ghost>Export</Btn><Btn onClick={()=>savePlan(null)} color={T.muted} sm ghost>Clear</Btn></div></Row>{total>0&&<div style={{marginTop:14}}><div style={{height:5,background:T.divider,borderRadius:3}}><div style={{width:`${Math.round(done/total*100)}%`,height:"100%",background:`linear-gradient(90deg, ${A.blue}, ${A.green})`,borderRadius:3,transition:"width .5s ease"}}/></div><div style={{fontSize:11,color:T.muted,marginTop:5,fontFamily:sans}}>{Math.round(done/total*100)}% complete</div></div>}</Card>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>{plan.sessions.map((s,i)=><SessionCard key={i} session={s} typeC={typeC} onToggleDone={()=>toggleDone(i)} T={T}/>)}</div>
      <div style={{background:T.surface2,borderRadius:18,padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontSize:13,color:T.sub,fontFamily:sans}}>Need to adjust this plan?</div><Btn onClick={onGoToChat} color={A.blue} sm>Ask Claude</Btn></div>
    </>}
  </div>;
}

// ─── NUTRITION ────────────────────────────────────────────────────────────────
function Nutrition({userPrefs,onSavePrefs,T}){
  const today=new Date().toISOString().split("T")[0],log=userPrefs?.nutrition||{},todayLog=log[today]||{kcal:"",carbs:"",protein:"",notes:""};
  const [entry,setEntry]=useState(todayLog);const [saved,setSaved]=useState(false);
  const targets={kcal:3000,carbs:300,protein:140};
  const save=()=>{onSavePrefs({...userPrefs,nutrition:{...log,[today]:entry}});setSaved(true);setTimeout(()=>setSaved(false),2000);};
  const recent=Object.entries(log).sort(([a],[b])=>b.localeCompare(a)).slice(0,7);
  return <div style={{display:"flex",flexDirection:"column",gap:14,paddingBottom:24}} className="page-enter">
    <Card T={T}><SectionHeader T={T} title="Today's Nutrition" accent={A.green}/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>{[{key:"kcal",label:"Calories",target:targets.kcal,unit:"kcal",color:A.blue},{key:"carbs",label:"Carbs",target:targets.carbs,unit:"g",color:A.teal},{key:"protein",label:"Protein",target:targets.protein,unit:"g",color:A.coral}].map(f=>{const val=parseFloat(entry[f.key])||0,pct=Math.min(100,Math.round(val/f.target*100));return <div key={f.key} style={{background:T.surface2,borderRadius:14,padding:"13px 14px"}}><Label T={T} style={{marginBottom:8}}>{f.label}</Label><input type="number" value={entry[f.key]} onChange={e=>setEntry(prev=>({...prev,[f.key]:e.target.value}))} placeholder={String(f.target)} style={{width:"100%",background:"transparent",border:"none",borderBottom:`2px solid ${f.color}`,padding:"2px 0",fontSize:22,fontWeight:800,color:f.color,fontFamily:sans,outline:"none"}}/><div style={{fontSize:9,color:T.muted,marginTop:5,fontFamily:sans}}>of {f.target}{f.unit}</div><div style={{height:4,background:T.divider,borderRadius:2,marginTop:7}}><div style={{width:`${pct}%`,height:"100%",background:f.color,borderRadius:2,transition:"width .4s ease"}}/></div></div>;})}
      </div>
      <TxtInput T={T} value={entry.notes} onChange={v=>setEntry(prev=>({...prev,notes:v}))} placeholder="Notes (pre-run meal, gel timing...)" style={{marginBottom:12}}/>
      <Btn onClick={save} color={saved?A.green:A.blue} full>{saved?"Saved!":"Save Today"}</Btn>
    </Card>
    <Card T={T}><SectionHeader T={T} title="Daily Targets" accent={A.blue}/><div style={{display:"flex",flexDirection:"column",gap:8}}>{[{label:"Calories",val:"2,800 to 3,200 kcal",color:A.blue},{label:"Carbohydrates",val:"250 to 350g",color:A.teal},{label:"Protein",val:"130 to 150g",color:A.coral},{label:"Long runs",val:"SiS Beta Fuel every 30 min",color:A.green}].map((t,i)=><Row key={i} style={{background:T.surface2,borderRadius:12,padding:"11px 14px"}}><span style={{fontSize:13,color:T.sub,fontFamily:sans}}>{t.label}</span><span style={{fontSize:13,fontWeight:700,color:t.color,fontFamily:sans}}>{t.val}</span></Row>)}</div>
      <div style={{height:1,background:T.divider,margin:"14px 0"}}/>
      <Label T={T} style={{marginBottom:10}}>Log Weight</Label>
      <div style={{display:"flex",gap:8,alignItems:"center"}}><input type="number" step="0.1" placeholder="e.g. 60.5" style={{flex:1,background:T.surface2,border:`1.5px solid ${T.border}`,borderRadius:12,padding:"9px 13px",color:T.text,fontSize:16,fontFamily:sans,fontWeight:700,outline:"none"}} onBlur={e=>{const w=parseFloat(e.target.value);if(!w)return;const wlog=userPrefs?.weightLog||[];const updated=[...wlog.filter(l=>l.date!==today),{date:today,weight:w}].slice(-60);onSavePrefs({...userPrefs,weightLog:updated});e.target.value="";}}/><span style={{fontSize:12,color:T.sub,fontFamily:sans,flexShrink:0}}>kg · target 65kg</span></div>
    </Card>
    {recent.length>0&&<Card T={T}><SectionHeader T={T} title="Recent Log" accent={A.green}/><div style={{display:"flex",flexDirection:"column",gap:8}}>{recent.map(([date,e])=><Row key={date} style={{background:T.surface2,borderRadius:12,padding:"11px 14px"}}><div style={{fontSize:12,color:T.sub,fontFamily:sans}}>{new Date(date).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}</div><div style={{display:"flex",gap:12}}>{e.kcal&&<span style={{fontSize:12,color:A.blue,fontFamily:sans,fontWeight:700}}>{e.kcal}kcal</span>}{e.protein&&<span style={{fontSize:12,color:A.coral,fontFamily:sans}}>{e.protein}g P</span>}{e.carbs&&<span style={{fontSize:12,color:A.teal,fontFamily:sans}}>{e.carbs}g C</span>}</div></Row>)}</div></Card>}
  </div>;
}

// ─── RACES ────────────────────────────────────────────────────────────────────
function Races({userPrefs,onSavePrefs,T}){
  const [editing,setEditing]=useState(false);
  const races=userPrefs?.races||DEFAULT_RACES,sponsorship=userPrefs?.sponsorship||DEFAULT_SPONSORSHIP;
  const [editRaces,setEditRaces]=useState(races);const [editSponsorship,setEditSponsorship]=useState(sponsorship);
  const save=()=>{onSavePrefs({...userPrefs,races:editRaces,sponsorship:editSponsorship});setEditing(false);};
  return <div style={{display:"flex",flexDirection:"column",gap:14,paddingBottom:24}} className="page-enter">
    <Card T={T}><SectionHeader T={T} title="World Marathon Majors" accent={A.purple}/><div style={{fontSize:14,color:T.sub,lineHeight:1.7,marginBottom:14,fontFamily:sans}}>Running all six World Marathon Majors for a different charity each time. £5,000+ raised so far.</div><div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}><Tile T={T} label="Completed" value="2 / 6" sub="Both London" color={A.green}/><Tile T={T} label="Raised" value="£5k+" sub="for charity" color={A.blue}/><Tile T={T} label="Next Race" value="Berlin" sub="28 Sep 2026" color={"#FF9500"}/><Tile T={T} label="Sub-3 Goal" value="Seville" sub="Feb 2027" color={A.purple}/></div></Card>
    <Card T={T}><SectionHeader T={T} title="Race Pipeline" accent={A.blue} right={<EditBtn T={T} editing={editing} onToggle={()=>{if(editing)save();else{setEditRaces(races);setEditSponsorship(sponsorship);setEditing(true);}}}/>}/><div style={{display:"flex",flexDirection:"column",gap:8}}>{(editing?editRaces:races).map((r,i)=><div key={i} style={{background:r.next?`${A.blue}10`:T.surface2,borderRadius:14,padding:"14px 16px",border:r.next?`1.5px solid ${A.blue}30`:"1px solid transparent",opacity:r.done?0.45:1}}>{editing?<div style={{display:"flex",flexDirection:"column",gap:8}}><div style={{display:"flex",gap:8}}><TxtInput T={T} value={r.name} onChange={v=>setEditRaces(p=>p.map((x,j)=>j===i?{...x,name:v}:x))} style={{flex:1}}/><TxtInput T={T} value={r.date} onChange={v=>setEditRaces(p=>p.map((x,j)=>j===i?{...x,date:v}:x))} style={{width:120}}/></div><div style={{display:"flex",gap:8}}><TxtInput T={T} value={r.charity} onChange={v=>setEditRaces(p=>p.map((x,j)=>j===i?{...x,charity:v}:x))} style={{flex:1}}/><TxtInput T={T} value={r.target} onChange={v=>setEditRaces(p=>p.map((x,j)=>j===i?{...x,target:v}:x))} style={{width:100}}/></div><button onClick={()=>setEditRaces(p=>p.filter((_,j)=>j!==i))} style={{background:"transparent",border:"none",color:A.coral,cursor:"pointer",fontSize:12,textAlign:"left",fontFamily:sans}}>Remove</button></div>:<Row style={{flexWrap:"wrap",gap:8}}><div><div style={{fontSize:14,fontWeight:700,color:r.done?T.muted:r.next?A.blue:T.text,fontFamily:sans}}>{r.done?"✓ ":""}{r.name}</div><Sub T={T}>{r.date} · {r.charity}</Sub></div><Tag color={r.next?A.blue:T.sub}>{r.target}</Tag></Row>}</div>)}{editing&&<button onClick={()=>setEditRaces(p=>[...p,{name:"New Race",date:"TBC",charity:"TBC",target:"TBC"}])} style={{background:"transparent",border:`1.5px dashed ${T.border}`,borderRadius:14,padding:"10px",color:T.sub,cursor:"pointer",fontSize:13,fontFamily:sans}}>+ Add race</button>}</div></Card>
    <Card T={T}><SectionHeader T={T} title="Sponsorship" accent={A.green}/><div style={{display:"flex",flexDirection:"column",gap:6}}>{(editing?editSponsorship:sponsorship).map((s,i)=>{const col={success:A.green,pending:"#FF9500",future:A.purple}[s.state]||T.muted;return <Row key={i} style={{background:T.surface2,borderRadius:12,padding:"11px 14px",gap:10}}>{editing?<><TxtInput T={T} value={s.name} onChange={v=>setEditSponsorship(p=>p.map((x,j)=>j===i?{...x,name:v}:x))} style={{flex:1}}/><TxtInput T={T} value={s.status} onChange={v=>setEditSponsorship(p=>p.map((x,j)=>j===i?{...x,status:v}:x))} style={{flex:1}}/><select value={s.state} onChange={e=>setEditSponsorship(p=>p.map((x,j)=>j===i?{...x,state:e.target.value}:x))} style={{background:T.inputBg,border:`1px solid ${T.border}`,color:T.text,borderRadius:8,padding:"5px 8px",fontSize:11,fontFamily:sans}}><option value="success">Success</option><option value="pending">Pending</option><option value="future">Future</option></select><button onClick={()=>setEditSponsorship(p=>p.filter((_,j)=>j!==i))} style={{background:"transparent",border:"none",color:A.coral,cursor:"pointer",fontSize:18}}>×</button></>:<><span style={{fontSize:13,color:T.text,fontFamily:sans}}>{s.name}</span><span style={{fontSize:11,color:col,fontWeight:600,fontFamily:sans}}>{s.status}</span></>}</Row>;})}
    {editing&&<button onClick={()=>setEditSponsorship(p=>[...p,{name:"New Brand",status:"Applied",state:"pending"}])} style={{background:"transparent",border:`1.5px dashed ${T.border}`,borderRadius:12,padding:"8px",color:T.sub,cursor:"pointer",fontSize:13,fontFamily:sans}}>+ Add brand</button>}</div></Card>
  </div>;
}
// ─── CHAT ─────────────────────────────────────────────────────────────────────
function Chat({activities,stats,whoopData,whoopOk,onPlanSaved,onGymSaved,userPrefs,T}){
  const [messages,setMessages]=useState([{role:"assistant",content:"Hey Caleb! I've got your Strava, Whoop, nutrition and training plan loaded. What do you need?"}]);
  const [chatLoaded,setChatLoaded]=useState(false);const [input,setInput]=useState("");const [loading,setLoading]=useState(false);const [images,setImages]=useState([]);
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

PLAN FORMAT: When asked for a training plan, reply conversationally first (2-3 sentences on the logic, referencing recovery and sleep if relevant), then use exactly this format:
PLAN_START
TITLE: [title]
Mon | [type] | [X]km | [pace]/km | [shoe] | [description]
(one line per day, 7 days or 14 for 2 weeks)
PLAN_END
Rest days: Mon | Rest | 0km | N/A | N/A | Rest day
Types: Easy, Interval, Tempo, Long Run, Rest, Gym
Never plan more than 2 weeks at a time.

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
      const suffix=(plan?"\n\nTraining plan saved to your Plan tab.":"")+(gym?"\n\nGym workout saved to your Gym tab.":"");
      setMessages(prev=>[...prev,{role:"assistant",content:cleaned+suffix}]);
      if(plan&&onPlanSaved)onPlanSaved(plan);if(gym&&onGymSaved)onGymSaved(gym);
    }catch{setMessages(prev=>[...prev,{role:"assistant",content:"Something went wrong. Try again."}]);}
    setLoading(false);
  };
  const SUGGESTIONS=["How's my recovery today?","Plan my next week","Gym session please","Am I on track for sub 3:20?","Analyse my recent runs"];
  return <div style={{display:"flex",flexDirection:"column",height:"100%",fontFamily:sans}}>
    {messages.length<=1&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12,flexShrink:0}}>{SUGGESTIONS.map(s=><button key={s} onClick={()=>setInput(s)} style={{background:`${A.blue}12`,border:`1px solid ${A.blue}30`,color:A.blue,borderRadius:20,padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:sans,whiteSpace:"nowrap"}}>{s}</button>)}</div>}
    <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8,flexShrink:0}}><button onClick={()=>{const f=[{role:"assistant",content:"Hey Caleb! I've got your Strava, Whoop, nutrition and training plan loaded. What do you need?"}];setMessages(f);saveChatHistory(f);}} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.sub,borderRadius:20,padding:"4px 14px",fontSize:11,cursor:"pointer",fontFamily:sans}}>Clear chat</button></div>
    <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:8,paddingBottom:12}}>
      {messages.map((m,i)=><div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}><div style={{maxWidth:"80%",padding:"11px 15px",borderRadius:20,background:m.role==="user"?A.blue:T.surface,color:m.role==="user"?"#fff":T.text,border:m.role==="assistant"?`1px solid ${T.border}`:"none",fontSize:14,lineHeight:1.6,fontFamily:sans,whiteSpace:"pre-wrap",borderBottomRightRadius:m.role==="user"?4:20,borderBottomLeftRadius:m.role==="assistant"?4:20,boxShadow:m.role==="user"?`0 4px 20px ${A.blue}30`:"none"}}>{m.imagePreviews?.length>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:6}}>{m.imagePreviews.map((p,j)=><img key={j} src={p} alt="" style={{height:52,width:52,objectFit:"cover",borderRadius:8}}/>)}</div>}{m.content}</div></div>)}
      {loading&&<div style={{display:"flex",justifyContent:"flex-start"}}><div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:20,borderBottomLeftRadius:4,padding:"12px 16px",display:"flex",gap:5}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:T.muted,animation:`bounce .9s ${i*0.15}s infinite`}}/>)}</div></div>}
      <div ref={bottomRef}/>
    </div>
    {images.length>0&&<div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap",flexShrink:0}}>{images.map((img,i)=><div key={i} style={{position:"relative"}}><img src={img.preview} alt="" style={{height:52,width:52,objectFit:"cover",borderRadius:10,border:`1px solid ${T.border}`}}/><button onClick={()=>setImages(prev=>prev.filter((_,j)=>j!==i))} style={{position:"absolute",top:-5,right:-5,background:A.coral,color:"#fff",border:"none",borderRadius:"50%",width:16,height:16,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button></div>)}</div>}
    <div style={{display:"flex",gap:8,paddingTop:10,borderTop:`1px solid ${T.divider}`,alignItems:"flex-end",flexShrink:0}}>
      <button onClick={()=>fileRef.current?.click()} style={{background:T.surface2,border:`1px solid ${T.border}`,color:T.sub,borderRadius:20,padding:"10px 13px",fontSize:16,cursor:"pointer",flexShrink:0}}>📷</button>
      <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={handleImages}/>
      <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()} placeholder="Ask me anything..." style={{flex:1,background:T.surface2,border:`1.5px solid ${T.border}`,borderRadius:20,padding:"11px 16px",color:T.text,fontSize:14,outline:"none",fontFamily:sans}}/>
      <button onClick={send} disabled={loading||(!input.trim()&&!images.length)} style={{background:A.blue,color:"#fff",border:"none",borderRadius:20,padding:"11px 20px",fontSize:14,fontWeight:700,cursor:"pointer",opacity:loading||(!input.trim()&&!images.length)?0.4:1,fontFamily:sans,flexShrink:0,boxShadow:`0 4px 16px ${A.blue}40`}}>Send</button>
    </div>
  </div>;
}

// ─── MORE MENU ────────────────────────────────────────────────────────────────
// Pages accessible via the "More" bottom tab
const MORE_PAGES = [
  {id:"plan",     label:"Plan",      icon:"📋"},
  {id:"nutrition",label:"Nutrition", icon:"🥗"},
  {id:"races",    label:"Races",     icon:"🏅"},
  {id:"gym",      label:"Gym",       icon:"💪"},
];

function MoreMenu({page, setPage, T, whoopOk, onConnectWhoop, darkMode, setDarkMode, athlete, onDisconnect, onDisconnectWhoop}){
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10,paddingBottom:24}} className="page-enter">
      {/* Profile strip */}
      <div style={{background:`linear-gradient(135deg, ${T.heroFrom} 0%, #1a1a2e 100%)`,borderRadius:20,padding:"20px 20px 18px",display:"flex",alignItems:"center",gap:14}}>
        <div style={{width:48,height:48,background:`linear-gradient(135deg,${A.blue},${A.teal})`,borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 4px 16px ${A.blue}40`,flexShrink:0}}>
          <svg viewBox="0 0 24 24" width={24} height={24}><circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2"/><path d="M12 3 a9 9 0 0 1 9 9" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"/><rect x="7" y="10" width="10" height="1.8" rx="0.9" fill="white"/><rect x="7" y="13" width="8" height="1.8" rx="0.9" fill="white"/><rect x="7" y="16" width="6" height="1.8" rx="0.9" fill="white"/></svg>
        </div>
        <div>
          <div style={{fontSize:17,fontWeight:800,color:"#fff",fontFamily:sans,letterSpacing:"-0.02em"}}>Caleb Cunningham</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.45)",fontFamily:sans,marginTop:2}}>{athlete?.city||"Kingston"} · Berlin 28 Sep</div>
        </div>
      </div>

      {/* More pages grid */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {MORE_PAGES.map(n=>(
          <button key={n.id} onClick={()=>setPage(n.id)} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:18,padding:"18px 16px",display:"flex",flexDirection:"column",alignItems:"flex-start",gap:8,cursor:"pointer",textAlign:"left",transition:"all .15s"}}>
            <span style={{fontSize:26}}>{n.icon}</span>
            <div style={{fontSize:14,fontWeight:700,color:T.text,fontFamily:sans}}>{n.label}</div>
          </button>
        ))}
      </div>

      {/* Settings */}
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:20,overflow:"hidden"}}>
        {/* Dark mode */}
        <button onClick={()=>setDarkMode(!darkMode)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"15px 18px",background:"transparent",border:"none",cursor:"pointer",borderBottom:`1px solid ${T.divider}`}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:18}}>{darkMode?"☀️":"🌙"}</span>
            <span style={{fontSize:14,color:T.text,fontFamily:sans,fontWeight:500}}>{darkMode?"Light Mode":"Dark Mode"}</span>
          </div>
          <div style={{width:44,height:26,background:darkMode?A.blue:T.surface2,border:`1.5px solid ${darkMode?A.blue:T.border}`,borderRadius:13,position:"relative",transition:"all .2s"}}>
            <div style={{position:"absolute",top:2,left:darkMode?18:2,width:18,height:18,background:"#fff",borderRadius:"50%",transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,0.2)"}}/>
          </div>
        </button>

        {/* Whoop */}
        {!whoopOk ? (
          <button onClick={onConnectWhoop} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"15px 18px",background:"transparent",border:"none",cursor:"pointer",borderBottom:`1px solid ${T.divider}`}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:18}}>⌚</span>
              <span style={{fontSize:14,color:T.text,fontFamily:sans,fontWeight:500}}>Connect Whoop</span>
            </div>
            <span style={{fontSize:13,color:A.coral,fontWeight:600,fontFamily:sans}}>Connect →</span>
          </button>
        ) : (
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"15px 18px",borderBottom:`1px solid ${T.divider}`}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:18}}>⌚</span>
              <span style={{fontSize:14,color:T.text,fontFamily:sans,fontWeight:500}}>Whoop</span>
            </div>
            <span style={{fontSize:12,color:A.green,fontWeight:600,fontFamily:sans}}>✓ Connected</span>
          </div>
        )}

        {/* Disconnect buttons */}
        <div style={{display:"flex",gap:0}}>
          <button onClick={onDisconnect} style={{flex:1,padding:"13px 16px",background:"transparent",border:"none",borderRight:`1px solid ${T.divider}`,cursor:"pointer",fontSize:12,color:T.muted,fontFamily:sans}}>Disconnect Strava</button>
          {whoopOk&&<button onClick={onDisconnectWhoop} style={{flex:1,padding:"13px 16px",background:"transparent",border:"none",cursor:"pointer",fontSize:12,color:T.muted,fontFamily:sans}}>Disconnect Whoop</button>}
        </div>
      </div>
    </div>
  );
}

// ─── BOTTOM TAB BAR ──────────────────────────────────────────────────────────
const TABS = [
  {id:"overview", label:"Home",     icon:(active,color)=>(
    <svg width={23} height={23} viewBox="0 0 24 24" fill="none">
      <path d="M3 12L12 3l9 9" stroke={active?color:"currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 10v9a1 1 0 001 1h4v-4h4v4h4a1 1 0 001-1v-9" stroke={active?color:"currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill={active?`${color}18`:"none"}/>
    </svg>
  )},
  {id:"running",  label:"Running",  icon:(active,color)=>(
    <svg width={23} height={23} viewBox="0 0 24 24" fill="none">
      <circle cx="14" cy="4.5" r="1.8" fill={active?color:"currentColor"}/>
      <path d="M6 21l2.5-6L12 17l2.5-8" stroke={active?color:"currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8.5 15L6 21" stroke={active?color:"currentColor"} strokeWidth={2} strokeLinecap="round"/>
      <path d="M12.5 9l3.5-1.5 2.5 3.5-3.5 1" stroke={active?color:"currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )},
  {id:"plan",     label:"Plan",     icon:(active,color)=>(
    <svg width={23} height={23} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="18" rx="3" stroke={active?color:"currentColor"} strokeWidth={2} fill={active?`${color}15`:"none"}/>
      <path d="M16 2v4M8 2v4M3 10h18" stroke={active?color:"currentColor"} strokeWidth={2} strokeLinecap="round"/>
      <path d="M8 14h4M8 17h6" stroke={active?color:"currentColor"} strokeWidth={2} strokeLinecap="round"/>
    </svg>
  )},
  {id:"recovery", label:"Recovery", icon:(active,color)=>(
    <svg width={23} height={23} viewBox="0 0 24 24" fill="none">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke={active?color:"currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )},
  {id:"more",     label:"More",     icon:(active,color)=>(
    <svg width={23} height={23} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="5" r="1.5" fill={active?color:"currentColor"}/>
      <circle cx="12" cy="12" r="1.5" fill={active?color:"currentColor"}/>
      <circle cx="12" cy="19" r="1.5" fill={active?color:"currentColor"}/>
    </svg>
  )},
];

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App(){
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
  const T=THEMES[darkMode?"dark":"light"];

  // Active tab — "more" is a pseudo-tab that shows the MoreMenu view

  useEffect(()=>{localStorage.setItem("theme",darkMode?"dark":"light");},[darkMode]);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search),code=params.get("code"),pending=localStorage.getItem("whoop_pending");
    if(!code)return;
    if(pending){setWhoopPending(true);exchangeWhoopCode(code).then(()=>{setWhoopOk(true);setWhoopPending(false);}).catch(e=>{console.error(e);setWhoopPending(false);}).finally(()=>window.history.replaceState({},"","/"));}
    else if(!isConnected()){exchangeCode(code).then(()=>setConnected(true)).catch(console.error).finally(()=>window.history.replaceState({},"","/"));}
  },[]);

  useEffect(()=>{
    if(!connected)return;setLoading(true);
    Promise.all([getAthlete(),getActivities(100)])
      .then(([a,acts])=>{setAthlete(a);setActivities(acts);setBestEfforts(extractBestEfforts(acts));return Promise.all([getStats(a.id),getAllGear(a)]);})
      .then(([s,g])=>{setStats(s);setGear(g.filter(Boolean));})
      .catch(console.error).finally(()=>setLoading(false));
  },[connected]);

  const loadWhoop=useCallback(()=>{if(whoopOk)getWhoopData().then(setWhoopData).catch(console.error);},[whoopOk]);
  useEffect(()=>{loadWhoop();},[loadWhoop]);
  useEffect(()=>{loadUserPrefs().then(p=>{if(p)setUserPrefs(p);});},[]);

  const handleSavePrefs=useCallback(prefs=>{setUserPrefs(prefs);saveUserPrefs(prefs);},[]);
  const handleConnectWhoop=()=>window.location.assign(getWhoopAuthUrl());
  if(!connected||whoopPending)return <ConnectScreen whoopPending={whoopPending} T={T}/>;

  const sharedProps={activities,stats,whoopData,whoopOk,onConnectWhoop:handleConnectWhoop,onRefreshWhoop:loadWhoop,T};
  const goToChat=()=>setPage("chat");

  const views={
    overview:<Overview {...sharedProps} bestEfforts={bestEfforts} gear={gear} userPrefs={userPrefs} onSavePrefs={handleSavePrefs} onGoToChat={goToChat} onNav={setPage} athlete={athlete}/>,
    running:<Running activities={activities} stats={stats} gear={gear} T={T}/>,
    gym:<Gym activities={activities} userPrefs={userPrefs} onSavePrefs={handleSavePrefs} savedWorkout={savedWorkout} T={T}/>,
    recovery:<Recovery {...sharedProps}/>,
    plan:<TrainingPlan onChat={goToChat} onGoToChat={goToChat} externalPlan={savedPlan} whoopData={whoopData} T={T}/>,
    nutrition:<Nutrition userPrefs={userPrefs} onSavePrefs={handleSavePrefs} T={T}/>,
    races:<Races userPrefs={userPrefs} onSavePrefs={handleSavePrefs} T={T}/>,
    chat:<Chat {...sharedProps} onPlanSaved={setSavedPlan} onGymSaved={setSavedWorkout} userPrefs={userPrefs}/>,
    more:<MoreMenu page={page} setPage={setPage} T={T} whoopOk={whoopOk} onConnectWhoop={handleConnectWhoop} darkMode={darkMode} setDarkMode={setDarkMode} athlete={athlete} onDisconnect={()=>{disconnect();setConnected(false);setActivities([]);}} onDisconnectWhoop={()=>{disconnectWhoop();setWhoopOk(false);setWhoopData(null);}}/>,
  };

  const currentView = views[page] || views.more;
  const recScore = whoopData?.recoveries?.records?.[0] ? Math.round(whoopData.recoveries.records[0].score?.recovery_score||0) : null;
  const recColor = recScore!=null?(recScore>=67?A.green:recScore>=34?A.yellow:A.coral):T.muted;
  const activeTab = TABS.find(t=>t.id===page) ? page : (MORE_PAGES.find(p=>p.id===page) ? "more" : "overview");
  const pageTitleMap = {overview:"Home",running:"Running",plan:"Plan",recovery:"Recovery",more:"More",gym:"Gym",nutrition:"Nutrition",races:"Races",chat:"Coach"};
  const pageTitle = pageTitleMap[page] || "More";

  return (
    <div style={{height:"100vh",background:T.bg,color:T.text,fontFamily:sans,overflow:"hidden",display:"flex"}}>
      <style>{GLOBAL_CSS}</style>
      <style>{`
        @media(min-width:800px){.desktop-side{display:flex!important}}
        @media(max-width:799px){.desktop-side{display:none!important}}
      `}</style>

      {/* ── DESKTOP LEFT SIDEBAR ── */}
      <div className="desktop-side" style={{display:"none",flexDirection:"column",width:220,borderRight:`1px solid ${T.navBorder}`,background:T.navBg,flexShrink:0,height:"100vh",overflowY:"auto"}}>
        {/* Logo */}
        <div style={{padding:"28px 20px 20px",display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:34,height:34,background:`linear-gradient(135deg,${A.blue},${A.teal})`,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`0 4px 12px ${A.blue}30`}}>
            <svg viewBox="0 0 24 24" width={18} height={18}><circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2"/><path d="M12 3 a9 9 0 0 1 9 9" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"/><rect x="7" y="10" width="10" height="1.8" rx="0.9" fill="white"/><rect x="7" y="13" width="8" height="1.8" rx="0.9" fill="white"/><rect x="7" y="16" width="6" height="1.8" rx="0.9" fill="white"/></svg>
          </div>
          <div>
            <div style={{fontSize:13,fontWeight:800,color:T.text,fontFamily:sans,letterSpacing:"-0.02em",lineHeight:1.1}}>Fitness</div>
            <div style={{fontSize:11,color:T.sub,fontFamily:sans}}>Dashboard</div>
          </div>
        </div>
        {/* Nav items */}
        <nav style={{padding:"0 10px",flex:1}}>
          {[...TABS.filter(t=>t.id!=="more"),...MORE_PAGES].map(n=>{
            const isActive=page===n.id;
            return (
              <button key={n.id} onClick={()=>setPage(n.id)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"10px 12px",background:isActive?`${A.blue}12`:"transparent",borderRadius:12,border:"none",cursor:"pointer",color:isActive?A.blue:T.sub,fontSize:13,fontWeight:isActive?700:400,fontFamily:sans,textAlign:"left",marginBottom:1,transition:"all .15s",position:"relative"}}>
                {isActive&&<div style={{position:"absolute",left:0,top:"50%",transform:"translateY(-50%)",width:3,height:18,background:A.blue,borderRadius:"0 3px 3px 0"}}/>}
                <span style={{marginLeft:4}}>{"icon" in n&&typeof n.icon==="function"?n.icon(isActive,A.blue):<span style={{fontSize:15}}>{n.icon}</span>}</span>
                <span>{"label" in n?n.label:n.id}</span>
              </button>
            );
          })}
          {/* Coach button */}
          <button onClick={goToChat} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"10px 12px",background:page==="chat"?`${A.blue}12`:"transparent",borderRadius:12,border:"none",cursor:"pointer",color:page==="chat"?A.blue:T.sub,fontSize:13,fontWeight:page==="chat"?700:400,fontFamily:sans,textAlign:"left",marginBottom:1,transition:"all .15s",position:"relative"}}>
            {page==="chat"&&<div style={{position:"absolute",left:0,top:"50%",transform:"translateY(-50%)",width:3,height:18,background:A.blue,borderRadius:"0 3px 3px 0"}}/>}
            <span style={{marginLeft:4}}>
              <svg width={23} height={23} viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke={page==="chat"?A.blue:T.sub} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill={page==="chat"?`${A.blue}15`:"none"}/></svg>
            </span>
            <span>Coach</span>
          </button>
        </nav>
        {/* Bottom settings */}
        <div style={{padding:"12px 18px 24px",borderTop:`1px solid ${T.divider}`}}>
          {recScore!=null&&<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,padding:"8px 10px",background:T.surface2,borderRadius:12}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:recColor,boxShadow:`0 0 8px ${recColor}`}}/>
            <div style={{fontSize:12,color:T.sub,fontFamily:sans}}><span style={{color:recColor,fontWeight:700}}>{recScore}%</span> recovery</div>
          </div>}
          <button onClick={()=>setDarkMode(d=>!d)} style={{display:"flex",alignItems:"center",gap:8,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:"7px 10px",cursor:"pointer",fontSize:11,color:T.sub,fontFamily:sans,width:"100%",marginBottom:8}}>
            <span>{darkMode?"☀️":"🌙"}</span><span>{darkMode?"Light mode":"Dark mode"}</span>
          </button>
          {whoopOk?<div style={{fontSize:11,color:A.green,fontWeight:600,fontFamily:sans}}>✓ Whoop connected</div>:<button onClick={handleConnectWhoop} style={{background:"transparent",border:`1px solid ${A.coral}`,borderRadius:10,padding:"6px 10px",color:A.coral,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:sans,width:"100%"}}>Connect Whoop</button>}
        </div>
      </div>

      {/* ── MAIN COLUMN ── */}
      <div style={{flex:1,display:"flex",flexDirection:"column",height:"100vh",overflow:"hidden",minWidth:0}}>

        {/* Top bar */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 18px 12px",flexShrink:0}}>
          <div>
            <div style={{fontSize:11,fontWeight:600,color:T.muted,fontFamily:sans,letterSpacing:"0.05em",textTransform:"uppercase"}}>Fitness Dashboard</div>
            <div style={{fontSize:22,fontWeight:800,color:T.text,fontFamily:sans,letterSpacing:"-0.03em",lineHeight:1.15,marginTop:1}}>{pageTitle}</div>
          </div>
          {recScore!=null&&(
            <div style={{display:"flex",alignItems:"center",gap:6,background:T.surface,border:`1px solid ${T.border}`,borderRadius:20,padding:"6px 12px"}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:recColor,boxShadow:`0 0 6px ${recColor}`}}/>
              <span style={{fontSize:12,color:T.sub,fontFamily:sans,fontWeight:600}}>{recScore}%</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div style={{flex:1,overflowY:page==="chat"?"hidden":"auto",padding:"0 16px",WebkitOverflowScrolling:"touch",display:"flex",flexDirection:"column"}}>
          {loading?<Loader T={T} text="Loading your data..."/>:currentView}
        </div>

        {/* ── BOTTOM TAB BAR (mobile only) ── */}
        <div style={{flexShrink:0,background:T.navBg,borderTop:`1px solid ${T.navBorder}`,paddingBottom:"env(safe-area-inset-bottom,4px)",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)"}}>
          <style>{`@media(min-width:800px){.mobile-tabs{display:none!important}}`}</style>
          <div className="mobile-tabs" style={{display:"flex",alignItems:"center",height:56,padding:"0 8px"}}>
            {TABS.map(tab=>{
              const isActive=activeTab===tab.id;
              return (
                <button key={tab.id} onClick={()=>setPage(tab.id)} style={{flex:isActive?0:1,display:"flex",alignItems:"center",justifyContent:"center",background:"transparent",border:"none",cursor:"pointer",padding:0,transition:"all .2s ease"}}>
                  {isActive
                    ? <div style={{display:"flex",alignItems:"center",gap:7,background:A.blue,borderRadius:24,padding:"8px 16px",boxShadow:`0 2px 12px ${A.blue}40`,transition:"all .2s ease"}}>
                        {tab.icon(true,"#fff")}
                        <span style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:sans,whiteSpace:"nowrap"}}>{tab.label}</span>
                      </div>
                    : <div style={{display:"flex",alignItems:"center",justifyContent:"center",width:44,height:44,color:T.muted}}>
                        {tab.icon(false,T.muted)}
                      </div>
                  }
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── FLOATING CHAT BUTTON (mobile only) ── */}
      <style>{`@media(min-width:800px){.chat-fab{display:none!important}}.chat-fab{position:fixed;bottom:calc(env(safe-area-inset-bottom,0px) + 76px);right:16px;z-index:100}`}</style>
      {page!=="chat"&&(
        <button className="chat-fab" onClick={goToChat} style={{width:52,height:52,borderRadius:"50%",background:`linear-gradient(135deg,${A.blue},${A.teal})`,border:"none",cursor:"pointer",boxShadow:`0 4px 20px ${A.blue}50`,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="rgba(255,255,255,0.15)"/></svg>
        </button>
      )}
    </div>
  );
}
