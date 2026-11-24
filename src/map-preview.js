import {seededRandom} from './data.js';
import {waterChannels,waterFords} from './map-water.js';
import {bridgeSpans,spanZ} from './bridge-layout.js';
import {terrainBiome,treePalette,isSnowBiome,isAridBiome,isVolcanicBiome,isJungleBiome} from './terrain-biomes.js';
import {terrainRelief,terrainPhase} from './terrain-elevation.js';

/**
 * Authoritative Cartographic Map Preview Renderer for Custom Battle (Canvas 2D)
 * and Skirmish Hub Biome Cards (Inline SVG).
 *
 * Uses exact waterChannels(), bridgeSpans(), terrainRelief(), and real map
 * geography descriptors matching src/terrain-barriers.js so players see the
 * true mountains, passes, woodland glades, rivers, and bridges before launch.
 */

function ridgePoints(a,b,steps=6,wobble=0,seed=1){
  const pts=[],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)||1,nx=-dz/len,nz=dx/len;
  for(let i=0;i<=steps;i++){
    const t=i/steps;
    const w=wobble?Math.sin(t*Math.PI*2.2+seed)*wobble:0;
    pts.push([a[0]+dx*t+nx*w,a[1]+dz*t+nz*w]);
  }
  return pts;
}

/** Returns deterministic normalized [0..1] cartographic features for any registered map. */
export function mapCartography(map){
  const mountains=[]; // [{x,y,r,peak?:boolean}]
  const forests=[];   // [{x,y,r}]
  const minerals=[];  // [{x,y,type:'gold'|'stone'}]
  const addRidge=(a,b,{steps=6,r=.034,wobble=.014,seed=1,peaks=true,passes=[]}={})=>{
    const pts=ridgePoints(a,b,steps,wobble,seed);
    pts.forEach(([x,y],i)=>{
      if(passes.some(([px,py,pr])=>Math.hypot(x-px,y-py)<pr))return;
      mountains.push({x,y,r:r*(i===0||i===steps?1.16:1),peak:peaks&&(i===0||i===steps||i%2===0)});
    });
  };
  const addMassif=(cx,cy,r=.055)=>{
    mountains.push({x:cx,y:cy,r,peak:true});
    mountains.push({x:cx-r*.72,y:cy+r*.42,r:r*.68,peak:false});
    mountains.push({x:cx+r*.74,y:cy-r*.36,r:r*.64,peak:false});
  };
  const addForestBelt=(a,b,{steps=8,r=.042,spread=.026,passes=[],seed=1}={})=>{
    const pts=ridgePoints(a,b,steps,.016,seed);
    const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
    for(const [x,y] of pts){
      if(passes.some(([px,py,pr])=>Math.hypot(x-px,y-py)<pr))continue;
      forests.push({x,y,r});
      if(spread>0){
        forests.push({x:x+nx*spread,y:y+ny*spread,r:r*.78});
        forests.push({x:x-nx*spread,y:y-ny*spread,r:r*.76});
      }
    }
  };

  if(map==='ironpass'){
    const passes=[[.5,.5,.075],[.29,.29,.07],[.71,.71,.07]];
    addRidge([.05,.06],[.95,.94],{steps:14,r:.038,wobble:.016,seed:11,passes});
    addRidge([.07,.58],[.38,.53],{steps:5,r:.032,wobble:.012,seed:23,passes});
    addRidge([.62,.47],[.93,.42],{steps:5,r:.032,wobble:.012,seed:37,passes});
    addMassif(.12,.86,.06);addMassif(.88,.14,.06);
    minerals.push({x:.44,y:.43,type:'gold'},{x:.56,y:.57,type:'gold'},{x:.42,y:.55,type:'stone'},{x:.58,y:.45,type:'stone'});
  }else if(map==='sunderedpass'){
    const passes=[[.5,.24,.075],[.5,.5,.078],[.5,.76,.075]];
    addRidge([.49,.05],[.51,.95],{steps:14,r:.04,wobble:.018,seed:41,passes});
    addMassif(.12,.14,.05);addMassif(.88,.86,.05);
    addForestBelt([.12,.22],[.30,.38],{steps:4,r:.042,spread:.02,seed:42});
    addForestBelt([.70,.62],[.88,.78],{steps:4,r:.042,spread:.02,seed:43});
    addForestBelt([.12,.76],[.28,.88],{steps:3,r:.04,spread:.018,seed:44});
    addForestBelt([.72,.12],[.88,.24],{steps:3,r:.04,spread:.018,seed:45});
    minerals.push({x:.42,y:.24,type:'gold'},{x:.58,y:.76,type:'gold'},{x:.42,y:.5,type:'stone'},{x:.58,y:.5,type:'stone'});
  }else if(map==='ironring'){
    const passes=[[.5,.35,.07],[.65,.5,.07],[.5,.65,.07],[.35,.5,.07]];
    for(const [i,a] of [-Math.PI*.75,-Math.PI*.25,Math.PI*.25,Math.PI*.75].entries()){
      const inner=[.5+Math.cos(a)*.16,.5+Math.sin(a)*.16];
      const far=[.5+Math.cos(a)*.33,.5+Math.sin(a)*.33];
      addRidge(inner,far,{steps:4,r:.034,wobble:.010,seed:31+i*9,passes});
      const arcL=[.5+Math.cos(a-.27)*.16,.5+Math.sin(a-.27)*.16];
      const arcR=[.5+Math.cos(a+.27)*.16,.5+Math.sin(a+.27)*.16];
      addRidge(arcL,arcR,{steps:3,r:.030,wobble:.006,seed:51+i*7,passes});
    }
    minerals.push({x:.44,y:.44,type:'gold'},{x:.56,y:.56,type:'gold'},{x:.44,y:.56,type:'stone'},{x:.56,y:.44,type:'stone'});
  }else if(map==='emberroad'){
    const passes=[[.5,.5,.08],[.27,.29,.07],[.73,.71,.07]];
    addRidge([.06,.08],[.42,.42],{steps:7,r:.038,wobble:.015,seed:71,passes});
    addRidge([.58,.58],[.94,.92],{steps:7,r:.038,wobble:.015,seed:73,passes});
    addMassif(.14,.84,.058);addMassif(.86,.16,.058);
    addRidge([.14,.52],[.34,.60],{steps:4,r:.03,wobble:.01,seed:75});
    addRidge([.66,.40],[.86,.48],{steps:4,r:.03,wobble:.01,seed:77});
    minerals.push({x:.42,y:.58,type:'gold'},{x:.58,y:.42,type:'gold'},{x:.39,y:.52,type:'stone'},{x:.61,y:.48,type:'stone'});
  }else if(map==='threecrowns'){
    addRidge([.44,.06],[.56,.26],{steps:5,r:.034,wobble:.012,seed:61});
    addRidge([.44,.74],[.56,.94],{steps:5,r:.034,wobble:.012,seed:63});
    addMassif(.10,.14,.052);addMassif(.90,.86,.052);
    addMassif(.10,.86,.048);addMassif(.90,.14,.048);
    minerals.push({x:.5,y:.38,type:'gold'},{x:.5,y:.62,type:'gold'});
  }else if(map==='bastion'){
    addRidge([.08,.10],[.40,.33],{steps:6,r:.036,wobble:.014,seed:61});
    addRidge([.60,.67],[.92,.90],{steps:6,r:.036,wobble:.014,seed:67});
    addMassif(.12,.56,.058);addMassif(.88,.44,.058);
    addMassif(.18,.86,.054);addMassif(.82,.14,.054);
    addForestBelt([.12,.72],[.26,.82],{steps:3,r:.036,spread:.015,seed:68});
    addForestBelt([.74,.18],[.88,.28],{steps:3,r:.036,spread:.015,seed:69});
  }else if(map==='frostvale'){
    addMassif(.12,.14,.06);addMassif(.88,.86,.06);
    addMassif(.12,.86,.058);addMassif(.88,.14,.058);
    addRidge([.12,.44],[.28,.54],{steps:4,r:.034,wobble:.012,seed:81});
    addRidge([.72,.46],[.88,.56],{steps:4,r:.034,wobble:.012,seed:82});
    addForestBelt([.26,.14],[.42,.20],{steps:4,r:.038,spread:.016,seed:83});
    addForestBelt([.58,.80],[.74,.86],{steps:4,r:.038,spread:.016,seed:84});
  }else if(map==='timbervale'){
    const passes=[[.5,.5,.09],[.32,.32,.075],[.68,.68,.075]];
    addForestBelt([.07,.12],[.41,.38],{steps:7,r:.046,spread:.028,passes,seed:21});
    addForestBelt([.59,.62],[.93,.88],{steps:7,r:.046,spread:.028,passes,seed:22});
    addForestBelt([.08,.76],[.26,.92],{steps:5,r:.044,spread:.024,seed:23});
    addForestBelt([.74,.08],[.92,.24],{steps:5,r:.044,spread:.024,seed:24});
    addMassif(.14,.55,.052);addMassif(.86,.45,.052);
    addMassif(.43,.14,.046);addMassif(.57,.86,.046);
  }else if(map==='blackwood'){
    const passes=[[.5,.5,.07],[.31,.31,.065],[.69,.69,.065]];
    addForestBelt([.06,.06],[.94,.94],{steps:14,r:.052,spread:.036,passes,seed:41});
    addForestBelt([.07,.61],[.38,.56],{steps:6,r:.046,spread:.026,passes,seed:47});
    addForestBelt([.62,.44],[.93,.39],{steps:6,r:.046,spread:.026,passes,seed:53});
    addMassif(.12,.88,.048);addMassif(.88,.12,.048);
  }else if(map==='oakhold'){
    const passes=[[.5,.5,.10],[.29,.33,.075],[.71,.67,.075],[.33,.71,.075],[.67,.29,.075]];
    addForestBelt([.07,.13],[.93,.87],{steps:13,r:.048,spread:.032,passes,seed:52});
    addForestBelt([.13,.91],[.87,.09],{steps:12,r:.044,spread:.026,passes,seed:57});
    addMassif(.12,.50,.044);addMassif(.88,.50,.044);
    minerals.push({x:.45,y:.46,type:'gold'},{x:.55,y:.54,type:'gold'},{x:.46,y:.55,type:'stone'},{x:.54,y:.45,type:'stone'});
  }else if(map==='woodland'){
    const passes=[[.5,.5,.10]];
    addForestBelt([.10,.16],[.38,.28],{steps:6,r:.046,spread:.028,passes,seed:91});
    addForestBelt([.62,.72],[.90,.84],{steps:6,r:.046,spread:.028,passes,seed:92});
    addForestBelt([.12,.76],[.36,.88],{steps:5,r:.044,spread:.024,passes,seed:93});
    addForestBelt([.64,.12],[.88,.24],{steps:5,r:.044,spread:.024,passes,seed:94});
    addMassif(.12,.50,.042);addMassif(.88,.50,.042);
  }else if(['highland','volcanic','arid','tundra'].includes(map)){
    const passes=[[.5,.5,.09],[.36,.5,.075],[.64,.5,.075]];
    addRidge([.13,.41],[.40,.43],{steps:6,r:.035,wobble:.014,seed:81,passes});
    addRidge([.60,.57],[.87,.59],{steps:6,r:.035,wobble:.014,seed:83,passes});
    addMassif(.12,.14,.054);addMassif(.88,.86,.054);
    addMassif(.12,.86,.048);addMassif(.88,.14,.048);
    if(map==='tundra'){
      addForestBelt([.26,.22],[.40,.28],{steps:3,r:.034,spread:.014,seed:86});
      addForestBelt([.60,.72],[.74,.78],{steps:3,r:.034,spread:.014,seed:87});
    }
  }else if(map==='canyon'){
    addRidge([.35,.14],[.35,.86],{steps:8,r:.028,wobble:.015,seed:14,peaks:false,passes:[[.35,.5,.11]]});
    addRidge([.65,.14],[.65,.86],{steps:8,r:.028,wobble:.015,seed:15,peaks:false,passes:[[.65,.5,.11]]});
    minerals.push({x:.48,y:.34,type:'gold'},{x:.52,y:.66,type:'stone'},{x:.50,y:.50,type:'gold'});
  }else if(map==='winter'){
    addForestBelt([.12,.16],[.34,.28],{steps:5,r:.042,spread:.02,seed:18});
    addForestBelt([.66,.72],[.88,.84],{steps:5,r:.042,spread:.02,seed:19});
    addForestBelt([.14,.74],[.34,.84],{steps:4,r:.04,spread:.018,seed:20});
    addForestBelt([.66,.16],[.86,.26],{steps:4,r:.04,spread:.018,seed:21});
  }else if(map==='waterfallgorge'){
    addRidge([.12,.08],[.41,.19],{steps:5,r:.038,wobble:.01,seed:91});
    addRidge([.59,.19],[.88,.08],{steps:5,r:.038,wobble:.01,seed:92});
    addRidge([.40,.57],[.41,.66],{steps:3,r:.03,wobble:.006,seed:93});
    addRidge([.60,.57],[.59,.66],{steps:3,r:.03,wobble:.006,seed:94});
    addForestBelt([.10,.26],[.26,.46],{steps:4,r:.042,spread:.02,seed:95});
    addForestBelt([.74,.56],[.90,.78],{steps:4,r:.042,spread:.02,seed:96});
    minerals.push({x:.38,y:.31,type:'gold'},{x:.62,y:.31,type:'gold'},{x:.37,y:.70,type:'stone'},{x:.63,y:.70,type:'stone'});
  }else if(map==='frostfallsiege'){
    addRidge([.10,.08],[.39,.20],{steps:5,r:.04,wobble:.01,seed:97});
    addRidge([.56,.20],[.88,.08],{steps:5,r:.04,wobble:.01,seed:98});
    addMassif(.14,.82,.06);addMassif(.86,.18,.06);
    addForestBelt([.12,.28],[.24,.56],{steps:4,r:.04,spread:.02,seed:99});
    addForestBelt([.74,.44],[.88,.76],{steps:4,r:.04,spread:.02,seed:100});
    minerals.push({x:.36,y:.40,type:'gold'},{x:.62,y:.60,type:'gold'},{x:.35,y:.62,type:'stone'},{x:.64,y:.38,type:'stone'});
  }else if(map==='deepwoodravine'){
    const passes=[[.5,.5,.07],[.48,.22,.06],[.52,.78,.06]];
    addRidge([.42,.07],[.44,.93],{steps:12,r:.034,wobble:.012,seed:101,passes});
    addRidge([.58,.07],[.56,.93],{steps:12,r:.034,wobble:.012,seed:102,passes});
    addForestBelt([.08,.16],[.30,.36],{steps:5,r:.045,spread:.025,seed:103});
    addForestBelt([.70,.64],[.92,.84],{steps:5,r:.045,spread:.025,seed:104});
    addForestBelt([.10,.68],[.28,.88],{steps:4,r:.044,spread:.022,seed:105});
    addForestBelt([.72,.12],[.90,.32],{steps:4,r:.044,spread:.022,seed:106});
    minerals.push({x:.38,y:.35,type:'gold'},{x:.62,y:.65,type:'gold'},{x:.38,y:.65,type:'stone'},{x:.62,y:.35,type:'stone'});
  }else if(map==='templelagoon'){
    addMassif(.22,.14,.055);addMassif(.38,.12,.048);addMassif(.84,.82,.055);
    addForestBelt([.10,.30],[.20,.78],{steps:5,r:.044,spread:.022,seed:107});
    addForestBelt([.42,.18],[.54,.44],{steps:4,r:.04,spread:.018,seed:108});
    addForestBelt([.76,.18],[.88,.66],{steps:5,r:.044,spread:.022,seed:109});
    minerals.push({x:.46,y:.38,type:'gold'},{x:.52,y:.62,type:'gold'},{x:.45,y:.58,type:'stone'},{x:.54,y:.40,type:'stone'});
  }else if(map==='ironfall'){
    const passes=[[.44,.5,.08]];
    addRidge([.38,.05],[.40,.95],{steps:14,r:.04,wobble:.012,seed:110,passes});
    addRidge([.49,.05],[.48,.95],{steps:14,r:.034,wobble:.010,seed:111,passes});
    addForestBelt([.10,.16],[.26,.36],{steps:4,r:.042,spread:.02,seed:112});
    addForestBelt([.10,.64],[.26,.84],{steps:4,r:.042,spread:.02,seed:113});
    addForestBelt([.74,.14],[.90,.34],{steps:4,r:.04,spread:.02,seed:114});
    minerals.push({x:.26,y:.36,type:'gold'},{x:.26,y:.64,type:'gold'},{x:.22,y:.50,type:'stone'},{x:.68,y:.36,type:'gold'},{x:.68,y:.64,type:'gold'});
  }else{
    // Open classic / river / coast maps get subtle natural woodland clusters
    const hasWater=waterChannels(map).length>0;
    const spots=hasWater
      ?[[.14,.18,.04],[.16,.78,.042],[.84,.22,.042],[.86,.82,.04],[.22,.50,.034],[.78,.50,.034]]
      :[[.18,.20,.042],[.82,.80,.042],[.20,.78,.04],[.80,.22,.04],[.48,.16,.036],[.52,.84,.036]];
    for(const [x,y,r] of spots){
      forests.push({x,y,r});
      forests.push({x:x+.028,y:y-.018,r:r*.76});
    }
  }
  return {mountains,forests,minerals};
}

