// Authoritative and interpolated coordinates often repeat across culling,
// posing, cargo and effect passes. Retain both samples for each entity.
const views=new WeakMap();
export function entityGroundHeight(view,entity,x,z){
  let state=views.get(view);const land=view.landscape,grid=land?.grid;
  if(!state||state.land!==land||state.grid!==grid||state.sim!==view.sim){state={land,grid,sim:view.sim,entities:new WeakMap()};views.set(view,state);}
  let sample=state.entities.get(entity);
  if(sample){if(sample.x===x&&sample.z===z)return sample.height;if(sample.otherX===x&&sample.otherZ===z)return sample.otherHeight;}
  const height=view.groundHeight(x,z);
  if(!sample){sample={};state.entities.set(entity,sample);}
  sample.otherX=sample.x;sample.otherZ=sample.z;sample.otherHeight=sample.height;sample.x=x;sample.z=z;sample.height=height;return height;
}
