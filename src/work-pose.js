import {Matrix4,Vector3,Quaternion,Euler} from 'three';
import {baseActionJointRotation} from './action-poses.js';

// Geometry coordinates are the released adult figure's actual joints. These
// remain common to all detail tiers; tool patches preserve those body buffers.
const torsoPivot=new Vector3(0,1.28,0),rightShoulder=new Vector3(.35,1.925,0),rightElbow=new Vector3(.46,1.63,.035),rightGrip=new Vector3(.50,1.3725,.115),leftShoulder=new Vector3(-.35,1.925,0),leftElbow=new Vector3(-.46,1.63,.035),leftGrip=new Vector3(-.50,1.3725,.115),upperRest=leftElbow.clone().sub(leftShoulder),lowerRest=leftGrip.clone().sub(leftElbow),upperLength=upperRest.length(),lowerLength=lowerRest.length();
const angles={x:0,y:0,z:0},rotation=new Matrix4(),torsoMatrix=new Matrix4(),armMatrix=new Matrix4(),toolRotation=new Matrix4(),inverse=new Matrix4(),jointMatrix=new Matrix4(),forward=new Matrix4(),back=new Matrix4(),euler=new Euler(),grip=new Vector3(),shaft=new Vector3(),target=new Vector3(),delta=new Vector3(),direction=new Vector3(),perpendicular=new Vector3(),wantedElbow=new Vector3(),temporary=new Vector3(),upperQ=new Quaternion(),lowerQ=new Quaternion(),inverseQ=new Quaternion();
const definitions={torso:{type:'torso',side:1},arm:{type:'arm',side:1},forearm:{type:'forearm',side:1},workerTool:{type:'workerTool',side:1},leftArm:{type:'arm',side:-1},leftForearm:{type:'forearm',side:-1}};
const around=(pivot,rot,out)=>out.copy(forward.makeTranslation(pivot.x,pivot.y,pivot.z)).multiply(rot).multiply(back.makeTranslation(-pivot.x,-pivot.y,-pivot.z));
const setAngles=(out,values)=>{out.x=values.x;out.y=values.y;out.z=values.z;};
const miningSamples=512,miningJoints=['rightArm','leftArm','leftForearm','tool'];
let miningCurve=null;

function sampleMiningPose(state,pose){
  const sample=Math.max(0,Math.min(1,state.phase))*miningSamples,index=Math.min(miningSamples-1,Math.floor(sample)),mix=sample-index,start=index*18,next=start+18;
  for(let joint=0;joint<miningJoints.length;joint++){
    const a=start+joint*4,b=next+joint*4;
    // Adjacent quaternions share a hemisphere. Normalized interpolation keeps
    // the short rotation continuous across Euler wraps and the cycle seam.
    upperQ.set(miningCurve[a]+(miningCurve[b]-miningCurve[a])*mix,miningCurve[a+1]+(miningCurve[b+1]-miningCurve[a+1])*mix,miningCurve[a+2]+(miningCurve[b+2]-miningCurve[a+2])*mix,miningCurve[a+3]+(miningCurve[b+3]-miningCurve[a+3])*mix).normalize();
    euler.setFromQuaternion(upperQ);setAngles(pose[miningJoints[joint]],euler);
  }
  pose.supportReach=miningCurve[start+16]+(miningCurve[next+16]-miningCurve[start+16])*mix;
  pose.supportClamp=miningCurve[start+17]+(miningCurve[next+17]-miningCurve[start+17])*mix;
  return pose;
}

