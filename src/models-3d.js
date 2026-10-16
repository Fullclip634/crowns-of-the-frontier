import * as THREE from 'three';
import {UNITS,seededRandom} from './data.js';
import {authoredUnit,authoredBuilding,authoredResource,authoredTree} from './authored-assets.js';

const Y=new THREE.Vector3(0,1,0);
function standard(color,extra={}){return new THREE.MeshStandardMaterial({color,roughness:.85,...extra});}
function closedCloth(width=1,height=1){
  const positions=[],uv=[],indices=[],cols=8,rows=3;
  for(let side=0;side<2;side++)for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++){
    const u=col/cols,v=row/rows;positions.push((u-.5)*width,(v-.5)*height,Math.sin(u*Math.PI*2)*.09*width+Math.sin(v*Math.PI)*.045+(side?-.018:.018));uv.push(u,v);
  }
  const layer=(cols+1)*(rows+1);
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
    const a=row*(cols+1)+col,b=a+cols+1;indices.push(a,a+1,b,a+1,b+1,b,a+layer,b+layer,a+1+layer,a+1+layer,b+layer,b+1+layer);
  }
  const stitch=(a,b)=>indices.push(a,b,a+layer,b,b+layer,a+layer);
  for(let col=0;col<cols;col++){stitch(col,col+1);stitch(rows*(cols+1)+col+1,rows*(cols+1)+col);}
  for(let row=0;row<rows;row++){stitch((row+1)*(cols+1),row*(cols+1));stitch(row*(cols+1)+cols,(row+1)*(cols+1)+cols);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
function archGeometry(){
  const outer=new THREE.Shape();outer.moveTo(-.5,0);outer.lineTo(.5,0);outer.lineTo(.5,.5);outer.absarc(0,.5,.5,0,Math.PI,false);outer.lineTo(-.5,0);
  const hole=new THREE.Path();hole.moveTo(-.32,0);hole.lineTo(-.32,.5);hole.absarc(0,.5,.32,Math.PI,0,true);hole.lineTo(.32,0);hole.lineTo(-.32,0);outer.holes.push(hole);
  return new THREE.ExtrudeGeometry(outer,{depth:1,bevelEnabled:false,curveSegments:8}).translate(0,0,-.5);
}
function gableGeometry(){const s=new THREE.Shape();s.moveTo(-.5,0);s.lineTo(.5,0);s.lineTo(0,1);s.closePath();return new THREE.ExtrudeGeometry(s,{depth:1,bevelEnabled:false}).translate(0,0,-.5);}
function hullGeometry(){
  const shape=new THREE.Shape();shape.moveTo(0,2.5);shape.bezierCurveTo(1.2,1.9,1.4,-1.4,.65,-2.3);shape.lineTo(-.65,-2.3);shape.bezierCurveTo(-1.4,-1.4,-1.2,1.9,0,2.5);
  const g=new THREE.ExtrudeGeometry(shape,{depth:.7,bevelEnabled:true,bevelThickness:.2,bevelSize:.12,bevelSegments:1,curveSegments:8});g.rotateX(-Math.PI/2);return g;
}

export function ensureModels(view){
  if(view.modelsReady)return;view.modelsReady=true;const m=view.materials;
  Object.assign(m,{leather:standard(0x594334),pants:standard(0x535c4a),hair:standard(0x47372b),straw:standard(0xbda270),horse:standard(0x76513a),mane:standard(0x342b28),steel:standard(0xb5c0c0,{metalness:.85,roughness:.3}),slate:standard(0x47576a),brick:standard(0x967255),grain:standard(0xd7b65b),fruit:standard(0x9e4240),canvas:standard(0xd0c4a6),glow:standard(0xcd6229,{emissive:0xff6d26,emissiveIntensity:1.8}),relic:standard(0x55cdb5,{emissive:0x287b67,emissiveIntensity:.65,metalness:.55,roughness:.18})});
  m.brick.map=m.stone.map;m.brick.bumpMap=m.stone.bumpMap;m.brick.bumpScale=.1;m.snow=standard(0xe3e9e5);
  m.rock=standard(0xa3aca3);m.oreRock=standard(0x737a68);
  const capsule=new THREE.CapsuleGeometry(.5,.5,2,8);capsule.scale(1,2/3,1);
  Object.assign(view.geo,{capsule,anatomy:new THREE.SphereGeometry(1,10,7),foliageNear:new THREE.IcosahedronGeometry(1,1),foliageFar:new THREE.IcosahedronGeometry(1,0),grain3d:new THREE.OctahedronGeometry(1),limb:new THREE.CylinderGeometry(.86,1,1,7),cloth3d:closedCloth(),arch3d:archGeometry(),roof3d:gableGeometry(),hull3d:hullGeometry(),wheel3d:new THREE.TorusGeometry(.5,.09,5,16).rotateY(Math.PI/2),ring3d:new THREE.TorusGeometry(1,.075,5,20),rock3d:new THREE.DodecahedronGeometry(1,0),helmet3d:new THREE.SphereGeometry(1,10,5,0,Math.PI*2,0,Math.PI*.68),dome3d:new THREE.SphereGeometry(1,16,8,0,Math.PI*2,0,Math.PI/2)});
  // These props can share materials with baked-color Blender meshes. Supply a
  // neutral attribute so that absent colors never multiply their surfaces black.
  for(const geometry of Object.values(view.geo))if(!geometry.getAttribute('color'))geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*3).fill(1),3));
  for(const [i,roof]of view.roofMaterials.entries())roof.color.copy(view.teamMaterials[i].color).lerp(new THREE.Color(i?0x72534b:0x526479),.72);
  m.gold.color.setHex(0xbda44b);m.gold.roughness=.48;
}

