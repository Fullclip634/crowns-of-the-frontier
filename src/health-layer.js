// Pools world-space health bar DOM nodes by entity ID so large skirmishes never
// rebuild `#health-layer` markup or trigger full layout thrashing on HUD ticks.
const pools = new WeakMap();

export function renderHealthBars(layer, sim, view, viewport = {width: innerWidth, height: innerHeight}){
  if(!layer||!sim||!view)return;
  let active=pools.get(layer);
  if(!active){active=new Map();pools.set(layer,active);}
  const used=new Set();
  for(const e of sim.entities){
    if(e.hp<=0||e.kind==='resource'||e.kind==='shrine'||(!view.selection.has(e.id)&&e.hp>=e.maxHp&&e.progress!==undefined&&e.progress>=1)||e.owner!==0&&!sim.isVisible(e.x,e.z))continue;
    if(!view.selection.has(e.id)&&e.kind==='unit'&&e.hp>=e.maxHp)continue;
    const p=view.project(e);
    if(!p.visible||p.x<=18||p.x>=viewport.width-18||p.y<=50||p.y>=viewport.height-100)continue;
    used.add(e.id);
    let entry=active.get(e.id);
    if(!entry){
      const root=layer.ownerDocument.createElement('div');
      const bar=layer.ownerDocument.createElement('i');
      const label=layer.ownerDocument.createElement('small');
      root.style.left='0px';
      root.style.top='0px';
      root.append(bar,label);
      layer.append(root);
      entry={root,bar,label,rival:null,width:'',progress:'',x:'',y:''};
      active.set(e.id,entry);
    }
    const rival=sim.hostile(0,e.owner);
    if(entry.rival!==rival){entry.rival=rival;entry.root.className=rival?'world-health rival':'world-health';}
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
  }
  for(const [id,entry] of active){
    if(used.has(id))continue;
    entry.root.remove();
    active.delete(id);
  }
}
