import test from 'node:test';
import assert from 'node:assert/strict';
import {Landscape} from '../src/landscape.js';

test('water bank data follows the actual terrain in rivers and sea channels',()=>{
  for(const map of ['coast','valley','rivers']){
    const land=new Landscape(512,map);const terrain=land.geometry();
    for(const channel of land.channels()){
      const water=land.waterGeometry(channel),position=water.getAttribute('position'),depth=water.getAttribute('frontierWaterDepth'),shore=water.getAttribute('frontierWaterShore');
      assert.equal(depth.count,position.count);assert.equal(shore.count,position.count);
      for(let i=0;i<position.count;i++){
        assert.ok(Number.isFinite(depth.getX(i)));assert.ok(depth.getX(i)>=0);
        assert.ok(Math.abs(depth.getX(i)-Math.max(0,.08-land.surfaceHeightAt(position.getX(i),position.getZ(i))))<.00001);
        assert.ok(shore.getX(i)>=0&&shore.getX(i)<=channel.width);
        if(i%9===0||i%9===8)assert.equal(shore.getX(i),0,'wave displacement settles at both navigation banks');
        if(i%9===4)assert.equal(shore.getX(i),channel.width);
      }
      assert.ok(depth.array.some(value=>value>1));water.dispose();
    }
    terrain.dispose();
  }
});