function builder(view,g){
  const piece=(geo,m,x,y,z,sx=1,sy=1,sz=1)=>view.piece(g,geo,m,x,y,z,sx,sy,sz);
  const box=(m,x,y,z,w,h,d,ry=0)=>view.box(g,m,x,y,z,w,h,d,ry);
  const oval=(m,x,y,z,rx,ry,rz)=>piece(view.geo.anatomy,m,x,y,z,rx,ry,rz);
  const rod=(m,a,b,r=.06)=>{const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start),center=start.clone().add(end).multiplyScalar(.5);const mesh=piece(view.geo.limb,m,center.x,center.y,center.z,r,delta.length(),r);mesh.quaternion.setFromUnitVectors(Y,delta.normalize());return mesh;};
  const arch=(m,x,y,z,w,h,d=.3)=>piece(view.geo.arch3d,m,x,y,z,w,h,d);
  const roof=(m,x,y,z,w,h,d)=>piece(view.geo.roof3d,m,x,y,z,w,h,d);
  return{piece,box,oval,rod,arch,roof};
}
function motion(mesh,type,pivot,side=1,parent=null){mesh.userData.motion={type,pivot,side,parent};return mesh;}
function tag(group,definition){group.traverse(mesh=>{if(mesh.isMesh)mesh.userData.motion=definition;});}
function flag(view,g,team,x,y,z,size=1,mount=0){const b=builder(view,g);b.rod(view.materials.darkwood,[x,mount,z],[x,y,z],.055);const f=b.piece(view.geo.cloth3d,team,x+size*.5,y-.35*size,z,size,.65*size,1);f.userData.flag=true;}
function barrel(view,g,x,y,z,s=.6){const b=builder(view,g),m=view.materials;b.piece(view.geo.capsule,m.wood,x,y+s*.7,z,s,s*1.4,s);for(const yy of [.25,1.1]){const hoop=b.piece(view.geo.ring3d,m.iron,x,y+s*yy,z,s*.48,s*.48,s*.48);hoop.rotation.x=Math.PI/2;}}
function crate(view,g,x,y,z,s=.65){const b=builder(view,g),m=view.materials;b.box(m.wood,x,y+s*.5,z,s,s,s);for(const xx of [-.36,.36])b.box(m.darkwood,x+xx*s,y+s*.5,z+s*.51,.07*s,s*.95,.035);b.box(m.darkwood,x,y+s*.5,z+s*.525,s*1.15,.07,.035).rotation.z=.7;}
function wheel(view,g,x,y,z,r=.5,animated=true){
  const b=builder(view,g),m=view.materials,parts=[];parts.push(b.piece(view.geo.wheel3d,m.darkwood,x,y,z,.4,r*2,r*2));parts.push(b.rod(m.iron,[x-.16,y,z],[x+.16,y,z],.13));
  for(let i=0;i<6;i++){const a=i*Math.PI/3;parts.push(b.rod(m.wood,[x,y,z],[x,y+Math.sin(a)*r,z+Math.cos(a)*r],.04));}
  if(animated)for(const part of parts)motion(part,'wheel',[x,y,z]);
}

function horse(view,g,armor=false,animated=true,offset=[0,0,0],scale=1){
  const model=new THREE.Group(),b=builder(view,model),m=view.materials;
  b.oval(m.horse,0,1.15,0,.46,.43,.92);b.oval(m.horse,0,1.65,.6,.28,.62,.29).rotation.x=-.35;
  b.oval(m.horse,0,2.08,.98,.25,.27,.45);b.oval(m.mane,0,1.78,.38,.13,.55,.16).rotation.x=-.4;
  for(const side of [-1,1]){b.piece(view.geo.cone,m.horse,side*.16,2.37,.84,.07,.24,.10);b.oval(m.hair,side*.235,2.17,1.06,.034,.04,.037);}
  b.rod(m.mane,[0,1.3,-.85],[0,.62,-1.12],.10);b.box(m.leather,0,1.53,-.05,.9,.16,.72);
  if(armor){b.oval(m.steel,0,1.41,.6,.45,.21,.45);b.box(m.steel,0,2.15,1.2,.12,.32,.12);}
  for(const x of [-.3,.3])for(const z of [-.58,.59]){
    const pivot=[x,1.18,z],side=Math.sign(x)*(z>0?1:-1);
    const upper=b.rod(m.horse,pivot,[x,.66,z+.04],.115),lower=b.rod(m.horse,[x,.66,z+.04],[x,.20,z-.02],.075),hoof=b.box(m.mane,x,.15,z-.015,.19,.2,.24);
    if(animated){motion(upper,'horseleg',pivot,side);motion(lower,'horseleg',pivot,side);motion(hoof,'horseleg',pivot,side);}
  }
  model.position.set(...offset);model.scale.setScalar(scale);g.add(model);return model;
}

