import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {WorldView} from '../src/world.js';
import {BUILDINGS} from '../src/data.js';
import {buildingModel} from '../src/models-3d.js';
import {registerAuthoredAssets, clearAuthoredAssets} from '../src/authored-assets.js';
import {packBuildingModel} from '../src/structure-palette.js';

const KEEP_KEYS = ['building:keep:alder:0', 'building:keep:sun:0', 'building:keep:raven:0'];
const EXPECTED_ROLES = ['stone', 'stoneDark', 'wood', 'darkwood', 'iron', 'team', 'snow', 'glass', 'glow', 'leaf', 'leafDark', 'gold'];

async function loadCatalogue(detail) {
  const file = detail === 'high' ? 'near' : detail === 'medium' ? 'balanced' : detail;
  const bytes = await fs.readFile(new URL(`../src/assets3d/frontier-${file}.glb`, import.meta.url));
  const gltf = await new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return registerAuthoredAssets(gltf, detail, bytes.length);
}

function fixture(assets, faction = 'alder', age = 2) {
  const view = Object.create(WorldView.prototype);
  view.materials = {};
  for (const template of assets.templates.values()) {
    template.traverse(part => {
      if (part.isMesh && part.userData.assetMaterial && !['team', 'teamRoof'].includes(part.userData.assetMaterial)) {
        view.materials[part.userData.assetMaterial] ??= part.material.clone();
      }
    });
  }
  view.materials.water ??= new THREE.MeshStandardMaterial();
  view.teamMaterials = Array.from({length: 8}, (_, i) => new THREE.MeshStandardMaterial({color: i ? 0x9a687d : 0x2558c8}));
  view.roofMaterials = view.teamMaterials.map(mat => mat.clone());
  view.geo = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.IcosahedronGeometry(1, 0),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
    cone: new THREE.ConeGeometry(1, 1, 7),
  };
  view.sim = {players: Array.from({length: 8}, () => ({faction, age})), options: {seed: 512, map: 'highlands'}, isWater: () => false};
  view.settings = {quality: assets.detail};
  view.foundationHeights = new Map();
  view.materials.wood.map = new THREE.Texture();
  view.materials.stone.map = new THREE.Texture();
  for (const roof of view.roofMaterials) roof.map = new THREE.Texture();
  return view;
}

function meshTriangles(root) {
  let count = 0;
  root.traverse(part => {
    if (!part.isMesh) return;
    count += (part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3;
  });
  return Math.round(count);
}

test('AoE2 castle models preserve rich fortress materials, grounded plinth, animated flag and low-lag budgets', async () => {
  try {
    const stats = {};
    for (const detail of ['low', 'medium', 'high']) {
      const assets = await loadCatalogue(detail);
      const uniqueGeos = new Set();
      for (const key of KEEP_KEYS) {
        const root = assets.templates.get(key);
        assert.ok(root, `${detail} missing ${key}`);
        assert.equal(root.userData.model3d?.artRevision, 'aoe2-fortress-v1', `${detail} ${key} carries castle revision`);

        const roles = new Set();
        let flags = 0;
        root.traverse(part => {
          if (!part.isMesh) return;
          roles.add(part.userData.assetMaterial);
          uniqueGeos.add(part.geometry);
          if (part.userData.flag) flags++;
        });
        for (const role of EXPECTED_ROLES) {
          assert.ok(roles.has(role), `${detail} ${key} includes ${role} surface`);
        }
        assert.equal(flags, 1, `${detail} ${key} keeps one animated fluttering flag`);

        root.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(root);
        assert.ok(bounds.min.y <= -0.35, `${detail} ${key} grounds its plinth below -0.35 (${bounds.min.y.toFixed(2)})`);
        assert.ok(bounds.max.z >= 3.8, `${detail} ${key} extends its front drawbridge along +Z`);
        assert.ok(bounds.max.x >= 3.8 && bounds.min.z <= -3.3, `${detail} ${key} carries the projecting (+X, -Z) round corner tower`);
        assert.ok(bounds.max.y >= 8.5, `${detail} ${key} retains its elevated rear turret and flagpole skyline`);
      }

      const tris = meshTriangles(assets.templates.get(KEEP_KEYS[0]));
      stats[detail] = {tris, sharedGeoCount: uniqueGeos.size};

      // Verify runtime packing stays 1 static opaque surface + 1 flag = 2 draws with zero generic ageFortification boxes
      for (const faction of ['alder', 'sun', 'raven']) {
        const view = fixture(assets, faction, 2);
        const entity = {kind: 'building', type: 'keep', owner: 0, r: BUILDINGS.keep.r, x: 0, z: 0};
        const raw = buildingModel(view, entity);
        let genericClippers = 0;
        raw.traverse(part => { if (part.userData.ageFortification) genericClippers++; });
        assert.equal(genericClippers, 0, `${detail} ${faction} castle adds no generic clipping corner boxes`);
        const packed = packBuildingModel(view, raw, entity);
        const meshes = [];
        packed.traverse(part => { if (part.isMesh) meshes.push(part); });
        assert.equal(meshes.filter(p => p.userData.structureSurface).length, 1, `${detail} ${faction} merges into 1 opaque static draw`);
        assert.equal(meshes.length, 2, `${detail} ${faction} renders in exactly 2 draw calls (static fortress + animated flag)`);
      }
    }

    assert.ok(stats.low.tris <= 5500, `Low castle stays lean for phones (${stats.low.tris} tris)`);
    assert.ok(stats.high.tris <= 11000, `High castle stays below previous triangle cost (${stats.high.tris} tris)`);
    assert.ok(stats.low.tris < stats.high.tris * 0.65, `Low (${stats.low.tris}) is meaningfully lighter than High (${stats.high.tris})`);
    assert.equal(stats.medium.tris, stats.high.tris, 'Balanced receives the full High castle architecture');
    assert.equal(stats.low.sharedGeoCount, 13, 'All three factions share the 13 castle mesh datablocks on Low');
    assert.equal(stats.high.sharedGeoCount, 13, 'All three factions share the 13 castle mesh datablocks on High');
  } finally {
    clearAuthoredAssets();
  }
});
