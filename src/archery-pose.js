import {Matrix4,Vector3,Quaternion,Euler} from 'three';
import {UNITS} from './data.js';
import {releaseDelay} from './combat-timing.js';

export const bowArcher=e=>e.type==='archer'||e.type==='marksman';
export const bowGrip=[-.49321,1.37445,.118967];
export const bowReleasePoint=Object.freeze({x:-.125,y:2.10,z:.525});
const smooth=x=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
const torsoPivot=new Vector3(0,1.28,0),shoulders=[new Vector3(-.35,1.925,0),new Vector3(.35,1.925,0)],elbows=[new Vector3(-.46,1.63,.035),new Vector3(.46,1.63,.035)],grips=[new Vector3(...bowGrip),new Vector3(.4916,1.37445,.118967)];
const pose={leftArm:{},leftForearm:{},rightArm:{},rightForearm:{},left:new Vector3(),right:new Vector3(),nock:new Vector3(),torso:0,draw:0,arrow:true},torsoMatrix=new Matrix4(),inverse=new Matrix4(),rotation=new Matrix4(),forward=new Matrix4(),back=new Matrix4(),delta=new Vector3(),direction=new Vector3(),hint=new Vector3(),target=new Vector3(),wantedElbow=new Vector3(),restUpper=new Vector3(),restLower=new Vector3(),temp=new Vector3(),upper=new Quaternion(),lower=new Quaternion(),inverseQ=new Quaternion(),euler=new Euler();
let lastEntity,lastCooldown,lastOffset,lastOrder,lastMoving,lastType;
const around=(point,m,out)=>out.copy(forward.makeTranslation(point.x,point.y,point.z)).multiply(m).multiply(back.makeTranslation(-point.x,-point.y,-point.z));
function solve(side,point){
 const shoulder=shoulders[side],elbow=elbows[side],grip=grips[side],a=side?'rightArm':'leftArm',b=side?'rightForearm':'leftForearm';target.copy(point).applyMatrix4(inverse);restUpper.subVectors(elbow,shoulder);restLower.subVectors(grip,elbow);const u=restUpper.length(),l=restLower.length();delta.subVectors(target,shoulder);const requested=delta.length(),length=Math.max(Math.abs(u-l)+1e-5,Math.min(requested,u+l-1e-5));direction.copy(delta).normalize();target.copy(shoulder).addScaledVector(direction,length);const along=(u*u-l*l+length*length)/(2*length),height=Math.sqrt(Math.max(0,u*u-along*along));hint.set(side?1:-1,-.4,0);hint.addScaledVector(direction,-hint.dot(direction)).normalize();wantedElbow.copy(shoulder).addScaledVector(direction,along).addScaledVector(hint,height);
 upper.setFromUnitVectors(restUpper.normalize(),delta.subVectors(wantedElbow,shoulder).normalize());inverseQ.copy(upper).invert();lower.setFromUnitVectors(restLower.normalize(),delta.subVectors(target,wantedElbow).applyQuaternion(inverseQ).normalize());euler.setFromQuaternion(upper);Object.assign(pose[a],{x:euler.x,y:euler.y,z:euler.z});euler.setFromQuaternion(lower);Object.assign(pose[b],{x:euler.x,y:euler.y,z:euler.z});
}

