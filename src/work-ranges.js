// Work eligibility, resource assignment and animation observation must agree.
// Solid deposits keep their navigation footprint while their exposed height
// depletes. The final approach leaves room for the worker and the tool stroke.
const solidResource=target=>target.kind==='resource'&&(target.type==='wood'||target.type==='gold'||target.type==='stone');
export function gatheringRange(worker,target){return (target.r||0)+(worker.r||0)+(solidResource(target)?target.type==='wood'?.35:.45:1.1);}
export function gatheringApproach(worker,target){return gatheringRange(worker,target)-(solidResource(target)?.15:.35);}
export function gatheringPathRange(worker,target){return solidResource(target)?gatheringApproach(worker,target):0;}
