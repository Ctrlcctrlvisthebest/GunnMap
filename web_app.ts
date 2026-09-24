import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { ROOT, rooms, buildings, roomData, resolveRoom } from './project.js';
import { evacuationForRoom } from './evacuation.js';
import { renderRooms, svg, xml } from './map_highlighter.js';
export { resolveRoom } from './project.js';
class InputError extends Error {}
interface LegendItem { period: number; label: string; floor: number; color: string }
async function addScheduleLegend(image: Buffer, selected: LegendItem[]): Promise<Buffer> {
  if (!selected.length) return image;
  const { width, height } = await sharp(image).metadata();
  if (!width || !height) throw new Error('Map dimensions are missing');
  // Keep the original canvas size so room polygons and clickable markers stay aligned.
  const padding = 24, headerHeight = 42, rowHeight = 34, legendWidth = 420;
  const legendHeight = padding * 2 + headerHeight + rowHeight * selected.length;
  const left = Math.max(padding, Math.min(420, width - legendWidth - padding));
  const top = height - legendHeight - padding;
  const rows = selected.map((item, index) => {
    const y = top + padding + headerHeight + index * rowHeight;
    const label = `Period ${item.period} · ${item.label}${item.floor === 2 ? ' (2F)' : ''}`;
    return `<rect x="${left + padding}" y="${y + 4}" width="22" height="22" fill="${xml(item.color)}"/><text x="${left + padding + 34}" y="${y + 22}" font-size="22" fill="#344054">${xml(label)}</text>`;
  }).join('');
  const body = `<g font-family="sans-serif"><rect x="${left}" y="${top}" width="${legendWidth}" height="${legendHeight}" fill="white" stroke="#d0d5dd" stroke-width="2"/><text x="${left + padding}" y="${top + padding + 26}" font-size="26" fill="#182334">Schedule Legend</text>${rows}</g>`;
  return sharp(image).composite([{ input: svg(width, height, body) }]).removeAlpha().png().toBuffer();
}
export async function renderPeriods(periods: unknown, outputDir = resolve(ROOT,'output')) {
  if (!Array.isArray(periods) || periods.length !== 7) throw new InputError('Please submit all seven period slots');
  const colors: Record<string,string[]> = {};
  const selected = [], warnings: string[] = [];
  for (const [i,p] of periods.entries()) {
    const index=i+1;
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new InputError(`Period ${index} has invalid data`);
    const building=String(p.building??'').trim().toUpperCase(), roomName=String(p.room??'').trim(), color=String(p.color??'').trim();
    if (!building && !roomName) continue;
    if (!building || !roomName) throw new InputError(`Period ${index}: choose a building and enter a room`);
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new InputError(`Period ${index}: invalid color`);
    let room;
    try {room=resolveRoom(building,roomName);} catch(error) {throw new InputError(`Period ${index}: ${(error as Error).message}`);}
    (colors[room.id] ??= []).push(color);
    selected.push({period:index,id:room.id,label:room.label,building,floor:room.floor??1,color,polygon:room.polygon,
      evacuation:evacuationForRoom(room),marker:[(room.label_box[0]+room.label_box[2])/2,(room.label_box[1]+room.label_box[3])/2]});
  }
  for (const id of Object.keys(colors)) {
    const shared = selected.filter(item => item.id === id);
    if (shared.length > 1) warnings.push(`Periods ${shared.map(item => item.period).join(', ')} share ${shared[0].label}; its map highlight is split into each period's color.`);
  }
  const bytes=await addScheduleLegend(await renderRooms(colors,{opacity:0.55}),selected);
  await mkdir(outputDir,{recursive:true});
  const id=randomUUID().replaceAll('-',''), filename=`period_map_${id}.png`, latest=resolve(outputDir,`.latest_map_${id}.png`);
  await writeFile(resolve(outputDir,filename),bytes,{flag:'wx'});
  try {await writeFile(latest,bytes); await rename(latest,resolve(outputDir,'period_map.png'));}
  finally {await rm(latest,{force:true});}
  return {image_url:`/output/${filename}`,selected,warnings,map_size:roomData.image_size};
}
function send(res:ServerResponse,status:number,body:string|Buffer,type='application/json; charset=utf-8') {
  res.writeHead(status,{'Content-Type':type,'Content-Length':Buffer.byteLength(body),'Cache-Control':'no-store'});res.end(body);
}
async function payload(req:IncomingMessage):Promise<unknown> {
  const chunks:Buffer[]=[]; let size=0;
  for await (const chunk of req) {
    size+=chunk.length;
    if (size>16000) throw new InputError('Request is empty or too large');
    chunks.push(chunk);
  }
  if (!size) throw new InputError('Request is empty or too large');
  try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch {throw new InputError('Invalid JSON request');}
}
export function createApp(outputDir=resolve(ROOT,'output')) {
  return createServer(async(req,res)=>{
    try {
      const pathname=new URL(req.url??'/', 'http://localhost').pathname;
      if(req.method==='POST' && pathname==='/api/render') {
        const body=await payload(req);
        if(!body || typeof body!=='object' || Array.isArray(body)) throw new InputError('Invalid request object');
        return send(res,200,JSON.stringify(await renderPeriods((body as {periods?:unknown}).periods,outputDir)));
      }
      if(req.method!=='GET') return send(res,req.method==='POST'?404:405,JSON.stringify({error:'Not found'}));
      if(pathname==='/api/rooms') return send(res,200,JSON.stringify({buildings,rooms:rooms.map(({id,label,building,floor,aliases})=>({id,label,building,floor:floor??1,aliases:aliases??[]}))}));
      if(pathname==='/favicon.ico') {res.writeHead(204);res.end();return;}
      const files:Record<string,[string,string]>={
        '/':['web/index.html','text/html; charset=utf-8'], '/evacuation':['web/evacuation.html','text/html; charset=utf-8'],
        '/evacuation/':['web/evacuation.html','text/html; charset=utf-8'], '/app.js':['web/app.js','text/javascript; charset=utf-8'],
        '/evacuation.js':['web/evacuation.js','text/javascript; charset=utf-8'], '/style.css':['web/style.css','text/css; charset=utf-8'],
        '/map.png':['src/map/gunn_site_map.png','image/png'], '/evacuation-map.png':['src/map/gunn_evacuation_map.png','image/png']};
      let file=files[pathname];
      if(/^\/output\/period_map(?:_[0-9a-f]{32})?\.png$/.test(pathname)) file=[resolve(outputDir,pathname.split('/').pop()!),'image/png'];
      if(!file) return send(res,404,JSON.stringify({error:'Not found'}));
      try {send(res,200,await readFile(resolve(ROOT,file[0])),file[1]);}
      catch(error) {if((error as NodeJS.ErrnoException).code==='ENOENT') send(res,404,JSON.stringify({error:'Not found'}));else throw error;}
    } catch(error) {
      if(!res.headersSent) send(res,error instanceof InputError?400:500,JSON.stringify({error:error instanceof InputError?error.message:'Unable to generate map'}));
      else res.end();
      if(!(error instanceof InputError)) console.error(error);
    }
  });
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const portIndex=process.argv.indexOf('--port');
  const port=Number(portIndex>=0?process.argv[portIndex+1]:process.env.PORT??8000);
  if(!Number.isInteger(port)||port<0||port>65535) throw new Error('Invalid port');
  const host=process.env.HOST??'127.0.0.1';
  createApp().listen(port,host,()=>console.log(`Open http://${host}:${port}/`));
}
