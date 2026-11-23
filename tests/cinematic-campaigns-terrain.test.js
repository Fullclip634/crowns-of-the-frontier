import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {MISSIONS,MAPS} from '../src/data.js';
import {Simulation} from '../src/simulation.js';
import {MISSION_CHRONICLES,missionLoadingMarkup} from '../src/mission-loading.js';
import {shouldRunMenuDiorama,createMenuDioramaSim} from '../src/menu-diorama.js';
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

  it('installs new painted citadel hero artwork, backdrop toggle, and grand walled 3D citadel diorama',()=>{
    assert.ok(fs.existsSync(new URL('../src/ui-art/frontier-citadel-hero.jpg',import.meta.url)),'painted medieval citadel hero key art exists');
    const styleCss=fs.readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
    assert.match(styleCss,/frontier-citadel-hero\.jpg/);

    assert.equal(shouldRunMenuDiorama({settings:{quality:'high',reducedMotion:false,menuBackdrop:'artwork'},modestDevice:false,hasView:true}),false);
    assert.equal(shouldRunMenuDiorama({settings:{quality:'high',reducedMotion:false,menuBackdrop:'diorama'},modestDevice:false,hasView:true}),true);

    const diorama=createMenuDioramaSim();
    assert.ok(diorama.owned(0,'building','keep').length>=1);
    assert.ok(diorama.owned(0,'building','wall').length>=12);
    assert.ok(diorama.owned(0,'building','gate').length>=1);
    assert.ok(diorama.owned(0,'building','tower').length>=2);

    const html=landingMarkup(null,{menuBackdrop:'artwork'});
    assert.match(html,/data-action="toggle-menu-backdrop"/);
    assert.match(html,/14 handcrafted chapters/);
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

    // Bastion uses natural cliffs + short connecting walls + keeps wood, gold, stone & berries safely INSIDE!
    const arena=new Simulation({mode:'skirmish',map:'bastion',seed:2026});
    const tc=arena.owned(0,'building','towncenter')[0];
    assert.ok(arena.barriers.length>=25,'Bastion cradles bases in natural cliffs & mountains');
    assert.ok(arena.owned(0,'building','gate').length>=1,'Bastion seals valley mouths with gates');
    assert.ok(arena.owned(0,'building','wall').length>=4,'Bastion ties short stone walls into cliffs');
    for(const rType of ['wood','gold','stone','food']){
      assert.ok(arena.entities.some(e=>e.hp>0&&e.kind==='resource'&&e.type===rType&&Math.hypot(e.x-tc.x,e.z-tc.z)<24),`Bastion protects inner ${rType} inside the cliff-and-wall perimeter`);
    }
  });

  it('gives classic chapters (I-X) cliff-anchored fortifications and chokepoints',()=>{
    const ch3=new Simulation({mode:'campaign3',difficulty:'story'});
    assert.ok(ch3.barriers.length>=8&&ch3.owned(0,'building','gate').length>=2,'Ch.3 ties short stone walls & gates into Iron Ridge cliffs');
    const ch7=new Simulation({mode:'campaign7',difficulty:'story'});
    assert.ok(ch7.barriers.length>=12,'Ch.7 volcanic pass has basalt cliff barriers');
    const ch9=new Simulation({mode:'campaign9',difficulty:'story'});
    assert.ok(ch9.barriers.length>=15&&ch9.owned(0,'building','gate').length>=2,'Ch.9 starts in a snow-cliff fortified winter valley');
    const ch10=new Simulation({mode:'campaign10',difficulty:'story'});
    assert.ok(ch10.owned(1,'building','keep').length>=1&&ch10.barriers.length>=20,'Ch.10 uses mountain-ringed staging & summit fortresses');
  });

  it('runs Act IV Chapter XI (Ring of Iron) with spacious cliff-and-wall basin, safe inner resources & arriving Western Relief',()=>{
    const sim=new Simulation({mode:'campaign11',difficulty:'story'});
    sim.tickCustomAI=()=>{};
    assert.equal(sim.worldSize,240);
    assert.equal(sim.players.length,4);
    assert.ok(sim.owned(0,'building','keep').length>=1,'starts with Castle Keep');
    assert.ok(sim.owned(0,'building','gate').length>=4,'4 short cliff-anchored Gatehouse passes');
    assert.ok(sim.barriers.filter(b=>b.kind==='mountain').length>=8,'mountain crags anchor every citadel gate pass');
    // Verify ALL 4 resource types sit safely INSIDE the 40m fortified highland basin!
    for(const rType of ['wood','gold','stone','food']){
      assert.ok(sim.entities.some(e=>e.hp>0&&e.kind==='resource'&&e.type===rType&&Math.hypot(e.x,e.z)<38),`Ch.11 protects ${rType} safely INSIDE the fortified valley walls`);
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

  it('runs Act IV Chapter XIV (Crown of Three Kingdoms): grand 2v2 coalition war with spacious cliff-fortified citadels',()=>{
    const sim=new Simulation({mode:'campaign14',difficulty:'story'});
    sim.tickCustomAI=()=>{};
    assert.equal(sim.worldSize,240);
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
