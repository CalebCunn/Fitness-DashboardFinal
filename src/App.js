import { useState, useEffect, useRef } from "react";
import { AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { isConnected, disconnect, exchangeCode, getAthlete, getStats, getActivities, getActivity, getStreams } from "./strava";
import { isWhoopConnected, disconnectWhoop, exchangeWhoopCode, getWhoopAuthUrl, getWhoopData } from "./whoop";
import { PBS, SHOES, LIFTS, RACES, SPONSORSHIP, fPace, fTime, fDist, actType, typeCol, recCol, weeklyVol } from "./data";

// ─── DESIGN ───────────────────────────────────────────────────────────────────
const C = {
  bg:      "#08090e",
  surface: "#0e1117",
  card:    "#13161f",
  border:  "#1e2535",
  teal:    "#34d399",
  pink:    "#f472b6",
  amber:   "#fbbf24",
  purple:  "#a78bfa",
  blue:    "#60a5fa",
  orange:  "#fb923c",
  text:    "#f1f5f9",
  sub:     "#94a3b8",
  muted:   "#3d4f63",
  mono:    "'JetBrains Mono', monospace",
};

// ─── TINY COMPONENTS ──────────────────────────────────────────────────────────
const Card = ({ children, style={}, glow }) => (
  <div style={{
    background: C.card, border: `1px solid ${glow ? glow+"30" : C.border}`,
    borderRadius: 14, padding: 16,
    boxShadow: glow ? `0 0 20px ${glow}10` : "none",
    ...style
  }}>{children}</div>
);

const Label = ({ children, color=C.teal }) => (
  <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:12 }}>
    <div style={{ width:2, height:12, background:color, borderRadius:2 }} />
    <span style={{ fontSize:9, fontWeight:700, letterSpacing:"0.15em", textTransform:"uppercase", color, fontFamily:"Inter" }}>{children}</span>
  </div>
);

const Stat = ({ label, value, sub, color=C.teal, size="md" }) => {
  const fs = { sm:15, md:20, lg:28, xl:36 }[size] || 20;
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"11px 13px", flex:1, minWidth:0 }}>
      <div style={{ fontSize:9, fontWeight:600, color:C.muted, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:5 }}>{label}</div>
      <div style={{ fontFamily:C.mono, fontSize:fs, fontWeight:700, color, lineHeight:1.1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{value}</div>
      {sub && <div style={{ fontSize:9, color:C.muted, marginTop:3 }}>{sub}</div>}
    </div>
  );
};

const Pill = ({ children, color=C.teal }) => (
  <span style={{ fontSize:8, fontWeight:700, color, background:`${color}15`, border:`1px solid ${color}30`, borderRadius:4, padding:"2px 6px", letterSpacing:"0.1em", textTransform:"uppercase", whiteSpace:"nowrap" }}>{children}</span>
);

const Btn = ({ children, onClick, color=C.teal, sm, full, outline, style={} }) => (
  <button onClick={onClick} style={{
    background: outline ? "transparent" : color,
    color: outline ? color : C.bg,
    border: `1px solid ${color}`,
    borderRadius: 9, padding: sm ? "7px 14px" : "11px 20px",
    fontSize: sm ? 11 : 13, fontWeight:700,
    width: full ? "100%" : "auto",
    transition:"opacity .15s",
    ...style
  }}>{children}</button>
);

const Sep = () => <div style={{ height:1, background:C.border, margin:"2px 0" }} />;

const Loader = ({ text="Loading..." }) => (
  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flex:1, gap:14 }}>
    <div style={{ width:32, height:32, border:`2px solid ${C.border}`, borderTop:`2px solid ${C.teal}`, borderRadius:"50%", animation:"spin .8s linear infinite" }} />
    <div style={{ fontSize:12, color:C.muted }}>{text}</div>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);

const CT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"#0a0d14", border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 11px", fontSize:11 }}>
      <div style={{ color:C.muted, marginBottom:3, fontSize:9 }}>{label}</div>
      {payload.map((p,i) => <div key={i} style={{ color:p.color, fontWeight:600 }}>{p.name}: {p.value}</div>)}
    </div>
  );
};

const BackBtn = ({ onClick }) => (
  <button onClick={onClick} style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.sub, borderRadius:8, padding:"7px 13px", fontSize:11, fontWeight:500, display:"inline-flex", alignItems:"center", gap:5, marginBottom:14 }}>
    ← Back
  </button>
);