function human(view,e){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);root.userData.body=body;
  const b=builder(view,body),m=view.materials,team=view.teamMaterials[e.owner],type=UNITS[e.type].model||e.type;
  const riding=['knight','scout'].includes(type),offset=riding?.85:0,armored=['swordsman','knight','king'].includes(type);
  if(riding)horse(view,body,type==='knight');
  b.piece(view.geo.capsule,armored?m.steel:team,0,1.35+offset,0,.66,.73,.44);
  b.oval(m.pants,0,.99+offset,0,.27,.2,.22);b.box(m.leather,0,1.08+offset,0,.62,.09,.47);b.box(m.gold,0,1.08+offset,.245,.12,.1,.04);
  b.rod(m.skin,[0,1.68+offset,0],[0,1.83+offset,0],.12);b.oval(m.skin,0,2+offset,0,.23,.28,.215);
  b.oval(m.skin,0,1.99+offset,.218,.07,.085,.08);
  for(const side of [-1,1])b.oval(m.hair,side*.08,2.075+offset,.196,.024,.025,.025);
  if(type==='villager'){
    const brim=b.piece(view.geo.cylinder,m.straw,0,2.22,0,.37,.055,.35);brim.scale.y=.055;
    b.piece(view.geo.cone,m.straw,0,2.35,0,.26,.23,.25);b.box(m.canvas,0,1.25,.249,.42,.53,.05);
    for(const side of [-1,1])b.rod(m.leather,[side*.19,1.63,-.19],[side*.19,1.02,-.24],.025);
  }else if(type==='monk'){
    b.piece(view.geo.cone,m.canvas,0,.82,0,.46,1.55,.42);b.oval(m.canvas,0,2.01,-.08,.28,.32,.25);
  }else if(type==='archer'||type==='scout')b.oval(team,0,2.17+offset,-.07,.255,.21,.255);
  else{
    b.piece(view.geo.helmet3d,m.steel,0,2.075+offset,0,.255,.285,.255);
    b.box(m.steel,0,2.05+offset,.247,.075,.24,.05);
  }
  if(type==='king'){
    b.piece(view.geo.cylinder,m.gold,0,2.28,0,.26,.15,.26);
    for(let i=0;i<6;i++)b.piece(view.geo.cone,m.gold,Math.sin(i*Math.PI/3)*.23,2.45,Math.cos(i*Math.PI/3)*.23,.055,.23,.055);
    const cape=b.piece(view.geo.cloth3d,team,0,1.36,-.28,.8,1.4,1);cape.rotation.x=.18;
  }
  for(const side of [-1,1]){
    const hip=[side*.17,1.02+offset,0],knee=[side*.17,.63+offset,.025];
    const parent={type:'leg',pivot:hip,side};
    motion(b.rod(m.pants,hip,knee,.13),'leg',hip,side);
    motion(b.rod(m.pants,knee,[side*.17,.22+offset,0],.095),'knee',knee,side,parent);
    motion(b.piece(view.geo.capsule,m.leather,side*.17,.145+offset,.10,.21,.24,.37),'knee',knee,side,parent);
    const shoulder=[side*.39,1.63+offset,0],elbow=[side*.50,1.28+offset,.07],hand=[side*.56,1.04+offset,.20];
    const arm={type:'arm',pivot:shoulder,side};
    motion(b.rod(armored?m.steel:team,shoulder,elbow,.13),'arm',shoulder,side);
    motion(b.rod(armored?m.leather:team,elbow,hand,.10),'forearm',elbow,side,arm);
    motion(b.oval(m.skin,...hand,.105,.12,.10),'forearm',elbow,side,arm);
    if(armored)motion(b.oval(m.steel,side*.38,1.65+offset,0,.19,.13,.23),'arm',shoulder,side);
  }
  const tool=new THREE.Group(),t=builder(view,tool),y=offset;
  if(['spearman','knight','scout'].includes(type)){
    t.rod(m.wood,[.56,.7+y,.2],[.56,3.6+y,.2],.035);t.piece(view.geo.cone,m.steel,.56,3.75+y,.2,.12,.42,.07);
    t.box(team,.58,3.35+y,.21,.08,.23,.025);
  }else if(type==='archer'){
    const bow=t.piece(view.geo.ring3d,m.wood,.56,1.25,.27,.42,.68,.14);bow.rotation.y=Math.PI/2;
    t.rod(m.canvas,[.56,.63,.27],[.56,1.87,.27],.012);
    t.rod(m.wood,[.56,1.15,.27],[.56,1.15,1.2],.018);
    b.piece(view.geo.cylinder,m.leather,-.15,1.52,-.28,.14,.72,.14);
    for(let i=0;i<3;i++)b.rod(m.wood,[-.24+i*.08,1.42,-.30],[-.24+i*.08,2.0,-.30],.015);
  }else if(type==='villager'){
    t.rod(m.wood,[.56,.67,.2],[.56,1.69,.2],.035);t.box(m.steel,.68,1.67,.2,.32,.24,.10);t.box(m.steel,.83,1.65,.2,.07,.28,.11);
  }else if(type==='monk'){
    t.rod(m.wood,[.56,.16,.2],[.56,2.7,.2],.04);t.piece(view.geo.ring3d,m.gold,.56,2.65,.2,.20,.20,.20);
  }else{
    t.box(m.steel,.56,1.25+y,.64,.065,.09,.88);t.box(m.gold,.56,1.25+y,.25,.36,.07,.09);t.rod(m.leather,[.56,1.25+y,.02],[.56,1.25+y,.24],.045);
    const shield=new THREE.Group(),s=builder(view,shield);s.piece(view.geo.cylinder,team,-.63,1.27+y,.24,.38,.10,.38).rotation.z=Math.PI/2;
    s.oval(m.steel,-.72,1.27+y,.24,.10,.13,.13);const trim=s.piece(view.geo.ring3d,m.steel,-.70,1.27+y,.24,.35,.35,.35);trim.rotation.y=Math.PI/2;
    tag(shield,{type:'forearm',pivot:[-.50,1.28+y,.07],side:-1,parent:{type:'arm',pivot:[-.39,1.63+y,0],side:-1}});body.add(shield);
  }
  tag(tool,{type:'forearm',pivot:[.50,1.28+y,.07],side:1,parent:{type:'arm',pivot:[.39,1.63+y,0],side:1}});body.add(tool);
  if(e.type==='sentinel'){const cape=b.piece(view.geo.cloth3d,team,0,1.35,-.31,.77,1.3,1);cape.rotation.x=.15;b.box(m.gold,0,2.40,0,.08,.28,.3);b.box(m.steel,-.68,1.3,.23,.10,.85,.55);}
  if(e.type==='marksman'){const cape=b.piece(view.geo.cloth3d,m.canvas,0,1.40,-.30,.7,1.1,1);cape.rotation.x=.12;b.oval(m.leather,0,1.76,-.10,.3,.12,.22);tool.scale.set(1,1.18,1.15);}
  if(e.type==='outrider'){b.piece(view.geo.cloth3d,team,0,2.04,-.37,.75,.85,1);b.box(m.gold,.58,4.15,.2,.08,.16,.34);}
  root.userData.model3d={kind:'unit',type:e.type,articulated:true};return root;
}

