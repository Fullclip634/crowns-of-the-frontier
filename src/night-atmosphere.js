import * as THREE from 'three';
import {nearViewport,markInstancePrefix} from './render-batches.js';

const HEARTH_BUILDINGS=new Set(['towncenter','house','blacksmith','workshop','mill','barracks','market','monastery','keep','wonder']);
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

/**
 * Instanced night ground-glow pools & wispy chimney smoke for medieval settlements.
 * Zero per-building PointLights: runs in at most 2 instanced draw calls across the entire map.
 */
export class NightAtmosphere {
  constructor(view,parent){
    this.view=view;this.parent=parent;
    this.dummy=new THREE.Object3D();this.color=new THREE.Color();
    this.glowTex=radialGlowTexture(64);
    this.smokeTex=smokeWispTexture(64);

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

    parent.add(this.groundGlows,this.chimneySmoke);
  }

  update(time,night,windX,windZ,menu=false){
    const v=this.view,sim=v.sim;
    if(!sim){this.groundGlows.count=0;this.chimneySmoke.count=0;return;}
    const quality=v.settings?.quality||'medium',reduced=!!v.settings?.reducedMotion;
    const allowSmoke=quality!=='low'&&!reduced;
    const smokePerHearth=quality==='high'?4:2;
    const fogActive=!menu&&v.settings?.fog!==false&&!sim.options?.spectator;
    const camQuat=v.camera?.quaternion;

    let glowCount=0,smokeCount=0;
    const entities=sim.entities||[];
    for(const e of entities){
      if(e.kind!=='building'||e.hp<=0||e.progress<1)continue;
      if(fogActive&&e.owner!==0&&!sim.isVisible(e.x,e.z))continue;
      const ground=v.groundHeight?v.groundHeight(e.x,e.z):0;
      const radius=Math.max(1.6,e.r||2);
      if(!nearViewport(v,e.x,ground,e.z,radius+10))continue;

      const burning=e.hp<e.maxHp*.5;
      const forge=FORGE_BUILDINGS.has(e.type);
      const wantsGlow=burning||(night>.035&&GLOW_BUILDINGS.has(e.type));
      if(wantsGlow&&glowCount<256){
        const flicker=reduced?1:.90+.07*Math.sin(time*4.7+e.id*1.3)+.04*Math.sin(time*9.1+e.id*2.7);
        const strength=burning?(.55+.42*night)*flicker:night*(forge?.74:e.type==='tower'?.44:.54)*flicker;
        const span=radius*(burning?3.9:forge?3.85:3.2);
        this.dummy.position.set(e.x,ground+.065,e.z);
        this.dummy.rotation.set(0,0,0);
        this.dummy.scale.set(span,1,span);
        this.dummy.updateMatrix();
        this.groundGlows.setMatrixAt(glowCount,this.dummy.matrix);
        if(burning)this.color.setRGB(Math.min(1,1.0*strength),.44*strength,.12*strength);
        else if(forge)this.color.setRGB(Math.min(1,1.0*strength),.56*strength,.18*strength);
        else this.color.setRGB(Math.min(1,.98*strength),.60*strength,.22*strength);
        this.groundGlows.setColorAt(glowCount,this.color);
        glowCount++;
      }

      if(allowSmoke&&HEARTH_BUILDINGS.has(e.type)&&smokeCount+smokePerHearth<=192){
        const chimneyH=Math.min(7.8,Math.max(2.9,radius*1.48));
        const ox=(e.type==='blacksmith'?radius*.38:radius*.24)*Math.cos(e.id*1.1);
        const oz=(e.type==='blacksmith'?-radius*.22:-radius*.18)*Math.sin(e.id*1.7);
        const warmForge=e.type==='blacksmith'||e.type==='towncenter';
        for(let p=0;p<smokePerHearth;p++){
          const cycle=((time*.18+e.id*.29+p/smokePerHearth)%1+1)%1;
          const rise=cycle*(warmForge?5.8:4.4);
          const drift=cycle*cycle*(1.6+Math.hypot(windX,windZ)*.9);
          const sway=Math.sin(time*1.3+e.id+p*2.1)*.25*cycle;
          this.dummy.position.set(e.x+ox+windX*drift+sway,ground+chimneyH+rise,e.z+oz+windZ*drift);
          if(camQuat)this.dummy.quaternion.copy(camQuat);else this.dummy.rotation.set(0,0,0);
          const fade=Math.sin(cycle*Math.PI);
          const size=(.58+cycle*1.55)*(warmForge?1.15:.92)*(0.35+0.65*fade);
          this.dummy.scale.set(size,size,1);
          this.dummy.updateMatrix();
          this.chimneySmoke.setMatrixAt(smokeCount,this.dummy.matrix);
          // Warm hearth tint near chimney lip at night/blacksmith, cooling to soft wood-smoke aloft.
          const ember=(warmForge?(.25+.45*night):.28*night)*(1-cycle)*(1-cycle);
          const baseShade=(.74-night*.28)*fade;
          this.color.setRGB(
            Math.min(1,baseShade+ember*.75),
            Math.min(1,baseShade+ember*.28),
            Math.min(1,baseShade*(1+night*.16))
          );
          this.chimneySmoke.setColorAt(smokeCount,this.color);
          smokeCount++;
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
    this.chimneySmoke.material.opacity=.26+.08*(1-night);
    if(smokeCount>0){
      markInstancePrefix(this.chimneySmoke,smokeCount);
      if(this.chimneySmoke.instanceColor){
        this.chimneySmoke.instanceColor.clearUpdateRanges();
        this.chimneySmoke.instanceColor.addUpdateRange(0,smokeCount*3);
        this.chimneySmoke.instanceColor.needsUpdate=true;
      }
    }
  }

  dispose(){
    for(const mesh of [this.groundGlows,this.chimneySmoke]){
      mesh.geometry.dispose();mesh.material.dispose();mesh.dispose();mesh.removeFromParent();
    }
    this.glowTex.dispose();this.smokeTex.dispose();
  }
}
