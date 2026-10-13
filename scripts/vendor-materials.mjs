import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';

const ids=['leafy_grass','medieval_blocks_05','old_wood_floor','painted_plaster_wall','brown_mud','rocky_terrain_02','rock_01'];
const folder=new URL('../src/assets3d/textures/',import.meta.url);
const headers={'User-Agent':'CrownsOfTheFrontier-AssetPreparation/1.0'};
await fs.mkdir(folder,{recursive:true});
const manifest=[];
for(const id of ids){
  const read=async endpoint=>{const response=await fetch('https://api.polyhaven.com/'+endpoint+'/'+id,{headers,signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`${id}: ${response.status}`);return response.json();};
  const [info,files]=await Promise.all([read('info'),read('files')]);
  const maps=[];
  for(const [kind,key] of [['color','Diffuse'],['normal','nor_gl'],['arm','arm']]){
    const file=files[key]?.['1k']?.jpg;if(!file)throw new Error(`Missing ${id} ${key} 1k JPEG.`);
    const url=new URL(file.url);if(url.protocol!=='https:'||url.hostname!=='dl.polyhaven.org'||file.size>8*1024*1024)throw new Error('Unexpected material download.');
    const name=`${id}_${kind}.jpg`,target=new URL(name,folder),valid=bytes=>bytes?.length===file.size&&createHash('md5').update(bytes).digest('hex')===file.md5;
    let bytes=await fs.readFile(target).catch(()=>null);
    if(!valid(bytes)){
      const response=await fetch(url,{headers,signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error(`${id} ${kind}: ${response.status}`);
      bytes=Buffer.from(await response.arrayBuffer());if(!valid(bytes))throw new Error('Material download integrity check failed.');await fs.writeFile(target,bytes);
    }
    maps.push({kind,file:name,bytes:bytes.length,url:file.url,md5:file.md5});
  }
  manifest.push({id,name:info.name,authors:info.authors,dimensionsMM:info.dimensions,source:'https://polyhaven.com/a/'+id,license:'CC0-1.0',maps});
  console.log(JSON.stringify({id,maps:maps.length,bytes:maps.reduce((n,m)=>n+m.bytes,0)}));
}
await fs.writeFile(new URL('manifest.json',folder),JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(new URL('LICENSE.md',folder),'# Material sources\n\nThese texture sets are by Poly Haven contributors and are distributed under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). See the [Poly Haven license](https://polyhaven.com/license).\n\n'+manifest.map(asset=>`- [${asset.name}](${asset.source}) — ${Object.keys(asset.authors).join(', ')}; original 1k diffuse, OpenGL normal, and packed AO/roughness/metallic JPEG maps.`).join('\n')+'\n\nOriginal downloaded files are verified against the source API file size and MD5. Runtime assets are bundled locally; the game does not call Poly Haven services.\n');