// ─── CONNECT SCREEN ──────────────────────────────────────────────────────────
function ConnectScreen({ whoopPending }) {
  const clientId = process.env.REACT_APP_STRAVA_CLIENT_ID;
  const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(window.location.origin)}&response_type=code&scope=read,activity:read_all`;

  if (whoopPending) {
    return (
      <div style={{ height:"100%", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:32, marginBottom:12 }}>⌚</div>
          <div style={{ fontSize:16, fontWeight:700, color:C.text, marginBottom:6 }}>Connecting Whoop...</div>
          <div style={{ fontSize:12, color:C.sub }}>Completing authorisation</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height:"100%", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ textAlign:"center", maxWidth:320 }}>
        <div style={{ fontFamily:C.mono, fontSize:11, color:C.teal, letterSpacing:"0.2em", marginBottom:16 }}>FITNESS DASHBOARD</div>
        <div style={{ fontSize:28, fontWeight:800, color:C.text, marginBottom:8, letterSpacing:"-0.02em" }}>Caleb Cunningham</div>
        <div style={{ fontSize:13, color:C.sub, marginBottom:32, lineHeight:1.7 }}>Connect Strava to load your live training data and unlock your personal fitness hub.</div>
        <a href={url} style={{ display:"inline-block", background:"#fc4c02", color:"#fff", borderRadius:10, padding:"13px 28px", fontSize:13, fontWeight:700, letterSpacing:"0.02em" }}>
          Connect with Strava
        </a>
        <div style={{ fontSize:9, color:C.muted, marginTop:10, letterSpacing:"0.08em" }}>READ-ONLY · YOUR DATA STAYS PRIVATE</div>
      </div>
    </div>
  );
}

// ─── ACTIVITY DETAIL ─────────────────────────────────────────────────────────
function ActivityDetail({ id, onBack }) {
  const [act, setAct] = useState(null);
  const [streams, setStreams] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getActivity(id), getStreams(id)])
      .then(([a,s]) => { setAct(a); setStreams(s); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ flex:1, display:"flex" }}><Loader text="Loading activity..." /></div>;
  if (!act) return <div style={{ padding:20, color:C.muted, fontSize:12 }}>Could not load activity.</div>;

  const type = actType(act);
  const color = typeCol(type);
  const laps = act.laps || [];
  const hr = streams?.heartrate?.data || [];
  const time = streams?.time?.data || [];
  const hrChart = hr.filter((_,i) => i%15===0).map((v,i) => ({ t:Math.round((time[i*15]||i*15)/60), hr:v }));

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12, paddingBottom:20 }}>
      <BackBtn onClick={onBack} />

      <Card glow={color}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:10 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:18, fontWeight:800, color:C.text, marginBottom:5, letterSpacing:"-0.01em" }}>{act.name}</div>
            <div style={{ fontSize:10, color:C.sub, marginBottom:8 }}>
              {new Date(act.start_date_local).toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" })}
              {act.gear?.name ? ` · ${act.gear.name}` : ""}
            </div>
            <Pill color={color}>{type}</Pill>
          </div>
          {act.suffer_score && (
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.1em", textTransform:"uppercase" }}>Suffer</div>
              <div style={{ fontFamily:C.mono, fontSize:28, fontWeight:700, color:C.amber }}>{act.suffer_score}</div>
            </div>
          )}
        </div>
      </Card>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:10 }}>
        <Stat label="Distance"  value={`${fDist(act.distance)}km`} />
        <Stat label="Time"      value={fTime(act.moving_time)} />
        <Stat label="Avg Pace"  value={fPace(act.average_speed)+"/km"} />
        {act.average_heartrate && <Stat label="Avg HR" value={`${Math.round(act.average_heartrate)}`} sub="bpm" color={C.pink} />}
        {act.max_heartrate     && <Stat label="Max HR" value={`${act.max_heartrate}`} sub="bpm" color={C.pink} />}
        {act.average_watts     && <Stat label="Power"  value={`${Math.round(act.average_watts)}`} sub="W avg" color={C.amber} />}
        {act.average_cadence   && <Stat label="Cadence" value={`${Math.round(act.average_cadence*2)}`} sub="spm" color={C.purple} />}
        {act.total_elevation_gain > 0 && <Stat label="Elevation" value={`${Math.round(act.total_elevation_gain)}m`} color={C.blue} />}
      </div>

      {laps.length > 1 && (
        <Card>
          <Label>Splits</Label>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {laps.map((lap,i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:10, background:C.surface, borderRadius:8, padding:"9px 12px" }}>
                <div style={{ fontSize:9, color:C.muted, minWidth:42, fontWeight:600, letterSpacing:"0.08em" }}>LAP {i+1}</div>
                <div style={{ fontFamily:C.mono, fontSize:13, fontWeight:600, color:C.teal, flex:1 }}>{fPace(lap.average_speed)}/km</div>
                <div style={{ fontSize:10, color:C.sub }}>{(lap.distance/1000).toFixed(2)}km</div>
                {lap.average_heartrate && <div style={{ fontSize:10, color:C.pink, minWidth:52, textAlign:"right" }}>{Math.round(lap.average_heartrate)} bpm</div>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {hrChart.length > 5 && (
        <Card>
          <Label color={C.pink}>Heart Rate</Label>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={hrChart}>
              <defs>
                <linearGradient id="hrg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.pink} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={C.pink} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" tick={{ fontSize:8, fill:C.muted }} tickLine={false} axisLine={false} unit="m" />
              <YAxis tick={{ fontSize:8, fill:C.muted }} tickLine={false} axisLine={false} domain={["auto","auto"]} width={26} />
              <Tooltip content={<CT />} />
              <Area type="monotone" dataKey="hr" name="HR" stroke={C.pink} fill="url(#hrg)" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {act.best_efforts?.length > 0 && (
        <Card>
          <Label color={C.amber}>Best Efforts</Label>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:8 }}>
            {act.best_efforts.slice(0,6).map((b,i) => (
              <div key={i} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:9, padding:"9px 12px" }}>
                <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.1em", marginBottom:4 }}>{b.name}</div>
                <div style={{ fontFamily:C.mono, fontSize:14, fontWeight:700, color:C.amber }}>{fTime(b.moving_time)}</div>
                <div style={{ fontSize:9, color:C.muted, marginTop:2 }}>{fPace(b.distance/b.moving_time)}/km</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── OVERVIEW ─────────────────────────────────────────────────────────────────
function Overview({ stats, activities, whoopData, whoopOk, onConnectWhoop }) {
  const vol = weeklyVol(activities);
  const ytd = stats?.ytd_run_totals || {};
  const all = stats?.all_run_totals || {};
  const rec = whoopData?.recoveries?.records?.[0];
  const cyc = whoopData?.cycles?.records?.[0];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12, paddingBottom:20 }}>

      <Card>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:C.mono, fontSize:9, color:C.teal, letterSpacing:"0.18em", marginBottom:8 }}>FITNESS DASHBOARD</div>
            <div style={{ fontSize:22, fontWeight:800, color:C.text, letterSpacing:"-0.02em", marginBottom:4 }}>Caleb Cunningham</div>
            <div style={{ fontSize:11, color:C.sub, marginBottom:10 }}>Kingston · Berlin Block 22 Jun 2026</div>
            <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
              <Pill>Coros Pace 3</Pill>
              <Pill color={C.pink}>Whoop 5.0</Pill>
              <Pill color={C.amber}>Strava Live</Pill>
              <Pill color={C.purple}>6 Majors</Pill>
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:4 }}>YTD Distance</div>
            <div style={{ fontFamily:C.mono, fontSize:30, fontWeight:700, color:C.teal, lineHeight:1 }}>
              {ytd.distance ? (ytd.distance/1000).toFixed(1) : "442.9"}
              <span style={{ fontSize:13, color:C.muted }}>km</span>
            </div>
            <div style={{ fontSize:9, color:C.muted, marginTop:4 }}>{ytd.count||57} runs · {ytd.moving_time ? (ytd.moving_time/3600).toFixed(0) : 36}h</div>
          </div>
        </div>
      </Card>

      {/* Recovery row */}
      {whoopOk && rec ? (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:8 }}>
          <Stat label="Recovery" value={`${Math.round(rec.score?.recovery_score||0)}%`} color={recCol(rec.score?.recovery_score)} size="lg" />
          <Stat label="HRV"      value={`${Math.round(rec.score?.hrv_rmssd_milli||0)}`} sub="ms" color={C.teal} />
          <Stat label="RHR"      value={`${Math.round(rec.score?.resting_heart_rate||0)}`} sub="bpm" color={C.pink} />
          <Stat label="Strain"   value={`${cyc?.score?.strain?.toFixed(1)||"—"}`} color={C.amber} />
        </div>
      ) : !whoopOk && (
        <Card style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:3 }}>Connect Whoop</div>
            <div style={{ fontSize:11, color:C.sub }}>Unlock recovery, HRV, sleep and strain data</div>
          </div>
          <Btn onClick={onConnectWhoop} color={C.pink} sm>Connect Whoop</Btn>
        </Card>
      )}

      {/* PBs */}
      <Card>
        <Label>Personal Bests</Label>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:8 }}>
          {PBS.map(pb => (
            <div key={pb.label} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:9, padding:"11px 13px" }}>
              <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:4 }}>{pb.label}</div>
              <div style={{ fontFamily:C.mono, fontSize:18, fontWeight:700, color:C.teal }}>{pb.time}</div>
              <div style={{ fontSize:9, color:C.muted, marginTop:3 }}>{pb.pace} · {pb.date}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Season stats */}
      <Card>
        <Label color={C.amber}>Career Stats</Label>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:8 }}>
          <Stat label="All-Time Dist"  value={all.distance ? `${(all.distance/1000).toFixed(0)}km` : "1,086km"} sub={`${all.count||161} runs`} color={C.amber} />
          <Stat label="All-Time Time"  value={all.moving_time ? `${(all.moving_time/3600).toFixed(0)}h` : "97h"} sub="since Jul 2024" color={C.amber} />
          <Stat label="Marathons"      value="2" sub="both London" color={C.pink} />
          <Stat label="Raised"         value="£5k+" sub="for charity" color={C.purple} />
        </div>
      </Card>

      {/* Weekly vol chart */}
      <Card>
        <Label>Weekly Volume</Label>
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={vol}>
            <defs>
              <linearGradient id="vg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C.teal} stopOpacity={0.2} />
                <stop offset="95%" stopColor={C.teal} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="week" tick={{ fontSize:8, fill:C.muted }} tickLine={false} axisLine={false} interval={2} />
            <YAxis tick={{ fontSize:8, fill:C.muted }} tickLine={false} axisLine={false} unit="k" width={22} />
            <Tooltip content={<CT />} />
            <Area type="monotone" dataKey="km" name="km" stroke={C.teal} fill="url(#vg)" strokeWidth={1.5} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* Next race */}
      <Card glow={C.teal}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
          <div>
            <div style={{ fontSize:9, color:C.teal, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:5 }}>Next Race</div>
            <div style={{ fontSize:16, fontWeight:700, color:C.text }}>Berlin Marathon</div>
            <div style={{ fontSize:10, color:C.sub, marginTop:3 }}>28 Sep 2026 · Get Kids Going</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:9, color:C.muted, textTransform:"uppercase", letterSpacing:"0.1em" }}>Target</div>
            <div style={{ fontFamily:C.mono, fontSize:20, fontWeight:700, color:C.amber }}>Sub 3:20</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── RUNNING ─────────────────────────────────────────────────────────────────
function Running({ activities, stats }) {
  const [sel, setSel] = useState(null);
  const runs = activities.filter(a => a.type==="Run" || a.sport_type==="Run");
  const vol = weeklyVol(activities);
  const ytd = stats?.ytd_run_totals || {};

  if (sel) return <ActivityDetail id={sel} onBack={() => setSel(null)} />;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12, paddingBottom:20 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:8 }}>
        <Stat label="YTD Distance" value={ytd.distance ? `${(ytd.distance/1000).toFixed(1)}km` : "442.9km"} sub={`${ytd.count||57} runs`} />
        <Stat label="YTD Time"     value={ytd.moving_time ? `${(ytd.moving_time/3600).toFixed(1)}h` : "36.3h"} color={C.amber} />
        <Stat label="All-Time"     value={stats?.all_run_totals?.distance ? `${(stats.all_run_totals.distance/1000).toFixed(0)}km` : "1,086km"} color={C.purple} />
        <Stat label="Elevation"    value={ytd.elevation_gain ? `${ytd.elevation_gain}m` : "827m"} color={C.blue} />
      </div>

      <Card>
        <Label color={C.amber}>Personal Bests</Label>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:8 }}>
          {PBS.map(pb => (
            <div key={pb.label} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:9, padding:"10px 12px" }}>
              <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:3 }}>{pb.label}</div>
              <div style={{ fontFamily:C.mono, fontSize:17, fontWeight:700, color:C.amber }}>{pb.time}</div>
              <div style={{ fontSize:9, color:C.muted, marginTop:2 }}>{pb.pace}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <Label>Weekly Volume</Label>
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={vol}>
            <defs>
              <linearGradient id="vg2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C.teal} stopOpacity={0.2} />
                <stop offset="95%" stopColor={C.teal} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="week" tick={{ fontSize:8, fill:C.muted }} tickLine={false} axisLine={false} interval={2} />
            <YAxis tick={{ fontSize:8, fill:C.muted }} tickLine={false} axisLine={false} unit="k" width={22} />
            <Tooltip content={<CT />} />
            <Area type="monotone" dataKey="km" name="km" stroke={C.teal} fill="url(#vg2)" strokeWidth={1.5} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <Label>Recent Runs</Label>
        <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
          {runs.slice(0,25).map(r => {
            const t = actType(r);
            const col = typeCol(t);
            return (
              <button key={r.id} onClick={() => setSel(r.id)} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"11px 13px", display:"flex", alignItems:"center", gap:10, textAlign:"left", width:"100%", cursor:"pointer" }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:3, flexWrap:"wrap" }}>
                    <span style={{ fontSize:12, fontWeight:600, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:160 }}>{r.name}</span>
                    <Pill color={col}>{t}</Pill>
                  </div>
                  <div style={{ fontSize:9, color:C.sub }}>{new Date(r.start_date_local).toLocaleDateString("en-GB", { day:"numeric", month:"short" })}{r.gear?.name ? ` · ${r.gear.name}` : ""}</div>
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ fontFamily:C.mono, fontSize:13, fontWeight:700, color:C.teal }}>{fDist(r.distance)}km</div>
                  <div style={{ fontSize:9, color:C.muted, marginTop:2 }}>{fPace(r.average_speed)}/km</div>
                </div>
                <div style={{ color:C.muted, fontSize:14 }}>›</div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <Label color={C.purple}>Shoe Rotation</Label>
        <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
          {SHOES.map((s,i) => (
            <div key={i} style={{ background:C.surface, borderRadius:9, padding:"9px 12px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:11, fontWeight:600, color:C.text }}>{s.name}{s.colour ? ` — ${s.colour}` : ""}</div>
                <div style={{ fontSize:9, color:C.sub, marginTop:2 }}>{s.role}{s.carbon ? " · Carbon" : ""}</div>
              </div>
              {s.carbon && <div style={{ width:5, height:5, borderRadius:"50%", background:C.amber, flexShrink:0 }} />}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── GYM ─────────────────────────────────────────────────────────────────────
function Gym({ activities }) {
  const sessions = activities.filter(a => a.type==="WeightTraining" || a.sport_type==="WeightTraining" || (a.name||"").toLowerCase().includes("weight") || (a.name||"").toLowerCase().includes("gym"));

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12, paddingBottom:20 }}>
      <Card>
        <Label color={C.amber}>Current Lifts</Label>
        <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
          {LIFTS.map((l,i) => (
            <div key={i} style={{ background:C.surface, borderRadius:9, padding:"10px 13px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:C.text }}>{l.name}</div>
                <div style={{ fontSize:9, color:C.sub, marginTop:2 }}>{l.sets} sets × {l.reps} reps</div>
              </div>
              <div style={{ fontFamily:C.mono, fontSize:12, fontWeight:700, color:C.amber }}>{l.weight}</div>
            </div>
          ))}
        </div>
      </Card>

      {sessions.length > 0 && (
        <Card>
          <Label>Recent Sessions</Label>
          <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
            {sessions.slice(0,10).map(s => (
              <div key={s.id} style={{ background:C.surface, borderRadius:9, padding:"9px 12px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:600, color:C.text }}>{s.name}</div>
                  <div style={{ fontSize:9, color:C.sub, marginTop:2 }}>{new Date(s.start_date_local).toLocaleDateString("en-GB", { day:"numeric", month:"short" })}</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontFamily:C.mono, fontSize:11, color:C.amber }}>{fTime(s.moving_time)}</div>
                  {s.average_heartrate && <div style={{ fontSize:9, color:C.pink, marginTop:2 }}>{Math.round(s.average_heartrate)} bpm</div>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── RECOVERY ────────────────────────────────────────────────────────────────
function Recovery({ whoopData, whoopOk, onConnectWhoop }) {
  if (!whoopOk) {
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:12, paddingBottom:20 }}>
        <Card style={{ textAlign:"center", padding:"40px 20px" }}>
          <div style={{ fontSize:36, marginBottom:12 }}>⌚</div>
          <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:6 }}>Connect Whoop</div>
          <div style={{ fontSize:11, color:C.sub, marginBottom:20, lineHeight:1.7, maxWidth:260, margin:"0 auto 20px" }}>
            Get live recovery scores, HRV, sleep stages, daily strain and respiratory rate from your Whoop 5.0.
          </div>
          <Btn onClick={onConnectWhoop} color={C.pink}>Connect Whoop</Btn>
        </Card>
      </div>
    );
  }

  const recs = whoopData?.recoveries?.records || [];
  const sleeps = whoopData?.sleeps?.records || [];
  const cycles = whoopData?.cycles?.records || [];
  const latest = recs[0];
  const latestSleep = sleeps[0];

  const hrvChart = recs.slice(0,7).reverse().map(r => ({
    day: new Date(r.created_at).toLocaleDateString("en-GB", { day:"numeric", month:"short" }),
    hrv: Math.round(r.score?.hrv_rmssd_milli||0),
    rhr: Math.round(r.score?.resting_heart_rate||0),
  }));

  const recChart = recs.slice(0,7).reverse().map(r => ({
    day: new Date(r.created_at).toLocaleDateString("en-GB", { day:"numeric", month:"short" }),
    score: Math.round(r.score?.recovery_score||0),
  }));

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12, paddingBottom:20 }}>

      {latest && (
        <Card>
          <Label color={C.pink}>Today's Recovery</Label>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:8 }}>
            <Stat label="Recovery Score" value={`${Math.round(latest.score?.recovery_score||0)}%`} color={recCol(latest.score?.recovery_score)} size="lg" />
            <Stat label="HRV" value={`${Math.round(latest.score?.hrv_rmssd_milli||0)}`} sub="ms rMSSD" color={C.teal} size="lg" />
            <Stat label="Resting HR" value={`${Math.round(latest.score?.resting_heart_rate||0)}`} sub="bpm" color={C.pink} />
            <Stat label="Resp Rate" value={`${latest.score?.respiratory_rate?.toFixed(1)||"—"}`} sub="breaths/min" color={C.purple} />
          </div>
        </Card>
      )}

      {latestSleep && (
        <Card>
          <Label>Last Night's Sleep</Label>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:8 }}>
            <Stat label="Sleep Score"  value={`${Math.round(latestSleep.score?.sleep_performance_percentage||0)}%`} color={C.blue} />
            <Stat label="Time in Bed"  value={latestSleep.score?.stage_summary?.total_in_bed_time_milli ? `${(latestSleep.score.stage_summary.total_in_bed_time_milli/3600000).toFixed(1)}h` : "—"} color={C.blue} />
            <Stat label="REM"          value={latestSleep.score?.stage_summary?.total_rem_sleep_time_milli ? `${(latestSleep.score.stage_summary.total_rem_sleep_time_milli/60000).toFixed(0)}m` : "—"} color={C.purple} />
            <Stat label="Deep Sleep"   value={latestSleep.score?.stage_summary?.total_slow_wave_sleep_time_milli ? `${(latestSleep.score.stage_summary.total_slow_wave_sleep_time_milli/60000).toFixed(0)}m` : "—"} color={C.teal} />
          </div>
        </Card>
      )}

      {hrvChart.length > 0 && (
        <Card>
          <Label color={C.teal}>HRV & Resting HR — 7 Days</Label>
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={hrvChart}>
              <XAxis dataKey="day" tick={{ fontSize:8, fill:C.muted }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize:8, fill:C.muted }} tickLine={false} axisLine={false} width={24} />
              <Tooltip content={<CT />} />
              <Line type="monotone" dataKey="hrv" name="HRV" stroke={C.teal} strokeWidth={1.5} dot={{ fill:C.teal, r:2.5 }} />
              <Line type="monotone" dataKey="rhr" name="RHR" stroke={C.pink} strokeWidth={1.5} dot={{ fill:C.pink, r:2.5 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {recChart.length > 0 && (
        <Card>
          <Label color={C.pink}>Recovery Score — 7 Days</Label>
          <ResponsiveContainer width="100%" height={110}>
            <BarChart data={recChart}>
              <XAxis dataKey="day" tick={{ fontSize:8, fill:C.muted }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize:8, fill:C.muted }} tickLine={false} axisLine={false} domain={[0,100]} width={24} />
              <Tooltip content={<CT />} />
              <Bar dataKey="score" name="Recovery" fill={C.teal} radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {cycles.length > 0 && (
        <Card>
          <Label color={C.amber}>Daily Strain — 7 Days</Label>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {cycles.slice(0,7).map((c,i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:10, background:C.surface, borderRadius:7, padding:"8px 11px" }}>
                <div style={{ fontSize:9, color:C.sub, minWidth:60, letterSpacing:"0.04em" }}>{new Date(c.start).toLocaleDateString("en-GB", { day:"numeric", month:"short" })}</div>
                <div style={{ flex:1, height:3, background:C.border, borderRadius:2 }}>
                  <div style={{ width:`${Math.min((c.score?.strain||0)/21*100,100)}%`, height:"100%", background:C.amber, borderRadius:2, transition:"width .3s" }} />
                </div>
                <div style={{ fontFamily:C.mono, fontSize:12, fontWeight:700, color:C.amber, minWidth:28, textAlign:"right" }}>{c.score?.strain?.toFixed(1)||"—"}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── RACES ───────────────────────────────────────────────────────────────────
function Races() {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12, paddingBottom:20 }}>
      <Card>
        <Label color={C.purple}>World Marathon Majors Mission</Label>
        <div style={{ fontSize:12, color:C.sub, lineHeight:1.8, marginBottom:14 }}>
          Running all six World Marathon Majors for a different charity each time. Running for brother Noah who has Duchenne Muscular Dystrophy. £5,000+ raised so far.
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:8 }}>
          <Stat label="Completed" value="2 / 6"   sub="Both London"  color={C.teal} />
          <Stat label="Raised"    value="£5k+"    sub="for charity"  color={C.pink} />
          <Stat label="Next"      value="Berlin"  sub="28 Sep 2026"  color={C.amber} />
          <Stat label="Sub-3"     value="Seville" sub="Feb 2027"     color={C.purple} />
        </div>
      </Card>

      <Card>
        <Label>Race Pipeline</Label>
        <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
          {RACES.map((r,i) => (
            <div key={i} style={{ background:C.surface, border:`1px solid ${r.next ? C.teal+"40" : C.border}`, borderRadius:9, padding:"11px 13px", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8, opacity: r.done ? 0.5 : 1 }}>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color: r.done ? C.muted : r.next ? C.teal : C.text }}>{r.done ? "✓ " : ""}{r.name}</div>
                <div style={{ fontSize:9, color:C.muted, marginTop:3 }}>{r.date} · {r.charity}</div>
              </div>
              <div style={{ fontFamily:C.mono, fontSize:11, fontWeight:700, color:C.amber }}>{r.target}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <Label color={C.pink}>Sponsorship Tracker</Label>
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {SPONSORSHIP.map((s,i) => {
            const col = { success:C.teal, pending:C.amber, future:C.purple }[s.state];
            return (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:C.surface, borderRadius:7, padding:"8px 11px" }}>
                <span style={{ fontSize:11, color:C.text }}>{s.name}</span>
                <span style={{ fontSize:9, color:col, fontWeight:600 }}>{s.status}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ─── TRAINING PLAN ───────────────────────────────────────────────────────────
function TrainingPlan({ onChat }) {
  const [plan, setPlan] = useState(JSON.parse(localStorage.getItem("training_plan") || "null"));

  const savePlan = (p) => {
    setPlan(p);
    localStorage.setItem("training_plan", JSON.stringify(p));
  };

  const samplePlan = {
    title: "Berlin Marathon Block — Week 1",
    startDate: "2026-06-22",
    sessions: [
      { day:"Mon", type:"Rest", desc:"Full rest or easy walk" },
      { day:"Tue", type:"Easy", dist:"8km", pace:"5:30–6:00/km", notes:"Zone 2, conversational pace" },
      { day:"Wed", type:"Interval", dist:"10km", pace:"3:50–4:00/km reps", notes:"3km warm up · 6×800m at 5K pace · 2km cool down" },
      { day:"Thu", type:"Easy", dist:"6km", pace:"5:30–6:00/km", notes:"Recovery run, very easy" },
      { day:"Fri", type:"Tempo", dist:"12km", pace:"4:20–4:30/km", notes:"2km warm up · 8km at HM effort · 2km cool down" },
      { day:"Sat", type:"Rest", desc:"Gym only — chest and arms" },
      { day:"Sun", type:"Long Run", dist:"22km", pace:"5:15–5:30/km", notes:"Easy effort throughout, gel at 50 and 90 mins" },
    ]
  };

  const typeC = { Rest:C.muted, Easy:C.teal, Interval:C.pink, Tempo:C.amber, "Long Run":C.blue };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12, paddingBottom:20 }}>
      {!plan && (
        <Card style={{ textAlign:"center", padding:"32px 20px" }}>
          <div style={{ fontSize:36, marginBottom:12 }}>📋</div>
          <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:6 }}>No training plan yet</div>
          <div style={{ fontSize:11, color:C.sub, marginBottom:20, lineHeight:1.7, maxWidth:260, margin:"0 auto 20px" }}>
            Ask Claude in the Chat tab to build you a training plan for Berlin and it'll appear here automatically.
          </div>
          <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
            <Btn onClick={onChat} color={C.teal} sm>Open Chat</Btn>
            <Btn onClick={() => savePlan(samplePlan)} color={C.purple} sm outline>Load Sample Plan</Btn>
          </div>
        </Card>
      )}

      {plan && (
        <>
          <Card>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{plan.title}</div>
                {plan.startDate && <div style={{ fontSize:10, color:C.sub, marginTop:3 }}>Starting {new Date(plan.startDate).toLocaleDateString("en-GB", { day:"numeric", month:"long" })}</div>}
              </div>
              <Btn onClick={() => savePlan(null)} color={C.muted} sm outline>Clear</Btn>
            </div>
          </Card>

          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {plan.sessions.map((s,i) => (
              <Card key={i}>
                <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                  <div style={{ textAlign:"center", minWidth:36 }}>
                    <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.1em", textTransform:"uppercase" }}>{s.day}</div>
                    <div style={{ width:32, height:32, borderRadius:"50%", background:`${typeC[s.type]||C.teal}20`, border:`1px solid ${typeC[s.type]||C.teal}40`, display:"flex", alignItems:"center", justifyContent:"center", marginTop:4 }}>
                      <div style={{ width:8, height:8, borderRadius:"50%", background:typeC[s.type]||C.teal }} />
                    </div>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:4, flexWrap:"wrap" }}>
                      <span style={{ fontSize:12, fontWeight:700, color:C.text }}>{s.type}</span>
                      {s.dist && <Pill color={typeC[s.type]||C.teal}>{s.dist}</Pill>}
                      {s.pace && <Pill color={C.muted}>{s.pace}</Pill>}
                    </div>
                    {(s.notes||s.desc) && <div style={{ fontSize:10, color:C.sub, lineHeight:1.6 }}>{s.notes||s.desc}</div>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── CHAT ────────────────────────────────────────────────────────────────────
function Chat({ activities, stats, whoopData, whoopOk }) {
  const [messages, setMessages] = useState([{
    role:"assistant",
    content:"Hi Caleb! I can see your training data and I'm ready to help. Ask me anything about your running, recovery, training plan, race strategy — whatever you need."
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages]);

  const buildContext = () => {
    const runs = activities.filter(a => a.type==="Run").slice(0,5);
    const ytd = stats?.ytd_run_totals || {};
    const rec = whoopData?.recoveries?.records?.[0];
    const sleep = whoopData?.sleeps?.records?.[0];

    return `You are a personal running coach and fitness assistant for Caleb Cunningham, a 20-year-old university student at Kingston University London. You have access to his live data.

