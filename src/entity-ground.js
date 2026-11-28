// Authoritative and interpolated coordinates often repeat across culling,
// posing, cargo and effect passes. Retain both samples for each entity.
const views=new WeakMap();
export function entityGroundHeight(view,entity,x,z){
  let state=views.get(view);const land=view.landscape,grid=land?.grid;
  if(!state||state.land!==land||state.grid!==grid||state.sim!==view.sim){
    state={land,grid,sim:view.sim,byId:new Map(),entities:new WeakMap()};
    views.set(view,state);
  }
  const hasId=typeof entity?.id==='number';
  let sample=hasId?state.byId.get(entity.id):state.entities.get(entity);
  if(sample){
    if(sample.x===x&&sample.z===z)return sample.height;
    if(sample.otherX===x&&sample.otherZ===z)return sample.otherHeight;
  }
  const height=view.groundHeight(x,z);
  if(!sample){
    sample={};
    if(hasId){
      if(state.byId.size>2048)state.byId.clear();
      state.byId.set(entity.id,sample);
    }else state.entities.set(entity,sample);
  }
  sample.otherX=sample.x;sample.otherZ=sample.z;sample.otherHeight=sample.height;sample.x=x;sample.z=z;sample.height=height;
  return height;
}
