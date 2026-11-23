import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MISSIONS,MAPS} from '../src/data.js';
import {Simulation} from '../src/simulation.js';
import {CAMPAIGN_SCRIPTS,campaignObjective} from '../src/campaigns.js';
import {MISSION_CHRONICLES,missionLoadingMarkup} from '../src/mission-loading.js';
import {shouldRunMenuDiorama,createMenuDioramaSim} from '../src/menu-diorama.js';
import {landingMarkup} from '../src/menus-ui.js';

const advance=(sim,seconds)=>{for(let i=0;i<seconds*10;i++)sim.tick(.1);};

describe('Cinematic Campaigns, Home Citadel Art, Pre-Battle Loading Screen & Natural Terrain Barriers',()=>{
  it('installs new painted citadel hero artwork, backdrop toggle, and grand walled 3D citadel diorama',()=>{
    assert.ok(fs.existsSync(new URL('../src/ui-art/frontier-citadel-hero.jpg',import.meta.url)),'painted medieval citadel hero key art exists');
    const styleCss=fs.readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
    assert.match(styleCss,/frontier-citadel-hero\.jpg/);

    assert.equal(shouldRunMenuDiorama({settings:{quality:'high',reducedMotion:false,menuBackdrop:'artwork'},modestDevice:false,hasView:true}),false,'artwork mode preserves painted key art');
    assert.equal(shouldRunMenuDiorama({settings:{quality:'high',reducedMotion:false,menuBackdrop:'diorama'},modestDevice:false,hasView:true}),true,'diorama mode runs 3D citadel');

    const diorama=createMenuDioramaSim();
    assert.ok(diorama.owned(0,'building','keep').length>=1,'diorama citadel has a Castle Keep');
    assert.ok(diorama.owned(0,'building','wall').length>=12,'diorama citadel is enclosed by stone walls');
    assert.ok(diorama.owned(0,'building','gate').length>=1,'diorama citadel has gatehouses');
    assert.ok(diorama.owned(0,'building','tower').length>=2,'diorama citadel has watchtowers');

    const html=landingMarkup(null,{menuBackdrop:'artwork'});
    assert.match(html,/data-action="toggle-menu-backdrop"/);
    assert.match(html,/14 handcrafted chapters/);
  });

  it('renders Warcraft III / AoE2-style pre-mission chronicle loading screens for every campaign & skirmish mode',()=>{
    assert.equal(MISSIONS.length,14,'14 handcrafted campaign chapters across Acts I-IV');
    for(const m of MISSIONS){
      assert.ok(MISSION_CHRONICLES[m.id],`${m.id} has full pre-mission chronicle narrative`);
      const html=missionLoadingMarkup({mode:m.id,faction:'alder',difficulty:'normal',map:m.map});
      assert.match(html,/id="chronicle-overlay"/);
      assert.match(html,/chronicle-minimap/);
      assert.match(html,/chronicle-begin-btn/);
      assert.match(html,/Sound the Horns/);
      assert.ok(html.includes(m.name),`chronicle includes title ${m.name}`);
    }
    const skirmishHtml=missionLoadingMarkup({mode:'skirmish',faction:'sun',difficulty:'hard',map:'ironpass'});
    assert.match(skirmishHtml,/Iron pass/i);
    assert.match(skirmishHtml,/chronicle-begin-btn/);

    const css=fs.readFileSync(new URL('../src/mission-loading.css',import.meta.url),'utf8');
    assert.doesNotMatch(css,/backdrop-filter:\s*blur/i,'chronicle screen uses zero laggy backdrop-filter blur');
  });

  it('builds impassable natural stone cliffs and classic AoE2 maps (ironpass, blackwood, bastion) that survive save/restore',()=>{
    assert.ok(MAPS.ironpass&&MAPS.blackwood&&MAPS.bastion,'3 classic tactical maps registered');

    const iron=new Simulation({mode:'skirmish',map:'ironpass',seed:2026});
    assert.ok(iron.barriers.length>=15,'Iron Pass generates impassable granite cliff ridges');
    const b=iron.barriers[0];
    const grid=iron.grid(0),cell=iron.cell(b.x,b.z);
    assert.equal(grid[cell.z*iron.gridSize+cell.x],1,'cliff barrier blocks land navigation grid');
    iron.visible.fill(1);
    assert.equal(iron.buildValid('house',b.x,b.z,0),false,'buildings cannot be placed inside natural cliffs');

    // Verify barriers survive save/restore cleanly
    const restored=Simulation.restore(JSON.parse(JSON.stringify(iron.serialize())));
    assert.equal(restored.barriers.length,iron.barriers.length,'barriers serialize & restore identically');

    const wood=new Simulation({mode:'skirmish',map:'blackwood',seed:2026});
    assert.ok(wood.entities.filter(e=>e.kind==='resource'&&e.type==='wood').length>=120,'Blackwood plants dense forest corridor barriers');

    const arena=new Simulation({mode:'skirmish',map:'bastion',seed:2026});
    assert.ok(arena.owned(0,'building','wall').length>=20,'Bastion encloses player in stone walls');
    assert.ok(arena.owned(0,'building','gate').length>=1,'Bastion includes player gatehouses');
    assert.ok(arena.owned(1,'building','wall').length>=20,'Bastion encloses rival in stone walls');
  });

  it('gives every classic chapter (I-X) distinct handcrafted fortifications and natural chokepoints',()=>{
    const ch3=new Simulation({mode:'campaign3',difficulty:'story'});
    assert.ok(ch3.owned(0,'building','wall').length>=10&&ch3.owned(0,'building','tower').length>=2,'Ch.3 starts with pre-walled ridge stronghold');
    const ch7=new Simulation({mode:'campaign7',difficulty:'story'});
    assert.ok(ch7.barriers.length>=8,'Ch.7 volcanic pass has impassable basalt cliff barriers');
    const ch9=new Simulation({mode:'campaign9',difficulty:'story'});
    assert.ok(ch9.owned(0,'building','wall').length>=16&&ch9.owned(0,'building','gate').length>=1,'Ch.9 starts inside a complete pre-walled winter palisade town');
    const ch10=new Simulation({mode:'campaign10',difficulty:'story'});
    assert.ok(ch10.owned(0,'building','wall').length>=14&&ch10.owned(1,'building','keep').length>=1,'Ch.10 starts with walled southern staging citadel vs summit keep');
  });

  it('runs Act IV Chapter XI (Ring of Iron): central walled citadel surrounded by 2 enemy bases + Western Allied Relief arriving mid-battle',()=>{
    const sim=new Simulation({mode:'campaign11',difficulty:'story'});
    sim.tickCustomAI=()=>{};
    assert.equal(sim.worldSize,240);
    assert.equal(sim.players.length,4);
    assert.ok(sim.owned(0,'building','keep').length>=1,'starts with Castle Keep inside central citadel');
    assert.ok(sim.owned(0,'building','wall').length>=28,'starts fully enclosed in stone walls');
    assert.ok(sim.owned(0,'building','gate').length>=3,'starts with multiple gatehouses');
    assert.ok(sim.owned(1,'building','towncenter').length===1&&sim.owned(2,'building','towncenter').length===1,'surrounded by distinct northern & eastern warlord bases');
    assert.equal(sim.players[3].dormant,true,'Western Allied Relief starts dormant before arriving');
    assert.equal(sim.owned(3,'building').length,0);

    // Advance past Stage 0 (105s) -> Western Allied Relief smashes through and constructs a live Allied Forward Base!
    advance(sim,107);
    assert.equal(sim.campaignState.stage,1);
    assert.equal(sim.players[3].dormant,false,'Western Allied Relief activated');
    assert.ok(sim.owned(3,'building','towncenter').length===1,'Allied Relief erected a forward Town Center');
    assert.ok(sim.owned(3,'unit','knight').length>=6,'Allied Relief deployed Heavy Knights');
    assert.equal(sim.allied(0,3),true,'Western Relief is allied with the player');
  });

  it('runs Act IV Chapter XII (Sundered Pass): impassable mountain ranges + active Allied Northern Garrison + pass collapse bounty',()=>{
    const sim=new Simulation({mode:'campaign12',difficulty:'story'});
    sim.tickCustomAI=()=>{};
    assert.ok(sim.barriers.length>=25,'towering north-to-south stone cliff range divides the map');
    assert.equal(sim.allied(0,3),true,'Northern Allied Garrison is active from second 1');
    assert.ok(sim.owned(3,'building','towncenter').length===1&&sim.owned(3,'building','wall').length>=12,'Allied Garrison starts inside walled mountain fort');
    assert.ok(sim.owned(1,'building','keep').length>=1,'Central Mountain Fortress guards the pass');
  });

  it('runs Act IV Chapter XIII (Fallen Banner): NO starting base -> rescuing Oakhold transfers entire walled town to the player',()=>{
    const sim=new Simulation({mode:'campaign13',difficulty:'story'});
    sim.tickCustomAI=()=>{};
    assert.equal(sim.owned(0,'building').length,0,'starts with ZERO player buildings (Warcraft III / Joan of Arc vanguard)');
    assert.ok(sim.owned(0,'unit','king').length===1,'starts with Sovereign Bannerlord');
    assert.ok(sim.owned(0,'unit','knight').length>=4,'starts with elite vanguard knights');
    assert.ok(sim.owned(3,'building','towncenter').length===1,'besieged village of Oakhold awaits rescue');

    // Survive with 0 TCs during Stage 0!
    advance(sim,3);
    assert.equal(sim.ended,null,'does not defeat player while rescuing Oakhold with 0 TCs');

    // Destroy the besieging Raider Barracks & Tower -> Oakhold transfers completely to Player 0!
    const oakholdBuildingsBefore=sim.owned(3,'building').length;
    const oakholdVillagersBefore=sim.owned(3,'unit','villager').length;
    for(const b of [...sim.owned(1,'building')])sim.hurt(b,b.hp+10,sim.owned(0,'unit','knight')[0]);
    advance(sim,2);
    assert.equal(sim.campaignState.stage,1,'Stage 0 completed on clearing Oakhold raiders');
    assert.equal(sim.owned(0,'building','towncenter').length,1,'player inherited Oakhold Town Center');
    assert.ok(sim.owned(0,'building').length>=oakholdBuildingsBefore,'player inherited all walled Oakhold buildings');
    assert.ok(sim.owned(0,'unit','villager').length>=oakholdVillagersBefore,'player inherited all Oakhold villagers');
    assert.equal(sim.owned(3,'building').length,0,'no orphaned buildings remain on owner 3');
  });

  it('runs Act IV Chapter XIV (Crown of Three Kingdoms): grand 2v2 Imperial Coalition War across Twin Rivers',()=>{
    const sim=new Simulation({mode:'campaign14',difficulty:'story'});
    sim.tickCustomAI=()=>{};
    assert.equal(sim.worldSize,240);
    assert.equal(sim.players.length,4);
    assert.ok(sim.owned(0,'building','keep').length===1&&sim.owned(0,'building','wall').length>=20,'player starts in grand Imperial staging citadel');
    assert.ok(sim.owned(3,'building','keep').length===1&&sim.allied(0,3),'Queen Maren commands full Allied Imperial Fortress');
    assert.ok(sim.owned(1,'building','towncenter').length===1&&sim.owned(2,'building','towncenter').length===1,'two distinct rival Imperial capitals stand');

    // Destroy first rival capital -> triggers Imperial Counter-Offensive + Queen Maren Reinforcements
    const beforeCats=sim.owned(0,'unit','catapult').length;
    const tc1=sim.owned(1,'building','towncenter')[0];
    sim.hurt(tc1,tc1.hp+10,sim.owned(0,'unit','knight')[0]);
    advance(sim,2);
    assert.equal(sim.campaignState.stage,1);
    assert.ok(sim.owned(0,'unit','catapult').length>beforeCats,'Queen Maren dispatched a Trebuchet & Royal Knights');
  });
});
