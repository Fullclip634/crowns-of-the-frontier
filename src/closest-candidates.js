// Keep a small, stable prefix without sorting every eligible world object.
// Scores are evaluated once; equal scores keep the original iteration order.
export function closestCandidates(items,limit,eligible,score){
  const selected=[],scores=[];
  if(limit<=0)return selected;
  for(const item of items){
    if(!eligible(item))continue;
    const value=score(item);let at=0;
    while(at<scores.length&&scores[at]<=value)at++;
    if(at>=limit)continue;
    selected.splice(at,0,item);scores.splice(at,0,value);
    if(selected.length>limit){selected.pop();scores.pop();}
  }
  return selected;
}
