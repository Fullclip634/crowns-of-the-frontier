import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {terrainBiome} from '../src/terrain-biomes.js';
import {terrainWeights,roadDistance} from '../src/terrain-layout.js';
import {Landscape} from '../src/landscape.js';
import {GroundCover} from '../src/ground-cover.js';
import {MAPS} from '../src/data.js';

test('flat non-winter ground is predominantly grass, with green ground cover and readable paths',()=>{
  for(const map of Object.keys(MAPS).filter(map=>map!=='winter')){
    const land=new Landscape(512,map,400),style=terrainBiome(map);let checked=0;
    for(let z=-150;z<=150;z+=30)for(let x=-150;x<=150;x+=30){
      if(roadDistance(x,z,land)<4||land.channels().some(c=>Math.abs(x-c.center-Math.sin(z*c.frequency)*c.bend)<c.width+8))continue;
      const weights=terrainWeights(land,x,1,z,1);assert.ok(weights.grass>.72,map+' retains grass on open flat land');checked++;
    }
    assert.ok(checked>40);for(const color of [...style.ground,style.map]){const value=new THREE.Color(color);assert.ok(value.g>value.r&&value.g>value.b,map+' uses natural green fields');}
    const town=land.settlements[0];assert.ok(terrainWeights(land,town.x,.65,town.z,1).soil>.85,'a real dirt path remains visible');
  }
  assert.equal(terrainBiome('winter').grassTint,0xffffff);assert.equal(MAPS.desert.name,'Sunlit meadows');
});

test('meadow and rocky-frontier vegetation stays within the existing instance budgets and uses green solid grass',()=>{
  for(const map of ['desert','canyon'])for(const quality of ['low','high']){
    const land=new Landscape(512,map,240),view={landscape:land,terrain:new THREE.Group(),settings:{quality,fog:false},sim:{entities:[],isExplored:()=>true},clock:0,target:new THREE.Vector3(),zoom:40,angle:0,tilt:.7},cover=new GroundCover(view);
    assert.ok(cover.entries.length>500);assert.ok(cover.mesh.instanceMatrix.count<=(quality==='high'?4800:1800));assert.equal(view.groundCoverDiagnostics.drawCalls,1);
    for(const entry of cover.entries){const color=new THREE.Color(entry.color);assert.ok(color.g>color.r&&color.g>color.b);assert.ok(Number.isFinite(entry.y));}
    cover.mesh.geometry.dispose();cover.mesh.material.dispose();cover.mesh.dispose();
  }
});