KEY INFO:
- PBs: 5K 18:42, 10K 40:52, HM 1:32:48, Marathon 3:48:59 (London Apr 2026)
- Berlin Marathon target: 28 Sep 2026, goal Sub 3:20
- Seville 2027 target: Sub 3:00
- World Marathon Majors mission — different charity each race
- Brother Noah has Duchenne Muscular Dystrophy — runs for charity
- YTD: ${ytd.distance ? (ytd.distance/1000).toFixed(1) : 442.9}km, ${ytd.count||57} runs
- Coros fitness test (Mar 2026): VO2 Max 67, threshold pace 3:57/km, max HR 208bpm
${rec ? `- Latest recovery score: ${Math.round(rec.score?.recovery_score||0)}%, HRV: ${Math.round(rec.score?.hrv_rmssd_milli||0)}ms, RHR: ${Math.round(rec.score?.resting_heart_rate||0)}bpm` : ""}
${sleep ? `- Last sleep score: ${Math.round(sleep.score?.sleep_performance_percentage||0)}%` : ""}

RECENT RUNS:
${runs.map(r => `- ${r.name} (${new Date(r.start_date_local).toLocaleDateString("en-GB")}): ${(r.distance/1000).toFixed(2)}km at ${fPace(r.average_speed)}/km avg${r.average_heartrate ? `, ${Math.round(r.average_heartrate)}bpm` : ""}`).join("\n")}

