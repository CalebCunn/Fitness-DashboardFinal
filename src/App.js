import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { isConnected, disconnect, exchangeCode, getAthlete, getStats, getActivities, getActivity, getStreams, getAllGear, extractBestEfforts } from "./strava";
import { isWhoopConnected, disconnectWhoop, exchangeWhoopCode, getWhoopAuthUrl, getWhoopData } from "./whoop";
import { loadChatHistory, saveChatHistory, loadTrainingPlan, saveTrainingPlan, loadUserPrefs, saveUserPrefs } from "./supabase";
import { LIFTS as DEFAULT_LIFTS, RACES as DEFAULT_RACES, fPace, fTime, fDist, actType, typeCol, weeklyVol } from "./data";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const A = "#5B4FCF";  // primary accent – warm indigo
const AL = "#EAE8F8"; // accent light tint
const G = "#16A34A";  // green
const GL = "#DCFCE7";
const R = "#DC2626";  // red
const RL = "#FEE2E2";
const O = "#D97706";  // amber
const OL = "#FEF3C7";
const V = "#7C3AED";  // violet
const TL = {
  bg:"#FAFAF9", card:"#FFFFFF", card2:"#F5F5F3", border:"rgba(0,0,0,0.07)",
  div:"rgba(0,0,0,0.05)", text:"#0C0C0C", sub:"#5A5A5A", muted:"#9A9A9A",
  nav:"#FFFFFF", navSh:"0 -1px 0 rgba(0,0,0,0.06)",
  sh:"0 1px 3px rgba(0,0,0,0.05),0 6px 18px rgba(0,0,0,0.06)",
  shMd:"0 2px 6px rgba(0,0,0,0.06),0 12px 28px rgba(0,0,0,0.08)",
};
const TD = {
  bg:"#0F0F11", card:"#1C1C20", card2:"#272729", border:"rgba(255,255,255,0.08)",
  div:"rgba(255,255,255,0.05)", text:"#F2F2F2", sub:"#9A9A9E", muted:"#5A5A60",
  nav:"#1C1C20", navSh:"0 -1px 0 rgba(255,255,255,0.06)",
  sh:"0 1px 3px rgba(0,0,0,0.25),0 6px 18px rgba(0,0,0,0.20)",
  shMd:"0 2px 6px rgba(0,0,0,0.28),0 12px 28px rgba(0,0,0,0.25)",
};
const F = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',sans-serif";
const r = "22px"; // border radius

const CSS = `
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
::-webkit-scrollbar{width:0;height:0}
button,input,textarea,select{font-family:inherit}
@keyframes up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
.page{animation:up .2s ease both}
`;

// ─── PRIMITIVES ───────────────────────────────────────────────────────────────
const Row = ({ch,sx={}}) => <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",...sx}}>{ch}</div>;

function Card({ch,sx={},T,tap,np}){
  const [p,setP]=useState(false);
  return <div onClick={tap}
    onPointerDown={tap?()=>setP(true):null} onPointerUp={tap?()=>setP(false):null} onPointerLeave={tap?()=>setP(false):null}
    style={{background:T.card,borderRadius:r,boxShadow:T.sh,padding:np?0:22,
      cursor:tap?"pointer":"default",transform:p&&tap?"scale(0.975)":"scale(1)",
      transition:"transform .12s ease",...sx}}>
    {ch}
  </div>;
}

function Pill({ch,color=A,ghost=false,sm=false,full=false,tap,disabled=false,loading=false,sx={}}){
  const [p,setP]=useState(false);
  return <button onClick={tap} disabled={disabled||loading}
    onPointerDown={()=>setP(true)} onPointerUp={()=>setP(false)} onPointerLeave={()=>setP(false)}
    style={{background:ghost?"transparent":disabled?"#ccc":color,color:ghost?color:"#fff",
      border:`1.5px solid ${ghost?color:disabled?"#ccc":color}`,borderRadius:100,
      padding:sm?"7px 16px":"12px 24px",fontSize:sm?13:15,fontWeight:600,letterSpacing:"-.01em",
      width:full?"100%":"auto",display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,
      opacity:disabled?.45:1,transform:p?"scale(.96)":"scale(1)",transition:"transform .1s",...sx}}>
    {loading&&<span style={{width:13,height:13,border:"2px solid rgba(255,255,255,.3)",borderTop:"2px solid #fff",borderRadius:"50%",display:"inline-block",animation:"spin .7s linear infinite"}}/>}
    {ch}
  </button>;
}

function Badge({ch,color=A}){
  return <span style={{background:`${color}18`,color,borderRadius:100,padding:"3px 10px",fontSize:11,fontWeight:600,fontFamily:F,display:"inline-block"}}>{ch}</span>;
}

function Spin({T}){
  return <div style={{display:"flex",alignItems:"center",justifyContent:"center",flex:1,minHeight:180}}>
    <div style={{width:32,height:32,border:`2.5px solid ${T.card2}`,borderTop:`2.5px solid ${A}`,borderRadius:"50%",animation:"spin .8s linear infinite"}}/>
  </div>;
}

function Skel({T,h=80}){
  const dark=T===TD;
  return <div style={{borderRadius:r,height:h,background:`linear-gradient(90deg,${T.card2} 0%,${dark?"#2e2e32":"#ebebeb"} 50%,${T.card2} 100%)`,backgroundSize:"400px 100%",animation:"shimmer 1.4s infinite"}}/>;
}

const CT=({active,payload,label,T})=>{
  if(!active||!payload?.length)return null;
  return <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"8px 12px",boxShadow:T.shMd,fontFamily:F}}>
    {label&&<div style={{fontSize:11,color:T.muted,marginBottom:3}}>{label}</div>}
    {payload.map((p,i)=><div key={i} style={{fontSize:13,fontWeight:600,color:p.color||A}}>{p.name}: {p.value}</div>)}
  </div>;
};

// Recovery ring
function RecRing({score=0,size=96,sw=9}){
  const col=score>=67?G:score>=34?O:R;
  const r2=(size-sw)/2,c=2*Math.PI*r2,d=(Math.min(score,100)/100)*c;
  const label=score>=67?"PRIMED":score>=34?"MODERATE":"LOW";
  return <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
    <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
      <circle cx={size/2} cy={size/2} r={r2} fill="none" stroke={`${col}20`} strokeWidth={sw}/>
      <circle cx={size/2} cy={size/2} r={r2} fill="none" stroke={col} strokeWidth={sw}
        strokeDasharray={`${d} ${c}`} strokeLinecap="round" style={{transition:"stroke-dasharray .9s cubic-bezier(.4,0,.2,1)"}}/>
    </svg>
    <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1}}>
      <span style={{fontSize:size*.22,fontWeight:800,color:col,fontFamily:F,letterSpacing:"-.03em",lineHeight:1}}>{score}%</span>
      <span style={{fontSize:size*.095,fontWeight:600,color:col,opacity:.7,fontFamily:F,letterSpacing:".04em"}}>{label}</span>
    </div>
  </div>;
}

function calcStreaks(acts){
  const runs=[...new Set(acts.filter(a=>a.type==="Run"||a.sport_type==="Run").map(r=>new Date(r.start_date_local).toISOString().split("T")[0]))].sort().reverse();
  if(!runs.length)return{current:0,longest:0};
  const today=new Date();today.setHours(0,0,0,0);
  const check=new Date(today);let cur=0;
  for(const d of runs){if(d===check.toISOString().split("T")[0]){cur++;check.setDate(check.getDate()-1);}else break;}
  let long=0,s=1;
  for(let i=1;i<runs.length;i++){const df=(new Date(runs[i-1])-new Date(runs[i]))/86400000;if(df===1){s++;long=Math.max(long,s);}else s=1;}
  return{current:cur,longest:Math.max(long,cur)};
}

// ─── LOGO / ICON ──────────────────────────────────────────────────────────────
function ApexIcon({size=32,style={}}){
  return <div style={{width:size,height:size,borderRadius:size*.24,background:A,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 4px 14px ${A}45`,flexShrink:0,...style}}>
    <svg viewBox="0 0 24 24" width={size*.55} height={size*.55} fill="none">
      <path d="M13 3L4 14h7.5L10 21l10-11h-7.5L13 3z" fill="white" strokeLinejoin="round"/>
    </svg>
  </div>;
}

function ApexWordmark({T,size=22}){
  return <div style={{display:"flex",alignItems:"center",gap:9}}>
    <ApexIcon size={size*1.6}/>
    <span style={{fontSize:size,fontWeight:800,color:T.text,fontFamily:F,letterSpacing:"-.04em"}}>Apex</span>
  </div>;
}

// ─── CONNECT SCREEN ───────────────────────────────────────────────────────────
function Connect({T}){
  const id=process.env.REACT_APP_STRAVA_CLIENT_ID;
  const url=`https://www.strava.com/oauth/authorize?client_id=${id}&redirect_uri=${encodeURIComponent(window.location.origin)}&response_type=code&scope=read,activity:read_all`;
  return(
    <div style={{height:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:28}}>
      <div style={{width:"100%",maxWidth:340,textAlign:"center",animation:"up .3s ease"}}>
        <ApexIcon size={72} style={{margin:"0 auto 20px"}}/>
        <h1 style={{fontSize:36,fontWeight:800,color:T.text,fontFamily:F,letterSpacing:"-.04em",marginBottom:8}}>Apex</h1>
        <p style={{fontSize:15,color:T.sub,fontFamily:F,lineHeight:1.6,marginBottom:40}}>Your personal performance platform. Connect Strava to begin.</p>
        <a href={url} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,background:"#FC4C02",color:"#fff",borderRadius:100,padding:"15px 28px",fontSize:15,fontWeight:700,textDecoration:"none",fontFamily:F,boxShadow:"0 4px 20px rgba(252,76,2,.4)",marginBottom:12}}>
          <svg viewBox="0 0 24 24" width={18} height={18} fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg>
          Connect with Strava
        </a>
        <p style={{fontSize:12,color:T.muted,fontFamily:F}}>Read-only · Your data stays private</p>
      </div>
    </div>
  );
}

