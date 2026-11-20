// Pools world-space health bar DOM nodes by entity ID so large skirmishes never
// rebuild `#health-layer` markup or trigger full layout thrashing on HUD ticks.
const pools = new WeakMap();

function visitHealthEntities(sim, visitor){
  if(typeof sim.candidatesFor==='function'){
    for(const e of sim.candidatesFor('unit'))visitor(e);
    for(const e of sim.candidatesFor('building'))visitor(e);
    return;
  }
  for(const e of sim.entities)visitor(e);
}

export function renderHealthBars(layer, sim, view, viewport = {width: innerWidth, height: innerHeight}){
  if(!layer||!sim||!view)return;
  let state=pools.get(layer);
  if(!state){state={active:new Map(),stamp:0};pools.set(layer,state);}
  const active=state.active,stamp=++state.stamp;
  // Read the canvas rect once before writing any bar transforms so projection
  // never interleaves layout reads with DOM mutations (forced reflows).
  const rect=view.renderer?.domElement?.getBoundingClientRect?.();
  visitHealthEntities(sim, e=>{
    if(e.hp<=0||e.kind==='resource'||e.kind==='shrine'||(!view.selection.has(e.id)&&e.hp>=e.maxHp&&e.progress!==undefined&&e.progress>=1)||e.owner!==0&&!sim.isVisible(e.x,e.z))return;
    if(!view.selection.has(e.id)&&e.kind==='unit'&&e.hp>=e.maxHp)return;
    const p=rect?view.project(e,rect):view.project(e);
    if(!p.visible||p.x<=18||p.x>=viewport.width-18||p.y<=50||p.y>=viewport.height-100)return;
    let entry=active.get(e.id);
    if(!entry){
      const root=layer.ownerDocument.createElement('div');
      const bar=layer.ownerDocument.createElement('i');
      const label=layer.ownerDocument.createElement('small');
      root.style.left='0px';
      root.style.top='0px';
      root.append(bar,label);
      layer.append(root);
      entry={root,bar,label,cls:'',width:'',progress:'',x:'',y:'',stamp:0};
      active.set(e.id,entry);
    }
    entry.stamp=stamp;
    const rival=sim.hostile(0,e.owner),ratio=Math.max(0,Math.min(1,e.hp/e.maxHp)),isBuilding=e.kind==='building',isSelected=view.selection.has(e.id);
    const cls=`world-health${rival?' rival':''}${isBuilding?' building':''}${isSelected?' selected':''}${ratio<=.35?' low':ratio<=.65?' mid':''}`;
    if(entry.cls!==cls){entry.cls=cls;entry.root.className=cls;}
    const x=`${p.x.toFixed(1)}px`,y=`${p.y.toFixed(1)}px`;
    if(entry.x!==x||entry.y!==y){
      entry.x=x;entry.y=y;
      entry.root.style.transform=`translate3d(${x},${y},0) translate(-50%,-50%)`;
    }
    const width=`${Math.max(0,Math.min(100,e.hp/e.maxHp*100)).toFixed(1)}%`;
    if(entry.width!==width){entry.width=width;entry.bar.style.width=width;}
    const progress=e.kind==='building'&&e.progress<1?`${Math.floor(e.progress*100)}%`:'';
    if(entry.progress!==progress){
      entry.progress=progress;
      entry.label.textContent=progress;
      entry.label.hidden=!progress;
    }
  });
  for(const [id,entry] of active){
    if(entry.stamp===stamp)continue;
    entry.root.remove();
    active.delete(id);
  }
}
