// APEX · sign in (public build), plus the privacy policy and terms.
import {useState} from 'react';
import {sendCode,verifyCode} from './apexAuth';
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
    <p>Sign in or create your account. We’ll email you a 6-digit code: no password to remember.</p>
    <label className="signin-field">Email<input type="email" inputMode="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required/></label>
    <button className="welcome-cta" disabled={busy}><span>{busy?'Sending…':'Email me a code'}</span><span aria-hidden="true">→</span></button>
   </form>:<form onSubmit={verify} className="signin-form">
    <p>We sent a code to <b>{email}</b>. Enter it below, or tap the link in the email on this device.</p>
    <label className="signin-field">6-digit code<input inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} placeholder="123456" required/></label>
    <button className="welcome-cta" disabled={busy||code.length<6}><span>{busy?'Checking…':'Sign in'}</span><span aria-hidden="true">→</span></button>
    <button type="button" className="signin-link" onClick={()=>{setStep('email');setCode('');setErr('');}}>Use a different email</button>
   </form>}
   {err&&<p className="signin-error" role="alert">{err}</p>}
   <small>By continuing you agree to the <a href="#terms">terms</a> and <a href="#privacy">privacy policy</a>. Apex gives training guidance, not medical advice.</small>
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
   <P h="Where it’s stored">Your account data is stored with Supabase. Connection tokens for Strava, WHOOP and COROS are kept on your device. Activity history is cached on your device for speed.</P>
   <P h="How long we keep it">Until you delete it or your account. Deleting your account (Customise → Account) removes everything we hold, immediately.</P>
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
