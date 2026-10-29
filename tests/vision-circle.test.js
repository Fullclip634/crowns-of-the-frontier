import test from 'node:test';
import assert from 'node:assert/strict';
import {revealVisionCircle} from '../src/vision-circle.js';

test('cached vision spans preserve exact circular coverage, map edges and prior exploration',()=>{
  for(const size of [8,80,280])for(const radius of [0,1,3,7,12,25]){
    const visible=new Uint8Array(size*size),explored=new Uint8Array(size*size),expected=new Uint8Array(size*size),past=new Uint8Array(size*size);explored[size-1]=past[size-1]=1;
    for(const [x,z]of [[0,0],[size-1,size-1],[0,size-1],[Math.floor(size/2),Math.floor(size/2)]]){
      revealVisionCircle(visible,explored,size,x,z,radius);
      for(let row=0;row<size;row++)for(let col=0;col<size;col++)if((col-x)**2+(row-z)**2<=radius*radius){expected[row*size+col]=1;past[row*size+col]=1;}
      assert.deepEqual(visible,expected,`visible ${size}/${radius}/${x}/${z}`);assert.deepEqual(explored,past,`explored ${size}/${radius}/${x}/${z}`);
    }
  }
});
