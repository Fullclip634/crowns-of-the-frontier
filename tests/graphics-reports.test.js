import test from 'node:test';
import assert from 'node:assert/strict';
import {graphicsReport,rememberGraphicsFailure,readGraphicsFailure,graphicsSupportMarkup,copyGraphicsReport} from '../src/graphics-reports.js';
import {watchRendererDevice} from '../src/render-context.js';

const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
const report=failure=>graphicsReport({buildId:'build-123',phase:'landing',requested:'webgpu',active:'webgpu',quality:'high',browser:'Chrome Android Test',secure:true,viewport:{width:740,height:360,pixelRatio:2},renderer:{backend:{compatibilityMode:true,device:{limits:{maxTextureDimension2D:8192,maxBufferSize:268435456}}}},failure});

test('a native failure report survives compatible reload with its original build, quality and device limits',()=>{
  const storage=memory(),original=report({type:'GPUValidationError',message:'Texture binding exceeds sampler count',originalEvent:{circular:null}});
  rememberGraphicsFailure(storage,original);const restored=readGraphicsFailure(storage),current=graphicsReport({buildId:'build-124',active:'webgl',quality:'low'});
  assert.deepEqual(restored,original);assert.equal(restored.gpu.compatibilityMode,true);assert.equal(restored.gpu.limits.maxTextureDimension2D,8192);assert.equal(current.active,'webgl');assert.equal(restored.active,'webgpu');assert.equal(restored.quality,'high');
});

test('support reports retain bounded graphics evidence without events, match data, addresses or credentials',()=>{
  const failure={message:'GPU error https://example.test/private/ROOM123?token=secret#private token=secret Bearer abc.def.ghi '+('x'.repeat(5000)),type:'GPUValidationError',originalEvent:{room:'secret'}};failure.originalEvent.circular=failure;
  const result=report(failure),raw=JSON.stringify(result);
  for(const value of ['ROOM123','secret','abc.def.ghi','originalEvent','circular'])assert.ok(!raw.includes(value),value);
  assert.ok(result.failure.message.length<=1600);assert.match(result.failure.message,/GPU error/);assert.match(result.failure.message,/example.test/);
  const storage=memory();storage.setItem('crowns-graphics-report',JSON.stringify({...result,roomCode:'PRIVATE',gpu:{...result.gpu,arbitrary:'PRIVATE'}}));assert.ok(!JSON.stringify(readGraphicsFailure(storage)).includes('PRIVATE'));
});

test('corrupt, oversized or blocked storage cannot break startup or erase an in-memory failure report',()=>{
  for(const value of ['{','null','{}',JSON.stringify({version:999,failure:{message:'unknown'}}),'x'.repeat(13000)])assert.equal(readGraphicsFailure({getItem:()=>value}),null);
  const blocked={getItem(){throw Error('Disabled');},setItem(){throw Error('Full');}};assert.equal(readGraphicsFailure(blocked),null);assert.equal(rememberGraphicsFailure(blocked,report({deviceLost:true,message:'GPU disconnected'})).failure.type,'DeviceLost');
  assert.equal(rememberGraphicsFailure(memory(),report(null)),null);
});

test('failure callbacks capture only latched errors and do not interrupt engine diagnostics when storage fails',()=>{
  const captured=[];let engineCalls=0;const view={renderer:{isWebGPURenderer:true,onError(){engineCalls++;}},renderQuality:'high',onGraphicsFailure:failure=>captured.push(report(failure))};watchRendererDevice(view);
  view.renderer.onError({type:'GPUValidationError',message:'Original error'});view.renderer.onError({message:'Repeated error'});assert.equal(captured.length,1);assert.equal(engineCalls,2);assert.equal(captured[0].failure.message,'Original error');
  view.onGraphicsFailure=()=>{throw Error('Storage failed');};view.renderer.onDeviceLost({message:'Lost later'});assert.equal(view.graphicsFatal.deviceLost,true);
});

test('graphics help keeps technical details closed, copies without opening them and reveals them for manual copying',async()=>{
  const current=report({message:'</textarea><script>alert(1)</script>'}),html=graphicsSupportMarkup({current,lastFailure:current});assert.ok(!html.includes('<script>'));assert.match(html,/&lt;\/textarea&gt;/);assert.match(html,/readonly/);
  assert.match(html,/<summary>Graphics help<\/summary>/);assert.match(html,/<details class="graphics-report-details"><summary>View technical details<\/summary>/);assert.ok(!/<details[^>]*\bopen\b/.test(html));
  let copied,selected=0;const details={open:false},field={value:'Graphics report',closest:()=>details,focus(){selected++;},select(){selected++;},setSelectionRange(start,end){assert.equal(start,0);assert.equal(end,this.value.length);selected++;}},status={},root={querySelector:selector=>selector==='#graphics-report'?field:status};
  assert.equal(await copyGraphicsReport(root,{writeText:async text=>{copied=text;}}),true);assert.equal(copied,field.value);assert.equal(selected,0);assert.equal(details.open,false);
  assert.equal(await copyGraphicsReport(root,{writeText:async()=>{throw Error('Denied');}}),false);assert.equal(selected,3);assert.equal(details.open,true);assert.match(status.textContent,/Select and copy/);
});
