// One wave definition keeps physical displacement, slope normals and bounds in
// agreement. Weather changes only the visual surface, never simulation rules.
const waves=Object.freeze([
  Object.freeze({amplitude:.05,x:.9,z:.36,speed:1.3,sine:true}),
  Object.freeze({amplitude:.025,x:0,z:.65,speed:-1,sine:false}),
]);
const clamp=value=>Math.max(0,Math.min(1,Number(value)||0));
export const WATER_WAVE_BOUND=.11;
export const waterMotionScale=amount=>1+.45*clamp(amount);
export function sampleWaterWave(x,z,time,shore=Infinity,amount=0){
  const t=clamp(shore),fade=t*t*(3-2*t),scale=fade*waterMotionScale(amount);let height=0,dx=0,dz=0;
  for(const wave of waves){const phase=x*wave.x+z*wave.z+time*wave.speed,value=wave.sine?Math.sin(phase):Math.cos(phase),slope=wave.sine?Math.cos(phase):-Math.sin(phase);height+=wave.amplitude*value;dx+=wave.amplitude*wave.x*slope;dz+=wave.amplitude*wave.z*slope;}
  height*=scale;dx*=scale;dz*=scale;const length=Math.hypot(dx,1,dz);return {height,normal:[-dx/length,1/length,-dz/length]};
}
const number=value=>Number.isInteger(value)?value.toFixed(1):String(value);
const phases=waves.map((wave,i)=>`float phase${i} = point.x * ${number(wave.x)} + point.y * ${number(wave.z)} + time * ${number(wave.speed)};`).join('\n');
const expression=axis=>waves.map((wave,i)=>axis==='height'?`${number(wave.amplitude)} * ${wave.sine?'sin':'cos'}(phase${i})`:`${number(wave.amplitude*wave[axis])} * ${wave.sine?'cos':'-sin'}(phase${i})`).join(' + ');
export const WATER_WAVES_GLSL=`vec3 frontierWaterWaves(vec2 point, float time) { ${phases}
  return vec3(${expression('height')}, ${expression('x')}, ${expression('z')});
}`;
