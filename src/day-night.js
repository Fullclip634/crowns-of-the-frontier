import {Color} from 'three';

export const LIGHTING_MODES={day:'Daylight',night:'Moonlit night',cycle:'Day & night cycle'};
const smooth=value=>{value=Math.max(0,Math.min(1,value));return value*value*(3-2*value);};
export function lightingAt(time,mode='day'){
  if(mode==='night')return {night:1,twilight:0,label:'Night'};
  if(mode!=='cycle')return {night:0,twilight:0,label:'Day'};
  const phase=((Math.max(0,time)||0)%1080)/1080,night=smooth((phase-.32)/.12)*(1-smooth((phase-.78)/.12));
  return {night,twilight:4*night*(1-night),label:night>.85?'Night':night<.15?'Day':'Twilight'};
}

// Everything the night pass can touch. Weather writes absolute values at the
// start of each frame; this snapshot lets the night pass be applied exactly
// once per frame and removed cleanly, instead of compounding on every call.
function capture(view){
  return {
    background:view.scene.background.clone(),sunColor:view.sun.color.clone(),sunIntensity:view.sun.intensity,
    hemiColor:view.hemi.color.clone(),hemiGround:view.hemi.groundColor.clone(),hemiIntensity:view.hemi.intensity,
    environment:view.scene.environmentIntensity,exposure:view.renderer.toneMappingExposure,
    fog:view.fogMesh.material.color.clone(),
  };
}
const close=(a,b)=>Math.abs(a-b)<1e-6;
function identical(a,b){
  return a.background.equals(b.background)&&a.sunColor.equals(b.sunColor)&&close(a.sunIntensity,b.sunIntensity)&&
    a.hemiColor.equals(b.hemiColor)&&a.hemiGround.equals(b.hemiGround)&&close(a.hemiIntensity,b.hemiIntensity)&&
    close(a.environment,b.environment)&&close(a.exposure,b.exposure)&&a.fog.equals(b.fog);
}

// Moonlit night keeps the land readable: a cool directional moon, generous
// blue fill light, a deep navy sky and warm structure windows (the palette's
// night-glow uniform). Nothing is crushed to black.
const NIGHT_SKY=0x142540,NIGHT_MOON=0xbfd0f5,TWILIGHT=0xeeb17c,NIGHT_HEMI=0x93a9d2,NIGHT_GROUND=0x47566f,NIGHT_FOG=0x8294b8;

export class DayNightLighting{
  constructor(view){
    this.view=view;this.amount=null;this.tint=new Color();
    this.base=capture(view);
    this.written=null;this.frameBase=null;
  }
  update(dt){
    const v=this.view,state=lightingAt(v.sim.time,v.settings.lighting);
    if(this.amount===null||v.settings.reducedMotion)this.amount=state.night;
    else this.amount+=(state.night-this.amount)*(1-Math.exp(-Math.max(0,dt)*3));
    const night=this.amount,twilight=4*night*(1-night),flash=v.weatherState?.flash&&v.settings.lightning!==false&&!v.settings.reducedMotion?1:0;
    const current=capture(v);
    // Weather (or a caller) overwrote our output: those values are this
    // frame's daylight baseline. Otherwise restore the unmodified baseline so
    // repeated updates are idempotent and day/night is fully reversible.
    const base=this.written&&identical(current,this.written)?this.frameBase:current;
    this.frameBase=base;
    v.scene.background.copy(base.background).lerp(this.tint.setHex(NIGHT_SKY),night*.94);v.scene.fog.color.copy(v.scene.background);
    v.sun.color.copy(base.sunColor).lerp(this.tint.setHex(TWILIGHT),twilight*.25).lerp(this.tint.setHex(NIGHT_MOON),night);
    v.sun.intensity=base.sunIntensity*(1-night*.62)+flash*night*.5;
    v.hemi.color.copy(base.hemiColor).lerp(this.tint.setHex(NIGHT_HEMI),night);v.hemi.groundColor.copy(base.hemiGround).lerp(this.tint.setHex(NIGHT_GROUND),night);
    v.hemi.intensity=base.hemiIntensity*(1-night*.28);
    v.scene.environmentIntensity=base.environment*(1-night*.38);v.renderer.toneMappingExposure=base.exposure*(1+night*.10);
    v.fogMesh.material.color.copy(base.fog).lerp(this.tint.setHex(NIGHT_FOG),night*.55);
    const uniform=v.materials.structurePalette?.frontierUniforms?.night;if(uniform)uniform.value=night;
    v.lightingState={mode:LIGHTING_MODES[v.settings.lighting]?v.settings.lighting:'day',night,twilight,label:night>.85?'Night':night<.15?'Day':'Twilight'};
    this.written=capture(v);
  }
  dispose(){
    const v=this.view,b=this.base;
    v.scene.background.copy(b.background);v.scene.fog.color.copy(b.background);
    v.sun.color.copy(b.sunColor);v.sun.intensity=b.sunIntensity;
    v.hemi.color.copy(b.hemiColor);v.hemi.groundColor.copy(b.hemiGround);v.hemi.intensity=b.hemiIntensity;
    v.scene.environmentIntensity=b.environment;v.renderer.toneMappingExposure=b.exposure;v.fogMesh.material.color.copy(b.fog);
    const uniform=v.materials.structurePalette?.frontierUniforms?.night;if(uniform)uniform.value=0;
    this.written=null;this.frameBase=null;this.amount=null;
  }
}
