// APEX · sign in (public build), plus the privacy policy and terms.
import {useEffect,useState} from 'react';
import {sendCode,verifyCode,signOut,stravaCapacity,joinWaitlist,sendFeedback} from './apexAuth';
import {Bend} from './ApexTrack';

const CONTACT = process.env.REACT_APP_CONTACT_EMAIL || 'hello@apexrunning.app';

export function SignIn(){
 const [step,setStep]=useState('email'),[email,setEmail]=useState(''),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 const send=async e=>{e.preventDefault();setErr('');if(!/^\S+@\S+\.\S+$/.test(email)){setErr('Enter a valid email address.');return;}setBusy(true);try{await sendCode(email.trim());setStep('code');}catch(x){setErr(/rate/i.test(x.message)?'Too many attempts. Wait a minute and try again.':'We couldn’t send a code. Check the address and try again.');}setBusy(false);};
 const verify=async e=>{e.preventDefault();setErr('');setBusy(true);try{await verifyCode(email.trim(),code.trim());}catch(x){setErr(x.message);setBusy(false);}};
 return <div className="welcome signin">
  <div className="welcome-poster"><Bend progress={78} score={78}/><em className="welcome-mast" aria-label="APEX">Apex</em><div className="welcome-meta"><span>Running</span><span>Training</span><span>Recovery</span></div></div>
  <div className="welcome-inner">
   <h1>Every run, <em>read well.</em></h1>
   {step==='email'?<form onSubmit={send} className="signin-form">
    <p>Sign in or create your account. We’ll email you a sign-in code: no password to remember.</p>
    <label className="signin-field">Email<input type="email" inputMode="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required/></label>
    <button className="welcome-cta" disabled={busy}><span>{busy?'Sending…':'Email me a code'}</span><span aria-hidden="true">→</span></button>
   </form>:<form onSubmit={verify} className="signin-form">
    <p>We sent a code to <b>{email}</b>. Enter it below, or tap the link in the email on this device.</p>
    <label className="signin-field">Code from the email<input inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} placeholder="12345678" required/></label>
    <button className="welcome-cta" disabled={busy||code.length<6}><span>{busy?'Checking…':'Sign in'}</span><span aria-hidden="true">→</span></button>
    <button type="button" className="signin-link" onClick={()=>{setStep('email');setCode('');setErr('');}}>Use a different email</button>
   </form>}
   {err&&<p className="signin-error" role="alert">{err}</p>}
   <small>By continuing you agree to the <a href="#terms">terms</a> and <a href="#privacy">privacy policy</a>. Apex gives training guidance, not medical advice. <a href="#support">Support</a></small>
  </div>
 </div>;
}

const P=({h,children})=><section><h2>{h}</h2>{children}</section>;

export function Legal({kind}){
 const back=()=>{window.location.hash='';};
 return <div className="legal">
  <button className="signin-link" onClick={back}>← Back</button>
  {kind==='privacy'?<>
   <h1>Privacy policy</h1><p className="legal-date">Last updated October 2026 · Draft</p>
   <P h="Who we are">Apex is a running and recovery app. For any privacy question, or to use any of your rights below, email {CONTACT}.</P>
   <P h="What we collect"><ul>
    <li><b>Account:</b> your email address.</li>
    <li><b>What you add:</b> preferences, training plans, races, personal bests, check-ins (energy, stress, soreness and where), meals and body weight, and coach conversations.</li>
    <li><b>From services you connect:</b> Strava activities and gear; WHOOP recovery, sleep and heart-rate data; COROS training data. We only connect a service when you choose to.</li>
   </ul></P>
   <P h="Health data">Sleep, heart rate, recovery and soreness are health data, which UK GDPR treats as special category data. We process it only with your explicit consent, given when you connect a service or enter it, and only to run Apex for you. You can withdraw consent at any time by disconnecting the service or deleting your account.</P>
   <P h="How we use it">To show your training and recovery, make Today’s call, and answer your coach questions. When you use the coach or meal estimates, the relevant data is sent to Anthropic (the AI provider) to generate the reply. We don’t sell your data, use it for advertising, or share it with anyone else.</P>
   <P h="Where it’s stored">Your account data is stored with Supabase (encrypted at rest). So you stay connected on every device, the connection tokens for Strava and WHOOP are stored with your account, where only you can access them. COROS tokens stay on your device. Activity history is cached on your device for speed.</P>
   <P h="How long we keep it">Until you delete it or your account. Deleting your account (Customise → Account) removes everything we hold, immediately, and disconnects Apex from your Strava account.</P>
   <P h="Your rights">You can access, correct, export, or delete your data, and object to or restrict how we use it. You can also complain to the Information Commissioner’s Office (ico.org.uk).</P>
  </>:<>
   <h1>Terms of use</h1><p className="legal-date">Last updated October 2026 · Draft</p>
   <P h="Training guidance, not medical advice">Apex suggests how to train based on your data. It is not a medical device and doesn’t diagnose or treat anything. If something hurts, if you feel unwell, or if you have a medical condition, stop and speak to a qualified professional. You’re responsible for how you train.</P>
   <P h="Your account">Keep your email secure, as anyone with access to it can sign in. You must be 16 or over to use Apex.</P>
   <P h="Connected services">Strava, WHOOP and COROS are separate services with their own terms. Apex isn’t affiliated with or endorsed by them. Data from them is shown to you and used to run Apex.</P>
   <P h="The coach">The coach is AI and can be wrong. Check anything important. Free accounts include a monthly allowance; we may change allowances with notice.</P>
   <P h="Fair use">Don’t misuse Apex, try to access other people’s data, or overload the service. We can suspend accounts that do.</P>
   <P h="Changes and contact">We’ll tell you about material changes before they apply. Questions: {CONTACT}.</P>
  </>}
 </div>;
}

