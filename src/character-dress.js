import {BufferGeometry, Float32BufferAttribute, Mesh} from 'three';
import pieces from './assets3d/characters/dress.json' with {type:'json'};

// Fitted at the neutral infantry pose. Riders use the same upper body and
// carry their own head, knee and torso pivots in each catalogue.
const outfits = {
  villager: {linenKerchief:'team', scarfKnot:'team', pocket:'leather', pocketFlap:'canvas'},
  monk: {linenKerchief:'canvas', stole:'team', beard:'hair'},
  scout: {rangerMantle:'canvas', clasp:'iron'},
  outrider: {rangerMantle:'team', clasp:'iron', beard:'hair'},
  archer: {rangerMantle:'team', clasp:'leather'},
  marksman: {rangerMantle:'canvas', clasp:'gold'},
  skirmisher: {linenKerchief:'team', scarfKnot:'team'},
  chukonu: {mailStandard:'iron', tassets:'leather'},
  spearman: {mailStandard:'iron', tabard:'team'},
  swordsman: {mailStandard:'steel', tassets:'iron', tabard:'team'},
  sentinel: {mailStandard:'iron', tassets:'steel', tabard:'team', blazon:'gold'},
  knight: {mailStandard:'steel', tabard:'team', blazon:'steel'},
  firelancer: {mailStandard:'iron', tassets:'steel', clasp:'gold'},
  ironbreaker: {mailStandard:'steel', beard:'hair'},
  king: {courtMantle:'team', clasp:'gold', stole:'canvas', beard:'hair'},
  hero_alder: {courtMantle:'team', clasp:'gold', tabard:'canvas', blazon:'team'},
  hero_sun: {courtMantle:'canvas', clasp:'gold', stole:'team'},
  hero_raven: {rangerMantle:'leather', clasp:'steel', beard:'hair'},
  hero_iron: {mailStandard:'iron', tassets:'steel', beard:'hair'},
  hero_jade: {courtMantle:'team', clasp:'gold', tassets:'iron'},
};

const shared = new Map();
function dressGeometry(name) {
  if (shared.has(name)) return shared.get(name);
  const {points, triangles} = pieces[name];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(points.map(v => v / 10000), 3));
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  const uv = [], color = [];
  for (let i = 0; i < points.length; i += 3) {
    uv.push(points[i] / 10000, (points[i+1] + points[i+2]*.35) / 10000);
    color.push(1, 1, 1);
  }
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new Float32BufferAttribute(color, 3));
  shared.set(name, geometry);
  return geometry;
}

export function fitCharacterDress(root, type, detail) {
  const outfit = outfits[type];
  if (!outfit) return;
  const joints = new Map();
  root.traverse(part => {
    const motion = part.userData.motion;
    if (part.isMesh && motion) joints.set(motion.type === 'knee' ? 'knee'+motion.side : motion.type, motion);
  });
  const head = joints.get('head'), torso = joints.get('torso');
  if (!head || !torso) return;
  const lift = head.pivot[1] - 2.14;
  function attach(name, role, motion, x=0, y=lift, z=0) {
    const mesh = new Mesh(dressGeometry(name), null);
    mesh.name = name;
    mesh.userData = {assetMaterial:role, motion, figurePart:name};
    mesh.position.set(x, y, z);
    root.add(mesh);
  }
  for (const [name, role] of Object.entries(outfit)) {
    attach(name, role, name === 'beard' ? head : torso);
  }
  if (detail === 'far') return;
  for (const [name, role] of [['cheek','skin'], ['chin','skin'], ['brow','skin'], ['eyes','plaster']]) {
    attach(name, role, head);
  }
  for (const side of [-1,1]) {
    const knee = joints.get('knee'+side);
    if (!knee) continue;
    const [x,y,z] = knee.pivot;
    const armored = outfit.mailStandard || outfit.courtMantle;
    attach(armored ? 'greave' : 'bindings', armored ? 'steel' : 'leather', knee, x+(knee.riding ? side*.025 : 0), y, z);
  }
}