Be direct, specific and use Caleb's actual data in your responses. Keep responses concise but thorough. Never use double dashes. If asked to make a training plan, format it clearly with days, distances and paces.`;
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role:"user", content:input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const context = buildContext();
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          model:"claude-sonnet-4-6",
          max_tokens:1000,
          system: context,
          messages: [...messages.filter(m => m.role!=="system"), userMsg].map(m => ({ role:m.role, content:m.content })),
        })
      });

      const data = await res.json();
      const reply = data.content?.[0]?.text || "Sorry, I couldn't get a response.";
      setMessages(prev => [...prev, { role:"assistant", content:reply }]);
    } catch(e) {
      setMessages(prev => [...prev, { role:"assistant", content:"Something went wrong. Please try again." }]);
    }
    setLoading(false);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", gap:0 }}>
      {/* Messages */}
      <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:10, paddingBottom:12 }}>
        {messages.map((m,i) => (
          <div key={i} style={{ display:"flex", justifyContent: m.role==="user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth:"85%", padding:"10px 13px", borderRadius:12,
              background: m.role==="user" ? C.teal : C.card,
              color: m.role==="user" ? C.bg : C.text,
              border: m.role==="assistant" ? `1px solid ${C.border}` : "none",
              fontSize:12, lineHeight:1.7, fontWeight: m.role==="user" ? 500 : 400,
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display:"flex", justifyContent:"flex-start" }}>
            <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"10px 14px", display:"flex", gap:4 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width:5, height:5, borderRadius:"50%", background:C.muted, animation:`bounce .9s ${i*0.15}s infinite` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ display:"flex", gap:8, paddingTop:10, borderTop:`1px solid ${C.border}` }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key==="Enter" && !e.shiftKey && send()}
          placeholder="Ask me anything about your training..."
          style={{
            flex:1, background:C.card, border:`1px solid ${C.border}`, borderRadius:10,
            padding:"10px 13px", color:C.text, fontSize:12, outline:"none",
            fontFamily:"Inter",
          }}
        />
        <button onClick={send} disabled={loading || !input.trim()} style={{
          background:C.teal, color:C.bg, border:"none", borderRadius:10,
          padding:"10px 16px", fontSize:13, fontWeight:700, cursor:"pointer",
          opacity: loading || !input.trim() ? 0.4 : 1,
        }}>→</button>
      </div>
      <style>{`@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}`}</style>
    </div>
  );
}

