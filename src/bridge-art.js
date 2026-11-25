import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {canonicalGeometry} from './authored-assets.js';
import {readAssetResponse} from './load-progress.js';
import {bridgeArtwork,bridgeSpans,bridgeRoadHalfWidth,spanZ,spanRoadHalfWidth} from './bridge-layout.js';
import {shadeBattlefieldFog} from './fog-surface.js';
const source=new URL('./assets3d/frontier-bridge.glb',import.meta.url).href;
let pending,template,bytes=0;
function bridgeAprons(view,span){
  const positions=[],colors=[],uv=[],indices=[],land=view.landscape,cz=spanZ(span),roadHalf=spanRoadHalfWidth(span);
  const quad=[0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0];
  for(const side of [-1,1]){
    // Sloped warm sunlit medieval cobblestone entry ramps matching the flat AoE2:DE causeway deck
    for(let row=0;row<6;row++)for(let col=0;col<12;col++){
      const xx=[span.center+side*(span.halfLength+row*.5),span.center+side*(span.halfLength+(row+1)*.5)].sort((a,b)=>a-b),width=roadHalf/6,z0=cz-roadHalf+col*width,z1=Math.min(cz+roadHalf,z0+width),points=[[xx[0],z0],[xx[1],z0],[xx[1],z1],[xx[0],z1]],base=positions.length/3;
      const isCurb=col===0||col===11;
      const wearFade=row>=5?.90:row>=4?.95:1;
      const stoneVar=.94+((Math.abs((row*37+col*17+(side>0?11:3))%13))/12)*.10;
      const cr=(isCurb?.99:.95)*stoneVar*wearFade,cg=(isCurb?.95:.89)*stoneVar*wearFade,cb=(isCurb?.84:.74)*stoneVar*(row>=5?.93:1);
      for(const top of [false,true])for(const [x,z]of points){const y=land.walkableHeightAt(x,z)+.006;positions.push(x,top?y:Math.min(land.surfaceHeightAt(x,z)-.14,y-.22),z);uv.push(x*.44,z*.44);colors.push(top?cr:cr*.76,top?cg:cg*.76,top?cb:cb*.76);}
      for(const index of quad)indices.push(base+index);
    }
    // Sloped medieval stone wing-curbs flanking both sides of the entry ramp (strictly outside ±roadHalf)
    const curbW=Math.min(.54,roadHalf*.085);
    for(const zSide of [-1,1])for(let row=0;row<6;row++){
      const xNear=span.center+side*(span.halfLength+row*.5),xFar=span.center+side*(span.halfLength+(row+1)*.5);
      const xx=[xNear,xFar].sort((a,b)=>a-b);
      const zz=[cz+zSide*(roadHalf+.01),cz+zSide*(roadHalf+.01+curbW)].sort((a,b)=>a-b);
      const points=[[xx[0],zz[0]],[xx[1],zz[0]],[xx[1],zz[1]],[xx[0],zz[1]]],base=positions.length/3;
      const t0=1-row/6,t1=1-(row+1)/6;
      for(const top of [false,true])for(const [x,z]of points){
        const frac=Math.abs(x-xNear)<Math.abs(x-xFar)?t0:t1;
        const ground=land.walkableHeightAt(x,cz+zSide*(roadHalf-.05));
        const yTop=ground+.06+frac*.82,yBot=Math.min(land.surfaceHeightAt(x,z)-.20,ground-.28);
        positions.push(x,top?yTop:yBot,z);uv.push(x*.44,z*.44);
        colors.push(top?.95:.74,top?.91:.70,top?.80:.62);
      }
      for(const index of quad)indices.push(base+index);
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();return new THREE.Mesh(geometry,view.materials.stone||view.materials.rock);
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
    const cz=spanZ(span);
    if(!template)throw new Error('Bridge artwork has not finished loading.');
    const root=template.clone(true);
    const group=new THREE.Group(),aprons=bridgeAprons(view,span);
    root.position.set(span.center,0,cz);
    root.scale.set(span.halfLength/bridgeArtwork.halfLength,1,spanRoadHalfWidth(span)/bridgeArtwork.roadHalfWidth);
    group.add(root,aprons);
    root.traverse(part=>{
      if(!part.isMesh)return;
      const role=part.userData.assetMaterial;
      const material=view.materials[role]||view.materials.stone||view.materials.rock;
      if(!material)throw new Error('Unknown bridge material.');
      material.vertexColors=true;part.material=material;
    });
    view.mergeModel(group);aprons.geometry.dispose();group.name='Authored stone causeway bridge';group.userData.bridge=span;
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
