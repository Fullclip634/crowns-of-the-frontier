import {WORLD} from './data.js';
import {MAP_HALF,cameraMapBox} from './map-geometry.js';
import {campaignObjective} from './campaigns.js';
import {bridgeOuterHalfWidth,bridgeSpans,spanZ,spanOuterHalfWidth} from './bridge-layout.js';
import {terrainBiome,isSnowBiome,isVolcanicBiome,treePalette} from './terrain-biomes.js';
import {minimapFilterStyle} from './tactical-ux.js';

const clampByte=v=>Math.max(0,Math.min(255,Math.round(v)));
function parseHex(hex){
  const n=parseInt(String(hex||'#5b734c').replace('#',''),16);
  return [(n>>16)&255,(n>>8)&255,n&255];
}

function paintBridges(ctx,map,coord,scale){
  for(const span of bridgeSpans(map)){
    const cz=spanZ(span),halfW=spanOuterHalfWidth(span);
    const x=coord(span.center-span.halfLength),z=coord(cz-halfW);
    const width=span.halfLength*2*scale,height=halfW*2*scale;
    ctx.fillStyle=span.style==='timber'?'#9c7448':'#b8a47c';ctx.fillRect(x,z,width,height);
    ctx.strokeStyle=span.style==='timber'?'#5c4228':'#7a684b';ctx.lineWidth=1;
    ctx.strokeRect(x+.5,z+.5,Math.max(1,width-1),Math.max(1,height-1));
  }
}

function paintBarriers(ctx,sim,coord,scale){
  const barriers=sim?.barriers;
  if(!barriers?.length)return;
  for(const b of barriers){
    const x=coord(b.x),y=coord(b.z),r=Math.max(2.1,b.r*scale*(b.kind==='mountain'?1.18:1.0));
    ctx.fillStyle=b.kind==='mountain'?'#3b3d39':'#4d4f49';
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=b.kind==='mountain'?'#90938a':'#787a71';
    ctx.beginPath();ctx.arc(x-r*.22,y-r*.22,r*.56,0,Math.PI*2);ctx.fill();
  }
}

