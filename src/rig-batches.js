import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {animatePart} from './world-polish.js';

const rigShader=`attribute float unitJoint;
uniform highp sampler2D frontierRigPoses;
mat4 frontierRigMatrix() {
  int column = int(unitJoint + 0.5) * 4;
  int row = gl_InstanceID;
  return mat4(texelFetch(frontierRigPoses, ivec2(column, row), 0),
              texelFetch(frontierRigPoses, ivec2(column + 1, row), 0),
              texelFetch(frontierRigPoses, ivec2(column + 2, row), 0),
              texelFetch(frontierRigPoses, ivec2(column + 3, row), 0));
}`;

export function applyRigShader(shader,uniform){
  shader.uniforms.frontierRigPoses=uniform;
  shader.vertexShader=rigShader+'\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('void main() {','void main() {\nmat4 frontierPose = frontierRigMatrix();');
  // Match Three.js defaultnormal_vertex's per-instance inverse-scale step.
  // Its omission changes shadowed surface lighting on the tested WebGL driver.
  shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
vec3 frontierPoseScaleSq = vec3(dot(frontierPose[0].xyz, frontierPose[0].xyz),
                                dot(frontierPose[1].xyz, frontierPose[1].xyz),
                                dot(frontierPose[2].xyz, frontierPose[2].xyz));
objectNormal /= frontierPoseScaleSq;
objectNormal = mat3(frontierPose) * objectNormal;`);
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed = (frontierPose * vec4(transformed, 1.0)).xyz;');
}

function allocate(rig,rows){
  const data=new Float32Array(rows*rig.joints.length*16),roots=new Float32Array(rows*16);if(rig.data)data.set(rig.data);if(rig.roots)roots.set(rig.roots);
  const texture=new THREE.DataTexture(data,rig.joints.length*4,rows,THREE.RGBAFormat,THREE.FloatType);texture.needsUpdate=true;texture.generateMipmaps=false;
  rig.texture?.dispose();rig.texture=texture;rig.data=data;rig.roots=roots;rig.rows=rows;rig.uniform.value=texture;
}

// Merge rigid Blender joint groups into one opaque draw without removing a part.
// Pose textures grow with visible instances instead of allocating the population
// ceiling. The same stored matrices drive shading, shadow depth and CPU picking.
export function createRigidUnitPart(view,model,batch){
  const geometries=[],joints=[];let vertex=0,sourceMaterial;
  model.traverse(part=>{
    if(!part.isMesh||part.material.transparent)return;
    sourceMaterial??=part.material;if(part.material!==sourceMaterial)throw new Error('Rigid unit surfaces require the shared palette.');
    let geometry=part.geometry.clone().applyMatrix4(part.matrixWorld);if(geometry.index){const flat=geometry.toNonIndexed();geometry.dispose();geometry=flat;}
    const count=geometry.attributes.position.count;geometry.setAttribute('unitJoint',new THREE.Float32BufferAttribute(new Float32Array(count).fill(joints.length),1));
    joints.push({start:vertex,count,userData:{motion:part.userData.motion}});vertex+=count;geometries.push(geometry);
  });
  if(!joints.length)return null;
  const geometry=mergeGeometries(geometries);for(const part of geometries)part.dispose();if(!geometry)throw new Error('Rigid unit geometry could not merge.');
  geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.setAttribute('instanceOwner',new THREE.InstancedBufferAttribute(new Float32Array(batch.capacity),1).setUsage(THREE.DynamicDrawUsage));
  const rig={joints,uniform:{value:null},batch,view};allocate(rig,Math.min(16,batch.capacity));
  const material=sourceMaterial.clone(),paletteShader=sourceMaterial.onBeforeCompile;material.defines={...sourceMaterial.defines};material.onBeforeCompile=(shader,renderer)=>{
    paletteShader.call(sourceMaterial,shader,renderer);applyRigShader(shader,rig.uniform);
    // Keep the final color write explicit for the vertex-texture + shadow
    // variant. Without it, this WebGL driver darkens unit surfaces in High.
    shader.fragmentShader=shader.fragmentShader.replace('#include <dithering_fragment>','#include <dithering_fragment>\ngl_FragColor = gl_FragColor;');
  };material.customProgramCacheKey=()=>sourceMaterial.customProgramCacheKey()+':rig-v4';
  const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});depth.onBeforeCompile=shader=>applyRigShader(shader,rig.uniform);depth.customProgramCacheKey=()=> 'frontier-rig-depth-v1';
  const mesh=new THREE.InstancedMesh(geometry,material,batch.capacity);mesh.count=0;mesh.frustumCulled=false;mesh.castShadow=mesh.receiveShadow=true;mesh.customDepthMaterial=depth;
  mesh.userData.rigidRig=rig;mesh.userData.unitIds=batch.renderIds;mesh.raycast=(raycaster,intersects)=>raycastRigidPart(mesh,raycaster,intersects);return mesh;
}

export function writeRigidPose(mesh,index,e,matrix){
  const rig=mesh.userData.rigidRig;if(index>=rig.rows)allocate(rig,Math.min(mesh.instanceMatrix.count,Math.max(index+1,rig.rows*2)));
  rig.roots.set(matrix.elements,index*16);const start=index*rig.joints.length*16;
  for(let joint=0;joint<rig.joints.length;joint++)rig.data.set(animatePart(rig.view,rig.joints[joint],e,matrix).elements,start+joint*16);
}

export function finishRigidFrame(mesh,count){const rig=mesh.userData.rigidRig;if(count)rig.texture.needsUpdate=true;return {used:count*rig.joints.length*64,uploaded:count?rig.data.byteLength:0,capacity:rig.data.byteLength,joints:rig.joints.length};}

export function raycastRigidPart(mesh,raycaster,intersects){
  const rig=mesh.userData.rigidRig,geometry=mesh.geometry,root=rig.rootMatrix??=new THREE.Matrix4(),sphere=rig.pickSphere??=new THREE.Sphere(),dummy=rig.pickMesh??=new THREE.Mesh(geometry,mesh.material),hits=rig.pickHits??=[];
  const previous={...geometry.drawRange};
  try{for(let index=0;index<mesh.count;index++){
    root.fromArray(rig.roots,index*16).premultiply(mesh.matrixWorld);sphere.center.setFromMatrixPosition(root);sphere.radius=Math.max(12,geometry.boundingSphere.radius+4)*root.getMaxScaleOnAxis();if(!raycaster.ray.intersectsSphere(sphere))continue;
    for(let joint=0;joint<rig.joints.length;joint++){
      const range=rig.joints[joint];dummy.matrixWorld.fromArray(rig.data,(index*rig.joints.length+joint)*16);dummy.matrixWorld.premultiply(mesh.matrixWorld);geometry.setDrawRange(range.start,range.count);dummy.raycast(raycaster,hits);
      for(const hit of hits){hit.instanceId=index;hit.object=mesh;intersects.push(hit);}hits.length=0;
    }
  }}finally{geometry.setDrawRange(previous.start,previous.count);hits.length=0;}
}

export function disposeRigidPart(mesh){const rig=mesh.userData.rigidRig;if(!rig||rig.disposed)return;rig.disposed=true;rig.texture.dispose();mesh.material.dispose();mesh.customDepthMaterial.dispose();}
