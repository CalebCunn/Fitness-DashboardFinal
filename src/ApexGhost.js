// APEX · Your ghost and your pulse. The ghost is the last time you ran the same
// route (same start, distance within 8%): where it was when you finished, and the
// gap. The pulse is your heart rate drawn against your easy-day cap.
const isRun=a=>a&&(a.type==='Run'||a.sport_type==='Run'||a.sport_type==='TrailRun');
const when=a=>new Date(a.start_date_local||a.start_date);
const km=(p,q)=>{const R=6371,d=x=>x*Math.PI/180,dl=d(q[0]-p[0]),dg=d(q[1]-p[1]);const h=Math.sin(dl/2)**2+Math.cos(d(p[0]))*Math.cos(d(q[0]))*Math.sin(dg/2)**2;return 2*R*Math.asin(Math.sqrt(h));};
const clock=s=>{s=Math.round(Math.abs(s));const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(x).padStart(2,'0')}`:`${m}:${String(x).padStart(2,'0')}`;};

export function findGhost(a,acts=[]){
 if(!isRun(a)||!a.distance||!a.moving_time||!Array.isArray(a.start_latlng)||a.start_latlng.length<2)return null;
 const t=when(a);
 const g=acts.filter(b=>b.id!==a.id&&isRun(b)&&b.moving_time&&Array.isArray(b.start_latlng)&&b.start_latlng.length===2&&when(b)<t&&Math.abs(b.distance/a.distance-1)<=.08&&km(a.start_latlng,b.start_latlng)<=.25).sort((x,y)=>when(y)-when(x))[0];
 if(!g)return null;
 const gapS=a.moving_time-g.moving_time*(a.distance/g.distance);
 const ghostAt=Math.min(1,(g.distance/g.moving_time)*a.moving_time/a.distance);
 return {g,gapS,ghostAt,youAt:Math.min(1,a.distance/(g.distance/g.moving_time*a.moving_time)),date:when(g).toLocaleDateString('en-GB',{day:'numeric',month:'short'})};
}

export function GhostRace({ghost,a}){
 if(!ghost)return null;
 const ahead=ghost.gapS<0,you=ahead?1:ghost.youAt,them=ahead?ghost.ghostAt:1;
 return <section className="detail-section ghost-race">
  <div className="gr-head"><h3>Your ghost</h3><b className={ahead?'is-ahead':''}>{Math.abs(ghost.gapS)<5?'Level':`${ahead?'−':'+'}${clock(ghost.gapS)}`}</b></div>
  <p className="form-note">{Math.abs(ghost.gapS)<5?`Dead level with your ${ghost.date} run on the same route.`:Math.abs(ghost.gapS)<15?`Within a few seconds of your ${ghost.date} run on the same route.`:ahead?`${clock(ghost.gapS)} faster than your ${ghost.date} run on the same route.`:`${clock(ghost.gapS)} behind your ${ghost.date} run on the same route.`}</p>
  <div className="gr-lanes">
   <div className="gr-lane is-you"><span>You</span><i style={{'--x':you}}><b/></i><small>{clock(a.moving_time)}</small></div>
   <div className="gr-lane is-ghost"><span>Ghost</span><i style={{'--x':them}}><b/></i><small>{clock(ghost.g.moving_time*(a.distance/ghost.g.distance))}</small></div>
   <span className="gr-finish" aria-hidden="true"/>
  </div>
 </section>;
}

export function HrPulse({hr=[],time=[],cap}){
 if(!cap||hr.length<20)return null;
 const n=120,step=Math.max(1,Math.floor(hr.length/n)),pts=[];
 for(let i=0;i<hr.length;i+=step){const w=hr.slice(i,i+step).filter(Number.isFinite);if(w.length)pts.push(w.reduce((a,b)=>a+b,0)/w.length);}
 const lo=Math.min(cap-25,...pts),hi=Math.max(cap+12,...pts),Y=v=>8+(1-(v-lo)/(hi-lo))*96,X=i=>i/(pts.length-1)*360;
 const line=pts.map((v,i)=>`${i?'L':'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
 const under=hr.filter(v=>v<=cap).length/hr.length;
 const dt=time.length===hr.length&&time.length>1?(time[time.length-1]-time[0])/(time.length-1):1;
 let settle=null;for(let i=0;i<hr.length;i++){if(hr[i]>cap)settle=i;}
 const over=hr.filter(v=>v>cap).length*dt/60;
 return <section className="detail-section hr-pulse">
  <div className="gr-head"><h3>Your pulse</h3><b>{Math.round(under*100)}%<small> under {cap}</small></b></div>
  <svg viewBox="0 0 360 112" preserveAspectRatio="none" aria-hidden="true">
   <rect x="0" y="0" width="360" height={Y(cap)} className="hp-over"/>
   <line x1="0" x2="360" y1={Y(cap)} y2={Y(cap)} className="hp-cap"/>
   <path d={line} className="hp-line"/>
  </svg>
  <p className="form-note">{under>.9?`Easy kept easy: under your ${cap} bpm cap almost the whole way.`:over<3?`Only ${Math.max(1,Math.round(over))} min over your ${cap} bpm cap.`:`${Math.round(over)} min over your ${cap} bpm easy cap${settle!=null&&settle>hr.length*.8?', mostly late on as you tired or pushed':''}. Fine for a session, too much for an easy day.`}</p>
 </section>;
}
