// Age-driven architecture. Only the Town Center has four authored Blender
// variants; every other landmark reuses its single authored base and gains
// age-specific massing and a heavier masonry tint. Geometry is merged by
// packBuildingModel, so each building stays one draw call and the runtime
// catalogue validation remains satisfied.

export const AGE_STYLED_BUILDINGS=Object.freeze([
  'house','keep','tower','barracks','wonder','monastery','market','workshop','stable','range','blacksmith','mill','camp','mine'
]);
export function isAgeStyled(type){return AGE_STYLED_BUILDINGS.includes(type);}

const STYLES=Object.freeze([
  // The first age is deliberately under-built: lower walls and a flatter roof
  // than the authored model, so a Dark Age town reads as a settlement that has
  // not yet been raised in stone rather than a castle that is merely tinted.
  Object.freeze({height:.82,width:.93,pitch:.88,tint:[1,1,1],roof:[1,1,1],label:'frontier'}),
  Object.freeze({height:1.12,width:1.02,pitch:1.12,tint:[.95,.96,.98],roof:[1.06,.92,.78],label:'feudal'}),
  Object.freeze({height:1.25,width:1.07,pitch:1.25,tint:[.87,.89,.93],roof:[.86,.89,.97],label:'castle'}),
  Object.freeze({height:1.40,width:1.12,pitch:1.38,tint:[.80,.84,.90],roof:[.79,.83,.96],label:'imperial'}),
]);
export function architectureStyle(age){return STYLES[Math.max(0,Math.min(3,Math.round(age||0)))];}
export function architectureAge(sim,entity){return Math.max(0,Math.min(3,sim?.players?.[entity?.owner]?.age||0));}
// Surface classes baked into structureSurface.z by bakeSurface: 1 timber,
// 2 masonry, 3 plaster, 4 roof. Ageing promotes the wall material itself, which
// is the cue that actually reads as an age advance: timber palisade work gives
// way to plaster and then to dressed stone. Roofs and unclassified surfaces are
// left alone so team colours and glazing keep their meaning.
export function ageSurface(mode,age){
  // Timber is the Dark Age itself, so a building authored in plaster is pulled
  // back down to timberwork until the Feudal Age. Without that the first age
  // looked exactly like the last one, which is what "the starting age does not
  // read as an age" meant.
  if(mode===1)return age>=3?2:age>=1?3:1;
  if(mode===3)return age>=3?2:age===0?1:3;
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
