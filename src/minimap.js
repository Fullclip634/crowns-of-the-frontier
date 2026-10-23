import {WORLD} from './data.js';
import {MAP_HALF,cameraMapBox} from './map-geometry.js';
import {campaignObjective} from './campaigns.js';
import {terrainBiome} from './terrain-biomes.js';

export function drawMinimap(canvas,sim,view,settings){
  const ctx=canvas.getContext('2d'),size=canvas.width,worldSize=sim.worldSize||WORLD,half=worldSize/2,scale=size/worldSize,coord=value=>(value+half)*scale;
  ctx.clearRect(0,0,size,size);ctx.fillStyle=terrainBiome(sim.options.map).map;ctx.fillRect(0,0,size,size);
  // Water must be drawn before ships and resources, using the same channels as the 3D map.
  for(const channel of view.landscape.channels()){
    ctx.strokeStyle='#72a3a5';ctx.lineWidth=channel.width*2*scale;ctx.lineCap='butt';ctx.beginPath();
    for(let z=-half;z<=half;z+=2){const x=coord(channel.center+Math.sin(z*channel.frequency)*channel.bend),y=coord(z);if(z===-half)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();
    if(sim.options.map!=='coast'){ctx.fillStyle='#ac9b75';ctx.fillRect(coord(channel.center-channel.width-3),coord(-7.75),(channel.width+3)*2*scale,15.5*scale);}
  }
  for(const e of sim.entities){
    if(e.hp<=0||e.embarked||!(e.owner===0||e.kind==='shrine'||sim.isVisible(e.x,e.z)||e.kind==='resource'&&sim.isExplored(e.x,e.z)))continue;
    ctx.fillStyle=e.kind==='resource'?{wood:'#315b42',gold:'#e1bf69',stone:'#bac0b4',food:e.water?'#c5dee2':'#ab7560'}[e.type]:e.kind==='shrine'?(e.owner===0?'#91dbc9':e.owner===1?'#df8582':'#e3d3a2'):e.owner>=0?('#'+(sim.players[e.owner].color??(e.owner===0?0xb5e7dc:0xed8b7b)).toString(16).padStart(6,'0')):'#e3d3a2';
    const r=e.kind==='building'?Math.max(2,e.r*scale):e.kind==='unit'?1.6:1.5;ctx.fillRect(coord(e.x)-r,coord(e.z)-r,r*2,r*2);
  }
  if(settings.fog)ctx.drawImage(view.fogCanvas,0,0,size,size);
  const goal=campaignObjective(sim)?.marker;if(goal){const x=coord(goal.x),z=coord(goal.z);ctx.beginPath();ctx.moveTo(x,z-5);ctx.lineTo(x+5,z);ctx.lineTo(x,z+5);ctx.lineTo(x-5,z);ctx.closePath();ctx.fillStyle='#f2ce77';ctx.fill();ctx.strokeStyle='#18251f';ctx.lineWidth=1.5;ctx.stroke();}
  const box=cameraMapBox(view.camera,view.groundHeight(view.target.x,view.target.z),worldSize);
  if(box){
    const x=coord(box.minX),z=coord(box.minZ),width=(box.maxX-box.minX)*scale,height=(box.maxZ-box.minZ)*scale;
    ctx.fillStyle='#f5e8bd12';ctx.fillRect(x,z,width,height);ctx.strokeStyle='#16251f';ctx.lineWidth=3;ctx.strokeRect(x,z,width,height);ctx.strokeStyle='#f5e8bd';ctx.lineWidth=1.5;ctx.strokeRect(x,z,width,height);
  }
  // Keep the current rectangle available for input diagnostics and browser QA.
  view.minimapCameraBox=box;
  // A center marker stays readable even when an overview covers almost the whole map.
  ctx.beginPath();ctx.arc(coord(view.target.x),coord(view.target.z),2.3,0,Math.PI*2);ctx.fillStyle='#f5e8bd';ctx.fill();ctx.strokeStyle='#16251f';ctx.lineWidth=1;ctx.stroke();
  ctx.strokeStyle='#899b7e';ctx.lineWidth=1;ctx.strokeRect(.5,.5,size-1,size-1);
}
