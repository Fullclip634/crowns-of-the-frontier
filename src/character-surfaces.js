// Codes share the existing palette attribute: 0 plain, 1 timber, 2..5 atlas.
export const CHARACTER_SURFACE_MODES=Object.freeze({cloth:2,leather:3,metal:4,skin:5});
export const CHARACTER_ATLAS=Object.freeze({size:512,cell:256,core:224,padding:16});
const humans=new Set(['villager','spearman','swordsman','archer','scout','knight','monk','king','sentinel','marksman','outrider']);
export const characterSurfaceKinds=quality=>quality==='low'?['color']:['color','normal'];
export function characterSurfaceMode(role,type,motion){
  // Shield paint shares its team material with garments, but is not woven cloth.
  if(role==='team'&&['swordsman','sentinel','king'].includes(type)&&motion?.type==='forearm'&&motion.side<0)return 0;
  if(['canvas','pants'].includes(role)||role==='team'&&humans.has(type))return 2;
  if(role==='leather')return 3;
  if(['steel','iron'].includes(role))return 4;
  if(role==='skin')return 5;
  return 0;
}

// Blender atlas rows use bottom-origin UVs. Loaded images must keep flipY=true.
export function characterAtlasUV(mode,u,v){
  const index=Math.max(0,Math.min(3,Math.round(mode)-2)),repeat=index===0?6:index===1?4:index===2?2:10,fract=value=>value-Math.floor(value);
  return [(index%2*256+16+fract(u*repeat)*224)/512,(Math.floor(index/2)*256+16+fract(v*repeat)*224)/512];
}

export const characterAtlasGLSL=`
  vec2 frontierCharacterUV(vec2 baseUv, float mode) {
    float tile = clamp(floor(mode + 0.5) - 2.0, 0.0, 3.0);
    float repeats = tile < 0.5 ? 6.0 : tile < 1.5 ? 4.0 : tile < 2.5 ? 2.0 : 10.0;
    return (vec2(mod(tile, 2.0), floor(tile / 2.0)) * 256.0 + 16.0 + fract(baseUv * repeats) * 224.0) / 512.0;
  }
`;
