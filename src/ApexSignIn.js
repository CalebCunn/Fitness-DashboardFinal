// APEX · sign in (public build), plus the privacy policy and terms.
import {useEffect,useState} from 'react';
import {sendCode,verifyCode,signOut,stravaCapacity,joinWaitlist,sendFeedback,signUpPassword,signInPassword,verifySignup,resendSignup,sendReset,verifyReset,setPassword,googleSignIn,GOOGLE} from './apexAuth';
import {Bend} from './ApexTrack';

// The public support address (the Apex mailbox), shown on Support, Privacy and Terms.
const CONTACT = 'hello@apexrunning.app';

// The arch draws itself, the runner drops in, the wordmark and form rise. ~1.6 s, skipped with reduced motion.
function Hero(){
 return <div className="si-hero" aria-hidden="true">
  <svg className="si-lanes" viewBox="0 0 400 260" preserveAspectRatio="xMidYMax slice">
   {[0,1,2,3,4].map(i=>{const r=150+i*26;return <path key={i} style={{'--d':`${i*90}ms`}} pathLength="1" d={`M${200-r} 270V${270-r*.55}A${r} ${r*.9} 0 0 1 ${200+r} ${270-r*.55}V270`}/>;})}
  </svg>
  <svg className="si-mark" viewBox="0 0 100 100">
   <path className="si-outer" pathLength="1" d="M16 92V44A34 34 0 0 1 84 44V92"/>
   <path className="si-inner" pathLength="1" d="M32 92V44A18 18 0 0 1 68 44V92"/>
   <circle className="si-dot" cx="50" cy="62" r="6"/>
  </svg>
  <em className="si-word">Apex</em>
 </div>;
}

const GoogleG=()=><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>;

export function SignIn(){
 // modes: signin · signup · confirm (signup code) · forgot · reset (recovery code + new password) · code · code-verify
 const [mode,setMode]=useState('signin'),[email,setEmail]=useState(''),[pw,setPw]=useState(''),[show,setShow]=useState(false),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[err,setErr]=useState(''),[note,setNote]=useState('');
 const go=m=>{setMode(m);setErr('');setNote('');setCode('');};
 const okEmail=()=>{if(!/^\S+@\S+\.\S+$/.test(email.trim())){setErr('Enter a valid email address.');return false;}return true;};
 const run=fn=>async e=>{e?.preventDefault();setErr('');setNote('');setBusy(true);try{await fn();}catch(x){setErr(x.message);if(x.unconfirmed)go('confirm');}setBusy(false);};
 const E=email.trim();
 const signin=run(async()=>{if(!okEmail())return;await signInPassword(E,pw);});
 const signup=run(async()=>{if(!okEmail())return;if(pw.length<8)throw new Error('Use at least 8 characters.');const r=await signUpPassword(E,pw);if(r==='confirm')go('confirm');});
 const confirm=run(async()=>{await verifySignup(E,code.trim());});
 const forgot=run(async()=>{if(!okEmail())return;await sendReset(E);go('reset');});
 const reset=run(async()=>{if(pw.length<8)throw new Error('Use at least 8 characters.');await verifyReset(E,code.trim());await setPassword(pw);});
 const sendC=run(async()=>{if(!okEmail())return;await sendCode(E);go('code-verify');});
 const verifyC=run(async()=>{await verifyCode(E,code.trim());});
 const emailF=<label className="signin-field">Email<input type="email" inputMode="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required/></label>;
 const pwF=(label,ac)=><label className="signin-field">{label}<span className="si-pw"><input type={show?'text':'password'} autoComplete={ac} value={pw} onChange={e=>setPw(e.target.value)} placeholder={ac==='new-password'?'At least 8 characters':'Your password'} required minLength={ac==='new-password'?8:undefined}/><button type="button" onClick={()=>setShow(!show)}>{show?'Hide':'Show'}</button></span></label>;
 const codeF=<label className="signin-field">Code from the email<input inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} placeholder="12345678" required/></label>;
 const cta=(label,dis)=><button className="welcome-cta" disabled={busy||dis}><span>{busy?'One moment…':label}</span><span aria-hidden="true">→</span></button>;
 const back=<button type="button" className="signin-link" onClick={()=>go('signin')}>← Back to sign in</button>;
 const alt=<>
  <div className="si-or"><span>or</span></div>
  {GOOGLE&&<button type="button" className="si-google" onClick={run(googleSignIn)} disabled={busy}><GoogleG/>Continue with Google</button>}
  <button type="button" className="signin-link si-center" onClick={()=>go('code')}>Email me a sign-in code instead</button>
 </>;
 return <div className="welcome signin si">
  <Hero/>
  <div className="welcome-inner si-body">
   <h1>Every run, <em>read well.</em></h1>
   {(mode==='signin'||mode==='signup')&&<>
    <div className="si-tabs" role="tablist">{[['signin','Sign in'],['signup','Create account']].map(([k,l])=><button key={k} role="tab" aria-selected={mode===k} onClick={()=>go(k)}>{l}</button>)}</div>
    <form onSubmit={mode==='signin'?signin:signup} className="signin-form">
     {emailF}{pwF('Password',mode==='signin'?'current-password':'new-password')}
     {cta(mode==='signin'?'Sign in':'Create account')}
     {mode==='signin'&&<button type="button" className="signin-link" onClick={()=>go('forgot')}>Forgot password?</button>}
    </form>
    {alt}
   </>}
   {mode==='confirm'&&<form onSubmit={confirm} className="signin-form">
    <p>We sent a code to <b>{E}</b> to confirm it’s you. Enter it below, or tap the link in the email.</p>{codeF}{cta('Confirm and continue',code.length<6)}
    <button type="button" className="signin-link" onClick={run(async()=>{await resendSignup(E);setNote('Sent a new code.');})}>Send a new code</button>{back}
   </form>}
   {mode==='forgot'&&<form onSubmit={forgot} className="signin-form"><p>We’ll email you a code to set a new password.</p>{emailF}{cta('Email me a code')}{back}</form>}
   {mode==='reset'&&<form onSubmit={reset} className="signin-form"><p>Enter the code we sent to <b>{E}</b>, then choose a new password.</p>{codeF}{pwF('New password','new-password')}{cta('Save and sign in',code.length<6)}{back}</form>}
   {mode==='code'&&<form onSubmit={sendC} className="signin-form"><p>No password needed: we’ll email you a code.</p>{emailF}{cta('Email me a code')}{back}</form>}
   {mode==='code-verify'&&<form onSubmit={verifyC} className="signin-form"><p>We sent a code to <b>{E}</b>. Enter it below, or tap the link in the email on this device.</p>{codeF}{cta('Sign in',code.length<6)}{back}</form>}
   {err&&<p className="signin-error" role="alert">{err}</p>}
   {note&&<p className="si-note" role="status">{note}</p>}
   <small>By continuing you agree to the <a href="#terms">terms</a> and <a href="#privacy">privacy policy</a>. Apex gives training guidance, not medical advice. <a href="#support">Support</a></small>
  </div>
 </div>;
}

