export function treeDetail(screenHeight,quality,previous){
  const threshold=quality==='high'?34:quality==='medium'?70:125;
  // Keep the richer model longer while moving away. This stops tiny camera
  // movements near a threshold from repeatedly swapping tree silhouettes.
  const hold=previous?.quality===quality&&previous.near;
  return {quality,near:screenHeight>=threshold*(hold?.82:1)};
}
