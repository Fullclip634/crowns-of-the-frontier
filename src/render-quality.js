// Shadow-map presence changes the material program, not just a light uniform.
// Three.js requires needsUpdate when this feature is toggled after a render.
export function setShadowEnabled(view,enabled){
  const shadows=view.renderer.shadowMap;
  if(shadows.enabled===enabled)return false;
  shadows.enabled=enabled;shadows.needsUpdate=true;
  const materials=new Set();
  const collect=value=>{if(Array.isArray(value))for(const material of value)collect(material);else if(value?.isMaterial)materials.add(value);};
  for(const value of Object.values(view.materials||{}))collect(value);
  collect(view.teamMaterials);collect(view.roofMaterials);
  view.scene?.traverse(object=>collect(object.material));
  for(const material of materials)material.needsUpdate=true;
  return true;
}
