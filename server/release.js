import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const revision=value=>value==null||value===''?null:typeof value==='string'&&/^[a-f0-9]{40}$/i.test(value)?value.toLowerCase():undefined;
const entryFrom=html=>html.match(/<script\b[^>]*\bsrc="(\/assets\/[A-Za-z0-9._-]+\.js)"/)?.[1];
const buildFrom=html=>html.match(/<meta\b[^>]*name="frontier-build"[^>]*content="(\d+)"/)?.[1];
const safeFile=file=>typeof file==='string'&&/^\/[A-Za-z0-9_./-]+$/.test(file)&&file.split('/').slice(1).every(part=>part&&part!=='.'&&part!=='..');

export function writeReleaseManifest(root,{buildId,version,commit,files}){
  const normalized=revision(commit);if(normalized===undefined)throw new Error('Invalid deployment revision.');
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),main=entryFrom(html);
  if(!main||buildFrom(html)!==buildId)throw new Error('Built entry and release metadata do not match.');
  const manifest={schema:1,buildId,version,commit:normalized,main,mainSHA256:digest(fs.readFileSync(path.join(root,main.slice(1)))),files:[...new Set(files)]};
  fs.writeFileSync(path.join(root,'release.json'),JSON.stringify(manifest)+'\n');
  const inspection=inspectRelease(root,normalized?{RENDER_GIT_COMMIT:normalized}:{});
  if(!inspection.ready)throw new Error('Built package is incomplete: '+inspection.failures.join(', '));
  return manifest;
}

// Run once at boot. A healthy process must also have a complete game package
// from the intended deployment, rather than just an HTTP port that responds.
export function inspectRelease(root,environment=process.env){
  const failures=[],expectedCommit=revision(environment.RENDER_GIT_COMMIT||environment.GITHUB_SHA);
  if(expectedCommit===undefined)failures.push('invalid-deployment-revision');
  let manifest;
  try{manifest=JSON.parse(fs.readFileSync(path.join(root,'release.json'),'utf8'));}catch{return {ready:false,release:null,failures:[...failures,'missing-or-invalid-release-manifest']};}
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest)||manifest.schema!==1||typeof manifest.buildId!=='string'||!/^\d{10,20}$/.test(manifest.buildId)||typeof manifest.version!=='string'||!manifest.version.length||manifest.version.length>64||revision(manifest.commit)===undefined||!safeFile(manifest.main)||!/^\/assets\/[A-Za-z0-9._-]+\.js$/.test(manifest.main)||!Array.isArray(manifest.files)||!manifest.files.length||manifest.files.some(file=>!safeFile(file))||typeof manifest.mainSHA256!=='string'||!/^[a-f0-9]{64}$/.test(manifest.mainSHA256))return {ready:false,release:null,failures:[...failures,'invalid-release-manifest']};
  const commit=revision(manifest.commit);
  if(expectedCommit&&commit!==expectedCommit)failures.push('deployment-build-revision-mismatch');
  if(!manifest.files.includes('/index.html')||!manifest.files.includes(manifest.main))failures.push('incomplete-release-manifest');
  for(const file of manifest.files){try{if(!fs.statSync(path.join(root,file.slice(1))).isFile())failures.push('missing-build-file');}catch{failures.push('missing-build-file');}}
  try{
    const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
    if(entryFrom(html)!==manifest.main||buildFrom(html)!==manifest.buildId)failures.push('entry-build-mismatch');
    if(digest(fs.readFileSync(path.join(root,manifest.main.slice(1))))!==manifest.mainSHA256)failures.push('entry-content-mismatch');
  }catch{failures.push('missing-game-entry');}
  if(manifest.files.includes('/version.json'))try{const version=JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8'));if(version.buildId!==manifest.buildId||version.version!==manifest.version)failures.push('update-version-mismatch');}catch{failures.push('update-version-mismatch');}
  return {ready:failures.length===0,release:{commit,expectedCommit:expectedCommit??null,buildId:manifest.buildId,version:manifest.version,main:manifest.main,snapshotProtocol:2},failures:[...new Set(failures)]};
}
