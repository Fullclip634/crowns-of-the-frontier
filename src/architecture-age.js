import * as THREE from 'three';
import {isSnowBiome} from './terrain-biomes.js';

// Age-driven architecture. Only the Town Center has four authored Blender
// variants; every other landmark reuses its single authored base and gains
// age-specific massing, structural buttresses/crests, and dressed masonry.
// Geometry is merged by packBuildingModel, so each building stays one draw
// call and the runtime catalogue validation remains satisfied.

export const AGE_STYLED_BUILDINGS=Object.freeze([
  'house','keep','tower','barracks','wonder','monastery','market','workshop','stable','range','blacksmith','mill','camp','mine'
]);
export function isAgeStyled(type){return AGE_STYLED_BUILDINGS.includes(type);}

const roofFinish=color=>Object.freeze(new THREE.Color(color).toArray());
const STYLES=Object.freeze([
  // The first age is deliberately under-built: lower walls and a flatter roof
  // than the authored model, so a Dark Age town reads as a settlement that has
  // not yet been raised in stone rather than a castle that is merely tinted.
  Object.freeze({height:.78,width:.90,pitch:.84,tint:[1,1,1],roof:roofFinish(0x957d58),label:'frontier'}),
  Object.freeze({height:.98,width:.99,pitch:1.06,tint:[.96,.97,.98],roof:roofFinish(0xb86e51),label:'feudal'}),
  Object.freeze({height:1.18,width:1.07,pitch:1.24,tint:[.87,.90,.95],roof:roofFinish(0x687e80),label:'castle'}),
  Object.freeze({height:1.38,width:1.15,pitch:1.38,tint:[.78,.84,.94],roof:roofFinish(0x75839b),label:'imperial'}),
]);
export function architectureStyle(age){return STYLES[Math.max(0,Math.min(3,Math.round(age||0)))];}
export function architectureAge(sim,entity){return Math.max(0,Math.min(3,sim?.players?.[entity?.owner]?.age||0));}
// Surface classes baked into structureSurface.z by bakeSurface: 1 timber,
// 2 masonry, 3 plaster, 4 roof. Ageing promotes the wall material itself, which
// is the cue that actually reads as an age advance: timber palisade work gives
// way to plaster and then to dressed stone. Roofs and unclassified surfaces are
// left alone so team colours and glazing keep their meaning.
export function ageSurface(mode,age){
  if(mode===1||mode===3)return age>=2?2:age===1?3:1;
  return mode;
}
// A node with no age tag must be rebuilt once; -1 guarantees that without
// rebuilding every frame (which an undefined tag would otherwise cause).
export function architectureOutdated(sim,entity,node){
  if(entity?.kind!=='building'||!node?.userData?.model3d)return false;
  if(entity.type!=='towncenter'&&!isAgeStyled(entity.type))return false;
  return (node.userData.model3d.architectureAge??-1)!==architectureAge(sim,entity);
}

// Age is expressed through three things that cannot fight each other: the wall
// material is promoted in bakeSurface, the massing grows, and the roof pitch
// steepens. Earlier revisions scattered box "ornaments" around the roofline;
// they used the darker stone material and were then darkened again by the age
// tint, so they read as black untextured cubes. Nothing is added here now: the
// roof and its chimney are scaled about the eave line, which preserves their
// relationship exactly while giving every age a different silhouette.
const ROOF_MATERIALS=Object.freeze(['teamRoof','roof']);
const ROOF_FITTINGS=Object.freeze(['brick']);
export function steepenRoof(root,pitch){
  // A pitch below one flattens the roof, which is exactly what the first age
  // needs; anything other than a no-op is worth applying.
  if(!root||!pitch||pitch===1)return false;
  const roofs=[],fittings=[];
  root.traverse(part=>{
    if(!part.isMesh)return;
    const material=part.userData.assetMaterial;
    if(ROOF_MATERIALS.includes(material))roofs.push(part);
    else if(ROOF_FITTINGS.includes(material))fittings.push(part);
  });
  if(!roofs.length)return false;
  let eave=Infinity;
  for(const part of roofs){
    part.geometry.computeBoundingBox();
    eave=Math.min(eave,part.geometry.boundingBox.min.y*part.scale.y+part.position.y);
  }
  if(!Number.isFinite(eave))return false;
  // y' = eave + pitch * (y - eave), expressed as a scale plus an offset so the
  // shared geometry is never rewritten.
  for(const part of [...roofs,...fittings]){
    part.scale.y*=pitch;
    part.position.y=eave*(1-pitch)+part.position.y*pitch;
  }
  return true;
}
export function applyArchitectureAge(view,root,entity,age){
  // Age zero is styled too: it is the age that has to look the weakest.
  if(!root||!entity||age<0)return root;
  const style=architectureStyle(age);
  root.userData.model3d={...root.userData.model3d,architectureAge:age,architectureLabel:style.label};
  // A mill's rotor is sized against its own blades and the ground, so massing
  // and pitch would both move the sweep. Models with a rotating attachment keep
  // their authored proportions at every age and take the material and colour
  // cues only.
  let rotating=false;root.traverse(node=>{if(node.userData?.windmill)rotating=true;});
  if(rotating)return root;
  root.scale.set(style.width,style.height,style.width);
  // A node can be revisited; the pitch must never compound on itself.
  if(!root.userData.model3d.architecturePitch&&steepenRoof(root,style.pitch))root.userData.model3d.architecturePitch=style.pitch;
  return root;
}

