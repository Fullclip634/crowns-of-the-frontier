import {UNITS} from './data.js';

// A finger often misses the narrow triangles between an actor's limbs. Only
// use the nearby friendly actor when the normal mesh pick found no target.
export function touchUnitAt(view,x,y,radius=22){
  const rect=view.renderer.domElement.getBoundingClientRect(),point=view.camera.position.clone();let nearest=null,best=radius*radius;
  for(const unit of view.sim.owned(0,'unit')){if(unit.embarked)continue;const definition=UNITS[unit.type],wx=unit.renderX??unit.x,wz=unit.renderZ??unit.z,height=definition.naval?1.5:definition.role==='cavalry'?1.8:1.2;
    point.set(wx,view.entityHeight(unit,wx,wz)+height,wz).project(view.camera);if(point.z<-1||point.z>1)continue;
    const px=rect.left+(point.x+1)*rect.width/2,py=rect.top+(1-point.y)*rect.height/2,d=(px-x)**2+(py-y)**2;
    if(d<best){best=d;nearest=unit;}
  }return nearest;
}
