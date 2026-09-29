import { parseArgs } from 'node:util';
import { createRoomIndexImage, highlightBuildings, highlightRooms } from './map_highlighter.js';
const {values,positionals}=parseArgs({allowPositionals:true,options:{rooms:{type:'boolean'},index:{type:'boolean'},opacity:{type:'string',default:'0.35'}}});
const [output,...entries]=positionals;
if(!output) throw new Error('Usage: npm run highlight -- --rooms output/result.png A134=#ff595e');
if(values.index) console.log(await createRoomIndexImage(output));
else {
  const colors:Record<string,string>={};
  for(const entry of entries){const i=entry.indexOf('=');if(i<1) throw new Error('Each selection must use Name=Color');colors[entry.slice(0,i)]=entry.slice(i+1);}
  if(!entries.length) throw new Error('Select at least one room or building');
  console.log(await (values.rooms?highlightRooms:highlightBuildings)(colors,output,{opacity:Number(values.opacity)}));
}
