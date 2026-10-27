import {Matrix4,Vector3,Quaternion} from 'three';
import {HUMAN_STRIDE} from './locomotion.js';
import {prepareMountedFooting,mountedPartPose} from './mounted-footing.js';

// Released adult figure joints. Boots and calf cuffs meet at the ankle; their
// source geometry is retained and only the boot's motion chain gains a joint.
const hips=[new Vector3(-.18,1.26,0),new Vector3(.18,1.26,0)],knees=[new Vector3(-.18,.73,.01),new Vector3(.18,.73,.01)],ankles=[new Vector3(-.18,.285,.025),new Vector3(.18,.285,.025)];
const upperRest=new Vector3(0,-.53,.01),lowerRest=new Vector3(0,-.445,.015),upperLength=upperRest.length(),lowerLength=lowerRest.length(),reach=upperLength+lowerLength-1e-6;
const up=new Vector3(0,1,0),normal=new Vector3(),target=new Vector3(),delta=new Vector3(),direction=new Vector3(),hint=new Vector3(),kneeTarget=new Vector3(),temp=new Vector3(),upperQ=new Quaternion(),lowerQ=new Quaternion(),inverseQ=new Quaternion(),footQ=new Quaternion(),ankleQ=new Quaternion(),rotation=new Matrix4();
const tau=Math.PI*2,clamp=(value,a,b)=>Math.max(a,Math.min(b,value));

export function bindFootJoints(root){
  if(root.userData.terrainFootRig)return true;
  const boots=[];root.traverse(part=>{const joint=part.userData.motion;if(part.isMesh&&part.userData.assetMaterial==='leather'&&joint?.type==='knee'&&!joint.riding)boots.push(part);});
  if(boots.length!==2||boots[0].userData.motion.side===boots[1].userData.motion.side)return false;
  for(const boot of boots){const joint=boot.userData.motion;boot.userData.motion={type:'ankle',side:joint.side,pivot:ankles[joint.side<0?0:1].toArray(),parent:joint};}
  root.userData.terrainFootRig=true;
  return true;
}

function solveLeg(pose,index,rootY){
  const foot=pose.feet[index],hip=hips[index];normal.set(foot.nx,foot.ny,foot.nz);footQ.setFromUnitVectors(up,normal);target.set(foot.x+normal.x*.285,foot.y-rootY+normal.y*.285,foot.z+normal.z*.285);delta.subVectors(target,hip);
  const requested=delta.length(),length=clamp(requested,Math.abs(upperLength-lowerLength)+1e-6,reach);direction.copy(delta).normalize();target.copy(hip).addScaledVector(direction,length);
  const along=(upperLength*upperLength-lowerLength*lowerLength+length*length)/(2*length),height=Math.sqrt(Math.max(0,upperLength*upperLength-along*along));
  hint.set(0,0,1).addScaledVector(direction,-direction.z).normalize();kneeTarget.copy(hip).addScaledVector(direction,along).addScaledVector(hint,height);
  upperQ.setFromUnitVectors(temp.copy(upperRest).normalize(),delta.subVectors(kneeTarget,hip).normalize());inverseQ.copy(upperQ).invert();
  lowerQ.setFromUnitVectors(temp.copy(lowerRest).normalize(),delta.subVectors(target,kneeTarget).applyQuaternion(inverseQ).normalize());
  ankleQ.copy(upperQ).multiply(lowerQ).invert().multiply(footQ);
  around(pose.root,hip,upperQ,foot.leg);around(foot.leg,knees[index],lowerQ,foot.knee);around(foot.knee,ankles[index],ankleQ,foot.ankle);
  foot.clamp=Math.max(0,requested-length);
}

function around(parent,pivot,quaternion,output){
  rotation.makeRotationFromQuaternion(quaternion);const m=rotation.elements,x=pivot.x,y=pivot.y,z=pivot.z;
  m[12]=x-m[0]*x-m[4]*y-m[8]*z;m[13]=y-m[1]*x-m[5]*y-m[9]*z;m[14]=z-m[2]*x-m[6]*y-m[10]*z;
  output.multiplyMatrices(parent,rotation);
}

