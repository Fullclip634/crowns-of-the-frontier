// Preserve static resources between compact packets and index each received
// snapshot once. Every unit in a packet shares its arrival timestamp.
export function mergeSnapshotEntities(previousEntities,state,receivedAt){
  const previous=new Map(),entities=state.entities.slice();
  for(const entity of previousEntities){
    previous.set(entity.id,entity);
    if(state.compactResources&&entity.kind==='resource')entities.push(entity);
  }
  if(state.compactResources)for(const update of state.resourceUpdates||[]){
    const resource=previous.get(update.id);
    if(resource?.kind==='resource')Object.assign(resource,update);
  }
  const index=new Map();
  for(const entity of entities){
    const old=previous.get(entity.id);
    if(entity.kind==='unit'&&old){entity.renderFromX=old.renderX??old.x;entity.renderFromZ=old.renderZ??old.z;entity.snapshotAt=receivedAt;}
    index.set(entity.id,entity);
  }
  return {entities,index};
}