function siege(view,e){
  const g=new THREE.Group(),b=builder(view,g),m=view.materials,team=view.teamMaterials[e.owner];
  b.box(m.wood,0,.78,0,1.8,.35,2.8);for(const x of [-1,1])for(const z of [-.95,.95])wheel(view,g,x,.53,z,.48);
  if(e.type==='ram'){
    for(const x of [-.8,.8])for(const z of [-1.2,1.2])b.rod(m.darkwood,[x,.7,z],[x,1.9,z],.075);
    b.roof(view.roofMaterials[e.owner],0,1.85,0,2.2,1,3.2);
    const log=new THREE.Group(),l=builder(view,log);l.rod(m.wood,[0,1.23,-1.7],[0,1.23,2.15],.25);l.oval(m.steel,0,1.23,2.16,.28,.27,.20);
    tag(log,{type:'ram',pivot:[0,1.23,0],side:1});g.add(log);
    for(const z of [-.9,.9])b.rod(m.iron,[0,1.75,z],[0,1.24,z],.025);
  }else{
    for(const x of [-.62,.62]){b.rod(m.wood,[x,.9,-1.3],[x,2.8,0],.13);b.rod(m.wood,[x,.9,1.3],[x,2.8,0],.13);}
    b.rod(m.iron,[-.85,2.8,0],[.85,2.8,0],.1);
    const arm=new THREE.Group(),a=builder(view,arm);a.rod(m.wood,[0,2.8,1.1],[0,4.5,-2.1],.12);a.box(m.stoneDark,0,2.2,1.2,.8,.9,.7);
    a.rod(m.canvas,[0,4.5,-2.1],[0,4.1,-2.5],.03);a.oval(m.leather,0,4.07,-2.49,.25,.12,.28);
    tag(arm,{type:'siege',pivot:[0,2.8,0],side:1});g.add(arm);flag(view,g,team,.85,2.65,.7,.55);
  }
  g.userData.model3d={kind:'unit',type:e.type,articulated:true};return g;
}
function ship(view,e){
  const g=new THREE.Group(),b=builder(view,g),m=view.materials,team=view.teamMaterials[e.owner],heavy=e.type==='warship',scale=heavy?1.25:1;
  b.piece(view.geo.hull3d,m.wood,0,.05,0,scale,1,scale);
  b.box(m.darkwood,0,.99,0,1.96*scale,.13,3.75*scale);
  for(const side of [-1,1])b.rod(m.darkwood,[side*1.01*scale,1.13,-1.7*scale],[side*.80*scale,1.13,1.7*scale],.075);
  for(let z=-1.6;z<=1.6;z+=.3)b.box(m.wood,0,1.07,z*scale,1.8*scale,.035,.045);
  if(e.type==='fishingboat'){
    b.box(m.wood,0,1.45,.5,1.2,.7,1.2);b.roof(view.roofMaterials[e.owner],0,1.78,.5,1.5,.6,1.5);barrel(view,g,-.5,1.1,-.7,.4);
    b.rod(m.wood,[.9,1.2,-.5],[1.55,1.8,-1.4],.045);
    for(let i=0;i<5;i++)b.rod(m.canvas,[1.05,1.18,-.5+i*.14],[1.4,.25,-.65+i*.14],.01);
  }else{
    b.rod(m.darkwood,[0,1.1,0],[0,6,0],.075);b.rod(m.wood,[-1.45*scale,4.75,0],[1.45*scale,4.75,0],.055);
    const sail=b.piece(view.geo.cloth3d,m.canvas,0,3.5,.02,2.9*scale,2.35,1);motion(sail,'sail',[0,4.75,0]);
    const emblem=b.piece(view.geo.cloth3d,team,0,3.5,.10,.28,1.55,1);motion(emblem,'sail',[0,4.75,0]);
    for(const side of [-1,1])b.rod(m.canvas,[0,5.5,0],[side*.8,1.1,-1.5],.012);
    flag(view,g,team,0,6.1,0,.65);
    if(e.type==='galley')for(const side of [-1,1])for(let z=-1;z<=1;z+=.55){const oar=b.rod(m.wood,[side*.9,1.05,z],[side*2.2,.3,z+.5],.04);motion(oar,'oar',[side*.9,1.05,z],side);}
    if(heavy){for(const side of [-1,1])for(const z of [-1.1,1.1]){b.rod(m.steel,[side*.75,1.28,z],[side*1.7,1.3,z],.12);b.box(m.darkwood,side*.65,1.15,z,.4,.3,.55);}b.box(m.wood,0,1.45,-1.7,1.5,.65,.7);}
    if(e.type==='transport')for(const x of [-.45,.45])for(const z of [-1.3,1])crate(view,g,x,1.1,z,.52);
  }
  g.userData.model3d={kind:'unit',type:e.type,articulated:true};return g;
}
function supplyCart(view,e){const g=new THREE.Group(),b=builder(view,g),m=view.materials;b.box(m.darkwood,0,.75,0,1.8,.2,2.7);
  for(const x of [-1,1])for(const z of [-.9,.9])wheel(view,g,x,.5,z,.46);
  for(const x of [-.84,.84])b.box(m.wood,x,1.05,0,.1,.6,2.8);
  for(const x of [-.4,.4])for(const z of [-.7,.6])crate(view,g,x,.89,z,.66);barrel(view,g,0,1.5,0,.45);
  b.rod(m.darkwood,[-.5,.65,1.2],[-.5,.3,2.5],.06);b.rod(m.darkwood,[.5,.65,1.2],[.5,.3,2.5],.06);flag(view,g,view.teamMaterials[e.owner],.85,2.8,-1,.65);
  g.userData.model3d={kind:'unit',type:'cart',articulated:true};return g;}
export function unitModel(view,e){ensureModels(view);return authoredUnit(view,e)||(e.type==='cart'?supplyCart(view,e):UNITS[e.type].naval?ship(view,e):['ram','catapult'].includes(e.type)?siege(view,e):human(view,e));}

