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
  Object.freeze({height:1,width:1,tint:[1,1,1],label:'frontier'}),
  Object.freeze({height:1.06,width:1.02,tint:[.94,.95,.97],label:'feudal'}),
  Object.freeze({height:1.15,width:1.06,tint:[.86,.88,.92],label:'castle'}),
  Object.freeze({height:1.24,width:1.1,tint:[.80,.83,.88],label:'imperial'}),
]);
export function architectureStyle(age){return STYLES[Math.max(0,Math.min(3,Math.round(age||0)))];}
export function architectureAge(sim,entity){return Math.max(0,Math.min(3,sim?.players?.[entity?.owner]?.age||0));}
// Surface classes baked into structureSurface.z by bakeSurface: 1 timber,
// 2 masonry, 3 plaster, 4 roof. Ageing promotes the wall material itself, which
// is the cue that actually reads as an age advance: timber palisade work gives
// way to plaster and then to dressed stone. Roofs and unclassified surfaces are
// left alone so team colours and glazing keep their meaning.
export function ageSurface(mode,age){
  if(mode===1)return age>=1?3:1;
  if(mode===3)return age>=3?2:3;
  return mode;
}
// A node with no age tag must be rebuilt once; -1 guarantees that without
// rebuilding every frame (which an undefined tag would otherwise cause).
export function architectureOutdated(sim,entity,node){
  if(entity?.kind!=='building'||!node?.userData?.model3d)return false;
  if(entity.type!=='towncenter'&&!isAgeStyled(entity.type))return false;
  return (node.userData.model3d.architectureAge??-1)!==architectureAge(sim,entity);
}

// Age is expressed through massing and the baked masonry tint. Earlier
// revisions scattered box "ornaments" around the roofline; they used the
// darker stone material and were then darkened again by the age tint, so they
// read as black untextured cubes that grew with every age. They are gone until
// real per-age silhouettes can be authored in Blender.
export function applyArchitectureAge(view,root,entity,age){
  if(!root||!entity||age<=0)return root;
  const style=architectureStyle(age);
  root.userData.model3d={...root.userData.model3d,architectureAge:age,architectureLabel:style.label};
  root.scale.set(style.width,style.height,style.width);
  return root;
}
