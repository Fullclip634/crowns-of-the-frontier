import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Landscape} from '../src/landscape.js';
import {prepareTerrainGeometry,terrainWeights,roadDistance,terrainRoadPaths,paintSettlementPaving} from '../src/terrain-layout.js';
import {GroundCover} from '../src/ground-cover.js';
import {TerrainDetails,pebbleGeometry} from '../src/terrain-details.js';
import {terrainRelief} from '../src/terrain-relief.js';
import {Simulation} from '../src/simulation.js';
import {bridgeSpans} from '../src/bridge-layout.js';

test('playable land has broad rolling elevation at Epic size while capitals retain level construction ground',()=>{
  for(const map of ['highlands','winter','desert','canyon','valley','rivers','coast']){
    const land=new Landscape(512,map,560,[{x:-140,z:140},{x:140,z:-140}]),heights=[];
    for(let z=-240;z<=240;z+=6)for(let x=-240;x<=240;x+=6){const h=terrainRelief(map,x,z,land.phase);assert.ok(Number.isFinite(h));assert.ok(Math.abs(terrainRelief(map,x+.1,z,land.phase)-h)/.1<.5);assert.ok(Math.abs(terrainRelief(map,x,z+.1,land.phase)-h)/.1<.5);heights.push(h);}
    assert.ok(Math.max(...heights)-Math.min(...heights)>(map==='desert'?4.5:6));for(const base of land.settlements)assert.equal(land.heightAt(base.x,base.z),.65);
  }
});

test('open midfield keeps visible rolling landforms on every map while start pads stay level',()=>{
  for(const map of ['highlands','winter','desert','canyon','valley','rivers','coast']){
    const starts=[{x:-81.6,z:81.6},{x:81.6,z:-81.6}],land=new Landscape(512,map,240,starts);let minimum=Infinity,maximum=-Infinity,samples=0;
    for(let z=-48;z<=48;z+=4)for(let x=-48;x<=48;x+=4){
      if(land.channels().some(channel=>Math.abs(x-channel.center-Math.sin(z*channel.frequency)*channel.bend)<channel.width+6))continue;
      const height=land.heightAt(x,z);assert.ok(Number.isFinite(height));minimum=Math.min(minimum,height);maximum=Math.max(maximum,height);samples++;
    }
    assert.ok(samples>300,map+' retains a useful open midfield sample');
    assert.ok(maximum-minimum>5,map+' gives the battlefield visible elevation variation instead of a flat plain');
    for(const start of starts)assert.equal(land.heightAt(start.x,start.z),.65,map+' keeps its town-center clearing level');
  }
});

test('terrain material transitions preserve roads and form normalized finite weights over all biomes',()=>{
  for(const map of ['highlands','winter','desert','canyon','valley','rivers','coast']){
    const land=new Landscape(512,map,400),geometry=land.geometry(800,112),prepared=prepareTerrainGeometry(geometry,land);
    assert.equal(prepared.weights.length,geometry.attributes.position.count*3);assert.ok(prepared.diagnostics.heightRange.max-prepared.diagnostics.heightRange.min>15);
    for(let i=0;i<prepared.weights.length;i+=3){const values=prepared.weights.slice(i,i+3);assert.ok(values.every(value=>Number.isFinite(value)&&value>=0&&value<=1));assert.ok(Math.abs(values[0]+values[1]+values[2]-1)<1e-6);}
    const town=land.settlements[0],path=terrainRoadPaths(land)[0],point=path.points[Math.floor(path.points.length/2)];
    assert.ok(roadDistance(point.x,point.z,land)<1e-8);assert.ok(terrainWeights(land,point.x,1,point.z,1).soil>.85);
    assert.ok(terrainWeights(land,60,8,60,.65).rock>terrainWeights(land,60,1,60,1).rock);
    assert.equal(land.heightAt(town.x,town.z),.65,'settlement construction keeps a flat starting area');geometry.dispose();
  }
});

