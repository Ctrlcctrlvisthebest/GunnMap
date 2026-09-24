import { readJson } from './project.js';
type Group = 'red' | 'blue' | 'green' | 'black';
type Pixels = [number, number, number, number];
type Assignment = [Group, string, Pixels];
export interface Evacuation {
  status: 'mapped' | 'unconfirmed'; group: Group | null; color: string | null;
  destination: string; reference_label: string | null; note: string;
  focus: {x:number; y:number; width:number; height:number} | null;
}
const data = readJson<{ranges: [string,number,number,Group,string,Pixels][]; exact: Record<string,Assignment>; whole: Record<string,Assignment>}>('evacuation_data.json');
const colors = {red:'#f53622',blue:'#304ffe',green:'#527d32',black:'#202529'};
const destinations = {red:'Red assembly area marked beside PREP',blue:'Blue assembly area marked beside Spangenberg Theater and the bike racks',green:'Green assembly area shown below Bow Gym / Titan Gym',black:'Football field'};
function mapped([group,reference_label,[left,top,right,bottom]]: Assignment): Evacuation {
  return {status:'mapped',group,color:colors[group],reference_label,
    destination:destinations[group]+(group==='black' ? ` — section labeled ${reference_label}` : ''),
    note:'Check the full reference map for the marked path to this assembly group.',
    focus:{x:left/1852,y:top/1156,width:(right-left)/1852,height:(bottom-top)/1156}};
}
/** Only assign rooms explicitly supported by the supplied reference. */
export function evacuationForRoom(room: {label?:string; building?:string}): Evacuation {
  const canonical = (room.label ?? '').trim().toUpperCase().replace(/[\s-]+/g,'');
  const building = (room.building ?? '').trim().toUpperCase();
  const numbered = canonical.match(/^([A-Z]+)([1-9][0-9]*)$/);
  const matches = numbered?.[1] === building;
  const special = (building === 'D' && canonical === 'DLIB') || (building === 'BG' && canonical === 'BOWGYM') || (building === 'TG' && canonical === 'TITANGYM');
  if (data.whole[building] && (matches || special)) return mapped(data.whole[building]);
  if (matches && numbered) {
    if (data.exact[canonical]) return mapped(data.exact[canonical]);
    const range = data.ranges.find(([prefix,start,end]) => prefix === building && +numbered[2] >= start && +numbered[2] <= end);
    if (range) return mapped([range[3],range[4],range[5]]);
  }
  return {status:'unconfirmed',group:null,color:null,reference_label:null,focus:null,
    destination:'Assembly area not confirmed for this room',
    note:canonical==='E01' ? 'The supplied map labels E1-E2, while this classroom is labeled E01. Their correspondence is unconfirmed; confirm the location with school staff.' : 'The supplied evacuation map does not clearly identify an assembly area for this room. Confirm the location with school staff.'};
}
