// APEX · The season as one lap. Every week of the block is a segment of a 400 m
// track: weeks run so far are filled, this week is bold, the runner marks today.
const W=360,H=200,L=150,R=70,CX=W/2,CY=H/2;
const stadium=r=>`M${CX-L/2},${CY+r} H${CX+L/2} A${r},${r} 0 0 0 ${CX+L/2},${CY-r} H${CX-L/2} A${r},${r} 0 0 0 ${CX-L/2},${CY+r} Z`;
function at(t,r){const P=2*L+2*Math.PI*r;let s=t*P;if(s<=L)return [CX-L/2+s,CY+r];s-=L;if(s<=Math.PI*r){const a=Math.PI/2-s/r;return [CX+L/2+r*Math.cos(a),CY+r*Math.sin(a)];}s-=Math.PI*r;if(s<=L)return [CX+L/2-s,CY-r];s-=L;const a=-Math.PI/2-s/r;return [CX-L/2+r*Math.cos(a),CY+r*Math.sin(a)];}

export function seasonOf(plan,goal,today){
 const dates=(plan?.sessions||[]).map(s=>s.date).filter(Boolean).sort();
 const start=plan?.blockStart||[plan?.startDate,dates[0]].filter(Boolean).sort()[0];
 const end=goal?.date&&/^\d{4}-\d{2}-\d{2}$/.test(goal.date)?goal.date:dates[dates.length-1];
 if(!start||!end||end<=start)return null;
 const d=k=>new Date(k+'T12:00:00'),weeks=Math.max(2,Math.ceil((d(end)-d(start))/604800000));
 if(weeks>40)return null;
 const week=Math.min(weeks,Math.max(1,Math.floor((d(today)-d(start))/604800000)+1));
 const left=Math.max(0,Math.ceil((d(end)-d(today))/86400000));
 return {start,weeks,week,left,frac:Math.min(1,Math.max(0,(d(today)-d(start))/(d(end)-d(start))))};
}

export function SeasonLap({season,goal,onStart}){
 if(!season)return null;
 const r=R-6,P=2*L+2*Math.PI*r,seg=P/season.weeks,[x,y]=at(season.frac,r);
 return <section className="season-lap" aria-label={`Week ${season.week} of ${season.weeks}${goal?`, ${season.left} days to ${goal.name}`:''}`}>
  <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
   {[0,1,2,3].map(i=><path key={i} d={stadium(R-18+i*12)} className="sl-lane"/>)}
   {Array.from({length:season.weeks},(_,w)=><path key={w} d={stadium(r)} pathLength={P} strokeDasharray={`${Math.max(1,seg-3)} ${P}`} strokeDashoffset={-w*seg} className={`sl-week${w<season.week-1?' is-done':w===season.week-1?' is-now':''}`}/>)}
   <line x1={CX-L/2} x2={CX-L/2} y1={CY+R-30} y2={CY+R+6} className="sl-start"/>
   <circle cx={x} cy={y} r="8" className="sl-runner"/>
   <text x={CX} y={CY-2} textAnchor="middle" className="sl-big">Week {season.week}</text>
   <text x={CX} y={CY+20} textAnchor="middle" className="sl-small">of {season.weeks}{goal?` · ${season.left} days to ${goal.name.split(' ')[0]}`:''}</text>
  </svg>
  {onStart&&<label className="sl-start-edit"><span>Block started {new Date(season.start+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})} · <u>Change</u></span><input type="date" aria-label="Block start date" value={season.start} max={new Date().toISOString().slice(0,10)} onChange={e=>e.target.value&&onStart(e.target.value)}/></label>}
 </section>;
}
