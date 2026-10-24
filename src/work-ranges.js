// Work eligibility, resource assignment and animation observation must agree.
// Solid deposits keep their navigation footprint while their exposed height
// depletes. Food selection footprints remain generous; picking and harvesting
// approach the visible fruit and crop rows rather than the selection outline.
const solidResource=target=>target.kind==='resource'&&(target.type==='wood'||target.type==='gold'||target.type==='stone');
const foodSource=target=>target.kind==='building'&&target.type==='farm'||target.kind==='resource'&&target.type==='food'&&!target.water;
export function gatheringRange(worker,target){
  if(foodSource(target))return target.type==='farm'?(target.r||0)+(worker.r||0)-.35:Math.min(target.r||0,1.1)+(worker.r||0)+.15;
  return (target.r||0)+(worker.r||0)+(solidResource(target)?target.type==='wood'?.35:.45:1.1);
}
export function gatheringApproach(worker,target){const close=solidResource(target)||foodSource(target);return gatheringRange(worker,target)-(close ? .15 : .35);}
export function gatheringPathRange(worker,target){return solidResource(target)||foodSource(target)?gatheringApproach(worker,target):0;}
