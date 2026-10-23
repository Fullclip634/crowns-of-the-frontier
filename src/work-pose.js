import {Matrix4,Vector3,Quaternion,Euler} from 'three';
import {baseActionJointRotation} from './action-poses.js';

// Geometry coordinates are the released adult figure's actual joints. These
// remain common to all detail tiers; tool patches preserve those body buffers.
const torsoPivot=new Vector3(0,1.28,0),rightShoulder=new Vector3(.35,1.925,0),rightElbow=new Vector3(.46,1.63,.035),rightGrip=new Vector3(.50,1.3725,.115),leftShoulder=new Vector3(-.35,1.925,0),leftElbow=new Vector3(-.46,1.63,.035),leftGrip=new Vector3(-.50,1.3725,.115),upperRest=leftElbow.clone().sub(leftShoulder),lowerRest=leftGrip.clone().sub(leftElbow),upperLength=upperRest.length(),lowerLength=lowerRest.length();
const angles={x:0,y:0,z:0},rotation=new Matrix4(),torsoMatrix=new Matrix4(),armMatrix=new Matrix4(),toolRotation=new Matrix4(),inverse=new Matrix4(),jointMatrix=new Matrix4(),forward=new Matrix4(),back=new Matrix4(),euler=new Euler(),grip=new Vector3(),shaft=new Vector3(),target=new Vector3(),delta=new Vector3(),direction=new Vector3(),perpendicular=new Vector3(),wantedElbow=new Vector3(),temporary=new Vector3(),upperQ=new Quaternion(),lowerQ=new Quaternion(),inverseQ=new Quaternion();
const definitions={torso:{type:'torso',side:1},arm:{type:'arm',side:1},forearm:{type:'forearm',side:1},workerTool:{type:'workerTool',side:1},leftArm:{type:'arm',side:-1},leftForearm:{type:'forearm',side:-1}};
const around=(pivot,rot,out)=>out.copy(forward.makeTranslation(pivot.x,pivot.y,pivot.z)).multiply(rot).multiply(back.makeTranslation(-pivot.x,-pivot.y,-pivot.z));
const setAngles=(out,values)=>{out.x=values.x;out.y=values.y;out.z=values.z;};
function prepare(state){
  const cached=state.workPose;if(cached&&cached.phase===state.phase&&cached.blend===state.blend&&cached.task===state.task)return cached;
  const pose=state.workPose??={rightArm:{},leftArm:{},leftForearm:{},tool:{},phase:NaN,blend:NaN,task:null};pose.phase=state.phase;pose.blend=state.blend;pose.task=state.task;
  const weight=state.blend;let strokeX=0;
  baseActionJointRotation(state,definitions.torso,angles);strokeX+=angles.x;rotation.makeRotationFromEuler(euler.set(angles.x,angles.y,angles.z));around(torsoPivot,rotation,torsoMatrix);armMatrix.copy(torsoMatrix);
  baseActionJointRotation(state,definitions.arm,angles);strokeX+=angles.x;angles.x-=.4*weight;angles.y-=.3*weight;angles.z-=weight;setAngles(pose.rightArm,angles);rotation.makeRotationFromEuler(euler.set(angles.x,angles.y,angles.z));armMatrix.multiply(around(rightShoulder,rotation,jointMatrix));
  baseActionJointRotation(state,definitions.forearm,angles);strokeX+=angles.x;rotation.makeRotationFromEuler(euler.set(angles.x,angles.y,angles.z));armMatrix.multiply(around(rightElbow,rotation,jointMatrix));
  baseActionJointRotation(state,definitions.workerTool,angles);strokeX+=angles.x;
  // Orient the wrist independently, keeping the blade in the forward stroke
  // plane while the right arm brings the handle toward the body's center.
  toolRotation.makeRotationX(strokeX-.2*weight);inverse.extractRotation(armMatrix).invert();rotation.multiplyMatrices(inverse,toolRotation);euler.setFromRotationMatrix(rotation);setAngles(pose.tool,euler);
  grip.copy(rightGrip).applyMatrix4(armMatrix);shaft.set(0,1,0).transformDirection(toolRotation);target.copy(grip).addScaledVector(shaft,-.15);
  inverse.copy(torsoMatrix).invert();target.applyMatrix4(inverse);delta.copy(target).sub(leftShoulder);const requested=delta.length(),distance=Math.max(Math.abs(upperLength-lowerLength)+.00001,Math.min(requested,upperLength+lowerLength-.00001));direction.copy(delta).normalize();target.copy(leftShoulder).addScaledVector(direction,distance);
  const along=(upperLength*upperLength-lowerLength*lowerLength+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,upperLength*upperLength-along*along));perpendicular.set(-.3,-1,0).addScaledVector(direction,-temporary.set(-.3,-1,0).dot(direction)).normalize();wantedElbow.copy(leftShoulder).addScaledVector(direction,along).addScaledVector(perpendicular,height);
  upperQ.setFromUnitVectors(temporary.copy(upperRest).normalize(),delta.copy(wantedElbow).sub(leftShoulder).normalize());inverseQ.copy(upperQ).invert();lowerQ.setFromUnitVectors(temporary.copy(lowerRest).normalize(),delta.copy(target).sub(wantedElbow).applyQuaternion(inverseQ).normalize());
  euler.setFromQuaternion(upperQ);baseActionJointRotation(state,definitions.leftArm,angles);pose.leftArm.x=angles.x+(euler.x-angles.x)*weight;pose.leftArm.y=angles.y+(euler.y-angles.y)*weight;pose.leftArm.z=angles.z+(euler.z-angles.z)*weight;
  euler.setFromQuaternion(lowerQ);baseActionJointRotation(state,definitions.leftForearm,angles);pose.leftForearm.x=angles.x+(euler.x-angles.x)*weight;pose.leftForearm.y=angles.y+(euler.y-angles.y)*weight;pose.leftForearm.z=angles.z+(euler.z-angles.z)*weight;
  pose.supportReach=requested;pose.supportClamp=Math.max(0,requested-distance);return pose;
}

export function workJointRotation(state,joint,output){
  if(state?.task!=='wood'||!(state.blend>0))return false;
  const pose=prepare(state),values=joint.type==='workerTool'?pose.tool:joint.type==='arm'?(joint.side>0?pose.rightArm:pose.leftArm):joint.type==='forearm'&&joint.side<0?pose.leftForearm:null;
  if(!values)return false;setAngles(output,values);return true;
}
