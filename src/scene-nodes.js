import {nearViewport} from './render-batches.js';

// Include silhouettes and nearby shadow casters before they enter the view.
// Trees have their own instanced forest residency and do not use this path.
export function sceneNodeNear(view,entity,margin=24){
  const building=entity.kind==='building',height=building?12:8;
  return nearViewport(view,entity.x,view.entityHeight(entity)+height*.5,entity.z,(entity.r||1)+height+margin);
}

export function releaseSceneNode(view,entity,node){
  if(!node)return;
  if(node.userData.batch){const {batch,index}=node.userData;if(batch.ids[index]!==null){batch.ids[index]=null;batch.free.push(index);}}
  view.releaseNode(node);node.removeFromParent();view.nodes.delete(entity.id);
}

export function sceneNodeFor(view,entity,visible){
  let node=view.nodes.get(entity.id);
  if(entity.hp<=0){releaseSceneNode(view,entity,node);return null;}
  if(!sceneNodeNear(view,entity)){
    delete entity.renderX;delete entity.renderZ;
    if(node){
      node.visible=false;node.userData.offscreenAt??=view.clock;
      if(view.clock-node.userData.offscreenAt>=8&&!view.selection.has(entity.id)&&!sceneNodeNear(view,entity,56))releaseSceneNode(view,entity,node);
    }
    return null;
  }
  if(!node){if(!visible||entity.embarked)return null;node=view.createNode(entity);}
  delete node.userData.offscreenAt;
  return node;
}
