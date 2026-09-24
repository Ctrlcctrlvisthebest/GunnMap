import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import sharp from 'sharp';
import { createApp, renderPeriods, resolveRoom } from './web_app.js';
import { evacuationForRoom } from './evacuation.js';
import { rooms, roomData, ROOT } from './project.js';
import { renderRooms } from './map_highlighter.js';
const periods=(building:string,room:string,color='#0284c7')=>[{building,room,color},...Array.from({length:6},()=>({building:'',room:'',color:'#000000'}))];
test('N214 variants retain identity and football-field destination',()=>{
 for(const value of ['N214','n214','n-214',' N214 ']) {
  const room=resolveRoom('N',value); assert.equal(room.id,'R148');
  assert.equal(evacuationForRoom(room).destination,'Football field — section labeled N201-N217');
 }
});
test('source range boundaries and unresolved rooms remain explicit',()=>{
 const cases:[string,string|null][]=[['H1','red'],['H5','red'],['H6',null],['F3',null],['M5','blue'],['M6',null],['K13','green'],['K14',null],['N101','black'],['N117','black'],['N118',null],['N200',null],['N201','black'],['N217','black'],['N218',null],['N223',null],['E01',null],['E1','green'],['P105','blue'],['P106',null],['S121','blue'],['S122',null]];
 for(const [label,group] of cases) assert.equal(evacuationForRoom({label,building:label.match(/^[A-Z]+/)![0]}).group,group,label);
 assert.equal(evacuationForRoom({label:'N214',building:'M'}).status,'unconfirmed');
 assert.equal(evacuationForRoom({label:'D-LIB',building:'D'}).group,'green');
 for(const room of rooms){const f=evacuationForRoom(room).focus;if(f){assert.ok(f.x>=0&&f.y>=0&&f.width>0&&f.height>0);assert.ok(f.x+f.width<=1&&f.y+f.height<=1);}}
});
test('duplicate K6 rooms require unique IDs',()=>{
 assert.throws(()=>resolveRoom('K','K6'),/twice/);
 const matches=rooms.filter(r=>r.label==='K6');assert.equal(matches.length,2);
 for(const room of matches) {assert.equal(resolveRoom('K',`K6 (${room.id})`).id,room.id);assert.equal(evacuationForRoom(room).reference_label,'K6-K13');}
 assert.throws(()=>resolveRoom('M','R148'),/not in/);
});
test('shared rooms render every period color in clipped horizontal and vertical strips',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'gunnmap-colors-'));
 try {
  const [width,height]=roomData.image_size, baseImage=join(dir,'blank.png');
  await sharp({create:{width,height,channels:3,background:'#ffffff'}}).png().toFile(baseImage);
  const image=await renderRooms({A134:['#ff0000','#00ff00','#0000ff'],J1:['#ff0000','#00ff00','#0000ff']},{opacity:1,baseImage});
  const {data,info}=await sharp(image).raw().toBuffer({resolveWithObject:true});
  const pixel=(x:number,y:number)=>Array.from(data.subarray((y*info.width+x)*info.channels,(y*info.width+x)*info.channels+3));
  assert.deepEqual(pixel(691,920),[255,0,0]);
  assert.deepEqual(pixel(716,920),[0,255,0]);
  assert.deepEqual(pixel(741,920),[0,0,255]);
  assert.deepEqual(pixel(440,331),[255,0,0]);
  assert.deepEqual(pixel(440,348),[0,255,0]);
  assert.deepEqual(pixel(440,365),[0,0,255]);
  assert.deepEqual(pixel(756,930),[255,255,255]);
  assert.deepEqual(pixel(440,379),[255,255,255]);
  await assert.rejects(renderRooms({A134:[]}),/at least one color/);
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('downloaded PNG includes all seven legend swatches without changing map coordinates',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'gunnmap-legend-'));
 try {
  const palette=['#ff0000','#00ff00','#0000ff','#ffaa00','#00aaff','#ff00ff','#112233'];
  const result=await renderPeriods(palette.map(color=>({building:'N',room:'n214',color})),dir);
  const {data,info}=await sharp(await readFile(join(dir,result.image_url.split('/').pop()!))).raw().toBuffer({resolveWithObject:true});
  assert.deepEqual([info.width,info.height],roomData.image_size);
  assert.equal(result.selected.length,7);assert.equal(result.warnings.length,1);
  assert.match(result.warnings[0],/Periods 1, 2, 3, 4, 5, 6, 7.*split/);
  const pixel=(x:number,y:number)=>Array.from(data.subarray((y*info.width+x)*info.channels,(y*info.width+x)*info.channels+3));
  for(let i=0;i<7;i++) {
   assert.deepEqual(pixel(455,1313+i*34),palette[i].slice(1).match(/../g)!.map(hex=>parseInt(hex,16)));
   assert.deepEqual(result.selected[i].marker,[1663.5,574.5]);
   assert.deepEqual(result.selected[i].polygon,resolveRoom('N','N214').polygon);
   assert.equal(result.selected[i].evacuation.group,'black');
   assert.equal(result.selected[i].floor,2);
  }
  // Check rasterized title and row text, not just the color swatches.
  for(const [left,top,width,height] of [[444,1256,250,34],[478,1298,330,30]]) {
   let dark=0;
   for(let y=top;y<top+height;y++) for(let x=left;x<left+width;x++) if(pixel(x,y).every(value=>value<160)) dark++;
   assert.ok(dark>100,'legend text should be readable in the PNG');
  }
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('HTTP rendering, pixels, isolated images, validation and static routes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'gunnmap-ts-')),server=createApp(dir);
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const address=server.address();assert.ok(address&&typeof address==='object');const base=`http://127.0.0.1:${address.port}`;
 const post=(body:unknown)=>fetch(base+'/api/render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try {
  const inventory=await (await fetch(base+'/api/rooms')).json();assert.equal(inventory.rooms.length,rooms.length);
  const response=await post({periods:periods('n','n214')});assert.equal(response.status,200);const first=await response.json();
  assert.equal(first.selected[0].evacuation.group,'black');assert.deepEqual(first.selected[0].marker,[1663.5,574.5]);
  const bytes=Buffer.from(await (await fetch(base+first.image_url)).arrayBuffer());
  const metadata=await sharp(bytes).metadata();assert.deepEqual([metadata.width,metadata.height],roomData.image_size);
  const before=await sharp(join(ROOT,roomData.base_image)).removeAlpha().raw().toBuffer();const after=await sharp(bytes).removeAlpha().raw().toBuffer();
  assert.deepEqual(after.subarray(0,300),before.subarray(0,300));assert.notDeepEqual(after,before);
  const second=await renderPeriods(periods('M','M3'),dir);assert.notEqual(first.image_url,second.image_url);
  assert.deepEqual(Buffer.from(await (await fetch(base+first.image_url)).arrayBuffer()),bytes);
  assert.deepEqual(await readFile(join(dir,'period_map.png')),await readFile(join(dir,second.image_url.split('/').pop()!)));
  const dup=periods('N','N214','#0000ff');dup[1]={building:'N',room:'N214',color:'#ff0000'};const result=await renderPeriods(dup,dir);assert.equal(result.warnings.length,1);
  assert.match(result.warnings[0],/split into each period's color/);
  const shared=await sharp(await readFile(join(dir,result.image_url.split('/').pop()!))).removeAlpha().raw().toBuffer();
  const left=(588*roomData.image_size[0]+1649)*3,right=(588*roomData.image_size[0]+1678)*3;
  assert.ok(shared[left+2]>shared[left]+100,'first period remains blue');
  assert.ok(shared[right]>shared[right+2]+100,'second period remains red');
  for(const body of [null,[],{}, {periods:[]},{periods:[null,...Array(6).fill({})]}, {periods:periods('N','N214','red')}, {periods:periods('M','N214')}]) assert.equal((await post(body)).status,400);
  assert.equal((await fetch(base+'/api/render',{method:'POST',body:'{'})).status,400);
  assert.equal((await fetch(base+'/api/render',{method:'POST',body:'x'.repeat(16001)})).status,400);
  for(const path of ['/','/app.js','/style.css','/evacuation','/evacuation.js','/evacuation-map.png','/map.png']) assert.equal((await fetch(base+path)).status,200,path);
  for(const path of ['/output/../room_regions.json','/output/period_map_bad.png','/output/period_map_'+ 'a'.repeat(32)+'.png']) assert.equal((await fetch(base+path)).status,404,path);
 } finally {await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await rm(dir,{recursive:true,force:true});}
});