function prepare(state){
  const cached=state.workPose;if(cached&&cached.phase===state.phase&&cached.blend===state.blend&&cached.task===state.task)return cached;
  const pose=state.workPose??={rightArm:{},leftArm:{},leftForearm:{},tool:{},phase:NaN,blend:NaN,task:null};pose.phase=state.phase;pose.blend=state.blend;pose.task=state.task;
  if(miningCurve&&state.task==='mine'&&state.blend>=1-1e-6)return sampleMiningPose(state,pose);
  const weight=state.blend;let strokeX=0;
  baseActionJointRotation(state,definitions.torso,angles);strokeX+=angles.x;rotation.makeRotationFromEuler(euler.set(angles.x,angles.y,angles.z));around(torsoPivot,rotation,torsoMatrix);armMatrix.copy(torsoMatrix);
  baseActionJointRotation(state,definitions.arm,angles);strokeX+=angles.x;angles.x-=.4*weight;angles.y-=.3*weight;angles.z-=weight;setAngles(pose.rightArm,angles);rotation.makeRotationFromEuler(euler.set(angles.x,angles.y,angles.z));armMatrix.multiply(around(rightShoulder,rotation,jointMatrix));
  baseActionJointRotation(state,definitions.forearm,angles);strokeX+=angles.x;rotation.makeRotationFromEuler(euler.set(angles.x,angles.y,angles.z));armMatrix.multiply(around(rightElbow,rotation,jointMatrix));
  baseActionJointRotation(state,definitions.workerTool,angles);strokeX+=angles.x;
  // Orient the wrist independently, keeping the blade in the forward stroke
  // plane while the right arm brings the handle toward the body's center.
  toolRotation.makeRotationX(strokeX-.2*weight);
  if(state.task==='mine')toolRotation.multiply(rotation.makeRotationY(-Math.PI/2*weight));
  inverse.extractRotation(armMatrix).invert();rotation.multiplyMatrices(inverse,toolRotation);euler.setFromRotationMatrix(rotation);setAngles(pose.tool,euler);
  grip.copy(rightGrip).applyMatrix4(armMatrix);shaft.set(0,1,0).transformDirection(toolRotation);target.copy(grip).addScaledVector(shaft,-.15);
  inverse.copy(torsoMatrix).invert();target.applyMatrix4(inverse);delta.copy(target).sub(leftShoulder);const requested=delta.length(),distance=Math.max(Math.abs(upperLength-lowerLength)+.00001,Math.min(requested,upperLength+lowerLength-.00001));direction.copy(delta).normalize();target.copy(leftShoulder).addScaledVector(direction,distance);
  const along=(upperLength*upperLength-lowerLength*lowerLength+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,upperLength*upperLength-along*along));perpendicular.set(-.3,-1,0).addScaledVector(direction,-temporary.set(-.3,-1,0).dot(direction)).normalize();wantedElbow.copy(leftShoulder).addScaledVector(direction,along).addScaledVector(perpendicular,height);
  upperQ.setFromUnitVectors(temporary.copy(upperRest).normalize(),delta.copy(wantedElbow).sub(leftShoulder).normalize());inverseQ.copy(upperQ).invert();lowerQ.setFromUnitVectors(temporary.copy(lowerRest).normalize(),delta.copy(target).sub(wantedElbow).applyQuaternion(inverseQ).normalize());
  euler.setFromQuaternion(upperQ);baseActionJointRotation(state,definitions.leftArm,angles);pose.leftArm.x=angles.x+(euler.x-angles.x)*weight;pose.leftArm.y=angles.y+(euler.y-angles.y)*weight;pose.leftArm.z=angles.z+(euler.z-angles.z)*weight;
  euler.setFromQuaternion(lowerQ);baseActionJointRotation(state,definitions.leftForearm,angles);pose.leftForearm.x=angles.x+(euler.x-angles.x)*weight;pose.leftForearm.y=angles.y+(euler.y-angles.y)*weight;pose.leftForearm.z=angles.z+(euler.z-angles.z)*weight;
  pose.supportReach=requested;pose.supportClamp=Math.max(0,requested-distance);return pose;
}

export function workJointRotation(state,joint,output){
  const task=state?.task;if(task!=='wood'&&task!=='mine'||!(state.blend>0))return false;
  const key=joint.type==='workerTool'?'tool':joint.type==='arm'?(joint.side>0?'rightArm':'leftArm'):joint.type==='forearm'&&joint.side<0?'leftForearm':null;
  if(!key)return false;setAngles(output,prepare(state)[key]);return true;
}

// Bake once during module loading, before the battlefield starts. A small CPU
// rotation table avoids solving two arm chains per miner per rendered frame.
// Starting and stopping still use the analytic solver at the actual blend.
{
  const curve=new Float32Array((miningSamples+1)*18),state={task:'mine',blend:1,phase:0};
  for(let sample=0;sample<=miningSamples;sample++){
    state.phase=sample/miningSamples;const pose=prepare(state),start=sample*18;
    for(let joint=0;joint<miningJoints.length;joint++){
      const value=pose[miningJoints[joint]],offset=start+joint*4;upperQ.setFromEuler(euler.set(value.x,value.y,value.z));
      if(sample&&upperQ.x*curve[offset-18]+upperQ.y*curve[offset-17]+upperQ.z*curve[offset-16]+upperQ.w*curve[offset-15]<0)upperQ.set(-upperQ.x,-upperQ.y,-upperQ.z,-upperQ.w);
      upperQ.toArray(curve,offset);
    }
    curve[start+16]=pose.supportReach;curve[start+17]=pose.supportClamp;
  }
  miningCurve=curve;
}
