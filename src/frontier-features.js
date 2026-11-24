import * as THREE from 'three';
import {standardMaterial} from './render-runtime.js';
import {seededRandom} from './data.js';
import {waterChannels,waterFords} from './map-water.js';
import {bridgeSpans,spanZ} from './bridge-layout.js';
import {isSnowBiome,isJungleBiome,hasWaterfallBiome} from './terrain-biomes.js';
import {shadeBattlefieldFog} from './fog-surface.js';
import {cloneEpicProp,epicPropRoot} from './epic-props-art.js';
import {crossedPlumeGeometry,fireTongueTexture,smokePlumeTexture} from './battle-effects.js';

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

/** Seamless scrolling whitewater texture for Blender 3D waterfalls (WebGL 2 & WebGPU identical). */
function waterfallFlowTexture(size=128){
  const data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++){
    const v=y/size;
    for(let x=0;x<size;x++){
      const u=x/size;
      const s1=Math.sin((u*6.0+Math.sin(v*Math.PI*2)*.06)*Math.PI*2)*.5+.5;
      const s2=Math.sin((u*13.0-v*2.0)*Math.PI*2)*.5+.5;
      const s3=Math.sin((u*21.0+v*5.0)*Math.PI*2)*.5+.5;
      const froth=clamp(Math.pow(s1*.55+s2*.30+s3*.25,1.25),0,1);
      const streak=clamp(Math.pow(Math.sin((u*9.0)*Math.PI*2)*.5+.5,2.2)*.65+froth*.55,0,1);
      const r=Math.round(clamp(125+streak*130,0,255));
      const g=Math.round(clamp(206+streak*49,0,255));
      const b=Math.round(clamp(232+streak*23,0,255));
      const a=Math.round(clamp(210+streak*45,0,255));
      const i=(y*size+x)*4;
      data[i]=r;data[i+1]=g;data[i+2]=b;data[i+3]=a;
    }
  }
  const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.wrapS=THREE.RepeatWrapping;
  tex.wrapT=THREE.RepeatWrapping;
  tex.repeat.set(1.6,1.8);
  tex.magFilter=THREE.LinearFilter;
  tex.minFilter=THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps=true;
  tex.needsUpdate=true;
  return tex;
}

/** Soft billowing waterfall mist cloud texture. */
function mistPlumeTexture(size=64){
  const data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++){
    const v=(y/(size-1))*2-1;
    for(let x=0;x<size;x++){
      const u=(x/(size-1))*2-1;
      const d=Math.min(Math.hypot(u,v)*.94,Math.hypot(u-.24,v+.14)*1.12,Math.hypot(u+.25,v-.12)*1.12);
      const soft=Math.pow(clamp(1-d/.95,0,1),1.75);
      const i=(y*size+x)*4;
      data[i]=238;data[i+1]=248;data[i+2]=255;data[i+3]=Math.round(soft*195);
    }
  }
  const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.magFilter=THREE.LinearFilter;
  tex.minFilter=THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps=true;
  tex.needsUpdate=true;
  return tex;
}

function bindPropMaterials(view,root,extra={}){
  const fogMats=[];
  const cleanVertexRoles=new Set(['ice','foam','fabric','ember']);
  root.traverse(part=>{
    if(!part.isMesh)return;
    const role=part.userData?.assetMaterial||'rock';
    let mat=extra[role];
    if(!mat){
      if(cleanVertexRoles.has(role)){
        mat=standardMaterial({
          color:0xffffff,
          roughness:role==='ice'?.26:role==='foam'?.48:role==='fabric'?.84:.42,
          metalness:role==='ice'?.06:0,
          vertexColors:Boolean(part.geometry?.attributes?.color),
        });
      }else{
        const base=view.materials[role]||view.materials.rock||view.materials.stone;
        mat=base?base.clone():standardMaterial({color:0xffffff,roughness:.88});
        mat.color.setHex(0xffffff);
        mat.vertexColors=Boolean(part.geometry?.attributes?.color);
      }
      if(role==='foam'){mat.transparent=true;mat.opacity=.92;}
      if(role==='ember'){mat.emissive=new THREE.Color(0xff5a12);mat.emissiveIntensity=2.1;}
      shadeBattlefieldFog(mat,view);
      fogMats.push(mat);
    }
    part.material=mat;
    part.castShadow=role!=='foam'&&role!=='waterSheet'&&role!=='ice';
    part.receiveShadow=true;
  });
  return fogMats;
}

