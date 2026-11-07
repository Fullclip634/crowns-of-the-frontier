// Terrain readability is computed from the *real* height field, not a flat
// green wash. A directional hillshade plus slope-driven stone exposure makes
// plateaus, ridges and valley floors legible at every zoom level while the
// ground texture stays a single CanvasTexture (zero extra draw calls).
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};

export const CLARITY_RESOLUTION=192;

export function terrainReliefSamples(land,resolution=CLARITY_RESOLUTION){
  const size=land.renderSize,half=size/2,cell=size/resolution;
  const heights=new Float32Array(resolution*resolution);
  for(let row=0;row<resolution;row++)for(let col=0;col<resolution;col++){
    heights[row*resolution+col]=land.heightAt((col+.5)*cell-half,(row+.5)*cell-half);
  }
  const shade=new Float32Array(resolution*resolution),stone=new Float32Array(resolution*resolution);
  let min=Infinity,max=-Infinity,exposed=0;
  for(let row=0;row<resolution;row++)for(let col=0;col<resolution;col++){
    const index=row*resolution+col;
    const left=heights[row*resolution+Math.max(0,col-1)],right=heights[row*resolution+Math.min(resolution-1,col+1)];
    const above=heights[Math.max(0,row-1)*resolution+col],below=heights[Math.min(resolution-1,row+1)*resolution+col];
    const dx=(right-left)/(2*cell),dz=(below-above)/(2*cell);
    // Light arrives from the north-west. Flat ground stays neutral (1.0).
    const facing=(dx*.55+dz*.83)/Math.sqrt(1+dx*dx+dz*dz);
    const value=clamp(1+facing*.62,.42,1.24);
    shade[index]=value;min=Math.min(min,value);max=Math.max(max,value);
    const slope=Math.hypot(dx,dz),exposure=smooth(.18,.85,slope)*.42;
    stone[index]=exposure;if(exposure>.08)exposed++;
  }
  return {resolution,shade,stone,diagnostics:{min,max,exposed,cell}};
}

// Two RGBA overlays: cool shadows / warm sun-facing highlights, and exposed
// bedrock on steep slopes. Kept as plain bytes so the maths is testable in
// Node without a canvas implementation.
export function terrainClarityPixels(land,resolution=CLARITY_RESOLUTION){
  const {shade,stone,diagnostics}=terrainReliefSamples(land,resolution),count=resolution*resolution;
  const relief=new Uint8ClampedArray(count*4),rock=new Uint8ClampedArray(count*4);
  for(let i=0;i<count;i++){
    const s=shade[i],dark=Math.max(0,1-s),light=Math.max(0,s-1),offset=i*4;
    if(dark>=light){
      relief[offset]=20;relief[offset+1]=30;relief[offset+2]=44;relief[offset+3]=Math.round(clamp(dark*.62,0,.62)*255);
    }else{
      relief[offset]=236;relief[offset+1]=231;relief[offset+2]=208;relief[offset+3]=Math.round(clamp(light*.75,0,.18)*255);
    }
    rock[offset]=142;rock[offset+1]=128;rock[offset+2]=100;rock[offset+3]=Math.round(stone[i]*255);
  }
  return {resolution,relief,rock,diagnostics};
}
