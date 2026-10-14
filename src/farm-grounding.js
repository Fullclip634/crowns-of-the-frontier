import * as THREE from 'three';
const templates=new WeakMap();

// A thin square frame clears the field's timber perimeter. Subdivided edges
// can follow the ground without a bright circular band cutting through crops.
export function farmSelectionGeometry(){
  const positions=[],indices=[],segments=12,inner=.965;
  for(let side=0;side<4;side++)for(let i=0;i<segments;i++){
    const t=i/segments,xy=side===0?[-1+2*t,-1]:side===1?[1,-1+2*t]:side===2?[1-2*t,1]:[-1,1-2*t];
    for(const scale of [1,inner])positions.push(xy[0]*scale,xy[1]*scale,0);
  }
  const count=positions.length/3;
  for(let i=0;i<count;i+=2){const next=(i+2)%count;indices.push(i,next,i+1,next,next+1,i+1);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

// Keep the authored field's stalks, soil and timber geometry; only add the local
// terrain elevation. CPU geometry also keeps picking, clipping and shadows at
// the same positions that are rendered, without a second shader-only surface.
export function fitFarmTerrain(node,landscape,update=false){
  if(node.userData.farmTerrainFitted&&!update)return;
  node.updateMatrixWorld(true);const base=new THREE.Vector3().setFromMatrixPosition(node.matrixWorld).y,point=new THREE.Vector3();
  node.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.geometry.attributes.position)return;
    let geometry=mesh.geometry,state=templates.get(geometry);
    if(!state){const source=geometry;geometry=new THREE.BufferGeometry();
    for(const [name,attribute]of Object.entries(source.attributes)){
      // Unique attribute descriptors own their GPU buffers. Immutable CPU
      // arrays remain shared; position/normal data belongs to this field.
      geometry.setAttribute(name,name==='position'||name==='normal'?attribute.clone():new THREE.BufferAttribute(attribute.array,attribute.itemSize,attribute.normalized).setUsage(attribute.usage));
    }
    if(source.index)geometry.setIndex(new THREE.BufferAttribute(source.index.array,1));
    geometry.groups=source.groups.map(group=>({...group}));geometry.setDrawRange(source.drawRange.start,source.drawRange.count);
    state={position:source.attributes.position};templates.set(geometry,state);mesh.geometry=geometry;
    }
    const inverse=mesh.matrixWorld.clone().invert(),positions=geometry.attributes.position;
    for(let i=0;i<positions.count;i++){
      point.fromBufferAttribute(state.position,i).applyMatrix4(mesh.matrixWorld);point.y+=landscape.surfaceHeightAt(point.x,point.z)-base;point.applyMatrix4(inverse);positions.setXYZ(i,point.x,point.y,point.z);
    }
    positions.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.userData.farmTerrain=true;mesh.geometry=geometry;
  });node.userData.farmTerrainFitted=true;
}
