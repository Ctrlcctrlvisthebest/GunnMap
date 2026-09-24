import sharp from 'sharp';
import { parseArgs } from 'node:util';
import { roomData, rooms } from './project.js';
import { renderRooms, saveImage, svg, xml } from './map_highlighter.js';
const {values,positionals}=parseArgs({allowPositionals:true,options:{'bow-gym-room':{type:'string'}}});
const gym=values['bow-gym-room']?.toUpperCase();
if(gym && !['BG111','BG138','BG117'].includes(gym)) throw new Error('Choose BG111, BG138, or BG117');
const periods=[
  ['F4','Int Engr Des PLTW · Grim','#e3265d'],['M3','3D Art · Buck','#7c3aed'],
  ['J3','Biology · Wynn','#0284c7'],['K1','Ethnic Studies 9 · Tuomy','#059669'],
  ['N110','English 9 · Cadenas','#f97316'],['N211','Alg2/Trig H · Richards','#b88700'],
  [gym??'', 'PE 9 · Anderson','#dc2626']
];
const colors=Object.fromEntries(periods.filter(p=>p[0]).map(([room,,color])=>[room,color]));
const [w,h]=roomData.image_size;
let body=`<rect y="${h}" width="${w}" height="360" fill="#f7f9fc"/><text x="35" y="${h+50}" font-size="34">Back to School Night · 7-stop route preview</text><text x="35" y="${h+85}" font-size="20">N211 is on floor 2. The seventh stop needs a specific Bow Gym room.</text>`;
periods.forEach(([label,course,color],i)=>{
 const room=rooms.find(r=>r.label===label);
 if(room){const [l,t,r,b]=room.label_box,x=(l+r)/2,y=(t+b)/2;body+=`<circle cx="${x}" cy="${y}" r="17" fill="${color}" stroke="white" stroke-width="3"/><text x="${x}" y="${y+7}" text-anchor="middle" fill="white" font-size="20">${i+1}</text>`;}
 const x=35+(i%4)*598,y=h+107+Math.floor(i/4)*116;
 body+=`<rect x="${x}" y="${y}" width="572" height="103" rx="12" fill="white" stroke="${color}" stroke-width="3"/><text x="${x+16}" y="${y+32}" font-size="25">${i+1}. ${label||'Bow Gym · room not selected'}</text><text x="${x+16}" y="${y+70}" font-size="20">${xml(course)}</text>`;
});
console.log(await saveImage(sharp(await renderRooms(colors,{opacity:0.5})).extend({bottom:360,background:'#f7f9fc'}).composite([{input:svg(w,h+360,`<g font-family="sans-serif" fill="#172334">${body}</g>`)}]),positionals[0]??'output/schedule_preview.png'));
