import assert from 'node:assert/strict';
import path from 'node:path';
import {capturePaintedBattlefield} from './painted-battlefield-qa.mjs';

export async function verifyGreenTerrain(page,output){
  const results=[],maps=['highlands','valley','rivers','desert','canyon','coast','winter'];
  const visibility=await page.evaluate(()=>{const hud=document.querySelector('#hud'),before=hud.style.visibility;hud.style.visibility='hidden';return before;});
  try{
    for(const quality of ['high','medium','low']){
      await page.evaluate(async quality=>{const v=frontier.view;v.render=qaRender;const applied=await v.quality(quality);if(!applied)throw Error('Terrain quality did not apply: '+quality);v.render=()=>false;},quality);
      for(const map of maps){
        const state=await page.evaluate(async({map,quality})=>{
          frontier.start({mode:'custom',map,mapSize:'spacious',seed:512,startAge:1});frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';
          const v=frontier.view,s=frontier.sim,tc=s.owned(0,'building','towncenter')[0];v.settings.fog=false;v.settings.weather='clear';v.settings.lighting='day';v.weather.strength=v.weather.cloudiness=v.weather.daylight.amount=0;
          v.focus(map==='coast'?(tc.x+Math.sign(tc.x)*18)/2:tc.x,tc.z);v.zoom=48;v.tilt=.7;v.angle=.65;v.updateCamera();v.render=()=>false;await qaDraw();
          const tint=v.groundSurface.material.frontierTerrainUniforms.grassTint.value;
          return {map,quality,actual:v.renderQuality,active:document.documentElement.dataset.renderer,fatal:v.graphicsFatal||null,grassTint:tint.toArray(),coverCapacity:v.groundCover.mesh.instanceMatrix.count,coverDrawCalls:v.groundCoverDiagnostics.drawCalls};
        },{map,quality});
        assert.equal(state.actual,quality);assert.equal(state.fatal,null);assert.ok(state.coverCapacity<=(quality==='high'?4800:1800));assert.ok(state.coverDrawCalls<=1);
        if(map==='winter')assert.deepEqual(state.grassTint,[1,1,1]);else assert.ok(state.grassTint[1]>state.grassTint[0]&&state.grassTint[1]>state.grassTint[2]);
        const file=quality==='medium'?path.join(path.dirname(output),'terrain-'+map+'-'+quality+'.png'):undefined;
        const capture=await capturePaintedBattlefield(page,file,{manual:true});results.push({...state,image:file||null,pixels:capture.pixels});
        console.log(JSON.stringify({terrain:map,quality,painted:capture.pixels.painted}));
      }
    }
  }finally{await page.evaluate(visibility=>{document.querySelector('#hud').style.visibility=visibility;},visibility);}
  return results;
}
