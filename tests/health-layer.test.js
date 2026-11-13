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
