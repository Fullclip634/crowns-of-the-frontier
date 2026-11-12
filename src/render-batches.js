import * as THREE from 'three';
import {animatePart,beginJointPose,endJointPose} from './world-polish.js';
import {writeRigidPose,finishRigidFrame} from './rig-batches.js';
import {releasePreparedPrograms} from './shader-preparation.js';
import {canSubmitFrame,submittedFrame} from './render-flight.js';
import {prepareFootPlacement} from './foot-placement.js';

// Keep allocation slots stable while packing only the current visible poses.
// Picking uses the packed IDs, never the allocator's potentially empty slots.
export function prepareViewport(view){
  view.camera.updateMatrixWorld();
  const projection=view.frameProjection??=new THREE.Matrix4();
  (view.frameFrustum??=new THREE.Frustum()).setFromProjectionMatrix(projection.multiplyMatrices(view.camera.projectionMatrix,view.camera.matrixWorldInverse),view.camera.coordinateSystem);
}

export function beginUnitFrame(view,refreshViewport=true){
  view.jointPoseDiagnostics={computed:0,reused:0};
  view.footDiagnostics={computed:0,reused:0,samples:0};
  if(refreshViewport)prepareViewport(view);
  for(const batch of view.unitBatches.values()){
    batch.renderIds.length=0;
    if(batch.farRenderIds)batch.farRenderIds.length=0;
    for(const part of batch.parts)part.userData.ownerChanged=false;
    for(const part of batch.farParts||[])part.userData.ownerChanged=false;
  }
}

// Prepare the camera before any render extension samples contacts or cargo.
export function installRenderFrame(WorldView){
  const render=WorldView.prototype.render;
  WorldView.prototype.render=function(dt,menu=false){if(this.graphicsRebuilding||this.graphicsFatal||!canSubmitFrame(this))return false;this.renderFrameAt=performance.now();prepareViewport(this);try{const result=render.call(this,dt,menu);submittedFrame(this);return result;}finally{releasePreparedPrograms(this);}};
}

export function markInstancePrefix(mesh,count=mesh.count){
  if(!count)return;
  const attribute=mesh.instanceMatrix;attribute.clearUpdateRanges();attribute.addUpdateRange(0,count*16);attribute.needsUpdate=true;
}

export function nearViewport(view,x,y,z,radius=12){
  if(!view.frameFrustum)return true;
  const sphere=view.frameSphere??=new THREE.Sphere();sphere.center.set(x,y,z);sphere.radius=radius;
  return view.frameFrustum.intersectsSphere(sphere);
}

// A batch owns one near and one far InstancedMesh set. Both share the id
// allocator; only the per-frame packed render list differs.
export function poseTarget(batch,detail='near'){
  const distant=!!(detail==='far'&&batch.farParts?.length);
  return distant
    ?{parts:batch.farParts,renderIds:batch.farRenderIds,distant:true}
    :{parts:batch.parts,renderIds:batch.renderIds,distant:false};
}

export function writeUnitPose(view,batch,e,matrix,shown,detail='near'){
  if(!shown)return false;
  const position=view.framePosition??=new THREE.Vector3();position.setFromMatrixPosition(matrix);
  if(!nearViewport(view,position.x,position.y,position.z))return false;
  const {parts,renderIds}=poseTarget(batch,detail);
  const index=renderIds.length;
  renderIds.push(e.id);
  const body=prepareFootPlacement(view,batch,e,matrix);beginJointPose(view,e,body);
  try{for(const part of parts){
    const root=view.materials?.shadow&&part.material===view.materials.shadow?matrix:body;
    if(part.userData.rigidRig)writeRigidPose(part,index,e,root);else part.setMatrixAt(index,animatePart(view,part,e,root));const owner=part.geometry.getAttribute('instanceOwner'),value=e.owner||0;
    if(owner&&owner.getX(index)!==value){owner.setX(index,value);part.userData.ownerChanged=true;}
  }}finally{endJointPose(view);}
  return true;
}

export function endUnitFrame(view){
  let drawn=0,allocated=0,activeBatches=0,distant=0,matrixUploadBytes=0,ownerUploadBytes=0,capacityMatrixBytes=0,rigUploadBytes=0,rigUsedBytes=0,rigParts=0;
  for(const batch of view.unitBatches.values()){
    allocated+=batch.ids.length-batch.free.length;
    // Near and far instances are packed into separate InstancedMeshes so the
    // decimated geometry is only submitted for the distant subset.
    const sets=[[batch.parts,batch.renderIds,false]];
    if(batch.farParts?.length)sets.push([batch.farParts,batch.farRenderIds,true]);
    let batchDrawn=0;
    for(const [parts,renderIds,isDistant] of sets){
      const count=renderIds.length;drawn+=count;batchDrawn+=count;if(isDistant)distant+=count;
      for(const part of parts){part.count=count;part.visible=count>0;if(part.userData.rigidRig){const rig=finishRigidFrame(part,count);rigUploadBytes+=rig.uploaded;rigUsedBytes+=rig.used;rigParts++;}else{markInstancePrefix(part,count);matrixUploadBytes+=count*16*4;}part.boundingSphere=null;capacityMatrixBytes+=part.instanceMatrix.array.byteLength;const owner=part.geometry.getAttribute('instanceOwner');if(owner&&part.userData.ownerChanged&&count){owner.clearUpdateRanges();owner.addUpdateRange(0,count);owner.needsUpdate=true;ownerUploadBytes+=count*4;}}
    }
    if(batchDrawn)activeBatches++;
  }
  view.unitRenderDiagnostics={drawn,allocated,activeBatches,distant,matrixUploadBytes,ownerUploadBytes,capacityMatrixBytes,rigParts,rigUploadBytes,rigUsedBytes};
}
