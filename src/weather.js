import {standardMaterial} from './render-runtime.js';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {seededRandom} from './data.js';
import {DayNightLighting} from './day-night.js';
import {isSnowBiome,isAridBiome} from './terrain-biomes.js';
import {biomeAtmosphere} from './sky-atmosphere.js';

export const WEATHER_NAMES={clear:'Clear skies',cloudy:'Cloudy',rain:'Rain',storm:'Storm',snow:'Snowfall'};
const clamp=n=>Math.max(0,Math.min(1,n));
const smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
const STORM_CLOUD_COLOR=new THREE.Color(0x6c7986),BRIGHT_CLOUD_COLOR=new THREE.Color(0xf2f6fa);

export function battlefieldHaze(profile,focusDistance,cloudiness){
  const clearance=Math.max(0,focusDistance-58);
  return {near:profile.hazeNear+clearance-cloudiness*20,far:profile.hazeFar+clearance-cloudiness*45};
}

function cloudClusterGeometry(){
  // Sculpted 5-lobe flat-bottomed cumulus puff so clouds read as organic sky strata
  // rather than floating spherical blobs.
  const lobes=[[0,.15,0,1.0,.82,.85],[-.72,.02,.22,.68,.56,.62],[.76,.04,-.18,.64,.52,.58],[-.26,.34,-.28,.54,.58,.52],[.30,.28,.30,.50,.50,.48]];
  const parts=lobes.map(([x,y,z,sx,sy,sz])=>{
    const lobe=new THREE.IcosahedronGeometry(1,1);
    lobe.deleteAttribute('uv');
    const p=lobe.attributes.position,colors=new Float32Array(p.count*3);
    for(let i=0;i<p.count;i++){
      const vx=p.getX(i)*sx+x,vy=(p.getY(i)<0?p.getY(i)*.26:p.getY(i))*sy+y,vz=p.getZ(i)*sz+z;
      p.setXYZ(i,vx,vy,vz);
      const lift=clamp((vy+.15)/.95);
      const shade=.76+lift*.24;
      colors[i*3]=shade*.97;colors[i*3+1]=shade*.99;colors[i*3+2]=Math.min(1,shade*1.02);
    }
    lobe.setAttribute('color',new THREE.BufferAttribute(colors,3));
    return lobe;
  });
  const merged=mergeGeometries(parts);
  for(const part of parts)part.dispose();
  merged.computeVertexNormals();
  return merged;
}

// Weather uses a separate seeded clock: it never changes economy/combat RNG.
export function weatherAt(seed,map,time,preference='auto'){
  time=Math.max(0,time);const cycle=Math.floor(time/210),phase=time%210,rng=seededRandom((seed+cycle*7919+4421)>>>0),wet=rng()<(isAridBiome(map)?.18:.86),storm=rng()<.38;
  let type='clear',amount=0,cloud=0;
  if(preference!=='auto'&&WEATHER_NAMES[preference]){type=preference;amount=type==='storm'?1:type==='rain'?.7:type==='snow'?.65:0;cloud=type==='clear'?0:type==='cloudy'?.6:.9;}
  else if(phase>=40&&phase<185){
    cloud=smooth((phase-40)/25)*smooth((185-phase)/25)*.9;
    if(wet&&phase>=75&&phase<155){amount=smooth((phase-75)/14)*smooth((155-phase)/14);type=isSnowBiome(map)?'snow':storm?'storm':'rain';amount*=type==='rain'?.7:type==='snow'?.65:1;}else type='cloudy';
  }
  const flashPhase=((time-16)%43+43)%43,flash=type==='storm'&&amount>.5&&flashPhase<.16;
  return {type,amount,cloud,wind:type==='storm'?3.4:type==='snow'?1.1:1.8,flash,thunderKey:type==='storm'&&amount>.5?Math.floor((time-16)/43):null,time};
}

