import * as THREE from 'three';
import {BUILDINGS,UNITS} from './data.js';
import {renderPosition} from './motion-smoothing.js';
import {markInstancePrefix} from './render-batches.js';
import {DECAL_COLORS} from './tactical-ux.js';

const UP=new THREE.Vector3(0,1,0);
const MAX_RINGS=256;
const MAX_PATH_DOTS=96;
const MAX_RALLY_FLAGS=24;
const RANGE_SEGMENTS=72;

export const AFFILIATION_COLORS=Object.freeze({
  mine:0x7cf0bc,
  mineBuilding:0x8be2b8,
  ally:0x5ec6ff,
  enemy:0xff645c,
  resource:0xf4c55b,
  shrine:0xf6de7e,
});

export function selectionAffiliation(sim,e){
  if(!e)return 'resource';
  if(e.kind==='resource')return 'resource';
  if(e.kind==='shrine'){
    if(e.owner===0)return 'mine';
    if(e.owner>=0&&sim?.hostile?.(0,e.owner))return 'enemy';
    if(e.owner>=0&&sim?.allied?.(0,e.owner))return 'ally';
    return 'shrine';
  }
  if(e.owner===0)return 'mine';
  if(e.owner>=0&&sim?.allied?.(0,e.owner))return 'ally';
  if(e.owner>=0)return 'enemy';
  return 'resource';
}

export function selectionColorHex(sim,e,isBuilding=false){
  const aff=selectionAffiliation(sim,e);
  if(aff==='mine')return isBuilding?AFFILIATION_COLORS.mineBuilding:AFFILIATION_COLORS.mine;
  return AFFILIATION_COLORS[aff]??AFFILIATION_COLORS.resource;
}

/** Attack or capture radius shown on the battlefield when an entity is selected. */
export function tacticalRangeRadius(sim,e){
  if(!e||e.hp<=0)return 0;
  if(e.kind==='shrine')return 7;
  if(e.kind==='building'){
    const def=BUILDINGS[e.type];
    if(!def?.range||e.progress<1)return 0;
    return def.range;
  }
  if(e.kind==='unit'&&(e.type==='catapult'||e.type==='trebuchet'||e.type==='warship')){
    const def=UNITS[e.type];
    const p=sim?.players?.[e.owner];
    return (def?.range||0)+(def?.role==='ranged'&&!def?.naval?(p?.tech?.ranged||0):0);
  }
  return 0;
}

/** Crisp sculpted tactical selection ring texture with 4 subtle compass ticks. */
function createSelectionRingTexture(size=128){
  const data=new Uint8Array(size*size*4),half=(size-1)*.5;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const nx=(x-half)/half,ny=(y-half)/half,r=Math.hypot(nx,ny);
    let alpha=0,bright=1;
    if(r<=1.0){
      // Crisp primary outer ring (0.81..0.92) + soft inner highlight skirt (0.64..0.81)
      const band=Math.exp(-Math.pow((r-.865)/.048,2));
      const outerEdge=r>.92?Math.max(0,1-(r-.92)/.05):1;
      const skirt=r<.84&&r>.58?Math.pow((r-.58)/.26,2.1)*.26:0;
      // Subtle 4 cardinal compass ticks pointing inward from the ring
      const ax=Math.abs(nx),ay=Math.abs(ny);
      const tickX=ay<.042&&ax>.66&&ax<.86?Math.max(0,1-ay/.042):0;
      const tickY=ax<.042&&ay>.66&&ay<.86?Math.max(0,1-ax/.042):0;
      const tick=Math.max(tickX,tickY)*.82;
      alpha=Math.min(1,(band*.96+skirt+tick)*outerEdge);
      bright=.88+.12*Math.min(1,band+tick);
    }
    const i=(y*size+x)*4,v=Math.round(255*bright);
    data[i]=v;data[i+1]=v;data[i+2]=v;data[i+3]=Math.round(alpha*255);
  }
  const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat,THREE.UnsignedByteType);
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.magFilter=THREE.LinearFilter;
  tex.minFilter=THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps=true;
  tex.needsUpdate=true;
  return tex;
}

