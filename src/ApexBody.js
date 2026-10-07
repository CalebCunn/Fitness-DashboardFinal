// APEX · Body check-in. Tap where it talks: front and back of a runner, each spot
// cycles none → niggle → sore → pain. Today's call listens to it.
const ZONES=[
 // [key, name, view, x, y] on a 100 × 220 figure; mirrored for left and right.
 ['hip','hip flexor','front',38,96],['quad','quad','front',37,122],['knee','knee','front',37,150],['shin','shin','front',38,178],['foot','foot','front',37,212],
 ['back','lower back','back',50,84,true],['glute','glute','back',38,100],['ham','hamstring','back',37,126],['calf','calf','back',37,172],['achilles','Achilles','back',38,200],
];
const LOWER_LEG=['knee','shin','foot','calf','achilles'];
export const LEVELS=['','niggle','sore','pain'];
const keyOf=(z,side)=>z[5]?z[0]:`${z[0]}-${side}`;
const nameOf=k=>{const [id,side]=k.split('-'),z=ZONES.find(x=>x[0]===id);return z?`${side?(side==='L'?'left ':'right '):''}${z[1]}`:k;};

export function bodyRead(body){
 const spots=Object.entries(body||{}).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
 if(!spots.length)return {level:0,spots:[],line:'Nothing sore. Good to go.'};
 const [k,v]=spots[0],name=nameOf(k),lower=LOWER_LEG.includes(k.split('-')[0]);
 const line=v>=3?`Pain in your ${name}: don’t run through it. Rest today, and if it’s still there tomorrow, get it looked at.`
  :v===2?(lower?`Sore ${name}: keep today flat and easy, no strides or hills. If it’s still a 2 tomorrow, swap the next hard session.`:`Sore ${name}: keep it easy and skip anything fast. Mobility tonight.`)
  :`A niggle in your ${name}. Warm up for longer and check it again tomorrow.`;
 return {level:v,lower,spots:spots.map(([k,v])=>({key:k,name:nameOf(k),level:v})),line,name};
}

const Figure=({view})=><g className="bm-figure">
 <circle cx="50" cy="15" r="10"/>
 <path d="M36 30Q50 26 64 30L67 86H33Z"/>
 <path d="M36 32L27 80L31 83L39 50Z"/><path d="M64 32L73 80L69 83L61 50Z"/>
 <path d="M33 86H49.5L48 142L45 200L41 216H30L33 200L31 142Z"/>
 <path d="M67 86H50.5L52 142L55 200L59 216H70L67 200L69 142Z"/>
 {view==='back'&&<path d="M50 32V84" className="bm-spine"/>}
</g>;

export function BodyMap({value={},onChange}){
 const tap=k=>{const n=((value[k]||0)+1)%4,next={...value};if(n)next[k]=n;else delete next[k];onChange(next);};
 return <div className="body-map">
  {['front','back'].map(view=><figure key={view}>
   <svg viewBox="0 0 100 222" role="group" aria-label={`${view==='front'?'Front':'Back'} of body`}>
    <Figure view={view}/>
    {ZONES.filter(z=>z[2]===view).flatMap(z=>(z[5]?[['C',z[3]]]:[['L',view==='front'?100-z[3]:z[3]],['R',view==='front'?z[3]:100-z[3]]]).map(([side,x])=>{const k=z[5]?z[0]:keyOf(z,side),v=value[k]||0;
     return <g key={k} className={`bm-spot lv-${v}`} onClick={()=>tap(k)} role="button" tabIndex={0} aria-label={`${nameOf(k)}: ${LEVELS[v]||'fine'}. Tap to change`} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();tap(k);}}}>
      <circle cx={x} cy={z[4]} r="11" className="bm-hit"/><circle cx={x} cy={z[4]} r={v?6:3.5} className="bm-dot"/>
     </g>;}))}
   </svg>
   <figcaption>{view==='front'?'Front':'Back'}</figcaption>
  </figure>)}
 </div>;
}
