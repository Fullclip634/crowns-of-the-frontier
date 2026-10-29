import test from 'node:test';
import assert from 'node:assert/strict';
import {updateFogTexture} from '../src/fog-texture.js';

test('fog pixels preserve visibility and exploration while unchanged snapshots avoid allocation and upload',()=>{
  let allocations=0,paints=0,uploads=0;
  const view={sim:{gridSize:2,visible:Uint8Array.from([1,0,0,0]),explored:Uint8Array.from([1,1,0,0])},fogCanvas:{width:2,height:2},fogCtx:{createImageData:(width,height)=>{allocations++;return {width,height,data:new Uint8ClampedArray(width*height*4)};},putImageData:()=>paints++},fogTexture:{set needsUpdate(value){if(value)uploads++;}}};
  assert.equal(updateFogTexture(view),true);const image=view.fogImage;
  assert.deepEqual([...image.data],[19,32,30,0,19,32,30,100,19,32,30,197,19,32,30,197]);
  for(let i=0;i<50;i++)assert.equal(updateFogTexture(view),false);
  assert.equal(view.fogImage,image);assert.deepEqual([allocations,paints,uploads],[1,1,1]);
  view.sim.visible[2]=view.sim.explored[2]=1;assert.equal(updateFogTexture(view),true);assert.equal(image.data[11],0);
  view.sim.visible[2]=0;assert.equal(updateFogTexture(view),true);assert.equal(image.data[11],100);
  assert.deepEqual([allocations,paints,uploads],[1,3,3]);
  view.sim={gridSize:3,visible:new Uint8Array(9).fill(1),explored:new Uint8Array(9).fill(1)};
  assert.equal(updateFogTexture(view),true);assert.deepEqual([view.fogCanvas.width,view.fogCanvas.height],[3,3]);assert.notEqual(view.fogImage,image);assert.equal(view.fogImage.data[35],0);assert.equal(view.fogImage.data[32],19);assert.deepEqual([allocations,paints,uploads],[2,4,4]);
});
