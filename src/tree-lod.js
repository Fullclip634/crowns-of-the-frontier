export function treeDetail(screenHeight,quality,previous){
  // Swap to the coarse canopy only once a tree is genuinely small on screen.
  // At 54 px the far mesh was still prominent, which read as a shrunken blob;
  // 34 px keeps the authored silhouette through normal RTS zoom levels.
  const threshold=34;
  // Keep the richer model longer while moving away. This stops tiny camera
  // movements near a threshold from repeatedly swapping tree silhouettes.
  // A settings change must not replace trees at an unchanged camera position.
  const hold=previous?.near;
  return {quality,near:screenHeight>=threshold*(hold?.82:1)};
}
// Decimated far canopies can also be narrower than the near model. Restoring
// the footprint keeps distant trees reading as trees instead of shrinking into
// a blob. Clamped so a genuinely different silhouette is never blown up.
export function farFootprintScale(nearWidth,farWidth){
  return Math.max(1,Math.min(1.35,(nearWidth||0)/Math.max(.001,farWidth||0)));
}
// Widens a tree instance without touching its height. Elements 0-3 and 8-11 are
// the X and Z basis columns; 4-7 are the Y column and must stay untouched, or a
// distant tree becomes taller than the near model and pops at the swap.
export function footprintScaledMatrix(matrix,scale){
  const out=matrix.clone();
  for(const index of [0,1,2,3,8,9,10,11])out.elements[index]*=scale;
  return out;
}
