import {Matrix4,Vector3,Quaternion} from 'three';
import {CAVALRY_STRIDE} from './locomotion.js';

// Coordinates match the authored horse shoulder, knee, ankle and flat sole.
// Each opposing front/rear pair shares a phase in the two-beat trot.
const legs=[[-.3,-.58],[-.3,.59],[.3,-.58],[.3,.59]].map(([x,z],index)=>({index,x,z,hip:new Vector3(x,1.18,z),knee:new Vector3(x,.66,z+.04),ankle:new Vector3(x,.2,z-.02)}));
const upperRest=new Vector3(0,-.52,.04),lowerRest=new Vector3(0,-.46,-.06),upperLength=upperRest.length(),lowerLength=lowerRest.length(),reach=upperLength+lowerLength-1e-6;
const up=new Vector3(0,1,0),normal=new Vector3(),target=new Vector3(),delta=new Vector3(),direction=new Vector3(),hint=new Vector3(),kneeTarget=new Vector3(),temp=new Vector3(),hipWorld=new Vector3();
const tiltQ=new Quaternion(),orientation=new Quaternion(),inverseBody=new Quaternion(),upperQ=new Quaternion(),lowerQ=new Quaternion(),inverseQ=new Quaternion(),footQ=new Quaternion(),ankleQ=new Quaternion(),rotation=new Matrix4();
const tau=Math.PI*2,clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function bindMountedFootRig(root){
  if(root.userData.mountedFootRig)return true;
  if(root.userData.model3d?.horseLegRevision!=='articulated-hooves-v1')return false;
  const joints=Array.from({length:4},()=>new Set());root.traverse(part=>{const m=part.userData.motion;if(part.isMesh&&Number.isInteger(m?.legIndex)&&m.legIndex>=0&&m.legIndex<4&&['horseleg','horseknee','horsehoof'].includes(m.type))joints[m.legIndex].add(m.type);});
  if(joints.some(joint=>joint.size!==3))return false;
  root.userData.mountedFootRig=true;return true;
}

function around(parent,pivot,quaternion,output){
  rotation.makeRotationFromQuaternion(quaternion);const m=rotation.elements,x=pivot.x,y=pivot.y,z=pivot.z;
  m[12]=x-m[0]*x-m[4]*y-m[8]*z;m[13]=y-m[1]*x-m[5]*y-m[9]*z;m[14]=z-m[2]*x-m[6]*y-m[10]*z;output.multiplyMatrices(parent,rotation);
}

function solveLeg(pose,foot,rootY){
  const leg=legs[foot.index];normal.set(foot.nx,foot.ny,foot.nz).applyQuaternion(inverseBody);footQ.setFromUnitVectors(up,normal);
  target.set(foot.wx+foot.nx*.2-pose.x,foot.y+foot.ny*.2-rootY,foot.wz+foot.nz*.2-pose.z).applyQuaternion(inverseBody);
  delta.subVectors(target,leg.hip);const requested=delta.length(),length=clamp(requested,Math.abs(upperLength-lowerLength)+1e-6,reach);
  direction.copy(delta).normalize();target.copy(leg.hip).addScaledVector(direction,length);
  const along=(upperLength*upperLength-lowerLength*lowerLength+length*length)/(2*length),height=Math.sqrt(Math.max(0,upperLength*upperLength-along*along)),bend=leg.z>0?1:-1;
  hint.set(0,0,bend).addScaledVector(direction,-direction.z*bend);
  if(hint.lengthSq()<1e-8)hint.set(leg.x<0?-1:1,0,0).addScaledVector(direction,-direction.x*(leg.x<0?-1:1));
  hint.normalize();kneeTarget.copy(leg.hip).addScaledVector(direction,along).addScaledVector(hint,height);
  upperQ.setFromUnitVectors(temp.copy(upperRest).normalize(),delta.subVectors(kneeTarget,leg.hip).normalize());inverseQ.copy(upperQ).invert();
  lowerQ.setFromUnitVectors(temp.copy(lowerRest).normalize(),delta.subVectors(target,kneeTarget).applyQuaternion(inverseQ).normalize());
  ankleQ.copy(upperQ).multiply(lowerQ).invert().multiply(footQ);
  around(pose.root,leg.hip,upperQ,foot.horseleg);around(foot.horseleg,leg.knee,lowerQ,foot.horseknee);around(foot.horseknee,leg.ankle,ankleQ,foot.horsehoof);
  foot.clamp=Math.max(0,requested-length);
}

