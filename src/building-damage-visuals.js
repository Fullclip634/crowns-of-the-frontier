import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {wallTier} from './fortified-walls.js';
import {isWallCorner} from './walls.js';

// Progressive HP-based structural breakage stages (0 = intact, 1 = damaged, 2 = critically breached).
export const DAMAGE_STAGE_LIGHT = 0.70;
export const DAMAGE_STAGE_CRITICAL = 0.35;

export function buildingDamageStage(entity){
  if(!entity||entity.kind!=='building'||entity.hp<=0||(entity.progress??1)<1||!(entity.maxHp>0))return 0;
  const ratio=entity.hp/entity.maxHp;
  if(ratio<=DAMAGE_STAGE_CRITICAL)return 2;
  if(ratio<=DAMAGE_STAGE_LIGHT)return 1;
  return 0;
}

function hash2(a,b){
  const s=Math.sin(a*127.1+b*311.7)*43758.5453123;
  return s-Math.floor(s);
}

// Build a single low-poly rubble chunk or splintered timber matching the exact vertex
// attribute layout of packed structurePalette geometries (zero extra draw calls, zero VRAM).
function makeDebrisPiece(cx,cy,cz,sx,sy,sz,rotY,rotZ,rgb,surfaceMode,nightGlow){
  const g=new THREE.BoxGeometry(sx,sy,sz);
  g.rotateZ(rotZ);
  g.rotateY(rotY);
  g.translate(cx,cy,cz);
  const count=g.attributes.position.count;
  const colors=new Float32Array(count*3);
  const surface=new Float32Array(count*3);
  const emission=new Float32Array(count*3);
  const glow=new Float32Array(count);
  for(let i=0;i<count;i++){
    const shade=.82+.24*hash2(i+cx*7.3,cz*5.1);
    colors[i*3]=rgb[0]*shade;
    colors[i*3+1]=rgb[1]*shade;
    colors[i*3+2]=rgb[2]*shade;
    surface[i*3]=.96;
    surface[i*3+1]=0;
    surface[i*3+2]=surfaceMode;
  }
  glow.fill(nightGlow);
  g.setAttribute('color',new THREE.BufferAttribute(colors,3));
  g.setAttribute('structureSurface',new THREE.BufferAttribute(surface,3));
  g.setAttribute('structureEmission',new THREE.BufferAttribute(emission,3));
  g.setAttribute('structureNightGlow',new THREE.BufferAttribute(glow,1));
  g.clearGroups();
  return g;
}

/**
 * Deterministically generate a cached damaged (stage 1) or critically breached (stage 2)
 * variant of any packed building, straight wall, wall corner bastion, or gatehouse.
 * Preserves the exact structurePalette material and attribute layout (1 draw call, +0 MB VRAM,
 * full WebGL 2 + WebGPU parity).
 */
