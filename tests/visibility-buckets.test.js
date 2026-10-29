import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {BATTLE_SIZES,battlePreset} from '../src/custom-battle.js';
import {UNITS,BUILDINGS} from '../src/data.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

function legacySight(sim,owner){
  const shared=sim.options.mode==='custom'&&sim.options.shareVision,key=shared?'team:'+sim.players[owner].team:'owner:'+owner,buckets=new Map();let range=0;
  for(const source of sim.entities)if(source.hp>0&&!source.embarked&&(source.owner===owner||shared&&sim.allied(owner,source.owner))&&(source.kind==='unit'||source.kind==='building'&&source.progress>0)){
    const cell=Math.floor(source.x/16)+':'+Math.floor(source.z/16);if(!buckets.has(cell))buckets.set(cell,[]);buckets.get(cell).push(source);range=Math.max(range,source.kind==='unit'?UNITS[source.type].vision:BUILDINGS[source.type].vision||18);
  }
  return target=>{
    if(sim.options.mode==='custom'&&target.kind==='building'&&sim.revealedOwners?.includes(target.owner))return true;
    const reach=range+(target.r||0)+2;
    for(let x=Math.floor((target.x-reach)/16);x<=Math.floor((target.x+reach)/16);x++)for(let z=Math.floor((target.z-reach)/16);z<=Math.floor((target.z+reach)/16);z++)for(const source of buckets.get(x+':'+z)||[])if(source.hp>0&&!source.embarked&&distance(source,target)<(source.kind==='unit'?UNITS[source.type].vision:BUILDINGS[source.type].vision||18)+(target.r||0))return true;
    return false;
  };
}

test('spatial sight buckets preserve exact visibility across teams, edges and map sizes',()=>{
  for(const mapSize of Object.keys(BATTLE_SIZES)){
    const sim=new Simulation({mode:'custom',map:'highlands',mapSize,seed:512,slots:battlePreset('4v4'),shareVision:true});
    sim.entities=[];sim.index=new Map();sim.revision++;sim.revealedOwners=[6];
    const half=sim.halfWorld,points=[[-half+4,-half+4],[-half+5,half-5],[half-5,-half+5],[half-4,half-4],[-16.001,-.001],[-15.999,.001],[-.001,-15.999],[.001,-16.001],[0,0],[15.999,15.999],[16.001,16.001]];
    for(let owner=0;owner<8;owner++)for(let i=0;i<5;i++){
      const [x,z]=points[(owner*3+i*2)%points.length];sim.addUnit(i%2?'scout':'archer',owner,x,z);
      if(i===0)sim.addBuilding('tower',owner,points[(owner+i+4)%points.length][0],points[(owner+i+4)%points.length][1],true);
    }
    const targets=[...sim.entities];for(let i=0;i<36;i++){
      const [x,z]=points[i%points.length];targets.push({id:10000+i,kind:i%2?'unit':'resource',type:'spearman',owner:i%8,x:x+(i%3)*.75,z:z-(i%5)*.5,r:i%4});
    }
    for(let frame=0;frame<3;frame++){
      if(frame){sim.time+=.1;sim.revision++;for(const [i,source]of sim.entities.entries())if(source.kind==='unit'){source.x+=i%2?.37:-.29;source.z+=i%3?.23:-.31;}}
      for(const shareVision of [true,false]){
        sim.options.shareVision=shareVision;sim.revision++;
        for(let owner=0;owner<8;owner++){
          const reference=legacySight(sim,owner);
          for(const target of targets)assert.equal(sim.canSee(owner,target),reference(target),`${mapSize} frame ${frame}, shared ${shareVision}, owner ${owner}, entity ${target.id}`);
        }
      }
    }
  }
});