// Shown instead of "Connect with Strava" while all of Strava's athlete places are taken.
export function StravaGate({children}){
 const [state,setState]=useState(null);
 useEffect(()=>{let live=true;stravaCapacity().then(s=>{if(live)setState(s);}).catch(()=>{if(live)setState({open:true});});return()=>{live=false;};},[]);
 if(!state)return <div className="app-loading"><div/></div>;
 if(state.open)return children;
 return <WaitlistView state={state} setState={setState}/>;
}
function WaitlistView({state,setState=()=>{}}){
 const [busy,setBusy]=useState(false),[err,setErr]=useState('');
 const join=async()=>{setBusy(true);setErr('');try{await joinWaitlist();setState({...state,waitlisted:true});}catch(e){setErr(e.message);}setBusy(false);};
 return <div className="welcome signin waitlist">
  <div className="welcome-poster"><Bend progress={78} score={78}/><em className="welcome-mast" aria-label="APEX">Apex</em></div>
  <div className="welcome-inner">
   {state.waitlisted?<>
    <h1>You’re <em>on the list.</em></h1>
    <p>Apex is in a small beta while Strava reviews the app, and every tester place is taken. We’ll email you the moment a place opens. Your account and setup are saved, so you’ll go straight in.</p>
   </>:<>
    <h1>Apex is <em>full right now.</em></h1>
    <p>We’re in a small beta while Strava reviews the app, and all {state.capacity} tester places are taken. Join the waitlist and we’ll email you as soon as a place opens.</p>
    <button className="welcome-cta" onClick={join} disabled={busy}><span>{busy?'Joining…':'Join the waitlist'}</span><span aria-hidden="true">→</span></button>
   </>}
   {err&&<p className="signin-error" role="alert">{err}</p>}
   <small><a href="#support">Questions?</a> · <button className="signin-link" style={{display:'inline',padding:0,fontSize:'inherit'}} onClick={()=>signOut()}>Sign out</button></small>
  </div>
 </div>;
}

export function Support(){
 const Q=({q,children})=><details className="faq"><summary>{q}</summary><div>{children}</div></details>;
 return <div className="legal">
  <button className="signin-link" onClick={()=>{window.location.hash='';}}>← Back</button>
  <h1>Support</h1><p className="legal-date">We usually reply within a day.</p>
  <p>Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>, or use <b>Customise → Send feedback</b> in the app.</p>
  <h2>Common questions</h2>
  <Q q="How do I sign in?">Enter your email and we’ll send you a code. Type it in, or tap the link in the email on the device you’re using. There’s no password.</Q>
  <Q q="Which apps and devices work with Apex?">Strava for your activities (required), WHOOP for sleep and recovery, and COROS for training data. Any watch that syncs to Strava works.</Q>
  <Q q="Why can’t I connect Strava?">Apex is in a small beta while Strava reviews the app, so the number of people who can connect is limited. If it’s full, join the waitlist and we’ll email you when a place opens.</Q>
  <Q q="How do I use Apex on my phone like an app?">iPhone: open apexrunning.app in Safari, tap Share, then Add to Home Screen. Android: open it in Chrome, tap the menu, then Install app.</Q>
  <Q q="How many coach messages do I get?">Free accounts include {process.env.REACT_APP_FREE_MESSAGES||30} a month, shown in Customise → Account. For unlimited use you can add your own Anthropic key in Customise → Coach and AI.</Q>
  <Q q="Is Apex medical advice?">No. Apex gives training guidance based on your data. If something hurts or you feel unwell, stop and speak to a professional.</Q>
  <Q q="How do I disconnect Strava or delete my account?">Disconnect a service in You. Delete everything in Customise → Account → Delete account. That removes all your data and disconnects Apex from Strava.</Q>
  <p style={{marginTop:28}}><a href="#privacy">Privacy policy</a> · <a href="#terms">Terms</a></p>
 </div>;
}

export function Feedback(){
 const [text,setText]=useState(''),[state,setState]=useState('');
 const send=async e=>{e.preventDefault();setState('Sending…');try{await sendFeedback(text,window.location.hash.slice(1)||'home');setText('');setState('Thanks, that’s sent. We read every one.');}catch(x){setState(x.message);}};
 return <form onSubmit={send} className="feedback-form">
  <label className="set-field">What’s working, what’s rubbish, what’s missing?<textarea rows={4} value={text} onChange={e=>{setText(e.target.value);setState('');}} placeholder="Be as blunt as you like."/></label>
  <div className="set-row" style={{borderBottom:0,justifyContent:'flex-start'}}><button className="secondary-action" disabled={!text.trim()||state==='Sending…'}>Send feedback</button>{state&&<small role="status">{state}</small>}</div>
 </form>;
}

// Sample-mode only: the waitlist screen without a server.
export function StravaGateDemo(){return <WaitlistView state={{open:false,capacity:10,waitlisted:false}}/>;}