export class WeatherRenderer {
  constructor(view){
    this.view=view;this.seed=view.sim.options.seed;this.map=view.sim.options.map;this.group=new THREE.Group();this.group.name='3D weather';view.scene.add(this.group);this.dummy=new THREE.Object3D();this.tint=new THREE.Color();this.roofs=new Map();this.roofStamp='';this.strength=0;this.cloudiness=0;
    this.atmosphere=biomeAtmosphere(this.map);
    this.base={background:view.scene.background.clone(),fog:view.scene.fog.color.clone(),sun:view.sun.color.clone(),hemi:view.hemi.color.clone(),ground:view.groundSurface.material.color.clone(),
      near:view.scene.fog.near,far:view.scene.fog.far,key:view.sun.intensity,fill:view.hemi.intensity,
      // The night pass modulates these too. Weather must rewrite every field it
      // owns each frame, otherwise the night pass cannot tell its own output
      // from this frame's daylight baseline and darkens them again and again.
      hemiGround:view.hemi.groundColor.clone(),environment:view.scene.environmentIntensity,exposure:view.renderer.toneMappingExposure,
      fogTint:view.fogTint.clone()};
    this.rain=this.instances(new THREE.CylinderGeometry(.005,.013,1.55,4),new THREE.MeshBasicMaterial({color:0xd0e2ea,transparent:true,opacity:.38,depthWrite:false}),1400);
    this.snow=this.instances(new THREE.OctahedronGeometry(.09,0).scale(1,.38,1),new THREE.MeshBasicMaterial({color:0xecf4f0,transparent:true,opacity:.74,depthWrite:false}),1000);
    this.ripples=this.instances(new THREE.TorusGeometry(1,.026,3,14).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0xb8cdd2,transparent:true,opacity:.22,depthWrite:false}),60);
    this.clouds=this.instances(cloudClusterGeometry(),standardMaterial({color:0xffffff,vertexColors:true,transparent:true,opacity:.24,depthWrite:false,roughness:1}),36);
    this.cloudTint=new THREE.Color();
    const rng=seededRandom(this.seed+55131);this.particles=Array.from({length:1400},()=>({x:rng(),z:rng(),phase:rng(),speed:.8+rng()*.4,scale:.7+rng()*.6}));
    this.cloudSeeds=Array.from({length:36},()=>({x:(rng()-.5)*220,z:(rng()-.5)*220,y:62+rng()*24,scale:9+rng()*11}));
    this.daylight=new DayNightLighting(view);
  }
  instances(geometry,material,capacity){const mesh=new THREE.InstancedMesh(geometry,material,capacity);mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.userData.weather3d=true;this.group.add(mesh);return mesh;}
  updateRoofs(){
    const v=this.view,stamp=`${v.sim.revision}:${Math.floor(v.sim.time/4)}`;if(stamp===this.roofStamp)return;this.roofStamp=stamp;this.roofs.clear();
    for(const e of v.sim.entities)if(e.hp>0&&e.kind==='building'&&(e.owner===0||v.sim.isVisible(e.x,e.z))){const h=v.entityHeight(e)+Math.max(2,e.r*1.5)*Math.max(.15,e.progress);
      for(let x=Math.floor((e.x-e.r)/3);x<=Math.floor((e.x+e.r)/3);x++)for(let z=Math.floor((e.z-e.r)/3);z<=Math.floor((e.z+e.r)/3);z++){const key=x+':'+z;this.roofs.set(key,Math.max(h,this.roofs.get(key)||-Infinity));}
    }
  }
  surface(x,z){const v=this.view;return Math.max(v.sim.isWater(x,z)?.1:v.groundHeight(x,z),this.roofs.get(Math.floor(x/3)+':'+Math.floor(z/3))||-Infinity);}
  update(dt,menu=false){
    const v=this.view,time=v.sim.time,preference=menu?'clear':v.settings.weather||'auto',state=weatherAt(this.seed,this.map,time,preference);v.weatherState=state;
    const blend=1-Math.exp(-dt*.7);this.strength+=(state.amount-this.strength)*blend;this.cloudiness+=(state.cloud-this.cloudiness)*blend;
    const dark=this.cloudiness*.48,flash=state.flash&&v.settings.lightning!==false&&!v.settings.reducedMotion?1:0;
    const haze=battlefieldHaze(this.atmosphere,v.camera.position.distanceTo(v.target),this.cloudiness);
    v.scene.background.copy(this.base.background).lerp(this.tint.setHex(0x637780),dark);v.scene.fog.color.copy(v.scene.background);v.scene.fog.near=haze.near;v.scene.fog.far=haze.far;
    v.sun.color.copy(this.base.sun).lerp(this.tint.setHex(0xb7cedb),dark);v.sun.intensity=this.base.key*(1-dark*.72)+flash*2;v.hemi.color.copy(this.base.hemi).lerp(this.tint.setHex(0x9eb4bf),dark);v.hemi.intensity=this.base.fill-dark*.22+flash*.3;
    v.hemi.groundColor.copy(this.base.hemiGround).lerp(this.tint.setHex(0x8b9aa6),dark*.6);v.scene.environmentIntensity=this.base.environment*(1-dark*.12);v.renderer.toneMappingExposure=this.base.exposure;v.fogTint.copy(this.base.fogTint);
    const ground=v.groundSurface.material;ground.color.copy(this.base.ground).multiplyScalar(1-this.strength*.08);ground.roughness=1-this.strength*.2;
    this.daylight.update(dt);
    this.group.visible=!menu;const quality=v.settings.quality,scale=v.settings.autoQuality===false?1:Math.max(.4,v.dynamicScale),budget=quality==='low'?240:quality==='medium'?700:1400;
    const count=v.settings.reducedMotion?Math.min(100,Math.floor(budget*this.strength)):Math.floor(budget*this.strength*scale),snow=state.type==='snow';this.rain.count=snow?0:count;this.snow.count=snow?Math.min(1000,count):0;
    if(count){
      this.updateRoofs();const span=Math.min(150,Math.max(55,v.zoom*1.5)),speed=snow?2.4:24,mesh=snow?this.snow:this.rain;
      for(let i=0;i<mesh.count;i++){const p=this.particles[i],phase=((p.phase-time*speed*p.speed/40)%1+1)%1,flutter=snow?Math.sin(time*1.5+p.phase*6.283)*.95:0,x=v.target.x+((p.x+time*state.wind/180)%1-.5)*span+flutter,z=v.target.z+(p.z-.5)*span;
        const y=this.surface(x,z)+phase*40+.4;this.dummy.position.set(x,y,z);this.dummy.rotation.set(snow?time*.5+p.phase:0,snow?time*.8:0,snow?Math.sin(time+p.phase)*.35:-state.wind*.045);this.dummy.scale.set(snow?p.scale*1.05:1,snow?p.scale*1.05:(.85+state.wind*.28)*p.scale,snow?p.scale*1.05:1);this.dummy.updateMatrix();mesh.setMatrixAt(i,this.dummy.matrix);
      }mesh.instanceMatrix.needsUpdate=true;
      this.ripples.count=snow?0:Math.floor((quality==='low'?12:quality==='medium'?28:60)*this.strength);this.ripples.material.opacity=this.strength*.22;
      for(let i=0;i<this.ripples.count;i++){const p=this.particles[i+140],x=v.target.x+(p.x-.5)*span,z=v.target.z+(p.z-.5)*span,t=(time*.8+p.phase)%1,r=.12+t*.72;
        this.dummy.position.set(x,this.surface(x,z)+.045,z);this.dummy.rotation.set(0,0,0);this.dummy.scale.set(r,Math.max(.05,1-t),r);this.dummy.updateMatrix();this.ripples.setMatrixAt(i,this.dummy.matrix);
      }this.ripples.instanceMatrix.needsUpdate=true;
    }else this.ripples.count=0;
    this.clouds.count=this.cloudiness>.02?(quality==='low'?10:quality==='medium'?22:36):0;this.clouds.material.opacity=this.cloudiness*.24;
    const stormShade=clamp(this.strength*(state.type==='storm'?1:.65));
    for(let i=0;i<this.clouds.count;i++){const p=this.cloudSeeds[i],motion=v.settings.reducedMotion?0:time*.4;
      this.dummy.position.set(v.target.x+((p.x+motion+110)%220)-110,p.y,v.target.z+p.z);this.dummy.rotation.set(0,p.x,0);this.dummy.scale.set(p.scale*1.15,p.scale*.24,p.scale*.72);this.dummy.updateMatrix();this.clouds.setMatrixAt(i,this.dummy.matrix);
      this.cloudTint.copy(BRIGHT_CLOUD_COLOR).lerp(STORM_CLOUD_COLOR,stormShade).multiplyScalar(.9+((i*7)%5)*.025+flash*.28);
      this.clouds.setColorAt(i,this.cloudTint);
    }this.clouds.instanceMatrix.needsUpdate=true;if(this.clouds.count>0&&this.clouds.instanceColor)this.clouds.instanceColor.needsUpdate=true;
    v.weatherDiagnostics={type:state.type,rain:this.rain.count,snow:this.snow.count,ripples:this.ripples.count,clouds:this.clouds.count,drawCalls:[this.rain,this.snow,this.ripples,this.clouds].filter(mesh=>mesh.count>0).length};
  }
  dispose(){const v=this.view;this.daylight.dispose();v.scene.background.copy(this.base.background);v.scene.fog.color.copy(this.base.fog);v.scene.fog.near=this.base.near;v.scene.fog.far=this.base.far;v.sun.color.copy(this.base.sun);v.sun.intensity=this.base.key;v.hemi.color.copy(this.base.hemi);v.hemi.intensity=this.base.fill;for(const mesh of this.group.children){mesh.geometry.dispose();mesh.material.dispose();mesh.dispose();}this.group.removeFromParent();}
}

export function installWeather(WorldView){const p=WorldView.prototype,attach=p.attach,render=p.render;
  p.attach=function(sim){this.weather?.dispose();attach.call(this,sim);this.weather=new WeatherRenderer(this);};
  p.render=function(dt,menu=false){this.weather?.update(dt,menu);render.call(this,dt,menu);};
}