/**
 * Builds all Epic Frontier world features onto view.terrain:
 *  - Blender 3D single-drop & two-tier animated Waterfalls + billowing mist pools
 *  - River rapid boulders & shallow ford stepping foam
 *  - Drifting winter/alpine river Ice Floes (animated gentle downstream drift!)
 *  - Ancient stepped mossy Jungle Temples & ruined temple shrines
 *  - Living Battlefield props: war-camp Campfires (live flickering flames + smoke wisps),
 *    burning chokepoint barricades (flames + rising dark battle smoke),
 *    defensive wooden Stakes, war-camp Tents, and Supply Crates.
 */
export function buildFrontierFeatures(view){
  const land=view.landscape,sim=view.sim;
  if(!land||!sim)return;
  const map=land.map,half=land.half,rng=seededRandom(land.seed+5501);
  const low=view.settings?.quality==='low';
  const group=new THREE.Group();
  group.name='Epic frontier world features';
  view.terrain.add(group);

  const waterTex=view.epicWaterTex??=waterfallFlowTexture();
  const mistTex=view.epicMistTex??=mistPlumeTexture();
  const fireTex=view.epicFireTex??=fireTongueTexture();
  const smokeTex=view.epicSmokeTex??=smokePlumeTexture();

  const sheetMat=shadeBattlefieldFog(standardMaterial({
    map:waterTex,color:0xffffff,roughness:.18,metalness:.04,
    transparent:true,opacity:.92,side:THREE.DoubleSide,vertexColors:true,
  }),view);
  const mistMat=shadeBattlefieldFog(new THREE.MeshBasicMaterial({
    map:mistTex,color:0xeaf6ff,transparent:true,opacity:.56,depthWrite:false,side:THREE.DoubleSide,
  }),view);
  const fireMat=shadeBattlefieldFog(new THREE.MeshBasicMaterial({
    map:fireTex,color:0xff8e2c,transparent:true,opacity:.88,depthWrite:false,side:THREE.DoubleSide,
  }),view);
  const smokeMat=shadeBattlefieldFog(new THREE.MeshBasicMaterial({
    map:smokeTex,color:0x4b4642,transparent:true,opacity:.52,depthWrite:false,side:THREE.DoubleSide,
  }),view);
  const campSmokeMat=shadeBattlefieldFog(new THREE.MeshBasicMaterial({
    map:smokeTex,color:0xc8cac6,transparent:true,opacity:.38,depthWrite:false,side:THREE.DoubleSide,
  }),view);

  const plumeGeo=view.epicPlumeGeo??=crossedPlumeGeometry(1.1,1.6,.75);
  const mistGeo=view.epicMistGeo??=crossedPlumeGeometry(2.6,1.9,.85);

  const state={
    group,
    waterTex,
    mistNodes:[],
    iceFloes:[],
    flames:[],
    smokes:[],
    waterfalls:[],
    props:[],
  };

  // 1. ANIMATED WATERFALLS AT RIVER HEADWATERS (Single-drop & Two-tier Blender 3D cascades!)
  const channels=waterChannels(map);
  const wantsWaterfall=hasWaterfallBiome(map)||map==='valley'||map==='riverland'||map==='threecrowns';
  if(wantsWaterfall&&channels.length&&epicPropRoot('waterfall:single')){
    const wfChannels=map==='templelagoon'?[channels[0]]:channels.slice(0,2);
    wfChannels.forEach((ch,idx)=>{
      const wfZ=-half+12;
      const wfX=ch.center+Math.sin(wfZ*ch.frequency)*ch.bend;
      const tiered=(map==='waterfallgorge'||map==='ironfall'||(idx===0&&map==='valley'));
      const wf=cloneEpicProp(tiered?'waterfall:tiered':'waterfall:single');
      if(!wf)return;
      const scale=Math.max(1.05,Math.min(1.65,(ch.width/4.8)*1.18));
      wf.position.set(wfX,0.02,wfZ);
      wf.scale.set(scale,scale*(tiered?1.12:1.08),scale);
      wf.rotation.y=0; // water pours +Z downstream!
      bindPropMaterials(view,wf,{waterSheet:sheetMat});
      group.add(wf);
      state.waterfalls.push(wf);

      // Swirling rising mist plumes billowing from plunge pool!
      const mistCount=low?2:(tiered?7:5);
      const splashZ=wfZ+(tiered?3.6:2.4)*scale;
      for(let m=0;m<mistCount;m++){
        const plume=new THREE.Mesh(mistGeo,mistMat);
        const u=mistCount===1?0:(m/Math.max(1,mistCount-1))*2-1;
        plume.position.set(wfX+u*3.6*scale,0.45,splashZ+Math.abs(u)*.9);
        const s=(1.05+(1-Math.abs(u))*.55)*scale;
        plume.scale.set(s,s*.85,s);
        plume.userData={baseX:plume.position.x,baseY:.35,baseZ:plume.position.z,baseScale:s,phase:m*1.17+idx*2.3};
        group.add(plume);
        state.mistNodes.push(plume);
      }
    });
  }

  // 2. RIVER RAPIDS BOULDERS & SHALLOW FORD FOAM MARKERS
  if(channels.length&&epicPropRoot('rapid:rock')){
    const fords=waterFords(map);
    const spans=bridgeSpans(map);
    const isRapidMap=hasWaterfallBiome(map)||map==='valley'||map==='rivers'||map==='riverland'||map==='threecrowns';
    if(isRapidMap){
      for(const ch of channels){
        const step=low?26:16;
        for(let z=-half+22;z<half-16;z+=step){
          if(spans.some(s=>Math.abs(z-spanZ(s))<12))continue;
          const mid=ch.center+Math.sin(z*ch.frequency)*ch.bend;
          const nearFord=fords.some(f=>Math.abs(z-f.z)<f.halfWidth+3);
          const side=(rng()<.5?-1:1)*(nearFord?ch.width*.72:(ch.width*.38+rng()*ch.width*.36));
          const rx=mid+side,rz=z+(rng()-.5)*4;
          const rock=cloneEpicProp('rapid:rock');
          if(!rock)continue;
          const s=.65+rng()*.55;
          rock.position.set(rx,0.02,rz);
          rock.rotation.y=rng()*Math.PI*2;
          rock.scale.set(s,s*.9,s);
          bindPropMaterials(view,rock);
          group.add(rock);
          state.props.push(rock);
        }
      }
    }
    // Line shallow ford flanks with stepping boulders so players spot walkable fords immediately!
    for(const ford of fords){
      const ch=channels.find(c=>c.center===ford.center);
      const mid=ch?ch.center+Math.sin(ford.z*ch.frequency)*ch.bend:ford.center;
      for(const sideZ of [-ford.halfWidth-1.1,ford.halfWidth+1.1]){
        for(const offX of [-ch.width*.65,0,ch.width*.65]){
          const rock=cloneEpicProp('rapid:rock');
          if(!rock)continue;
          rock.position.set(mid+offX,0.03,ford.z+sideZ);
          rock.rotation.y=rng()*Math.PI*2;
          rock.scale.set(.58,.50,.58);
          bindPropMaterials(view,rock);
          group.add(rock);
          state.props.push(rock);
        }
      }
    }
  }

  // 3. DRIFTING GLACIAL ICE FLOES ON WINTER / ALPINE RIVERS (Image 7!)
  if(isSnowBiome(map)&&channels.length&&epicPropRoot('ice:floe')){
    const spans=bridgeSpans(map);
    for(const ch of channels){
      const count=low?10:22;
      for(let i=0;i<count;i++){
        const z=-half+18+(i/count)*(land.worldSize-36);
        const mid=ch.center+Math.sin(z*ch.frequency)*ch.bend;
        const off=(rng()-.5)*ch.width*1.18;
        const floe=cloneEpicProp('ice:floe');
        if(!floe)continue;
        const s=.65+rng()*.85;
        floe.position.set(mid+off,0.05,z);
        floe.rotation.y=rng()*Math.PI*2;
        floe.scale.set(s,s*.85,s*(.85+rng()*.3));
        bindPropMaterials(view,floe);
        group.add(floe);
        state.iceFloes.push({
          mesh:floe,channel:ch,offset:off,z,speed:.45+rng()*.45,
          phase:rng()*Math.PI*2,minZ:-half+16,maxZ:half-14,spans,
        });
      }
    }
  }

  // 4. ANCIENT STEPPED MOSSY JUNGLE TEMPLES & SHRINE GATEWAYS (Image 9!)
  if(isJungleBiome(map)&&epicPropRoot('temple:jungle')){
    const settlements=land.settlements||[];
    const templeSpots=[
      {x:0,z:-half*.52,key:'temple:jungle',s:1.25,rot:0},
      {x:half*.54,z:-half*.46,key:'temple:jungle',s:1.1,rot:-.45},
      {x:-half*.52,z:half*.48,key:'temple:ruin',s:1.15,rot:.35},
      {x:half*.12,z:half*.46,key:'temple:ruin',s:1.1,rot:-.25},
    ];
    for(const spot of templeSpots){
      if(Math.abs(spot.x)>half-14||Math.abs(spot.z)>half-14||sim.isWater(spot.x,spot.z))continue;
      if(settlements.some(s=>Math.hypot(s.x-spot.x,s.z-spot.z)<24))continue;
      if(sim.entities.some(e=>e.hp>0&&e.kind==='building'&&Math.hypot(e.x-spot.x,e.z-spot.z)<e.r+8))continue;
      const t=cloneEpicProp(spot.key);
      if(!t)continue;
      const y=land.surfaceHeightAt(spot.x,spot.z);
      t.position.set(spot.x,y-.08,spot.z);
      t.rotation.y=spot.rot;
      t.scale.setScalar(spot.s);
      bindPropMaterials(view,t);
      group.add(t);
      state.props.push(t);
    }
  }

  // 5. LIVING BATTLEFIELD PROPS — CAMPFIRES, BURNING CHOKEPOINTS, STAKES, TENTS & SUPPLY CRATES!
  // Authoritative props can be placed explicitly by scenarios (`sim.battlefieldProps`) AND
  // automatically around contested bridges, camps, and military outposts!
  const propSpecs=[...(sim.battlefieldProps||[])];
  const autoBridgeBattle=hasWaterfallBiome(map)||map==='deepwoodravine'||map==='ironpass'||map==='sunderedpass'||map==='threecrowns';
  if(autoBridgeBattle){
    for(const span of bridgeSpans(map)){
      const cz=spanZ(span);
      // Defensive stakes flanking bridgeheads + smoldering contested braziers/barricades (Images 4, 6, 7, 10!)
      for(const side of [-1,1]){
        const bx=span.center+side*(span.halfLength+4.5);
        for(const dz of [-7.2,7.2]){
          if(!sim.isWater(bx,cz+dz))propSpecs.push({kind:'stakes',x:bx,z:cz+dz,rot:side>0?Math.PI*.5:-Math.PI*.5});
        }
        if(!low){
          const fx=span.center+side*(span.halfLength+3.2),fz=cz+(side>0?-5.4:5.4);
          if(!sim.isWater(fx,fz))propSpecs.push({kind:'brazier',x:fx,z:fz,burning:true});
        }
      }
    }
  }
  // Auto-add cozy campfires + crates near barracks/camps/mines so settlements feel alive (Images 7, 8, 11!)
  if(!low){
    const seenCampfire=new Set();
    for(const b of sim.entities){
      if(b.hp<=0||b.kind!=='building'||!['barracks','camp','workshop','towncenter'].includes(b.type))continue;
      const key=`${b.owner}:${b.type}`;
      if(seenCampfire.has(key))continue;
      seenCampfire.add(key);
      const ang=(b.owner*1.7+b.id*.9)%(Math.PI*2);
      const px=b.x+Math.cos(ang)*(b.r+3.0),pz=b.z+Math.sin(ang)*(b.r+3.0);
      if(Math.abs(px)<half-6&&Math.abs(pz)<half-6&&!sim.isWater(px,pz)&&!sim.entities.some(e=>e.hp>0&&e.kind==='building'&&Math.hypot(e.x-px,e.z-pz)<e.r+2.2)){
        propSpecs.push({kind:b.type==='camp'?'crates':'campfire',x:px,z:pz,rot:ang});
      }
    }
  }

  for(const spec of propSpecs){
    if(Math.abs(spec.x)>half-3||Math.abs(spec.z)>half-3||sim.isWater(spec.x,spec.z))continue;
    const y=land.surfaceHeightAt(spec.x,spec.z);
    const keyMap={stakes:'prop:stakes',campfire:'prop:campfire',brazier:'prop:campfire',tent:'prop:tent',crates:'prop:crates',temple:'temple:jungle',ruin:'temple:ruin'};
    const assetKey=keyMap[spec.kind];
    if(assetKey&&epicPropRoot(assetKey)){
      const obj=cloneEpicProp(assetKey);
      if(obj){
        obj.position.set(spec.x,y-.03,spec.z);
        obj.rotation.y=spec.rot||0;
        const sc=spec.scale||1;
        obj.scale.setScalar(sc);
        bindPropMaterials(view,obj);
        group.add(obj);
        state.props.push(obj);
      }
    }
    if(spec.kind==='campfire'||spec.kind==='brazier'||spec.burning){
      const heavy=Boolean(spec.burning);
      // Animated crackling fire plume
      const flame=new THREE.Mesh(plumeGeo,fireMat);
      flame.position.set(spec.x,y+(heavy?.28:.14),spec.z);
      const fs=heavy?1.08:.62;
      flame.scale.set(fs,fs*1.18,fs);
      flame.renderOrder=3;
      flame.userData={baseScale:fs,phase:rng()*10,heavy};
      group.add(flame);
      state.flames.push(flame);

      // Rising smoke wisps (dark battle smoke for burning barricades, pale cozy woodsmoke for campfires!)
      const puffs=low?1:(heavy?3:2);
      for(let p=0;p<puffs;p++){
        const smoke=new THREE.Mesh(plumeGeo,heavy?smokeMat:campSmokeMat);
        smoke.position.set(spec.x,y+.8,spec.z);
        smoke.userData={
          baseX:spec.x,baseY:y+.75,baseZ:spec.z,
          phase:rng()*6.28+(p/puffs)*Math.PI*2,
          rise:heavy?7.2:4.6,
          baseScale:heavy?1.15:.68,
          heavy,
        };
        group.add(smoke);
        state.smokes.push(smoke);
      }
    }
  }

  view.frontierFeatures=state;
  return state;
}

