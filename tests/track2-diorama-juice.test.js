import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {shouldRunMenuDiorama,createMenuDioramaSim,MenuDioramaController} from '../src/menu-diorama.js';
import {WorldView} from '../src/world.js';

describe('Track 2: Live 3D Menu Diorama & Zero-Bloat Battlefield VFX Juice',()=>{
  it('enables 3D Menu Diorama only on capable non-low non-reduced-motion devices',()=>{
    assert.equal(shouldRunMenuDiorama({settings:{quality:'high',reducedMotion:false},modestDevice:false,hasView:true}),true);
    assert.equal(shouldRunMenuDiorama({settings:{quality:'medium',reducedMotion:false},modestDevice:false,hasView:true}),true);
    assert.equal(shouldRunMenuDiorama({settings:{quality:'low',reducedMotion:false},modestDevice:false,hasView:true}),false,'Performance preset keeps instant static poster');
    assert.equal(shouldRunMenuDiorama({settings:{quality:'high',reducedMotion:true},modestDevice:false,hasView:true}),false,'Reduced motion keeps static poster');
    assert.equal(shouldRunMenuDiorama({settings:{quality:'high',reducedMotion:false},modestDevice:true,hasView:true}),false,'Modest low-RAM devices keep static poster');
    assert.equal(shouldRunMenuDiorama({settings:{quality:'high',reducedMotion:false},modestDevice:false,hasView:false}),false);
  });

  it('builds a peaceful Castle-Age diorama village with 0 AI ticks and cleans up immediately on stop',()=>{
    const sim=createMenuDioramaSim();
    assert.equal(sim.players[0].age,2,'diorama shows rich Castle Age village');
    assert.ok(sim.owned(0,'building').length>=6,'has bustling village buildings');
    assert.ok(sim.owned(0,'unit').length>=5,'has villagers and scenic patrol');

    const ctrl=new MenuDioramaController();
    const calls={attach:0,render:0};
    const fakeView={
      angle:0,tilt:0,zoom:40,graphicsFatal:null,graphicsLoading:false,
      attach(s){this.sim=s;calls.attach++;},
      focus(){},
      updateCamera(){},
      render(dt,menu){calls.render++;assert.equal(menu,true);return true;},
    };
    const classes=new Set(['world-poster']);
    const fakeWorldEl={classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)}};

    assert.equal(ctrl.start(fakeView,fakeWorldEl,{quality:'high',reducedMotion:false},false),true);
    assert.equal(calls.attach,1);
    // Capped at 30 FPS (first tick renders, tick 10ms later skipped, tick 40ms later renders)
    const prevDoc=globalThis.document;
    globalThis.document={hidden:false};
    try{
      assert.equal(ctrl.tick(fakeView,fakeWorldEl,.016,100,false),true);
      assert.equal(classes.has('world-poster'),false,'reveals live 3D canvas after first clean frame');
      assert.equal(ctrl.tick(fakeView,fakeWorldEl,.010,110,false),false,'respects 30 FPS menu cap');
      assert.equal(ctrl.tick(fakeView,fakeWorldEl,.040,150,false),true);
      assert.equal(ctrl.tick(fakeView,fakeWorldEl,.040,200,true),false,'pauses diorama while modal is open');
    }finally{globalThis.document=prevDoc;}

    ctrl.stop(fakeWorldEl);
    assert.equal(ctrl.active,false);
    assert.equal(ctrl.sim,null,'releases diorama simulation immediately when match begins');
    assert.equal(classes.has('world-poster'),true);
  });

  it('celebrateBuild and celebrateAgeUp reuse pooled sparks & dust and obey reducedMotion',()=>{
    const emitted=[];
    const fakeView={
      settings:{quality:'high',reducedMotion:false},
      sim:{isVisible:()=>true},
      groundHeight:()=>0,
      sparks(...args){emitted.push(['sparks',...args]);},
      dust(...args){emitted.push(['dust',...args]);},
    };
    WorldView.prototype.celebrateBuild.call(fakeView,{owner:0,x:10,z:12,r:2.6});
    assert.equal(emitted.length,2,'spawns pooled sparks + dust on completion');
    assert.equal(emitted[0][0],'sparks');
    assert.equal(emitted[1][0],'dust');

    emitted.length=0;
    WorldView.prototype.celebrateAgeUp.call(fakeView,{owner:0,x:0,z:0,r:3.5});
    assert.equal(emitted.length,2,'spawns golden sparks + dust on age up');

    emitted.length=0;
    fakeView.settings.reducedMotion=true;
    WorldView.prototype.celebrateBuild.call(fakeView,{owner:0,x:10,z:12,r:2.6});
    WorldView.prototype.celebrateAgeUp.call(fakeView,{owner:0,x:0,z:0,r:3.5});
    assert.equal(emitted.length,0,'reducedMotion suppresses celebration particles');
  });
});
