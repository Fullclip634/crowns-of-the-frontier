import {WORLD} from './data.js';
import {MAP_HALF,cameraMapBox} from './map-geometry.js';
import {campaignObjective} from './campaigns.js';
import {terrainBiome,isSnowBiome,isAridBiome} from './terrain-biomes.js';

const clampByte=v=>Math.max(0,Math.min(255,Math.round(v)));
function parseHex(hex){
  const n=parseInt(String(hex||'#5b734c').replace('#',''),16);
  return [(n>>16)&255,(n>>8)&255,n&255];
}

export function renderReliefBase(bctx,size,sim,view){
  const worldSize=sim.worldSize||WORLD,half=worldSize/2,scale=size/worldSize,coord=value=>(value+half)*scale;
  const map=sim.options?.map||'highlands',biome=terrainBiome(map);
  const land=view?.landscape;
  if(land?.heightAt&&typeof bctx.createImageData==='function'&&typeof bctx.putImageData==='function'){
    const img=bctx.createImageData(size,size),data=img.data;
    const [br,bg,bb]=parseHex(biome.map);
    const snow=isSnowBiome(map),volcanic=map==='volcanic',arid=map==='arid';
    const step=worldSize/size,eps=Math.max(1.2,step*1.1);
    const waterGrid=new Uint8Array(size*size);
    const heightGrid=new Float32Array(size*size);
    for(let py=0;py<size;py++){
      const wz=-half+(py+.5)*step;
      for(let px=0;px<size;px++){
        const wx=-half+(px+.5)*step,idx=py*size+px;
        heightGrid[idx]=land.heightAt(wx,wz);
        waterGrid[idx]=sim.isWater?.(wx,wz)?1:0;
      }
    }
    for(let py=0;py<size;py++){
      const vy=py/size*2-1;
      for(let px=0;px<size;px++){
        const vx=px/size*2-1,idx=py*size+px,o=idx*4;
        const h=heightGrid[idx],isWater=waterGrid[idx]===1;
        const edgeDist=Math.max(Math.abs(vx),Math.abs(vy));
        const vignette=1-Math.max(0,(edgeDist-.72)/.28)*.16;
        const paper=1+(((px*73+py*151)&15)/15-.5)*.045;
        let r,g,b;
        if(isWater){
          const nearLand=(px>0&&!waterGrid[idx-1])||(px+1<size&&!waterGrid[idx+1])||(py>0&&!waterGrid[idx-size])||(py+1<size&&!waterGrid[idx+size]);
          if(nearLand){
            r=28;g=46;b=48;
          }else{
            const depth=Math.max(0,Math.min(1,(-h-.12)/2.1));
            const shoal=1-depth;
            const wave=Math.sin(px*.38+py*.16)*.035;
            r=(52+shoal*54)*(1+wave);
            g=(96+shoal*62)*(1+wave);
            b=(108+shoal*52)*(1+wave);
          }
        }else{
          const hL=px>0?heightGrid[idx-1]:h,hR=px+1<size?heightGrid[idx+1]:h;
          const hU=py>0?heightGrid[idx-size]:h,hD=py+1<size?heightGrid[idx+size]:h;
          const dx=(hR-hL)/(eps*2),dz=(hD-hU)/(eps*2);
          const invLen=1/Math.hypot(-dx,1,-dz);
          const nx=-dx*invLen,ny=invLen,nz=-dz*invLen;
          // Crisp NW medieval map hillshading + subtle elevation & slope relief
          const light=nx*-.62+ny*.72+nz*-.34;
          const shade=.74+Math.max(0,light)*.44+Math.max(-.12,Math.min(.14,h*.028));
          const slope=1-ny;
          const rockMix=Math.max(0,Math.min(.55,(slope-.08)*2.4));
          const contour=Math.abs(((h*.45)%1+1)%1-.5)<.045&&h>.8?.93:1;
          const rr=volcanic?54:snow?146:arid?152:118;
          const rg=volcanic?46:snow?156:arid?124:116;
          const rb=volcanic?44:snow?168:arid?96:106;
          r=(br*(1-rockMix)+rr*rockMix)*shade*contour;
          g=(bg*(1-rockMix)+rg*rockMix)*shade*contour;
          b=(bb*(1-rockMix)+rb*rockMix)*shade*contour;
          if(volcanic&&slope>.14&&(((px*19+py*31)%23)===0)){r+=44;g+=16;b+=4;}
        }
        data[o]=clampByte(r*vignette*paper);
        data[o+1]=clampByte(g*vignette*paper);
        data[o+2]=clampByte(b*vignette*paper);
        data[o+3]=255;
      }
    }
    bctx.putImageData(img,0,0);
    // Stone bridges drawn cleanly with timber/stone deck + dark ink rail lines
    for(const channel of land.channels?.()||[]){
      if(map==='coast')continue;
      const bx=coord(channel.center-channel.width-3),by=coord(-7.75),bw=(channel.width+3)*2*scale,bh=15.5*scale;
      bctx.fillStyle='#b8a47c';bctx.fillRect(bx,by,bw,bh);
      bctx.strokeStyle='#3c3428';bctx.lineWidth=1;bctx.strokeRect(bx+.5,by+.5,Math.max(1,bw-1),Math.max(1,bh-1));
    }
    return true;
  }
  bctx.fillStyle=biome.map;bctx.fillRect(0,0,size,size);
  for(const channel of land?.channels?.()||[]){
    bctx.strokeStyle='#5d9298';bctx.lineWidth=channel.width*2*scale;bctx.lineCap='butt';bctx.beginPath();
    for(let z=-half;z<=half;z+=2){const x=coord(channel.center+Math.sin(z*channel.frequency)*channel.bend),y=coord(z);if(z===-half)bctx.moveTo(x,y);else bctx.lineTo(x,y);}bctx.stroke();
    if(map!=='coast'){bctx.fillStyle='#b8a47c';bctx.fillRect(coord(channel.center-channel.width-3),coord(-7.75),(channel.width+3)*2*scale,15.5*scale);}
  }
  return false;
}

