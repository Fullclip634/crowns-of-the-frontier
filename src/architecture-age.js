import * as THREE from 'three';

// Age-driven architecture. Only the Town Center has four authored Blender
// variants; every other landmark reuses its single authored base and gains
// age-specific massing, masonry tint and crenellation/buttress detailing.
// Geometry is merged by packBuildingModel, so each building stays one draw
// call and the runtime catalogue validation remains satisfied.

export const AGE_STYLED_BUILDINGS=Object.freeze([
  'keep','tower','barracks','wonder','monastery','market','workshop','stable','range','blacksmith','mill','camp','mine'
]);
export function isAgeStyled(type){return AGE_STYLED_BUILDINGS.includes(type);}

const STYLES=Object.freeze([
  Object.freeze({height:1,width:1,tint:[1,1,1],ornaments:0,label:'frontier'}),
  Object.freeze({height:1.06,width:1.02,tint:[.94,.95,.97],ornaments:2,label:'feudal'}),
  Object.freeze({height:1.15,width:1.06,tint:[.86,.88,.92],ornaments:4,label:'castle'}),
  Object.freeze({height:1.24,width:1.1,tint:[.80,.83,.88],ornaments:6,label:'imperial'}),
]);
export function architectureStyle(age){return STYLES[Math.max(0,Math.min(3,Math.round(age||0)))];}
export function architectureAge(sim,entity){return Math.max(0,Math.min(3,sim?.players?.[entity?.owner]?.age||0));}
// A node with no age tag must be rebuilt once; -1 guarantees that without
// rebuilding every frame (which an undefined tag would otherwise cause).
export function architectureOutdated(sim,entity,node){
  if(entity?.kind!=='building'||!node?.userData?.model3d)return false;
  if(entity.type!=='towncenter'&&!isAgeStyled(entity.type))return false;
  return (node.userData.model3d.architectureAge??-1)!==architectureAge(sim,entity);
}

// Adds a small number of merged stone details that change the silhouette per
// age without new models, textures or materials.
export function applyArchitectureAge(view,root,entity,age){
  if(!root||!entity||age<=0)return root;
  const style=architectureStyle(age),radius=entity.r||2.5,count=style.ornaments;
  root.userData.model3d={...root.userData.model3d,architectureAge:age,architectureLabel:style.label};
  const material=view.materials?.stoneDark||view.materials?.stone;
  if(!material||!view.geo?.box)return root;
  const ornaments=new THREE.Group();
  for(let i=0;i<count;i++){
    const angle=(i/count)*Math.PI*2+Math.PI/count;
    const mesh=new THREE.Mesh(view.geo.box,material);
    // Local coordinates: root.scale already carries the age massing, so the
    // ornaments must not be pre-scaled or they would float above the roofline.
    mesh.position.set(Math.cos(angle)*radius*.82,2.6+age*.35,Math.sin(angle)*radius*.82);
    mesh.scale.set(.52+age*.06,.7+age*.18,.52+age*.06);
    mesh.userData.architectureDetail=true;
    ornaments.add(mesh);
  }
  // Keep the extra mass inside the existing merged-material batch.
  root.add(ornaments);
  root.scale.set(style.width,style.height,style.width);
  return root;
}
