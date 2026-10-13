import * as THREE from 'three';
import {WORLD} from './data.js';

export const MAP_HALF=WORLD/2;
export function insideMap(x,z,worldSize=WORLD){return Number.isFinite(x)&&Number.isFinite(z)&&Math.abs(x)<=worldSize/2&&Math.abs(z)<=worldSize/2;}

export function minimapPoint(clientX,clientY,rect,worldSize=WORLD){
  const axis=(value,start,size)=>(Math.max(0,Math.min(1,(value-start)/size))-.5)*worldSize;
  return {x:axis(clientX,rect.left,rect.width),z:axis(clientY,rect.top,rect.height)};
}

// Intersect the square battlefield with the camera frustum on the ground.
// Unlike four corner rays, this also works when the top of the view sees sky.
export function cameraMapFootprint(camera,height=0,worldSize=WORLD){
  const MAP_HALF=worldSize/2;
  const matrix=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  const frustum=new THREE.Frustum().setFromProjectionMatrix(matrix);
  let polygon=[[-MAP_HALF,-MAP_HALF],[MAP_HALF,-MAP_HALF],[MAP_HALF,MAP_HALF],[-MAP_HALF,MAP_HALF]].map(([x,z])=>new THREE.Vector3(x,height,z));
  for(const plane of frustum.planes){
    const clipped=[];
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length],da=plane.distanceToPoint(a),db=plane.distanceToPoint(b);
      if(da>=0)clipped.push(a);
      if((da>=0)!==(db>=0))clipped.push(a.clone().lerp(b,da/(da-db)));
    }
    polygon=clipped;if(!polygon.length)break;
  }
  return polygon;
}

// A rectangular locator is easier to read than the clipped perspective polygon,
// which can gain extra corners at the battlefield edges. It encloses visible ground.
export function cameraMapBox(camera,height=0,worldSize=WORLD){
  const points=cameraMapFootprint(camera,height,worldSize);if(points.length<3)return null;
  const xs=points.map(p=>p.x),zs=points.map(p=>p.z);
  return {minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};
}
