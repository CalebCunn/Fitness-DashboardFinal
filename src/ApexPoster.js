// APEX · Posters. Every run as a Swiss race poster, and a race-day pace band.
// Drawn on a canvas so they can be saved or shared as images.
import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {useDialog} from './ApexInteractions';
import {Icon} from './ApexUI';
import {POSTER_STYLES,dist,paceOf,perUnit,unitsOf,fmtTime,parseTime,formatDigits} from './ApexSettings';

const W=1080,H=1350,M=72;
const SANS='"Instrument Sans", -apple-system, Helvetica, sans-serif',SERIF='"Instrument Serif", Georgia, serif';
async function fonts(){try{await Promise.all([document.fonts?.load(`400 200px ${SANS}`),document.fonts?.load(`italic 400 80px ${SERIF}`),document.fonts?.load(`500 30px ${SANS}`)]);}catch{}}
const toBlob=c=>new Promise(r=>c.toBlob(r,'image/png'));

function gridRow(g,y,cells){
 const colW=(W-2*M-3*24)/4;
 cells.forEach(([label,value],i)=>{const x=M+i*(colW+24);g.fillStyle='rgba(255,255,255,.6)';g.fillRect(x,y,colW,2);g.fillStyle='rgba(255,255,255,.75)';g.font=`500 26px ${SANS}`;g.fillText(label.toUpperCase(),x,y+44);g.fillStyle='#fff';g.font=`400 54px ${SANS}`;g.fillText(value,x,y+110);});
}

function fit(points,x,y,w,h){
 const lat0=points[0][0],xs=points.map(p=>p[1]*Math.cos(lat0*Math.PI/180)),ys=points.map(p=>p[0]);
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const s=Math.min(w/Math.max(maxX-minX,1e-6),h/Math.max(maxY-minY,1e-6)),ox=x+(w-(maxX-minX)*s)/2,oy=y+(h-(maxY-minY)*s)/2;
 return points.map((_,i)=>[ox+(xs[i]-minX)*s,oy+(maxY-ys[i])*s]);
}

