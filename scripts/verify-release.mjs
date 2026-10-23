import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

export async function verifyRelease(url,expectedCommit){
  const base=new URL(url);assert.ok(['http:','https:'].includes(base.protocol)&&base.pathname==='/'&&!base.username&&!base.password&&!base.search&&!base.hash,'Use a plain game origin URL.');
  assert.match(expectedCommit,/^[a-f0-9]{40}$/,'An exact lowercase commit SHA is required.');
  const get=async relative=>{const response=await fetch(new URL(relative,base),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(25000)});assert.ok(response.ok,`${relative}: HTTP ${response.status}`);return Buffer.from(await response.arrayBuffer());};
  const health=JSON.parse((await get('/health')).toString()),manifest=JSON.parse((await get('/release.json')).toString()),version=JSON.parse((await get('/version.json')).toString()),html=(await get('/?verify-release='+Date.now())).toString();
  assert.equal(health.ok,true);assert.equal(health.release?.commit,expectedCommit,'Live server/build revision differs from the intended commit.');assert.equal(manifest.commit,expectedCommit);
  assert.equal(health.release.expectedCommit??expectedCommit,expectedCommit);assert.equal(health.release.buildId,manifest.buildId);assert.equal(version.buildId,manifest.buildId);
  assert.equal(health.release.version,manifest.version);assert.equal(version.version,manifest.version);
  assert.match(manifest.main,/^\/assets\/[A-Za-z0-9._-]+\.js$/);assert.equal(html.match(/<script\b[^>]*\bsrc="([^"]+)"/)?.[1],manifest.main);assert.equal(html.match(/name="frontier-build"[^>]*content="(\d+)"/)?.[1],manifest.buildId);
  const hash=createHash('sha256').update(await get(manifest.main)).digest('hex');assert.equal(hash,manifest.mainSHA256,'Live entry bytes differ from the release manifest.');
  return {verified:true,url:base.origin,commit:expectedCommit,buildId:manifest.buildId,main:manifest.main,mainSHA256:hash,snapshotProtocol:health.release.snapshotProtocol};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{console.log(JSON.stringify(await verifyRelease(process.argv[2]||'https://crowns-of-the-frontier.onrender.com',process.argv[3])));}catch(error){console.error('Release verification failed: '+error.message);process.exitCode=1;}
}
