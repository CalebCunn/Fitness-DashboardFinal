// Recovery drawn as a sky over a ridge: the colour of the morning is the reading.
import {SkyTile,skyFor} from './ApexRidge';

export const bandOf=score=>{const s=skyFor(score);return {label:s.label,tone:score==null?'none':score>=67?'high':score>=34?'mid':'low'};};

export default function RecoverySculpture({score=null}){return <SkyTile score={score}/>;}
