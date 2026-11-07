// One authoritative budget for combat VFX. Previously the particle caps,
// effect caps and quality thresholds were scattered magic numbers in world.js,
// which made frame-time behaviour impossible to measure or reason about.
// All functions here are pure and run in Node, so the budgets are testable.

const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));

export const VFX_QUALITY_BUDGETS=Object.freeze({
  low:Object.freeze({effects:24,events:32,baseParticles:.5}),
  medium:Object.freeze({effects:70,events:90,baseParticles:.85}),
  high:Object.freeze({effects:70,events:90,baseParticles:1}),
});
export function vfxBudget(quality){return VFX_QUALITY_BUDGETS[quality]||VFX_QUALITY_BUDGETS.medium;}

// Never more than `base` instances, never fewer than a readable spark pair.
// Pressure (0..1) trades particle density for frame time without allocating
// or disposing geometry, so the pools stay stable across a whole match.
export function particleCount(base,pressure=0,quality='medium'){
  const factor=vfxBudget(quality).baseParticles*(1-clamp(pressure,0,1)*.55);
  return clamp(Math.round(base*factor),2,base);
}

export function effectsAllowed(active,limit){return active<limit;}

// Trimmed rolling mean of real frame deltas. A single long frame (asset load,
// tab switch) is dropped as an outlier; sustained slow frames still raise
// pressure and thin particles. Clamping prevents a backgrounded tab from
// pinning the average for the rest of the match.
export function createFrameTimer({targetSeconds=1/60,maxDelta=.25,window=30}={}){
  const recent=[];
  let average=targetSeconds,pressure=0,samples=0,worst=0,overBudget=0;
  const timer={
    sample(dt){
      if(!Number.isFinite(dt)||dt<=0)return pressure;
      const delta=clamp(dt,0,maxDelta);
      recent.push(delta);if(recent.length>window)recent.shift();
      let sum=0,peak=0;for(const value of recent){sum+=value;peak=Math.max(peak,value);}
      const trimmed=recent.length>2?sum-peak:sum;
      const count=recent.length>2?recent.length-1:recent.length;
      average=trimmed/count;
      samples++;worst=Math.max(worst,delta);
      if(delta>targetSeconds)overBudget++;
      pressure=clamp((average-targetSeconds)/(targetSeconds*1.4),0,1);
      return pressure;
    },
    get pressure(){return pressure;},
    get average(){return average;},
    report(){return {targetFPS:Math.round(1/targetSeconds),estimatedFPS:Number((1/average).toFixed(1)),
      averageFrameMs:Number((average*1000).toFixed(2)),worstFrameMs:Number((worst*1000).toFixed(2)),
      pressure:Number(pressure.toFixed(3)),samples,overBudgetRatio:samples?Number((overBudget/samples).toFixed(3)):0};},
  };
  return timer;
}

export function vfxFrameReport(view){
  const timer=view?.vfxTimer,quality=view?.renderQuality||view?.settings?.quality||'medium';
  const budget=vfxBudget(quality);
  return {...(timer?timer.report():{targetFPS:60,estimatedFPS:0,averageFrameMs:0,worstFrameMs:0,pressure:0,samples:0,overBudgetRatio:0}),
    quality,activeEffects:view?.fx?.length||0,effectLimit:budget.effects,eventLimit:budget.events,
    drawCalls:view?.renderer?.info?.render?.calls??0,triangles:view?.renderer?.info?.render?.triangles??0};
}