/** Soft circular dot texture for rally ground paths. */
function createDotTexture(size=32){
  const data=new Uint8Array(size*size*4),half=(size-1)*.5;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const r=Math.hypot((x-half)/half,(y-half)/half);
    const alpha=r<1?Math.pow(1-r,1.6):0;
    const i=(y*size+x)*4;
    data[i]=255;data[i+1]=255;data[i+2]=255;data[i+3]=Math.round(alpha*255);
  }
  const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat,THREE.UnsignedByteType);
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.magFilter=THREE.LinearFilter;
  tex.minFilter=THREE.LinearFilter;
  tex.needsUpdate=true;
  return tex;
}

/** Build a terrain-conforming closed ribbon geometry for tactical range circles. */
function createRangeRingGeometry(segments=RANGE_SEGMENTS){
  const positions=new Float32Array(segments*2*3);
  const indices=[];
  for(let i=0;i<segments;i++){
    const next=(i+1)%segments;
    const a=i*2,b=a+1,c=next*2,d=c+1;
    indices.push(a,b,c,b,d,c);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(indices);
  return geo;
}

/**
 * Single-batch universal 3D selection marks, rally flags & ground paths,
 * and terrain-conforming defensive/shrine range circles.
 * Designed for 0 extra shader samplers, <= 4 lightweight draw calls, and WebGL 2 + WebGPU parity.
 */
export class SelectionOverlays {
  constructor(view){
    this.view=view;
    this.group=new THREE.Group();
    this.group.name='Selection overlays';
    this.dummy=new THREE.Object3D();
    this.color=new THREE.Color();
    this.normal=new THREE.Vector3();
    this.quat=new THREE.Quaternion();
    this.treeCoords=null;
    this.treeForestRef=null;
    this.rangeKey='';
    this.decals=[];

    this.ringTex=createSelectionRingTexture(128);
    this.dotTex=createDotTexture(32);

    // 1. Universal instanced ground rings (all units, trees, resources, shrines, + optional hover)
    const ringGeo=new THREE.PlaneGeometry(2,2);
    ringGeo.rotateX(-Math.PI/2);
    const ringMat=new THREE.MeshBasicMaterial({
      map:this.ringTex,color:0xffffff,transparent:true,opacity:.94,
      side:THREE.DoubleSide,depthWrite:false,
      polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
    });
    this.rings=new THREE.InstancedMesh(ringGeo,ringMat,MAX_RINGS);
    this.rings.count=0;
    this.rings.visible=false;
    this.rings.frustumCulled=false;
    this.rings.renderOrder=5;
    this.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Pre-allocate instanceColor before first render for WebGL 2 + WebGPU program consistency.
    this.rings.setColorAt(0,this.color.setHex(0xffffff));

    // 2. Dotted rally path markers
    const dotGeo=new THREE.PlaneGeometry(1,1);
    dotGeo.rotateX(-Math.PI/2);
    const dotMat=new THREE.MeshBasicMaterial({
      map:this.dotTex,color:0xffffff,transparent:true,opacity:.82,
      side:THREE.DoubleSide,depthWrite:false,
      polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
    });
    this.rallyDots=new THREE.InstancedMesh(dotGeo,dotMat,MAX_PATH_DOTS);
    this.rallyDots.count=0;
    this.rallyDots.visible=false;
    this.rallyDots.frustumCulled=false;
    this.rallyDots.renderOrder=5;
    this.rallyDots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rallyDots.setColorAt(0,this.color.setHex(0xf4d27c));

    // 3. Fluttering 3D rally flagpoles & pennants (instanced pole + instanced pennant)
    const poleGeo=new THREE.CylinderGeometry(.045,.065,2.5,6);
    poleGeo.translate(0,1.25,0);
    const poleMat=new THREE.MeshBasicMaterial({color:0xead196});
    this.rallyPoles=new THREE.InstancedMesh(poleGeo,poleMat,MAX_RALLY_FLAGS);
    this.rallyPoles.count=0;
    this.rallyPoles.visible=false;
    this.rallyPoles.frustumCulled=false;
    this.rallyPoles.renderOrder=6;
    this.rallyPoles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const pennantGeo=new THREE.BufferGeometry();
    pennantGeo.setAttribute('position',new THREE.Float32BufferAttribute([
      0,2.42,0,  0,1.76,0,  1.12,2.08,0,
      0,2.42,0,  1.12,2.08,0,  0,1.76,0,
    ],3));
    pennantGeo.computeVertexNormals();
    const pennantMat=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide});
    this.rallyPennants=new THREE.InstancedMesh(pennantGeo,pennantMat,MAX_RALLY_FLAGS);
    this.rallyPennants.count=0;
    this.rallyPennants.visible=false;
    this.rallyPennants.frustumCulled=false;
    this.rallyPennants.renderOrder=6;
    this.rallyPennants.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rallyPennants.setColorAt(0,this.color.setHex(0x7cf0bc));

    // 4. Terrain-conforming attack / capture range circle
    this.rangeGeo=createRangeRingGeometry(RANGE_SEGMENTS);
    this.rangeMat=new THREE.MeshBasicMaterial({
      color:0x8be2b8,transparent:true,opacity:.36,
      side:THREE.DoubleSide,depthWrite:false,
      polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
    });
    this.rangeMesh=new THREE.Mesh(this.rangeGeo,this.rangeMat);
    this.rangeMesh.visible=false;
    this.rangeMesh.frustumCulled=false;
    this.rangeMesh.renderOrder=4;

    this.group.add(this.rings,this.rallyDots,this.rallyPoles,this.rallyPennants,this.rangeMesh);
    view.scene.add(this.group);
  }

  sampleGround(x,z,water=false){
    if(water)return .22;
    const v=this.view;
    if(v.landscape?.surfaceHeightAt)return v.landscape.surfaceHeightAt(x,z);
    return v.groundHeight?.(x,z)??0;
  }

  treeVisualPosition(e){
    const v=this.view;
    if(v.forest&&this.treeForestRef!==v.forest){
      this.treeForestRef=v.forest;
      this.treeCoords=new Map();
      for(const batch of v.forest){
        for(let i=0;i<batch.entries.length;i++){
          const m=batch.matrices[i];
          if(m)this.treeCoords.set(batch.entries[i].id,{x:m.elements[12],y:m.elements[13],z:m.elements[14]});
        }
      }
    }
    return this.treeCoords?.get(e.id)||null;
  }

  addCommandDecal(x,z,kind='move',water=false){
    if(!Number.isFinite(x)||!Number.isFinite(z))return;
    const now=this.view?.clock||0;
    this.decals.push({
      x,z,kind,
      color:DECAL_COLORS[kind]??DECAL_COLORS.move,
      water:!!water,
      startedAt:now,
      duration:kind==='flare'?2.8:kind==='attack'?.95:.82,
    });
    if(this.decals.length>10)this.decals.shift();
  }

  placeRing(slot,x,z,radius,colorHex,water=false,pulse=1,explicitY=null){
    if(slot>=MAX_RINGS)return slot;
    const y=(explicitY!==null?explicitY:this.sampleGround(x,z,water))+(water?.04:.10);
    this.dummy.position.set(x,y,z);
    if(water){
      this.dummy.rotation.set(0,0,0);
    }else{
      const step=Math.min(1.1,Math.max(.35,radius*.45));
      const hL=this.sampleGround(x-step,z),hR=this.sampleGround(x+step,z);
      const hD=this.sampleGround(x,z-step),hU=this.sampleGround(x,z+step);
      this.normal.set(hL-hR,step*2,hD-hU).normalize();
      this.quat.setFromUnitVectors(UP,this.normal);
      this.dummy.quaternion.copy(this.quat);
    }
    const r=radius*pulse;
    this.dummy.scale.set(r,1,r);
    this.dummy.updateMatrix();
    this.rings.setMatrixAt(slot,this.dummy.matrix);
    this.rings.setColorAt(slot,this.color.setHex(colorHex));
    return slot+1;
  }

  updateRangeCircle(cx,cz,radius,colorHex,water=false){
    const key=`${cx.toFixed(2)}:${cz.toFixed(2)}:${radius.toFixed(2)}:${colorHex}`;
    this.rangeMat.color.setHex(colorHex);
    this.rangeMesh.visible=true;
    if(key===this.rangeKey)return;
    this.rangeKey=key;
    const pos=this.rangeGeo.attributes.position;
    const halfWidth=Math.max(.22,Math.min(.44,radius*.022));
    const inner=Math.max(.4,radius-halfWidth),outer=radius+halfWidth;
    for(let i=0;i<RANGE_SEGMENTS;i++){
      const a=(i/RANGE_SEGMENTS)*Math.PI*2,ca=Math.cos(a),sa=Math.sin(a);
      const ix=cx+ca*inner,iz=cz+sa*inner;
      const ox=cx+ca*outer,oz=cz+sa*outer;
      const iy=this.sampleGround(ix,iz,water)+.14;
      const oy=this.sampleGround(ox,oz,water)+.14;
      pos.setXYZ(i*2,ix,iy,iz);
      pos.setXYZ(i*2+1,ox,oy,oz);
    }
    pos.needsUpdate=true;
    this.rangeGeo.computeBoundingSphere();
  }

  update(menu=false){
    const v=this.view,sim=v.sim;
    if(menu||!sim){
      this.rings.count=0;this.rings.visible=false;
      this.rallyDots.count=0;this.rallyDots.visible=false;
      this.rallyPoles.count=0;this.rallyPoles.visible=false;
      this.rallyPennants.count=0;this.rallyPennants.visible=false;
      this.rangeMesh.visible=false;
      return;
    }

    const reduced=!!v.settings?.reducedMotion;
    const clock=v.clock||0;
    const pulse=reduced?1:(1+Math.sin(clock*4.2)*.032);
    const night=v.lightingState?.night||0;
    this.rings.material.opacity=Math.min(1,.92+.08*night);

    let ringCount=0,dotCount=0,flagCount=0;
    let rangeSource=null;
    const seen=new Set();

    const addEntityMark=(e,isHover=false)=>{
      if(!e||seen.has(e.id))return;
      if(e.hp<=0&&!(e.kind==='resource'&&sim.resourceMemory?.has(e.id)))return;
      if(e.embarked)return;
      seen.add(e.id);

      const aff=selectionAffiliation(sim,e);
      const colorHex=selectionColorHex(sim,e,e.kind==='building');
      const water=!!(e.water||UNITS[e.type]?.naval);

      if(e.kind==='building'){
        const node=v.nodes?.get(e.id);
        if(node?.userData?.ring){
          node.userData.ring.visible=true;
          if(node.userData.ring.material?.color)node.userData.ring.material.color.setHex(colorHex);
        }else{
          // Fallback if a building node has no fitted ring (e.g., dock or unmerged test node)
          ringCount=this.placeRing(ringCount,e.x,e.z,(e.r||2.4)+.55,colorHex,false,isHover?1:pulse);
        }
        // Selected friendly production buildings display fluttering 3D rally flags + ground paths
        if(!isHover&&e.owner===0&&e.rally&&flagCount<MAX_RALLY_FLAGS){
          const target=e.rally.target?(sim.resourceMemory?.get(e.rally.target)??sim.get(e.rally.target)):null;
          const rx=target?target.x:e.rally.x,rz=target?target.z:e.rally.z;
          if(Number.isFinite(rx)&&Number.isFinite(rz)){
            const rallyWater=!!(target?.water||sim.isWater?.(rx,rz));
            const ry=this.sampleGround(rx,rz,rallyWater);
            const flagColor=target?.kind==='resource'||target?.type==='farm'?AFFILIATION_COLORS.resource:(sim.players[0]?.color??AFFILIATION_COLORS.mine);
            // Flagpole
            this.dummy.position.set(rx,ry,rz);
            this.dummy.rotation.set(0,0,0);
            this.dummy.scale.set(1,1,1);
            this.dummy.updateMatrix();
            this.rallyPoles.setMatrixAt(flagCount,this.dummy.matrix);
            // Fluttering pennant
            const flutter=reduced?0:Math.sin(clock*5.4+e.id)*.16;
            this.dummy.rotation.set(0,(v.angle||0)+.65+flutter,0);
            this.dummy.updateMatrix();
            this.rallyPennants.setMatrixAt(flagCount,this.dummy.matrix);
            this.rallyPennants.setColorAt(flagCount,this.color.setHex(flagColor));
            flagCount++;
            // Ground anchor ring at rally spot
            ringCount=this.placeRing(ringCount,rx,rz,.88,flagColor,rallyWater,1,ry);
            // Dotted ground path from building edge to rally flag
            const dx=rx-e.x,dz=rz-e.z,dist=Math.hypot(dx,dz);
            const startDist=Math.min(dist*.4,(e.r||2.5)+.7);
            const span=dist-startDist-.9;
            if(span>1.2){
              const steps=Math.min(20,Math.max(2,Math.floor(span/2.3)));
              const phase=reduced?0:((clock*.85)%1);
              for(let s=0;s<steps&&dotCount<MAX_PATH_DOTS;s++){
                const t=(s+phase)/steps;
                const d=startDist+t*span;
                const px=e.x+(dx/dist)*d,pz=e.z+(dz/dist)*d;
                const dotWater=!!sim.isWater?.(px,pz);
                const py=this.sampleGround(px,pz,dotWater)+(dotWater?.06:.14);
                this.dummy.position.set(px,py,pz);
                this.dummy.rotation.set(0,0,0);
                const dotScale=.38+.12*Math.sin(t*Math.PI);
                this.dummy.scale.set(dotScale,1,dotScale);
                this.dummy.updateMatrix();
                this.rallyDots.setMatrixAt(dotCount,this.dummy.matrix);
                this.rallyDots.setColorAt(dotCount,this.color.setHex(flagColor));
                dotCount++;
              }
            }
          }
        }
        if(!isHover&&!rangeSource&&tacticalRangeRadius(sim,e)>0)rangeSource={e,x:e.x,z:e.z,r:tacticalRangeRadius(sim,e),color:colorHex,water:false};
        return;
      }

      if(e.kind==='unit'){
        const pos=renderPosition(v,e);
        const def=UNITS[e.type];
        const radius=def?.naval?(e.type==='warship'?3.0:e.type==='fishingboat'?2.0:2.45):(['ram','catapult'].includes(e.type)?Math.max(1.85,(e.r||1.2)+.65):Math.max(.92,(e.r||.65)+.42));
        ringCount=this.placeRing(ringCount,pos.x,pos.z,radius,colorHex,water,isHover?.96:pulse);
        if(!isHover&&!rangeSource&&tacticalRangeRadius(sim,e)>0)rangeSource={e,x:pos.x,z:pos.z,r:tacticalRangeRadius(sim,e),color:colorHex,water};
        return;
      }

      if(e.kind==='resource'){
        if(e.type==='wood'){
          const visual=this.treeVisualPosition(e);
          const tx=visual?visual.x:e.x,tz=visual?visual.z:e.z;
          ringCount=this.placeRing(ringCount,tx,tz,1.48,colorHex,false,isHover?.96:pulse);
        }else if(e.water){
          ringCount=this.placeRing(ringCount,e.x,e.z,Math.max(2.35,(e.r||1.7)+.65),colorHex,true,isHover?.96:pulse,.24);
        }else{
          ringCount=this.placeRing(ringCount,e.x,e.z,Math.max(2.05,(e.r||1.7)+.52),colorHex,false,isHover?.96:pulse);
        }
        return;
      }

      if(e.kind==='shrine'){
        ringCount=this.placeRing(ringCount,e.x,e.z,(e.r||3)+.65,colorHex,false,isHover?.96:pulse);
        if(!isHover&&!rangeSource)rangeSource={e,x:e.x,z:e.z,r:7,color:colorHex,water:false};
      }
    };

    if(v.selection?.size){
      for(const id of v.selection){
        const e=sim.resourceMemory?.get(id)??sim.get(id);
        if(e)addEntityMark(e,false);
      }
    }
    if(v.hoverEntityId!=null&&!v.selection?.has(v.hoverEntityId)){
      const h=sim.resourceMemory?.get(v.hoverEntityId)??sim.get(v.hoverEntityId);
      if(h)addEntityMark(h,true);
    }

    // Also preview defensive attack range while placing a Watchtower, Castle, or Town Center!
    if(!rangeSource&&v.ghost?.visible&&v.ghost.userData?.type){
      const ghostType=String(v.ghost.userData.type).split(':')[0];
      const def=BUILDINGS[ghostType];
      if(def?.range){
        rangeSource={x:v.ghost.position.x,z:v.ghost.position.z,r:def.range,color:AFFILIATION_COLORS.mineBuilding,water:false};
      }
    }

    // Shift-queued waypoints & connecting dotted path for selected friendly units (0 extra draw calls!)
    let waypointCount=0;
    if(v.selection?.size){
      let tracedUnits=0;
      for(const id of v.selection){
        if(tracedUnits>=4||waypointCount>=12)break;
        const u=sim.get(id);
        if(!u||u.hp<=0||u.owner!==0||u.kind!=='unit'||!u.orders?.length)continue;
        tracedUnits++;
        const startPos=renderPosition(v,u);
        let prevX=startPos.x,prevZ=startPos.z;
        const chain=[];
        if(u.order)chain.push(u.order);
        for(const queued of u.orders)chain.push(queued);
        for(const ord of chain){
          if(waypointCount>=12)break;
          const tEnt=ord.target?(sim.resourceMemory?.get(ord.target)??sim.get(ord.target)):null;
          const wx=tEnt?tEnt.x:ord.x,wz=tEnt?tEnt.z:ord.z;
          if(!Number.isFinite(wx)||!Number.isFinite(wz))continue;
          const wColor=ord.type==='attack'||ord.type==='attackmove'?DECAL_COLORS.attack:ord.type==='gather'?DECAL_COLORS.gather:ord.type==='patrol'?DECAL_COLORS.patrol:DECAL_COLORS.move;
          const wWater=!!(tEnt?.water||sim.isWater?.(wx,wz));
          ringCount=this.placeRing(ringCount,wx,wz,.68,wColor,wWater,1);
          waypointCount++;
          const dx=wx-prevX,dz=wz-prevZ,dist=Math.hypot(dx,dz);
          if(dist>2.2){
            const steps=Math.min(10,Math.max(2,Math.floor(dist/2.6)));
            for(let s=1;s<steps&&dotCount<MAX_PATH_DOTS;s++){
              const t=s/steps;
              const px=prevX+dx*t,pz=prevZ+dz*t;
              const dw=!!sim.isWater?.(px,pz);
              const py=this.sampleGround(px,pz,dw)+(dw?.06:.14);
              this.dummy.position.set(px,py,pz);
              this.dummy.rotation.set(0,0,0);
              this.dummy.scale.set(.34,1,.34);
              this.dummy.updateMatrix();
              this.rallyDots.setMatrixAt(dotCount,this.dummy.matrix);
              this.rallyDots.setColorAt(dotCount,this.color.setHex(wColor));
              dotCount++;
            }
          }
          prevX=wx;prevZ=wz;
        }
      }
    }

    // Animated color-coded command confirmation decals (Move / Attack / Gather / Patrol / Flare)
    let activeDecals=0;
    if(this.decals.length){
      let write=0;
      for(let i=0;i<this.decals.length;i++){
        const d=this.decals[i],age=clock-d.startedAt;
        if(age<0||age>=d.duration)continue;
        this.decals[write++]=d;
        activeDecals++;
        const t=age/d.duration;
        const r=d.kind==='attack'?(1.85-t*1.05):d.kind==='flare'?(1.1+t*3.2):(.65+t*1.55);
        ringCount=this.placeRing(ringCount,d.x,d.z,r,d.color,d.water,1);
        if((d.kind==='attack'||d.kind==='flare')&&t<.72){
          ringCount=this.placeRing(ringCount,d.x,d.z,Math.max(.45,r*.55),d.color,d.water,1);
        }
      }
      this.decals.length=write;
    }

    // Active 3D tactical flare beacons from TacticalAlerts (reuses the same ring batch!)
    const ripples=v.tacticalAlerts?.activeRipples?.();
    if(ripples?.length){
      const nowMs=performance.now();
      for(const r of ripples){
        if(r.kind!=='flare')continue;
        const t=Math.max(0,Math.min(1,(nowMs-r.startedAt)/r.duration));
        const wave=(t*3)%1;
        const rw=!!sim.isWater?.(r.x,r.z);
        ringCount=this.placeRing(ringCount,r.x,r.z,.9+wave*2.6,DECAL_COLORS.flare,rw,1);
        ringCount=this.placeRing(ringCount,r.x,r.z,.55,DECAL_COLORS.flare,rw,1);
      }
    }

    this.rings.count=ringCount;
    this.rings.visible=ringCount>0;
    if(ringCount>0){
      markInstancePrefix(this.rings,ringCount);
      if(this.rings.instanceColor){
        this.rings.instanceColor.clearUpdateRanges();
        this.rings.instanceColor.addUpdateRange(0,ringCount*3);
        this.rings.instanceColor.needsUpdate=true;
      }
    }

    this.rallyDots.count=dotCount;
    this.rallyDots.visible=dotCount>0;
    if(dotCount>0){
      markInstancePrefix(this.rallyDots,dotCount);
      if(this.rallyDots.instanceColor){
        this.rallyDots.instanceColor.clearUpdateRanges();
        this.rallyDots.instanceColor.addUpdateRange(0,dotCount*3);
        this.rallyDots.instanceColor.needsUpdate=true;
      }
    }

    this.rallyPoles.count=flagCount;
    this.rallyPoles.visible=flagCount>0;
    if(flagCount>0)markInstancePrefix(this.rallyPoles,flagCount);

    this.rallyPennants.count=flagCount;
    this.rallyPennants.visible=flagCount>0;
    if(flagCount>0){
      markInstancePrefix(this.rallyPennants,flagCount);
      if(this.rallyPennants.instanceColor){
        this.rallyPennants.instanceColor.clearUpdateRanges();
        this.rallyPennants.instanceColor.addUpdateRange(0,flagCount*3);
        this.rallyPennants.instanceColor.needsUpdate=true;
      }
    }

    if(rangeSource){
      this.updateRangeCircle(rangeSource.x,rangeSource.z,rangeSource.r,rangeSource.color,rangeSource.water);
    }else{
      this.rangeMesh.visible=false;
    }

    v.selectionOverlayDiagnostics={rings:ringCount,rallyFlags:flagCount,rallyDots:dotCount,rangeVisible:this.rangeMesh.visible,decals:activeDecals,waypoints:waypointCount};
  }

  dispose(){
    for(const mesh of [this.rings,this.rallyDots,this.rallyPoles,this.rallyPennants,this.rangeMesh]){
      mesh.geometry.dispose();
      mesh.material.dispose();
      if(mesh.isInstancedMesh)mesh.dispose();
    }
    this.ringTex.dispose();
    this.dotTex.dispose();
    this.group.removeFromParent();
  }
}