/**
 * Draws a rich, accurate Age of Empires-style cartographic battle preview on a 2D canvas.
 * Preserves exact channel stroke count (1 ctx.stroke() per water channel) for test parity
 * by rendering all hills, forests, ridges, peaks, bridges, and frames via ctx.fill().
 */
export function drawBattlePreviewCanvas(ctx,{map,worldSize=480,seed=2026,size=260}){
  const biome=terrainBiome(map),trees=treePalette(map);
  const snow=isSnowBiome(map),volcanic=isVolcanicBiome(map),arid=isAridBiome(map);
  const phase=terrainPhase(seed);

  // 1. Base biome parchment ground
  ctx.fillStyle=map==='winter'?'#b7c4b2':biome.map;
  ctx.fillRect(0,0,size,size);

  // 2. Smooth seeded topographic hill-relief shading (fine 56x56 silk-smooth contours, NW sun -> SE shadow)
  const cells=56,step=size/cells;
  for(let gy=0;gy<cells;gy++)for(let gx=0;gx<cells;gx++){
    const wx=((gx+.5)/cells-.5)*worldSize,wz=((gy+.5)/cells-.5)*worldSize;
    const h=terrainRelief(map,wx,wz,phase);
    const hNW=terrainRelief(map,wx-12,wz-12,phase);
    const slope=Math.max(-1,Math.min(1,(h-hNW)*.24));
    if(Math.abs(slope)<.05)continue;
    if(slope>0){
      ctx.fillStyle=snow?`rgba(255,255,255,${(slope*.17).toFixed(3)})`:`rgba(248,236,196,${(slope*.13).toFixed(3)})`;
    }else{
      ctx.fillStyle=volcanic?`rgba(10,8,8,${(-slope*.22).toFixed(3)})`:`rgba(14,24,18,${(-slope*.16).toFixed(3)})`;
    }
    ctx.fillRect(gx*step,gy*step,step+.7,step+.7);
  }

  const carto=mapCartography(map);

  // 3. Woodland tracts & glade canopies (soft ground shadow + organic foliage crown blobs)
  const canopyBase=trees.minimap||'#264c30';
  for(const f of carto.forests){
    const fx=f.x*size,fy=f.y*size,fr=f.r*size;
    ctx.fillStyle='rgba(12,24,16,0.22)';
    ctx.beginPath();ctx.arc(fx+1.5,fy+2,fr*1.04,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=canopyBase;
    ctx.beginPath();ctx.arc(fx,fy,fr,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=snow?'rgba(220,236,242,0.24)':'rgba(140,188,108,0.18)';
    ctx.beginPath();ctx.arc(fx-fr*.22,fy-fr*.22,fr*.58,0,Math.PI*2);ctx.fill();
  }

  // 4. Authoritative water channels (exact 1 stroke per channel!) + shallow fords + stone/timber bridges
  const channels=waterChannels(map);
  const jungle=isJungleBiome(map);
  if(channels.length){
    const previewScale=size/worldSize;
    ctx.strokeStyle=volcanic?'#8a6a54':snow?'#7ca6b8':jungle?'#48c2b8':'#65a2ad';
    for(const channel of channels){
      ctx.lineWidth=Math.max(4,channel.width*2*previewScale);
      ctx.beginPath();
      for(let y=0;y<=size;y+=4){
        const z=(y/size-.5)*worldSize;
        const x=((channel.center+Math.sin(z*channel.frequency)*channel.bend)/worldSize+.5)*size;
        if(!y)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
    // Crossable shallow river fords (warm sandy shoal overlay)
    for(const ford of waterFords(map)){
      const ch=channels.find(c=>c.center===ford.center);
      const mid=ch?ch.center+Math.sin(ford.z*ch.frequency)*ch.bend:ford.center;
      const fx=(mid/worldSize+.5)*size,fy=(ford.z/worldSize+.5)*size;
      const fw=Math.max(8,ford.halfLength*1.6*previewScale),fh=Math.max(5,ford.halfWidth*1.4*previewScale);
      ctx.fillStyle='rgba(222,208,164,0.78)';
      ctx.fillRect(fx-fw*.5,fy-fh*.5,fw,fh);
    }
  }
  // Stone & timber bridge crossings drawn with fillRect (zero extra strokes — works on ravine maps too!)
  const bridges=bridgeSpans(map);
  if(bridges.length){
    const previewScale=size/worldSize;
    for(const b of bridges){
      const bx=(b.center/worldSize+.5)*size,by=(spanZ(b)/worldSize+.5)*size;
      const bw=Math.max(10,(b.halfLength*2)*previewScale+4),bh=b.style==='timber'?4.5:6;
      ctx.fillStyle='rgba(24,20,16,0.45)';
      ctx.fillRect(bx-bw*.5,by-bh*.5+1.5,bw,bh);
      ctx.fillStyle=b.style==='timber'?'#9b7044':'#c9be9e';
      ctx.fillRect(bx-bw*.5,by-bh*.5,bw,bh);
      ctx.fillStyle=b.style==='timber'?'#c79a66':'#efe6cb';
      ctx.fillRect(bx-bw*.5+1,by-bh*.5+1,bw-2,2);
    }
  }

  // 5. Sweeping mountain ranges, cliff ridges & alpine peaks (filled polygons — zero strokes!)
  const rockShadow=volcanic?'rgba(14,10,10,0.68)':snow?'rgba(48,66,78,0.44)':arid?'rgba(96,62,32,0.46)':'rgba(32,38,34,0.52)';
  const rockBody=volcanic?'#3b3330':snow?'#8fa5b2':arid?'#a97c4c':'#6d7268';
  const rockCap=volcanic?'#645750':snow?'#edf5f8':arid?'#d9b47a':'#b6baab';
  for(const m of carto.mountains){
    const mx=m.x*size,my=m.y*size,mr=m.r*size;
    ctx.fillStyle=rockShadow;
    ctx.beginPath();ctx.arc(mx+1.6,my+2.2,mr*1.08,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=rockBody;
    ctx.beginPath();ctx.arc(mx,my,mr*.92,0,Math.PI*2);ctx.fill();
    if(m.peak){
      // Stylized AoE cartographic alpine peak triangle (lit NW face + darker SE face)
      const h=mr*1.32,w=mr*1.06;
      ctx.fillStyle=rockCap;
      ctx.beginPath();ctx.moveTo(mx,my-h);ctx.lineTo(mx-w,my+mr*.46);ctx.lineTo(mx+mr*.12,my+mr*.46);ctx.closePath?.();ctx.fill();
      ctx.fillStyle=rockShadow;
      ctx.beginPath();ctx.moveTo(mx,my-h);ctx.lineTo(mx+w,my+mr*.46);ctx.lineTo(mx+mr*.12,my+mr*.46);ctx.closePath?.();ctx.fill();
    }
  }

  // 6. Contested gold & stone basins (subtle amber/slate pips)
  for(const res of carto.minerals){
    const rx=res.x*size,ry=res.y*size;
    ctx.fillStyle=res.type==='gold'?'#e7bd56':'#cbd0c8';
    ctx.beginPath();ctx.arc(rx,ry,2.8,0,Math.PI*2);ctx.fill();
  }

  // 7. Subtle royal war-map parchment border frame & cardinal compass ticks
  ctx.fillStyle='rgba(12,20,16,0.28)';
  ctx.fillRect(0,0,size,3);ctx.fillRect(0,size-3,size,3);
  ctx.fillRect(0,0,3,size);ctx.fillRect(size-3,0,3,size);
  ctx.fillStyle='rgba(232,202,130,0.55)';
  ctx.fillRect(size*.5-1,2,2,5);ctx.fillRect(size*.5-1,size-7,2,5);
  ctx.fillRect(2,size*.5-1,5,2);ctx.fillRect(size-7,size*.5-1,5,2);
}

/**
 * Generates a crisp 48x48 inline SVG mini cartographic map thumbnail for Skirmish Hub biome cards,
 * showing each map's real biome tone, rivers/bridges, woodland glades, and mountain ridges.
 */
export function mapPreviewSvg(map){
  const biome=terrainBiome(map),trees=treePalette(map),carto=mapCartography(map);
  const snow=isSnowBiome(map),volcanic=isVolcanicBiome(map),arid=isAridBiome(map);
  const bg=map==='winter'?'#b7c4b2':biome.map;
  const parts=[];
  parts.push(`<rect width="48" height="48" fill="${bg}"/>`);
  // Subtle NW-to-SE relief sheen
  parts.push(`<polygon points="0,0 48,0 0,48" fill="${snow?'rgba(255,255,255,0.16)':'rgba(255,244,205,0.10)'}"/>`);
  parts.push(`<polygon points="48,48 48,0 0,48" fill="rgba(10,18,14,0.14)"/>`);

  // Woodland glades & forest belts
  const treeCol=trees.minimap||'#264c30';
  for(const f of carto.forests){
    parts.push(`<circle cx="${(f.x*48).toFixed(1)}" cy="${(f.y*48).toFixed(1)}" r="${Math.max(1.8,f.r*48).toFixed(1)}" fill="${treeCol}" opacity="0.82"/>`);
  }

  // Water channels & stone/timber bridges
  const channels=waterChannels(map),jungle=isJungleBiome(map),wSize=160;
  if(channels.length){
    const waterCol=volcanic?'#8a6a54':snow?'#7ca6b8':jungle?'#48c2b8':'#5ea0ad';
    for(const ch of channels){
      const pts=[];
      for(let y=0;y<=48;y+=6){
        const z=(y/48-.5)*wSize;
        const x=((ch.center+Math.sin(z*ch.frequency)*ch.bend)/wSize+.5)*48;
        pts.push(`${x.toFixed(1)},${y}`);
      }
      const sw=Math.max(2.6,(ch.width*2/wSize)*48);
      parts.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${waterCol}" stroke-width="${sw.toFixed(1)}" stroke-linecap="round"/>`);
    }
  }
  for(const b of bridgeSpans(map)){
    const bx=(b.center/wSize+.5)*48,by=(spanZ(b)/wSize+.5)*48,bw=Math.max(4.5,(b.halfLength*2/wSize)*48+2);
    parts.push(`<rect x="${(bx-bw/2).toFixed(1)}" y="${(by-1.6).toFixed(1)}" width="${bw.toFixed(1)}" height="3.2" rx="0.6" fill="${b.style==='timber'?'#b58754':'#e2d7b4'}"/>`);
  }

  // Mountain ranges & peaks
  const rockCol=volcanic?'#2c2523':snow?'#7e96a6':arid?'#9e6e3e':'#585e54';
  const peakCol=volcanic?'#685a53':snow?'#f0f7fa':arid?'#ddb97f':'#bfc4b5';
  for(const m of carto.mountains){
    const mx=m.x*48,my=m.y*48,mr=Math.max(1.6,m.r*48);
    parts.push(`<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="${mr.toFixed(1)}" fill="${rockCol}" opacity="0.88"/>`);
    if(m.peak){
      parts.push(`<polygon points="${mx.toFixed(1)},${(my-mr*1.25).toFixed(1)} ${(mx-mr*.95).toFixed(1)},${(my+mr*.45).toFixed(1)} ${(mx+mr*.95).toFixed(1)},${(my+mr*.45).toFixed(1)}" fill="${peakCol}" opacity="0.92"/>`);
    }
  }

  // Contested gold/stone spots
  for(const r of carto.minerals){
    parts.push(`<circle cx="${(r.x*48).toFixed(1)}" cy="${(r.y*48).toFixed(1)}" r="1.2" fill="${r.type==='gold'?'#f0c455':'#d8dcd4'}"/>`);
  }

  return `<svg class="biome-preview-svg" viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">${parts.join('')}</svg>`;
}
