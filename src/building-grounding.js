import * as THREE from 'three';
const originals=new WeakMap();

export function syncFoundationMaterials(view){
  const source=view.materials.stone,target=view.materials.stoneDark;
  for(const name of ['map','normalMap','roughnessMap'])target[name]=source[name];
  target.normalScale.copy(source.normalScale);target.roughness=source.roughness;target.needsUpdate=true;
}

// The displayed terrain is linear within each grid triangle. Taking the lowest
// vertex of all touched cells bounds its height over the entire footprint,
// including rotated walls and the curves between foundation corners.
export function terrainFloor(landscape,minX,maxX,minZ,maxZ){
  const grid=landscape.grid;
  if(grid){
    const cell=grid.size/grid.segments,origin=-grid.size/2,clamp=value=>Math.max(0,Math.min(grid.segments,value));
    const fromX=clamp(Math.floor((minX-origin)/cell)),toX=clamp(Math.ceil((maxX-origin)/cell)),fromZ=clamp(Math.floor((minZ-origin)/cell)),toZ=clamp(Math.ceil((maxZ-origin)/cell));
    let minimum=Infinity;
    for(let z=fromZ;z<=toZ;z++)for(let x=fromX;x<=toX;x++)minimum=Math.min(minimum,grid.heights[z*(grid.segments+1)+x]);
    return minimum;
  }
  let minimum=Infinity;const columns=Math.max(1,Math.ceil((maxX-minX)/.5)),rows=Math.max(1,Math.ceil((maxZ-minZ)/.5));
  for(let z=0;z<=rows;z++)for(let x=0;x<=columns;x++)minimum=Math.min(minimum,landscape.surfaceHeightAt(minX+(maxX-minX)*x/columns,minZ+(maxZ-minZ)*z/rows));
  return minimum;
}

function privateGeometry(source){
  const geometry=new THREE.BufferGeometry();
  for(const [name,attribute]of Object.entries(source.attributes))geometry.setAttribute(name,['position','normal','uv'].includes(name)?attribute.clone():new THREE.BufferAttribute(attribute.array,attribute.itemSize,attribute.normalized).setUsage(attribute.usage));
  if(source.index)geometry.setIndex(new THREE.BufferAttribute(source.index.array,1).setUsage(source.index.usage));
  geometry.groups=source.groups.map(group=>({...group}));geometry.setDrawRange(source.drawRange.start,source.drawRange.count);return geometry;
}

export function fitBuildingSelectionRing(node,landscape){
  const ring=node.userData.ring;if(!ring)return;
  ring.rotation.z=-node.rotation.y;ring.updateWorldMatrix(true,false);
  const source=originals.get(ring.geometry)||ring.geometry,geometry=privateGeometry(source),positions=geometry.attributes.position,inverse=ring.matrixWorld.clone().invert(),point=new THREE.Vector3();
  for(let i=0;i<positions.count;i++){point.fromBufferAttribute(source.attributes.position,i).applyMatrix4(ring.matrixWorld);point.y=landscape.surfaceHeightAt(point.x,point.z)+.07;point.applyMatrix4(inverse);positions.setXYZ(i,point.x,point.y,point.z);}
  geometry.computeBoundingBox();geometry.computeBoundingSphere();originals.set(geometry,source);ring.geometry=geometry;node.userData.selectionRingFitted=true;
}

