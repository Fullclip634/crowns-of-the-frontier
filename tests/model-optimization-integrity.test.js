import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const read = (name) => fs.readFileSync(new URL(`../src/assets3d/${name}`, import.meta.url));
async function loadScene(name) {
  const bytes = read(name);
  const gltf = await new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  gltf.scene.updateMatrixWorld(true);
  return gltf.scene;
}

function disposeScene(scene) {
  const geos = new Set();
  const mats = new Set();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    geos.add(o.geometry);
    if (Array.isArray(o.material)) o.material.forEach((m) => mats.add(m));
    else if (o.material) mats.add(o.material);
  });
  for (const g of geos) g.dispose();
  for (const m of mats) m.dispose();
}

function meshMetrics(mesh) {
  const g = mesh.geometry;
  const pos = g.attributes.position;
  const idx = g.index;
  const count = idx ? idx.count : pos.count;
  const tris = count / 3;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const cross = new THREE.Vector3();
  let degenerate = 0;
  let signedVolume = 0;
  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(pos, idx ? idx.getX(i) : i);
    b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1);
    c.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    if (ab.cross(ac).lengthSq() < 1e-12) degenerate++;
    cross.crossVectors(b, c);
    signedVolume += a.dot(cross) / 6;
  }
  return { tris, degenerate, signedVolume };
}

function rootMetrics(root) {
  let tris = 0;
  let degenerate = 0;
  const parts = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = meshMetrics(o);
    tris += m.tris;
    degenerate += m.degenerate;
    parts.push({ name: o.name, role: o.userData.assetMaterial, nearOnly: !!o.userData.nearOnly, ...m });
  });
  return { tris, degenerate, parts };
}

test('optimized farms, resources, meadow conifers, roof tiles, and bridge have zero degenerate tris and lean budgets', async () => {
  const near = await loadScene('frontier-near.glb');
  const low = await loadScene('frontier-low.glb');
  const trees = await loadScene('frontier-trees.glb');
  const bridge = await loadScene('frontier-bridge.glb');
  try {
    const byKey = (scene) => {
      const map = new Map();
      scene.traverse((n) => {
        if (n.userData?.assetKey) map.set(n.userData.assetKey, n);
      });
      return map;
    };
    const nearMap = byKey(near);
    const lowMap = byKey(low);
    const treeMap = byKey(trees);

    // 1. Farms (alder, sun, raven): closed solids, 0 degenerate tris, lean wheat/barley geometry
    for (const faction of ['alder', 'sun', 'raven']) {
      const key = `building:farm:${faction}:0`;
      const nm = rootMetrics(nearMap.get(key));
      const lm = rootMetrics(lowMap.get(key));
      assert.equal(nm.degenerate, 0, `${key} near has zero degenerate triangles`);
      assert.equal(lm.degenerate, 0, `${key} low has zero degenerate triangles`);
      assert.ok(nm.tris <= 7500, `${key} near stays optimized (${nm.tris} tris)`);
      assert.ok(lm.tris <= 3200, `${key} low stays optimized (${lm.tris} tris)`);
      for (const p of nm.parts) assert.ok(p.signedVolume > 0.00001, `${key}/${p.name} keeps closed outward volume`);
    }

    // 2. Resources (food, gold, stone): all crafted parts preserved, 0 degenerate tris, no bevel bloat
    for (let v = 0; v < 4; v++) {
      const food = rootMetrics(nearMap.get(`resource:food:${v}`));
      assert.equal(food.degenerate, 0, `resource:food:${v} has zero degenerate triangles`);
      assert.ok(food.tris <= 2000, `resource:food:${v} stays optimized (${food.tris} tris)`);
      for (const suffix of ['_FruitCanes', '_FruitClusters', '_FruitLeaves_leaf', '_FruitLeaves_leafDark', '_FruitLeafTips']) {
        assert.ok(food.parts.some((p) => p.name.endsWith(suffix)), `resource:food:${v} keeps ${suffix}`);
      }
      for (const p of food.parts) assert.ok(p.signedVolume > 0.0001, `resource:food:${v}/${p.name} closed volume`);

      const gold = rootMetrics(nearMap.get(`resource:gold:${v}`));
      assert.equal(gold.degenerate, 0, `resource:gold:${v} has zero degenerate triangles`);
      assert.ok(gold.tris <= 2600, `resource:gold:${v} stays optimized (${gold.tris} tris)`);
      for (const suffix of ['_WeatheredDeposit', '_GoldSeams', '_GoldInclusions']) {
        assert.ok(gold.parts.some((p) => p.name.endsWith(suffix)), `resource:gold:${v} keeps ${suffix}`);
      }
      for (const p of gold.parts) assert.ok(p.signedVolume > 0.001, `resource:gold:${v}/${p.name} closed volume`);

      const stone = rootMetrics(nearMap.get(`resource:stone:${v}`));
      assert.equal(stone.degenerate, 0, `resource:stone:${v} has zero degenerate triangles`);
      assert.ok(stone.tris <= 900, `resource:stone:${v} stays optimized (${stone.tris} tris)`);
      for (const p of stone.parts) assert.ok(p.signedVolume > 0.01, `resource:stone:${v}/${p.name} closed volume`);
    }

    // 3. Meadow conifers (tree:highlands:0..3:near): 0 degenerate tris, upright lush canopy <= 3000 tris
    for (let v = 0; v < 4; v++) {
      const key = `tree:highlands:${v}:near`;
      const root = treeMap.get(key);
      const tm = rootMetrics(root);
      const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
      assert.equal(tm.degenerate, 0, `${key} has zero degenerate triangles`);
      assert.ok(tm.tris <= 3000, `${key} stays optimized (${tm.tris} tris)`);
      assert.ok(size.y > Math.max(size.x, size.z) * 1.4, `${key} preserves upright conifer silhouette`);
      for (const p of tm.parts) assert.ok(p.signedVolume > 0.001, `${key}/${p.name} closed outward volume`);
    }

    // 4. Sculpted 3D roof _SlateTiles across 32 buildings: 0 degenerate tris, no overlapping bevel bloat
    let slateCount = 0;
    let slateTris = 0;
    near.traverse((o) => {
      if (!o.isMesh || !o.name.endsWith('_SlateTiles')) return;
      const m = meshMetrics(o);
      slateCount++;
      slateTris += m.tris;
      assert.equal(m.degenerate, 0, `${o.name} has zero degenerate triangles`);
      assert.ok(m.signedVolume > 0.001, `${o.name} keeps solid 3D shingle volume`);
    });
    assert.ok(slateCount >= 32, `keeps all ${slateCount} sculpted 3D slate roof meshes`);
    assert.ok(slateTris <= 36000, `slate roofs stay lean without overlapping bevels (${slateTris} tris)`);

    // 5. Stone river bridge: continuous manifold deck/spandrels + beveled pavers <= 7600 tris
    const bridgeRoot = byKey(bridge).get('terrain:bridge:stone');
    assert.ok(bridgeRoot, 'bridge root exists');
    const bm = rootMetrics(bridgeRoot);
    assert.equal(bm.degenerate, 0, 'bridge has zero degenerate triangles');
    assert.ok(bm.tris <= 7600, `bridge stays optimized (${bm.tris} tris)`);
    assert.deepEqual(bm.parts.map((p) => p.role).sort(), ['leafDark', 'stone', 'stoneDark']);
    for (const p of bm.parts) assert.ok(p.signedVolume > 0.001, `bridge/${p.role} keeps closed outward volume`);
  } finally {
    disposeScene(near);
    disposeScene(low);
    disposeScene(trees);
    disposeScene(bridge);
  }
});
