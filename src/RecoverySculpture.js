// Recovery drawn as your lap round the bend of a track: the runner stops at your score.
import {Bend,readyFor} from './ApexTrack';

export const bandOf=score=>{const r=readyFor(score);return {label:r.label,tone:score==null?'none':r.key};};

export default function RecoverySculpture({score=null}){return <div className="poster bend-tile"><Bend progress={score??0} score={score}/></div>;}