const WALL_ROLES=new Set(['stone','stoneDark','plaster','wood','darkwood']);
const EAVE_ROLES=new Set(['plaster']);
const ROOF_ROLES=new Set(['teamRoof','roof']);
const MILITARY_CREST=new Set(['keep','barracks','stable','range','workshop','blacksmith','monastery','wonder']);

function isAnimatedAttachment(root,node){
  for(let cur=node;cur&&cur!==root;cur=cur.parent){
    if(cur.userData?.windmill||cur.userData?.windmillMount||cur.userData?.gate||cur.userData?.dockPier||cur.userData?.flag)return true;
  }
  return false;
}

function measureLocalBoxes(root){
  root.updateMatrixWorld(true);
  const inverse=root.matrixWorld.clone().invert(),worldToLocal=new THREE.Matrix4(),box=new THREE.Box3();
  const wall=new THREE.Box3(),eave=new THREE.Box3(),roof=new THREE.Box3();
  root.traverse(part=>{
    if(!part.isMesh||!part.geometry||isAnimatedAttachment(root,part))return;
    part.geometry.computeBoundingBox();
    if(!part.geometry.boundingBox)return;
    worldToLocal.copy(inverse).multiply(part.matrixWorld);
    box.copy(part.geometry.boundingBox).applyMatrix4(worldToLocal);
    const role=part.userData.assetMaterial;
    if(WALL_ROLES.has(role))wall.union(box);
    if(EAVE_ROLES.has(role))eave.union(box);
    if(ROOF_ROLES.has(role))roof.union(box);
  });
  return {wall,eave,roof};
}

function detailMesh(root,geometry,material,x,y,z,sx,sy,sz){
  const mesh=new THREE.Mesh(geometry,material);
  mesh.position.set(x,y,z);
  mesh.scale.set(sx,sy,sz);
  mesh.castShadow=true;
  mesh.receiveShadow=true;
  mesh.userData.ageFortification=true;
  root.add(mesh);
  return mesh;
}

const PORCH_BUILDINGS=new Set(['house','barracks','market','workshop','stable','range']);
const SUPPLY_BUILDINGS=new Set(['house','barracks','market','workshop','camp','mine','mill']);
const CHIMNEY_BUILDINGS=new Set(['house','blacksmith','workshop']);
const BANNER_BUILDINGS=new Set(['keep','tower','barracks','stable','range','workshop','monastery','wonder']);

function icicleMaterial(view){
  view.materials.icicle??=new THREE.MeshStandardMaterial({color:0xd8eeff,roughness:.18,metalness:.06});
  return view.materials.icicle;
}