// After a password-reset link (rather than a code), Supabase signs the user in and asks for a new password here.
export function NewPassword({onDone}){
 const [pw,setPw]=useState(''),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 const save=async e=>{e.preventDefault();setBusy(true);setErr('');try{if(pw.length<8)throw new Error('Use at least 8 characters.');await setPassword(pw);onDone();}catch(x){setErr(x.message);}setBusy(false);};
 return <div className="welcome signin si"><Hero/><div className="welcome-inner si-body"><h1>New <em>password.</em></h1>
  <form onSubmit={save} className="signin-form"><label className="signin-field">New password<input type="password" autoComplete="new-password" minLength={8} value={pw} onChange={e=>setPw(e.target.value)} placeholder="At least 8 characters" required/></label>
  <button className="welcome-cta" disabled={busy}><span>{busy?'Saving…':'Save password'}</span><span aria-hidden="true">→</span></button></form>
  {err&&<p className="signin-error" role="alert">{err}</p>}</div></div>;
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
    <li><b>Account:</b> your email address, and your password if you set one. Passwords are stored only in scrambled (hashed) form by Supabase, so nobody at Apex can see them. If you sign in with Google, Google shares your name and email address with us.</li>
    <li><b>What you add:</b> preferences, training plans, races, personal bests, check-ins (energy, stress, soreness and where), journal entries, meals and body weight, and coach conversations.</li>
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
   <P h="Your account">Keep your password and your email secure: anyone who can get into your email can reset your password. You must be 16 or over to use Apex.</P>
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
  <Q q="How do I sign in?">With your email and password. The first time, tap <b>Create account</b>; we email you a code to confirm it’s you. After that, just sign in.{GOOGLE&&<> You can also use <b>Continue with Google</b>.</>} If you’d rather not use a password, tap <b>Email me a sign-in code instead</b>.</Q>
  <Q q="I forgot my password">On the sign-in screen, tap <b>Forgot password?</b> and enter your email. We’ll send you a code: enter it with a new password and you’re back in.</Q>
  <Q q="I used to sign in with a code. How do I get a password?">Sign in with a code one more time, then go to <b>Customise → Account → Set password</b>. Or use <b>Forgot password?</b> on the sign-in screen. Your data stays exactly as it is.</Q>
  <Q q="Which apps and devices work with Apex?">Strava for your activities (required), WHOOP for sleep and recovery, and COROS for training data. Any watch that syncs to Strava works.</Q>
  <Q q="Why can’t I connect Strava?">Apex is in a small beta while Strava reviews the app, so the number of people who can connect is limited. If it’s full, join the waitlist and we’ll email you when a place opens.</Q>
  <Q q="How do I use Apex on my phone like an app?">iPhone: open apexrunning.app in Safari, tap Share, then Add to Home Screen. Android: open it in Chrome, tap the menu, then Install app.</Q>
  <Q q="How many coach messages do I get?">Free accounts include {process.env.REACT_APP_FREE_MESSAGES||30} a month, shown in Customise → Account. For unlimited use you can add your own Anthropic key in Customise → Coach and AI.</Q>
  <Q q="Does the coach remember what I write in my journal?">Yes. Everything in More → Journal, plus your morning check-ins, is saved to your account and given to the coach with every message, so it can refer back to how runs felt and what you ate. Only you and your coach can read it.</Q>
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
