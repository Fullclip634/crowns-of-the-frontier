import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {UNITS,TECHS} from '../src/data.js';
import {technologyState} from '../src/technology-tree.js';
import {trainAcrossBuildings} from '../src/production.js';
const advance=(s,seconds)=>{for(let i=0;i<seconds*10;i++)s.tick(.1);};
test('civilization units and technologies are restricted before spending resources, including group training',()=>{
  for(const [faction,type,tech,site]of [['alder','sentinel','shieldDrill','blacksmith'],['sun','marksman','caravanLedger','market'],['raven','outrider','raidingParties','stable']]){
    const s=new Simulation({mode:'sandbox',faction}),production=s.addBuilding(UNITS[type].at[0],0,0,25,true),research=s.addBuilding(site,0,15,25,true),before={...s.players[0].resources};
    assert.ok(s.train(production.id,type));assert.equal(s.players[0].resources.food,before.food-(UNITS[type].cost.food||0));assert.ok(s.research(research.id,tech));
    for(const [other,d]of Object.entries(UNITS).filter(([,d])=>d.faction&&d.faction!==faction)){const b=s.addBuilding(d.at[0],0,-15,50,true),budget={...s.players[0].resources};assert.equal(s.train(b.id,other),false);assert.equal(trainAcrossBuildings(s,other,[b.id]),0);assert.deepEqual(s.players[0].resources,budget);}
    for(const [other,d]of Object.entries(TECHS).filter(([,d])=>d.faction&&d.faction!==faction)){const b=s.addBuilding(d.at[0],0,20,50,true),budget={...s.players[0].resources};assert.equal(s.research(b.id,other),false);assert.deepEqual(s.players[0].resources,budget);}
    advance(s,50);assert.ok(s.owned(0,'unit',type).length);assert.equal(s.players[0].tech[tech],1);
  }
});
test('signature units have real counters and marksmen retain their slower attack interval',()=>{
  const s=new Simulation({mode:'sandbox',faction:'raven'}),raider=s.addUnit('outrider',0,0,20),worker=s.addUnit('villager',1,1,20),spearman=s.addUnit('spearman',1,0,22),knight=s.addUnit('knight',1,0,25);
  assert.ok(s.attackDamage(raider,worker)>s.attackDamage(raider,knight)*1.8);assert.ok(s.attackDamage(spearman,raider)>s.attackDamage(spearman,worker)*2);
  const marksman=s.addUnit('marksman',0,30,30);s.hit(marksman,knight);assert.equal(marksman.cooldown,1.8);
});
test('unique upgrades change armor, paid trade, cavalry speed, and one-time kill income',()=>{
  const alder=new Simulation({mode:'sandbox'}),u=alder.addUnit('sentinel',0,0,20),base=alder.unitArmor(u);alder.players[0].tech.shieldDrill=1;assert.equal(alder.unitArmor(u),base+2);
  const sun=new Simulation({mode:'sandbox',faction:'sun'});sun.addBuilding('market',0,0,20,true);sun.players[0].tech.caravanLedger=1;
  let gold=sun.players[0].resources.gold,food=sun.players[0].resources.food;assert.ok(sun.trade('food',true));assert.equal(sun.players[0].resources.food,food+110);assert.equal(sun.players[0].resources.gold,gold-130);
  gold=sun.players[0].resources.gold;assert.ok(sun.trade('food',false));assert.equal(sun.players[0].resources.gold,gold+90);
  const raven=new Simulation({mode:'sandbox',faction:'raven'}),a=raven.addUnit('outrider',0,0,20),victim=raven.addUnit('villager',1,3,20);raven.players[0].tech.raidingParties=1;
  gold=raven.players[0].resources.gold;raven.hurt(victim,victim.hp,a);assert.equal(raven.players[0].resources.gold,gold+3);raven.hurt(victim,100,a);assert.equal(raven.players[0].resources.gold,gold+3);
  const b=raven.addUnit('outrider',1,20,20);raven.players[1].faction='raven';raven.move(a,{x:0,z:40},.1);raven.move(b,{x:20,z:40},.1);assert.ok(Math.hypot(a.x,a.z-20)>Math.hypot(b.x-20,b.z-20));
});
test('technology tree explains missing prerequisites, queues, completed levels, and resource budgets',()=>{
  const s=new Simulation({mode:'sandbox'});assert.match(technologyState(s,'shieldDrill','tech','alder').status,/Build/);
  const smith=s.addBuilding('blacksmith',0,0,20,true);assert.equal(technologyState(s,'shieldDrill','tech','alder').site.id,smith.id);
  assert.ok(s.research(smith.id,'shieldDrill'));assert.equal(technologyState(s,'shieldDrill','tech','alder').status,'Research queued');advance(s,50);assert.equal(technologyState(s,'shieldDrill','tech','alder').status,'Completed');
  s.players[0].age=0;s.players[0].tech.economy=1;assert.match(technologyState(s,'economy','tech','alder').status,/Advance/);
  s.players[0].resources.food=0;assert.match(technologyState(s,'villager','unit','alder').status,/resources/);assert.equal(technologyState(s,'marksman','unit','alder').site,null);
});
test('older saves initialize new technologies without changing existing research',()=>{
  const s=new Simulation({mode:'sandbox'});s.players[0].tech.armor=2;const data=JSON.parse(JSON.stringify(s.serialize()));for(const p of data.players)for(const key of ['shieldDrill','caravanLedger','raidingParties'])delete p.tech[key];
  const restored=Simulation.restore(data);assert.equal(restored.players[0].tech.armor,2);assert.equal(restored.players[0].tech.shieldDrill,0);assert.ok(restored.players.every(p=>p.tech.raidingParties===0));
});