// ─── ACTIVITY DETAIL ──────────────────────────────────────────────────────────
function RunDetail({id,onBack,T}){
  const [act,setAct]=useState(null);
  const [streams,setStreams]=useState(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{Promise.all([getActivity(id),getStreams(id)]).then(([a,s])=>{setAct(a);setStreams(s);}).catch(console.error).finally(()=>setLoading(false));},[id]);
  if(loading)return <div className="page" style={{display:"flex",flexDirection:"column",gap:14,paddingBottom:32}}><button onClick={onBack} style={{background:"transparent",border:"none",color:A,fontSize:15,fontWeight:600,fontFamily:F,display:"flex",alignItems:"center",gap:6,padding:0}}><svg viewBox="0 0 24 24" width={18} height={18} fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"/></svg>Back</button><Skel T={T} h={200}/><Skel T={T} h={160}/><Skel T={T} h={120}/></div>;
  if(!act)return null;

  const type=actType(act);
  const col=typeCol(type);
  const laps=act.laps||[];
  const hrs=streams?.heartrate?.data||[];
  const times=streams?.time?.data||[];
  const alts=streams?.altitude?.data||[];
  const cads=streams?.cadence?.data||[];

  // Build pace-per-km from streams
  const vels=streams?.velocity_smooth?.data||[];
  const paceKm=[];
  if(vels.length>0&&times.length>0){
    let lastKm=0,lastT=0,kmDist=0;
    for(let i=1;i<vels.length;i++){
      const dt=times[i]-times[i-1];
      const dd=(vels[i]+vels[i-1])/2*dt;
      kmDist+=dd;
      if(kmDist>=1000){
        const elapsed=times[i]-lastT;
        paceKm.push({km:paceKm.length+1,pace:parseFloat((elapsed/60/1).toFixed(2)),hr:hrs[i]?Math.round(hrs[i]):null});
        lastKm+=1000;lastT=times[i];kmDist-=1000;
      }
    }
  } else if(laps.length>1){
    laps.forEach((lap,i)=>{paceKm.push({km:i+1,pace:lap.average_speed?parseFloat((1000/lap.average_speed/60).toFixed(2)):null,hr:lap.average_heartrate?Math.round(lap.average_heartrate):null});});
  }

  // HR zones
  const MAX_HR=208;
  const zoneDefs=[{name:"Z1 Easy",min:0,max:.6,col:"#10B981"},{name:"Z2 Aerobic",min:.6,max:.7,col:"#22C55E"},{name:"Z3 Tempo",min:.7,max:.8,col:"#F59E0B"},{name:"Z4 Threshold",min:.8,max:.9,col:"#EF4444"},{name:"Z5 Max",min:.9,max:1,col:"#DC2626"}];
  const zoneTime=zoneDefs.map(z=>{const secs=hrs.filter(h=>h/MAX_HR>=z.min&&h/MAX_HR<z.max).length;return{...z,secs,pct:hrs.length?Math.round(secs/hrs.length*100):0};});

  // Alt chart
  const altChart=alts.filter((_,i)=>i%20===0).map((v,i)=>({t:Math.round((times[i*20]||0)/60),alt:Math.round(v)}));

  const stats=[
    {l:"Distance",v:`${(act.distance/1000).toFixed(2)}km`},
    {l:"Time",v:fTime(act.moving_time)},
    {l:"Avg pace",v:`${fPace(act.average_speed)}/km`},
    act.average_heartrate&&{l:"Avg HR",v:`${Math.round(act.average_heartrate)} bpm`},
    act.max_heartrate&&{l:"Max HR",v:`${act.max_heartrate} bpm`},
    act.average_cadence&&{l:"Cadence",v:`${Math.round(act.average_cadence*2)} spm`},
    act.total_elevation_gain>0&&{l:"Elevation",v:`+${Math.round(act.total_elevation_gain)}m`},
    act.calories&&{l:"Calories",v:`${act.calories} kcal`},
    act.suffer_score&&{l:"Suffer score",v:act.suffer_score},
  ].filter(Boolean);

  return(
    <div className="page" style={{display:"flex",flexDirection:"column",gap:16,paddingBottom:32}}>
      <button onClick={onBack} style={{background:"transparent",border:"none",color:A,fontSize:15,fontWeight:600,fontFamily:F,display:"flex",alignItems:"center",gap:6,padding:0,alignSelf:"flex-start"}}>
        <svg viewBox="0 0 24 24" width={18} height={18} fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"/></svg>
        Activities
      </button>

      {/* Hero */}
      <div style={{background:T.card,borderRadius:r,overflow:"hidden",boxShadow:T.sh}}>
        <div style={{background:`linear-gradient(135deg,${col}18,${col}08)`,padding:"22px 22px 18px",borderBottom:`1px solid ${T.border}`}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,marginBottom:12}}>
            <div style={{flex:1,minWidth:0}}>
              <h2 style={{fontSize:20,fontWeight:700,color:T.text,fontFamily:F,letterSpacing:"-.025em",marginBottom:4,lineHeight:1.2}}>{act.name}</h2>
              <p style={{fontSize:13,color:T.sub,fontFamily:F}}>{new Date(act.start_date_local).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}{act.gear?.name?` · ${act.gear.name}`:""}</p>
            </div>
            <Badge ch={type} color={col}/>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",padding:"6px 0"}}>
          {stats.slice(0,6).map((s,i)=>(
            <div key={i} style={{padding:"14px 18px",borderRight:i%3<2?`1px solid ${T.div}`:"none",borderBottom:i<3?`1px solid ${T.div}`:"none"}}>
              <p style={{fontSize:11,color:T.muted,fontFamily:F,marginBottom:4,fontWeight:500}}>{s.l}</p>
              <p style={{fontSize:18,fontWeight:700,color:i===2?A:T.text,fontFamily:F,letterSpacing:"-.02em"}}>{s.v}</p>
            </div>
          ))}
        </div>
        {stats.length>6&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",borderTop:`1px solid ${T.div}`}}>
          {stats.slice(6).map((s,i)=>(
            <div key={i} style={{padding:"12px 18px",borderRight:(i+6)%3<2?`1px solid ${T.div}`:"none"}}>
              <p style={{fontSize:11,color:T.muted,fontFamily:F,marginBottom:3,fontWeight:500}}>{s.l}</p>
              <p style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F}}>{s.v}</p>
            </div>
          ))}
        </div>}
      </div>

      {/* Pace per km */}
      {paceKm.length>2&&(
        <Card T={T} ch={<>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <h3 style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F}}>Pace per km</h3>
            <span style={{fontSize:12,color:T.muted,fontFamily:F}}>min/km · lower is faster</span>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={paceKm} barCategoryGap="20%">
              <XAxis dataKey="km" tick={{fontSize:10,fill:T.muted,fontFamily:F}} tickLine={false} axisLine={false}/>
              <YAxis tick={{fontSize:10,fill:T.muted}} tickLine={false} axisLine={false} width={28} domain={["auto","auto"]} reversed/>
              <Tooltip content={<CT T={T}/>}/>
              <Bar dataKey="pace" name="Pace" radius={[5,5,2,2]}>
                {paceKm.map((entry,i)=>{
                  const target=act.average_speed?1000/act.average_speed/60:null;
                  const fast=target&&entry.pace<target*.98;
                  return <Cell key={i} fill={fast?G:i===paceKm.length-1?A:`${A}80`}/>;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </>}/>
      )}

      {/* HR zones */}
      {hrs.length>0&&(
        <Card T={T} ch={<>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <h3 style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F}}>Heart rate zones</h3>
            {act.average_heartrate&&<span style={{fontSize:13,color:R,fontWeight:700,fontFamily:F}}>{Math.round(act.average_heartrate)} avg</span>}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {zoneTime.map((z,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:12,color:T.sub,fontFamily:F,minWidth:88}}>{z.name}</span>
                <div style={{flex:1,height:6,background:T.card2,borderRadius:3,overflow:"hidden"}}>
                  <div style={{width:`${z.pct}%`,height:"100%",background:z.col,borderRadius:3,transition:"width .6s ease"}}/>
                </div>
                <span style={{fontSize:12,fontWeight:700,color:z.pct>0?z.col:T.muted,minWidth:34,textAlign:"right",fontFamily:F}}>{z.pct}%</span>
              </div>
            ))}
          </div>
          <div style={{marginTop:14,padding:"12px 0 0",borderTop:`1px solid ${T.div}`,display:"flex",gap:20}}>
            {[{l:"Min HR",v:`${Math.min(...hrs)} bpm`},{l:"Max HR",v:`${Math.max(...hrs)} bpm`},{l:"Avg HR",v:`${Math.round(hrs.reduce((a,b)=>a+b,0)/hrs.length)} bpm`}].map((s,i)=>(
              <div key={i}><p style={{fontSize:10,color:T.muted,fontFamily:F,marginBottom:2}}>{s.l}</p><p style={{fontSize:14,fontWeight:700,color:T.text,fontFamily:F}}>{s.v}</p></div>
            ))}
          </div>
        </>}/>
      )}

      {/* Splits table */}
      {laps.length>1&&(
        <Card T={T} np sx={{overflow:"hidden"}} ch={<>
          <div style={{padding:"20px 22px 14px",borderBottom:`1px solid ${T.div}`}}>
            <h3 style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F}}>Splits</h3>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr",padding:"0 0 8px"}}>
            <div style={{display:"grid",gridTemplateColumns:"36px 1fr 1fr 1fr 1fr",padding:"8px 22px",borderBottom:`1px solid ${T.div}`}}>
              {["#","Distance","Time","Pace","HR"].map(h=><span key={h} style={{fontSize:10,fontWeight:600,color:T.muted,fontFamily:F}}>{h}</span>)}
            </div>
            {laps.map((lap,i)=>{
              const lapPace=fPace(lap.average_speed);
              const avgPace=fPace(act.average_speed);
              const faster=lap.average_speed>act.average_speed;
              return(
                <div key={i} style={{display:"grid",gridTemplateColumns:"36px 1fr 1fr 1fr 1fr",padding:"10px 22px",borderBottom:i<laps.length-1?`1px solid ${T.div}`:"none",background:i%2===0?"transparent":`${T.bg}60`}}>
                  <span style={{fontSize:13,fontWeight:700,color:T.muted,fontFamily:F}}>{i+1}</span>
                  <span style={{fontSize:13,color:T.text,fontFamily:F}}>{(lap.distance/1000).toFixed(2)}km</span>
                  <span style={{fontSize:13,color:T.text,fontFamily:F}}>{fTime(lap.elapsed_time)}</span>
                  <span style={{fontSize:13,fontWeight:700,color:faster?G:R,fontFamily:F}}>{lapPace}</span>
                  <span style={{fontSize:13,color:lap.average_heartrate?R:T.muted,fontFamily:F}}>{lap.average_heartrate?`${Math.round(lap.average_heartrate)}`:"—"}</span>
                </div>
              );
            })}
          </div>
        </>}/>
      )}

      {/* Elevation */}
      {altChart.length>3&&(
        <Card T={T} ch={<>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <h3 style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F}}>Elevation</h3>
            {act.total_elevation_gain&&<span style={{fontSize:13,fontWeight:700,color:G,fontFamily:F}}>+{Math.round(act.total_elevation_gain)}m</span>}
          </div>
          <ResponsiveContainer width="100%" height={90}>
            <AreaChart data={altChart}>
              <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={G} stopOpacity={.2}/><stop offset="100%" stopColor={G} stopOpacity={0}/></linearGradient></defs>
              <XAxis dataKey="t" tick={{fontSize:10,fill:T.muted}} tickLine={false} axisLine={false} unit="m"/>
              <YAxis tick={{fontSize:10,fill:T.muted}} tickLine={false} axisLine={false} width={28} domain={["auto","auto"]}/>
              <Tooltip content={<CT T={T}/>}/>
              <Area type="monotone" dataKey="alt" name="Alt" stroke={G} fill="url(#ag)" strokeWidth={2} dot={false}/>
            </AreaChart>
          </ResponsiveContainer>
        </>}/>
      )}

      {/* Best efforts */}
      {act.best_efforts?.length>0&&(
        <Card T={T} ch={<>
          <h3 style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F,marginBottom:14}}>Best efforts this run</h3>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {act.best_efforts.slice(0,6).map((b,i)=>(
              <div key={i} style={{background:T.card2,borderRadius:14,padding:"13px 14px"}}>
                <p style={{fontSize:11,color:T.muted,fontFamily:F,marginBottom:5,fontWeight:500}}>{b.name}</p>
                <p style={{fontSize:18,fontWeight:800,color:A,fontFamily:F,letterSpacing:"-.02em"}}>{fTime(b.moving_time)}</p>
                <p style={{fontSize:11,color:T.sub,fontFamily:F,marginTop:2}}>{fPace(b.distance/b.moving_time)}/km</p>
              </div>
            ))}
          </div>
        </>}/>
      )}
    </div>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function Home({acts,stats,whoop,whoopOk,connectWhoop,athlete,plan,nav,T}){
  const today=new Date();
  const hr=today.getHours();
  const greet=hr<5?"Good night":hr<12?"Good morning":hr<18?"Good afternoon":"Good evening";
  const rec=whoop?.recoveries?.records?.[0];
  const sleep=whoop?.sleeps?.records?.[0];
  const cyc=whoop?.cycles?.records?.[0];
  const recScore=Math.round(rec?.score?.recovery_score||0);
  const hrv=Math.round(rec?.score?.hrv_rmssd_milli||0);
  const rhr=Math.round(rec?.score?.resting_heart_rate||0);
  const slScore=Math.round(sleep?.score?.sleep_performance_percentage||0);
  const slH=sleep?.score?.stage_summary?.total_in_bed_time_milli?(sleep.score.stage_summary.total_in_bed_time_milli/3600000).toFixed(1):"–";
  const strain=parseFloat(cyc?.score?.strain||0).toFixed(1);
  const recCol=recScore>=67?G:recScore>=34?O:R;

  const ws=new Date(today);ws.setDate(today.getDate()-((today.getDay()+6)%7));ws.setHours(0,0,0,0);
  const weekRuns=acts.filter(a=>(a.type==="Run"||a.sport_type==="Run")&&new Date(a.start_date_local)>=ws);
  const weekKm=weekRuns.reduce((s,r)=>s+(r.distance||0)/1000,0);
  const ytd=stats?.ytd_run_totals||{};
  const streaks=calcStreaks(acts);
  const berlin=new Date("2026-09-28"),daysLeft=Math.max(0,Math.ceil((berlin-today)/86400000));
  const blockPct=Math.min(100,Math.max(0,Math.round(((today-new Date("2026-06-22"))/(berlin-new Date("2026-06-22")))*100)));

  const dayNames=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const todaySess=(plan?.sessions||[]).filter(s=>s.day===dayNames[today.getDay()]&&s.type!=="Rest");
  const sessTypeCol={Easy:G,Interval:R,Tempo:O,"Long Run":A,Gym:V};

  const recentRuns=acts.filter(a=>a.type==="Run"||a.sport_type==="Run").slice(0,3);
  const vol=weeklyVol(acts);

  const PBs=[{d:"5K",t:"18:42",p:"3:44"},{d:"10K",t:"40:52",p:"4:05"},{d:"Half",t:"1:32:48",p:"4:23"},{d:"Marathon",t:"3:48:59",p:"5:25"}];

  return(
    <div className="page" style={{display:"flex",flexDirection:"column",gap:16,paddingBottom:32}}>

      {/* Greeting */}
      <div style={{paddingTop:4}}>
        <p style={{fontSize:13,color:T.sub,fontFamily:F,marginBottom:3}}>{today.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}</p>
        <h1 style={{fontSize:28,fontWeight:700,color:T.text,fontFamily:F,letterSpacing:"-.03em",lineHeight:1.15}}>{greet}, {athlete?.firstname||"Caleb"}</h1>
      </div>

      {/* Recovery – the hero card */}
      {whoopOk&&rec?(
        <div style={{background:T.card,borderRadius:r,overflow:"hidden",boxShadow:T.sh}}>
          {/* Dark header strip */}
          <div style={{background:T===TD?"#111115":"#1a1a22",padding:"20px 22px 18px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
              <div>
                <p style={{fontSize:12,color:"rgba(255,255,255,.4)",fontFamily:F,fontWeight:500,marginBottom:4}}>Recovery</p>
                <span style={{background:`${recCol}22`,color:recCol,borderRadius:100,padding:"4px 10px",fontSize:11,fontWeight:600,fontFamily:F}}>WHOOP · just now</span>
              </div>
              <RecRing score={recScore} size={80} sw={7}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:0}}>
              {[{l:"HRV",v:`${hrv}ms`,c:G},{l:"Resting HR",v:`${rhr}bpm`,c:R},{l:"Sleep",v:`${slH}h · ${slScore}%`,c:A}].map((s,i)=>(
                <div key={i} style={{paddingRight:i<2?20:0,paddingLeft:i>0?20:0,borderRight:i<2?"1px solid rgba(255,255,255,.08)":"none"}}>
                  <p style={{fontSize:10,color:"rgba(255,255,255,.35)",fontFamily:F,marginBottom:3}}>{s.l}</p>
                  <p style={{fontSize:16,fontWeight:700,color:s.c,fontFamily:F,letterSpacing:"-.02em"}}>{s.v}</p>
                </div>
              ))}
            </div>
          </div>
          {/* Strain bar */}
          <div style={{padding:"13px 22px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <p style={{fontSize:13,color:T.sub,fontFamily:F}}>Daily strain</p>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:72,height:4,background:T.card2,borderRadius:2,overflow:"hidden"}}>
                <div style={{width:`${Math.min(parseFloat(strain),21)/21*100}%`,height:"100%",background:O,borderRadius:2}}/>
              </div>
              <span style={{fontSize:14,fontWeight:700,color:O,fontFamily:F}}>{strain}</span>
            </div>
          </div>
        </div>
      ):!whoopOk&&(
        <Card T={T} ch={
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div><p style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:F,marginBottom:2}}>Recovery</p><p style={{fontSize:13,color:T.sub,fontFamily:F}}>Connect Whoop for recovery data</p></div>
            <Pill ch="Connect" color={R} sm tap={connectWhoop}/>
          </div>
        }/>
      )}

      {/* Today's session */}
      <div style={{background:`linear-gradient(135deg,${A} 0%,#7C6FD4 100%)`,borderRadius:r,padding:22,boxShadow:`0 6px 28px ${A}35`}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,marginBottom:todaySess.length>0?16:0}}>
          <div>
            <p style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,.45)",fontFamily:F,letterSpacing:".04em",textTransform:"uppercase",marginBottom:4}}>Today</p>
            <p style={{fontSize:18,fontWeight:700,color:"#fff",fontFamily:F,letterSpacing:"-.02em"}}>{todaySess.length>0?"Your session":"Rest day"}</p>
          </div>
          <button onClick={()=>nav("coach")} style={{background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.25)",borderRadius:100,padding:"7px 16px",color:"#fff",fontSize:13,fontWeight:600,fontFamily:F}}>Ask Claude</button>
        </div>
        {todaySess.length>0&&todaySess.map((s,i)=>{
          const sc=sessTypeCol[s.type]||"rgba(255,255,255,.7)";
          return <div key={i} style={{background:"rgba(255,255,255,.12)",borderRadius:14,padding:"13px 16px",display:"flex",alignItems:"center",gap:12,marginTop:i>0?8:0}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:"rgba(255,255,255,.9)",flexShrink:0}}/>
            <div style={{flex:1}}>
              <p style={{fontSize:14,fontWeight:600,color:"#fff",fontFamily:F}}>{s.type}</p>
              <p style={{fontSize:12,color:"rgba(255,255,255,.5)",fontFamily:F,marginTop:1}}>{[s.dist&&s.dist!=="0km"&&s.dist,s.pace&&s.pace!=="N/A"&&s.pace].filter(Boolean).join(" · ")}</p>
            </div>
            {s.done&&<span style={{fontSize:12,color:G,fontWeight:600,fontFamily:F}}>Done ✓</span>}
          </div>;
        })}
        <div style={{marginTop:todaySess.length>0?16:0,paddingTop:14,borderTop:`1px solid rgba(255,255,255,.1)`,marginBottom:-4}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
            <p style={{fontSize:12,color:"rgba(255,255,255,.4)",fontFamily:F}}>Berlin block · {daysLeft} days</p>
            <p style={{fontSize:12,color:"rgba(255,255,255,.6)",fontFamily:F,fontWeight:600}}>{blockPct}%</p>
          </div>
          <div style={{height:3,background:"rgba(255,255,255,.12)",borderRadius:2}}>
            <div style={{width:`${blockPct}%`,height:"100%",background:"rgba(255,255,255,.7)",borderRadius:2,transition:"width 1s"}}/>
          </div>
        </div>
      </div>

      {/* This week + YTD */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Card T={T} tap={()=>nav("activity")} ch={<>
          <p style={{fontSize:11,color:T.muted,fontFamily:F,fontWeight:500,marginBottom:6}}>This week</p>
          <p style={{fontSize:32,fontWeight:800,color:A,fontFamily:F,letterSpacing:"-.04em",lineHeight:1}}>{weekKm.toFixed(1)}<span style={{fontSize:14,fontWeight:500,color:T.sub}}>km</span></p>
          <p style={{fontSize:12,color:T.sub,fontFamily:F,marginTop:4}}>{weekRuns.length} runs{streaks.current>0?` · ${streaks.current}d 🔥`:""}</p>
          {vol.length>1&&<div style={{display:"flex",alignItems:"flex-end",gap:2.5,marginTop:12,height:24}}>
            {vol.slice(-8).map((w,i,arr)=>{
              const mx=Math.max(...arr.map(x=>x.km),1);
              return <div key={i} style={{flex:1,height:`${Math.max(6,(w.km/mx)*100)}%`,background:i===arr.length-1?A:`${A}40`,borderRadius:2,transition:"height .4s ease"}}/>;
            })}
          </div>}
        </>}/>
        <Card T={T} tap={()=>nav("activity")} ch={<>
          <p style={{fontSize:11,color:T.muted,fontFamily:F,fontWeight:500,marginBottom:6}}>YTD Distance</p>
          <p style={{fontSize:32,fontWeight:800,color:T.text,fontFamily:F,letterSpacing:"-.04em",lineHeight:1}}>{ytd.distance?(ytd.distance/1000).toFixed(0):"450"}<span style={{fontSize:14,fontWeight:500,color:T.sub}}>km</span></p>
          <p style={{fontSize:12,color:T.sub,fontFamily:F,marginTop:4}}>{ytd.count||58} runs total</p>
        </>}/>
      </div>

      {/* Recent runs */}
      {recentRuns.length>0&&(
        <Card T={T} np ch={<>
          <div style={{padding:"20px 22px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <h2 style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F}}>Recent runs</h2>
            <button onClick={()=>nav("activity")} style={{fontSize:13,color:A,fontWeight:600,background:"transparent",border:"none",fontFamily:F}}>See all</button>
          </div>
          {recentRuns.map((run,i)=>{
            const typ=actType(run),col=typeCol(typ);
            return(
              <div key={run.id} style={{padding:"13px 22px",borderTop:`1px solid ${T.div}`,display:"flex",alignItems:"center",gap:14}}>
                <div style={{width:42,height:42,borderRadius:13,background:`${col}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <svg viewBox="0 0 24 24" width={20} height={20} fill="none">
                    <circle cx="14" cy="4" r="1.8" fill={col}/>
                    <path d="M6.5 21l2.5-6 3 2 2.5-8" stroke={col} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M9 15L6.5 21" stroke={col} strokeWidth={2} strokeLinecap="round"/>
                    <path d="M12.5 9l3.5-1.5 2.5 3-3.5 1.5" stroke={col} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <p style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:F,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:2}}>{run.name}</p>
                  <p style={{fontSize:12,color:T.sub,fontFamily:F}}>{new Date(run.start_date_local).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}</p>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <p style={{fontSize:16,fontWeight:700,color:A,fontFamily:F,letterSpacing:"-.01em"}}>{(run.distance/1000).toFixed(2)}km</p>
                  <p style={{fontSize:12,color:T.sub,fontFamily:F,marginTop:1}}>{fPace(run.average_speed)}/km</p>
                </div>
              </div>
            );
          })}
        </>}/>
      )}

      {/* PBs */}
      <Card T={T} np ch={<>
        <div style={{padding:"20px 22px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <h2 style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F}}>Personal bests</h2>
          <Badge ch="Strava" color={G}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr"}}>
          {PBs.map((pb,i)=>(
            <div key={i} style={{padding:"14px 22px",borderTop:`1px solid ${T.div}`,borderRight:i%2===0?`1px solid ${T.div}`:"none"}}>
              <p style={{fontSize:11,color:T.muted,fontFamily:F,fontWeight:500,marginBottom:5}}>{pb.d}</p>
              <p style={{fontSize:22,fontWeight:800,color:G,fontFamily:F,letterSpacing:"-.03em",lineHeight:1}}>{pb.t}</p>
              <p style={{fontSize:11,color:T.sub,fontFamily:F,marginTop:3}}>{pb.p}/km</p>
            </div>
          ))}
        </div>
      </>}/>

      {/* Berlin */}
      <Card T={T} ch={
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
          <div style={{flex:1}}>
            <p style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:F,marginBottom:3}}>Berlin · Sub 3:20</p>
            <p style={{fontSize:12,color:T.sub,fontFamily:F,marginBottom:14}}>28 Sep 2026 · target 4:44/km</p>
            <div style={{height:5,background:T.card2,borderRadius:3,overflow:"hidden"}}>
              <div style={{width:`${blockPct}%`,height:"100%",background:A,borderRadius:3,transition:"width 1s"}}/>
            </div>
            <p style={{fontSize:11,color:T.muted,fontFamily:F,marginTop:5}}>Block {blockPct}% complete</p>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <p style={{fontSize:48,fontWeight:800,color:A,fontFamily:F,letterSpacing:"-.04em",lineHeight:1}}>{daysLeft}</p>
            <p style={{fontSize:12,color:T.muted,fontFamily:F}}>days</p>
          </div>
        </div>
      }/>
    </div>
  );
}

// ─── ACTIVITY FEED ────────────────────────────────────────────────────────────
function Activity({acts,gear,T}){
  const [sel,setSel]=useState(null);
  const [filter,setFilter]=useState("all");
  const warnShoes=gear.filter(s=>(s.distance||0)/1000>650);
  const vol=weeklyVol(acts);
  if(sel)return <RunDetail id={sel} onBack={()=>setSel(null)} T={T}/>;
  const filtered=acts.filter(a=>filter==="all"||(filter==="run"&&(a.type==="Run"||a.sport_type==="Run"))||(filter==="gym"&&a.type!=="Run"&&a.sport_type!=="Run"));
  return(
    <div className="page" style={{display:"flex",flexDirection:"column",gap:16,paddingBottom:32}}>
      {warnShoes.length>0&&(
        <div style={{background:RL,borderRadius:r,padding:"14px 18px",display:"flex",gap:12,alignItems:"center"}}>
          <span style={{fontSize:20}}>👟</span>
          <div><p style={{fontSize:13,fontWeight:700,color:R,fontFamily:F}}>Shoes need replacing soon</p><p style={{fontSize:12,color:T.sub,fontFamily:F}}>{warnShoes.map(s=>s.name).join(", ")} · over 650km</p></div>
        </div>
      )}

      {/* Weekly volume */}
      <Card T={T} ch={<>
        <p style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F,marginBottom:14}}>Weekly volume</p>
        <ResponsiveContainer width="100%" height={110}>
          <BarChart data={vol} barCategoryGap="22%">
            <defs><linearGradient id="vg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={A} stopOpacity={.9}/><stop offset="100%" stopColor={A} stopOpacity={.3}/></linearGradient></defs>
            <XAxis dataKey="week" tick={{fontSize:10,fill:T.muted,fontFamily:F}} tickLine={false} axisLine={false} interval={2}/>
            <YAxis tick={{fontSize:10,fill:T.muted}} tickLine={false} axisLine={false} width={22} unit="k"/>
            <Tooltip content={<CT T={T}/>}/>
            <Bar dataKey="km" name="km" fill="url(#vg)" radius={[6,6,2,2]}/>
          </BarChart>
        </ResponsiveContainer>
      </>}/>

      {/* Shoe mileage */}
      {gear.length>0&&(
        <Card T={T} ch={<>
          <p style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F,marginBottom:14}}>Shoe mileage</p>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {gear.map((s,i)=>{
              const km=(s.distance||0)/1000,pct=Math.min(100,Math.round(km/800*100));
              const col=pct>80?R:pct>50?O:G;
              return <div key={i}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:6}}>
                  <div>
                    <p style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:F}}>{s.name}</p>
                    {s.brand_name&&<p style={{fontSize:11,color:T.sub,fontFamily:F}}>{s.brand_name}</p>}
                  </div>
                  <p style={{fontSize:14,fontWeight:700,color:col,fontFamily:F}}>{km.toFixed(0)}km</p>
                </div>
                <div style={{height:5,background:T.card2,borderRadius:3,overflow:"hidden"}}>
                  <div style={{width:`${pct}%`,height:"100%",background:col,borderRadius:3}}/>
                </div>
                <p style={{fontSize:10,color:pct>80?R:T.muted,fontFamily:F,marginTop:4}}>{pct>80?"⚠ Replace soon · ":""}{pct}% of 800km</p>
              </div>;
            })}
          </div>
        </>}/>
      )}

      {/* Filter + feed */}
      <div>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          {[["all","All"],["run","Runs"],["gym","Strength"]].map(([id,l])=>(
            <button key={id} onClick={()=>setFilter(id)} style={{borderRadius:100,padding:"6px 16px",border:`1.5px solid ${filter===id?A:T.border}`,background:filter===id?A:"transparent",color:filter===id?"#fff":T.sub,fontSize:13,fontWeight:500,fontFamily:F,transition:"all .15s"}}>{l}</button>
          ))}
        </div>
        <Card T={T} np ch={
          <div style={{display:"flex",flexDirection:"column"}}>
            {filtered.slice(0,30).map((act,i)=>{
              const typ=actType(act),col=typeCol(typ);
              return(
                <button key={act.id} onClick={()=>setSel(act.id)}
                  style={{padding:"15px 22px",borderTop:i===0?"none":`1px solid ${T.div}`,display:"flex",alignItems:"center",gap:14,background:"transparent",border:"none",textAlign:"left",cursor:"pointer"}}>
                  <div style={{width:44,height:44,borderRadius:14,background:`${col}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <svg viewBox="0 0 24 24" width={22} height={22} fill="none">
                      <circle cx="14" cy="4" r="1.8" fill={col}/>
                      <path d="M6.5 21l2.5-6 3 2 2.5-8" stroke={col} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M9 15L6.5 21" stroke={col} strokeWidth={2} strokeLinecap="round"/>
                      <path d="M12.5 9l3.5-1.5 2.5 3-3.5 1.5" stroke={col} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:F,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3}}>{act.name}</p>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <Badge ch={typ} color={col}/>
                      <span style={{fontSize:12,color:T.sub,fontFamily:F}}>{new Date(act.start_date_local).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</span>
                    </div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <p style={{fontSize:16,fontWeight:700,color:A,fontFamily:F,letterSpacing:"-.01em"}}>{(act.distance/1000).toFixed(2)}km</p>
                    <p style={{fontSize:12,color:T.sub,fontFamily:F,marginTop:1}}>{fPace(act.average_speed)}/km</p>
                  </div>
                  <svg viewBox="0 0 24 24" width={14} height={14} fill="none"><path d="M9 18l6-6-6-6" stroke={T.muted} strokeWidth={2} strokeLinecap="round"/></svg>
                </button>
              );
            })}
          </div>
        }/>
      </div>
    </div>
  );
}

// ─── PLAN ─────────────────────────────────────────────────────────────────────
function PlanScreen({exPlan,whoopData,acts,openCoach,T}){
  const [plan,setPlan]=useState(null);
  const [loaded,setLoaded]=useState(false);
  const [view,setView]=useState("week");
  const [debrief,setDebrief]=useState(null);
  useEffect(()=>{loadTrainingPlan().then(p=>{if(p)setPlan(p);setLoaded(true);}).catch(()=>setLoaded(true));},[]);
  useEffect(()=>{if(exPlan&&loaded){setPlan(exPlan);saveTrainingPlan(exPlan);}},[exPlan,loaded]);
  const save=p=>{setPlan(p);saveTrainingPlan(p);};
  const toggle=i=>{
    const s=plan.sessions[i];const nd=!s.done;
    save({...plan,sessions:plan.sessions.map((ss,j)=>j===i?{...ss,done:nd}:ss)});
    if(nd&&s.type!=="Rest"&&s.type!=="Gym")setDebrief({...s,idx:i});
  };
  const edit=(i,u)=>save({...plan,sessions:plan.sessions.map((s,j)=>j===i?{...s,...u}:s)});
  const saveDebrief=d=>{if(debrief)save({...plan,sessions:plan.sessions.map((s,j)=>j===debrief.idx?{...s,debrief:d}:s)});setDebrief(null);};
  const rec=whoopData?.recoveries?.records?.[0];
  const recScore=Math.round(rec?.score?.recovery_score||0);
  const low=rec&&recScore<34;
  const done=plan?plan.sessions.filter(s=>s.done).length:0;
  const total=plan?plan.sessions.filter(s=>s.type!=="Rest").length:0;
  const TC={Easy:G,Interval:R,Tempo:O,"Long Run":A,Gym:V,Rest:T.muted};

  if(!loaded)return <div className="page" style={{display:"flex",flexDirection:"column",gap:14,paddingBottom:32}}><Skel T={T} h={120}/><Skel T={T} h={400}/></div>;

  if(!plan)return(
    <div className="page" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,padding:40,gap:24,textAlign:"center"}}>
      <div style={{width:80,height:80,borderRadius:24,background:AL,display:"flex",alignItems:"center",justifyContent:"center",fontSize:36}}>📋</div>
      <div>
        <h2 style={{fontSize:22,fontWeight:700,color:T.text,fontFamily:F,marginBottom:8}}>No plan yet</h2>
        <p style={{fontSize:15,color:T.sub,fontFamily:F,lineHeight:1.65,maxWidth:260}}>Ask Claude to build your next week. It factors in your recovery and recent training load.</p>
      </div>
      <Pill ch="Ask Claude" color={A} tap={openCoach}/>
    </div>
  );

  return(
    <div className="page" style={{display:"flex",flexDirection:"column",gap:16,paddingBottom:32}}>
      {low&&(
        <div style={{background:RL,borderRadius:r,padding:"14px 18px",display:"flex",gap:12,alignItems:"center"}}>
          <span style={{fontSize:20}}>⚠️</span>
          <div style={{flex:1}}>
            <p style={{fontSize:13,fontWeight:700,color:R,fontFamily:F}}>Recovery {recScore}% — consider adjusting</p>
            <p style={{fontSize:12,color:T.sub,fontFamily:F}}>Low recovery today. Ask Claude to shift your session.</p>
          </div>
          <button onClick={openCoach} style={{background:R,border:"none",borderRadius:100,padding:"6px 14px",color:"#fff",fontSize:12,fontWeight:600,fontFamily:F}}>Adjust</button>
        </div>
      )}

      {/* Plan header */}
      <Card T={T} ch={<>
        <h2 style={{fontSize:18,fontWeight:700,color:T.text,fontFamily:F,letterSpacing:"-.025em",marginBottom:plan.startDate?3:14}}>{plan.title}</h2>
        {plan.startDate&&<p style={{fontSize:13,color:T.sub,fontFamily:F,marginBottom:14}}>Starting {new Date(plan.startDate).toLocaleDateString("en-GB",{day:"numeric",month:"long"})}</p>}
        {total>0&&<>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
            <p style={{fontSize:13,color:T.sub,fontFamily:F}}>{done} of {total} sessions done</p>
            <p style={{fontSize:13,fontWeight:700,color:A,fontFamily:F}}>{Math.round(done/total*100)}%</p>
          </div>
          <div style={{height:5,background:T.card2,borderRadius:3,overflow:"hidden",marginBottom:14}}>
            <div style={{width:`${Math.round(done/total*100)}%`,height:"100%",background:A,borderRadius:3,transition:"width .5s"}}/>
          </div>
        </>}
        <div style={{display:"flex",gap:8}}>
          {[["week","Sessions"],["calendar","Calendar"]].map(([id,l])=>(
            <button key={id} onClick={()=>setView(id)} style={{flex:1,padding:"8px 0",borderRadius:12,border:`1.5px solid ${view===id?A:T.border}`,background:view===id?A:"transparent",color:view===id?"#fff":T.sub,fontSize:13,fontWeight:600,fontFamily:F}}>{l}</button>
          ))}
          <button onClick={()=>save(null)} style={{padding:"8px 14px",borderRadius:12,border:`1.5px solid ${T.border}`,background:"transparent",color:T.muted,fontSize:13,fontFamily:F}}>Clear</button>
        </div>
      </>}/>

      {view==="week"&&(
        <Card T={T} np ch={plan.sessions.map((s,i)=><PlanRow key={i} s={s} i={i} col={TC[s.type]||A} TC={TC} onToggle={()=>toggle(i)} onEdit={u=>edit(i,u)} T={T}/>)}/>
      )}

      {view==="calendar"&&<CalView plan={plan} acts={acts} T={T}/>}

      <div style={{background:T.card2,borderRadius:r,padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <p style={{fontSize:13,color:T.sub,fontFamily:F}}>Need to adjust this plan?</p>
        <Pill ch="Ask Claude" color={A} sm tap={openCoach}/>
      </div>

      {debrief&&<DebriefModal s={debrief} onSave={saveDebrief} onSkip={()=>setDebrief(null)} T={T}/>}
    </div>
  );
}

function PlanRow({s,i,col,TC,onToggle,onEdit,T}){
  const [open,setOpen]=useState(false);
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState({...s});
  const isRest=s.type==="Rest";

  if(isRest&&!editing)return(
    <div style={{padding:"12px 22px",borderBottom:`1px solid ${T.div}`,display:"flex",alignItems:"center",gap:12,opacity:.4}}>
      <div style={{width:30,height:30,borderRadius:"50%",border:`1.5px solid ${T.border}`,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:6,height:6,borderRadius:"50%",background:T.muted}}/></div>
      <p style={{flex:1,fontSize:13,color:T.sub,fontFamily:F}}>{s.day} · Rest{s.date?` · ${new Date(s.date).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}`:""}</p>
      <button onClick={()=>{setDraft({...s});setEditing(true);}} style={{background:"transparent",border:"none",color:T.muted,fontSize:11,fontFamily:F}}>Edit</button>
    </div>
  );

  if(editing)return(
    <div style={{padding:"18px 22px",borderBottom:`1px solid ${T.div}`}}>
      <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
        <select value={draft.type} onChange={e=>setDraft(p=>({...p,type:e.target.value}))} style={{flex:1,background:T.card2,border:`1px solid ${T.border}`,borderRadius:10,padding:"8px 10px",fontSize:13,color:T.text,fontFamily:F,outline:"none"}}>
          {["Easy","Interval","Tempo","Long Run","Gym","Rest"].map(t=><option key={t}>{t}</option>)}
        </select>
        <input value={draft.dist||""} onChange={e=>setDraft(p=>({...p,dist:e.target.value}))} placeholder="Distance" style={{width:96,background:T.card2,border:`1px solid ${T.border}`,borderRadius:10,padding:"8px 10px",fontSize:13,color:T.text,fontFamily:F,outline:"none"}}/>
      </div>
      <input value={draft.pace||""} onChange={e=>setDraft(p=>({...p,pace:e.target.value}))} placeholder="Target pace e.g. 5:00-5:15/km" style={{width:"100%",background:T.card2,border:`1px solid ${T.border}`,borderRadius:10,padding:"8px 10px",fontSize:13,color:T.text,fontFamily:F,outline:"none",marginBottom:8}}/>
      <input value={draft.shoe||""} onChange={e=>setDraft(p=>({...p,shoe:e.target.value}))} placeholder="Shoe" style={{width:"100%",background:T.card2,border:`1px solid ${T.border}`,borderRadius:10,padding:"8px 10px",fontSize:13,color:T.text,fontFamily:F,outline:"none",marginBottom:8}}/>
      <textarea value={draft.notes||""} onChange={e=>setDraft(p=>({...p,notes:e.target.value}))} placeholder="Session notes..." rows={2} style={{width:"100%",background:T.card2,border:`1px solid ${T.border}`,borderRadius:10,padding:"8px 10px",fontSize:13,color:T.text,fontFamily:F,outline:"none",resize:"none",marginBottom:12}}/>
      <div style={{display:"flex",gap:8}}>
        <Pill ch="Save" color={A} sm full tap={()=>{onEdit(draft);setEditing(false);}}/>
        <Pill ch="Cancel" color={T.muted} sm ghost tap={()=>setEditing(false)}/>
      </div>
    </div>
  );

  return(
    <div style={{borderBottom:`1px solid ${T.div}`}}>
      <div style={{display:"flex",alignItems:"center",gap:14,padding:"15px 22px"}}>
        <button onClick={onToggle} style={{width:30,height:30,borderRadius:"50%",background:s.done?G:`${col}15`,border:`2px solid ${s.done?G:col}`,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s"}}>
          {s.done?<svg viewBox="0 0 24 24" width={14} height={14} fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"/></svg>:<div style={{width:8,height:8,borderRadius:"50%",background:col}}/>}
        </button>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:3}}>
            <span style={{fontSize:14,fontWeight:600,color:s.done?G:T.text,fontFamily:F,textDecoration:s.done?"line-through":"none"}}>{s.type}</span>
            {s.dist&&s.dist!=="0km"&&<Badge ch={s.dist} color={col}/>}
            {s.pace&&s.pace!=="N/A"&&<Badge ch={s.pace} color={A}/>}
          </div>
          {s.shoe&&s.shoe!=="N/A"&&<p style={{fontSize:11,color:V,fontFamily:F}}>👟 {s.shoe}</p>}
          {!open&&s.notes&&<p style={{fontSize:12,color:T.sub,fontFamily:F,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.notes}</p>}
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <p style={{fontSize:11,color:T.muted,fontFamily:F}}>{s.day?.slice(0,3)}</p>
          {s.date&&<p style={{fontSize:10,color:T.muted,fontFamily:F}}>{new Date(s.date).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</p>}
        </div>
        <button onClick={()=>{setDraft({...s});setEditing(true);}} style={{background:"transparent",border:"none",color:T.muted,padding:4}}>
          <svg viewBox="0 0 24 24" width={14} height={14} fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth={2} strokeLinecap="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth={2} strokeLinecap="round"/></svg>
        </button>
        <button onClick={()=>setOpen(!open)} style={{background:"transparent",border:"none",color:T.muted,fontSize:12,padding:4}}>{open?"▲":"▼"}</button>
      </div>
      {open&&s.notes&&<p style={{padding:"0 22px 14px 64px",fontSize:13,color:T.sub,fontFamily:F,lineHeight:1.6}}>{s.notes}</p>}
      {open&&s.debrief&&<div style={{padding:"0 22px 14px 64px",display:"flex",gap:8,alignItems:"center"}}>
        <span style={{fontSize:20}}>{["😵","😓","😐","😊","🔥"][s.debrief.feel-1]}</span>
        <span style={{fontSize:12,color:T.sub,fontFamily:F}}>{s.debrief.notes||"No debrief notes"}</span>
      </div>}
    </div>
  );
}

function CalView({plan,acts,T}){
  const [vd,setVd]=useState(new Date());
  const [sel,setSel]=useState(null);
  const y=vd.getFullYear(),m=vd.getMonth();
  const first=new Date(y,m,1),last=new Date(y,m+1,0);
  const pad=(first.getDay()+6)%7;
  const days=[];for(let i=0;i<pad;i++)days.push(null);for(let d=1;d<=last.getDate();d++)days.push(new Date(y,m,d));
  const pbd={};if(plan?.sessions){const st=new Date(plan.startDate||new Date());st.setHours(0,0,0,0);plan.sessions.forEach((s,i)=>{const d=new Date(st);d.setDate(st.getDate()+i);pbd[d.toISOString().split("T")[0]]=(pbd[d.toISOString().split("T")[0]]||[]).concat(s);});}
  const rbd={};acts.filter(a=>a.type==="Run"||a.sport_type==="Run").forEach(a=>{const k=new Date(a.start_date_local).toISOString().split("T")[0];rbd[k]=(rbd[k]||[]).concat(a);});
  const tod=new Date().toISOString().split("T")[0];
  const selK=sel?.toISOString().split("T")[0];
  const TC={Easy:G,Interval:R,Tempo:O,"Long Run":A,Gym:V};
  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <Card T={T} ch={<>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <button onClick={()=>setVd(new Date(y,m-1,1))} style={{background:T.card2,border:`1px solid ${T.border}`,borderRadius:10,padding:"6px 12px",fontSize:16,color:T.text}}>‹</button>
          <p style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:F}}>{vd.toLocaleDateString("en-GB",{month:"long",year:"numeric"})}</p>
          <button onClick={()=>setVd(new Date(y,m+1,1))} style={{background:T.card2,border:`1px solid ${T.border}`,borderRadius:10,padding:"6px 12px",fontSize:16,color:T.text}}>›</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:6}}>
          {["M","T","W","T","F","S","S"].map((d,i)=><p key={i} style={{textAlign:"center",fontSize:10,fontWeight:600,color:T.muted,fontFamily:F,padding:"2px 0"}}>{d}</p>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
          {days.map((date,i)=>{
            if(!date)return <div key={i}/>;
            const k=date.toISOString().split("T")[0];
            const isToday=k===tod,isSel=k===selK;
            const plans=pbd[k]||[],runs=rbd[k]||[];
            const hasP=plans.some(s=>s.type!=="Rest"),hasR=runs.length>0;
            const pc=TC[plans[0]?.type]||A,done=plans.some(s=>s.done);
            return(
              <button key={k} onClick={()=>setSel(isSel?null:date)}
                style={{aspectRatio:"1",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",padding:"5px 2px 2px",background:isSel?A:isToday?AL:"transparent",borderRadius:11,border:`1.5px solid ${isToday&&!isSel?A:"transparent"}`,cursor:"pointer"}}>
                <span style={{fontSize:12,fontWeight:isToday?700:400,color:isSel?"#fff":isToday?A:T.text,fontFamily:F}}>{date.getDate()}</span>
                <div style={{display:"flex",gap:2,marginTop:2}}>
                  {hasP&&<div style={{width:4,height:4,borderRadius:"50%",background:isSel?"rgba(255,255,255,.8)":done?G:pc}}/>}
                  {hasR&&<div style={{width:4,height:4,borderRadius:"50%",background:isSel?"rgba(255,255,255,.8)":G}}/>}
                </div>
              </button>
            );
          })}
        </div>
      </>}/>
      {sel&&(()=>{
        const k=sel.toISOString().split("T")[0];
        const plans=pbd[k]||[],runs=rbd[k]||[];
        return(
          <Card T={T} ch={<>
            <p style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:F,marginBottom:12}}>{sel.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}</p>
            {plans.map((s,i)=><div key={i} style={{background:T.card2,borderRadius:12,padding:"10px 14px",marginBottom:8,display:"flex",gap:10,alignItems:"center"}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:s.done?G:(TC[s.type]||A),flexShrink:0}}/>
              <div style={{flex:1}}>
                <p style={{fontSize:13,fontWeight:600,color:T.text,fontFamily:F}}>{s.type}</p>
                {(s.dist||s.pace)&&<p style={{fontSize:11,color:T.sub,fontFamily:F}}>{[s.dist!=="0km"&&s.dist,s.pace!=="N/A"&&s.pace].filter(Boolean).join(" · ")}</p>}
              </div>
              {s.done&&<Badge ch="Done" color={G}/>}
            </div>)}
            {runs.map((r,i)=><div key={i} style={{background:T.card2,borderRadius:12,padding:"10px 14px",marginBottom:8,display:"flex",gap:10,alignItems:"center"}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:G,flexShrink:0}}/>
              <div style={{flex:1}}>
                <p style={{fontSize:13,fontWeight:600,color:T.text,fontFamily:F}}>{r.name}</p>
                <p style={{fontSize:11,color:T.sub,fontFamily:F}}>{(r.distance/1000).toFixed(2)}km · {fPace(r.average_speed)}/km</p>
              </div>
            </div>)}
            {plans.length===0&&runs.length===0&&<p style={{fontSize:13,color:T.muted,fontFamily:F,textAlign:"center",padding:"8px 0"}}>Rest day</p>}
          </>}/>
        );
      })()}
    </div>
  );
}

function DebriefModal({s,onSave,onSkip,T}){
  const [feel,setFeel]=useState(3);const [notes,setNotes]=useState("");
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:999,display:"flex",alignItems:"flex-end",justifyContent:"center",padding:"0 16px 32px",animation:"fadeIn .2s ease"}}>
      <div style={{background:T.card,borderRadius:r,padding:24,width:"100%",maxWidth:440,animation:"slideUp .25s ease"}}>
        <p style={{fontSize:17,fontWeight:700,color:T.text,fontFamily:F,marginBottom:2}}>How did that go?</p>
        <p style={{fontSize:13,color:T.sub,fontFamily:F,marginBottom:18}}>{s.type}{s.dist&&s.dist!=="0km"?" · "+s.dist:""}</p>
        <div style={{display:"flex",justifyContent:"space-around",marginBottom:10}}>
          {[1,2,3,4,5].map(n=><button key={n} onClick={()=>setFeel(n)} style={{width:52,height:52,borderRadius:16,background:feel===n?A:T.card2,border:`2px solid ${feel===n?A:T.border}`,fontSize:24,cursor:"pointer",transition:"all .12s"}}>{["😵","😓","😐","😊","🔥"][n-1]}</button>)}
        </div>
        <p style={{fontSize:13,color:A,fontWeight:600,fontFamily:F,textAlign:"center",marginBottom:14}}>{["Very hard","Hard","Good","Great","Amazing"][feel-1]}</p>
        <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Any notes? Legs felt heavy, pacing was off, felt strong..." rows={3} style={{width:"100%",background:T.card2,border:`1px solid ${T.border}`,borderRadius:14,padding:"12px 14px",fontSize:14,color:T.text,fontFamily:F,outline:"none",resize:"none",marginBottom:14}}/>
        <div style={{display:"flex",gap:10}}>
          <Pill ch="Save debrief" color={A} full tap={()=>onSave({feel,notes})}/>
          <Pill ch="Skip" ghost color={T.muted} tap={onSkip} sx={{flexShrink:0}}/>
        </div>
      </div>
    </div>
  );
}