export function prepareFootPlacement(view,batch,entity,matrix){
  view.footPoseEntity=null;
  if(batch.model3d?.terrainHorse)return prepareMountedFooting(view,batch,entity,matrix);
  if(!batch.model3d?.terrainFeet||!view.landscape||!view.groundHeight||view.disableFootPlacement||entity.embarked||entity.hp<=0)return matrix;
  const gait=view.locomotion?.get(entity.id),phase=gait?.phase||0,blend=clamp(gait?.blend||0,0,1),m=matrix.elements,x=m[12],z=m[14],y=m[13],cos=m[0],sin=m[8];
  // Unit roots are upright rigid transforms. Other inspection transforms retain
  // their existing pose instead of interpreting their scale as terrain slope.
  if(Math.abs(m[5]-1)>1e-5||Math.abs(cos*cos+sin*sin-1)>1e-5||Math.abs(m[10]-cos)>1e-5||Math.abs(m[2]+sin)>1e-5||Math.abs(m[1])+Math.abs(m[4])+Math.abs(m[6])+Math.abs(m[9])>1e-5)return matrix;
  const states=view.footPoses??=new Map();let pose=states.get(entity.id);
  if(!pose||pose.kind==='horse'){pose={root:new Matrix4(),feet:[-1,1].map(side=>({side,x:side*.18,z:.025,y:0,lift:0,nx:0,ny:1,nz:0,sample:{height:0,dx:0,dz:0},leg:new Matrix4(),knee:new Matrix4(),ankle:new Matrix4(),clamp:0}))};states.set(entity.id,pose);}
  view.footPoseEntity=entity;
  if(pose.landscape===view.landscape&&pose.grid===view.landscape.grid&&pose.x===x&&pose.z===z&&pose.y===y&&pose.cos===cos&&pose.sin===sin&&pose.phase===phase&&pose.blend===blend){if(view.footDiagnostics)view.footDiagnostics.reused++;return pose.root;}
  pose.landscape=view.landscape;pose.grid=view.landscape.grid;pose.x=x;pose.z=z;pose.y=y;pose.cos=cos;pose.sin=sin;pose.phase=phase;pose.blend=blend;
  const ground=y-(gait?.bob||0),sampled=typeof view.landscape.walkableSampleAt==='function',dx=sampled?0:clamp((view.groundHeight(x+.35,z)-ground)/.35,-.6,.6),dz=sampled?0:clamp((view.groundHeight(x,z+.35)-ground)/.35,-.6,.6);
  let rootY=y;
  for(const foot of pose.feet){
    const cycle=((phase+(foot.side<0?Math.PI:0))%tau+tau)%tau,t=cycle/Math.PI,swing=t>1,s=swing?t-1:t;
    const forward=swing?-HUMAN_STRIDE/4+HUMAN_STRIDE/2*s*s*(3-2*s):HUMAN_STRIDE/4-HUMAN_STRIDE/2*s;
    foot.z=.025+forward*blend;foot.lift=swing?Math.sin(Math.PI*s)**2*.16*blend:0;
    const wx=x+cos*foot.x+sin*foot.z,wz=z-sin*foot.x+cos*foot.z;
    let height;if(sampled){const sample=view.landscape.walkableSampleAt(wx,wz,foot.sample),sx=clamp(sample.dx,-.6,.6),sz=clamp(sample.dz,-.6,.6);height=sample.height;normal.set(-sx*cos+sz*sin,1,-sx*sin-sz*cos).normalize();}
    else{height=view.groundHeight(wx,wz);normal.set(-dx*cos+dz*sin,1,-dx*sin-dz*cos).normalize();}
    foot.nx=normal.x;foot.ny=normal.y;foot.nz=normal.z;
    foot.y=ground+clamp(height-ground,-.3,.3)+foot.lift+.002;
    const ax=foot.x+normal.x*.285-hips[foot.side<0?0:1].x,az=foot.z+normal.z*.285;
    rootY=Math.min(rootY,foot.y+normal.y*.285-1.26+Math.sqrt(Math.max(.01,reach*reach-ax*ax-az*az)));
  }
  rootY=Math.max(ground-.55,rootY);pose.root.copy(matrix);pose.root.elements[13]=rootY;pose.bodyOffset=rootY-ground;
  solveLeg(pose,0,rootY);solveLeg(pose,1,rootY);
  if(view.footDiagnostics){view.footDiagnostics.computed++;view.footDiagnostics.samples+=sampled?2:4;}
  return pose.root;
}

export function footPartPose(view,joint,entity,matrix){
  if(joint.type==='horseleg'||joint.type==='horseknee'||joint.type==='horsehoof')return mountedPartPose(view,joint,entity,matrix);
  if(view.footPoseEntity!==entity||view.jointPoseEntity!==entity||joint.riding||joint.type!=='leg'&&joint.type!=='knee'&&joint.type!=='ankle')return null;
  const pose=view.footPoses.get(entity.id);return matrix===pose.root?pose.feet[joint.side<0?0:1][joint.type]:null;
}

export function visualBodyOffset(view,entity){
  const pose=view.footPoses?.get(entity.id);return !view.disableFootPlacement&&pose&&pose.x===(entity.renderX??entity.x)&&pose.z===(entity.renderZ??entity.z)?pose.bodyOffset:0;
}

export function pruneFootPlacements(view,sim){
  if(!view.footPoses?.size)return;const alive=new Set(sim.entities.filter(e=>e.hp>0).map(e=>e.id));for(const id of view.footPoses.keys())if(!alive.has(id))view.footPoses.delete(id);
}