export function buildDamagedStructureGeometry(baseGeometry,type,stage,options={}){
  const {corner=false,tier='stone',age=0}=options;
  const geo=baseGeometry.clone();
  if(!geo.boundingBox)geo.computeBoundingBox();
  const bb=geo.boundingBox;
  const minY=Math.min(0,bb.min.y),maxY=Math.max(1.2,bb.max.y);
  const height=Math.max(1,maxY);
  const spanX=Math.max(1,bb.max.x-bb.min.x);
  const spanZ=Math.max(1,bb.max.z-bb.min.z);
  const pos=geo.attributes.position,col=geo.attributes.color;
  const critical=stage>=2;

  for(let i=0;i<pos.count;i++){
    let x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    if(y<=.08)continue; // Keep buried terrain footings & ground base watertight!

    let cutY=Infinity,scorch=1,leanX=0,leanZ=0;
    const hFrac=Math.max(0,Math.min(1,y/height));
    const jag=Math.sin(x*9.4+z*7.1)*.16+Math.cos(x*17.2-z*13.6)*.09;

    if(type==='wall'&&!corner){
      // Straight Wall: Stage 1 chips jagged V-notch in upper third; Stage 2 carves dramatic deep central breach!
      const breachCenter=critical?0:.14;
      const halfWidth=critical?Math.max(1.05,spanX*.39):Math.max(.78,spanX*.29);
      const u=Math.abs(x-breachCenter)/halfWidth;
      if(u<1.25){
        const falloff=Math.max(0,1-u*u);
        const dropFrac=critical?(.62*falloff):(.34*falloff);
        cutY=Math.max(.42,height*(1-dropFrac)+jag*(critical?.28:.18));
        if(y>cutY){
          const excess=y-cutY;
          y=cutY+excess*.10;
          const dir=x>=breachCenter?1:-1;
          leanX=dir*Math.min(.22,excess*.14);
          leanZ=((hash2(Math.round(x*4),Math.round(z*4))-.5)*2)*Math.min(.22,excess*.18);
          scorch=critical?.46:.66;
        }else if(y>cutY-.55){
          scorch=critical?.64:.80;
        }
      }else if(critical&&hFrac>.45){
        // Outer surviving wall shoulders lean slightly outward & darken from siege impacts.
        const shoulder=(hFrac-.45)/.55;
        leanX=Math.sign(x)*shoulder*.14;
        leanZ=Math.sin(x*5.2)*shoulder*.08;
        scorch=.78;
      }
    }else if(type==='wall'&&corner){
      // Corner Bastion: Stage 1 knocks out one parapet corner; Stage 2 shatters half the upper tower rim!
      const diag=(x+z)/Math.max(1,spanX*.55);
      const thresh=critical?-.32:.18;
      if(diag>thresh){
        const depth=Math.min(1,(diag-thresh)/(critical?1.1:.9));
        const dropFrac=critical?(.46*depth+.08):(.24*depth);
        cutY=Math.max(.95,height*(1-dropFrac)+jag*.22);
        if(y>cutY){
          const excess=y-cutY;
          y=cutY+excess*.12;
          leanX=Math.sign(x||1)*Math.min(.18,excess*.14);
          leanZ=Math.sign(z||1)*Math.min(.18,excess*.14);
          scorch=critical?.48:.68;
        }else if(y>cutY-.55){
          scorch=critical?.66:.82;
        }
      }
    }else if(type==='gate'){
      // Gatehouse: break the central arched header parapet & shatter flanking towers asymmetrically!
      const ax=Math.abs(x);
      if(ax<1.32){
        // Central header bridge above archway: chip parapet in Stage 1, break deeply in Stage 2 (keep arch open!).
        const u=ax/1.32;
        const drop=critical?(.34*(1-u*.45)):(.18*(1-u*.5));
        cutY=Math.max(height*.60,height*(1-drop)+jag*.20);
        if(y>cutY){
          y=cutY+(y-cutY)*.14;
          leanZ=Math.sin(x*7.5)*(critical?.16:.08);
          scorch=critical?.48:.68;
        }
      }else{
        // Flanking gate towers: left tower takes heavier parapet collapse than right tower.
        const sideFactor=x<0?1:.62;
        const drop=(critical?.36:.18)*sideFactor;
        cutY=Math.max(1.8,height*(1-drop)+jag*.24);
        if(y>cutY){
          const excess=y-cutY;
          y=cutY+excess*.16;
          leanX=Math.sign(x)*Math.min(.16,excess*.12);
          leanZ=(x<0?1:-1)*Math.min(.14,excess*.10);
          scorch=critical?.50:.72;
        }
      }
    }else{
      // General buildings: roof/parapet impact dents + scorch darkening around upper walls & eaves.
      const craterA=Math.hypot((x-spanX*.16)/(spanX*.36),(z+spanZ*.12)/(spanZ*.36));
      const craterB=Math.hypot((x+spanX*.22)/(spanX*.32),(z-spanZ*.18)/(spanZ*.32));
      const dent=Math.max(Math.max(0,1-craterA),critical?Math.max(0,1-craterB)*.85:0);
      if(dent>0&&hFrac>.42){
        const drop=dent*(critical?.34:.16)*((hFrac-.42)/.58);
        y=Math.max(.45,y-height*drop+jag*.08*dent);
        scorch=Math.min(scorch,1-dent*(critical?.42:.22));
      }
      if(critical&&hFrac>.25){
        scorch=Math.min(scorch,.70+.14*(1-hFrac));
      }else if(hFrac>.40){
        scorch=Math.min(scorch,.86);
      }
    }

    pos.setXYZ(i,x+leanX,y,z+leanZ);
    if(col&&scorch<1){
      col.setXYZ(i,col.getX(i)*scorch,col.getY(i)*scorch,col.getZ(i)*scorch);
    }
  }
  pos.needsUpdate=true;
  if(col)col.needsUpdate=true;

  // Append scattered fallen rubble blocks & broken timber splinters at the base!
  const isWood=(type==='wall'||type==='gate')?tier==='palisade':age===0;
  const debrisMode=isWood?1:2;
  const debrisGlow=isWood?-1:(tier==='fortified'||age>=3?-1:0);
  const debrisColor=isWood
    ?(critical?[.42,.38,.32]:[.56,.51,.43])
    :(tier==='fortified'||age>=3?(critical?[.48,.51,.56]:[.66,.69,.74]):(critical?[.46,.42,.37]:[.64,.59,.52]));
  const debrisCount=critical?(type==='gate'?14:12):(type==='gate'?6:5);
  const pieces=[geo];

  for(let k=0;k<debrisCount;k++){
    const seed=k*3.7+stage*19.1+(corner?7:0);
    let dx,dz;
    if(type==='wall'&&!corner){
      dx=(hash2(seed,1.3)-.5)*Math.min(2.6,spanX*.88);
      const side=k%2===0?1:-1;
      dz=side*(.38+hash2(seed,2.7)*(critical?.95:.58));
    }else if(type==='gate'){
      // Pile debris beside both gate towers while keeping the central unit passageway clean!
      const sideX=k%2===0?-1:1;
      dx=sideX*(1.45+hash2(seed,1.9)*1.35);
      dz=(hash2(seed,3.1)-.5)*2.15;
    }else{
      const ang=(k/debrisCount)*Math.PI*2+hash2(seed,4.3)*.55;
      const radX=Math.max(1.0,spanX*.48)*(0.78+hash2(seed,5.7)*.34);
      const radZ=Math.max(1.0,spanZ*.48)*(0.78+hash2(seed,6.1)*.34);
      dx=Math.cos(ang)*radX;
      dz=Math.sin(ang)*radZ;
    }
    const isTimber=isWood||(k%3===2&&type!=='wall');
    const sx=isTimber?(.65+hash2(seed,7.3)*.75):(.26+hash2(seed,7.3)*(critical?.44:.30));
    const sy=isTimber?(.12+hash2(seed,8.1)*.08):(.18+hash2(seed,8.1)*(critical?.32:.22));
    const sz=isTimber?(.14+hash2(seed,9.2)*.09):(.24+hash2(seed,9.2)*(critical?.40:.26));
    const cy=sy*.45+(critical&&k%4===0?.12:0);
    const rotY=hash2(seed,10.5)*Math.PI*2;
    const rotZ=(hash2(seed,11.7)-.5)*(isTimber?.38:.28);
    pieces.push(makeDebrisPiece(dx,cy,dz,sx,sy,sz,rotY,rotZ,debrisColor,isTimber?1:debrisMode,isTimber?-1:debrisGlow));
  }

  const merged=mergeGeometries(pieces);
  for(const p of pieces)p.dispose();
  if(!merged)return baseGeometry;
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Update a building, wall, corner bastion, or gatehouse's visual breakage state in O(1).
 * Swaps only when damageStage transitions (0 <-> 1 <-> 2), sharing cached geometries across
 * all instances of the same archetype so frame time and VRAM overhead stay effectively zero.
 */
export function updateBuildingDamageVisuals(view,entity,node){
  if(!entity||!node||entity.kind!=='building'||entity.type==='farm')return;
  const stage=buildingDamageStage(entity);
  const prev=node.userData.damageStage??0;
  if(stage===prev)return;
  node.userData.damageStage=stage;

  const meta=node.userData.model3d||{};
  const tier=(entity.type==='wall'||entity.type==='gate')?(meta.wallTier||wallTier(view.sim,entity)):'stone';
  const corner=entity.type==='wall'&&(meta.wallCorner??isWallCorner(view.sim,entity));
  const age=meta.architectureAge??view.sim?.players?.[entity.owner]?.age??0;
  const cache=view.damagedGeometryCache??=new Map();
  view.sharedModelGeometry??=new Set();

  // Locate primary static structure mesh (direct child, or inside WebGPU ClippingGroup if any).
  let primary=null;
  for(const child of node.children){
    if(child.isMesh&&child.userData.structureSurface){primary=child;break;}
  }
  if(primary){
    if(!primary.userData.intactGeometry)primary.userData.intactGeometry=primary.geometry;
    const base=primary.userData.intactGeometry;
    if(stage===0){
      primary.geometry=base;
    }else{
      const key=`${base.uuid}:${entity.type}:${corner?'c':'r'}:${tier}:${age}:${stage}`;
      let damaged=cache.get(key);
      if(!damaged){
        damaged=buildDamagedStructureGeometry(base,entity.type,stage,{corner,tier,age});
        cache.set(key,damaged);
        view.sharedModelGeometry.add(damaged);
      }
      primary.geometry=damaged;
    }
  }

  // Visibly skew / crack damaged gate portcullis leaf & lean war-battered flagpoles!
  const gate=node.userData.portcullis;
  if(gate){
    gate.rotation.z=stage===2?.14:stage===1?.05:0;
    gate.rotation.x=stage===2?.07:stage===1?.025:0;
  }
  node.traverse(child=>{
    if(child.userData?.flag){
      child.rotation.z=stage===2?.38:stage===1?.15:0;
    }
  });
}