function cottage(view,g,owner,x,z,w=4,d=3.5,h=3.2){
  const b=builder(view,g),m=view.materials,roof=view.roofMaterials[owner],faction=view.sim?.players[owner].faction||'alder';
  b.box(m.stoneDark,x,.18,z,w+.25,.65,d+.25);b.box(m.plaster,x,h*.5+.38,z,w,h,d);
  b.box(m.stone,x,.62,z,w+.08,.32,d+.08);
  if(faction==='sun'){
    b.box(m.stone,x,h+.45,z,w+.55,.25,d+.55);b.piece(view.geo.dome3d,roof,x,h+.58,z,w*.45,w*.4,d*.45);
    for(const side of [-1,1])for(const zz of [-1,1])b.box(m.stone,x+side*w*.44,h+.73,z+zz*d*.42,.35,.45,.35);
  }else{
    const rise=faction==='raven'?h*.8:h*.65,peak=h+.36+rise;
    b.roof(roof,x,h+.36,z,w+.7,rise,d+.7);
    b.rod(m.darkwood,[x-(w+.7)/2,h+.35,z+(d+.7)/2],[x,peak,z+(d+.7)/2],.075);
    b.rod(m.darkwood,[x+(w+.7)/2,h+.35,z+(d+.7)/2],[x,peak,z+(d+.7)/2],.075);
    b.box(m.darkwood,x,peak+.02,z,.15,.15,d+.9);
    const front=z+(d+.7)/2+.035;
    b.arch(m.darkwood,x,h+.36,front,.96,.88,.15);b.box(m.glass,x,h+.78,front+.08,.57,.65,.045);
    b.box(m.wood,x,h+.78,front+.115,.05,.66,.04);b.box(m.wood,x,h+.78,front+.115,.59,.05,.04);
    if(faction==='raven')for(const end of [-1,1])b.rod(m.darkwood,[x,peak+.02,z+end*(d+.9)/2],[x,peak+.37,z+end*(d+1.3)/2],.095);
  }
  for(const side of [-1,1]){
    for(const zz of [-.47,0,.47])b.box(m.darkwood,x+side*w*.505,h*.5+.38,z+zz*d,.12,h+.05,.14);
    for(const yy of [.6,h+.25])b.box(m.darkwood,x+side*w*.505,yy,z,.12,.14,d+.15);
    if(faction!=='sun')for(const direction of [-1,1])b.rod(m.darkwood,[x+side*w*.515,.85,z+direction*d*.43],[x+side*w*.515,h+.18,z-direction*d*.43],.058);
    for(const zz of [-.23,.23]){
      b.box(m.wood,x+side*w*.52,h*.65,z+zz*d,.15,.88,.7);
      b.box(m.glass,x+side*w*.54,h*.65,z+zz*d,.025,.65,.5);
      b.box(m.wood,x+side*w*.555,h*.65,z+zz*d,.035,.66,.055);
    }
    b.box(m.wood,x+side*w*.29,h*.65,z+d*.515,.72,.87,.16);
    b.box(m.glass,x+side*w*.29,h*.65,z+d*.54,.51,.64,.025);
    b.box(m.wood,x+side*w*.29,h*.65,z+d*.55,.055,.65,.035);
  }
  b.box(m.darkwood,x,1.23,z+d*.512,.85,1.85,.13);b.arch(m.stone,x,.28,z+d*.55,1.15,1.8,.16);
  b.box(m.gold,x+.27,1.23,z+d*.58,.06,.07,.045);
  if(faction==='sun')for(const side of [-1,1])b.arch(m.stone,x+side*w*.31,.52,z+d*.57,.88,1.55,.18);
  b.box(m.stoneDark,x,.15,z+d*.5+.37,1.4,.26,.8);b.box(m.stone,x,.3,z+d*.5+.18,1.1,.22,.43);
  b.box(m.brick,x+w*.27,h+.4,z-d*.17,.43,1.55,.5);
}
function turret(view,g,owner,x,z,h=7,r=1.25,covered=false){
  const b=builder(view,g),m=view.materials;
  b.piece(view.geo.cylinder,m.stoneDark,x,.3,z,r*1.16,.9,r*1.16);b.piece(view.geo.cylinder,m.stone,x,h/2,z,r,h,r);
  for(const yy of [h*.18,h*.58,h-.2])b.piece(view.geo.cylinder,m.stoneDark,x,yy,z,r*1.035,.22,r*1.035);
  b.piece(view.geo.cylinder,m.stoneDark,x,h+.08,z,r*1.2,.32,r*1.2);
  for(let i=0;i<10;i++){const a=i*Math.PI/5;b.box(m.stone,x+Math.sin(a)*r*1.08,h+.58,z+Math.cos(a)*r*1.08,.42,.8,.45,a);}
  for(let i=0;i<4;i++){const a=i*Math.PI/2;b.box(m.glass,x+Math.sin(a)*(r+.025),h*.65,z+Math.cos(a)*(r+.025),.21,1.15,.055,a);}
  if(covered)b.piece(view.geo.cone,view.roofMaterials[owner],x,h+1.9,z,r*1.45,3,r*1.45);
}
function trainingTarget(view,g,team,x,z){const b=builder(view,g),m=view.materials;b.rod(m.wood,[x,0,z],[x,1.8,z],.07);for(const [radius,material]of [[.58,m.straw],[.36,team],[.14,m.straw]]){const disc=b.piece(view.geo.cylinder,material,x,1.5,z+.02*(.58-radius),radius,.08,radius);disc.rotation.x=Math.PI/2;}}

