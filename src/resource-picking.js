import * as THREE from 'three';

// Open branch/leaf geometry still needs an easy-to-hit central volume. This
// fallback is used only after real meshes miss, and obeys existing visibility.
export function pickFruitVolume(view){
  const sphere=view.fruitPickSphere??=new THREE.Sphere(),point=view.fruitPickPoint??=new THREE.Vector3(),ray=view.raycaster.ray;
  let nearest=null,distance=Infinity;
  for(const e of view.sim.entities){
    if(e.hp<=0||e.kind!=='resource'||e.type!=='food'||e.water||!view.sim.isVisible(e.x,e.z))continue;
    const node=view.nodes.get(e.id);if(!node||!node.visible)continue;
    sphere.center.copy(node.position);sphere.center.y+=.7*node.scale.y;sphere.radius=Math.max(.7,(e.r||1.7)*.72)*node.scale.x;
    if(!ray.intersectSphere(sphere,point))continue;const depth=point.distanceTo(ray.origin);
    if(depth<distance){nearest=e;distance=depth;}
  }
  return nearest;
}
