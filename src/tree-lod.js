export function treeDetail(screenHeight,quality,previous,{threshold=34}={}){
  // Swap to the coarse canopy only once a tree is genuinely small on screen.
  // At 54 px the far mesh was still prominent, which read as a shrunken blob;
  // 34 px keeps the authored silhouette through normal RTS zoom levels. The
  // caller can raise the threshold when GPU timing proves the frame is bound.
  const limit=Number.isFinite(threshold)?Math.max(1,threshold):34;
  // Keep the richer model longer while moving away. This stops tiny camera
  // movements near a threshold from repeatedly swapping tree silhouettes.
  // A settings change must not replace trees at an unchanged camera position.
  const hold=previous?.near;
  return {quality,near:screenHeight>=limit*(hold?.82:1)};
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
// A whole forest grown from one canopy reads as rows of copies. Each tree gets a
// small canopy tint derived from its id: brightness .93-1.07 with a faint warm
// or cool shift, so neighbours differ without any tree looking wrong. Deriving
// it from the id rather than a random draw keeps it stable across frames and
// independent of how many trees the map happens to place.
export function treeTint(id){
  const a=((id*2654435761)>>>0)/4294967296,b=((id*2246822519+374761393)>>>0)/4294967296;
  const light=.93+a*.14,warm=(b-.5)*.07;
  return {r:light*(1+warm),g:light,b:light*(1-warm*.7)};
}
