import {Box3,Vector3} from 'three';

// The hand and tool used to share an elbow joint. A separate grip joint lets
// the blade turn toward its contact while the hand stays attached to the arm.
export function bindWorkerToolJoints(model){
  model.updateMatrixWorld(true);let hand;
  model.traverse(part=>{if(part.isMesh&&part.userData.assetMaterial==='skin'&&part.userData.motion?.type==='forearm'&&part.userData.motion.side>0)hand=part;});
  if(!hand)return 0;
  const grip=new Box3().setFromObject(hand).getCenter(new Vector3()).toArray();let count=0;
  model.traverse(part=>{const motion=part.userData.motion;if(!part.isMesh||motion?.type!=='forearm'||motion.side<0||!['wood','steel','iron'].includes(part.userData.assetMaterial))return;
    part.userData.motion={type:'workerTool',side:1,pivot:grip,parent:motion};count++;
  });return count;
}
