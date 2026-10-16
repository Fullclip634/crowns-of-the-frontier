import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {read as readKtx} from 'three/addons/libs/ktx-parse.module.js';
import {compressedSurfaceSupport,loadCompressedSurface,surfaceCodecState} from '../src/surface-codecs.js';

test('bundled compressed surfaces retain their source hashes, dimensions, mip chain and color spaces',()=>{
  const folder=new URL('../src/assets3d/textures/ktx2/',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',folder),'utf8'));
  assert.equal(manifest.maps.length,14);assert.ok(manifest.maps.every(map=>map.kind!=='normal'),'original normal direction detail remains uncompressed');
  const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
  for(const map of manifest.maps){const source=fs.readFileSync(new URL('../'+map.source,folder)),bytes=fs.readFileSync(new URL(map.file,folder)),ktx=readKtx(bytes);
    assert.equal(sha(source),map.sourceSHA256);assert.equal(sha(bytes),map.SHA256);assert.equal(ktx.pixelWidth,1024);assert.equal(ktx.pixelHeight,1024);assert.equal(ktx.levels.length,11);assert.equal(ktx.dataFormatDescriptor[0].transferFunction,map.kind==='color'?2:1);
  }
});

test('unsupported GPU compression returns to original images without opening a decoder',async()=>{
  assert.equal(compressedSurfaceSupport(null),false);const unsupported={extensions:{has:()=>false}};
  assert.equal(compressedSurfaceSupport(unsupported),false);assert.equal(await loadCompressedSurface('unused.ktx2',unsupported),null);assert.deepEqual(surfaceCodecState(),{codecFallbacks:0,codecPending:0});
  for(const extension of ['EXT_texture_compression_bptc','WEBGL_compressed_texture_astc'])assert.equal(compressedSurfaceSupport({extensions:{has:name=>name===extension}}),true);
});
