import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {canonicalGeometry} from './authored-assets.js';
import {bridgeArtwork,bridgeSpans} from './bridge-layout.js';
const source=new URL('./assets3d/frontier-bridge.glb',import.meta.url).href;
let pending,template,bytes=0;
function bridgeAprons(view,span){
  const positions=[],colors=[],uv=[],indices=[],land=view.landscape;
  for(const side of [-1,1])for(let row=0;row<6;row++)for(let col=0;col<12;col++){
    const xx=[span.center+side*(span.halfLength+row*.5),span.center+side*(span.halfLength+(row+1)*.5)].sort((a,b)=>a-b),z0=-bridgeArtwork.roadHalfWidth+col*1.6,z1=Math.min(bridgeArtwork.roadHalfWidth,z0+1.6),points=[[xx[0],z0],[xx[1],z0],[xx[1],z1],[xx[0],z1]],base=positions.length/3;
    for(const top of [false,true])for(const [x,z]of points){const y=land.walkableHeightAt(x,z)+.006;positions.push(x,top?y:Math.min(land.surfaceHeightAt(x,z)-.12,y-.18),z);uv.push(x*.5,z*.5);colors.push(.70,.70,.64);}
    for(const index of [0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0])indices.push(base+index);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();return new THREE.Mesh(geometry,view.materials.rock||view.materials.stone);
}
export async function loadBridgeArtwork(){
  if(!pending)pending=(async()=>{const response=await fetch(source);if(!response.ok)throw new Error('Bridge artwork request failed ('+response.status+').');const buffer=await response.arrayBuffer(),gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer,'');let root;gltf.scene.traverse(node=>{if(node.userData.assetKey==='terrain:bridge:stone')root=node;if(node.isMesh)canonicalGeometry(node.geometry);});if(!root||root.userData.bridgeRevision!==bridgeArtwork.revision)throw new Error('Bridge artwork is incomplete or out of date.');bytes=buffer.byteLength;template=root;return root;})();
  try{return await pending;}catch(error){pending=null;throw error;}
}
export function buildBridges(view){
  view.bridgeMeshes=[];let triangles=0,draws=0;
  for(const span of bridgeSpans(view.landscape.map)){
    if(!template)throw new Error('Bridge artwork has not finished loading.');
    const root=template.clone(true),group=new THREE.Group(),aprons=bridgeAprons(view,span);root.position.x=span.center;root.scale.x=span.halfLength/bridgeArtwork.halfLength;group.add(root,aprons);
    root.traverse(part=>{if(!part.isMesh)return;const role=part.userData.assetMaterial,material=role==='stone'?(view.materials.rock||view.materials.stone):view.materials[role];if(!material)throw new Error('Unknown bridge material.');material.vertexColors=true;part.material=material;});
    view.mergeModel(group);aprons.geometry.dispose();group.name='Authored stone river bridge';group.userData.bridge=span;
    group.traverse(part=>{if(part.isMesh){triangles+=(part.geometry.index?.count||part.geometry.attributes.position.count)/3;draws++;}});
    view.terrain.add(group);view.bridgeMeshes.push(group);
  }
  view.bridgeDiagnostics={source:'Blender',revision:bridgeArtwork.revision,bridges:view.bridgeMeshes.length,triangles,draws,bytes,clearWidth:bridgeArtwork.roadHalfWidth*2};
}
