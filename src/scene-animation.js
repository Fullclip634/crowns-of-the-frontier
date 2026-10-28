// Model decorations are fixed when the scene node is created. Keep their
// references instead of walking every mesh in every building each frame.
const decorations=new WeakMap();
export function animateSceneDecorations(view,node,entity){
  let parts=decorations.get(node);
  if(!parts){parts={flags:[],mills:[],gold:[]};node.traverse(child=>{if(child.userData.flag)parts.flags.push(child);if(child.userData.windmill)parts.mills.push(child);if(entity.kind==='shrine'&&child.material===view.materials.gold)parts.gold.push(child);});decorations.set(node,parts);}
  for(const child of parts.flags)child.rotation.y=Math.sin(view.clock*2+entity.id)*.08;
  if(entity.type==='mill')for(const child of parts.mills)child.rotation.z=view.clock*.4;
  for(const child of parts.gold){child.position.y=Math.sin(view.clock*1.4)*.22;child.rotation.y=view.clock*.4;}
}
