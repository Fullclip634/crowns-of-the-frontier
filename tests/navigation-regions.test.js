import test from 'node:test';
import assert from 'node:assert/strict';
import {navigationRegions} from '../src/navigation.js';
import {seededRandom} from '../src/data.js';

test('region labeling preserves ordered four-way connectivity and reuses only matching grid results',()=>{
  const rng=seededRandom(634);
  for(const size of [1,2,17,40]){
    const sim={gridSize:size},grid=Uint8Array.from({length:size*size},()=>rng()<.35?1:0),expected=new Uint16Array(grid.length);let region=0;
    for(let first=0;first<grid.length;first++)if(!grid[first]&&!expected[first]){
      region++;const queue=[first];expected[first]=region;
      for(let i=0;i<queue.length;i++){const id=queue[i],x=id%size,z=Math.floor(id/size);for(const [nx,nz]of [[x-1,z],[x+1,z],[x,z-1],[x,z+1]]){if(nx<0||nz<0||nx>=size||nz>=size)continue;const next=nz*size+nx;if(!grid[next]&&!expected[next]){expected[next]=region;queue.push(next);}}}
    }
    const actual=navigationRegions(sim,grid);assert.deepEqual(actual,expected);assert.equal(navigationRegions(sim,grid),actual);
    const queue=sim.regionQueue,next=grid.slice();navigationRegions(sim,next);assert.equal(sim.regionQueue,queue);assert.notEqual(next.pathRegions,actual);
  }
});
