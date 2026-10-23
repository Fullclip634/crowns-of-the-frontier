import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import {inspectRelease,writeReleaseManifest} from '../server/release.js';
import {createGameServer} from '../server/http-app.js';
import {verifyRelease} from '../scripts/verify-release.mjs';

const commit='a'.repeat(40),buildId='1792788311103';
function fixture(t){
  const temporaryRoot=path.resolve(os.tmpdir()),root=fs.mkdtempSync(path.join(temporaryRoot,'frontier-release-'));t.after(()=>{assert.equal(path.dirname(path.resolve(root)),temporaryRoot);assert.ok(path.basename(root).startsWith('frontier-release-'));fs.rmSync(root,{recursive:true,force:true});});fs.mkdirSync(path.join(root,'assets'));
  fs.writeFileSync(path.join(root,'index.html'),`<html><head><meta name="frontier-build" content="${buildId}"><script type="module" crossorigin src="/assets/index-test.js"></script></head></html>`);
  fs.writeFileSync(path.join(root,'assets/index-test.js'),'console.log("built game");');fs.writeFileSync(path.join(root,'assets/chunk-test.js'),'export const value=1;');
  fs.writeFileSync(path.join(root,'version.json'),JSON.stringify({buildId,version:'2.6.1'}));
  const manifest=writeReleaseManifest(root,{buildId,version:'2.6.1',commit,files:['/index.html','/assets/index-test.js','/assets/chunk-test.js','/version.json']});return {root,manifest};
}
async function serve(t,root,environment){const app=createGameServer({root,environment}),sockets=new Set();app.server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(async()=>{for(const socket of sockets)socket.destroy();app.rooms?.close();await new Promise(resolve=>app.server.close(resolve));});return {...app,base:`http://127.0.0.1:${app.server.address().port}`};}

test('a verified game package reports its actual commit/build and serves its exact immutable entry',async t=>{
  const {root}=fixture(t),app=await serve(t,root,{RENDER_GIT_COMMIT:commit,PRIVATE_TOKEN:'must-not-be-exposed'});
  const health=await fetch(app.base+'/health'),body=await health.json();assert.equal(health.status,200);assert.equal(health.headers.get('cache-control'),'no-store');assert.equal(body.ok,true);
  assert.deepEqual(body.release,{commit,expectedCommit:commit,buildId,version:'2.6.1',main:'/assets/index-test.js',snapshotProtocol:2});assert.equal(JSON.stringify(body).includes('must-not-be-exposed'),false);
  const page=await fetch(app.base+'/');assert.equal(page.status,200);assert.equal(page.headers.get('cache-control'),'no-cache');assert.match(await page.text(),/index-test\.js/);
  const script=await fetch(app.base+body.release.main);assert.match(script.headers.get('cache-control'),/immutable/);assert.equal(await script.text(),'console.log("built game");');
  const ws=new WebSocket(app.base.replace('http:','ws:')+'/socket');t.after(()=>ws.terminate());await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
  const pong=new Promise(resolve=>ws.once('message',raw=>resolve(JSON.parse(raw))));ws.send(JSON.stringify({type:'ping',stamp:42}));assert.deepEqual(await pong,{type:'pong',stamp:42});ws.close();
});

test('missing chunks and a build from another commit cannot pass hosted readiness or accept rooms',async t=>{
  const {root}=fixture(t);fs.unlinkSync(path.join(root,'assets/chunk-test.js'));
  const app=await serve(t,root,{RENDER_GIT_COMMIT:'b'.repeat(40)});assert.equal(app.rooms,null);
  const health=await fetch(app.base+'/health'),body=await health.json();assert.equal(health.status,503);assert.equal(body.ok,false);assert.ok(body.failures.includes('missing-build-file'));assert.ok(body.failures.includes('deployment-build-revision-mismatch'));
  const page=await fetch(app.base+'/');assert.equal(page.status,503);assert.equal(page.headers.get('retry-after'),'15');assert.equal(page.headers.get('cache-control'),'no-store');
  const ws=new WebSocket(app.base.replace('http:','ws:')+'/socket');t.after(()=>ws.terminate());const accepted=await new Promise(resolve=>{ws.once('open',()=>resolve(true));ws.once('error',()=>resolve(false));});assert.equal(accepted,false);
});

test('readiness detects replaced entry bytes, wrong HTML, absent build metadata and invalid revision values',t=>{
  const {root,manifest}=fixture(t);assert.equal(inspectRelease(root,{}).ready,true);
  fs.writeFileSync(path.join(root,'assets/index-test.js'),'old build');assert.ok(inspectRelease(root,{}).failures.includes('entry-content-mismatch'));
  fs.writeFileSync(path.join(root,'assets/index-test.js'),'console.log("built game");');
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');fs.writeFileSync(path.join(root,'index.html'),html.replace(buildId,'1792787686560'));assert.ok(inspectRelease(root,{}).failures.includes('entry-build-mismatch'));fs.writeFileSync(path.join(root,'index.html'),html);
  assert.ok(inspectRelease(root,{RENDER_GIT_COMMIT:'invalid revision'}).failures.includes('invalid-deployment-revision'));
  assert.ok(inspectRelease(root,{GITHUB_SHA:commit}).ready);
  fs.writeFileSync(path.join(root,'version.json'),JSON.stringify({buildId:'1792787686560',version:'2.6.1'}));assert.ok(inspectRelease(root,{}).failures.includes('update-version-mismatch'));
  fs.writeFileSync(path.join(root,'version.json'),JSON.stringify({buildId,version:'2.6.1'}));
  for(const invalid of [null,[],{...manifest,commit:[commit]},{...manifest,files:['/../private.env']},{...manifest,files:['/assets\\private']},{...manifest,files:[]},{...manifest,main:'/../private.js'}]){fs.writeFileSync(path.join(root,'release.json'),JSON.stringify(invalid));assert.equal(inspectRelease(root,{}).ready,false);}
  fs.unlinkSync(path.join(root,'release.json'));assert.equal(inspectRelease(root,{}).ready,false);
});

test('manifest generation fails the build if its metadata or deployment commit is inconsistent',t=>{
  const {root}=fixture(t);assert.throws(()=>writeReleaseManifest(root,{buildId:'1792787686560',version:'2.6.1',files:[]}),/do not match/);
  assert.throws(()=>writeReleaseManifest(root,{buildId,version:'2.6.1',commit:'not-a-sha',files:[]}),/Invalid deployment revision/);
  const manifest=writeReleaseManifest(root,{buildId,version:'2.6.1',files:['/index.html','/assets/index-test.js','/assets/chunk-test.js']});assert.equal(manifest.commit,null);assert.equal(inspectRelease(root,{}).ready,true);
});

test('release verification proves the served revision and entry bytes, and rejects an old or tampered release',async t=>{
  const {root}=fixture(t),app=await serve(t,root,{RENDER_GIT_COMMIT:commit});
  const verified=await verifyRelease(app.base,commit);assert.equal(verified.verified,true);assert.equal(verified.buildId,buildId);
  await assert.rejects(verifyRelease(app.base,'b'.repeat(40)),/revision differs/);
  fs.writeFileSync(path.join(root,'assets/index-test.js'),'outdated file');await assert.rejects(verifyRelease(app.base,commit),/entry bytes differ/);
});