export function buildingModel(view,e){
  ensureModels(view);const authored=authoredBuilding(view,e);if(authored)return authored;
  ensureModels(view);const g=new THREE.Group(),b=builder(view,g),m=view.materials,o=e.owner,team=view.teamMaterials[o],type=e.type,age=view.sim?.players[o]?.age||0;
  if(type!=='farm'&&type!=='dock')b.box(m.stoneDark,0,-.14,0,e.r*1.9,.65,e.r*1.85);
  if(type==='house')cottage(view,g,o,0,0);
  else if(type==='towncenter'){
    cottage(view,g,o,0,-.8,4.5,4,4.5);cottage(view,g,o,-3,-1.3,2.6,3.2,2.8);cottage(view,g,o,3,-1.3,2.6,3.2,2.8);
    turret(view,g,o,0,-2.5,7.2,.82,true);
    b.box(m.wood,0,.44,2.5,6.5,.33,2.2);
    for(const x of [-2.8,2.8]){b.rod(m.darkwood,[x,.6,3.2],[x,2.6,3.2],.12);b.rod(m.darkwood,[x,2.6,3.2],[0,3.3,3.2],.09);}
    // A real covered civic arcade gives the capital a distinct silhouette.
    if(view.sim?.players[o].faction==='sun')b.box(m.stone,0,3.26,2.9,7.3,.30,3.2);else b.roof(view.roofMaterials[o],0,3.12,2.9,7.2,1.25,3.1);
    for(const x of [-3,-1,1,3])b.rod(m.darkwood,[x,.45,4.02],[x,3.10,4.02],.13);
    for(const x of [-2,0,2])b.arch(age>=1?m.stone:m.wood,x,.46,4.04,1.74,2.10,.24);
    for(let step=0;step<3;step++)b.box(m.stoneDark,0,.08+step*.12,4.62-step*.28,6.7-step*.25,.18,.55);
    flag(view,g,team,0,8.8,1.6,1.2);crate(view,g,-2.4,.62,2.5);barrel(view,g,2.2,.62,2.5,.55);
    if(age>=1){for(const x of [-3.5,3.5])b.arch(m.stone,x,.3,3.4,1.3,2.3,.28);b.box(m.stoneDark,0,.12,4,7,.3,1.2);}
    if(age>=2){for(const x of [-5,5])turret(view,g,o,x,-2.8,5.5,.72,true);b.box(m.stoneDark,0,.18,-4.8,11,.6,1);}
    if(age>=3){for(const x of [-2.2,2.2]){b.rod(m.gold,[x,3.7,3.3],[x,5.5,3.3],.055);const banner=b.piece(view.geo.cloth3d,team,x,4.9,3.35,.65,1.25,1);banner.userData.flag=true;}b.piece(view.geo.dome3d,m.gold,0,7.9,-2.5,.65,.8,.65);}
  }else if(type==='mill'){
    cottage(view,g,o,0,-.4,3.6,3.8,5.1);
    const blades=new THREE.Group(),a=builder(view,blades);
    for(let i=0;i<4;i++){const arm=new THREE.Group(),r=builder(view,arm);r.rod(m.wood,[0,0,0],[0,3.1,0],.095);for(let k=0;k<5;k++)r.box(m.canvas,.28,1.35+k*.33,.02,.8,.2,.07);arm.rotation.z=i*Math.PI/2;blades.add(arm);}
    // Keep the whole swept blade volume forward of the gable and roof trim.
    // The catalogue pipeline authors its mounts in Blender after refinement.
    if(!view.exportingOriginalCatalogue){
      b.box(m.wood,0,5.7,1.98,.65,.65,.36).userData.windmillMount=true;
      b.rod(m.darkwood,[0,5.7,1.45],[0,5.7,2.75],.16).userData.windmillMount=true;
      const hub=b.piece(view.geo.cylinder,m.iron,0,5.7,2.75,.27,.18,.27);hub.rotation.x=Math.PI/2;hub.userData.windmillMount=true;
    }
    const merged=view.mergeModel(blades);merged.userData.windmill=true;merged.position.set(0,5.7,2.65);g.add(merged);barrel(view,g,2.2,0,1,.65);
  }else if(type==='camp'){
    for(const x of [-1.6,1.6])for(const z of [-1.2,1.2])b.rod(m.wood,[x,0,z],[x,2.3,z],.09);
    b.roof(view.roofMaterials[o],0,2.3,0,4,1.3,3.5);b.box(m.wood,0,.8,1.5,2.8,.16,1);
    for(let i=0;i<5;i++)b.rod(m.trunk,[-1.5+i*.45,.43,-1.4],[-1.5+i*.45,.43,1],.18);
    b.piece(view.geo.cylinder,m.wood,1.3,.5,1.4,.45,1,.45);b.rod(m.wood,[1.3,.9,1.4],[1.3,1.8,1.4],.035);b.box(m.steel,1.5,1.75,1.4,.35,.25,.12);
  }else if(type==='mine'){
    b.arch(m.wood,0,0,-.3,3.3,2.6,.5);b.box(m.darkwood,0,1,-.66,2.25,2,.07);
    for(const side of [-1,1])b.rod(m.wood,[side*1.9,0,.4],[0,3,.4],.12);
    b.box(m.wood,0,.7,1.8,1.7,.7,1.1);for(const x of [-1,1])wheel(view,g,x,.35,1.8,.35,false);
    for(let i=0;i<5;i++)b.piece(view.geo.rock3d,m.stone,-.7+i*.33,1.1,1.75,.25,.27,.29);barrel(view,g,-1.7,0,1,.6);
  }else if(type==='barracks'){
    cottage(view,g,o,0,-.8,6.2,3.8,3.4);flag(view,g,team,2.8,5.4,1.7,1);
    for(const x of [-2.5,2.5]){b.rod(m.wood,[x,0,2.5],[x,2.1,2.5],.08);b.rod(m.wood,[x-.7,1.8,2.5],[x+.7,1.8,2.5],.06);for(let i=0;i<3;i++){b.rod(m.wood,[x-.5+i*.5,.3,2.55],[x-.5+i*.5,2.6,2.55],.025);b.piece(view.geo.cone,m.steel,x-.5+i*.5,2.67,2.55,.07,.2,.04);}}
  }else if(type==='range'){
    cottage(view,g,o,0,-1.4,5.4,2.6,2.7);for(const x of [-2,0,2])trainingTarget(view,g,team,x,2.4);crate(view,g,2.7,0,-.6,.8);
  }else if(type==='stable'){
    cottage(view,g,o,0,-1.4,5.8,3.1,3.1);
    for(const x of [-2.4,0,2.4]){b.rod(m.wood,[x,0,2],[x,1.45,2],.09);b.rod(m.wood,[x,.55,.4],[x,.55,2.5],.06);b.rod(m.wood,[x,1.1,.4],[x,1.1,2.5],.06);}
    horse(view,g,false,false,[-1.2,0,1.2],.7);horse(view,g,false,false,[1.2,0,1.2],.7);b.box(m.wood,0,.4,2.7,3.8,.65,.8);
  }else if(type==='workshop'){
    cottage(view,g,o,0,-.8,6.8,4.5,3.5);b.arch(m.stoneDark,0,.1,1.7,3.1,2.8,.35);
    for(const x of [-2,2])wheel(view,g,x,.56,2.7,.56,false);b.box(m.wood,0,.83,2.7,3.5,.25,1.4);
    b.rod(m.wood,[0,1,2.7],[0,3.5,2.7],.1);b.rod(m.wood,[0,3.5,2.7],[0,3.9,4.0],.07);crate(view,g,-2.7,0,1.8,.85);
  }else if(type==='blacksmith'){
    cottage(view,g,o,-.6,-.6,3.7,3.3,2.8);b.arch(m.brick,1.2,0,1.5,2.1,1.75,1.2);b.box(m.glow,1.2,.5,1.6,1.0,.5,.6);b.box(m.brick,1.2,2.9,1.3,.9,2.9,.85);
    b.box(m.steel,-1,.65,2.2,1,.28,.65);b.box(m.steel,-1,.36,2.2,.35,.55,.4);b.rod(m.wood,[-1,.95,2.2],[-.4,1.4,2.2],.04);b.box(m.steel,-.36,1.4,2.2,.35,.23,.2);
  }else if(type==='market'){
    cottage(view,g,o,0,-1.3,4.4,3,2.8);
    for(const x of [-2,0,2]){b.box(m.wood,x,.78,2.2,1.7,1.25,.8);for(const xx of [-.8,.8])b.rod(m.wood,[x+xx,0,2.1],[x+xx,2.3,2.1],.055);const awning=b.piece(view.geo.cloth3d,x?m.canvas:team,x,2.3,2.4,1.85,1.5,1);awning.rotation.x=-Math.PI/2;for(let k=0;k<3;k++)b.oval(x<0?m.fruit:m.grain,x-.5+k*.5,1.5,2.2,.15,.14,.14);}
    barrel(view,g,2.7,0,.1,.55);crate(view,g,-2.8,0,.1,.7);
  }else if(type==='tower'){
    turret(view,g,o,0,0,7,1.25,true);flag(view,g,team,0,10,0,.8);
  }else if(type==='keep'){
    b.box(m.stone,0,3.2,0,6.2,6.7,5.7);for(const x of [-3,3])for(const z of [-2.8,2.8])turret(view,g,o,x,z,7.6,1.2);
    b.roof(view.roofMaterials[o],0,6.7,0,6.7,3.1,6.1);b.arch(m.stoneDark,0,0,2.91,2.4,3.3,.5);b.box(m.darkwood,0,1.4,3.09,1.5,2.6,.15);
    for(const side of [-1,1])for(const yy of [2.7,4.7])b.arch(m.stoneDark,side*1.8,yy,2.92,.72,1.1,.22);
    flag(view,g,team,0,11,0,1.3);
  }else if(type==='wall'){
    b.box(m.stone,0,1.67,0,2.85,3.55,1.45);for(const x of [-1,0,1])b.box(m.stone,x,3.65,0,.55,.85,1.5);
    for(const x of [-1.1,1.1])b.box(m.stoneDark,x,1.4,0,.3,3,1.75);b.box(m.stoneDark,0,.3,0,3,.8,2.1);
  }else if(type==='gate'){
    turret(view,g,o,-2,0,4.2,.76);turret(view,g,o,2,0,4.2,.76);b.arch(m.stone,0,0,0,4,3.7,1.2);b.box(m.stoneDark,0,3.65,0,4.3,.45,1.35);
    const gate=new THREE.Group(),p=builder(view,gate);for(let x=-1.15;x<=1.15;x+=.28)p.rod(m.iron,[x,.15,.05],[x,2.7,.05],.035);for(const yy of [.65,1.45,2.3])p.rod(m.iron,[-1.25,yy,.05],[1.25,yy,.05],.045);
    view.mergeModel(gate);gate.userData.gate=true;g.userData.portcullis=gate;g.add(gate);flag(view,g,team,0,5.2,0,.75,3.65);
  }else if(type==='monastery'){
    cottage(view,g,o,0,-.4,4.2,5.4,4.1);turret(view,g,o,-2.1,-1.8,7.3,.75,true);turret(view,g,o,2.1,-1.8,7.3,.75,true);
    b.arch(m.stoneDark,0,.1,2.4,2.1,3,.4);for(const x of [-1.55,1.55])b.arch(m.stoneDark,x,2.2,2.4,.75,1.5,.25);
    b.rod(m.gold,[0,6.7,0],[0,8.1,0],.055);b.rod(m.gold,[-.42,7.65,0],[.42,7.65,0],.055);
  }else if(type==='wonder'){
    for(let i=0;i<3;i++)b.box(m.stone,0,.05+i*.25,0,10-i*1.2,.5,10-i*1.2);
    b.box(m.plaster,0,2.8,0,5.5,4.6,5.5);
    for(const x of [-3.1,3.1])for(const z of [-3.1,0,3.1]){b.piece(view.geo.cylinder,m.stone,x,3.6,z,.32,5.8,.32);b.piece(view.geo.cylinder,m.stoneDark,x,.9,z,.46,.28,.46);}
    b.box(m.stone,0,6.35,0,7.2,.5,7.2);b.piece(view.geo.cylinder,m.stone,0,7,0,2.3,1.1,2.3);b.piece(view.geo.dome3d,m.gold,0,7.55,0,2.4,2.8,2.4);
    for(const x of [-2.2,0,2.2])b.arch(m.stoneDark,x,1.0,2.81,1.1,3.2,.24);flag(view,g,team,0,12,0,1.2);
  }else if(type==='dock'){
    b.box(m.wood,0,.2,0,5.9,.45,5.6);cottage(view,g,o,0,-1,3.4,2.8,2.5);
    let angle=0;for(let i=0;i<16;i++)if(view.sim.isWater(e.x+Math.cos(i*Math.PI/8)*9,e.z+Math.sin(i*Math.PI/8)*9)){angle=i*Math.PI/8;break;}
    const pier=new THREE.Group(),p=builder(view,pier);p.box(m.wood,4.3,.22,0,9,.25,2);
    for(let x=1;x<=8;x+=1){p.box(m.darkwood,x,.365,0,.055,.035,2);for(const side of [-1,1])p.rod(m.darkwood,[x,-2,side*.8],[x,.8,side*.8],.11);}
    pier.userData.dockPier=true;pier.rotation.y=-angle;g.add(pier);barrel(view,g,-2,0,1,.6);crate(view,g,1.8,0,1.6,.75);flag(view,g,team,2.1,5,0,.8);
  }else if(type==='farm'){
    b.box(m.soil,0,.10,0,5.7,.25,5.7);
    for(let x=-2.3;x<=2.3;x+=.85){b.box(m.furrow,x,.22,0,.15,.1,5.2);for(let z=-2.2;z<=2.2;z+=.65){b.rod(m.grain,[x,.22,z],[x,.88,z],.018);for(const side of [-1,1])for(let k=0;k<3;k++)b.piece(view.geo.grain3d,m.grain,x+side*.045,.74+k*.065,z,.05,.075,.035);}}
    for(const side of [-1,1]){for(let x=-2.9;x<=2.9;x+=1.45)b.rod(m.wood,[x,0,side*2.9],[x,.85,side*2.9],.045);b.rod(m.wood,[-2.9,.55,side*2.9],[2.9,.55,side*2.9],.04);}
  }else throw new Error('Missing 3D building model: '+type);
  g.userData.model3d={kind:'building',type,volumetric:true,architectureAge:age,artRevision:'civic-arcades'};return g;
}

