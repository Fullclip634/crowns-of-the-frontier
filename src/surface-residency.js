// A completed profile must not retain unused detail maps from earlier profiles.
// Pending loads and real material/portrait references stay safe until replaced.
export class SurfaceResidency {
  constructor({loaded=()=>{},removed=()=>{}}={}){this.entries=new Map();this.loaded=loaded;this.removed=removed;}
  load(key,load){
    const existing=this.entries.get(key);if(existing)return existing.promise;
    const entry={texture:null};this.entries.set(key,entry);
    entry.promise=Promise.resolve().then(load).then(texture=>{entry.texture=texture;this.loaded(key,texture);return texture;}).catch(error=>{if(this.entries.get(key)===entry)this.entries.delete(key);throw error;});return entry.promise;
  }
  textures(){return new Set([...this.entries.values()].map(entry=>entry.texture).filter(Boolean));}
  trim(needed,pinned=new Set()){
    let evicted=0;for(const [key,entry]of this.entries){if(!entry.texture||needed.has(key)||pinned.has(entry.texture))continue;
      this.entries.delete(key);this.removed(key,entry.texture);entry.texture.dispose();entry.texture.image?.close?.();evicted++;
    }return {loaded:this.textures().size,pending:[...this.entries.values()].filter(entry=>!entry.texture).length,evicted};
  }
}

export function surfaceKeys(quality,roles){
  const keys=new Set(roles.flatMap(role=>(quality==='high'?['color','normal','arm']:quality==='medium'?['color','normal']:['color']).map(kind=>role+':'+kind)));
  if(quality==='medium')for(const role of ['stone','wood','plaster'])keys.add(role+':arm');return keys;
}

export function surfacePins(view){
  const pins=new Set(),seen=new Set();
  const texture=value=>{if(value?.isTexture)pins.add(value);else if(Array.isArray(value))for(const item of value)texture(item);};
  const material=value=>{if(!value||seen.has(value))return;seen.add(value);for(const property of Object.values(value))texture(property);
    for(const uniforms of [value.uniforms,value.frontierUniforms,value.frontierTerrainUniforms])for(const uniform of Object.values(uniforms||{}))texture(uniform.value);
  };
  for(const value of [...Object.values(view.materials||{}),...(view.teamMaterials||[]),...(view.roofMaterials||[])])material(value);
  for(const scene of [view.scene,view.modelPortrait?.scene])scene?.traverse(node=>{for(const value of Array.isArray(node.material)?node.material:[node.material])material(value);});return pins;
}