/** Add stepped stone piers, castle buttresses, imperial bastion crowns, lived-in medieval props (timber porches, supply barrels/crates, stone chimneys, hanging heraldic banners), and winter roof-eave icicles so every age and biome reads with hand-crafted depth inside one single merged draw call. */
export function strengthenArchitecture(view,root,entity,age){
  if(!root||!entity||age<0||!view?.geo?.box||!view?.materials?.stone||root.userData.strengthened)return root;
  if(['farm','dock','wall','gate','towncenter'].includes(entity.type))return root;
  const {wall,eave,roof}=measureLocalBoxes(root);
  if(wall.isEmpty())return root;
  const eaveSize=!eave.isEmpty()?eave.getSize(new THREE.Vector3()):null;
  const core=eaveSize&&eaveSize.x>=1.2&&eaveSize.z>=1.2?eave:wall;
  const size=core.getSize(new THREE.Vector3()),center=core.getCenter(new THREE.Vector3());
  if(size.x<1.2||size.z<1.2)return root;
  root.userData.strengthened=true;
  const m=view.materials,{stone,stoneDark}=m;
  const wood=m.darkwood||m.wood||stone,crateWood=m.wood||wood;
  const bannerMat=view.teamMaterials?.[entity.owner]||stone;
  const boxGeo=view.geo.box,cylGeo=view.geo.cylinder||boxGeo,coneGeo=view.geo.cone||boxGeo;
  const eaveY=!eave.isEmpty()?Math.min(wall.max.y,Math.max(eave.max.y,1.8)):roof.isEmpty()?wall.max.y:Math.min(wall.max.y,roof.min.y+.45);
  const pierW=Math.max(.26,Math.min(.50,Math.min(size.x,size.z)*.105));
  const hx=size.x*.5,hz=size.z*.5;
  const snow=isSnowBiome(view.sim?.options?.map);

  // 1. Tower masonry tiers + Castle/Imperial heraldic wall banners + winter eave icicles.
  if(entity.type==='tower'){
    const radius=Math.min(size.x,size.z)*.5;
    if(age>=1)detailMesh(root,cylGeo,stoneDark||stone,center.x,.48,center.z,radius*1.14,.96,radius*1.14);
    if(age>=2){
      const height=Math.max(1.6,eaveY*(age>=3?.70:.48));
      for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){
        detailMesh(root,boxGeo,stoneDark||stone,center.x+dx*radius*.94,height*.38,center.z+dz*radius*.94,.44,height*.76,.44);
        detailMesh(root,boxGeo,stone,center.x+dx*radius*.86,height*.52,center.z+dz*radius*.86,.34,height,.34);
      }
      // Hanging heraldic tower banner beneath parapet on front face.
      const bannerY=Math.max(1.8,eaveY*.74);
      detailMesh(root,boxGeo,wood,center.x,bannerY+.52,center.z+radius*1.04,.64,.08,.10);
      detailMesh(root,boxGeo,bannerMat,center.x,bannerY,center.z+radius*1.05,.52,.98,.06);
    }
    if(age>=3){
      detailMesh(root,cylGeo,stoneDark||stone,center.x,eaveY*.92,center.z,radius*1.12,.36,radius*1.12);
    }
    if(snow&&!roof.isEmpty()){
      const ice=icicleMaterial(view),ry=Math.max(1.4,roof.min.y-.14);
      for(let i=0;i<6;i++){
        const a=i*Math.PI/3,r=radius*1.02;
        const ic=detailMesh(root,coneGeo,ice,center.x+Math.cos(a)*r,ry,center.z+Math.sin(a)*r,.07,.32+(i%2)*.14,.07);
        ic.rotation.x=Math.PI;
      }
    }
    return root;
  }

  // 2. Mill stays clear of its front spinning blades; tuck barrels/crates cleanly on its back/side flank.
  if(entity.type==='mill'){
    detailMesh(root,cylGeo,wood,center.x+hx*.68,.30,center.z-hz*.62,.24,.52,.24);
    detailMesh(root,boxGeo,crateWood,center.x+hx*.34,.25,center.z-hz*.72,.46,.42,.44);
    if(snow&&!roof.isEmpty()){
      const ice=icicleMaterial(view),ry=Math.max(1.6,roof.min.y-.14);
      for(const sx of [-.65,0,.65]){
        const ic=detailMesh(root,coneGeo,ice,center.x+sx*hx*.85,ry,center.z-hz*1.02,.07,.34,.07);
        ic.rotation.x=Math.PI;
      }
    }
    return root;
  }

  // 3. Age-progressive corner masonry:
  // Age 0 (Frontier): rustic timber corner posts & supply crates.
  // Age 1 (Feudal): stone corner piers + timber entry porch + stone chimney.
  // Age 2 (Castle): battered stepped stone buttresses + hanging heraldic banners.
  // Age 3 (Imperial): tall crowned stone bastions + military merlon crests + double banner trim.
  const height=eaveY*(age>=3?1.04:age===2?.94:.80);
  if(age===0){
    for(const sx of [-1,1])for(const sz of [-1,1]){
      const x=center.x+sx*(hx-pierW*.18),z=center.z+sz*(hz-pierW*.18);
      detailMesh(root,boxGeo,wood,x,Math.max(.65,height*.42),z,pierW*.76,Math.max(1.2,height*.78),pierW*.76);
    }
  }else{
    for(const sx of [-1,1])for(const sz of [-1,1]){
      const x=center.x+sx*(hx-pierW*.14),z=center.z+sz*(hz-pierW*.14);
      if(age===1){
        detailMesh(root,boxGeo,stone,x,height*.5,z,pierW,height,pierW);
        continue;
      }
      const baseH=Math.max(.75,height*(age>=3?.52:.42));
      detailMesh(root,boxGeo,stoneDark||stone,center.x+sx*hx,baseH*.5,center.z+sz*hz,pierW*1.42,baseH,pierW*1.42);
      detailMesh(root,boxGeo,stone,x,height*.5,z,pierW*1.12,height,pierW*1.12);
      if(age>=3){
        const capY=height+.14;
        detailMesh(root,boxGeo,stoneDark||stone,x,capY,z,pierW*1.34,.28,pierW*1.34);
        if(MILITARY_CREST.has(entity.type))detailMesh(root,boxGeo,stone,x,capY+.25,z,pierW*.92,.24,pierW*.92);
      }
    }
  }

  // 4. Lived-in timber entry porch beam & posts (Feudal+ on everyday civic/military buildings).
  if(age>=1&&PORCH_BUILDINGS.has(entity.type)&&size.x>=2.0&&eaveY>=1.5){
    const porchW=Math.min(1.55,size.x*.42),porchH=Math.min(1.48,eaveY*.62),porchZ=center.z+hz+.26;
    detailMesh(root,boxGeo,wood,center.x-porchW*.46,porchH*.5+.04,porchZ,.13,porchH,.13);
    detailMesh(root,boxGeo,wood,center.x+porchW*.46,porchH*.5+.04,porchZ,.13,porchH,.13);
    detailMesh(root,boxGeo,wood,center.x,porchH+.08,porchZ-.08,porchW+.24,.14,.52);
  }

  // 5. Lived-in grounded supply barrels & wooden crates tucked neatly beside the side/front flank.
  if(SUPPLY_BUILDINGS.has(entity.type)&&size.x>=1.6){
    const sideX=center.x+hx+.24,baseZ=center.z+hz*.32;
    detailMesh(root,boxGeo,crateWood,sideX,.26,baseZ,.46,.44,.44);
    detailMesh(root,cylGeo,wood,sideX+.02,.30,baseZ-.52,.21,.52,.21);
    if(age>=2&&entity.type!=='house'){
      detailMesh(root,boxGeo,crateWood,sideX-.04,.64,baseZ-.04,.34,.32,.34);
    }
  }

  // 6. Stone hearth chimney stack rising cleanly beside the roof ridge (Feudal+ on houses, workshops, blacksmiths).
  if(age>=1&&CHIMNEY_BUILDINGS.has(entity.type)&&!roof.isEmpty()){
    const chTop=Math.max(eaveY+.75,roof.max.y+.36),chBase=Math.max(.4,eaveY*.55),chH=Math.max(.7,chTop-chBase);
    const cx=center.x-hx*.52,cz=center.z-hz*.45;
    detailMesh(root,boxGeo,stoneDark||stone,cx,chBase+chH*.5,cz,.44,chH,.44);
    detailMesh(root,boxGeo,stone,cx,chTop+.08,cz,.54,.16,.54);
  }

  // 7. Hanging heraldic faction banners on fortified / military / civic landmarks (Castle+ & Imperial+).
  if(age>=2&&BANNER_BUILDINGS.has(entity.type)&&eaveY>=1.7){
    const bannerY=Math.max(1.25,eaveY*.68),bannerZ=center.z+hz+.16;
    const spanX=Math.min(hx*.52,1.15);
    for(const sx of [-1,1]){
      const bx=center.x+sx*spanX;
      detailMesh(root,boxGeo,wood,bx,bannerY+.52,bannerZ,.56,.08,.10);
      detailMesh(root,boxGeo,bannerMat,bx,bannerY,bannerZ+.02,.44,.94,.06);
      if(age>=3)detailMesh(root,boxGeo,stone,bx,bannerY+.60,bannerZ,.16,.14,.16);
    }
  }

  // 8. Winter biome roof-eave icicles (tundra/winter maps only).
  if(snow&&!roof.isEmpty()){
    const ice=icicleMaterial(view),ry=Math.max(1.2,roof.min.y-.13);
    const rCenter=roof.getCenter(new THREE.Vector3()),rSize=roof.getSize(new THREE.Vector3());
    const spanX=Math.max(.6,rSize.x*.36),edgeZ=rCenter.z+rSize.z*.48;
    for(let i=-2;i<=2;i++){
      const ic=detailMesh(root,coneGeo,ice,rCenter.x+(i/2)*spanX,ry,edgeZ,.065,.28+(Math.abs(i)%2)*.14,.065);
      ic.rotation.x=Math.PI;
    }
  }

  return root;
}
