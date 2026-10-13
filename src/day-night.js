import {Color} from 'three';

export const LIGHTING_MODES={day:'Daylight',night:'Moonlit night',cycle:'Day & night cycle'};
const smooth=value=>{value=Math.max(0,Math.min(1,value));return value*value*(3-2*value);};
export function lightingAt(time,mode='day'){
  if(mode==='night')return {night:1,twilight:0,label:'Night'};
  if(mode!=='cycle')return {night:0,twilight:0,label:'Day'};
  const phase=((Math.max(0,time)||0)%1080)/1080,night=smooth((phase-.32)/.12)*(1-smooth((phase-.78)/.12));
  return {night,twilight:4*night*(1-night),label:night>.85?'Night':night<.15?'Day':'Twilight'};
}

// Blend with the weather's light rather than replacing rain/cloud/lightning.
// Visibility, simulation clocks and AI rules remain authoritative and unchanged.
export class DayNightLighting{
  constructor(view){this.view=view;this.amount=null;this.tint=new Color();this.base={ground:view.hemi.groundColor.clone(),environment:view.scene.environmentIntensity,exposure:view.renderer.toneMappingExposure,fog:view.fogMesh.material.color.clone()};}
  update(dt){
    const v=this.view,state=lightingAt(v.sim.time,v.settings.lighting);
    if(this.amount===null||v.settings.reducedMotion)this.amount=state.night;
    else this.amount+=(state.night-this.amount)*(1-Math.exp(-Math.max(0,dt)*3));
    const night=this.amount,twilight=4*night*(1-night),flash=v.weatherState?.flash&&v.settings.lightning!==false&&!v.settings.reducedMotion?1:0;
    v.scene.background.lerp(this.tint.setHex(0x152640),night*.94);v.scene.fog.color.copy(v.scene.background);
    v.sun.color.lerp(this.tint.setHex(0xeeb17c),twilight*.25).lerp(this.tint.setHex(0xb5c9f0),night);
    v.sun.intensity=v.sun.intensity*(1-night*.77)+flash*night*.5;
    v.hemi.color.lerp(this.tint.setHex(0x8da6cc),night);v.hemi.groundColor.copy(this.base.ground).lerp(this.tint.setHex(0x333f57),night);
    v.hemi.intensity=v.hemi.intensity*(1-night*.38);
    v.scene.environmentIntensity=this.base.environment*(1-night*.48);v.renderer.toneMappingExposure=this.base.exposure*(1+night*.035);
    v.fogMesh.material.color.copy(this.base.fog).lerp(this.tint.setHex(0x899bbc),night*.6);
    const uniform=v.materials.structurePalette?.frontierUniforms?.night;if(uniform)uniform.value=night;
    v.lightingState={mode:LIGHTING_MODES[v.settings.lighting]?v.settings.lighting:'day',night,twilight,label:night>.85?'Night':night<.15?'Day':'Twilight'};
  }
  dispose(){const v=this.view;v.hemi.groundColor.copy(this.base.ground);v.scene.environmentIntensity=this.base.environment;v.renderer.toneMappingExposure=this.base.exposure;v.fogMesh.material.color.copy(this.base.fog);const uniform=v.materials.structurePalette?.frontierUniforms?.night;if(uniform)uniform.value=0;}
}