export function updateFrontierFeatures(view){
  const state=view.frontierFeatures;
  if(!state)return;
  const t=view.clock||0;
  const reduced=Boolean(view.settings?.reducedMotion);

  // Scroll waterfall rushing whitewater sheet continuously downward!
  if(state.waterTex&&!reduced){
    state.waterTex.offset.y=(t*1.15)%1;
  }

  // Swirl and breathe plunge-pool mist plumes!
  for(const plume of state.mistNodes){
    const d=plume.userData;
    const cycle=(t*.62+d.phase)%1;
    plume.position.set(
      d.baseX+Math.sin(t*.9+d.phase)*.45,
      d.baseY+cycle*1.55,
      d.baseZ+cycle*.85
    );
    const grow=d.baseScale*(.78+cycle*.52);
    plume.scale.set(grow,grow*.78,grow);
    plume.rotation.y=d.phase+t*.35;
  }

  // Gently drift glacial ice floes downstream along winter rivers!
  if(!reduced&&state.iceFloes.length){
    for(const item of state.iceFloes){
      item.z+=item.speed*.016;
      if(item.z>item.maxZ)item.z=item.minZ;
      const mid=item.channel.center+Math.sin(item.z*item.channel.frequency)*item.channel.bend;
      const bob=Math.sin(t*1.7+item.phase)*.035;
      const underBridge=item.spans.some(s=>Math.abs(item.z-spanZ(s))<4.5);
      item.mesh.visible=!underBridge;
      item.mesh.position.set(mid+item.offset,0.04+bob,item.z);
      item.mesh.rotation.y+=0.0015;
    }
  }

  // Flicker campfire & barricade flames!
  for(const flame of state.flames){
    const d=flame.userData;
    const flicker=.88+Math.sin(t*13.5+d.phase)*.14+Math.cos(t*21.3+d.phase*1.7)*.09;
    flame.scale.set(d.baseScale*flicker,d.baseScale*(1.05+flicker*.22),d.baseScale*flicker);
    flame.rotation.y=t*(d.heavy?1.2:.8)+d.phase;
  }

  // Drift rising campfire & dark battle smoke plumes smoothly upward with the breeze!
  for(const smoke of state.smokes){
    const d=smoke.userData;
    const cycle=((t*(d.heavy?.26:.20)+d.phase*.31)%1+1)%1;
    const driftX=cycle*(d.heavy?2.4:1.3)+Math.sin(t*1.3+d.phase)*.28;
    const driftZ=cycle*(d.heavy?1.4:.8);
    smoke.position.set(d.baseX+driftX,d.baseY+cycle*d.rise,d.baseZ+driftZ);
    const sc=d.baseScale*(.65+cycle*1.35);
    smoke.scale.set(sc,sc*.95,sc);
    smoke.rotation.y=d.phase+t*.42;
  }
}
