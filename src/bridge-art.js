import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {canonicalGeometry} from './authored-assets.js';
import {readAssetResponse} from './load-progress.js';
import {bridgeArtwork,bridgeSpans,bridgeRoadHalfWidth,bridgeWidthScale,spanZ,spanRoadHalfWidth} from './bridge-layout.js';
import {shadeBattlefieldFog} from './fog-surface.js';
import {cloneEpicProp} from './epic-props-art.js';
const source=new URL('./assets3d/frontier-bridge.glb',import.meta.url).href;
let pending,template,bytes=0;
function bridgeAprons(view,span){
  const positions=[],colors=[],uv=[],indices=[],land=view.landscape,cz=spanZ(span),roadHalf=spanRoadHalfWidth(span);
  for(const side of [-1,1])for(let row=0;row<6;row++)for(let col=0;col<12;col++){
    const xx=[span.center+side*(span.halfLength+row*.5),span.center+side*(span.halfLength+(row+1)*.5)].sort((a,b)=>a-b),width=roadHalf/6,z0=cz-roadHalf+col*width,z1=Math.min(cz+roadHalf,z0+width),points=[[xx[0],z0],[xx[1],z0],[xx[1],z1],[xx[0],z1]],base=positions.length/3;
    const edgeShade=col===0||col===11?.82:1;
    const wearFade=row>=4?.86:row>=3?.94:1;
    const stoneVar=.93+((Math.abs((row*37+col*17+(side>0?11:3))%13))/12)*.12;
    const cr=.68*edgeShade*stoneVar*wearFade,cg=.68*edgeShade*stoneVar*wearFade,cb=.63*edgeShade*stoneVar*(row>=4?.90:1);
    for(const top of [false,true])for(const [x,z]of points){const y=land.walkableHeightAt(x,z)+.006;positions.push(x,top?y:Math.min(land.surfaceHeightAt(x,z)-.12,y-.18),z);uv.push(x*.46,z*.46);colors.push(top?cr:cr*.78,top?cg:cg*.78,top?cb:cb*.78);}
    for(const index of [0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0])indices.push(base+index);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();return new THREE.Mesh(geometry,view.materials.rock||view.materials.stone);
}
export async function loadBridgeArtwork(){
  if(!pending)pending=(async()=>{const response=await fetch(source);if(!response.ok)throw new Error('Bridge artwork request failed ('+response.status+').');const buffer=await readAssetResponse(response,'bridge','Bridge'),gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer,'');let root;gltf.scene.traverse(node=>{if(node.userData.assetKey==='terrain:bridge:stone')root=node;if(node.isMesh)canonicalGeometry(node.geometry);});if(!root||root.userData.bridgeRevision!==bridgeArtwork.revision)throw new Error('Bridge artwork is incomplete or out of date.');bytes=buffer.byteLength;template=root;return root;})();
  try{return await pending;}catch(error){pending=null;throw error;}
}
export function updateBridgeVisibility(view,menu=false){
  if(!view.bridgeMeshes?.length)return;
  const sim=view.sim,unrestricted=menu||view.settings.fog===false||sim.options.spectator;
  for(const bridge of view.bridgeMeshes){
    const fog=bridge.userData.discovery;
    if(!unrestricted&&fog.revision!==sim.fogRevision){
      fog.revision=sim.fogRevision;
      fog.explored=false;
      // The foot of the bridge can be scouted before the center of the crossing.
      const {bounds}=fog;
      const min=sim.cell(bounds.min.x,bounds.min.z),max=sim.cell(bounds.max.x,bounds.max.z);
      cells:for(let z=min.z;z<=max.z;z++){
        for(let x=min.x;x<=max.x;x++){
          if(sim.explored[z*sim.gridSize+x]){fog.explored=true;break cells;}
        }
      }
    }
    bridge.visible=unrestricted||fog.explored;
  }
}

export function buildBridges(view){
  view.bridgeMeshes=[];const materials=new Map();let triangles=0,draws=0;
  for(const span of bridgeSpans(view.landscape.map)){
    const timber=span.style==='timber';
    const cz=spanZ(span);
    let root=null;
    if(timber)root=cloneEpicProp('bridge:timber');
    if(!root){
      if(!template)throw new Error('Bridge artwork has not finished loading.');
      root=template.clone(true);
    }
    const group=new THREE.Group(),aprons=bridgeAprons(view,span);
    root.position.set(span.center,0,cz);
    if(timber){
      root.scale.set(span.halfLength/10.6,1,1.18);
    }else{
      root.scale.set(span.halfLength/bridgeArtwork.halfLength,1,bridgeWidthScale);
    }
    group.add(root,aprons);
    root.traverse(part=>{
      if(!part.isMesh)return;
      const role=part.userData.assetMaterial;
      const material=role==='stone'?(view.materials.rock||view.materials.stone):(view.materials[role]||view.materials.wood);
      if(!material)throw new Error('Unknown bridge material.');
      material.vertexColors=true;part.material=material;
    });
    view.mergeModel(group);aprons.geometry.dispose();group.name=timber?'Authored timber trestle bridge':'Authored stone river bridge';group.userData.bridge=span;
    group.traverse(part=>{
      if(!part.isMesh)return;
      const source=part.material;
      if(!materials.has(source))materials.set(source,shadeBattlefieldFog(source.clone(),view));
      part.material=materials.get(source);triangles+=(part.geometry.index?.count||part.geometry.attributes.position.count)/3;draws++;
    });
    group.userData.discovery={bounds:new THREE.Box3().setFromObject(group),revision:-1,explored:false};
    view.terrain.add(group);view.bridgeMeshes.push(group);
  }
  view.bridgeDiagnostics={source:'Blender',revision:bridgeArtwork.revision,bridges:view.bridgeMeshes.length,triangles,draws,bytes,clearWidth:bridgeRoadHalfWidth*2};
}