// ─── NAV ─────────────────────────────────────────────────────────────────────
const NAV = [
  { id:"overview",  label:"Overview",   icon:"⚡" },
  { id:"running",   label:"Running",    icon:"🏃" },
  { id:"gym",       label:"Gym",        icon:"💪" },
  { id:"recovery",  label:"Recovery",   icon:"💤" },
  { id:"plan",      label:"Plan",       icon:"📋" },
  { id:"races",     label:"Races",      icon:"🏅" },
  { id:"chat",      label:"Chat",       icon:"💬" },
];

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("overview");
  const [connected, setConnected] = useState(isConnected());
  const [whoopOk, setWhoopOk] = useState(isWhoopConnected());
  const [activities, setActivities] = useState([]);
  const [stats, setStats] = useState(null);
  const [athlete, setAthlete] = useState(null);
  const [whoopData, setWhoopData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [whoopPending, setWhoopPending] = useState(false);

  // Handle OAuth callbacks
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const pending = localStorage.getItem("whoop_pending");

    if (!code) return;

    if (pending) {
      setWhoopPending(true);
      exchangeWhoopCode(code)
        .then(() => { setWhoopOk(true); setWhoopPending(false); })
        .catch(e => { console.error("Whoop exchange failed:", e); setWhoopPending(false); })
        .finally(() => window.history.replaceState({}, "", "/"));
    } else if (!isConnected()) {
      exchangeCode(code)
        .then(() => setConnected(true))
        .catch(console.error)
        .finally(() => window.history.replaceState({}, "", "/"));
    }
  }, []);

  // Load Strava data
  useEffect(() => {
    if (!connected) return;
    setLoading(true);
    Promise.all([getAthlete(), getActivities(50)])
      .then(([a, acts]) => { setAthlete(a); setActivities(acts); return getStats(a.id); })
      .then(s => setStats(s))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [connected]);

  // Load Whoop data
  useEffect(() => {
    if (!whoopOk) return;
    getWhoopData().then(setWhoopData).catch(console.error);
  }, [whoopOk]);

  const handleConnectWhoop = () => {
    const url = getWhoopAuthUrl();
    window.location.assign(url);
  };

  if (!connected || whoopPending) return <ConnectScreen whoopPending={whoopPending} />;

  const sharedProps = { activities, stats, whoopData, whoopOk, onConnectWhoop:handleConnectWhoop };

  const views = {
    overview: <Overview {...sharedProps} />,
    running:  <Running activities={activities} stats={stats} />,
    gym:      <Gym activities={activities} />,
    recovery: <Recovery whoopData={whoopData} whoopOk={whoopOk} onConnectWhoop={handleConnectWhoop} />,
    plan:     <TrainingPlan onChat={() => setPage("chat")} />,
    races:    <Races />,
    chat:     <Chat activities={activities} stats={stats} whoopData={whoopData} whoopOk={whoopOk} />,
  };

  const NavItem = ({ n }) => (
    <button onClick={() => { setPage(n.id); setMobileMenu(false); }} style={{
      display:"flex", alignItems:"center", gap:9, width:"100%", padding:"9px 12px",
      background: page===n.id ? `${C.teal}12` : "transparent",
      border: `1px solid ${page===n.id ? C.teal+"25" : "transparent"}`,
      borderRadius:8, color: page===n.id ? C.teal : C.muted,
      fontSize:12, fontWeight: page===n.id ? 600 : 400, marginBottom:2,
    }}>
      <span style={{ fontSize:14 }}>{n.icon}</span>
      <span>{n.label}</span>
    </button>
  );

  const SidebarInner = () => (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      <div style={{ padding:"18px 16px 14px", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ fontFamily:C.mono, fontSize:9, color:C.teal, letterSpacing:"0.18em", marginBottom:6 }}>FITNESS DASHBOARD</div>
        <div style={{ fontSize:13, fontWeight:700, color:C.text }}>Caleb Cunningham</div>
        {athlete && <div style={{ fontSize:9, color:C.muted, marginTop:2 }}>{athlete.city || "Kingston"}</div>}
      </div>
      <nav style={{ padding:"10px 8px", flex:1, overflowY:"auto" }}>
        {NAV.map(n => <NavItem key={n.id} n={n} />)}
      </nav>
      <div style={{ padding:"12px 16px", borderTop:`1px solid ${C.border}` }}>
        {!whoopOk && (
          <button onClick={handleConnectWhoop} style={{ width:"100%", background:C.pink, color:C.bg, border:"none", borderRadius:8, padding:"8px", fontSize:11, fontWeight:700, cursor:"pointer", marginBottom:8 }}>
            + Connect Whoop
          </button>
        )}
        {whoopOk && <div style={{ fontSize:9, color:C.teal, marginBottom:6, letterSpacing:"0.08em" }}>✓ WHOOP CONNECTED</div>}
        <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.06em" }}>Strava · Coros · Whoop</div>
        <div style={{ fontSize:9, color:`${C.pink}80`, marginTop:2 }}>Running for Noah 🧡</div>
        <div style={{ display:"flex", gap:6, marginTop:10 }}>
          <button onClick={() => { disconnect(); setConnected(false); setActivities([]); }} style={{ fontSize:8, color:C.muted, background:"transparent", border:`1px solid ${C.border}`, borderRadius:4, padding:"3px 7px", cursor:"pointer", letterSpacing:"0.06em" }}>
            STRAVA
          </button>
          {whoopOk && (
            <button onClick={() => { disconnectWhoop(); setWhoopOk(false); setWhoopData(null); }} style={{ fontSize:8, color:C.muted, background:"transparent", border:`1px solid ${C.border}`, borderRadius:4, padding:"3px 7px", cursor:"pointer", letterSpacing:"0.06em" }}>
              WHOOP
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display:"flex", height:"100vh", background:C.bg, color:C.text, fontFamily:"Inter,sans-serif", overflow:"hidden" }}>

      {/* Desktop sidebar */}
      <div style={{ width:185, background:C.surface, borderRight:`1px solid ${C.border}`, flexShrink:0, height:"100vh", overflowY:"auto" }}>
        <SidebarInner />
      </div>

      {/* Mobile header */}
      <div style={{ display:"none", position:"fixed", top:0, left:0, right:0, zIndex:50, background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"11px 16px", alignItems:"center", justifyContent:"space-between" }} className="mob-header">
        <div style={{ fontFamily:C.mono, fontSize:9, color:C.teal, letterSpacing:"0.18em" }}>FITNESS DASHBOARD</div>
        <button onClick={() => setMobileMenu(!mobileMenu)} style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.sub, borderRadius:7, padding:"5px 9px", fontSize:15 }}>☰</button>
      </div>

      {/* Mobile menu overlay */}
      {mobileMenu && (
        <div style={{ position:"fixed", inset:0, zIndex:100, display:"flex" }}>
          <div style={{ width:200, background:C.surface, borderRight:`1px solid ${C.border}`, height:"100%", overflowY:"auto" }}>
            <div style={{ padding:"14px 16px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontFamily:C.mono, fontSize:9, color:C.teal, letterSpacing:"0.15em" }}>MENU</div>
              <button onClick={() => setMobileMenu(false)} style={{ background:"transparent", border:"none", color:C.muted, fontSize:16, cursor:"pointer" }}>✕</button>
            </div>
            <nav style={{ padding:"8px" }}>
              {NAV.map(n => <NavItem key={n.id} n={n} />)}
            </nav>
          </div>
          <div onClick={() => setMobileMenu(false)} style={{ flex:1, background:"rgba(0,0,0,0.6)" }} />
        </div>
      )}

      {/* Main content */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", height:"100vh", overflow:"hidden" }} className="main-wrap">
        <div style={{ flex:1, overflowY: page==="chat" ? "hidden" : "auto", padding:"18px 16px", display:"flex", flexDirection:"column" }}>
          <style>{`
            @media (max-width:640px) {
              .mob-header { display: flex !important; }
              .main-wrap > div { padding-top: 56px !important; }
            }
          `}</style>
          {loading ? <Loader text="Loading your data..." /> : views[page]}
        </div>
      </div>
    </div>
  );
}
