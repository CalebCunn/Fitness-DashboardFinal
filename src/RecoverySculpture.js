// "The lap": recovery drawn as a 400m athletics track. The score is how far round
// the lap you are. Runners go anticlockwise from the start line on the home straight.
import {useEffect,useState} from 'react';

const W=320,H=180,L=150,R0=58,LANES=4,GAP=7;
const cx=W/2,cy=H/2;
function stadium(r){return `M${cx-L/2},${cy+r} H${cx+L/2} A${r},${r} 0 0 0 ${cx+L/2},${cy-r} H${cx-L/2} A${r},${r} 0 0 0 ${cx-L/2},${cy+r} Z`;}
function pointAt(t,r){
 const P=2*L+2*Math.PI*r;let s=((t%1)+1)%1*P;
 if(s<=L)return [cx-L/2+s,cy+r];s-=L;
 const arc=Math.PI*r;
 if(s<=arc){const a=Math.PI/2-s/r;return [cx+L/2+r*Math.cos(a),cy+r*Math.sin(a)];}s-=arc;
 if(s<=L)return [cx+L/2-s,cy-r];s-=L;
 const a=-Math.PI/2-s/r;return [cx-L/2+r*Math.cos(a),cy+r*Math.sin(a)];
}
export const bandOf=score=>score==null?{label:'Awaiting data',tone:'none'}:score>=67?{label:'Ready to push',tone:'high'}:score>=34?{label:'Steady day',tone:'mid'}:{label:'Recover first',tone:'low'};

export default function RecoverySculpture({score=null,tone='surface',animate=true,compact=false}){
 const target=score==null?0:Math.max(0,Math.min(100,score));
 const [p,setP]=useState(animate?0:target);
 useEffect(()=>{
  if(!animate||window.matchMedia('(prefers-reduced-motion: reduce)').matches){setP(target);return;}
  let raf,start;const dur=1400;
  const step=ts=>{if(!start)start=ts;const k=Math.min(1,(ts-start)/dur),e=1-Math.pow(1-k,3);setP(target*e);if(k<1)raf=requestAnimationFrame(step);};
  raf=requestAnimationFrame(step);return()=>cancelAnimationFrame(raf);
 },[target,animate]);
 const rIn=R0,rOut=R0+GAP*LANES,rMid=R0+GAP*LANES/2;
 const [dx,dy]=pointAt(p/100,R0+GAP/2);
 const band=bandOf(score);
 return <svg className={`lap lap-${tone} lap-${band.tone}${compact?' lap-compact':''}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={score==null?'Recovery not available yet':`Recovery ${Math.round(score)} percent, ${band.label}`}>
  <path className="lap-surface" d={stadium(rMid)} strokeWidth={GAP*LANES+6} fill="none"/>
  <path className="lap-infield" d={stadium(rIn-3)}/>
  {Array.from({length:LANES+1},(_,i)=><path key={i} className="lap-line" d={stadium(rIn+i*GAP)} fill="none"/>)}
  <path className="lap-progress" d={stadium(R0+GAP/2)} pathLength="100" strokeDasharray={`${p} 100`} fill="none"/>
  <line className="lap-start" x1={cx-L/2} y1={cy+rIn} x2={cx-L/2} y2={cy+rOut}/>
  {[0.25,0.5,0.75].map(t=>{const [x1,y1]=pointAt(t,rIn),[x2,y2]=pointAt(t,rIn-6);return <line key={t} className="lap-tick" x1={x1} y1={y1} x2={x2} y2={y2}/>;})}
  {score!=null&&<circle className="lap-runner" cx={dx} cy={dy} r="6.5"/>}
 </svg>;
}
