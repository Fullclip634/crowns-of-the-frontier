// Export the original game's complete model catalogue for Blender refinement.
// Semantic materials and joint extras keep team colours and gameplay animation.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { WorldView } from '../../src/world.js';
import { BUILDINGS, UNITS } from '../../src/data.js';
import { buildingModel, unitModel, resourceModel, treeModel } from '../../src/models-3d.js';
const args=process.argv.slice(2);if(args.some(arg=>arg!=='--resources-only')||args.length>1)throw new Error('Unsupported source export option.');
const resourcePreview=args.includes('--resources-only');

// GLTFExporter uses FileReader for its binary Blob, including without textures.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.({ target: this });
    }).catch((error) => this.onerror?.(error));
  }
};

const colors = {
  stone:0xb6b5a4, stoneDark:0x737e78, plaster:0xd9c8a6,
  wood:0x756046, darkwood:0x483c30, roof:0x5a6c66, roofRed:0x8b5949,
  gold:0xbda44b, iron:0x8a9ba0, leaf:0x668943, leafDark:0x416936,
  trunk:0x66563e, skin:0xd2b08d, berry:0x9d4d48, soil:0x837052,
  furrow:0x6b6343, crop:0xc3ad62, water:0x89b8bd,
  glass:0x263e42, timberEdge:0x473328,
};
function fixture(faction) {
  const view = Object.create(WorldView.prototype);
  view.exportingOriginalCatalogue = true;
  view.materials = Object.fromEntries(Object.entries(colors).map(([key,color]) =>
    [key,new THREE.MeshStandardMaterial({color,roughness:.85})]));
  view.materials.shadow = new THREE.MeshBasicMaterial({transparent:true,opacity:.1});
  view.geo = {
    box:new THREE.BoxGeometry(1,1,1), sphere:new THREE.IcosahedronGeometry(1,0),
    cylinder:new THREE.CylinderGeometry(1,1,1,10), cone:new THREE.ConeGeometry(1,1,7),
  };
  view.teamMaterials = [new THREE.MeshStandardMaterial({color:0x397f8c})];
  view.roofMaterials = [new THREE.MeshStandardMaterial({color:0x475b65})];
  view.sim = {
    players:[{faction,age:0}], options:{seed:2026,map:'highlands'},
    isWater:(x) => x>8,
  };
  return view;
}

const scene = new THREE.Scene();
const manifest = [];
let meshId = 0;
function add(view, root, assetKey) {
  if (root.userData.body) root.userData.body.userData.assetBody = true;
  delete root.userData.body;
  delete root.userData.portcullis;
  view.mergeModel(root);
  root.name = `asset__${assetKey.replaceAll(':','__')}`;
  root.userData.assetKey = assetKey;
  const names = new Map(Object.entries(view.materials).map(([key,mat]) => [mat,key]));
  names.set(view.teamMaterials[0],'team');
  names.set(view.roofMaterials[0],'teamRoof');
  root.traverse((part) => {
    if (!part.isMesh) {
      if (!part.name) part.name = `group_${++meshId}`;
      return;
    }
    const role = names.get(part.material);
    if (!role) throw new Error(`Unmapped material in ${assetKey}`);
    part.material.name = role;
    part.userData.assetMaterial = role;
    part.name = `part_${++meshId}`;
  });
  scene.add(root);
  manifest.push({key:assetKey,kind:root.userData.model3d?.kind});
}

for (const faction of resourcePreview?[]:['alder','sun','raven']) {
  const view = fixture(faction);
  for (const [type,definition] of Object.entries(BUILDINGS)) {
    for (let age=0;age<(type==='towncenter'?4:1);age++) {
      view.sim.players[0].age = age;
      add(view,buildingModel(view,{kind:'building',type,owner:0,r:definition.r,x:-20,z:0}),
        `building:${type}:${faction}:${age}`);
    }
  }
}
const view = fixture('alder');
for (const type of resourcePreview?[]:Object.keys(UNITS))
  add(view,unitModel(view,{kind:'unit',type,owner:0,id:31}),`unit:${type}`);
for(const task of resourcePreview?[]:['wood','mine','food','build'])
  add(view,unitModel(view,{kind:'unit',type:'villager',owner:0,id:31}),`unit:villager:${task}`);
for (const biome of resourcePreview?[]:['highlands','winter','desert'])
  for (let variant=0;variant<4;variant++)
    for (const far of [false,true])
      add(view,treeModel(view,biome,variant,far),`tree:${biome}:${variant}:${far?'far':'near'}`);
for (const type of ['food','gold','stone'])
  for (let variant=0;variant<4;variant++)
    add(view,resourceModel(view,{id:51+variant,kind:'resource',type}),`resource:${type}:${variant}`);
add(view,resourceModel(view,{id:52,kind:'resource',type:'food',water:true}),'resource:fish');
add(view,resourceModel(view,{id:53,kind:'shrine'}),'resource:shrine');

const outputDirectory=resourcePreview?'.tools/art-candidate/resources/source':'.tools/art-source';
await mkdir(outputDirectory,{recursive:true});
const output = await new GLTFExporter().parseAsync(scene,{
  binary:true,onlyVisible:false,includeCustomExtensions:true,
  copyright:'Original Crowns of the Frontier models; project-owned source.',
});
await writeFile(outputDirectory+'/catalogue.glb',Buffer.from(output));
await writeFile(outputDirectory+'/catalogue.json',`${JSON.stringify(manifest,null,2)}\n`);
console.log(JSON.stringify({models:manifest.length,meshes:meshId,bytes:output.byteLength}));
