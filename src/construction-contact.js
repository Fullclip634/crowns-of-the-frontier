// Released hammer heads cross the work plane about 1.05–1.20 m in front
// of a villager. Keep the body outside the square construction frame and
// aim along a face normal, leaving room for the right-hand hammer stroke.
export const CONSTRUCTION_STANDOFF=1.08;
const minimumGap=1,maximumGap=1.24,handMargin=.8;
const faceHeadings=[-Math.PI/2,Math.PI/2,Math.PI,0];
export const constructionHalfSize=target=>Math.max(1.6,target.r||0);

export function constructionFace(worker,target){
  const angle=target.wallAngle||0,c=Math.cos(angle),s=Math.sin(angle),dx=worker.x-target.x,dz=worker.z-target.z,x=c*dx-s*dz,z=s*dx+c*dz,half=constructionHalfSize(target),along=half-handMargin,min=Math.max(minimumGap,(worker.r||0)+.2);
  // Include the navigation arrival tolerance at a face's end, while keeping
  // the hammer's sideways extent inside the frame.
  if(Math.abs(z)<=along+.06){if(x-half>=min-.02&&x-half<=maximumGap+.02)return 0;if(-x-half>=min-.02&&-x-half<=maximumGap+.02)return 1;}
  if(Math.abs(x)<=along+.06){if(z-half>=min-.02&&z-half<=maximumGap+.02)return 2;if(-z-half>=min-.02&&-z-half<=maximumGap+.02)return 3;}
  return -1;
}

export function constructionHeading(target,face){
  return (target.wallAngle||0)+faceHeadings[face];
}

export function constructionSegmentClear(from,to,target,margin=0){
  const angle=target.wallAngle||0,c=Math.cos(angle),s=Math.sin(angle),half=constructionHalfSize(target)+margin,ax=from.x-target.x,az=from.z-target.z,bx=to.x-target.x,bz=to.z-target.z;
  const x=c*ax-s*az,z=s*ax+c*az,dx=c*(bx-ax)-s*(bz-az),dz=s*(bx-ax)+c*(bz-az);let enter=0,exit=1;
  for(const [origin,delta]of [[x,dx],[z,dz]]){
    if(Math.abs(delta)<1e-9){if(Math.abs(origin)>=half)return true;continue;}
    const a=(-half-origin)/delta,b=(half-origin)/delta;enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));if(enter>exit)return true;
  }
  return exit<0||enter>1;
}

export function constructionPositions(worker,target){
  const angle=target.wallAngle||0,c=Math.cos(angle),s=Math.sin(angle),dx=worker.x-target.x,dz=worker.z-target.z,x=c*dx-s*dz,z=s*dx+c*dz,half=constructionHalfSize(target),limit=half-handMargin,steps=Math.min(8,Math.max(2,Math.ceil(limit*2/1.2))),points=[];
  for(let face=0;face<4;face++){
    const nearest=Math.max(-limit,Math.min(limit,face<2?z:x)),values=[nearest];
    for(let i=0;i<=steps;i++){const value=-limit+i/steps*limit*2;if(Math.abs(value-nearest)>.05)values.push(value);}
    for(const along of values){const normal=(face===0||face===2?1:-1)*(half+CONSTRUCTION_STANDOFF),lx=face<2?normal:along,lz=face<2?along:normal;
      points.push({x:target.x+c*lx+s*lz,z:target.z-s*lx+c*lz,face});
    }
  }
  return points;
}
