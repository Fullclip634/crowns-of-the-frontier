import {seededRandom} from './data.js';
import {forestSettlements,forestEntrances} from './starting-forests.js';

const key=(x,z)=>Math.floor(x/8)+':'+Math.floor(z/8);
function buckets(){
  const cells=new Map();return {
    add(point){const id=key(point.x,point.z);if(!cells.has(id))cells.set(id,[]);cells.get(id).push(point);},
    near(x,z,radius){const result=[];for(let bx=Math.floor((x-radius)/8);bx<=Math.floor((x+radius)/8);bx++)for(let bz=Math.floor((z-radius)/8);bz<=Math.floor((z+radius)/8);bz++)result.push(...cells.get(bx+':'+bz)||[]);return result;},
  };
}

// Fresh-map composition only: redistribute the existing field wood supply.
// Starting groves, resource identities/amounts and the simulation RNG stay intact.
export function groupFieldForests(sim){
  const trees=sim.entities.filter(e=>e.hp>0&&e.kind==='resource'&&e.type==='wood'&&e.startForest===undefined);
  if(!trees.length)return {trees:0,groups:0,moved:0,remaining:0};
  const moving=new Set(trees),fixed=buckets(),placed=buckets(),bases=forestSettlements(sim).map(base=>({...base,entrances:forestEntrances(sim,base)}));
  for(const entity of sim.entities)if(entity.hp>0&&!entity.embarked&&!moving.has(entity))fixed.add(entity);
  const random=seededRandom((sim.options.seed||0)+63893),half=sim.halfWorld,positions=[],groves=[];
  const snap=value=>Math.round((value+half-1)/2)*2-half+1;
  const clear=(x,z,attachment=false)=>{
    if(Math.abs(x)>half-4||Math.abs(z)>half-4||sim.isWater(x,z)||sim.startClearing(x,z))return false;
    if(bases.some(base=>{const dx=x-base.x,dz=z-base.z,radius=Math.hypot(dx,dz);return radius<(attachment?25:47)||attachment&&radius<52&&base.entrances.some(n=>dx*n.x+dz*n.z>0&&Math.abs(dx*n.z-dz*n.x)<6);} ))return false;
    for(const e of fixed.near(x,z,12)){
      const margin=e.kind==='building'?6:e.kind==='unit'?3:e.type==='wood'?(attachment?.7:6):2.2;
      if(Math.hypot(e.x-x,e.z-z)<(e.r||0)+margin)return false;
    }
    return placed.near(x,z,1.8).every(p=>Math.hypot(p.x-x,p.z-z)>=1.8);
  };
  const grow=(center,wanted,stretch=1,existing=null)=>{
    const angle=random()*Math.PI*2,c=Math.cos(angle),s=Math.sin(angle),a=(8+random()*4)*stretch,b=(5+random()*4)*stretch,phase=random()*Math.PI*2;
    const points=[],seen=new Set(),frontier=existing?existing.map(p=>({x:snap(p.x),z:snap(p.z)})):[center];
    while(frontier.length&&points.length<wanted){
      const index=Math.floor(random()*frontier.length),point=frontier[index];frontier[index]=frontier.at(-1);frontier.pop();const id=point.x+':'+point.z;if(seen.has(id))continue;seen.add(id);
      const dx=point.x-center.x,dz=point.z-center.z,u=(dx*c+dz*s)/a,v=(-dx*s+dz*c)/b,theta=Math.atan2(v,u),edge=1+.2*Math.sin(theta*3+phase)+.1*Math.cos(theta*5-phase);
      const old=existing?.some(p=>Math.hypot(p.x-point.x,p.z-point.z)<.3);
      if(!old){
        if(u*u+v*v>edge*edge||!clear(point.x,point.z))continue;
        if(placed.near(point.x,point.z,6).some(p=>p.grove!==existing&&Math.hypot(p.x-point.x,p.z-point.z)<6))continue;
        points.push({x:point.x+(random()-.5)*.14,z:point.z+(random()-.5)*.14});
      }
      for(const [x,z]of [[2,0],[-2,0],[0,2],[0,-2]])frontier.push({x:point.x+x,z:point.z+z});
    }
    return points;
  };
  const commit=(points,grove)=>{for(const point of points){point.grove=grove;positions.push(point);grove.push(point);placed.add(point);}};
  const candidates=trees.map(tree=>({x:snap(tree.x),z:snap(tree.z)}));
  for(let i=0;i<800;i++)candidates.push({x:snap((random()-.5)*(sim.worldSize-12)),z:snap((random()-.5)*(sim.worldSize-12))});
  for(let i=candidates.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
  for(const center of candidates){
    const remaining=trees.length-positions.length;if(!remaining)break;
    if(!clear(center.x,center.z)||placed.near(center.x,center.z,12).some(p=>Math.hypot(p.x-center.x,p.z-center.z)<12))continue;
    let wanted=Math.min(remaining,26+Math.floor(random()*16));if(remaining-wanted<8)wanted=remaining;
    const points=grow(center,wanted);if(points.length<Math.min(8,remaining))continue;
    const grove=[];groves.push(grove);commit(points,grove);
  }
  // Small constrained maps can grow an accepted woodline instead of leaving a
  // few leftover trees scattered alone or increasing the total tree count.
  for(const stretch of [1.5,2,3])for(const grove of groves){
    const remaining=trees.length-positions.length;if(!remaining)break;
    commit(grow({x:snap(grove[0].x),z:snap(grove[0].z)},remaining,stretch,grove),grove);
  }
  const anchors=sim.entities.filter(e=>e.hp>0&&e.kind==='resource'&&e.type==='wood'&&e.startForest!==undefined);
  for(let i=0;i<anchors.length&&positions.length<trees.length;i++){
    const anchor=anchors[i];for(const [dx,dz]of [[2,0],[-2,0],[0,2],[0,-2]]){
      if(positions.length>=trees.length)break;const point={x:anchor.x+dx,z:anchor.z+dz};if(!clear(point.x,point.z,true))continue;
      const grove=[];groves.push(grove);commit([point],grove);anchors.push(point);
    }
  }
  const moved=Math.min(positions.length,trees.length);
  for(let i=0;i<moved;i++){trees[i].x=positions[i].x;trees[i].z=positions[i].z;}
  if(moved){sim.revision++;sim.grids={};}
  return {trees:trees.length,groups:groves.length,moved,remaining:trees.length-moved};
}
