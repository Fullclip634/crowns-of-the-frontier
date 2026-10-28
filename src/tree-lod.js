export function treeDetail(screenHeight,quality,previous){
  const threshold=54;
  // Keep the richer model longer while moving away. This stops tiny camera
  // movements near a threshold from repeatedly swapping tree silhouettes.
  // A settings change must not replace trees at an unchanged camera position.
  const hold=previous?.near;
  return {quality,near:screenHeight>=threshold*(hold?.82:1)};
}