test('seeded roads meander naturally while keeping their drawn and painted paths aligned',()=>{
  for(const map of ['highlands','canyon','coast','rivers','valley','winter','desert'])for(const seed of [512,2026]){
    const land=new Landscape(seed,map,560,[{x:-140,z:140},{x:140,z:-140}]),paths=terrainRoadPaths(land);
    assert.equal(paths.length,2);assert.strictEqual(terrainRoadPaths(land),paths,'material, dirt and vegetation reuse the same seeded paths');
    for(const path of paths){
      const direct=Math.hypot(path.end.x-path.start.x,path.end.z-path.start.z),length=path.segments.reduce((sum,s)=>sum+Math.sqrt(s.length),0);let farthest=0;
      assert.equal(path.points.length,path.segments.length+1);assert.deepEqual(path.points[0],path.start);assert.deepEqual(path.points.at(-1),path.end);
      assert.ok(length>direct*1.002&&length<direct*1.12,'the route curves gently instead of adding artificial switchbacks');
      for(const point of path.points){
        const t=Math.max(0,Math.min(1,((point.x-path.start.x)*(path.end.x-path.start.x)+(point.z-path.start.z)*(path.end.z-path.start.z))/(direct*direct)));
        farthest=Math.max(farthest,Math.hypot(point.x-path.start.x-t*(path.end.x-path.start.x),point.z-path.start.z-t*(path.end.z-path.start.z)));
        assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.z));assert.ok(roadDistance(point.x,point.z,land)<1e-8);assert.ok(terrainWeights(land,point.x,.65,point.z,1).soil>.85);
      }
      assert.ok(farthest>1.5&&farthest<12,'meanders stay broad and modest across map sizes');
      assert.ok(path.segments.every(s=>s.length>0&&Number.isFinite(s.length)));
    }
  }
  const first=new Landscape(512,'highlands',560),differentSeed=new Landscape(91,'highlands',560);
  assert.notDeepEqual(terrainRoadPaths(first)[0].points,terrainRoadPaths(differentSeed)[0].points,'world seed varies the scenery without using simulation randomness');
});

test('starting lanes connect real buildings and approach bridges on dry ground after a save',()=>{
  const sim=new Simulation({mode:'custom',map:'archipelago',mapSize:'epic',startAge:2,seed:512});
  const restored=Simulation.restore(sim.serialize());
  assert.deepEqual(restored.startingSites,sim.startingSites);
  const land=new Landscape(512,'archipelago',sim.worldSize,sim.spawnPositions,sim.startingSites);
  const roads=terrainRoadPaths(land),spans=bridgeSpans('archipelago');
  for(const site of sim.startingSites.filter(site=>site.type!=='towncenter')){
    assert.ok(roads.some(road=>road.local&&road.end.x===site.x&&road.end.z===site.z),site.type+' connects to its settlement');
  }
  const bridges=roads.filter(road=>!road.local);
  assert.ok(bridges.length>=2);
  for(const {end} of bridges){
    assert.equal(end.z,0);
    assert.ok(spans.some(span=>Math.abs(end.x-span.center)===span.halfLength+1.5));
  }
  for(const {segments} of roads)for(const {x,z,dx,dz} of segments){
    assert.equal(sim.isWater(x+dx*.5,z+dz*.5),false);
    for(const offset of [-4,-2,0,2,4]){
      const a=x+offset,b=z+offset,distance=roadDistance(a,b,land);
      assert.equal(roadDistance(a,b,land,4),distance<=4?distance:Infinity);
    }
  }
});

