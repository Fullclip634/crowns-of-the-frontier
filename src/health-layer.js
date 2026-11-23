import {entityBarRatio} from './entity-inspector.js';
import {GARRISONS,garrisonCount} from './garrison.js';

// Pools world-space health & stock bar DOM nodes by entity ID so large skirmishes never
// rebuild `#health-layer` markup or trigger full layout thrashing on HUD ticks.
const pools = new WeakMap();

function visitHealthEntities(sim, view, visitor){
  const seen=new Set();
  const emit=e=>{if(!e||seen.has(e.id))return;seen.add(e.id);visitor(e);};
  if(typeof sim.candidatesFor==='function'){
    for(const e of sim.candidatesFor('unit'))emit(e);
    for(const e of sim.candidatesFor('building'))emit(e);
  }else{
    for(const e of sim.entities)if(e.kind==='unit'||e.kind==='building')emit(e);
  }
  if(view.selection?.size){
    for(const id of view.selection){
      const e=sim.resourceMemory?.get(id)??(typeof sim.get==='function'?sim.get(id):sim.entities?.find(item=>item.id===id));
      if(e&&(e.kind==='resource'||e.kind==='shrine'))emit(e);
    }
  }
}

const FORTIFIED_BUILDINGS=new Set(['keep','tower','wall','gate','towncenter']);

export function entityArmorTier(sim,e){
  if(!e)return 0;
  if(e.kind==='unit'){
    const armor=typeof sim?.unitArmor==='function'?sim.unitArmor(e):(e.armor||0);
    if(armor>=6)return 3;
    if(armor>=3)return 2;
    if(armor>=1)return 1;
    return 0;
  }
  if(e.kind==='building'&&e.progress>=1&&FORTIFIED_BUILDINGS.has(e.type)){
    if(e.type==='keep')return 3;
    if((e.type==='wall'||e.type==='gate')&&sim?.players?.[e.owner]?.tech?.fortification)return 3;
    return 2;
  }
  return 0;
}

export function renderHealthBars(layer, sim, view, viewport = {width: innerWidth, height: innerHeight}){
  if(!layer||!sim||!view)return;
  let state=pools.get(layer);
  if(!state){state={active:new Map(),stamp:0};pools.set(layer,state);}
  const active=state.active,stamp=++state.stamp;
  // Reuse WorldView's cached canvas rect between resizes to avoid per-frame
  // layout flushes; views without an opt-in cache still measure once per call.
  let rect=view.canvasRect;
  if(!rect||rect.width<=0||rect.height<=0){
    rect=view.renderer?.domElement?.getBoundingClientRect?.();
    if(view.canvasRect===null&&rect&&rect.width>0&&rect.height>0)view.canvasRect=rect;
  }
  visitHealthEntities(sim, view, e=>{
    const isResource=e.kind==='resource',isShrine=e.kind==='shrine',isSelected=!!view.selection?.has(e.id);
    if(isResource||isShrine){
      if(!isSelected||e.hp<=0)return;
      if(isResource&&!sim.isVisible?.(e.x,e.z)&&!sim.isExplored?.(e.x,e.z))return;
    }else{
      if(e.hp<=0||e.embarked||(!isSelected&&e.hp>=e.maxHp&&e.progress!==undefined&&e.progress>=1)||e.owner!==0&&!sim.isVisible(e.x,e.z))return;
      if(!isSelected&&e.kind==='unit'&&e.hp>=e.maxHp)return;
    }
    const p=rect?view.project(e,rect):view.project(e);
    if(!p.visible||p.x<=18||p.x>=viewport.width-18||p.y<=50||p.y>=viewport.height-100)return;
    let entry=active.get(e.id);
    if(!entry){
      const root=layer.ownerDocument.createElement('div');
      const bar=layer.ownerDocument.createElement('i');
      const label=layer.ownerDocument.createElement('small');
      const armor=layer.ownerDocument.createElement('span');
      armor.className='armor-pips';
      armor.hidden=true;
      root.style.left='0px';
      root.style.top='0px';
      root.append(bar,label,armor);
      layer.append(root);
      entry={root,bar,label,armor,cls:'',width:'',progress:'',armorTier:0,x:'',y:'',stamp:0};
      active.set(e.id,entry);
    }
    entry.stamp=stamp;
    const rival=!isResource&&e.owner>=0&&sim.hostile(0,e.owner);
    const ally=!isResource&&!rival&&e.owner>0&&sim.allied?.(0,e.owner);
    const isBuilding=e.kind==='building';
    const ratio=isResource||isShrine?entityBarRatio(e):Math.max(0,Math.min(1,e.hp/e.maxHp));
    const tier=isResource||isShrine?0:entityArmorTier(sim,e);
    const cls=`world-health${rival?' rival':ally?' ally':''}${isResource?' resource':isShrine?' shrine':''}${isBuilding?' building':''}${isSelected?' selected':''}${!isResource&&!isShrine?(ratio<=.35?' low':ratio<=.65?' mid':''):''}${tier?` armored tier-${tier}`:''}`;
    if(entry.cls!==cls){entry.cls=cls;entry.root.className=cls;}
    const x=`${p.x.toFixed(1)}px`,y=`${p.y.toFixed(1)}px`;
    if(entry.x!==x||entry.y!==y){
      entry.x=x;entry.y=y;
      entry.root.style.transform=`translate3d(${x},${y},0) translate(-50%,-50%)`;
    }
    const width=`${(ratio*100).toFixed(1)}%`;
    if(entry.width!==width){entry.width=width;entry.bar.style.width=width;}
    let progress='';
    if(isBuilding&&e.progress<1){
      progress=`${Math.floor(e.progress*100)}%`;
    }else if(isResource){
      progress=`${Math.max(0,Math.round(e.amount||0))}`;
    }else if(isShrine){
      progress=e.owner>=0?(e.owner===0?'Held':rival?'Enemy':'Ally'):(e.progress>0?`${Math.round(ratio*100)}%`:'Neutral');
    }else if(isSelected&&!rival&&isBuilding&&GARRISONS[e.type]){
      const inside=garrisonCount(sim,e);
      if(inside>0)progress=`${inside}/${GARRISONS[e.type].capacity}`;
    }else if(isSelected&&!rival&&e.type==='transport'&&e.passengers?.length){
      progress=`${e.passengers.length}/8`;
    }
    if(entry.progress!==progress){
      entry.progress=progress;
      entry.label.textContent=progress;
      entry.label.hidden=!progress;
    }
    if(entry.armorTier!==tier){
      entry.armorTier=tier;
      entry.armor.className=tier?`armor-pips tier-${tier}`:'armor-pips';
      entry.armor.hidden=!tier;
      entry.armor.textContent=tier?'◆'.repeat(tier):'';
    }
  });
  for(const [id,entry] of active){
    if(entry.stamp===stamp)continue;
    entry.root.remove();
    active.delete(id);
  }
}