// One solved pose is reused by all joints of the current figure. The renderer
// consumes it synchronously; it retains no per-soldier animation map.
export function archeryPose(entity,offset=0){
 if(!bowArcher(entity)||entity.moving||entity.hp<=0||entity.embarked||!(entity.cooldown>0||entity.order?.type==='attack'))return null;
 if(lastEntity===entity&&lastCooldown===entity.cooldown&&lastOffset===offset&&lastOrder===entity.order?.type&&lastMoving===entity.moving&&lastType===entity.type)return pose;
 lastEntity=entity;lastCooldown=entity.cooldown;lastOffset=offset;lastOrder=entity.order?.type;lastMoving=entity.moving;lastType=entity.type;
 const interval=UNITS[entity.type].cooldown||1.2,delay=releaseDelay(entity),age=Math.max(0,interval-(entity.cooldown||0)+offset),progress=age<=delay?smooth(age/delay):1-smooth((age-delay-.16)/(interval-delay-.16));
 pose.torso=1.15*progress;pose.draw=age<=delay?progress:1-smooth((age-delay)/.06);pose.arrow=age<=delay+1e-6||age>=interval-.15;pose.left.set(-.16,1.78+.32*progress,.44+.42*progress);pose.right.set(-.125,pose.left.y,.22-.12*progress);if(age>delay)pose.right.z-=.07*(1-smooth((age-delay)/.22));pose.nock.set(pose.left.x+.035,pose.left.y,pose.left.z-.22-(.76-.22)*pose.draw);
 around(torsoPivot,rotation.makeRotationY(pose.torso),torsoMatrix);inverse.copy(torsoMatrix).invert();solve(0,pose.left);solve(1,pose.right);return pose;
}

export function archeryJointRotation(entity,joint,offset,output){
 const p=archeryPose(entity,offset);if(!p)return false;output.x=output.y=output.z=0;
 const key=joint.type==='arm'?(joint.side<0?'leftArm':'rightArm'):joint.type==='forearm'?(joint.side<0?'leftForearm':'rightForearm'):null;
 if(key){output.x=p[key].x;output.y=p[key].y;output.z=p[key].z;return true;}
 if(joint.type==='torso'){output.y=p.torso;return true;}if(joint.type==='head'){output.y=-p.torso;output.x=-.035;return true;}return false;
}

const yAxis=new Vector3(0,1,0),xAxis=new Vector3(1,0,0),a=new Vector3(),b=new Vector3(),refA=new Vector3(),refB=new Vector3(),scale=new Vector3(),q=new Quaternion(),refQ=new Quaternion(),local=new Matrix4(),reference=new Matrix4(),adjust=new Matrix4();
// Closed stave halves bend at the grip; the two closed strings keep their
// authored length as the limb tips follow the drawn nock.
export function bowPartPose(view,m,entity,matrix,offset){
 const p=archeryPose(entity,offset);if(!p)return null;
 const output=view.bowPoseMatrix??=new Matrix4(),span=m.span,tip=m.part.endsWith('Upper')?1:-1,d=.22+.54*p.draw,r=Math.hypot(span,.2),bend=Math.asin(Math.max(-1,Math.min(1,(d*d-.22*.22+2*.22*.2)/(2*d*r))))-Math.atan2(.2,span);
 if(m.part==='upper'||m.part==='lower'||m.part==='grip'){
  local.makeRotationX(m.part==='upper'?-bend:m.part==='lower'?bend:0);output.copy(matrix).multiply(adjust.makeTranslation(p.left.x,p.left.y,p.left.z)).multiply(local).multiply(adjust.makeTranslation(-m.pivot[0],-m.pivot[1],-m.pivot[2]));return output;
 }
 if(m.part==='stringUpper'||m.part==='stringLower'){
  a.set(0,tip*span,-.2).applyAxisAngle(xAxis,-tip*bend).add(p.left);b.copy(p.nock);refA.fromArray(m.a);refB.fromArray(m.b);const length=temp.subVectors(refB,refA).length();refQ.setFromUnitVectors(yAxis,temp.normalize());q.setFromUnitVectors(yAxis,direction.subVectors(b,a).normalize());local.compose(a,q,scale.set(1,a.distanceTo(b)/length,1));reference.makeRotationFromQuaternion(refQ).invert().multiply(adjust.makeTranslation(-refA.x,-refA.y,-refA.z));return output.copy(matrix).multiply(local).multiply(reference);
 }
 if(m.part==='arrow'){
  const visible=p.arrow?1:.0001;local.makeScale(visible,visible,visible);return output.copy(matrix).multiply(adjust.makeTranslation(p.nock.x,p.nock.y,p.nock.z+.425)).multiply(local).multiply(adjust.makeTranslation(-m.pivot[0]-.035,-m.pivot[1],-m.pivot[2]-.205));
 }return null;
}