// Extend only the existing plinth's underside. Architecture, gate machinery,
// passage width and the authoritative movement/collision model stay intact.
// No extra meshes, materials, texture loads or per-frame terrain work are added.
export function groundBuildingFoundation(node,landscape,update=false){
  if(node.userData.foundationGrounded&&!update)return;
  node.updateMatrixWorld(true);const point=new THREE.Vector3(),baseWorld=new THREE.Vector3().setFromMatrixPosition(node.matrixWorld).y;
  const report={changedMeshes:0,changedVertices:0,lowestGround:null};
  for(const mesh of node.children){
    if(!mesh.isMesh||!mesh.userData.structureSurface)continue;
    const source=originals.get(mesh.geometry)||mesh.geometry;source.computeBoundingBox();const minimum=source.boundingBox.min.y;
    if(minimum>-.3)continue; // Crop beds and wooden piers have separate grounding.
    const positions=source.attributes.position,indices=[],bounds=new THREE.Box3();
    for(let i=0;i<positions.count;i++)if(positions.getY(i)<minimum+.08){indices.push(i);point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);bounds.expandByPoint(point);}
    if(!indices.length)continue;
    const rotated=['wall','gate'].includes(node.userData.model3d?.type);
    if(rotated){const origin=new THREE.Vector3().setFromMatrixPosition(node.matrixWorld),radius=Math.hypot(Math.max(Math.abs(bounds.min.x-origin.x),Math.abs(bounds.max.x-origin.x)),Math.max(Math.abs(bounds.min.z-origin.z),Math.abs(bounds.max.z-origin.z)));bounds.min.x=origin.x-radius;bounds.max.x=origin.x+radius;bounds.min.z=origin.z-radius;bounds.max.z=origin.z+radius;}
    const floor=terrainFloor(landscape,bounds.min.x,bounds.max.x,bounds.min.z,bounds.max.z)-.12;
    const delta=Math.min(0,floor-(baseWorld+minimum));if(delta>=-.005&&mesh.geometry===source)continue;
    const geometry=mesh.geometry===source?privateGeometry(source):mesh.geometry,target=geometry.attributes.position;originals.set(geometry,source);
    for(const index of indices)target.setY(index,positions.getY(index)+delta);
    target.needsUpdate=true;
    geometry.computeVertexNormals();
    // Retain Blender's authored shading on all architecture above the plinth.
    // Recalculating a shared merged mesh must not change roofs or carved stone.
    const authoredNormals=source.attributes.normal,fittedNormals=geometry.attributes.normal;
    if(authoredNormals)for(let i=0;i<positions.count;i++)if(positions.getY(i)>=.21)fittedNormals.setXYZ(i,authoredNormals.getX(i),authoredNormals.getY(i),authoredNormals.getZ(i));
    // Keep masonry courses at a consistent physical scale on an extended
    // footing, rather than stretching a short plinth's UVs down a hillside.
    const uv=geometry.attributes.uv,surfaces=geometry.attributes.structureSurface,normals=geometry.attributes.normal;
    if(uv&&surfaces){for(let i=0;i<positions.count;i++)if(positions.getY(i)<.21&&surfaces.getZ(i)===2){const x=target.getX(i),y=target.getY(i),z=target.getZ(i),nx=Math.abs(normals.getX(i)),ny=Math.abs(normals.getY(i)),nz=Math.abs(normals.getZ(i));uv.setXY(i,(ny>nx&&ny>nz?x:nx>nz?z:x)*.35,(ny>nx&&ny>nz?z:y)*.35);}uv.needsUpdate=true;}
    geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.userData.groundedFoundation=true;mesh.geometry=geometry;
    if(delta<-.005){report.changedMeshes++;report.changedVertices+=indices.length;report.lowestGround=report.lowestGround===null?floor:Math.min(report.lowestGround,floor);}
  }
  node.userData.foundationGrounded=report;return report;
}

export function groundGatePortcullis(node,landscape){
  const gate=node.userData.portcullis;if(!gate||gate.userData.terrainGate)return;
  node.updateMatrixWorld(true);const origin=new THREE.Vector3().setFromMatrixPosition(gate.matrixWorld),bounds=new THREE.Box3().setFromObject(gate),radius=Math.hypot(Math.max(Math.abs(bounds.min.x-origin.x),Math.abs(bounds.max.x-origin.x)),Math.max(Math.abs(bounds.min.z-origin.z),Math.abs(bounds.max.z-origin.z))),floor=terrainFloor(landscape,origin.x-radius,origin.x+radius,origin.z-radius,origin.z+radius)-.12,extension=Math.max(0,bounds.min.y-floor),parts=[];
  gate.traverse(mesh=>{
    if(!mesh.isMesh)return;const source=mesh.geometry;source.computeBoundingBox();const minimum=source.boundingBox.min.y,geometry=privateGeometry(source),positions=geometry.attributes.position;
    for(let i=0;i<positions.count;i++)if(positions.getY(i)<minimum+.08)positions.setY(i,positions.getY(i)-extension);
    geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();mesh.geometry=geometry;parts.push({mesh,closed:positions.array.slice()});
  });
  const roof=new THREE.Vector3().setFromMatrixPosition(node.matrixWorld).y+(node.userData.model3d?.gateHousingHeight||3.5)-origin.y,lowest=bounds.min.y-origin.y-extension;
  gate.userData.terrainGate={parts,roof,openLift:Math.max(2.5,roof-lowest+.02),lastLift:null};updateGatePortcullis(gate);
}

// The bars slide into their existing masonry housing. CPU clipping keeps
// rendered vertices, picking, bounds and shadows at the same positions.
export function updateGatePortcullis(gate){
  const state=gate.userData.terrainGate;if(!state||state.lastLift===gate.position.y)return;
  state.lastLift=gate.position.y;gate.visible=gate.position.y<state.openLift-.005;const ceiling=state.roof-gate.position.y;
  for(const {mesh,closed}of state.parts){const positions=mesh.geometry.attributes.position;let changed=false;
    for(let i=0;i<positions.count;i++){const height=Math.min(closed[i*3+1],ceiling);if(positions.getY(i)!==height){positions.setY(i,height);changed=true;}}
    if(changed){positions.needsUpdate=true;mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();}
  }
}
