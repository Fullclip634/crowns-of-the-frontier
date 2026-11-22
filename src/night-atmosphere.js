import * as THREE from 'three';
import {nearViewport,markInstancePrefix} from './render-batches.js';

import {buildingFireLevel,buildingSmokeLevel} from './battle-effects.js';
const GLOW_BUILDINGS=new Set(['towncenter','house','blacksmith','workshop','mill','barracks','range','stable','market','monastery','keep','tower','wonder','gate']);
const FORGE_BUILDINGS=new Set(['blacksmith','towncenter','wonder']);

function radialGlowTexture(size=64){
  const data=new Uint8Array(size*size*4),half=(size-1)*.5;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const dx=(x-half)/half,dy=(y-half)/half,r=Math.min(1,Math.hypot(dx,dy));
    const core=Math.pow(1-r,2.4),halo=Math.pow(1-r,1.35)*.38;
    const falloff=Math.min(1,core*.78+halo);
    const idx=(y*size+x)*4;
    // Warm candlelight / hearth amber falloff (additive RGB, crisp alpha)
    data[idx]=Math.round(255*falloff);
    data[idx+1]=Math.round(168*Math.pow(falloff,1.18));
    data[idx+2]=Math.round(62*Math.pow(falloff,1.55));
    data[idx+3]=Math.round(255*falloff);
  }
  const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat,THREE.UnsignedByteType);
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearFilter;
  tex.needsUpdate=true;return tex;
}

function smokeWispTexture(size=64){
  const data=new Uint8Array(size*size*4),half=(size-1)*.5;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const nx=(x-half)/half,ny=(y-half)/half,r=Math.hypot(nx,ny);
    const angle=Math.atan2(ny,nx);
    const puff=1+.16*Math.sin(angle*3+.5)+.10*Math.cos(angle*5-1.1);
    const d=Math.min(1,r/puff);
    const alpha=Math.pow(1-d,2.15)*(1-.15*Math.sin(nx*4.2+ny*3.7));
    const shade=Math.round((.84+.16*(1-d))*255);
    const idx=(y*size+x)*4;
    data[idx]=shade;data[idx+1]=shade;data[idx+2]=Math.min(255,shade+6);
    data[idx+3]=Math.round(Math.max(0,Math.min(1,alpha))*255);
  }
  const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat,THREE.UnsignedByteType);
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearFilter;
  tex.needsUpdate=true;return tex;
}

function sparkEmberTexture(size=16){
  const data=new Uint8Array(size*size*4),half=(size-1)*.5;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const r=Math.min(1,Math.hypot((x-half)/half,(y-half)/half));
    const core=Math.pow(1-r,2.2);
    const idx=(y*size+x)*4;
    data[idx]=255;
    data[idx+1]=Math.round(160+95*core);
    data[idx+2]=Math.round(45+120*core*core);
    data[idx+3]=Math.round(core*255);
  }
  const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat,THREE.UnsignedByteType);
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearFilter;
  tex.needsUpdate=true;return tex;
}

/**
 * Instanced night ground-glow pools, wispy chimney smoke & rising hearth sparks.
 * Zero per-building PointLights: runs in at most 3 instanced draw calls across the entire map.
 */
export class NightAtmosphere {
  constructor(view,parent){
    this.view=view;this.parent=parent;
    this.dummy=new THREE.Object3D();this.color=new THREE.Color();
    this.glowTex=radialGlowTexture(64);
    this.smokeTex=smokeWispTexture(64);
    this.sparkTex=sparkEmberTexture(16);

    const glowGeo=new THREE.PlaneGeometry(1,1);glowGeo.rotateX(-Math.PI/2);
    const glowMat=new THREE.MeshBasicMaterial({
      map:this.glowTex,color:0xffffff,transparent:true,opacity:1,
      blending:THREE.AdditiveBlending,depthWrite:false,
    });
    this.groundGlows=new THREE.InstancedMesh(glowGeo,glowMat,256);
    this.groundGlows.count=0;this.groundGlows.frustumCulled=false;
    this.groundGlows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.groundGlows.renderOrder=2;
    this.groundGlows.userData.nightAtmosphere=true;

    const smokeGeo=new THREE.PlaneGeometry(1,1);
    const smokeMat=new THREE.MeshBasicMaterial({
      map:this.smokeTex,color:0xffffff,transparent:true,opacity:.32,
      depthWrite:false,
    });
    this.chimneySmoke=new THREE.InstancedMesh(smokeGeo,smokeMat,192);
    this.chimneySmoke.count=0;this.chimneySmoke.frustumCulled=false;
    this.chimneySmoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.chimneySmoke.renderOrder=3;
    this.chimneySmoke.userData.nightAtmosphere=true;

    const sparkGeo=new THREE.PlaneGeometry(1,1);
    const sparkMat=new THREE.MeshBasicMaterial({
      map:this.sparkTex,color:0xffffff,transparent:true,opacity:.92,
      blending:THREE.AdditiveBlending,depthWrite:false,
    });
    this.hearthSparks=new THREE.InstancedMesh(sparkGeo,sparkMat,128);
    this.hearthSparks.count=0;this.hearthSparks.frustumCulled=false;
    this.hearthSparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.hearthSparks.renderOrder=4;
    this.hearthSparks.userData.nightAtmosphere=true;

    parent.add(this.groundGlows,this.chimneySmoke,this.hearthSparks);
  }