export function renderReliefBase(bctx,size,sim,view){
  const worldSize=sim.worldSize||WORLD,half=worldSize/2,scale=size/worldSize,coord=value=>(value+half)*scale;
  const map=sim.options?.map||'highlands',biome=terrainBiome(map);
  const land=view?.landscape,sampleHeight=land?.surfaceHeightAt??land?.heightAt;
  if(typeof sampleHeight==='function'&&typeof bctx.createImageData==='function'&&typeof bctx.putImageData==='function'){
    const img=bctx.createImageData(size,size),data=img.data;
    const [br,bg,bb]=parseHex(biome.map);
    const snow=isSnowBiome(map),volcanic=isVolcanicBiome(map),arid=map==='arid';
    const step=worldSize/size,eps=Math.max(1.2,step*1.1);
    const waterGrid=new Uint8Array(size*size);
    const heightGrid=new Float32Array(size*size);
    for(let py=0;py<size;py++){
      const wz=-half+(py+.5)*step;
      for(let px=0;px<size;px++){
        const wx=-half+(px+.5)*step,idx=py*size+px;
        heightGrid[idx]=sampleHeight.call(land,wx,wz);
        waterGrid[idx]=sim.isWater?.(wx,wz)?1:0;
      }
    }
    for(let py=0;py<size;py++){
      for(let px=0;px<size;px++){
        const idx=py*size+px,o=idx*4;
        const h=heightGrid[idx],isWater=waterGrid[idx]===1;
        const paper=1+(((px*73+py*151)&15)/15-.5)*.045;
        let r,g,b;
        if(isWater){
          const nearLand=(px>0&&!waterGrid[idx-1])||(px+1<size&&!waterGrid[idx+1])||(py>0&&!waterGrid[idx-size])||(py+1<size&&!waterGrid[idx+size]);
          if(nearLand){
            r=48;g=90;b=100;
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
        data[o]=clampByte(r*paper);
        data[o+1]=clampByte(g*paper);
        data[o+2]=clampByte(b*paper);
        data[o+3]=255;
      }
    }
    bctx.putImageData(img,0,0);
    paintBridges(bctx,map,coord,scale);
    paintBarriers(bctx,sim,coord,scale);
    return true;
  }
  bctx.fillStyle=biome.map;bctx.fillRect(0,0,size,size);
  for(const channel of land?.channels?.()||[]){
    bctx.strokeStyle='#5d9298';bctx.lineWidth=channel.width*2*scale;bctx.lineCap='butt';bctx.beginPath();
    for(let z=-half;z<=half;z+=2){const x=coord(channel.center+Math.sin(z*channel.frequency)*channel.bend),y=coord(z);if(z===-half)bctx.moveTo(x,y);else bctx.lineTo(x,y);}bctx.stroke();
  }
  paintBridges(bctx,map,coord,scale);
  paintBarriers(bctx,sim,coord,scale);
  return false;
}

function drawDiamond(ctx,x,z,r,fill,stroke=null){
  ctx.beginPath();
  ctx.moveTo(x,z-r);ctx.lineTo(x+r,z);ctx.lineTo(x,z+r);ctx.lineTo(x-r,z);
  ctx.closePath();
  ctx.fillStyle=fill;ctx.fill();
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}
}

export function drawMinimap(canvas,sim,view,settings,options={}){
  const ctx=canvas.getContext('2d'),size=canvas.width,worldSize=sim.worldSize||WORLD,half=worldSize/2,scale=size/worldSize,coord=value=>(value+half)*scale;
  const filter=options.filter||view?.minimapFilter||'all';
  const map=sim.options.map,land=view?.landscape,baseKey=`${map}:${sim.options.seed||0}:${size}:${worldSize}:${sim.barriers?.length||0}`;
  let base=canvas.cachedBaseKey===baseKey&&canvas.cachedLandscape===land?canvas.cachedBase:null;
  if(!base&&typeof document!=='undefined'){
    try{
      const baseCanvas=document.createElement('canvas');baseCanvas.width=size;baseCanvas.height=size;
      const bctx=baseCanvas.getContext('2d');
      if(bctx){
        renderReliefBase(bctx,size,sim,view);
        base=canvas.cachedBase=baseCanvas;canvas.cachedBaseKey=baseKey;canvas.cachedLandscape=land;
      }
    }catch{}
  }
  ctx.clearRect(0,0,size,size);
  const woodColor=treePalette(map).minimap;
  const resourceColors={wood:woodColor,gold:'#ecc55e',stone:'#c4cac0',food:'#b57960'};
  const playerColors=sim.players?sim.players.map((player,i)=>'#'+(player?.color??(i===0?0xb5e7dc:0xed8b7b)).toString(16).padStart(6,'0')):[];
  const canCacheResources=typeof HTMLCanvasElement!=='undefined'&&base instanceof HTMLCanvasElement&&typeof sim.candidatesFor==='function'&&view?.exploredRevision!==undefined;
  const drawEntityMarker=(e,fill,styleMode)=>{
    const ex=coord(e.x),ez=coord(e.z);
    if(styleMode==='hidden')return;
    const prevAlpha=ctx.globalAlpha;
    if(styleMode==='muted')ctx.globalAlpha=.34;
    if(e.kind==='shrine'){
      drawDiamond(ctx,ex,ez,3.4,fill,'#f6de7e');
    }else if(e.kind==='building'&&e.type==='towncenter'){
      const r=Math.max(3.2,e.r*scale);
      ctx.fillStyle=fill;ctx.fillRect(ex-r,ez-r,r*2,r*2);
      ctx.strokeStyle='#f5dd95';ctx.lineWidth=1;ctx.strokeRect(ex-r+.5,ez-r+.5,Math.max(1,r*2-1),Math.max(1,r*2-1));
    }else if(e.kind==='building'&&(e.type==='keep'||e.type==='wonder')){
      drawDiamond(ctx,ex,ez,Math.max(3.5,e.r*scale*1.05),fill,'#f5dd95');
    }else{
      const r=e.kind==='building'?Math.max(2.2,e.r*scale):e.kind==='unit'?(styleMode==='highlight'?2.15:1.7):1.5;
      ctx.fillStyle=fill;ctx.fillRect(ex-r,ez-r,r*2,r*2);
    }
    if(styleMode==='muted')ctx.globalAlpha=prevAlpha;
  };
  if(canCacheResources){
    if(filter==='combat'){
      ctx.drawImage(base,0,0);
    }else{
      const resKey=`${baseKey}:${filter}:${sim.entities.length}:${sim.resourceRevision||0}:${sim.resourceMemory?.size||0}:${view.exploredRevision}:${!!sim.options?.spectator}`;
      let resCanvas=canvas.cachedResources;
      if(!resCanvas||resCanvas.width!==size||resCanvas.height!==size){
        resCanvas=canvas.cachedResources=document.createElement('canvas');
        resCanvas.width=size;resCanvas.height=size;canvas.cachedResourceKey='';
      }
      if(canvas.cachedResourceKey!==resKey||canvas.cachedResourceLandscape!==land||canvas.cachedResourceSim!==sim||canvas.cachedResourceEntities!==sim.entities){
        const rctx=resCanvas.getContext('2d');
        if(rctx){
          rctx.clearRect(0,0,size,size);
          rctx.drawImage(base,0,0);
          let lastFill='';
          const dotSize=filter==='economy'?3.8:3;
          const halfDot=dotSize/2;
          for(const entity of sim.entities){
            if(entity.kind!=='resource')continue;
            const e=sim.resourceMemory?.get(entity.id)??entity;
            if(e.hp<=0||e.embarked||!(sim.isVisible(e.x,e.z)||sim.isExplored(e.x,e.z)))continue;
            const fill=e.type==='food'&&e.water?'#c5dee2':resourceColors[e.type];
            if(fill!==lastFill){rctx.fillStyle=fill;lastFill=fill;}
            const ex=coord(e.x),ez=coord(e.z);
            rctx.fillRect(ex-halfDot,ez-halfDot,dotSize,dotSize);
          }
          canvas.cachedResourceKey=resKey;canvas.cachedResourceLandscape=land;canvas.cachedResourceSim=sim;canvas.cachedResourceEntities=sim.entities;
        }
      }
      ctx.drawImage(resCanvas,0,0);
    }
    const drawDynamic=list=>{
      for(const e of list){
        if(e.hp<=0||e.embarked||!(e.owner===0||e.kind==='shrine'||sim.isVisible(e.x,e.z)))continue;
        const fill=e.kind==='shrine'?(e.owner===0?'#91dbc9':e.owner===1?'#df8582':'#e8d69c'):e.owner>=0?(playerColors[e.owner]||'#e3d3a2'):'#e3d3a2';
        drawEntityMarker(e,fill,minimapFilterStyle(filter,e));
      }
    };
    drawDynamic(sim.candidatesFor('shrine'));
    drawDynamic(sim.candidatesFor('building'));
    drawDynamic(sim.candidatesFor('unit'));
  }else{
    if(base)ctx.drawImage(base,0,0);
    else renderReliefBase(ctx,size,sim,view);
    for(const entity of sim.entities){
      const e=sim.resourceMemory?.get(entity.id)??entity;
      if(e.hp<=0||e.embarked||!(e.owner===0||e.kind==='shrine'||sim.isVisible(e.x,e.z)||e.kind==='resource'&&sim.isExplored(e.x,e.z)))continue;
      const fill=e.kind==='resource'?(e.type==='food'&&e.water?'#c5dee2':resourceColors[e.type]):e.kind==='shrine'?(e.owner===0?'#91dbc9':e.owner===1?'#df8582':'#e8d69c'):e.owner>=0?(playerColors[e.owner]||'#e3d3a2'):'#e3d3a2';
      drawEntityMarker(e,fill,minimapFilterStyle(filter,e));
    }
  }
  if(settings.fog)ctx.drawImage(view.fogCanvas,0,0,size,size);
  const goal=campaignObjective(sim)?.marker;if(goal){const x=coord(goal.x),z=coord(goal.z);drawDiamond(ctx,x,z,5,'#f2ce77','#8f7440');}

  // Pulsing combat alert & tactical flare ripples on minimap
  const ripples=options.ripples??view?.tacticalAlerts?.activeRipples?.()??[];
  if(ripples.length){
    const nowMs=options.now??performance.now();
    const reduced=!!settings?.reducedMotion;
    for(const r of ripples){
      const age=Math.max(0,Math.min(1,(nowMs-r.startedAt)/Math.max(1,r.duration)));
      const rx=coord(r.x),rz=coord(r.z);
      const isFlare=r.kind==='flare';
      const baseColor=isFlare?'255,224,102':'255,82,74';
      const wave=reduced?.45:((age*3)%1);
      const radius=4+wave*14;
      const alpha=Math.max(0,(1-age*.65)*(1-wave*.72));
      ctx.beginPath();ctx.arc(rx,rz,radius,0,Math.PI*2);
      ctx.strokeStyle=`rgba(${baseColor},${alpha.toFixed(2)})`;ctx.lineWidth=isFlare?2:2.2;ctx.stroke();
      ctx.beginPath();ctx.arc(rx,rz,2.4,0,Math.PI*2);
      ctx.fillStyle=`rgba(${baseColor},${Math.min(1,alpha+.3).toFixed(2)})`;ctx.fill();
    }
  }

  // Crisp rectangular/square radar camera viewport box centered on the camera target
  const groundY=view.groundHeight(view.target.x,view.target.z);
  const box=cameraMapBox(view.camera,groundY,worldSize);
  if(box){
    const rawW=box.maxX-box.minX,rawH=box.maxZ-box.minZ;
    const zoomSpan=Number.isFinite(view.zoom)?Math.max(18,view.zoom*1.45):Math.max(rawW,rawH);
    const drawW=Math.min(rawW,zoomSpan),drawH=Math.min(rawH,zoomSpan);
    const cx=Math.max(-half+drawW/2,Math.min(half-drawW/2,view.target.x));
    const cz=Math.max(-half+drawH/2,Math.min(half-drawH/2,view.target.z));
    const x=coord(cx-drawW/2),z=coord(cz-drawH/2),width=drawW*scale,height=drawH*scale;
    ctx.fillStyle='#f5e8bd16';ctx.fillRect(x,z,width,height);
    ctx.strokeStyle='#f5e5b3';ctx.lineWidth=1.5;ctx.strokeRect(x+.5,z+.5,Math.max(2,width-1),Math.max(2,height-1));
  }
  view.minimapCameraBox=box;
  ctx.beginPath();ctx.arc(coord(view.target.x),coord(view.target.z),2.2,0,Math.PI*2);ctx.fillStyle='#f5e8bd';ctx.fill();
  ctx.strokeStyle='#d9bc7a';ctx.lineWidth=1;ctx.beginPath();
  const mid=size/2;
  ctx.moveTo(mid,1);ctx.lineTo(mid,5);ctx.moveTo(mid,size-1);ctx.lineTo(mid,size-5);
  ctx.moveTo(1,mid);ctx.lineTo(5,mid);ctx.moveTo(size-1,mid);ctx.lineTo(size-5,mid);
  ctx.stroke();
}
