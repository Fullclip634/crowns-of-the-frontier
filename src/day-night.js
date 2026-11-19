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
// start of each frame; pre-allocated snapshots let the night pass stay
// idempotent and reversible without per-frame Color allocations.
function createSnapshot(){
  return {
    background:new Color(),sunColor:new Color(),sunIntensity:0,
    hemiColor:new Color(),hemiGround:new Color(),hemiIntensity:0,
    environment:0,exposure:0,fog:new Color(),
  };
}
function captureInto(target,view){
  target.background.copy(view.scene.background);
  target.sunColor.copy(view.sun.color);target.sunIntensity=view.sun.intensity;
  target.hemiColor.copy(view.hemi.color);target.hemiGround.copy(view.hemi.groundColor);target.hemiIntensity=view.hemi.intensity;
  target.environment=view.scene.environmentIntensity;target.exposure=view.renderer.toneMappingExposure;
  target.fog.copy(view.fogTint);
  return target;
}
function copySnapshot(target,source){
  target.background.copy(source.background);
  target.sunColor.copy(source.sunColor);target.sunIntensity=source.sunIntensity;
  target.hemiColor.copy(source.hemiColor);target.hemiGround.copy(source.hemiGround);target.hemiIntensity=source.hemiIntensity;
  target.environment=source.environment;target.exposure=source.exposure;
  target.fog.copy(source.fog);
  return target;
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
const NIGHT_SKY=0x142540,NIGHT_MOON=0xbfd0f5,TWILIGHT=0xeeb17c,NIGHT_HEMI=0x93a9d2,NIGHT_GROUND=0x47566f,NIGHT_FOG=0x101c31;

export class DayNightLighting{
  constructor(view){
    this.view=view;this.amount=null;this.tint=new Color();
    this.base=captureInto(createSnapshot(),view);
    this.currentSnap=createSnapshot();
    this.frameBase=createSnapshot();
    this.written=createSnapshot();
    this.hasWritten=false;
  }
  update(dt){
    const v=this.view,state=lightingAt(v.sim.time,v.settings.lighting);
    if(this.amount===null||v.settings.reducedMotion)this.amount=state.night;
    else this.amount+=(state.night-this.amount)*(1-Math.exp(-Math.max(0,dt)*3));
    const night=this.amount,twilight=4*night*(1-night),flash=v.weatherState?.flash&&v.settings.lightning!==false&&!v.settings.reducedMotion?1:0;
    const current=captureInto(this.currentSnap,v);
    // Weather (or a caller) overwrote our output: those values are this
    // frame's daylight baseline. Otherwise restore the unmodified baseline so
    // repeated updates are idempotent and day/night is fully reversible.
    if(!this.hasWritten||!identical(current,this.written))copySnapshot(this.frameBase,current);
    const base=this.frameBase;
    v.scene.background.copy(base.background).lerp(this.tint.setHex(NIGHT_SKY),night*.94);v.scene.fog.color.copy(v.scene.background);
    v.sun.color.copy(base.sunColor).lerp(this.tint.setHex(TWILIGHT),twilight*.25).lerp(this.tint.setHex(NIGHT_MOON),night);
    v.sun.intensity=base.sunIntensity*(1-night*.62)+flash*night*.5;
    v.hemi.color.copy(base.hemiColor).lerp(this.tint.setHex(NIGHT_HEMI),night);v.hemi.groundColor.copy(base.hemiGround).lerp(this.tint.setHex(NIGHT_GROUND),night);
    v.hemi.intensity=base.hemiIntensity*(1-night*.28);
    v.scene.environmentIntensity=base.environment*(1-night*.38);v.renderer.toneMappingExposure=base.exposure*(1+night*.10);
    v.fogTint.copy(base.fog).lerp(this.tint.setHex(NIGHT_FOG),night*.55);
    const uniform=v.materials.structurePalette?.frontierUniforms?.night;if(uniform)uniform.value=night;
    const atm=v.atmosphereUniforms;
    if(atm){
      atm.night.value=night;
      atm.iblIntensity.value=v.scene.environmentIntensity;
      atm.sunColor.value.copy(v.sun.color);
      atm.iblHorizon.value.copy(v.scene.background);
      atm.iblGround.value.copy(v.hemi.groundColor);
    }
    v.lightingState={mode:LIGHTING_MODES[v.settings.lighting]?v.settings.lighting:'day',night,twilight,label:night>.85?'Night':night<.15?'Day':'Twilight'};
    captureInto(this.written,v);this.hasWritten=true;
  }
  dispose(){
    const v=this.view,b=this.base;
    v.scene.background.copy(b.background);v.scene.fog.color.copy(b.background);
    v.sun.color.copy(b.sunColor);v.sun.intensity=b.sunIntensity;
    v.hemi.color.copy(b.hemiColor);v.hemi.groundColor.copy(b.hemiGround);v.hemi.intensity=b.hemiIntensity;
    v.scene.environmentIntensity=b.environment;v.renderer.toneMappingExposure=b.exposure;v.fogTint.copy(b.fog);
    const uniform=v.materials.structurePalette?.frontierUniforms?.night;if(uniform)uniform.value=0;
    const atm=v.atmosphereUniforms;
    if(atm){
      atm.night.value=0;
      atm.iblIntensity.value=b.environment;
      atm.sunColor.value.copy(b.sunColor);
      atm.iblHorizon.value.copy(b.background);
      atm.iblGround.value.copy(b.hemiGround);
    }
    this.hasWritten=false;this.amount=null;
  }
}