  update(time,night,windX,windZ,menu=false){
    const v=this.view,sim=v.sim;
    if(!sim){this.groundGlows.count=0;this.chimneySmoke.count=0;this.hearthSparks.count=0;return;}
    const quality=v.settings?.quality||'medium',reduced=!!v.settings?.reducedMotion;
    const allowParticles=quality!=='low'&&!reduced;
    const smokePerHearth=quality==='high'?5:quality==='medium'?4:3;
    const sparksPerForge=quality==='high'?4:2;
    const fogActive=!menu&&v.settings?.fog!==false&&!sim.options?.spectator;
    const camQuat=v.camera?.quaternion;

    let glowCount=0,smokeCount=0,sparkCount=0;
    const entities=typeof sim.candidatesFor==='function'?sim.candidatesFor('building'):(sim.entities||[]);
    for(const e of entities){
      if(e.kind!=='building'||e.hp<=0||e.progress<1)continue;
      if(fogActive&&e.owner!==0&&!sim.isVisible(e.x,e.z))continue;
      const hpRatio=e.hp/e.maxHp,fire=buildingFireLevel(e,hpRatio);
      const forge=FORGE_BUILDINGS.has(e.type);
      const wantsGlow=fire>0||(night>.035&&GLOW_BUILDINGS.has(e.type));
      const node=v.nodes?.get(e.id),outlet=node?.userData.chimneyOutlet;
      const hearth=(!reduced&&(allowParticles||e.type==='blacksmith'))&&outlet&&buildingSmokeLevel(hpRatio)===0;
      if(!hearth&&!wantsGlow)continue;

      const ground=node?.position.y??v.groundHeight?.(e.x,e.z)??0;
      const radius=Math.max(1.6,e.r||2);
      if(!nearViewport(v,e.x,ground,e.z,radius+10))continue;

      if(wantsGlow&&glowCount<256){
        const flicker=reduced?1:.90+.07*Math.sin(time*4.7+e.id*1.3)+.04*Math.sin(time*9.1+e.id*2.7);
        const ownerAge=sim.players?.[e.owner]?.age??1;
        // Frontier Age open-air palisade compounds & tents use subtle lantern light at dusk
        // so undamaged courtyards (like the Frontier Barracks) never look like they are on fire.
        const openFrontier=ownerAge===0&&e.type!=='towncenter'&&e.type!=='blacksmith';
        const hearthGlow=GLOW_BUILDINGS.has(e.type)?night*(forge?.72:openFrontier?.16:e.type==='tower'?.38:.44):0;
        const fireGlow=fire*(.45+.36*night);
        const strength=Math.max(fireGlow,hearthGlow)*flicker;
        const span=radius*(fireGlow>hearthGlow?3.4+.65*fire:forge?3.4:openFrontier?1.45:2.55);
        this.dummy.position.set(e.x,ground+.065,e.z);
        this.dummy.rotation.set(0,0,0);
        this.dummy.scale.set(span,1,span);
        this.dummy.updateMatrix();
        this.groundGlows.setMatrixAt(glowCount,this.dummy.matrix);
        if(fireGlow>hearthGlow)this.color.setRGB(Math.min(1,1.0*strength),.44*strength,.12*strength);
        else if(forge)this.color.setRGB(Math.min(1,1.0*strength),.56*strength,.18*strength);
        else this.color.setRGB(Math.min(1,.96*strength),.68*strength,.30*strength);
        this.groundGlows.setColorAt(glowCount,this.color);
        glowCount++;
      }

      if(hearth&&smokeCount+smokePerHearth<=192){
        const x=node.position.x+outlet.x,y=ground+outlet.y,z=node.position.z+outlet.z;
        for(let p=0;p<smokePerHearth;p++){
          const cycle=(time*.18+e.id*.29+p/smokePerHearth)%1;
          const rise=cycle*(forge?3.4:2.5);
          const drift=cycle*cycle*.72;
          const sway=Math.sin(time*1.4+e.id+p*2.1)*.11*cycle;
          this.dummy.position.set(x+windX*drift+sway,y+rise,z+windZ*drift);
          if(camQuat)this.dummy.quaternion.copy(camQuat);else this.dummy.rotation.set(0,0,0);
          const fade=Math.sin(cycle*Math.PI);
          const size=Math.pow(fade,.50)*(.36+cycle*.98);
          this.dummy.scale.set(size,size,1);
          this.dummy.updateMatrix();
          this.chimneySmoke.setMatrixAt(smokeCount,this.dummy.matrix);
          const shade=(.78-night*.22)*Math.pow(fade,.65);
          this.color.setRGB(shade*1.02,shade*1.00,shade*1.02);
          this.chimneySmoke.setColorAt(smokeCount++,this.color);
        }
      }

      const forgeSparks=hearth&&e.type==='blacksmith'&&night>.25;
      if(allowParticles&&(fire>0||forgeSparks)&&sparkCount<128){
        const ox=Math.min(1.1,(e.r||2)*.22);
        const x=forgeSparks?node.position.x+outlet.x:e.x+ox;
        const y=ground+(forgeSparks?outlet.y:(node?.userData.fireHeight??radius*1.48)*.76);
        const z=forgeSparks?node.position.z+outlet.z:e.z+ox*.7;
        const count=fire>0?sparksPerForge:2;
        for(let p=0;p<count&&sparkCount<128;p++){
          const cycle=(time*.43+e.id*.41+p/count)%1;
          const rise=cycle*(fire>0?2.0+fire*2.6:1.7);
          const drift=cycle*cycle*.75;
          const swirl=Math.sin(time*3.4+e.id*2.3+p*3.7)*cycle*.26;
          const swirlZ=Math.cos(time*2.8+e.id*1.9+p*2.9)*cycle*.24;
          this.dummy.position.set(x+windX*drift+swirl,y+rise,z+windZ*drift+swirlZ);
          if(camQuat)this.dummy.quaternion.copy(camQuat);else this.dummy.rotation.set(0,0,0);
          const life=Math.sin(cycle*Math.PI);
          const size=(fire>0?fire*.25:.13)*life;
          this.dummy.scale.set(size,size*1.25,1);
          this.dummy.updateMatrix();
          this.hearthSparks.setMatrixAt(sparkCount,this.dummy.matrix);
          const heat=life*(fire>0?fire:night*.62);
          this.color.setRGB(heat,(.72-.38*cycle)*heat,.20*(1-cycle)*heat);
          this.hearthSparks.setColorAt(sparkCount++,this.color);
        }
      }
    }

    this.groundGlows.count=glowCount;
    this.groundGlows.visible=glowCount>0;
    if(glowCount>0){
      markInstancePrefix(this.groundGlows,glowCount);
      if(this.groundGlows.instanceColor){
        this.groundGlows.instanceColor.clearUpdateRanges();
        this.groundGlows.instanceColor.addUpdateRange(0,glowCount*3);
        this.groundGlows.instanceColor.needsUpdate=true;
      }
    }

    this.chimneySmoke.count=smokeCount;
    this.chimneySmoke.visible=smokeCount>0;
    this.chimneySmoke.material.opacity=.34+.06*night;
    if(smokeCount>0){
      markInstancePrefix(this.chimneySmoke,smokeCount);
      if(this.chimneySmoke.instanceColor){
        this.chimneySmoke.instanceColor.clearUpdateRanges();
        this.chimneySmoke.instanceColor.addUpdateRange(0,smokeCount*3);
        this.chimneySmoke.instanceColor.needsUpdate=true;
      }
    }

    this.hearthSparks.count=sparkCount;
    this.hearthSparks.visible=sparkCount>0;
    if(sparkCount>0){
      markInstancePrefix(this.hearthSparks,sparkCount);
      if(this.hearthSparks.instanceColor){
        this.hearthSparks.instanceColor.clearUpdateRanges();
        this.hearthSparks.instanceColor.addUpdateRange(0,sparkCount*3);
        this.hearthSparks.instanceColor.needsUpdate=true;
      }
    }
  }

  dispose(){
    for(const mesh of [this.groundGlows,this.chimneySmoke,this.hearthSparks]){
      mesh.geometry.dispose();mesh.material.dispose();mesh.dispose();mesh.removeFromParent();
    }
    this.glowTex.dispose();this.smokeTex.dispose();this.sparkTex.dispose();
  }
}
