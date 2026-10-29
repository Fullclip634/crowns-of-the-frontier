const RUNTIME_ONLY=[
  /^frontier-(?:near|balanced)-[^/]+\.glb$/i,
  /\.ktx2$/i,
  /(?:^|[-_])(?:normal|arm)(?:[-_.]|$)/i,
];
const LOW_COMPRESSED=/_color-[^/]+\.ktx2$/i;
export function precacheFiles(files){
  return files.filter(file=>{
    // Texture names may include "normal"; font names use it for upright style.
    if(!file.startsWith('/assets/'))return true;
    const name=file.split('/').pop();
    return LOW_COMPRESSED.test(name)||!RUNTIME_ONLY.some(pattern=>pattern.test(name));
  });
}
