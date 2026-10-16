import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {sampleWaterWave,waterMotionScale,WATER_WAVE_BOUND} from '../src/water-waves.js';
import {configureWaterSurface,animateWaterSurface} from '../src/water-surface.js';
import {Landscape} from '../src/landscape.js';
import {forestTransform} from '../src/realm-3d.js';
import {weatherAt} from '../src/weather.js';

test('wave normals agree with numerical surface derivatives and settle at both navigation banks',()=>{
  const step=1e-4;
  for(const time of [0,1.7,34.2])for(const shore of [0,.4,1,14])for(const wet of [0,1])for(const [x,z]of [[-15,8],[0,17],[11,-9]]){
    const actual=sampleWaterWave(x,z,time,shore,wet),dx=(sampleWaterWave(x+step,z,time,shore,wet).height-sampleWaterWave(x-step,z,time,shore,wet).height)/(2*step),dz=(sampleWaterWave(x,z+step,time,shore,wet).height-sampleWaterWave(x,z-step,time,shore,wet).height)/(2*step),expected=new THREE.Vector3(-dx,1,-dz).normalize();
    assert.ok(expected.distanceTo(new THREE.Vector3(...actual.normal))<1e-8);assert.ok(Math.abs(Math.hypot(...actual.normal)-1)<1e-12);assert.ok(Math.abs(actual.height)<WATER_WAVE_BOUND);
    if(shore===0){assert.equal(Math.abs(actual.height),0);assert.deepEqual(actual.normal.map(value=>value||0),[0,1,0]);}
    if(wet===0&&shore>=1)assert.ok(Math.abs(actual.height-(.035*Math.sin(x*.9+z*.36+time*1.3)+.02*Math.cos(z*.65-time)))<1e-12,'calm-water displacement retains its established profile');
  }
});

test('storm-displaced water remains inside the actual mesh bounds at every bank and map size',()=>{
  for(const map of ['coast','valley','rivers'])for(const size of [160,400]){
    const land=new Landscape(512,map,size),ground=land.geometry(land.renderSize,112);
    for(const channel of land.channels()){
      const geometry=land.waterGeometry(channel),p=geometry.attributes.position,shore=geometry.attributes.frontierWaterShore,bounds=geometry.boundingBox;
      for(let i=0;i<p.count;i+=3)for(const time of [0,13.4,102.1]){const y=p.getY(i)+sampleWaterWave(p.getX(i),p.getZ(i),time,shore.getX(i),1).height;assert.ok(y>=bounds.min.y&&y<=bounds.max.y);}
      assert.ok(bounds.max.y-bounds.min.y>=WATER_WAVE_BOUND*2-1e-6);geometry.dispose();
    }ground.dispose();
  }
  assert.ok(waterMotionScale(-5)>=1&&waterMotionScale(5)<=1.45);
});

test('Balanced and High coastal meshes resolve waves with a bounded budget and unchanged navigation banks',()=>{
  for(const size of [160,480,560]){
    const land=new Landscape(512,'coast',size),ground=land.geometry(land.renderSize,160),channel=land.channels()[0],meshes=['low','medium','high'].map(quality=>land.waterGeometry(channel,quality));
    const [low,balanced,high]=meshes;assert.equal(low.attributes.position.count,(size/2+1)*9);assert.equal(balanced.attributes.position.count,(size/2+1)*21);assert.deepEqual(high.attributes.position.array,balanced.attributes.position.array);assert.ok(high.index.count/3<=11200);
    for(const geometry of meshes){const p=geometry.attributes.position,shore=geometry.attributes.frontierWaterShore,stride=p.count/(size/2+1);for(let row=0;row<=size/2;row++){const a=row*stride,b=a+stride-1,z=p.getZ(a),mid=channel.center+Math.sin(z*channel.frequency)*channel.bend;assert.ok(Math.abs(p.getX(a)-(mid-channel.width))<1e-5&&Math.abs(p.getX(b)-(mid+channel.width))<1e-5);assert.equal(shore.getX(a),0);assert.equal(shore.getX(b),0);}geometry.dispose();}ground.dispose();
  }
});