export async function drawRunPoster({activity:a,streams={},style='route',accent='#1C3BDB',settings,points=[],splits=[],number}){
 await fonts();
 const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
 g.fillStyle=accent;g.fillRect(0,0,W,H);
 const when=new Date(a.start_date_local||a.start_date);const utc=!!a.start_date_local;
 const dd=x=>String(x).padStart(2,'0');
 const date=`${dd(utc?when.getUTCDate():when.getDate())}.${dd((utc?when.getUTCMonth():when.getMonth())+1)}.${String(utc?when.getUTCFullYear():when.getFullYear()).slice(2)}`;
 const time=`${dd(utc?when.getUTCHours():when.getHours())}:${dd(utc?when.getUTCMinutes():when.getMinutes())}`;
 // top meta row on the grid
 const meta=[date,time,(a.location_city||a.sport_type||a.type||'Run'),number?`No. ${number}`:'APEX'];
 const colW=(W-2*M-3*24)/4;
 meta.forEach((t,i)=>{const x=M+i*(colW+24);g.fillStyle='rgba(255,255,255,.6)';g.fillRect(x,M,colW,2);g.fillStyle='#fff';g.font=`500 28px ${SANS}`;g.fillText(String(t).toUpperCase().slice(0,16),x,M+44);});
 // the artwork
 const art={x:M,y:170,w:W-2*M,h:560};
 g.strokeStyle='#fff';g.fillStyle='#fff';g.lineJoin='round';g.lineCap='round';
 if(style==='route'&&points.length>1){
  const xy=fit(points,art.x+40,art.y+20,art.w-80,art.h-40);g.lineWidth=14;g.beginPath();xy.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.stroke();
  g.beginPath();g.arc(xy[0][0],xy[0][1],22,0,Math.PI*2);g.fill();
 }else if(style==='elevation'&&streams.altitude?.data?.length>1){
  const alt=streams.altitude.data,lo=Math.min(...alt),hi=Math.max(...alt),span=hi-lo||1,base=art.y+art.h;
  g.beginPath();g.moveTo(art.x,base);alt.forEach((v,i)=>{if(i%Math.ceil(alt.length/400))return;g.lineTo(art.x+i/(alt.length-1)*art.w,base-(v-lo)/span*(art.h*.8));});g.lineTo(art.x+art.w,base);g.closePath();g.fill();
  g.fillStyle='rgba(255,255,255,.7)';g.font=`500 26px ${SANS}`;g.fillText(`${Math.round(a.total_elevation_gain||0)} M GAIN · ${Math.round(hi)} M HIGH`,art.x,art.y+30);
 }else if(style==='splits'&&splits.length>1){
  const sp=splits.filter(s=>s.distance>900),max=Math.max(...sp.map(s=>s.average_speed)),min=Math.min(...sp.map(s=>s.average_speed));
  const rowH=Math.min(46,art.h/sp.length);
  sp.forEach((s,i)=>{const y=art.y+i*rowH,t=max>min?(s.average_speed-min)/(max-min):.5,w=(art.w-200)*(.35+.65*t);g.fillStyle='#fff';g.fillRect(art.x+70,y+rowH*.2,w,rowH*.55);g.font=`500 ${Math.round(rowH*.48)}px ${SANS}`;g.fillStyle='rgba(255,255,255,.75)';g.fillText(String(i+1),art.x,y+rowH*.68);g.fillStyle='#fff';g.textAlign='right';g.fillText(paceOf(s.average_speed,settings),art.x+art.w,y+rowH*.68);g.textAlign='left';});
 }else{
  // a fallback artwork: the bend
  g.lineWidth=2;g.strokeStyle='rgba(255,255,255,.4)';for(let i=0;i<9;i++){const r=300+i*40;g.beginPath();g.arc(M,art.y+art.h,r,-Math.PI/2,0);g.stroke();}
 }
 // the number
 const hasDist=a.distance>0;
 g.fillStyle='#fff';g.font=`400 300px ${SANS}`;
 const big=hasDist?dist(a.distance,settings):fmtTime(a.moving_time);
 g.fillText(big,M-12,1010);
 const bw=g.measureText(big).width;g.font=`400 64px ${SANS}`;g.fillText(hasDist?unitsOf(settings):'',M+bw+4,1010);
 g.font=`italic 400 86px ${SERIF}`;g.fillText(String(a.name||'Run').slice(0,30),M,1110);
 gridRow(g,1170,[['Time',fmtTime(a.moving_time)],[hasDist?'Pace':'Avg HR',hasDist?`${paceOf(a.average_speed,settings)}${perUnit(settings)}`:(a.average_heartrate?String(Math.round(a.average_heartrate)):'—')],['HR',a.average_heartrate?String(Math.round(a.average_heartrate)):'—'],['Gain',`${Math.round(a.total_elevation_gain||0)} m`]]);
 return toBlob(c);
}

export async function shareImage(blob,name,title){
 if(!blob)return 'The image could not be drawn on this device.';
 const file=new File([blob],name,{type:'image/png'});
 try{if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title});return '';}}catch(e){if(e?.name==='AbortError')return '';}
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);return `Saved as ${name}.`;
}

// The poster sheet: preview, pick a layout, share.
export function PosterSheet({open,onClose,...data}){
 const [style,setStyle]=useState(data.settings?.poster||'route'),[url,setUrl]=useState(null),[blob,setBlob]=useState(null),[note,setNote]=useState('');
 useDialog(open,onClose);
 useEffect(()=>{if(!open)return;let alive=true,u;drawRunPoster({...data,style}).then(b=>{if(!alive||!b)return;u=URL.createObjectURL(b);setBlob(b);setUrl(u);});return()=>{alive=false;if(u)URL.revokeObjectURL(u);};
 },[open,style]);
 if(!open)return null;
 return createPortal(<div className="apex-modal-backdrop poster-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><section className="apex-modal poster-sheet" role="dialog" aria-modal="true" aria-labelledby="poster-title">
  <div className="stage-top"><h2 id="poster-title">Run poster</h2><button className="close-button" onClick={onClose} aria-label="Close poster"><Icon name="close" size={18}/></button></div>
  <div className="poster-preview">{url?<img src={url} alt={`Poster of ${data.activity?.name}`}/>:<span className="spinner"/>}</div>
  <div className="apex-segments">{Object.entries(POSTER_STYLES).map(([k,l])=><button key={k} aria-pressed={style===k} onClick={()=>setStyle(k)}>{l}</button>)}</div>
  <button className="primary-action" disabled={!blob} onClick={async()=>setNote(await shareImage(blob,'apex-run.png',data.activity?.name||'Run'))}>Share or save</button>
  {note&&<p className="form-note">{note}</p>}
 </section></div>,document.querySelector('.apex-app')||document.body);
}

