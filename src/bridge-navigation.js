import {bridgeSpans,bridgeRoadHalfWidth,bridgeWidthScale} from './bridge-layout.js';

export const BRIDGE_CLEARANCE=.7;
const cachedGrids=new WeakMap();
// The last metre of the three-metre apron settles onto the bank. Keep the
// raised part protected, leaving the flush ends open for turning on islands.
const halfWidth=bridgeRoadHalfWidth,inner=halfWidth-.1*bridgeWidthScale,outer=halfWidth+.75*bridgeWidthScale,apron=2;
const clearances={ram:2.7,catapult:3.3,cart:1.3};
const sides=[-1,1];

export function bridgeUnitClearance(unit){return Math.max(BRIDGE_CLEARANCE,unit.r||0,clearances[unit.type]||0);}

// Older saves can have troops standing on the part of the old road that was
// narrowed. Put those occupants on the remaining deck, preserving their orders.
export function restoreBridgeOccupants(sim,savedWidth){
  if(savedWidth!==undefined&&savedWidth<=bridgeRoadHalfWidth)return 0;
  const previousWidth=savedWidth??bridgeRoadHalfWidth/bridgeWidthScale;let moved=0;
  for(const unit of sim.entities){
    if(unit.kind!=='unit'||unit.hp<=0||unit.embarked||sim.unitDefinition(unit).naval||Math.abs(unit.z)>previousWidth)continue;
    if(!bridgeSpans(sim.options.map).some(span=>Math.abs(unit.x-span.center)<=span.halfLength+3))continue;
    const limit=Math.max(0,inner-bridgeUnitClearance(unit)-.1);
    if(Math.abs(unit.z)<=limit)continue;
    unit.z=Math.sign(unit.z)*limit;unit.path=[];unit.repath=0;unit.moving=false;delete unit.pathTargetX;delete unit.pathTargetZ;moved++;
  }
  if(moved){sim.revision++;sim.grids={};}return moved;
}

export function bridgePointClear(map,x,z,radius=BRIDGE_CLEARANCE){
  const zz=Math.abs(z);if(zz<inner-radius||zz>outer+radius)return true;
  for(const span of bridgeSpans(map))if(Math.abs(x-span.center)<=span.halfLength+apron+radius)return false;
  return true;
}

function crossesRectangle(x,z,nx,nz,left,right,low,high){
  let enter=0,leave=1;const dx=nx-x,dz=nz-z;
  if(Math.abs(dx)<1e-12){if(x<left||x>right)return false;}else{const a=(left-x)/dx,b=(right-x)/dx;enter=Math.max(enter,Math.min(a,b));leave=Math.min(leave,Math.max(a,b));}
  if(Math.abs(dz)<1e-12){if(z<low||z>high)return false;}else{const a=(low-z)/dz,b=(high-z)/dz;enter=Math.max(enter,Math.min(a,b));leave=Math.min(leave,Math.max(a,b));}
  return enter<=leave+1e-10;
}

// Include the raised aprons: their side ledges are not road entrances. Units
// restored inside a clearance band may leave toward their current support side
// or a nearby open end, without crossing from the bank onto the deck sideways.
export function bridgeStepClear(map,x,z,nx,nz,radius=BRIDGE_CLEARANCE){
  if(x===nx&&z===nz)return true;
  for(const span of bridgeSpans(map)){
    const left=span.center-span.halfLength-apron-radius,right=span.center+span.halfLength+apron+radius;
    for(const side of sides){
      const az=z*side,bz=nz*side,low=inner-radius,high=outer+radius;
      if(!crossesRectangle(x,az,nx,bz,left,right,low,high))continue;
      if(x>=left&&x<=right&&az>=low&&az<=high){
        const deck=az<=halfWidth;
        // Check support at the exit point too: a long diagonal must not cross
        // the side ledge before it reaches the end of the bridge.
        const exit=nx<left?(left-x)/(nx-x):nx>right?(right-x)/(nx-x):1,exitZ=az+(bz-az)*exit;
        if(deck?exitZ>halfWidth:exitZ<halfWidth)return false;
        const before=Math.min(x-left,right-x,deck?az-low:high-az),after=Math.min(nx-left,right-nx,deck?bz-low:high-bz);
        if(after<before-1e-8)continue;
      }
      return false;
    }
  }
  return true;
}

export function blockBridgeNavigation(sim,grid,radius=BRIDGE_CLEARANCE){
  for(const span of bridgeSpans(sim.options.map))for(const side of sides){
    const a=sim.cell(span.center-span.halfLength-apron-radius,side*(inner-radius)),b=sim.cell(span.center+span.halfLength+apron+radius,side*(outer+radius));
    for(let z=Math.min(a.z,b.z);z<=Math.max(a.z,b.z);z++)for(let x=a.x;x<=b.x;x++){
      const wx=x*2-sim.halfWorld+1,wz=z*2-sim.halfWorld+1;if(!bridgePointClear(sim.options.map,wx,wz,radius))grid[z*sim.gridSize+x]=1;
    }
  }
}

export function bridgeNavigationGrid(sim,unit,normal){
  const radius=bridgeUnitClearance(unit);if(radius<=BRIDGE_CLEARANCE||!bridgeSpans(sim.options.map).length)return normal;
  let cache=cachedGrids.get(normal);if(!cache){cache=new Map();cachedGrids.set(normal,cache);}if(cache.has(radius))return cache.get(radius);
  const data=normal.slice();blockBridgeNavigation(sim,data,radius);data.bridgeClearance=radius;data.navigationKey=(normal.navigationKey||'')+':bridge:'+radius;cache.set(radius,data);return data;
}
