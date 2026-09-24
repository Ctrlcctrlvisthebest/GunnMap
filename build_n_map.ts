import sharp from 'sharp';
import { resolve } from 'node:path';
import { ROOT } from './project.js';
import { saveImage, svg } from './map_highlighter.js';
// Preserve the registered second-floor linework from the supplied reference crop.
const folder=resolve(ROOT,'src/map');
const {data,info}=await sharp(resolve(folder,'n_second_floor_reference.png')).greyscale().raw().toBuffer({resolveWithObject:true});
const rgba=Buffer.alloc(info.width*info.height*4);
for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) {
  if(x>=190 && x<=420 && y>=23) rgba[(y*info.width+x)*4+3]=Math.max(0,Math.min(255,Math.round((190-data[y*info.width+x])*255/160)));
}
const ink=await sharp(rgba,{raw:{width:info.width,height:info.height,channels:4}}).resize(Math.round(info.width*1.22645),Math.round(info.height*1.22670)).png().toBuffer();
const source=resolve(folder,'gunn_site_map_page1.png');
const {width,height}=await sharp(source).metadata();
console.log(await saveImage(sharp(source).composite([
  {input:ink,left:Math.round(1500*1.22645-622.744),top:Math.round(420*1.22670-320.161)},
  {input:svg(width!,height!,'<path d="M1387 285 L1531 232" fill="none" stroke="black" stroke-width="2" stroke-dasharray="8 8"/><rect x="1514" y="391" width="67" height="22" fill="white" stroke="black" stroke-width="1"/><text x="1547.5" y="407" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="bold" fill="black">N-BLDG</text>')}
]).removeAlpha(),process.argv[2]??resolve(folder,'gunn_site_map.png')));