// ── Pace band ──
export function bandSplits(target,km=42.195,strategy='even'){
 const step=km>21.2?5:km>10.1?2.5:1,marks=[];for(let k=step;k<km-0.01;k+=step)marks.push(k);marks.push(km);
 const base=target/km,neg=strategy==='negative'?0.012:0;
 // negative split: the first half 1.2% slower than average, the second 1.2% faster
 return marks.map(k=>{const first=Math.min(k,km/2),second=Math.max(0,k-km/2);const t=first*base*(1+neg)+second*base*(1-neg);return {k,t,pace:k<=km/2?base*(1+neg):base*(1-neg)};});
}

async function drawBand({name,target,km,rows,accent}){
 await fonts();
 const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
 g.fillStyle='#F5F4F0';g.fillRect(0,0,W,H);g.fillStyle=accent;g.fillRect(0,0,W,300);
 g.fillStyle='#fff';g.font=`500 28px ${SANS}`;g.fillText('PACE BAND · APEX',M,M+20);
 g.font=`italic 400 84px ${SERIF}`;g.fillText(String(name).slice(0,24),M,M+120);
 g.font=`400 120px ${SANS}`;g.fillText(fmtTime(target),M,M+220);
 const top=360,rowH=Math.min(84,(H-top-60)/rows.length);
 rows.forEach((r,i)=>{const y=top+i*rowH;g.fillStyle='rgba(16,19,34,.16)';g.fillRect(M,y,W-2*M,2);g.fillStyle='#5B6070';g.font=`500 32px ${SANS}`;g.fillText(`${r.k%1?r.k.toFixed(1):r.k} km`,M,y+rowH*.68);g.fillStyle='#101322';g.font=`400 ${Math.round(rowH*.62)}px ${SANS}`;g.textAlign='right';g.fillText(fmtTime(r.t),W-M,y+rowH*.72);g.fillStyle='#5B6070';g.font=`500 28px ${SANS}`;g.fillText(`${fmtTime(r.pace)}/km`,W-M-300,y+rowH*.68);g.textAlign='left';});
 return toBlob(c);
}

export function PaceBand({goal,goals={},accent}){
 const km=(parseFloat(goal?.distance)||42.195),defaultT=(km>42?goals.Marathon:km>21?goals.Half:null)||null;
 const fromTarget=String(goal?.target||'').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
 const initial=defaultT||(fromTarget?(fromTarget[3]!=null?(+fromTarget[1])*3600+(+fromTarget[2])*60+(+fromTarget[3]):(+fromTarget[1])*3600+(+fromTarget[2])*60):3*3600);
 const [text,setText]=useState(fmtTime(initial)),[strategy,setStrategy]=useState('even'),[note,setNote]=useState('');
 const target=parseTime(text)||initial,rows=bandSplits(target,km,strategy);
 return <section className="pace-band" aria-labelledby="band-title">
  <div className="section-head"><h2 id="band-title">Pace band</h2><span className="meta">{goal?.name||'Marathon'}</span></div>
  <div className="band-controls"><label>Target<input inputMode="numeric" pattern="[0-9:]*" autoComplete="off" value={text} onChange={e=>setText(formatDigits(e.target.value))}/></label><div className="apex-segments">{[['even','Even'],['negative','Negative split']].map(([k,l])=><button key={k} aria-pressed={strategy===k} onClick={()=>setStrategy(k)}>{l}</button>)}</div></div>
  <p className="band-pace"><b>{fmtTime(target/km)}</b> /km average{strategy==='negative'?` · ${fmtTime(rows[0].pace)} then ${fmtTime(rows[rows.length-1].pace)}`:''}</p>
  <ol className="band-rows">{rows.map(r=><li key={r.k}><span>{r.k%1?r.k.toFixed(1):r.k} km</span><i style={{width:`${r.k/km*100}%`}}/><b>{fmtTime(r.t)}</b></li>)}</ol>
  <button className="secondary-action" onClick={async()=>setNote(await shareImage(await drawBand({name:goal?.name||'Race day',target,km,rows,accent}),'apex-pace-band.png','Pace band'))}><Icon name="external" size={17}/>Share band</button>
  {note&&<p className="form-note">{note}</p>}
 </section>;
}
