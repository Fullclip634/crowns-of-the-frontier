// Work eligibility, resource assignment and animation observation must agree.
// Wood uses the new axe's reach; other jobs retain their established ranges.
export function gatheringRange(worker,target){return (target.r||0)+(worker.r||0)+(target.kind==='resource'&&target.type==='wood'?.35:1.1);}
export function gatheringApproach(worker,target){return gatheringRange(worker,target)-(target.kind==='resource'&&target.type==='wood'?.15:.35);}
export function gatheringPathRange(worker,target){return target.kind==='resource'&&target.type==='wood'?gatheringApproach(worker,target):0;}
