import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {characterSurfaceMode,characterAtlasUV,characterSurfaceKinds} from '../src/character-surfaces.js';

function rgba(bytes){
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),chunks=[];
  assert.equal(bytes[24],8);assert.equal(bytes[25],6);assert.equal(bytes[28],0);
  for(let at=8;at<bytes.length;){const length=bytes.readUInt32BE(at);if(bytes.subarray(at+4,at+8).toString()==='IDAT')chunks.push(bytes.subarray(at+8,at+8+length));at+=length+12;}
  const data=inflateSync(Buffer.concat(chunks)),pixels=Buffer.alloc(width*height*4),stride=width*4;
  const paeth=(a,b,c)=>{const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c;};
  for(let y=0;y<height;y++){const filter=data[y*(stride+1)];assert.ok(filter<=4);for(let x=0;x<stride;x++){const i=y*stride+x,a=x>=4?pixels[i-4]:0,b=y?pixels[i-stride]:0,c=y&&x>=4?pixels[i-stride-4]:0;pixels[i]=(data[y*(stride+1)+x+1]+(filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;}}
  return {width,height,pixels};
}

test('the original Blender atlas retains packed normals, roughness and the correct bottom-origin material tiles',()=>{
  const root=new URL('../src/assets3d/characters/',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',root)));
  assert.equal(manifest.baked,true);assert.match(manifest.authoring,/Blender 4\.5/);assert.equal(manifest.license,'Original project artwork');assert.equal(manifest.padding,16);
  const decoded={};let total=0;
  for(const [name,file]of Object.entries(manifest.files)){const bytes=fs.readFileSync(new URL(file.file,root));total+=bytes.length;assert.equal(bytes.length,file.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);decoded[name]=rgba(bytes);assert.equal(decoded[name].width,512);assert.equal(decoded[name].height,512);}
  assert.ok(total<800000,'Bound the extra download for the shared troop surfaces');
  const {pixels}=decoded['character-normal-roughness'];
  for(const role of manifest.roles){
    const mode=role.tile+2;let min=1,max=0;
    for(let y=0;y<224;y++)for(let x=0;x<224;x++){
      const px=role.tile%2*256+16+x,py=511-(Math.floor(role.tile/2)*256+16+y),at=(py*512+px)*4;
      assert.ok(Math.abs(Math.hypot(...[0,1,2].map(i=>pixels[at+i]/255*2-1))-1)<.02,role.role+' normals remain unit vectors');
      min=Math.min(min,pixels[at+3]/255);max=Math.max(max,pixels[at+3]/255);
    }
    assert.ok(Math.abs(min-role.roughnessRange[0])<.005&&Math.abs(max-role.roughnessRange[1])<.005,role.role+' roughness matches the authored tile');
    const [u,v]=characterAtlasUV(mode,0,0);assert.equal(Math.floor(u*512),role.tile%2*256+16);assert.equal(Math.floor(v*512),Math.floor(role.tile/2)*256+16);
    for(const [u,v]of [[-.127,4.03],[0,0],[.123,.987]]){const actual=characterAtlasUV(mode,u,v);assert.ok(actual.every(Number.isFinite));assert.equal(Math.floor(actual[0]*2),role.tile%2);assert.equal(Math.floor(actual[1]*2),Math.floor(role.tile/2));}
  }
});

test('cloth, leather, metal and skin keep distinct roles while ship paint and wood retain their own surfaces',()=>{
  for(const type of ['villager','knight','archer'])assert.equal(characterSurfaceMode('team',type),2);
  assert.equal(characterSurfaceMode('canvas','galley'),2);assert.equal(characterSurfaceMode('team','galley'),0);
  for(const type of ['swordsman','sentinel','king'])assert.equal(characterSurfaceMode('team',type,{type:'forearm',side:-1}),0,'painted shields are not cloth');
  assert.equal(characterSurfaceMode('team','villager',{type:'forearm',side:-1}),2,'worker sleeves retain their weave');
  for(const role of ['steel','iron'])assert.equal(characterSurfaceMode(role,'villager'),4);
  assert.equal(characterSurfaceMode('leather','knight'),3);assert.equal(characterSurfaceMode('skin','villager'),5);
  for(const role of ['wood','gold','horse','stone'])assert.equal(characterSurfaceMode(role,'villager'),0);
  assert.deepEqual(characterSurfaceKinds('low'),['color']);for(const quality of ['medium','high'])assert.deepEqual(characterSurfaceKinds(quality),['color','normal']);
});
