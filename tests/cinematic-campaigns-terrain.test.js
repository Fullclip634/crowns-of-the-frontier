import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {MISSIONS,MAPS} from '../src/data.js';
import {Simulation} from '../src/simulation.js';
import {orderSiegeAssault} from '../src/ai-siege.js';
import {MISSION_CHRONICLES,missionLoadingMarkup} from '../src/mission-loading.js';
import {STARTUP_TIPS,startupSplashMarkup} from '../src/startup-loading.js';
import {landingMarkup} from '../src/menus-ui.js';
import {registerBiomeArtwork,clearBiomeArtwork,biomeCliffWallGeometry,biomeMountainGeometry,biomeBushGeometry} from '../src/biome-art.js';

const advance=(sim,seconds)=>{for(let i=0;i<seconds*10;i++)sim.tick(.1);};

describe('Blender 4.5 LTS Cliffs/Mountains/Bushes, Organic Fortified Valleys & Cinematic Campaigns',()=>{
  it('delivers Blender 4.5 LTS sculpted cliffwall, mountain, and woodland bush meshes with baked vertex colors',async()=>{
    const bytes=fs.readFileSync(new URL('../src/assets3d/frontier-biome-art.glb',import.meta.url));
    const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    registerBiomeArtwork(gltf.scene);
    try{
      for(const map of ['ironpass','arid','volcanic','tundra']){
        const cw=biomeCliffWallGeometry(map);
        assert.ok(cw&&cw.attributes.position.count>=120,`${map} loads Blender stepped cliffwall mesh`);
        assert.ok(cw.attributes.color&&cw.attributes.normal.array.every(Number.isFinite));
        cw.dispose();
      }
      for(const map of ['ironpass','volcanic','tundra']){
        const mtn=biomeMountainGeometry(map);
        assert.ok(mtn&&mtn.attributes.position.count>=120,`${map} loads Blender multi-spire mountain mesh`);
        assert.ok(mtn.attributes.color&&mtn.attributes.normal.array.every(Number.isFinite));
        mtn.dispose();
      }
      for(const map of ['highlands','arid','tundra']){
        const bush=biomeBushGeometry(map);
        assert.ok(bush&&bush.attributes.position.count>=60,`${map} loads Blender sculpted woodland bush mesh`);
        assert.ok(bush.attributes.color&&bush.attributes.normal.array.every(Number.isFinite));
        bush.dispose();
      }
      // Verify Blender 4.5 LTS actually baked rich botanical green vertex colors onto meadow bushes (NEVER flat white [1,1,1]!)
      const meadowBush=biomeBushGeometry('highlands');
      const bc=meadowBush.attributes.color;
      let br=0,bg=0,bb=0;
      for(let i=0;i<bc.count;i++){br+=bc.getX(i);bg+=bc.getY(i);bb+=bc.getZ(i);}
      br/=bc.count;bg/=bc.count;bb/=bc.count;
      assert.ok(bg>br*1.25&&bg>bb*1.25&&bg<0.75,`meadow bush vertex colors are rich forest green, not white (${br.toFixed(2)},${bg.toFixed(2)},${bb.toFixed(2)})`);
      meadowBush.dispose();
      const meadowCliff=biomeCliffWallGeometry('ironpass');
      const cc=meadowCliff.attributes.color;
      let minLuma=1;
      for(let i=0;i<cc.count;i++)minLuma=Math.min(minLuma,(cc.getX(i)+cc.getY(i)+cc.getZ(i))/3);
      assert.ok(minLuma<0.55,`meadow cliffwall carries baked crevice AO shading (minLuma=${minLuma.toFixed(2)})`);
      meadowCliff.dispose();
    }finally{clearBiomeArtwork();}
  });

  it('uses painted medieval citadel hero artwork on the home screen without a live 3D citadel toggle',()=>{
    assert.ok(fs.existsSync(new URL('../src/ui-art/frontier-citadel-hero.jpg',import.meta.url)),'painted medieval citadel hero key art exists');
    const styleCss=fs.readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
    assert.match(styleCss,/frontier-citadel-hero\.jpg/);

    const html=landingMarkup(null);
    assert.doesNotMatch(html,/data-action="toggle-menu-backdrop"/);
    assert.doesNotMatch(html,/Live 3D Citadel/i);
    assert.doesNotMatch(html,/Fieldcraft/i);
    assert.match(html,/14 handcrafted chapters/);
  });

  it('replaces the floating boot bar with a full-screen painted medieval startup loading screen',()=>{
    assert.ok(fs.existsSync(new URL('../src/ui-art/frontier-startup-loading.jpg',import.meta.url)),'painted medieval startup loading key art exists');
    const css=fs.readFileSync(new URL('../src/startup-loading.css',import.meta.url),'utf8');
    assert.match(css,/frontier-startup-loading\.jpg/);
    assert.doesNotMatch(css,/backdrop-filter:\s*blur/i,'startup splash stays blur-free for mobile and WebGPU');
    assert.ok(STARTUP_TIPS.length>=5,'provides rotating medieval fieldcraft tips');
    const splash=startupSplashMarkup({status:'Loading 3D models…',percent:64});
    assert.match(splash,/id="startup-splash"/);
    assert.match(splash,/role="progressbar"/);
    assert.match(splash,/Loading 3D models…/);
    assert.match(splash,/64%/);
    assert.doesNotMatch(splash,/Fieldcraft/i);
    assert.match(splash,/id="startup-retry-btn"/);
    const mainJs=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
    assert.match(mainJs,/createStartupSplash/);
    assert.doesNotMatch(mainJs,/bootStatus\.className='battlefield-loading'/);
  });

  it('renders Warcraft III / AoE2-style pre-mission chronicle loading screens for every campaign & skirmish mode',()=>{
    assert.equal(MISSIONS.length,14);
    for(const m of MISSIONS){
      assert.ok(MISSION_CHRONICLES[m.id]);
      const html=missionLoadingMarkup({mode:m.id,faction:'alder',difficulty:'normal',map:m.map});
      assert.match(html,/id="chronicle-overlay"/);
      assert.match(html,/chronicle-minimap/);
      assert.match(html,/chronicle-begin-btn/);
      assert.ok(html.includes(m.name));
    }
    const css=fs.readFileSync(new URL('../src/mission-loading.css',import.meta.url),'utf8');
    assert.doesNotMatch(css,/backdrop-filter:\s*blur/i);
  });

  it('builds impassable cliffwall/mountain ridges and natural resource-safe fortified valleys on classic maps',()=>{
    assert.ok(MAPS.ironpass&&MAPS.blackwood&&MAPS.bastion);

    const iron=new Simulation({mode:'skirmish',map:'ironpass',seed:2026});
    assert.ok(iron.barriers.some(b=>b.kind==='cliffwall'),'Iron Pass uses sheer cliffwall segments');
    assert.ok(iron.barriers.some(b=>b.kind==='mountain'),'Iron Pass anchors passes with alpine mountain peaks');
    const b=iron.barriers[0],grid=iron.grid(0),cell=iron.cell(b.x,b.z);
    assert.equal(grid[cell.z*iron.gridSize+cell.x],1,'cliff barrier blocks land pathfinding');
    iron.visible.fill(1);
    assert.equal(iron.buildValid('house',b.x,b.z,0),false,'buildings cannot overlap cliffs');

    const restored=Simulation.restore(JSON.parse(JSON.stringify(iron.serialize())));
    assert.equal(restored.barriers.length,iron.barriers.length);

    // Bastion uses continent-wide mountain ranges + regional valley coves (NOT circular rock donuts!)
    // + short connecting walls + keeps wood, gold, stone & berries safely INSIDE!
    const arena=new Simulation({mode:'skirmish',map:'bastion',seed:2026});
    const tc=arena.owned(0,'building','towncenter')[0];
    assert.ok(arena.barriers.length>=35,'Bastion builds continent-wide mountain ranges & valley coves');
    assert.ok(arena.owned(0,'building','gate').length>=2,'Bastion seals valley mouths with gates');
    assert.ok(arena.owned(0,'building','wall').length>=6,'Bastion ties short stone curtain walls into mountain spurs');
    // Confirm cliffs exist across ALL 4 quadrants of the map (real landscape, not just around player 0!)
    const quadrants=new Set(arena.barriers.map(p=>`${p.x>=0?'E':'W'}${p.z>=0?'S':'N'}`));
    assert.equal(quadrants.size,4,'Bastion cliffs & mountains span all 4 quadrants of the continent');
    for(const rType of ['wood','gold','stone','food']){
      assert.ok(arena.entities.some(e=>e.hp>0&&e.kind==='resource'&&e.type===rType&&Math.hypot(e.x-tc.x,e.z-tc.z)<36),`Bastion protects inner ${rType} inside the valley perimeter`);
    }
    // New Timbervale Glades map (AoE4 lush forest-glade style): huge sunlit meadow clearing + dense forests + mossy bluffs!
    assert.ok(MAPS.timbervale,'Timbervale Glades registered in MAPS');
    const timber=new Simulation({mode:'skirmish',map:'timbervale',seed:2026});
    const timberTrees=timber.entities.filter(e=>e.hp>0&&e.kind==='resource'&&e.type==='wood').length;
    assert.ok(timberTrees>=160,`Timbervale Glades plants dense natural woodland belts (${timberTrees} trees)`);
    assert.ok(timber.barriers.length>=16,'Timbervale Glades anchors glades with mossy granite bluffs');

    // Open & rugged biomes (Emerald Highlands, Amber Wastes, Frostmarch, Volcanic) ALSO get natural continent-wide cliffs!
    for(const openMap of ['highlands','arid','tundra','volcanic']){
      const openSim=new Simulation({mode:'skirmish',map:openMap,seed:2026});
      const qs=new Set(openSim.barriers.map(p=>`${p.x>=0?'E':'W'}${p.z>=0?'S':'N'}`));
      assert.ok(openSim.barriers.length>=15&&qs.size>=3,`${openMap} generates organic map-wide cliff bluffs & border headlands (${openSim.barriers.length} barriers across ${qs.size} quadrants)`);
    }
  });

  it('AI & soldiers bypass intact walls and charge straight through open breaches into the base',()=>{
    const sim=new Simulation({mode:'sandbox',map:'highlands',seed:777});
    for(const e of sim.entities)e.hp=0;
    sim.revision++;
    // Build a stone wall line at x = 0 with a WIDE OPEN BREACH around z = 0 (z = -6..+6 open!)
    const walls=[];
    for(let z=-28;z<=28;z+=3){
      if(Math.abs(z)<7)continue;
      const w=sim.addBuilding('wall',0,0,z,true);
      w.wallAngle=Math.PI/2;
      walls.push(w);
    }
    const house=sim.addBuilding('house',0,20,0,true);
    const villager=sim.addUnit('villager',0,18,0);
    // Attacking enemy soldiers stand right beside the intact wall at (-5, 10) and attack-move toward the interior house!
    const attackers=[sim.addUnit('swordsman',1,-5,10),sim.addUnit('swordsman',1,-5,8),sim.addUnit('knight',1,-6,11)];
    const ram=sim.addUnit('ram',1,-6,12);
    sim.revision++;
    sim.command(attackers.map(u=>u.id),{type:'attackmove',x:house.x,z:house.z});
    orderSiegeAssault(sim,1,[ram],[...walls,house],house);
    assert.equal(ram.order?.target,house.id,'Battering ram routes through the open breach to the interior house instead of attacking intact wall');
    advance(sim,16);
    assert.ok(walls.every(w=>w.hp===w.maxHp),'Soldiers ignored intact perimeter walls when a breach existed (0 wall damage)');
    assert.ok(villager.hp<villager.maxHp||house.hp<house.maxHp,'Soldiers poured straight through the open breach to strike interior villagers/buildings');
  });

  it('gives classic chapters (I-X) grand 320x320 scale, distant enemies (>=250m) & cliff-anchored fortifications',()=>{
    const ch1=new Simulation({mode:'campaign1',difficulty:'story'});
    assert.equal(ch1.worldSize,320,'Classic chapters expand to grand 320x320 AoE standard maps');
    const p0=ch1.owned(0,'building','towncenter')[0],p1=ch1.owned(1,'building','towncenter')[0];
    assert.ok(Math.hypot(p1.x-p0.x,p1.z-p0.z)>=250,`Enemy capital starts far across the frontier (${Math.round(Math.hypot(p1.x-p0.x,p1.z-p0.z))}m)`);
    const ch2=new Simulation({mode:'campaign2',difficulty:'story'});
    const c2p0=ch2.owned(0,'building','towncenter')[0],c2p1=ch2.owned(1,'building','towncenter')[0];
    assert.ok(Math.hypot(c2p1.x-c2p0.x,c2p1.z-c2p0.z)>=250,`Ch.2 enemy garrison stands far across the river valley (${Math.round(Math.hypot(c2p1.x-c2p0.x,c2p1.z-c2p0.z))}m)`);
    const ch3=new Simulation({mode:'campaign3',difficulty:'story'});
    assert.ok(ch3.barriers.length>=8&&ch3.owned(0,'building','gate').length>=2,'Ch.3 ties short stone walls & gates into Iron Ridge cliffs');
    const ch7=new Simulation({mode:'campaign7',difficulty:'story'});
    assert.ok(ch7.barriers.length>=12,'Ch.7 volcanic pass has basalt cliff barriers');
    const ch9=new Simulation({mode:'campaign9',difficulty:'story'});
    assert.ok(ch9.barriers.length>=15&&ch9.owned(0,'building','gate').length>=2,'Ch.9 starts in a snow-cliff fortified winter valley');
    const ch10=new Simulation({mode:'campaign10',difficulty:'story'});
    assert.ok(ch10.owned(1,'building','keep').length>=1&&ch10.barriers.length>=20,'Ch.10 uses mountain-ringed staging & summit fortresses');
  });

  it('delivers all 6 campaign-inspired Custom Battle & Skirmish maps with dry spawns, signature geography & save parity',()=>{
    const newMaps=['ironring','sunderedpass','oakhold','threecrowns','emberroad','frostvale'];
    for(const map of newMaps){
      assert.ok(MAPS[map]?.name&&MAPS[map]?.desc,`${map} registered in MAPS`);
      const sk=new Simulation({mode:'skirmish',map,seed:2026});
      assert.equal(sk.worldSize,240,`${map} defaults to spacious 240x240 in Skirmish`);
      assert.ok(sk.barriers.length>=12,`${map} generates rich natural cliffs/mountains (${sk.barriers.length})`);
      const custom=new Simulation({mode:'custom',map,mapSize:'large',seed:2026});
      assert.equal(custom.players.length,4);
      for(let owner=0;owner<custom.players.length;owner++){
        const tc=custom.owned(owner,'building','towncenter')[0];
        assert.ok(tc&&!custom.isWater(tc.x,tc.z),`${map} Custom Battle kingdom ${owner} starts on dry land`);
      }
      const restored=Simulation.restore(JSON.parse(JSON.stringify(custom.serialize())));
      assert.equal(restored.barriers.length,custom.barriers.length,`${map} barriers survive save/restore`);
    }
  });

  it('runs Act IV Chapter XI (Ring of Iron) on grand 360x360 scale with 46m citadel basin, safe inner resources & arriving Western Relief',()=>{
    const sim=new Simulation({mode:'campaign11',difficulty:'story'});
    sim.tickCustomAI=()=>{};
    assert.equal(sim.worldSize,360);
    assert.equal(sim.players.length,4);
    assert.ok(sim.owned(0,'building','keep').length>=1,'starts with Castle Keep');
    assert.ok(sim.owned(0,'building','gate').length>=4,'4 short cliff-anchored Gatehouse passes');
    assert.ok(sim.barriers.filter(b=>b.kind==='mountain').length>=8,'mountain crags anchor every citadel gate pass');
    assert.ok(Math.hypot(sim.players[1].start.x,sim.players[1].start.z)>=140,'Rival warlords start far outside the central citadel');
    // Verify ALL 4 resource types sit safely INSIDE the 46m fortified highland basin!
    for(const rType of ['wood','gold','stone','food']){
      assert.ok(sim.entities.some(e=>e.hp>0&&e.kind==='resource'&&e.type===rType&&Math.hypot(e.x,e.z)<44),`Ch.11 protects ${rType} safely INSIDE the fortified valley walls`);
    }
    assert.equal(sim.players[3].dormant,true);
    advance(sim,107);
    assert.equal(sim.campaignState.stage,1);
    assert.equal(sim.players[3].dormant,false);
    assert.ok(sim.owned(3,'building','towncenter').length===1);
    assert.ok(sim.owned(3,'unit','knight').length>=6);
  });

  it('runs Act IV Chapter XII (Sundered Pass): towering mountain range + cliff-cradled Northern Ally + central pass fortress',()=>{
    const sim=new Simulation({mode:'campaign12',difficulty:'story'});
    sim.tickCustomAI=()=>{};
    assert.equal(sim.worldSize,360);
    assert.ok(sim.barriers.length>=40,'towering mountain range + valley forts');
    assert.equal(sim.allied(0,3),true);
    assert.ok(sim.owned(3,'building','towncenter').length===1&&sim.owned(3,'building','gate').length>=1);
    assert.ok(sim.owned(1,'building','keep').length>=1);
  });

  it('runs Act IV Chapter XIII (Fallen Banner): NO starting base -> liberating cliff-cradled Oakhold transfers entire town & safe inner resources',()=>{
    const sim=new Simulation({mode:'campaign13',difficulty:'story'});
    sim.tickCustomAI=()=>{};
    assert.equal(sim.owned(0,'building').length,0);
    assert.ok(sim.owned(0,'unit','king').length===1);
    advance(sim,3);
    assert.equal(sim.ended,null);
    const oakBefore=sim.owned(3,'building').length;
    for(const b of [...sim.owned(1,'building')])sim.hurt(b,b.hp+10,sim.owned(0,'unit','knight')[0]);
    advance(sim,2);
    assert.equal(sim.campaignState.stage,1);
    assert.equal(sim.owned(0,'building','towncenter').length,1);
    assert.ok(sim.owned(0,'building').length>=oakBefore);
  });

  it('runs Act IV Chapter XIV (Crown of Three Kingdoms): grand 360x360 2v2 coalition war with spacious cliff-fortified citadels',()=>{
    const sim=new Simulation({mode:'campaign14',difficulty:'story'});
    sim.tickCustomAI=()=>{};
    assert.equal(sim.worldSize,360);
    assert.ok(sim.owned(0,'building','keep').length===1&&sim.owned(0,'building','gate').length>=2);
    assert.ok(sim.owned(3,'building','keep').length===1&&sim.allied(0,3));
    const beforeCats=sim.owned(0,'unit','catapult').length;
    const tc1=sim.owned(1,'building','towncenter')[0];
    sim.hurt(tc1,tc1.hp+10,sim.owned(0,'unit','knight')[0]);
    advance(sim,2);
    assert.equal(sim.campaignState.stage,1);
    assert.ok(sim.owned(0,'unit','catapult').length>beforeCats);
  });
});
