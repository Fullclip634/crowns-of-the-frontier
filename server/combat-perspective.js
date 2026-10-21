// Pending damage is server-private. Only cosmetic launch/impact information
// visible to this commander may enter effects or reconnect snapshots.
export function combatPerspective(sim,side,event,{observer=false}={}){
  if(!event.pendingImpact&&event.type!=='projectile-impact')return event;
  if(!event.entity||!event.target)return null;
  const source=event.entity,target=event.target,sourceVisible=observer||source.owner===side||sim.canSee(side,source),targetVisible=observer||target.owner===side||sim.canSee(side,target);
  if(event.type==='projectile-impact'){
    if(!targetVisible)return null;
    return {...event,entity:sourceVisible?{...source}:{kind:'projectile',type:event.siege?'stone':'arrow',owner:-1,x:target.x,z:target.z},target:{...target}};
  }
  if(!sourceVisible)return null;
  const visible={...event,entity:{...source},target:{...target},flightAge:Math.max(0,sim.time-event.releasedAt)};
  if(!targetVisible){visible.target={kind:'ground',owner:-1,x:event.aimX??target.x,z:event.aimZ??target.z,r:0};delete visible.damage;}
  return visible;
}