test('settlement paving leaves exposed ground at the perimeter and shares its stone shapes with the material mask',()=>{
  const land={map:'highlands',seed:512,startingSites:[{type:'towncenter',x:-39,z:30,r:5}]};
  function capture(mask){
    const stones=[],ground=[];
    const ctx={
      createRadialGradient(...bounds){const stops=[];ground.push({bounds,stops});return {addColorStop:(at,color)=>stops.push([at,color])};},
      fillRect(){},
      beginPath(){this.points=[];},
      moveTo(x,y){this.points.push([x,y]);},
      lineTo(x,y){this.points.push([x,y]);},
      fill(){stones.push({points:this.points,color:this.fillStyle.match(/\d+(?:\.\d+)?/g).map(Number)});},
    };
    paintSettlementPaving(ctx,land,80,4,mask);
    return {stones,ground};
  }
  const painted=capture(false),mask=capture(true),{stones}=painted;
  assert.deepEqual(capture(false),painted);
  assert.equal(painted.ground.length,1);
  assert.deepEqual(painted.ground[0].bounds,mask.ground[0].bounds);
  assert.match(painted.ground[0].stops.at(-1)[1],/,0\)$/,'the soil fades completely at the outer edge');
  assert.ok(mask.ground[0].stops.every(([,color])=>color.startsWith('rgba(196,0,0,')),'soil stays within the road range of the mask');
  assert.ok(stones.length>60);
  assert.deepEqual(mask.stones.map(tile=>tile.points),stones.map(tile=>tile.points));
  assert.ok(stones.every(({color,points})=>Math.max(...color.slice(0,3))<104&&points.length===8));
  assert.ok(new Set(stones.map(({color})=>color[0])).size>12,'stone faces have distinct tones');
  assert.ok(stones.some(({color})=>color[3]<.8),'outer stones fade into the ground');
  assert.equal(stones.some(({points})=>points.some(([x,z])=>x<=(80-39-5.8)*4&&z<=(80+30-5.8)*4)),false,'the corner leaves natural ground exposed');
});

test('solid terrain pebbles are bounded, seeded, hidden by fog and cleared beneath live foundations',()=>{
  const geometry=pebbleGeometry(),edges=new Map(),p=geometry.attributes.position;
  const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(value=>value.toFixed(5)).join(':');
  for(let i=0;i<p.count;i+=3)for(let j=0;j<3;j++){const pair=[key(i+j),key(i+(j+1)%3)].sort().join('|');edges.set(pair,(edges.get(pair)||0)+1);}
  assert.ok([...edges.values()].every(count=>count===2));assert.ok(geometry.boundingBox.max.y-geometry.boundingBox.min.y>.3);assert.ok(p.array.every(Number.isFinite));geometry.dispose();
  const land=new Landscape(512,'highlands'),ground=land.geometry(320,112),view={landscape:land,terrain:new THREE.Group(),settings:{quality:'low',fog:true},sim:{entities:[],isExplored:()=>false},clock:0,target:new THREE.Vector3(),zoom:40,angle:0,tilt:.7};
  view.groundCover=new GroundCover(view);const details=new TerrainDetails(view),copy=new TerrainDetails({...view,terrain:new THREE.Group()});
  const textured=new TerrainDetails({...view,terrain:new THREE.Group(),materials:{rock:new THREE.MeshStandardMaterial({vertexColors:true})}});assert.equal(textured.mesh.material.vertexColors,false,'uncolored pebbles use instance colors without missing baked attributes');textured.mesh.geometry.dispose();textured.mesh.material.dispose();textured.mesh.dispose();
  assert.deepEqual(details.entries,copy.entries);assert.ok(details.entries.length>20&&details.entries.length<=120);
  details.update(false,true);assert.equal(details.mesh.count,0);view.sim.isExplored=()=>true;details.update(false,true);const before=details.mesh.count;
  const e=details.entries[0];view.sim.entities.push({kind:'building',x:e.x,z:e.z,r:15,hp:100});view.groundCover.update(false,true);details.update(false,true);assert.ok(details.mesh.count<before);
  const matrix=new THREE.Matrix4();for(let i=0;i<details.mesh.count;i++){details.mesh.getMatrixAt(i,matrix);assert.ok(Math.hypot(matrix.elements[12]-e.x,matrix.elements[14]-e.z)>=15.99);}
  assert.equal(view.terrainDetailDiagnostics.drawCalls,1);assert.ok(view.terrainDetailDiagnostics.capacity<=120);
  for(const item of [details,copy]){item.mesh.geometry.dispose();item.mesh.material.dispose();item.mesh.dispose();}view.groundCover.mesh.geometry.dispose();view.groundCover.mesh.material.dispose();view.groundCover.mesh.dispose();ground.dispose();
});
