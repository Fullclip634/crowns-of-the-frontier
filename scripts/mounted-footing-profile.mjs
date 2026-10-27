import fs from 'node:fs';import * as THREE from 'three';import {performance} from 'node:perf_hooks';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {prepareFootPlacement} from '../src/foot-placement.js';import {bindMountedFootRig} from '../src/mounted-footing.js';import {animatePart,beginJointPose,endJointPose} from '../src/world-polish.js';import {Landscape} from '../src/landscape.js';

if(!process.env.MOUNTED_BASELINE)throw new Error('Set MOUNTED_BASELINE to a pre-articulated Low catalogue for comparison.');
const paths={baseline:process.env.MOUNTED_BASELINE,candidate:process.env.MOUNTED_CANDIDATE||'src/assets3d/frontier-low.glb'},types=['scout','knight','outrider'],rigs=new Map();
for(const [name,file]of Object.entries(paths)){
  const bytes=fs.readFileSync(file),gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),''),roots=new Map();gltf.scene.traverse(node=>{if(node.userData.assetKey)roots.set(node.userData.assetKey,node);});
  for(const type of types){const root=roots.get('unit:'+type).clone(true);if(name==='candidate'&&!bindMountedFootRig(root))throw Error('Candidate rig missing for '+type);const parts=new Map();root.traverse(part=>{if(part.isMesh){const key=JSON.stringify(part.userData.motion||null);if(!parts.has(key))parts.set(key,{userData:{motion:part.userData.motion}});}});rigs.set(name+':'+type,[...parts.values()]);}
}
const land=new Landscape(512,'highlands'),geometry=land.geometry(land.renderSize,112),entities=Array.from({length:96},(_,id)=>({id,type:types[id%types.length],kind:'unit',hp:100,moving:true})),matrix=new THREE.Matrix4();
const report={scope:'CPU pose preparation for 96 low-detail mounted units on one terrain grid; excludes GPU rendering, simulation, UI and physical-device FPS.',runs:[]};
for(const moving of [true,false])for(const name of ['baseline','candidate','baseline','candidate']){
  const gaits=new Map(entities.map(e=>[e.id,{phase:e.id*.7,blend:Number(moving),bob:0}]));let samples=0;
  const view={clock:0,landscape:{grid:land.grid,walkableSampleAt:(...args)=>{samples++;return land.walkableSampleAt(...args);}},groundHeight:(x,z)=>{samples++;return land.walkableHeightAt(x,z);},locomotion:{get:id=>gaits.get(id)},jointPoseDiagnostics:{computed:0,reused:0}},batch={model3d:{terrainHorse:name==='candidate'}},times=[];
  for(let frame=0;frame<240;frame++){
    view.clock=frame/60;view.footDiagnostics={computed:0,reused:0,samples:0};const start=performance.now();
    for(const e of entities){e.moving=moving;const gait=gaits.get(e.id);gait.phase=e.id*.7+(moving?frame*.03*Math.PI:0);gait.bob=moving?(1-Math.cos(gait.phase*2))*.027:0;const x=(e.id%12-5.5)*2+(moving?frame*.012:0),z=(Math.floor(e.id/12)-3.5)*2+(moving?frame*.03:0);matrix.makeRotationY(.4).setPosition(x,land.walkableHeightAt(x,z)+gait.bob,z);const body=prepareFootPlacement(view,batch,e,matrix);beginJointPose(view,e,body);for(const part of rigs.get(name+':'+e.type))animatePart(view,part,e,body);endJointPose(view);}
    if(frame>=60)times.push(performance.now()-start);
  }
  times.sort((a,b)=>a-b);report.runs.push({moving,name,medianMs:times[90],p95Ms:times[171],terrainSamples:samples,cache:view.footDiagnostics});
}
geometry.dispose();fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/mounted-footing-profile.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
