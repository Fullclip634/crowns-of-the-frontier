import assert from 'node:assert/strict';
import path from 'node:path';

// Optional extension of renderer-qa: run on its production build and real
// renderer, rather than a mock scene or a separate art viewer.
export async function verifyForestActions(page,output){
  const report={maps:[],actions:[]};
  for(const map of ['highlands','winter','desert']){
    await page.evaluate(async map=>{
      frontier.start({mode:'custom',map,mapSize:'spacious',seed:512,slots:[{enabled:true,team:1,faction:'alder'},{enabled:true,team:2,faction:'sun'}]});frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';
      const v=frontier.view,s=frontier.sim;v.render=()=>false;s.entities=[];s.visible.fill(1);s.explored.fill(1);
      for(let i=0;i<12;i++)s.addResource('wood',(i%4)*7-10,Math.floor(i/4)*12-8,300);
      v.settings.weather='clear';v.settings.lighting='day';v.settings.fog=false;v.settings.reducedMotion=true;
      v.attach(s);v.focus(0,2);v.zoom=48;v.tilt=.75;v.angle=.2;v.updateCamera();await qaDraw();
      window.qaForestSignature=()=>{
        const hash=geometry=>{let sum=2166136261;const attrs=[geometry.attributes.position,geometry.attributes.normal,geometry.attributes.color,geometry.index].filter(Boolean);for(const a of attrs)for(let i=0;i<a.count;i++)for(let k=0;k<a.itemSize;k++)sum=Math.imul(sum^Math.round(a.getComponent(i,k)*1e6),16777619);return sum>>>0;};
        return v.forest.map(batch=>({variant:batch.entries[0].id%4,sets:batch.sets.map(set=>({ids:[...set.ids],parts:set.parts.map(part=>({hash:hash(part.geometry),triangles:(part.geometry.index?.count??part.geometry.attributes.position.count)/3}))}))}));
      };
    },map);
    const entry={map,presets:[]};report.maps.push(entry);let baseline;
    for(const quality of ['high','medium','low']){
      const result=await page.evaluate(async quality=>{
        const v=frontier.view;v.render=qaRender;const applied=await v.quality(quality);v.render=()=>false;await qaDraw();
        return {quality,applied,valid:v.graphicsSceneValid,sharedTrees:v.artDiagnostics?.sharedTrees,signature:qaForestSignature(),treeBytes:v.artCacheDiagnostics?.sharedTreeBytes};
      },quality);
      assert.ok(result.applied&&result.valid&&result.sharedTrees===24&&result.treeBytes>0);baseline??=result.signature;assert.deepEqual(result.signature,baseline,map+' tree geometry and distance allocation must survive preset changes');entry.presets.push(result);
      await page.screenshot({path:path.join(path.dirname(output),`forest-${map}-${quality}.png`)});
    }
  }
  await page.evaluate(async()=>{
    const v=frontier.view,s=frontier.sim;s.options.map='highlands';s.entities=[];s.time=.4;
    const wood=s.addResource('wood',-10,1.55,300),gold=s.addResource('gold',-3,2,300),food=s.addResource('food',4,2,300),house=s.addBuilding('house',0,11,3);house.progress=.35;
    for(const [target,type,x]of [[wood,'gather',-10],[gold,'gather',-3],[food,'gather',4],[house,'build',11]]){const e=s.addUnit('villager',0,x,-.5);e.order={type,target:target.id};e.heading=0;e.work=.4;e.carry=1;}
    const sword=s.addUnit('swordsman',0,0,-8);sword.cooldown=.9;sword.order={type:'attack',target:wood.id};
    v.attach(s);v.focus(0,0);v.zoom=28;v.tilt=.65;v.angle=Math.PI;v.settings.reducedMotion=false;v.updateCamera();await qaDraw();
  });
  for(const phase of [.1,.45,.8]){
    const action=await page.evaluate(async phase=>{
      const v=frontier.view,s=frontier.sim;s.time=phase;for(const e of s.entities)if(e.type==='villager')e.work=phase;await qaDraw();await qaDraw();
      return {phase,workers:s.entities.filter(e=>e.type==='villager').map(e=>({id:e.id,task:v.unitActions.get(e.id)?.task,blend:v.unitActions.get(e.id)?.blend})),joints:[...v.unitBatches].flatMap(([type,batch])=>batch.parts.filter(part=>part.userData.rigidRig).map(part=>({type,joints:part.userData.rigidRig.joints.length,finite:part.userData.rigidRig.data.every(Number.isFinite)})))};
    },phase);assert.deepEqual(action.workers.map(e=>e.task),['wood','mine','food','build']);assert.ok(action.workers.every(e=>e.blend>0)&&action.joints.every(e=>e.finite));report.actions.push(action);
    await page.screenshot({path:path.join(path.dirname(output),`worker-actions-${phase}.png`)});
  }
  return report;
}