export function resourceModel(view,e){
  ensureModels(view);const authored=authoredResource(view,e);if(authored)return authored;
  ensureModels(view);const g=new THREE.Group(),b=builder(view,g),m=view.materials,rng=seededRandom(e.id*211+view.sim.options.seed);
  if(e.kind==='shrine'){
    for(let i=0;i<3;i++)b.piece(view.geo.cylinder,m.stoneDark,0,.12+i*.15,0,2.6-i*.35,.25,2.6-i*.35);
    for(const x of [-1.7,1.7])for(const z of [-1.7,1.7]){b.piece(view.geo.cylinder,m.stone,x,2,z,.23,3.7,.23);b.piece(view.geo.cylinder,m.stoneDark,x,3.7,z,.36,.25,.36);}
    b.roof(m.stone,0,3.8,0,4.5,1.8,4.4);b.piece(view.geo.rock3d,m.relic,0,2.25,0,.45,.75,.45);b.piece(view.geo.ring3d,m.gold,0,2.3,0,.9,.9,.9);
  }else if(e.water){
    for(let i=0;i<5;i++){const x=Math.sin(i*2.3)*1.4,z=Math.cos(i*2.3)*1.4;b.oval(m.steel,x,-.12,z,.11,.08,.35);const tail=b.piece(view.geo.cone,m.slate,x,-.12,z-.37,.14,.22,.035);tail.rotation.x=Math.PI/2;}
  }else if(e.type==='food'){
    for(let i=0;i<5;i++){const x=Math.sin(i*2.3)*.7,z=Math.cos(i*2.3)*.7;b.rod(m.trunk,[x,0,z],[x,.6,z],.07);b.oval(m.leaf,x,.65,z,.68,.62,.63);for(let k=0;k<4;k++)b.oval(m.fruit,x+(rng()-.5)*.7,.9+rng()*.3,z+(rng()-.5)*.6,.075,.08,.08);}
  }else{
    for(let i=0;i<7;i++){const x=(rng()-.5)*2.7,z=(rng()-.5)*2.6,s=.5+rng()*.8,rock=b.piece(view.geo.rock3d,e.type==='gold'?m.stoneDark:m.stone,x,s*.52,z,s,s*.92,s*.83);rock.rotation.set(rng()*.4,rng()*6,rng()*.3);
      if(e.type==='gold')for(let k=0;k<3;k++){const nugget=b.piece(view.geo.rock3d,m.gold,x+(rng()-.5)*s,s*.9+rng()*.2,z+(rng()-.5)*s,.16,.12,.1);nugget.rotation.y=rng()*6;}
    }
    for(let i=0;i<9;i++)b.piece(view.geo.rock3d,m.stoneDark,(rng()-.5)*3.4,.13,(rng()-.5)*3.4,.16,.16,.2);
  }
  g.userData.model3d={kind:e.kind,type:e.water?'fish':e.type,volumetric:true};return g;
}

