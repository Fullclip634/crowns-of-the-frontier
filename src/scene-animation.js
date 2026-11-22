// Model decorations are fixed when the scene node is created. Keep their
// references instead of walking every mesh in every building each frame.
const decorations=new WeakMap();
export function animateSceneDecorations(view,node,entity){
  let parts=decorations.get(node);
  if(!parts){parts={flags:[],mills:[],gold:[]};node.traverse(child=>{if(child.userData.flag)parts.flags.push(child);if(child.userData.windmill)parts.mills.push(child);if(entity.kind==='shrine'&&child.material===view.materials.gold)parts.gold.push(child);});decorations.set(node,parts);}
  const reduced=!!view.settings?.reducedMotion;
  const built=(entity.progress??1)>=1;
  if(!reduced){
    for(let i=0;i<parts.flags.length;i++){
      parts.flags[i].rotation.y=Math.sin(view.clock*2.5+entity.id*1.1+i*.85)*.13;
    }
    if(entity.type==='mill'&&built)for(const child of parts.mills)child.rotation.z=view.clock*.62;
  }
  for(const child of parts.gold){child.position.y=Math.sin(view.clock*1.4)*.22;child.rotation.y=view.clock*.4;}
}