// ─── COACH ────────────────────────────────────────────────────────────────────
function CoachScreen({acts,stats,whoop,whoopOk,onPlanSaved,onGymSaved,userPrefs,T}){
  const [msgs,setMsgs]=useState([{role:"assistant",content:"Hey Caleb. I have your Strava, Whoop, nutrition and plan loaded. What do you need?"}]);
  const [loaded,setLoaded]=useState(false);
  const [input,setInput]=useState("");
  const [sending,setSending]=useState(false);
  const [imgs,setImgs]=useState([]);
  const bottom=useRef(null);
  const fileRef=useRef(null);
  useEffect(()=>{loadChatHistory().then(m=>{if(m?.length>0)setMsgs(m);setLoaded(true);}).catch(()=>setLoaded(true));},[]);
  useEffect(()=>{bottom.current?.scrollIntoView({behavior:"smooth"});},[msgs]);
  useEffect(()=>{if(loaded)saveChatHistory(msgs);},[msgs,loaded]);

  const handleFiles=e=>{Array.from(e.target.files).forEach(f=>{const r2=new FileReader();r2.onload=ev=>setImgs(p=>[...p,{b64:ev.target.result.split(",")[1],type:f.type,preview:ev.target.result}].slice(0,3));r2.readAsDataURL(f);});};

  const extractPlan=text=>{
    if(!text.includes("PLAN_START")||!text.includes("PLAN_END"))return null;
    try{
      const sec=text.split("PLAN_START")[1].split("PLAN_END")[0].trim();
      const lines=sec.split("\n").map(l=>l.trim()).filter(Boolean);
      let title="Training Plan";const sessions=[];
      for(const l of lines){if(l.startsWith("TITLE:")){title=l.replace("TITLE:","").trim();continue;}const pts=l.split("|").map(p=>p.trim());if(pts.length>=4)sessions.push({day:pts[0],type:pts[1],dist:pts[2],pace:pts[3],shoe:pts[4]||"",notes:pts[5]||""});}
      if(sessions.length>=3){const st=new Date();st.setHours(0,0,0,0);sessions.forEach((s,i)=>{const d=new Date(st);d.setDate(st.getDate()+i);s.date=d.toISOString().split("T")[0];});return{title,startDate:new Date().toISOString().split("T")[0],sessions};}
    }catch{}return null;
  };
  const extractGym=text=>{
    if(!text.includes("GYM_START")||!text.includes("GYM_END"))return null;
    try{const sec=text.split("GYM_START")[1].split("GYM_END")[0].trim();const lines=sec.split("\n").map(l=>l.trim()).filter(Boolean);let title="Gym Session";const exercises=[];for(const l of lines){if(l.startsWith("TITLE:")){title=l.replace("TITLE:","").trim();continue;}const pts=l.split("|").map(p=>p.trim());if(pts.length>=3){const m=pts[1].match(/(\d+)[xX](\d+)/);exercises.push({name:pts[0],sets:m?parseInt(m[1]):3,reps:m?parseInt(m[2]):10,weight:pts[2],notes:pts[3]||""});}}return exercises.length>0?{title,exercises,date:new Date().toISOString().split("T")[0]}:null;}catch{}return null;
  };
  const clean=text=>{let o=text;if(o.includes("PLAN_START")&&o.includes("PLAN_END")){const b=o.split("PLAN_START")[0].trim();const a=o.split("PLAN_END")[1]?.trim()||"";o=(b+(a?"\n\n"+a:"")).trim();}if(o.includes("GYM_START")&&o.includes("GYM_END")){const b=o.split("GYM_START")[0].trim();const a=o.split("GYM_END")[1]?.trim()||"";o=(b+(a?"\n\n"+a:"")).trim();}return o;};

  const buildCtx=()=>{
    const runs=acts.filter(a=>a.type==="Run").slice(0,5),ytd=stats?.ytd_run_totals||{};
    const rec=whoop?.recoveries?.records?.[0],sleep=whoop?.sleeps?.records?.[0];
    const recScore=rec?Math.round(rec.score?.recovery_score||0):null;
    const slScore=sleep?Math.round(sleep.score?.sleep_performance_percentage||0):null;
    const recs7=(whoop?.recoveries?.records||[]).slice(0,7).map(r=>`${new Date(r.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}: ${Math.round(r.score?.recovery_score||0)}% rec, HRV ${Math.round(r.score?.hrv_rmssd_milli||0)}ms, RHR ${Math.round(r.score?.resting_heart_rate||0)}`).join("\n");
    const nut=Object.entries(userPrefs?.nutrition||{}).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,7).map(([d,e])=>`${new Date(d).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}: ${[e.kcal&&e.kcal+"kcal",e.protein&&e.protein+"g P",e.carbs&&e.carbs+"g C"].filter(Boolean).join(", ")}`).join("\n");
    const planSummary=userPrefs?.currentPlan?.sessions?.map((s,i)=>{const d=new Date(userPrefs.currentPlan.startDate||new Date());d.setDate(d.getDate()+i);return`${d.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}: ${s.type}${s.dist&&s.dist!=="0km"?" "+s.dist:""}${s.pace&&s.pace!=="N/A"?" at "+s.pace:""}${s.done?" (DONE)":""}`;}).join("\n")||"No active plan";
    return `You are a personal running coach and performance advisor for Caleb Cunningham. Write in plain sentences. Never use double dashes, markdown headers, or bullet lists. Never plan more than 2 weeks at a time.

TODAY: ${new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})} at ${new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})} UK time. Use this exact date for all planning — attach real calendar dates to every session.

CALEB: 20yo, graphic design student, Kingston University. Started running Jul 2024. VO2 Max 67, threshold 3:57/km, max HR 208. PBs: 5K 18:42, 10K 40:52, HM 1:32:48, Marathon 3:48:59 (London Apr 2026). Target: Berlin 28 Sep 2026 Sub 3:20, Seville Feb 2027 Sub 3:00. Running all 6 World Majors for charity. Brother Noah has Duchenne Muscular Dystrophy.

COACHING NOTE: CV fitness is ahead of structural fitness. Berlin block focus is hitting 25-30km long runs he never hit in London build. Recovery-aware planning is essential.

TODAY'S DATA: Recovery ${recScore!==null?recScore+"%":"unknown"}${slScore!==null?", sleep "+slScore+"%":""}${recScore!==null&&recScore<34?" — LOW RECOVERY, rest or easy only.":""}

WHOOP 7 DAYS:\n${recs7||"Not connected"}

STRAVA: YTD ${ytd.distance?(ytd.distance/1000).toFixed(1):"450"}km, ${ytd.count||58} runs.
RECENT RUNS:\n${runs.map(r=>`${r.name} (${new Date(r.start_date_local).toLocaleDateString("en-GB")}): ${(r.distance/1000).toFixed(2)}km at ${fPace(r.average_speed)}/km${r.average_heartrate?" "+Math.round(r.average_heartrate)+"bpm":""}`).join("\n")}

NUTRITION (7 days):\n${nut||"None logged"}

CURRENT PLAN:\n${planSummary}

SHOES: Metaspeed Sky Tokyo Green (race), Red (carbon trainer), Vaporfly 3&4 (intervals), ZoomFly 5 (training), Novablast 5+Superfeet (easy/long), Evo SL (daily/tempo).
GYM: Chest focus. Smith flat bench 20kg/side 3x10, incline 15kg/side 3x10, pec deck 73kg 3x12, preacher curl 39kg 3x10, hammer curl 16kg 3x12, lateral raises 8-10kg 3x15. Weight 58-61kg target 65kg.

PLAN FORMAT (use this exactly when building a plan):
PLAN_START
TITLE: [title]
[Day] | [Type] | [Xkm] | [pace range]/km | [Shoe] | [detailed description]
(7 or 14 rows, one per day, rest: Mon | Rest | 0km | N/A | N/A | Rest day)
PLAN_END

GYM FORMAT:
GYM_START
TITLE: [title]
[Exercise] | [S]x[R] | [Weight] | [Notes]
GYM_END`;
  };

  const send=async()=>{
    if((!input.trim()&&!imgs.length)||sending)return;
    const content=[];
    imgs.forEach(img=>content.push({type:"image",source:{type:"base64",media_type:img.type,data:img.b64}}));
    if(input.trim())content.push({type:"text",text:input.trim()});
    const userMsg={role:"user",content:imgs.length?content:input.trim()};
    const display={role:"user",content:input.trim()||(imgs.length?`${imgs.length} image${imgs.length>1?"s":""}`:""),previews:imgs.map(i=>i.preview)};
    setMsgs(p=>[...p,display]);setInput("");setImgs([]);setSending(true);
    try{
      const apiMsgs=[...msgs,userMsg].map(m=>({role:m.role,content:m.content}));
      const res=await fetch("/.netlify/functions/claude-chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:buildCtx(),messages:apiMsgs})});
      const data=await res.json();
      const reply=data.content?.[0]?.text||"Something went wrong.";
      const plan=extractPlan(reply),gym=extractGym(reply),cleaned=clean(reply);
      const suffix=(plan?"\n\nPlan saved to your Plans tab.":"")+(gym?"\n\nWorkout saved to your Gym tab.":"");
      setMsgs(p=>[...p,{role:"assistant",content:cleaned+suffix}]);
      if(plan){onPlanSaved(plan);if(userPrefs)userPrefs.currentPlan=plan;}
      if(gym)onGymSaved(gym);
    }catch{setMsgs(p=>[...p,{role:"assistant",content:"Something went wrong. Try again."}]);}
    setSending(false);
  };

  const CHIPS=["How is my recovery?","Plan my next week","Give me a gym session","Am I on track for Berlin Sub 3:20?","Analyse my recent training"];

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      {/* Header */}
      <div style={{flexShrink:0,marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
          <div style={{width:40,height:40,borderRadius:13,background:A,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 4px 14px ${A}45`,flexShrink:0}}>
            <svg viewBox="0 0 24 24" width={20} height={20} fill="none"><path d="M13 3L4 14h7.5L10 21l10-11h-7.5L13 3z" fill="white"/></svg>
          </div>
          <div style={{flex:1}}>
            <p style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:F}}>Coach Claude</p>
            <p style={{fontSize:12,color:G,fontFamily:F}}>● Online · full context loaded</p>
          </div>
          <button onClick={()=>{const f=[{role:"assistant",content:"Hey Caleb. I have your Strava, Whoop, nutrition and plan loaded. What do you need?"}];setMsgs(f);saveChatHistory(f);}} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.muted,borderRadius:100,padding:"5px 12px",fontSize:11,fontFamily:F}}>Clear</button>
        </div>
        {msgs.length<=1&&(
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {CHIPS.map(s=><button key={s} onClick={()=>setInput(s)} style={{background:`${A}10`,border:`1px solid ${A}20`,color:A,borderRadius:100,padding:"6px 14px",fontSize:12,fontWeight:500,fontFamily:F,whiteSpace:"nowrap"}}>{s}</button>)}
          </div>
        )}
      </div>

      {/* Messages */}
      <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:10,paddingBottom:14}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
            <div style={{maxWidth:"84%",padding:"12px 16px",borderRadius:20,background:m.role==="user"?A:T.card,color:m.role==="user"?"#fff":T.text,border:m.role==="assistant"?`1px solid ${T.border}`:"none",fontSize:14,lineHeight:1.65,fontFamily:F,whiteSpace:"pre-wrap",borderBottomRightRadius:m.role==="user"?5:20,borderBottomLeftRadius:m.role==="assistant"?5:20,boxShadow:m.role==="user"?`0 2px 16px ${A}40`:T.sh}}>
              {m.previews?.length>0&&<div style={{display:"flex",gap:6,marginBottom:8}}>{m.previews.map((p,j)=><img key={j} src={p} alt="" style={{width:56,height:56,borderRadius:10,objectFit:"cover"}}/>)}</div>}
              {m.content}
            </div>
          </div>
        ))}
        {sending&&<div style={{display:"flex"}}><div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:20,borderBottomLeftRadius:5,padding:"14px 18px",display:"flex",gap:6}}>{[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:T.muted,animation:`pulse .9s ${i*.2}s infinite`}}/>)}</div></div>}
        <div ref={bottom}/>
      </div>

      {imgs.length>0&&<div style={{display:"flex",gap:8,paddingBottom:8,flexShrink:0}}>
        {imgs.map((img,i)=><div key={i} style={{position:"relative"}}><img src={img.preview} alt="" style={{width:52,height:52,borderRadius:10,objectFit:"cover",border:`1px solid ${T.border}`}}/><button onClick={()=>setImgs(p=>p.filter((_,j)=>j!==i))} style={{position:"absolute",top:-5,right:-5,width:18,height:18,borderRadius:"50%",background:R,border:"none",color:"#fff",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button></div>)}
      </div>}

      <div style={{flexShrink:0,display:"flex",gap:8,paddingTop:10,borderTop:`1px solid ${T.div}`,alignItems:"flex-end"}}>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={handleFiles}/>
        <button onClick={()=>fileRef.current?.click()} style={{width:44,height:44,borderRadius:13,background:T.card2,border:`1px solid ${T.border}`,fontSize:18,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>📷</button>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()} placeholder="Ask your coach..." style={{flex:1,background:T.card2,border:`1.5px solid ${T.border}`,borderRadius:14,padding:"11px 16px",fontSize:14,color:T.text,fontFamily:F,outline:"none"}}/>
        <Pill ch="Send" color={A} sm loading={sending} disabled={!input.trim()&&!imgs.length} tap={send} sx={{height:44,borderRadius:14,flexShrink:0}}/>
      </div>
    </div>
  );
}

// ─── PROFILE ──────────────────────────────────────────────────────────────────
function ProfileScreen({acts,stats,whoop,whoopOk,connectWhoop,gear,userPrefs,onSavePrefs,athlete,darkMode,setDarkMode,onDisconnect,onDisconnectWhoop,savedWorkout,T}){
  const [section,setSection]=useState("main"); // main | recovery | nutrition | gym | races | settings

  if(section==="recovery")return <RecoverySection whoop={whoop} whoopOk={whoopOk} connectWhoop={connectWhoop} onBack={()=>setSection("main")} T={T}/>;
  if(section==="nutrition")return <NutritionSection userPrefs={userPrefs} onSavePrefs={onSavePrefs} onBack={()=>setSection("main")} T={T}/>;
  if(section==="gym")return <GymSection acts={acts} userPrefs={userPrefs} onSavePrefs={onSavePrefs} savedWorkout={savedWorkout} onBack={()=>setSection("main")} T={T}/>;
  if(section==="races")return <RacesSection userPrefs={userPrefs} onSavePrefs={onSavePrefs} onBack={()=>setSection("main")} T={T}/>;
  if(section==="settings")return <SettingsSection darkMode={darkMode} setDarkMode={setDarkMode} whoopOk={whoopOk} connectWhoop={connectWhoop} onDisconnect={onDisconnect} onDisconnectWhoop={onDisconnectWhoop} onBack={()=>setSection("main")} T={T}/>;

  const rec=whoop?.recoveries?.records?.[0];
  const rhr=Math.round(rec?.score?.resting_heart_rate||48);
  const ytd=stats?.ytd_run_totals||{};
  const streaks=calcStreaks(acts);
  const MENU=[
    {id:"recovery",label:"Recovery & Health",sub:"Whoop data, HRV trends, sleep",icon:"⌚",color:G},
    {id:"nutrition",label:"Nutrition & Fuel",sub:"AI food logger, macro tracking",icon:"🥗",color:O},
    {id:"gym",label:"Gym & Strength",sub:"Lift tracker, session history",icon:"💪",color:V},
    {id:"races",label:"Races & Goals",sub:"Pipeline, Berlin countdown, sponsors",icon:"🏅",color:A},
    {id:"settings",label:"Settings",sub:"Apps, dark mode, account",icon:"⚙️",color:T.muted},
  ];

  return(
    <div className="page" style={{display:"flex",flexDirection:"column",gap:16,paddingBottom:32}}>
      {/* Profile hero */}
      <Card T={T} ch={<>
        <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:18}}>
          <div style={{width:60,height:60,borderRadius:20,background:A,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`0 6px 20px ${A}40`}}>
            <span style={{fontSize:26,fontWeight:800,color:"#fff",fontFamily:F}}>C</span>
          </div>
          <div>
            <h2 style={{fontSize:19,fontWeight:700,color:T.text,fontFamily:F,letterSpacing:"-.02em",marginBottom:3}}>{athlete?.firstname||"Caleb"} {athlete?.lastname||"Cunningham"}</h2>
            <p style={{fontSize:13,color:T.sub,fontFamily:F}}>Marathon runner · since July 2024</p>
          </div>
        </div>
        <div style={{display:"flex",paddingTop:16,borderTop:`1px solid ${T.div}`}}>
          {[{l:"VO₂ Max",v:"67"},{l:"Resting HR",v:`${rhr}bpm`},{l:"All-time",v:`${stats?.all_run_totals?.distance?(stats.all_run_totals.distance/1000).toFixed(0):"1093"}km`}].map((s,i)=>(
            <div key={i} style={{flex:1,textAlign:"center",borderRight:i<2?`1px solid ${T.div}`:"none"}}>
              <p style={{fontSize:22,fontWeight:800,color:T.text,fontFamily:F,letterSpacing:"-.03em"}}>{s.v}</p>
              <p style={{fontSize:11,color:T.sub,fontFamily:F,marginTop:2}}>{s.l}</p>
            </div>
          ))}
        </div>
      </>}/>

      {/* Key stats */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {[{l:"YTD Distance",v:ytd.distance?`${(ytd.distance/1000).toFixed(0)}km`:"450km",c:A},{l:"YTD Runs",v:String(ytd.count||58),c:T.text},{l:"Best 5K",v:"18:42",c:G},{l:"Best Marathon",v:"3:48:59",c:G},{l:"Current Streak",v:`${streaks.current}d`,c:streaks.current>2?O:T.sub},{l:"Longest Streak",v:`${streaks.longest}d`,c:T.sub}].map((s,i)=>(
          <Card T={T} key={i} sx={{padding:16}} ch={<>
            <p style={{fontSize:10,color:T.muted,fontFamily:F,fontWeight:500,marginBottom:5}}>{s.l}</p>
            <p style={{fontSize:24,fontWeight:800,color:s.c,fontFamily:F,letterSpacing:"-.03em"}}>{s.v}</p>
          </>}/>
        ))}
      </div>

      {/* Menu sections */}
      <Card T={T} np ch={MENU.map((item,i)=>(
        <button key={item.id} onClick={()=>setSection(item.id)}
          style={{display:"flex",alignItems:"center",gap:14,width:"100%",padding:"16px 22px",background:"transparent",border:"none",textAlign:"left",cursor:"pointer",borderTop:i===0?"none":`1px solid ${T.div}`}}>
          <div style={{width:42,height:42,borderRadius:13,background:`${item.color}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{item.icon}</div>
          <div style={{flex:1}}>
            <p style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:F}}>{item.label}</p>
            <p style={{fontSize:12,color:T.sub,fontFamily:F,marginTop:1}}>{item.sub}</p>
          </div>
          <svg viewBox="0 0 24 24" width={14} height={14} fill="none"><path d="M9 18l6-6-6-6" stroke={T.muted} strokeWidth={2} strokeLinecap="round"/></svg>
        </button>
      ))}/>
    </div>
  );
}