export function drawMinimap(canvas,sim,view,settings){
  const ctx=canvas.getContext('2d'),size=canvas.width,worldSize=sim.worldSize||WORLD,half=worldSize/2,scale=size/worldSize,coord=value=>(value+half)*scale;
  const map=sim.options.map,baseKey=`${map}:${sim.options.seed||0}:${size}:${worldSize}`;
  if(canvas.cachedBaseKey!==baseKey&&typeof document!=='undefined'){
    try{
      const baseCanvas=document.createElement('canvas');baseCanvas.width=size;baseCanvas.height=size;
      const bctx=baseCanvas.getContext('2d');
      renderReliefBase(bctx,size,sim,view);
      canvas.cachedBase=baseCanvas;canvas.cachedBaseKey=baseKey;
    }catch{}
  }
  ctx.clearRect(0,0,size,size);
  if(canvas.cachedBase)ctx.drawImage(canvas.cachedBase,0,0);
  else renderReliefBase(ctx,size,sim,view);

  const woodColor=map==='volcanic'?'#2d2421':isSnowBiome(map)?'#4b6862':isAridBiome(map)?'#5a6738':'#254b30';
  for(const entity of sim.entities){
    const e=sim.resourceMemory?.get(entity.id)??entity;
    if(e.hp<=0||e.embarked||!(e.owner===0||e.kind==='shrine'||sim.isVisible(e.x,e.z)||e.kind==='resource'&&sim.isExplored(e.x,e.z)))continue;
    const fill=e.kind==='resource'?{wood:woodColor,gold:'#ecc55e',stone:'#c4cac0',food:e.water?'#c5dee2':'#b57960'}[e.type]:e.kind==='shrine'?(e.owner===0?'#91dbc9':e.owner===1?'#df8582':'#e8d69c'):e.owner>=0?('#'+(sim.players[e.owner].color??(e.owner===0?0xb5e7dc:0xed8b7b)).toString(16).padStart(6,'0')):'#e3d3a2';
    const r=e.kind==='building'?Math.max(2.2,e.r*scale):e.kind==='unit'?1.7:1.5;
    const ex=coord(e.x),ez=coord(e.z);
    if(e.kind==='building'){ctx.fillStyle='#101915';ctx.fillRect(ex-r-.75,ez-r-.75,r*2+1.5,r*2+1.5);}
    ctx.fillStyle=fill;ctx.fillRect(ex-r,ez-r,r*2,r*2);
  }
  if(settings.fog)ctx.drawImage(view.fogCanvas,0,0,size,size);
  const goal=campaignObjective(sim)?.marker;if(goal){const x=coord(goal.x),z=coord(goal.z);ctx.beginPath();ctx.moveTo(x,z-5);ctx.lineTo(x+5,z);ctx.lineTo(x,z+5);ctx.lineTo(x-5,z);ctx.closePath();ctx.fillStyle='#f2ce77';ctx.fill();ctx.strokeStyle='#18251f';ctx.lineWidth=1.5;ctx.stroke();}
  const box=cameraMapBox(view.camera,view.groundHeight(view.target.x,view.target.z),worldSize);
  if(box){
    const x=coord(box.minX),z=coord(box.minZ),width=(box.maxX-box.minX)*scale,height=(box.maxZ-box.minZ)*scale;
    ctx.fillStyle='#f5e8bd14';ctx.fillRect(x,z,width,height);ctx.strokeStyle='#14221b';ctx.lineWidth=3;ctx.strokeRect(x,z,width,height);ctx.strokeStyle='#f5e5b3';ctx.lineWidth=1.4;ctx.strokeRect(x,z,width,height);
  }
  // Keep the current rectangle available for input diagnostics and browser QA.
  view.minimapCameraBox=box;
  // A center marker stays readable even when an overview covers almost the whole map.
  ctx.beginPath();ctx.arc(coord(view.target.x),coord(view.target.z),2.3,0,Math.PI*2);ctx.fillStyle='#f5e8bd';ctx.fill();ctx.strokeStyle='#16251f';ctx.lineWidth=1;ctx.stroke();
  // Aged brass cartographic border & subtle cardinal compass ticks.
  ctx.strokeStyle='#b89a5e';ctx.lineWidth=1;ctx.strokeRect(.5,.5,size-1,size-1);
  ctx.strokeStyle='#d9bc7a';ctx.beginPath();
  const mid=size/2;
  ctx.moveTo(mid,1);ctx.lineTo(mid,5);ctx.moveTo(mid,size-1);ctx.lineTo(mid,size-5);
  ctx.moveTo(1,mid);ctx.lineTo(5,mid);ctx.moveTo(size-1,mid);ctx.lineTo(size-5,mid);
  ctx.stroke();
}
