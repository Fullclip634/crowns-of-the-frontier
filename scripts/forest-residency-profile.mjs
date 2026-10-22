import fs from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {registerAuthoredAssets,registerSharedTrees,useSharedTrees,clearAuthoredAssets} from '../src/authored-assets.js';

const decode=async file=>{const bytes=fs.readFileSync('src/assets3d/'+file);return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');};
function reachable(catalogue){
  const nodes=new Set(),buffers=new Set(),geometries=new Set(),models=[];
  const visit=node=>{if(!node||nodes.has(node))return;nodes.add(node);if(node.userData.assetKey)models.push(node.userData.assetKey);if(node.isMesh){geometries.add(node.geometry);for(const a of [...Object.values(node.geometry.attributes),node.geometry.index].filter(Boolean))buffers.add((a.isInterleavedBufferAttribute?a.data.array:a.array).buffer);}visit(node.parent);for(const child of node.children)visit(child);};
  for(const node of catalogue.templates.values())visit(node);
  return {nodes:nodes.size,geometries:geometries.size,models:models.length,treeRoots:models.filter(key=>key.startsWith('tree:')).length,decodedBufferBytes:[...buffers].reduce((sum,buffer)=>sum+buffer.byteLength,0)};
}
const trees=registerSharedTrees(await decode('frontier-trees.glb')),tiers=[];
for(const tier of ['near','balanced','low']){const gltf=await decode('frontier-'+tier+'.glb'),catalogue=registerAuthoredAssets(gltf,tier);useSharedTrees(catalogue,trees);tiers.push({tier,...reachable(catalogue)});clearAuthoredAssets();}
const report={note:'Decoded attribute/index buffers reachable through template parent/child links; not process RAM, GPU memory or FPS.',tiers},file=process.argv[2]||'artifacts/forest-residency-profile.json';fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({file,...report}));
