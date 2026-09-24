import sharp from 'sharp';
import { renderRooms, saveImage, svg } from './map_highlighter.js';
import { roomData } from './project.js';
const colors={N110:'#f97316',N205:'#2563eb',N211:'#dc2626',N215:'#16a34a'};
const image=await renderRooms(colors,{opacity:0.55}),[w,h]=roomData.image_size;
const crop=await sharp(image).extract({left:1180,top:205,width:565,height:445}).resize(1130,890).png().toBuffer();
const labels=Object.entries(colors).map(([room,color],i)=>`<rect x="1275" y="${h+220+i*125}" width="55" height="55" fill="${color}"/><text x="1360" y="${h+260+i*125}">${room} · Floor ${room==='N110'?1:2}</text>`).join('');
console.log(await saveImage(sharp(image).extend({bottom:1080,background:'#f5f7fb'}).composite([
 {input:crop,left:60,top:h+130},
 {input:svg(w,h+1080,`<g font-family="sans-serif" font-size="32" fill="#182334"><text x="60" y="${h+65}">N Building · room highlight validation</text>${labels}</g>`)}
]),process.argv[2]??'output/n_second_floor_validation.png'));