function fixture(){const material=new THREE.MeshStandardMaterial({color:0x6a9fa6,transparent:true,opacity:.85});configureWaterSurface(material);return {material,view:{materials:{water:material},settings:{quality:'medium'},clock:2,scene:{background:new THREE.Color(0xc4d9df)},sun:{intensity:2.7},hemi:{intensity:.9},waterMeshes:[{}],weatherState:weatherAt(512,'coast',97,'clear')}};}

test('the material keeps one shared uniform set and disposes the obsolete stripe map once',()=>{
  const material=new THREE.MeshStandardMaterial(),map=new THREE.CanvasTexture({width:1,height:1});let disposed=0,previous=0;map.addEventListener('dispose',()=>disposed++);material.map=map;material.onBeforeCompile=function(shader){assert.equal(this,material);previous++;shader.uniforms.existing={value:7};};
  configureWaterSurface(material);const time=material.frontierWaveTime,sky=material.frontierWaterSky;configureWaterSurface(material);const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};material.onBeforeCompile(shader);
  assert.equal(disposed,1);assert.equal(material.map,null);assert.equal(previous,1);assert.equal(shader.uniforms.existing.value,7);assert.equal(shader.uniforms.frontierWaterTime,time);assert.equal(shader.uniforms.frontierWaterSky,sky);
  const view={materials:{water:material},settings:{quality:'medium'},clock:4,scene:{background:new THREE.Color(0x334455)},waterMeshes:[{}]};animateWaterSurface(view);assert.equal(shader.uniforms.frontierWaterTime.value,4);view.clock=7;animateWaterSurface(view);assert.equal(shader.uniforms.frontierWaterTime,time);assert.equal(shader.uniforms.frontierWaterTime.value,7);assert.equal(view.waterDiagnostics.geometryUploadsPerFrame,0);material.dispose();
});

test('real storm states strengthen water motion and night light dims the shoreline foam',()=>{
  const {material,view}=fixture();animateWaterSurface(view);const calm=material.frontierWaterMotion.value,dayLight=material.frontierWaterLight.value,calmRipples=material.frontierWaterRipples.value;
  view.weatherState=weatherAt(512,'coast',97,'storm');animateWaterSurface(view);assert.ok(material.frontierWaterMotion.value>calm&&material.frontierWaterRipples.value>calmRipples);
  view.sun.intensity=.62;view.hemi.intensity=.56;view.scene.background.setHex(0x152640);animateWaterSurface(view);assert.ok(material.frontierWaterLight.value<dayLight*.4);assert.ok(material.frontierWaterSky.value.equals(view.scene.background));assert.equal(material.frontierWaterDetail.value,1);view.settings.quality='low';animateWaterSurface(view);assert.equal(material.frontierWaterDetail.value,0);assert.ok(material.frontierWaterRipples.value<calmRipples);material.dispose();
});

test('reduced decorative motion freezes the water phase without changing its geometry or settings',()=>{
  const {material,view}=fixture();view.settings.reducedMotion=true;const choice={...view.settings};animateWaterSurface(view);assert.equal(material.frontierWaveTime.value,0);assert.equal(material.frontierWaterRipples.value,0);assert.equal(material.frontierWaterDetail.value,0);view.clock=100;animateWaterSurface(view);assert.equal(material.frontierWaveTime.value,0);assert.deepEqual(view.settings,choice);assert.equal(view.waterDiagnostics.geometryUploadsPerFrame,0);material.dispose();
});

test('forest sway responds to actual weather amounts and respects reduced decorative motion',()=>{
  const base=new THREE.Matrix4(),view={clock:.3,settings:{quality:'high'},weatherState:weatherAt(512,'highlands',97,'clear')};
  const calm=forestTransform(view,base,7,true).clone();view.weatherState=weatherAt(512,'highlands',97,'storm');const storm=forestTransform(view,base,7,true).clone(),angle=matrix=>Math.abs(Math.atan2(matrix.elements[1],matrix.elements[0]));assert.ok(angle(storm)>angle(calm)*2);
  view.settings.reducedMotion=true;assert.deepEqual(forestTransform(view,base,7,true).elements,base.elements);assert.notDeepEqual(forestTransform(view,base,7,true,{at:0}).elements,base.elements,'gameplay tree-felling cues remain visible');
});
