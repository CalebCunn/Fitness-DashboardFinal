// APEX · Owner stats (public site, owner's account only; the server refuses everyone else).
// Sign-ups, who's active, connections, coach use and Pro, from apex-stats.
import {useEffect,useState} from 'react';
import {session} from './apexAuth';

export const ADMIN_EMAILS=['caleb.cunn7@gmail.com','hello@apexrunning.app'];// shows the link only; the server checks for real
const n=v=>Number.isFinite(v)?v.toLocaleString('en-GB'):'—';
const ago=iso=>{const m=(Date.now()-new Date(iso))/60000;return m<60?`${Math.max(1,Math.round(m))}m ago`:m<1440?`${Math.round(m/60)}h ago`:`${Math.round(m/1440)}d ago`;};
const date=iso=>new Date(iso).toLocaleDateString('en-GB',{day:'numeric',month:'short'});

async function loadStats(){
 const s=await session().catch(()=>null);
 const r=await fetch('/.netlify/functions/apex-stats',{headers:{Authorization:`Bearer ${s?.access_token||''}`}});
 if(!r.ok)throw new Error(r.status===404?'Stats are only for the owner’s account.':'Stats couldn’t load. Pull down to try again.');
 return r.json();
}

function Signups({daily}){
 const max=Math.max(1,...daily.map(d=>d.signups)),w=360/daily.length,H=110;
 return <section className="dy-chart"><div className="section-label"><div><span className="eyebrow">30 days</span><h2>Sign-ups</h2></div><p><strong>{n(daily.reduce((a,d)=>a+d.signups,0))}</strong> in 30 days</p></div>
  <svg viewBox={`0 0 360 ${H}`} preserveAspectRatio="none" role="img" aria-label="Sign-ups per day over the last 30 days">
   {daily.map((d,i)=>{const h=d.signups/max*(H-6);return <rect key={d.day} x={i*w+w*.15} width={w*.7} y={H-h} height={d.signups?Math.max(h,3):0} rx="2" className={i===daily.length-1?'dy-bar is-today':'dy-bar is-goal'}><title>{`${date(d.day)}: ${d.signups}`}</title></rect>;})}
   <line x1="0" x2="360" y1={H-.5} y2={H-.5} className="dy-goal"/>
  </svg>
  <div className="dy-axis"><span>{date(daily[0].day)}</span><span>Today</span></div></section>;
}

export default function Stats({refreshKey}){
 const [s,setS]=useState(null),[err,setErr]=useState('');
 useEffect(()=>{let live=true;setErr('');loadStats().then(d=>{if(live)setS(d);}).catch(e=>{if(live)setErr(e.message);});return()=>{live=false;};},[refreshKey]);
 if(err)return <p className="form-note">{err}</p>;
 if(!s)return <p className="form-note">Loading…</p>;
 const pct=x=>s.users?`${Math.round(x/s.users*100)}%`:'—';
 const tiles=[
  ['Accounts',n(s.users),'',`+${n(s.signups.week)} this week · +${n(s.signups.today)} today`],
  ['Active this week',n(s.active.week),'',`${n(s.active.day)} today · ${n(s.active.month)} this month`],
  ['Pro paying',n(s.pro.paid),'',`£${s.pro.mrr.toFixed(2)} a month · ${n(s.pro.founding)} founding`],
  ['Coach users',n(s.coach.users),'',`${n(s.coach.messages)} messages · ${n(s.coach.photos)} meal photos`],
  ['Finished setup',n(s.onboarded),'',pct(s.onboarded)+' of accounts'],
  ['Connected a source',n(s.connected),'',pct(s.connected)+' of accounts'],
 ];
 return <div className="daily-page">
  <div className="dy-tiles">{tiles.map(([l,v,u,p])=><div key={l} className="dy-tile"><span>{l}</span><strong>{v}{u&&<small> {u}</small>}</strong><p>{p}</p></div>)}</div>
  <p className="form-note dy-source">Updated {new Date(s.at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}. Pull down to refresh. Connections: Strava {n(s.connections.strava)} · WHOOP {n(s.connections.whoop)} · Oura {n(s.connections.oura)} · Google {n(s.connections.google)}{s.waitlist?` · Strava waitlist ${n(s.waitlist)}`:''}. Apple Health and COROS stay on the phone, so they aren’t counted.</p>
  <Signups daily={s.daily}/>
  <section className="dy-chart"><div className="section-label"><div><span className="eyebrow">Newest first</span><h2>Recent sign-ups</h2></div></div>
   <div className="st-list">{s.recent.map(r=><div key={r.email+r.joined} className="st-row"><span><b>{r.email}</b><small>Joined {date(r.joined)} · seen {ago(r.seen)}{r.conns.length?` · ${r.conns.join(', ')}`:''}{r.coach?` · ${r.coach} coach`:''}</small></span><em className={`plan-badge${r.plan!=='free'?' is-pro':''}`}>{r.plan==='paid'?'Pro':r.plan==='founding'?'Founding':r.onboarded?'Free':'Setup'}</em></div>)}</div>
  </section>
 </div>;
}
