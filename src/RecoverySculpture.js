// Recovery drawn as a lap of a violet tartan track: the runner stops at your score.
import {Lap,readyFor} from './ApexTrack';

export const bandOf=score=>{const r=readyFor(score);return {label:r.label,tone:score==null?'none':r.key};};

export default function RecoverySculpture({score=null}){return <Lap score={score} size="tile"/>;}
