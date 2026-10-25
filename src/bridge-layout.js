import artwork from './assets3d/bridge.json' with {type:'json'};
const spans={valley:[{center:0,halfLength:13}],rivers:[{center:-19,halfLength:12},{center:19,halfLength:12}]};
const noSpans=Object.freeze([]);
export const bridgeSpans=map=>spans[map]||noSpans;
// Keep the authored dimensions intact; one placement scale drives art, paving,
// terrain, picking and navigation so the narrower crossing stays consistent.
export const bridgeRoadHalfWidth=6.8;
export const bridgeWidthScale=bridgeRoadHalfWidth/artwork.roadHalfWidth;
export const bridgeOuterHalfWidth=11.2*bridgeWidthScale;
export function bridgeDeckHeight(span,x){return artwork.baseHeight+artwork.crownHeight*Math.cos(Math.min(1,Math.abs(x-span.center)/span.halfLength)*Math.PI/2)**2;}
export function bridgeAt(map,x,z,padding=0){return bridgeSpans(map).find(span=>Math.abs(x-span.center)<=span.halfLength+padding&&Math.abs(z)<=bridgeRoadHalfWidth+padding);}
export function bridgeFootprint(map,x,z,padding=0){return bridgeSpans(map).some(span=>Math.abs(x-span.center)<=span.halfLength+padding&&Math.abs(z)<=bridgeOuterHalfWidth+padding);}
export function clearSavedBridgeResources(sim){
  const moved=new Set(),map=sim.options.map;
  for(const resource of sim.entities){
    if(resource.kind!=='resource'||resource.water||resource.hp<=0||!bridgeFootprint(map,resource.x,resource.z,8))continue;
    const span=bridgeSpans(map).find(span=>Math.abs(resource.x-span.center)<=span.halfLength+8),near=resource.x<span.center?-1:1;
    let destination;
    search:for(let row=0;row<12;row++)for(const side of [near,-near])for(const offset of [0,1,-1,2,-2,3,-3,4,-4,5,-5]){
      const x=span.center+side*(span.halfLength+4+resource.r+row*2.6),z=resource.z+offset*2.6;
      if(Math.abs(x)>sim.halfWorld-resource.r-2||Math.abs(z)>sim.halfWorld-resource.r-2||sim.isWater(x,z)||bridgeFootprint(map,x,z,8))continue;
      if(sim.entities.some(other=>other!==resource&&other.hp>0&&Math.hypot(other.x-x,other.z-z)<resource.r+(other.r||1)+.5))continue;
      destination={x,z};break search;
    }
    if(destination){Object.assign(resource,destination);moved.add(resource.id);}
  }
  if(moved.size){for(const unit of sim.entities)if(unit.kind==='unit'&&unit.order?.type==='gather'&&moved.has(unit.order.target)){unit.path=[];delete unit.pathTargetX;delete unit.pathTargetZ;}sim.revision++;sim.grids={};}
  return moved;
}
export {artwork as bridgeArtwork};