export function prepareMountedFooting(view,batch,entity,matrix){
  if(!batch.model3d?.terrainHorse||!view.landscape||!view.groundHeight||view.disableFootPlacement||entity.embarked||entity.hp<=0)return matrix;
  const gait=view.locomotion?.get(entity.id),phase=gait?.phase||0,blend=clamp(gait?.blend||0,0,1),m=matrix.elements,x=m[12],z=m[14],y=m[13],cos=m[0],sin=m[8];
  if(Math.abs(m[5]-1)>1e-5||Math.abs(cos*cos+sin*sin-1)>1e-5||Math.abs(m[10]-cos)>1e-5||Math.abs(m[2]+sin)>1e-5||Math.abs(m[1])+Math.abs(m[4])+Math.abs(m[6])+Math.abs(m[9])>1e-5)return matrix;
  const states=view.footPoses??=new Map();let pose=states.get(entity.id);
  if(!pose||pose.kind!=='horse'){
    pose={kind:'horse',root:new Matrix4(),feet:legs.map(leg=>({index:leg.index,sample:{height:0,dx:0,dz:0},horseleg:new Matrix4(),horseknee:new Matrix4(),horsehoof:new Matrix4(),clamp:0}))};states.set(entity.id,pose);
  }
  view.footPoseEntity=entity;
  if(pose.landscape===view.landscape&&pose.grid===view.landscape.grid&&pose.x===x&&pose.z===z&&pose.y===y&&pose.cos===cos&&pose.sin===sin&&pose.phase===phase&&pose.blend===blend){if(view.footDiagnostics)view.footDiagnostics.reused++;return pose.root;}
  pose.landscape=view.landscape;pose.grid=view.landscape.grid;pose.x=x;pose.z=z;pose.y=y;pose.cos=cos;pose.sin=sin;pose.phase=phase;pose.blend=blend;
  const ground=y-(gait?.bob||0),sampled=typeof view.landscape.walkableSampleAt==='function',dx=sampled?0:clamp((view.groundHeight(x+.35,z)-ground)/.35,-.6,.6),dz=sampled?0:clamp((view.groundHeight(x,z+.35)-ground)/.35,-.6,.6);
  let meanX=0,meanZ=0;
  for(const foot of pose.feet){
    const leg=legs[foot.index],cycle=((phase+(leg.x*leg.z>0?Math.PI:0))%tau+tau)%tau,t=cycle/Math.PI,swing=t>1,s=swing?t-1:t;
    const forward=(swing?-CAVALRY_STRIDE/4+CAVALRY_STRIDE/2*s*s*(3-2*s):CAVALRY_STRIDE/4-CAVALRY_STRIDE/2*s)*blend;
    foot.lift=swing?Math.sin(Math.PI*s)**2*.16*blend:0;foot.wx=x+cos*leg.x+sin*(leg.z-.02+forward);foot.wz=z-sin*leg.x+cos*(leg.z-.02+forward);
    let height,sx,sz;if(sampled){const sample=view.landscape.walkableSampleAt(foot.wx,foot.wz,foot.sample);height=sample.height;sx=clamp(sample.dx,-.6,.6);sz=clamp(sample.dz,-.6,.6);}
    else{height=view.groundHeight(foot.wx,foot.wz);sx=dx;sz=dz;}
    meanX+=sx;meanZ+=sz;normal.set(-sx,1,-sz).normalize();foot.nx=normal.x;foot.ny=normal.y;foot.nz=normal.z;foot.y=ground+clamp(height-ground,-.8,.8)+foot.lift+.002;
  }
  const sx=clamp(meanX/4,-.35,.35),sz=clamp(meanZ/4,-.35,.35);normal.set(-sx*cos+sz*sin,1,-sx*sin-sz*cos).normalize();tiltQ.setFromUnitVectors(up,normal);
  orientation.setFromRotationMatrix(matrix).multiply(tiltQ);inverseBody.copy(orientation).invert();pose.root.copy(matrix).multiply(rotation.makeRotationFromQuaternion(tiltQ));
  let rootY=ground-.18*blend+(gait?.bob||0)*.35;
  for(const foot of pose.feet){
    hipWorld.copy(legs[foot.index].hip).applyQuaternion(orientation);
    const hx=foot.wx+foot.nx*.2-x-hipWorld.x,hz=foot.wz+foot.nz*.2-z-hipWorld.z;
    rootY=Math.min(rootY,foot.y+foot.ny*.2-hipWorld.y+Math.sqrt(Math.max(.0001,reach*reach-hx*hx-hz*hz)));
  }
  rootY=Math.max(ground-.55,rootY);pose.root.elements[13]=rootY;pose.bodyOffset=rootY-ground;
  for(const foot of pose.feet)solveLeg(pose,foot,rootY);
  if(view.footDiagnostics){view.footDiagnostics.computed++;view.footDiagnostics.samples+=sampled?4:6;}
  return pose.root;
}

export function mountedPartPose(view,joint,entity,matrix){
  if(view.footPoseEntity!==entity||view.jointPoseEntity!==entity||(joint.type!=='horseleg'&&joint.type!=='horseknee'&&joint.type!=='horsehoof')||!Number.isInteger(joint.legIndex)||joint.legIndex<0||joint.legIndex>3)return null;
  const pose=view.footPoses?.get(entity.id);return pose?.kind==='horse'&&matrix===pose.root?pose.feet[joint.legIndex][joint.type]:null;
}
