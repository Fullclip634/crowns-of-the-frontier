import test from 'node:test';
import assert from 'node:assert/strict';
import {renderHealthBars} from '../src/health-layer.js';

function fakeLayer(){
  const children=[];
  const makeNode=()=>({
    className:'',
    style:{},
    textContent:'',
    hidden:false,
    children:[],
    append(...items){this.children.push(...items);},
    remove(){const i=children.indexOf(this);if(i>=0)children.splice(i,1);},
  });
  return {
    children,
    ownerDocument:{createElement:()=>makeNode()},
    append(...items){children.push(...items);},
  };
}

test('renderHealthBars pools existing DOM elements and removes dead or healed units cleanly',()=>{
  const layer=fakeLayer();
  const unit={id:7,kind:'unit',owner:0,x:0,z:0,hp:50,maxHp:100};
  const building={id:9,kind:'building',owner:1,x:5,z:0,hp:80,maxHp:200,progress:.5};
  const sim={entities:[unit,building],isVisible:()=>true,hostile:(a,b)=>a!==b};
  const view={selection:new Set(),project:e=>({x:e.id*20,y:120,visible:true})};

  renderHealthBars(layer,sim,view,{width:1000,height:700});
  assert.equal(layer.children.length,2);
  const firstUnitNode=layer.children[0];
  assert.equal(firstUnitNode.children[0].style.width,'50.0%');
  assert.equal(layer.children[1].children[1].textContent,'50%');

  unit.hp=25;
  renderHealthBars(layer,sim,view,{width:1000,height:700});
  assert.equal(layer.children.length,2);
  assert.equal(layer.children[0],firstUnitNode,'same unit reuses the pooled DOM element');
  assert.equal(firstUnitNode.children[0].style.width,'25.0%');

  unit.hp=0;
  renderHealthBars(layer,sim,view,{width:1000,height:700});
  assert.equal(layer.children.length,1,'dead entity bar is pruned cleanly');
});

test('renderHealthBars reads canvas bounds once per frame and uses candidatesFor when available',()=>{
  const layer=fakeLayer();
  const units=[
    {id:1,kind:'unit',owner:0,x:0,z:0,hp:40,maxHp:100},
    {id:2,kind:'unit',owner:0,x:4,z:0,hp:60,maxHp:100},
  ];
  const building={id:3,kind:'building',owner:0,x:8,z:0,hp:100,maxHp:200,progress:.5};
  let rectReads=0,entityScans=0,receivedRects=0;
  const rect={left:0,top:0,width:1280,height:720};
  const sim={
    get entities(){entityScans++;return [...units,building];},
    candidatesFor(kind){return kind==='unit'?units:kind==='building'?[building]:[];},
    isVisible:()=>true,hostile:(a,b)=>a!==b,
  };
  const view={
    selection:new Set(),
    renderer:{domElement:{getBoundingClientRect(){rectReads++;return rect;}}},
    project(e,passedRect){
      if(passedRect===rect)receivedRects++;
      return {x:e.id*50,y:120,visible:true};
    },
  };

  renderHealthBars(layer,sim,view,{width:1280,height:720});
  assert.equal(rectReads,1,'canvas layout rect is measured only once before DOM writes');
  assert.equal(receivedRects,3,'every projected entity receives the cached rect');
  assert.equal(entityScans,0,'skips scanning full sim.entities when candidatesFor is available');
  assert.equal(layer.children.length,3);
});
