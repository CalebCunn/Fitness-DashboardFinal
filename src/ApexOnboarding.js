// APEX · first-run setup (public build). Three quick screens so the coach knows you from the
// first message: your name, what you're training for, and your week. Everything is editable later.
import {useState} from 'react';

const GOALS = [['5K', 5], ['10K', 10], ['Half marathon', 21.0975], ['Marathon', 42.195], ['Ultra', null], ['Getting fitter', null]];
const DAYS = [2, 3, 4, 5, 6, 7];
const LIFT = [['None', 0], ['Once', 1], ['Twice', 2], ['3+', 3]];

export default function Onboarding({ prefs, onDone }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(prefs?.profile?.name || '');
  const [goal, setGoal] = useState(null), [race, setRace] = useState(''), [date, setDate] = useState(''), [target, setTarget] = useState('');
  const [days, setDays] = useState(4), [lift, setLift] = useState(1), [notes, setNotes] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const next = e => { e?.preventDefault(); setStep(step + 1); };
  const finish = () => {
    const g = GOALS.find(x => x[0] === goal);
    const focus = [goal, race && `${race}${date ? ` on ${new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}`, target && `target ${target}`].filter(Boolean).join(' · ');
    const races = race ? [...(prefs?.races || []).map(r => ({ ...r, next: false })), { name: race, date, distance: g?.[1] ? String(g[1]) : '', target, next: true }] : (prefs?.races || []);
    onDone({
      ...prefs, onboarded: true, races,
      profile: { ...(prefs?.profile || {}), name: name.trim(), focus: focus || goal || '', availability: `${days} runs a week${lift ? `, strength ${LIFT.find(x => x[1] === lift)[0].toLowerCase()} a week` : ''}`, constraints: notes.trim() },
    });
  };
  return <div className="welcome onboard">
   <div className="onboard-top"><em className="welcome-mast" aria-label="APEX">Apex</em><div className="onboard-dots" aria-hidden="true">{[0, 1, 2].map(i => <i key={i} className={i <= step ? 'on' : ''} />)}</div></div>
   <div className="welcome-inner">
    {step === 0 && <form onSubmit={next} className="signin-form">
     <p className="lab">1 of 3</p><h1>What should we <em>call you?</em></h1>
     <label className="signin-field">First name<input autoFocus autoComplete="given-name" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" required /></label>
     <button className="welcome-cta" disabled={!name.trim()}><span>Next</span><span aria-hidden="true">→</span></button>
    </form>}
    {step === 1 && <form onSubmit={next} className="signin-form">
     <p className="lab">2 of 3</p><h1>What are you <em>training for?</em></h1>
     <div className="onboard-chips">{GOALS.map(([g]) => <button type="button" key={g} aria-pressed={goal === g} onClick={() => setGoal(g)}>{g}</button>)}</div>
     {goal && goal !== 'Getting fitter' && <>
      <label className="signin-field"><span>Race, if you’ve got one <small>optional</small></span><input value={race} onChange={e => setRace(e.target.value)} placeholder="e.g. Manchester Marathon" /></label>
      {race && <div className="onboard-row">
       <label className="signin-field">Date<input type="date" min={today} value={date} onChange={e => setDate(e.target.value)} /></label>
       <label className="signin-field"><span>Target <small>optional</small></span><input value={target} onChange={e => setTarget(e.target.value)} placeholder="e.g. sub 3:30" /></label>
      </div>}
     </>}
     <button className="welcome-cta" disabled={!goal}><span>Next</span><span aria-hidden="true">→</span></button>
     <button type="button" className="signin-link" onClick={() => setStep(0)}>Back</button>
    </form>}
    {step === 2 && <form onSubmit={e => { e.preventDefault(); finish(); }} className="signin-form">
     <p className="lab">3 of 3</p><h1>Your <em>week.</em></h1>
     <span className="signin-field">Runs a week</span>
     <div className="onboard-chips">{DAYS.map(d => <button type="button" key={d} aria-pressed={days === d} onClick={() => setDays(d)}>{d}</button>)}</div>
     <span className="signin-field">Strength sessions a week</span>
     <div className="onboard-chips">{LIFT.map(([l, n]) => <button type="button" key={l} aria-pressed={lift === n} onClick={() => setLift(n)}>{l}</button>)}</div>
     <label className="signin-field"><span>Injuries or anything the coach should know <small>optional</small></span><input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. tight left calf, no runs before 7am" /></label>
     <button className="welcome-cta"><span>Done</span><span aria-hidden="true">→</span></button>
     <button type="button" className="signin-link" onClick={() => setStep(1)}>Back</button>
    </form>}
    <small>You can change any of this later in You and Customise.</small>
   </div>
  </div>;
}