function BackBtn({onBack,label="Back",T}){
  return <button onClick={onBack} style={{display:"inline-flex",alignItems:"center",gap:6,background:"transparent",border:"none",color:A,fontSize:15,fontWeight:600,fontFamily:F,padding:"4px 0",alignSelf:"flex-start",marginBottom:8}}>
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"/></svg>
    {label}
  </button>;
}

// ─── RECOVERY SECTION ─────────────────────────────────────────────────────────
function RecoverySection({whoop,whoopOk,connectWhoop,onBack,T}){
  if(!whoopOk)return(
    <div className="page" style={{display:"flex",flexDirection:"column",gap:16,paddingBottom:32}}>
      <BackBtn onBack={onBack} label="Profile" T={T}/>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,textAlign:"center",padding:"48px 24px",gap:20}}>
        <div style={{width:80,height:80,background:`${R}12`,borderRadius:24,display:"flex",alignItems:"center",justifyContent:"center",fontSize:36}}>⌚</div>
        <div><h2 style={{fontSize:20,fontWeight:700,color:T.text,fontFamily:F,marginBottom:8}}>Connect Whoop</h2><p style={{fontSize:14,color:T.sub,fontFamily:F,lineHeight:1.7,maxWidth:260}}>Live recovery scores, HRV, sleep stages and daily strain.</p></div>
        <Pill ch="Connect Whoop" color={R} tap={connectWhoop}/>
      </div>
    </div>
  );
  const recs=whoop?.recoveries?.records||[],sleeps=whoop?.sleeps?.records||[],cycles=whoop?.cycles?.records||[];
  const lat=recs[0],latSleep=sleeps[0];
  const recScore=Math.round(lat?.score?.recovery_score||0);
  const recCol=recScore>=67?G:recScore>=34?O:R;
  const hrv=Math.round(lat?.score?.hrv_rmssd_milli||0);
  const rhr=Math.round(lat?.score?.resting_heart_rate||0);
  const resp=lat?.score?.respiratory_rate?.toFixed(1)||"--";
  const slScore=Math.round(latSleep?.score?.sleep_performance_percentage||0);
  const slH=latSleep?.score?.stage_summary?.total_in_bed_time_milli?(latSleep.score.stage_summary.total_in_bed_time_milli/3600000).toFixed(1):"--";
  const rem=latSleep?.score?.stage_summary?.total_rem_sleep_time_milli?Math.round(latSleep.score.stage_summary.total_rem_sleep_time_milli/60000):"--";
  const deep=latSleep?.score?.stage_summary?.total_slow_wave_sleep_time_milli?Math.round(latSleep.score.stage_summary.total_slow_wave_sleep_time_milli/60000):"--";
  const hrvChart=recs.slice(0,14).reverse().map(r=>({d:new Date(r.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"}),hrv:Math.round(r.score?.hrv_rmssd_milli||0),rhr:Math.round(r.score?.resting_heart_rate||0)}));
  const recChart=recs.slice(0,14).reverse().map(r=>({d:new Date(r.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"}),score:Math.round(r.score?.recovery_score||0)}));
  return(
    <div className="page" style={{display:"flex",flexDirection:"column",gap:16,paddingBottom:32}}>
      <BackBtn onBack={onBack} label="Profile" T={T}/>
      <Card T={T} np ch={<>
        <div style={{background:T===TD?"#111115":"#1a1a22",padding:"22px 22px 18px",borderRadius:`${r} ${r} 0 0`}}>
          <div style={{display:"flex",alignItems:"center",gap:20,marginBottom:18}}>
            <RecRing score={recScore} size={100} sw={9}/>
            <div style={{flex:1,display:"flex",flexDirection:"column",gap:11}}>
              {[{l:"HRV",v:`${hrv} ms`,c:G},{l:"Resting HR",v:`${rhr} bpm`,c:R},{l:"Resp Rate",v:`${resp} br/min`,c:V}].map((s,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",borderBottom:i<2?"1px solid rgba(255,255,255,.07)":"none",paddingBottom:i<2?10:0}}>
                  <p style={{fontSize:13,color:"rgba(255,255,255,.4)",fontFamily:F}}>{s.l}</p>
                  <p style={{fontSize:14,fontWeight:700,color:s.c,fontFamily:F}}>{s.v}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        {cycles[0]?.score?.strain!=null&&(
          <div style={{padding:"13px 22px",borderBottom:`1px solid ${T.div}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <p style={{fontSize:13,color:T.sub,fontFamily:F}}>Daily strain</p>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:72,height:4,background:T.card2,borderRadius:2}}><div style={{width:`${Math.min(cycles[0].score.strain,21)/21*100}%`,height:"100%",background:O,borderRadius:2}}/></div>
              <p style={{fontSize:14,fontWeight:700,color:O,fontFamily:F}}>{cycles[0].score.strain.toFixed(1)}</p>
            </div>
          </div>
        )}
      </>}/>
      {latSleep&&<Card T={T} ch={<>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <h3 style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F}}>Last night</h3>
          <Badge ch="WHOOP" color={A}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
          {[{l:"Score",v:`${slScore}%`,c:A},{l:"In bed",v:`${slH}h`,c:G},{l:"REM",v:`${rem}m`,c:V},{l:"Deep",v:`${deep}m`,c:G}].map((s,i)=>(
            <div key={i} style={{background:T.card2,borderRadius:14,padding:"12px 10px",textAlign:"center"}}>
              <p style={{fontSize:9,color:T.muted,fontFamily:F,marginBottom:5,fontWeight:500}}>{s.l}</p>
              <p style={{fontSize:17,fontWeight:800,color:s.c,fontFamily:F,letterSpacing:"-.02em"}}>{s.v}</p>
            </div>
          ))}
        </div>
      </>}/>}
      {hrvChart.length>2&&<Card T={T} ch={<>
        <h3 style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F,marginBottom:14}}>HRV and RHR — 14 days</h3>
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
          {[{c:G,l:"HRV"},{c:R,l:"RHR"}].map((l,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:10,height:2.5,background:l.c,borderRadius:2}}/><p style={{fontSize:11,color:T.muted,fontFamily:F}}>{l.l}</p></div>)}
        </div>
      </>}/>}
      {recChart.length>2&&<Card T={T} ch={<>
        <h3 style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F,marginBottom:14}}>Recovery score — 14 days</h3>
        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={recChart} barCategoryGap="20%">
            <XAxis dataKey="d" tick={{fontSize:10,fill:T.muted,fontFamily:F}} tickLine={false} axisLine={false} interval={2}/>
            <YAxis tick={{fontSize:10,fill:T.muted}} tickLine={false} axisLine={false} domain={[0,100]} width={26}/>
            <Tooltip content={<CT T={T}/>}/>
            <Bar dataKey="score" name="Recovery" radius={[5,5,2,2]} fill={G}/>
          </BarChart>
        </ResponsiveContainer>
      </>}/>}
    </div>
  );
}

// ─── NUTRITION SECTION ────────────────────────────────────────────────────────
function NutritionSection({userPrefs,onSavePrefs,onBack,T}){
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
  const save=e=>{const u=e||entry;onSavePrefs({...userPrefs,nutrition:{...log,[today]:u}});};
  const handleImg=ev=>{const f=ev.target.files[0];if(!f)return;const r=new FileReader();r.onload=e=>{setAiImage(e.target.result.split(",")[1]);setAiPreview(e.target.result);};r.readAsDataURL(f);};
  const analyse=async()=>{
    if(!aiInput.trim()&&!aiImage)return;setAiLoading(true);
    try{
      const content=[];
      if(aiImage)content.push({type:"image",source:{type:"base64",media_type:"image/jpeg",data:aiImage}});
      content.push({type:"text",text:`Analyse this food${aiImage?" in the image":""}${aiInput?": "+aiInput:""}. Return ONLY valid JSON with no markdown: {"name":"meal name","kcal":number,"protein":number,"carbs":number,"fat":number}. Use UK portion sizes.`});
      const res=await fetch("/.netlify/functions/claude-chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:"You are a nutrition expert. Return only valid JSON, no markdown, no explanation.",messages:[{role:"user",content}]})});
      const data=await res.json();
      const parsed=JSON.parse((data.content?.[0]?.text||"{}").replace(/```json|```/g,"").trim());
      const meal={...parsed,time:new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}),image:aiPreview};
      const ne={...entry,kcal:String(Math.round((parseFloat(entry.kcal)||0)+parsed.kcal)),protein:String(Math.round((parseFloat(entry.protein)||0)+parsed.protein)),carbs:String(Math.round((parseFloat(entry.carbs)||0)+parsed.carbs)),fat:String(Math.round((parseFloat(entry.fat)||0)+parsed.fat)),meals:[...(entry.meals||[]),meal]};
      setEntry(ne);save(ne);setAiInput("");setAiImage(null);setAiPreview(null);
    }catch(e){console.error(e);}
    setAiLoading(false);
  };
  const removeMeal=i=>{const meals=(entry.meals||[]).filter((_,j)=>j!==i);const ne={...entry,kcal:String(meals.reduce((s,m)=>s+(m.kcal||0),0)),protein:String(meals.reduce((s,m)=>s+(m.protein||0),0)),carbs:String(meals.reduce((s,m)=>s+(m.carbs||0),0)),fat:String(meals.reduce((s,m)=>s+(m.fat||0),0)),meals};setEntry(ne);save(ne);};
  const targets={kcal:3000,protein:140,carbs:300,fat:80};
  const macros=[{k:"kcal",l:"Calories",c:A,t:targets.kcal,u:"kcal"},{k:"protein",l:"Protein",c:R,t:targets.protein,u:"g"},{k:"carbs",l:"Carbs",c:G,t:targets.carbs,u:"g"},{k:"fat",l:"Fat",c:O,t:targets.fat,u:"g"}];
  const hist=Object.entries(log).sort(([a],[b])=>b.localeCompare(a)).slice(0,14);
  return(
    <div className="page" style={{display:"flex",flexDirection:"column",gap:16,paddingBottom:32}}>
      <BackBtn onBack={onBack} label="Profile" T={T}/>
      <div style={{display:"flex",background:T.card2,borderRadius:14,padding:4,gap:0}}>
        {[["today","Today"],["history","History"],["targets","Targets"]].map(([id,l])=>(
          <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"9px 0",borderRadius:10,border:"none",fontFamily:F,fontSize:13,fontWeight:tab===id?700:400,color:tab===id?A:T.sub,background:tab===id?T.card:"transparent",transition:"all .15s"}}>{l}</button>
        ))}
      </div>
      {tab==="today"&&<>
        <Card T={T} ch={<>
          <h3 style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F,marginBottom:3}}>{new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}</h3>
          <p style={{fontSize:13,color:T.sub,fontFamily:F,marginBottom:18}}>{parseFloat(entry.kcal)||0} of {targets.kcal} kcal logged</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:18}}>
            {macros.map(m=>{const v=parseFloat(entry[m.k])||0,pct=Math.min(100,Math.round(v/m.t*100)),sz=56,sw=5,r2=(sz-sw)/2,ci=2*Math.PI*r2,da=(pct/100)*ci;return(
              <div key={m.k} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
                <div style={{position:"relative",width:sz,height:sz}}>
                  <svg width={sz} height={sz} style={{transform:"rotate(-90deg)"}}>
                    <circle cx={sz/2} cy={sz/2} r={r2} fill="none" stroke={`${m.c}18`} strokeWidth={sw}/>
                    <circle cx={sz/2} cy={sz/2} r={r2} fill="none" stroke={m.c} strokeWidth={sw} strokeDasharray={`${da} ${ci}`} strokeLinecap="round" style={{transition:"stroke-dasharray .5s"}}/>
                  </svg>
                  <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <p style={{fontSize:10,fontWeight:700,color:m.c,fontFamily:F}}>{v>0?v:"—"}</p>
                  </div>
                </div>
                <p style={{fontSize:9,color:T.muted,fontFamily:F,textAlign:"center",fontWeight:500}}>{m.l}</p>
              </div>
            );})}
          </div>
          <div style={{background:`${A}08`,borderRadius:14,padding:16,border:`1px solid ${A}15`,marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
              <div style={{width:28,height:28,borderRadius:8,background:A,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <svg viewBox="0 0 24 24" width={14} height={14} fill="none"><path d="M13 3L4 14h7.5L10 21l10-11h-7.5L13 3z" fill="white"/></svg>
              </div>
              <div><p style={{fontSize:13,fontWeight:700,color:T.text,fontFamily:F}}>AI Food Logger</p><p style={{fontSize:11,color:T.sub,fontFamily:F}}>Photo or describe what you ate</p></div>
            </div>
            {aiPreview&&<div style={{marginBottom:10,position:"relative",display:"inline-block"}}><img src={aiPreview} alt="" style={{width:72,height:72,objectFit:"cover",borderRadius:12}}/><button onClick={()=>{setAiImage(null);setAiPreview(null);}} style={{position:"absolute",top:-6,right:-6,width:20,height:20,borderRadius:"50%",background:R,border:"none",color:"#fff",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>×</button></div>}
            <div style={{display:"flex",gap:8}}>
              <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleImg}/>
              <button onClick={()=>fileRef.current?.click()} style={{width:44,height:44,borderRadius:12,background:T.card,border:`1px solid ${T.border}`,fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>📷</button>
              <input value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&analyse()} placeholder="e.g. porridge with banana and peanut butter..." style={{flex:1,background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"10px 14px",fontSize:13,color:T.text,fontFamily:F,outline:"none"}}/>
              <Pill ch="Add" color={A} sm loading={aiLoading} disabled={!aiInput.trim()&&!aiImage} tap={analyse} sx={{flexShrink:0}}/>
            </div>
          </div>
          {(entry.meals||[]).length>0&&<>
            <p style={{fontSize:13,fontWeight:600,color:T.text,fontFamily:F,marginBottom:8}}>Meals · {(entry.meals||[]).reduce((s,m)=>s+(m.kcal||0),0)}kcal</p>
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
              {(entry.meals||[]).map((meal,i)=>(
                <div key={i} style={{display:"flex",gap:10,alignItems:"center",background:T.card2,borderRadius:13,padding:"10px 13px"}}>
                  {meal.image&&<img src={meal.image} alt="" style={{width:44,height:44,borderRadius:10,objectFit:"cover",flexShrink:0}}/>}
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:13,fontWeight:600,color:T.text,fontFamily:F,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{meal.name}</p>
                    <p style={{fontSize:11,color:T.sub,fontFamily:F,marginTop:1}}>{meal.time} · {meal.kcal}kcal · {meal.protein}g P · {meal.carbs}g C</p>
                  </div>
                  <button onClick={()=>removeMeal(i)} style={{background:"transparent",border:"none",color:T.muted,fontSize:18,lineHeight:1,flexShrink:0}}>×</button>
                </div>
              ))}
            </div>
          </>}
          <details><summary style={{fontSize:12,color:T.muted,fontFamily:F,cursor:"pointer",marginBottom:8}}>Edit totals manually</summary>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8}}>
              {macros.map(m=><div key={m.k}><p style={{fontSize:10,color:T.muted,fontFamily:F,marginBottom:3,fontWeight:500}}>{m.l} ({m.u})</p><input type="number" value={entry[m.k]} onChange={e=>{const n={...entry,[m.k]:e.target.value};setEntry(n);}} onBlur={()=>save()} style={{width:"100%",background:T.card2,border:`1px solid ${T.border}`,borderRadius:10,padding:"8px 10px",fontSize:15,fontWeight:700,color:m.c,fontFamily:F,outline:"none"}}/></div>)}
            </div>
          </details>
        </>}/>
        <Card T={T} ch={<>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <p style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:F}}>Weight</p>
            <p style={{fontSize:12,color:T.sub,fontFamily:F}}>Target 65kg</p>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <input type="number" step="0.1" placeholder="60.5" style={{flex:1,background:T.card2,border:`1px solid ${T.border}`,borderRadius:12,padding:"11px 14px",color:T.text,fontSize:18,fontWeight:700,fontFamily:F,outline:"none"}}
              onBlur={e=>{const w=parseFloat(e.target.value);if(!w)return;const wl=userPrefs?.weightLog||[];onSavePrefs({...userPrefs,weightLog:[...wl.filter(l=>l.date!==today),{date:today,weight:w}].slice(-60)});e.target.value="";}}/>
            <p style={{fontSize:14,color:T.sub,fontFamily:F}}>kg</p>
          </div>
        </>}/>
      </>}
      {tab==="history"&&<Card T={T} ch={<>
        <h3 style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F,marginBottom:14}}>Food history</h3>
        {hist.length===0?<p style={{fontSize:13,color:T.muted,fontFamily:F,textAlign:"center",padding:"32px 0"}}>No meals logged yet</p>:hist.map(([d,e])=>(
          <div key={d} style={{padding:"13px 0",borderBottom:`1px solid ${T.div}`}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <p style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:F}}>{new Date(d).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"short"})}</p>
              <p style={{fontSize:15,fontWeight:700,color:A,fontFamily:F}}>{e.kcal||0}kcal</p>
            </div>
            <div style={{display:"flex",gap:12}}>
              <p style={{fontSize:12,color:R,fontFamily:F}}>{e.protein||0}g P</p>
              <p style={{fontSize:12,color:G,fontFamily:F}}>{e.carbs||0}g C</p>
              <p style={{fontSize:12,color:O,fontFamily:F}}>{e.fat||0}g F</p>
            </div>
            {e.meals?.length>0&&<p style={{fontSize:11,color:T.muted,fontFamily:F,marginTop:3}}>{e.meals.map(m=>m.name).join(" · ")}</p>}
          </div>
        ))}
      </>}/>}
      {tab==="targets"&&<Card T={T} ch={<>
        <h3 style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F,marginBottom:14}}>Daily targets</h3>
        {[{l:"Calories",v:"2,800–3,200 kcal",c:A,n:"Higher on long run days"},{l:"Protein",v:"130–150g",c:R,n:"~2.2g per kg bodyweight"},{l:"Carbs",v:"250–350g",c:G,n:"Front-load around training"},{l:"Fat",v:"70–90g",c:O,n:"Healthy fats where possible"},{l:"Long run fuel",v:"SiS Beta Fuel every 30m",c:V,n:"From km 1, don't wait"},{l:"Race week",v:"3,500–4,000 kcal",c:A,n:"Carb-load 2 days before"}].map((t,i,a)=>(
          <div key={i} style={{padding:"13px 0",borderBottom:i<a.length-1?`1px solid ${T.div}`:"none"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}><p style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:F}}>{t.l}</p><p style={{fontSize:13,fontWeight:700,color:t.c,fontFamily:F}}>{t.v}</p></div>
            <p style={{fontSize:11,color:T.muted,fontFamily:F}}>{t.n}</p>
          </div>
        ))}
      </>}/>}
    </div>
  );
}

// ─── GYM SECTION ──────────────────────────────────────────────────────────────
function GymSection({acts,userPrefs,onSavePrefs,savedWorkout,onBack,T}){
  const [editing,setEditing]=useState(false);
  const lifts=userPrefs?.lifts||DEFAULT_LIFTS;
  const [editLifts,setEditLifts]=useState(lifts);
  const [workout,setWorkout]=useState(savedWorkout);
  useEffect(()=>{if(savedWorkout)setWorkout(savedWorkout);},[savedWorkout]);
  const save=()=>{onSavePrefs({...userPrefs,lifts:editLifts});setEditing(false);};
  const sessions=acts.filter(a=>a.type==="WeightTraining"||(a.name||"").toLowerCase().includes("gym")).slice(0,8);
  return(
    <div className="page" style={{display:"flex",flexDirection:"column",gap:16,paddingBottom:32}}>
      <BackBtn onBack={onBack} label="Profile" T={T}/>
      {workout&&<Card T={T} ch={<>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div><p style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F}}>{workout.title}</p><p style={{fontSize:12,color:T.sub,fontFamily:F}}>Generated by Claude</p></div>
          <button onClick={()=>setWorkout(null)} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:100,padding:"5px 12px",fontSize:12,color:T.muted,fontFamily:F}}>Clear</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {workout.exercises.map((ex,i)=><div key={i} style={{background:T.card2,borderRadius:13,padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><p style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:F}}>{ex.name}</p>{ex.notes&&<p style={{fontSize:12,color:T.sub,fontFamily:F,marginTop:1}}>{ex.notes}</p>}</div>
            <div style={{textAlign:"right"}}><p style={{fontSize:14,fontWeight:700,color:A,fontFamily:F}}>{ex.sets}×{ex.reps}</p><p style={{fontSize:12,color:T.sub,fontFamily:F}}>{ex.weight}</p></div>
          </div>)}
        </div>
      </>}/>}
      <Card T={T} ch={<>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <p style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F}}>Current lifts</p>
          <button onClick={()=>{if(editing)save();else{setEditLifts(lifts);setEditing(true);}}} style={{background:editing?A:"transparent",border:`1.5px solid ${editing?A:T.border}`,color:editing?"#fff":T.sub,borderRadius:100,padding:"6px 16px",fontSize:12,fontWeight:600,fontFamily:F}}>{editing?"Save":"Edit"}</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {(editing?editLifts:lifts).map((l,i)=>(
            <div key={i} style={{background:T.card2,borderRadius:13,padding:"12px 14px",display:"flex",alignItems:"center",gap:10}}>
              {editing?<>
                <input value={l.name} onChange={e=>setEditLifts(p=>p.map((x,j)=>j===i?{...x,name:e.target.value}:x))} style={{flex:1,background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",fontSize:13,color:T.text,fontFamily:F,outline:"none"}}/>
                <input value={l.weight} onChange={e=>setEditLifts(p=>p.map((x,j)=>j===i?{...x,weight:e.target.value}:x))} style={{width:90,background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",fontSize:13,color:T.text,fontFamily:F,outline:"none"}}/>
              </>:<>
                <div style={{flex:1}}><p style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:F}}>{l.name}</p><p style={{fontSize:11,color:T.sub,fontFamily:F,marginTop:1}}>{l.sets}×{l.reps}</p></div>
                <p style={{fontSize:15,fontWeight:700,color:A,fontFamily:F}}>{l.weight}</p>
              </>}
            </div>
          ))}
        </div>
      </>}/>
      {sessions.length>0&&<Card T={T} ch={<>
        <p style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F,marginBottom:14}}>Recent sessions</p>
        <div style={{display:"flex",flexDirection:"column"}}>
          {sessions.map((s,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 0",borderBottom:i<sessions.length-1?`1px solid ${T.div}`:"none"}}>
              <div><p style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:F}}>{s.name}</p><p style={{fontSize:12,color:T.sub,fontFamily:F,marginTop:1}}>{new Date(s.start_date_local).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}</p></div>
              <div style={{textAlign:"right"}}><p style={{fontSize:14,fontWeight:700,color:A,fontFamily:F}}>{fTime(s.moving_time)}</p>{s.average_heartrate&&<p style={{fontSize:12,color:R,fontFamily:F,marginTop:1}}>{Math.round(s.average_heartrate)} bpm</p>}</div>
            </div>
          ))}
        </div>
      </>}/>}
    </div>
  );
}

// ─── RACES SECTION ────────────────────────────────────────────────────────────
function RacesSection({userPrefs,onSavePrefs,onBack,T}){
  const [editing,setEditing]=useState(false);
  const races=userPrefs?.races||DEFAULT_RACES;
  const [editRaces,setEditRaces]=useState(races);
  const save=()=>{onSavePrefs({...userPrefs,races:editRaces});setEditing(false);};
  const berlin=new Date("2026-09-28"),daysLeft=Math.max(0,Math.ceil((berlin-new Date())/86400000));
  const blockPct=Math.min(100,Math.max(0,Math.round(((new Date()-new Date("2026-06-22"))/(berlin-new Date("2026-06-22")))*100)));
  return(
    <div className="page" style={{display:"flex",flexDirection:"column",gap:16,paddingBottom:32}}>
      <BackBtn onBack={onBack} label="Profile" T={T}/>
      <div style={{background:`linear-gradient(135deg,${A} 0%,#7C6FD4 100%)`,borderRadius:r,padding:22}}>
        <p style={{fontSize:12,color:"rgba(255,255,255,.45)",fontFamily:F,marginBottom:3}}>Next race</p>
        <h2 style={{fontSize:26,fontWeight:800,color:"#fff",fontFamily:F,letterSpacing:"-.035em",marginBottom:3}}>Berlin Marathon</h2>
        <p style={{fontSize:14,color:"rgba(255,255,255,.55)",fontFamily:F,marginBottom:18}}>28 September 2026 · Sub 3:20 · Get Kids Going</p>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
          <div><p style={{fontSize:11,color:"rgba(255,255,255,.4)",fontFamily:F}}>Target pace</p><p style={{fontSize:20,fontWeight:700,color:"#fff",fontFamily:F}}>4:44/km</p></div>
          <div style={{textAlign:"right"}}><p style={{fontSize:52,fontWeight:900,color:"#fff",fontFamily:F,letterSpacing:"-.05em",lineHeight:1}}>{daysLeft}</p><p style={{fontSize:12,color:"rgba(255,255,255,.4)",fontFamily:F}}>days</p></div>
        </div>
        <div style={{marginTop:14,height:3,background:"rgba(255,255,255,.12)",borderRadius:2}}><div style={{width:`${blockPct}%`,height:"100%",background:"rgba(255,255,255,.7)",borderRadius:2}}/></div>
        <p style={{fontSize:11,color:"rgba(255,255,255,.35)",fontFamily:F,marginTop:5}}>Block {blockPct}% complete</p>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {[{l:"Completed",v:"2 / 6",c:G,s:"Both London"},{l:"Next goal",v:"Sub 3:00",c:A,s:"Seville 2027"},{l:"Raised",v:"£5k+",c:O,s:"for charity"},{l:"Majors left",v:"4 of 6",c:V,s:"Tokyo → New York"}].map((s,i)=>(
          <Card T={T} key={i} sx={{padding:16}} ch={<><p style={{fontSize:10,color:T.muted,fontFamily:F,fontWeight:500,marginBottom:5}}>{s.l}</p><p style={{fontSize:22,fontWeight:800,color:s.c,fontFamily:F,letterSpacing:"-.03em"}}>{s.v}</p><p style={{fontSize:11,color:T.sub,fontFamily:F,marginTop:3}}>{s.s}</p></>}/>
        ))}
      </div>
      <Card T={T} ch={<>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <p style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:F}}>Race pipeline</p>
          <button onClick={()=>{if(editing)save();else{setEditRaces(races);setEditing(true);}}} style={{background:editing?A:"transparent",border:`1.5px solid ${editing?A:T.border}`,color:editing?"#fff":T.sub,borderRadius:100,padding:"6px 16px",fontSize:12,fontWeight:600,fontFamily:F}}>{editing?"Save":"Edit"}</button>
        </div>
        <div style={{display:"flex",flexDirection:"column"}}>
          {(editing?editRaces:races).map((rc,i,a)=>(
            <div key={i} style={{padding:"13px 0",borderBottom:i<a.length-1?`1px solid ${T.div}`:"none",opacity:rc.done?.45:1}}>
              {editing?(
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <input value={rc.name} onChange={e=>setEditRaces(p=>p.map((x,j)=>j===i?{...x,name:e.target.value}:x))} style={{flex:1,background:T.card2,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 10px",fontSize:13,color:T.text,fontFamily:F,outline:"none"}}/>
                  <input value={rc.date} onChange={e=>setEditRaces(p=>p.map((x,j)=>j===i?{...x,date:e.target.value}:x))} style={{width:110,background:T.card2,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 10px",fontSize:13,color:T.text,fontFamily:F,outline:"none"}}/>
                  <input value={rc.target} onChange={e=>setEditRaces(p=>p.map((x,j)=>j===i?{...x,target:e.target.value}:x))} style={{width:90,background:T.card2,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 10px",fontSize:13,color:T.text,fontFamily:F,outline:"none"}}/>
                </div>
              ):(
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div><p style={{fontSize:14,fontWeight:600,color:rc.done?T.muted:rc.next?A:T.text,fontFamily:F}}>{rc.done?"✓ ":""}{rc.name}</p><p style={{fontSize:12,color:T.sub,fontFamily:F,marginTop:2}}>{rc.date} · {rc.charity}</p></div>
                  <Badge ch={rc.target} color={rc.next?A:T.muted}/>
                </div>
              )}
            </div>
          ))}
        </div>
      </>}/>
    </div>
  );
}

// ─── SETTINGS SECTION ─────────────────────────────────────────────────────────
function SettingsSection({darkMode,setDarkMode,whoopOk,connectWhoop,onDisconnect,onDisconnectWhoop,onBack,T}){
  return(
    <div className="page" style={{display:"flex",flexDirection:"column",gap:16,paddingBottom:32}}>
      <BackBtn onBack={onBack} label="Profile" T={T}/>
      <Card T={T} np ch={<>
        <div style={{padding:"18px 22px",borderBottom:`1px solid ${T.div}`}}>
          <p style={{fontSize:12,color:T.muted,fontFamily:F,fontWeight:600,marginBottom:10,letterSpacing:".04em"}}>Connected apps</p>
          {[{name:"Strava",sub:"Runs & activities",icon:"S",bg:"#FC4C02",ok:true,action:null},{name:"WHOOP",sub:whoopOk?"Recovery synced":"Not connected",icon:"W",bg:"#111",ok:whoopOk,action:connectWhoop}].map((app,i,a)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 0",borderBottom:i<a.length-1?`1px solid ${T.div}`:"none"}}>
              <div style={{width:40,height:40,borderRadius:12,background:app.bg,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:14,fontWeight:700,fontFamily:F,flexShrink:0}}>{app.icon}</div>
              <div style={{flex:1}}><p style={{fontSize:14,fontWeight:600,color:T.text,fontFamily:F}}>{app.name}</p><p style={{fontSize:11,color:T.sub,fontFamily:F,marginTop:1}}>{app.sub}</p></div>
              {app.ok?<Badge ch="Synced" color={G}/>:<button onClick={app.action} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:100,padding:"5px 13px",fontSize:12,color:T.sub,fontFamily:F}}>Connect</button>}
            </div>
          ))}
        </div>
        <button onClick={()=>setDarkMode(d=>!d)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"16px 22px",background:"transparent",border:"none",cursor:"pointer",borderBottom:`1px solid ${T.div}`}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:18}}>{darkMode?"☀️":"🌙"}</span><p style={{fontSize:14,color:T.text,fontFamily:F}}>{darkMode?"Light mode":"Dark mode"}</p></div>
          <div style={{width:46,height:27,background:darkMode?A:T.card2,border:`1.5px solid ${darkMode?A:T.border}`,borderRadius:14,position:"relative",transition:"all .2s"}}><div style={{position:"absolute",top:2.5,left:darkMode?19.5:2.5,width:18,height:18,background:"#fff",borderRadius:"50%",transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,.2)"}}/></div>
        </button>
        <div style={{display:"flex",padding:"4px 0"}}>
          <button onClick={onDisconnect} style={{flex:1,padding:"13px 22px",background:"transparent",border:"none",color:T.muted,fontSize:13,fontFamily:F,cursor:"pointer",textAlign:"left"}}>Disconnect Strava</button>
          {whoopOk&&<button onClick={onDisconnectWhoop} style={{flex:1,padding:"13px 22px",background:"transparent",border:"none",color:T.muted,fontSize:13,fontFamily:F,cursor:"pointer",textAlign:"right"}}>Disconnect Whoop</button>}
        </div>
      </>}/>
    </div>
  );
}

// ─── NAV + APP SHELL ──────────────────────────────────────────────────────────
const TABS=[
  {id:"home",    label:"Home",     icon:(a,c)=><svg width={24} height={24} viewBox="0 0 24 24" fill="none"><path d="M3 12L12 3l9 9" stroke={a?c:"currentColor"} strokeWidth={a?2.2:1.6} strokeLinecap="round" strokeLinejoin="round"/><path d="M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" stroke={a?c:"currentColor"} strokeWidth={a?2.2:1.6} strokeLinecap="round" strokeLinejoin="round" fill={a?`${c}12`:"none"}/></svg>},
  {id:"activity",label:"Activity", icon:(a,c)=><svg width={24} height={24} viewBox="0 0 24 24" fill="none"><circle cx="14" cy="4.5" r="1.8" fill={a?c:"currentColor"}/><path d="M6.5 21l2.5-6 3 2 2.5-8" stroke={a?c:"currentColor"} strokeWidth={a?2.2:1.6} strokeLinecap="round" strokeLinejoin="round"/><path d="M9 15L6.5 21" stroke={a?c:"currentColor"} strokeWidth={a?2.2:1.6} strokeLinecap="round"/><path d="M12.5 9l3.5-1.5 2.5 3-3.5 1.5" stroke={a?c:"currentColor"} strokeWidth={a?2.2:1.6} strokeLinecap="round" strokeLinejoin="round"/></svg>},
  {id:"plan",    label:"Plan",     icon:(a,c)=><svg width={24} height={24} viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="3" stroke={a?c:"currentColor"} strokeWidth={a?2.2:1.6} fill={a?`${c}12`:"none"}/><path d="M16 2v4M8 2v4M3 10h18" stroke={a?c:"currentColor"} strokeWidth={a?2.2:1.6} strokeLinecap="round"/><path d="M8 14h4M8 17h6" stroke={a?c:"currentColor"} strokeWidth={a?2.2:1.6} strokeLinecap="round"/></svg>},
  {id:"coach",   label:"Coach",    icon:(a,c)=><svg width={24} height={24} viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke={a?c:"currentColor"} strokeWidth={a?2.2:1.6} strokeLinecap="round" strokeLinejoin="round" fill={a?`${c}12`:"none"}/></svg>},
  {id:"profile", label:"Profile",  icon:(a,c)=><svg width={24} height={24} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke={a?c:"currentColor"} strokeWidth={a?2.2:1.6} fill={a?`${c}12`:"none"}/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke={a?c:"currentColor"} strokeWidth={a?2.2:1.6} strokeLinecap="round"/></svg>},
];

export default function App(){
  const [page,setPage]=useState("home");
  const [connected,setConnected]=useState(isConnected());
  const [whoopOk,setWhoopOk]=useState(isWhoopConnected());
  const [acts,setActs]=useState([]);
  const [stats,setStats]=useState(null);
  const [athlete,setAthlete]=useState(null);
  const [gear,setGear]=useState([]);
  const [whoop,setWhoop]=useState(null);
  const [loading,setLoading]=useState(false);
  const [whoopPending,setWhoopPending]=useState(false);
  const [savedPlan,setSavedPlan]=useState(null);
  const [savedWorkout,setSavedWorkout]=useState(null);
  const [userPrefs,setUserPrefs]=useState(null);
  const [darkMode,setDarkMode]=useState(()=>localStorage.getItem("theme")==="dark");
  const T=darkMode?TD:TL;

  useEffect(()=>{localStorage.setItem("theme",darkMode?"dark":"light");},[darkMode]);

  useEffect(()=>{
    const p=new URLSearchParams(window.location.search),code=p.get("code"),whoopP=localStorage.getItem("whoop_pending");
    if(!code)return;
    if(whoopP){setWhoopPending(true);exchangeWhoopCode(code).then(()=>{setWhoopOk(true);setWhoopPending(false);}).catch(e=>{console.error(e);setWhoopPending(false);}).finally(()=>window.history.replaceState({},"","/"));}
    else if(!isConnected()){exchangeCode(code).then(()=>setConnected(true)).catch(console.error).finally(()=>window.history.replaceState({},"","/"));}
  },[]);

  useEffect(()=>{
    if(!connected)return;setLoading(true);
    Promise.all([getAthlete(),getActivities(100)]).then(([a,activities])=>{setAthlete(a);setActs(activities);return Promise.all([getStats(a.id),getAllGear(a)]);}).then(([s,g])=>{setStats(s);setGear(g.filter(Boolean));}).catch(console.error).finally(()=>setLoading(false));
  },[connected]);

  const loadWhoop=useCallback(()=>{if(whoopOk)getWhoopData().then(setWhoop).catch(console.error);},[whoopOk]);
  useEffect(()=>{loadWhoop();},[loadWhoop]);
  useEffect(()=>{loadUserPrefs().then(p=>{if(p){setUserPrefs(p);if(p.currentPlan)setSavedPlan(p.currentPlan);}});},[]);
  const savePrefs=useCallback(p=>{setUserPrefs(p);saveUserPrefs(p);},[]);
  const connectWhoop=()=>window.location.assign(getWhoopAuthUrl());

  if(!connected||whoopPending)return(<><style>{CSS}</style><Connect T={T}/></>);

  const recScore=whoop?.recoveries?.records?.[0]?Math.round(whoop.recoveries.records[0].score?.recovery_score||0):null;
  const recCol=recScore!=null?(recScore>=67?G:recScore>=34?O:R):null;
  const isCoach=page==="coach";

  const views={
    home:<Home acts={acts} stats={stats} whoop={whoop} whoopOk={whoopOk} connectWhoop={connectWhoop} athlete={athlete} plan={savedPlan} nav={setPage} T={T}/>,
    activity:<Activity acts={acts} gear={gear} T={T}/>,
    plan:<PlanScreen exPlan={savedPlan} whoopData={whoop} acts={acts} openCoach={()=>setPage("coach")} T={T}/>,
    coach:<CoachScreen acts={acts} stats={stats} whoop={whoop} whoopOk={whoopOk} onPlanSaved={p=>{setSavedPlan(p);savePrefs({...userPrefs,currentPlan:p});}} onGymSaved={setSavedWorkout} userPrefs={userPrefs} T={T}/>,
    profile:<ProfileScreen acts={acts} stats={stats} whoop={whoop} whoopOk={whoopOk} connectWhoop={connectWhoop} gear={gear} userPrefs={userPrefs} onSavePrefs={savePrefs} athlete={athlete} darkMode={darkMode} setDarkMode={setDarkMode} onDisconnect={()=>{disconnect();setConnected(false);setActs([]);}} onDisconnectWhoop={()=>{disconnectWhoop();setWhoopOk(false);setWhoop(null);}} savedWorkout={savedWorkout} T={T}/>,
  };

  const TITLES={home:"Home",activity:"Activity",plan:"Plan",coach:"Coach",profile:"Profile"};

  return(
    <div style={{height:"100vh",background:T.bg,color:T.text,fontFamily:F,overflow:"hidden",display:"flex"}}>
      <style>{CSS}</style>
      <style>{`@media(min-width:800px){.dsk{display:flex!important}}.mob{display:flex}@media(min-width:800px){.mob{display:none!important}}`}</style>

      {/* ── DESKTOP SIDEBAR ── */}
      <div className="dsk" style={{display:"none",flexDirection:"column",width:240,borderRight:`1px solid ${T.border}`,background:T.nav,flexShrink:0,height:"100vh",overflowY:"auto"}}>
        <div style={{padding:"28px 22px 22px"}}><ApexWordmark T={T}/></div>
        <nav style={{padding:"0 12px",flex:1,display:"flex",flexDirection:"column",gap:2}}>
          {TABS.map(tab=>{
            const isA=page===tab.id;
            return <button key={tab.id} onClick={()=>setPage(tab.id)} style={{display:"flex",alignItems:"center",gap:11,width:"100%",padding:"10px 13px",background:isA?`${A}10`:"transparent",borderRadius:13,border:"none",cursor:"pointer",color:isA?A:T.sub,fontSize:14,fontWeight:isA?600:400,fontFamily:F,textAlign:"left",transition:"all .12s"}}>
              <span style={{color:isA?A:T.muted,display:"flex"}}>{tab.icon(isA,A)}</span>
              {tab.label}
            </button>;
          })}
        </nav>
        <div style={{padding:"16px 20px 28px",borderTop:`1px solid ${T.border}`}}>
          {recScore!=null&&<div style={{background:T.card2,borderRadius:12,padding:"10px 14px",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:recCol,boxShadow:`0 0 8px ${recCol}`}}/>
            <p style={{fontSize:13,color:T.sub,fontFamily:F}}><span style={{color:recCol,fontWeight:700}}>{recScore}%</span> recovery</p>
          </div>}
          <button onClick={()=>setDarkMode(d=>!d)} style={{display:"flex",alignItems:"center",gap:8,background:T.card2,border:`1px solid ${T.border}`,borderRadius:10,padding:"8px 12px",fontSize:12,color:T.sub,fontFamily:F,width:"100%"}}>
            <span>{darkMode?"☀️":"🌙"}</span><span>{darkMode?"Light":"Dark"} mode</span>
          </button>
        </div>
      </div>

      {/* ── MAIN ── */}
      <div style={{flex:1,display:"flex",flexDirection:"column",height:"100vh",overflow:"hidden",minWidth:0}}>
        {/* Top bar */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 18px 10px",flexShrink:0}}>
          <div>
            <p style={{fontSize:11,fontWeight:600,color:T.muted,fontFamily:F,letterSpacing:".05em",textTransform:"uppercase",marginBottom:2}}>Apex</p>
            <h1 style={{fontSize:23,fontWeight:700,color:T.text,fontFamily:F,letterSpacing:"-.025em",lineHeight:1.15}}>{TITLES[page]||"Apex"}</h1>
          </div>
          {recScore!=null&&(
            <div style={{display:"flex",alignItems:"center",gap:6,background:T.card,boxShadow:T.sh,borderRadius:100,padding:"6px 13px 6px 9px",border:`1px solid ${T.border}`}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:recCol,boxShadow:`0 0 6px ${recCol}`}}/>
              <span style={{fontSize:13,fontWeight:700,color:T.text,fontFamily:F}}>{recScore}%</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div style={{flex:1,overflowY:isCoach?"hidden":"auto",padding:"0 16px",WebkitOverflowScrolling:"touch",display:"flex",flexDirection:"column"}}>
          {loading?<Spin T={T}/>:(views[page]||views.home)}
        </div>

        {/* ── BOTTOM TAB BAR ── */}
        <div className="mob" style={{flexShrink:0,padding:"8px 14px",paddingBottom:"calc(env(safe-area-inset-bottom,20px) + 8px)",background:"transparent",display:"flex"}}>
          <div style={{display:"flex",alignItems:"center",background:T.nav,borderRadius:40,boxShadow:"0 4px 28px rgba(0,0,0,.12),0 1px 4px rgba(0,0,0,.06)",padding:"6px 4px",width:"100%",border:`1px solid ${T.border}`}}>
            {TABS.map(tab=>{
              const isA=page===tab.id;
              return <button key={tab.id} onClick={()=>setPage(tab.id)}
                style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,background:"transparent",border:"none",padding:"7px 2px",WebkitTapHighlightColor:"transparent",transition:"all .1s"}}>
                <span style={{color:isA?A:T.muted,display:"flex",transition:"color .1s"}}>{tab.icon(isA,A)}</span>
                <span style={{fontSize:9,fontWeight:isA?700:400,color:isA?A:T.muted,fontFamily:F,letterSpacing:".01em"}}>{tab.label}</span>
              </button>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