export function treeModel(view,map,variant=0,far=false){
  ensureModels(view);const authored=authoredTree(view,map,variant,far);if(authored)return authored;
  ensureModels(view);const g=new THREE.Group(),b=builder(view,g),m=view.materials,rng=seededRandom(variant+128),pine=map==='winter',desert=map==='desert';
  b.rod(m.trunk,[0,0,0],[.07,4.5,0],.22);
  if(!far){for(let i=0;i<4;i++){const angle=i*Math.PI/2+variant;b.rod(m.trunk,[0,.4,0],[Math.sin(angle)*.75,.04,Math.cos(angle)*.75],.12);}b.rod(m.trunk,[.02,2.2,0],[.45,4.8,.15],.12);}
  for(let i=0;i<(far?3:pine?4:6);i++){
    const a=i*2.4+variant,level=2.5+i*.48,x=Math.sin(a)*(1+i*.08),z=Math.cos(a)*(1+i*.08);
    b.rod(m.trunk,[0,level-.7,0],[x,level+.15,z],.075);
    if(pine){const radius=2.1-i*.35,leaves=b.piece(view.geo.cone,m.leafDark,0,2.9+i*.75,0,radius,2.6,radius);leaves.rotation.y=rng()*6;b.piece(view.geo.cone,m.snow,0,3.24+i*.75,0,radius*.79,2.02,radius*.79);}
    else b.piece(far?view.geo.foliageFar:view.geo.foliageNear,i%2?m.leafDark:m.leaf,x*.55,level+.6,z*.55,1.25+rng()*.3,desert?.8:1.1+rng()*.3,1.3+rng()*.3);
  }
  g.userData.model3d={kind:'resource',type:'wood',volumetric:true};return g;
}
