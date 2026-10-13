const blockedControls='button,a,input,select,textarea,label,[role="button"],#minimap,.bottom-hud,#build-panel,#production-panel,.camera-controls,.objective-panel.interactive-objectives';
const cursors=new Map();

function edgeVector(x,y,width,height){
  if(x<0||y<0||x>=width||y>=height)return{x:0,y:0};
  const band=Math.min(24,width/4,height/4);
  const strength=distance=>{const t=1-distance/band;return t*t*(3-2*t);};
  let dx=x<band?-strength(x):x>width-band?strength(width-x):0;
  let dy=y<band?-strength(y):y>height-band?strength(height-y):0;
  const length=Math.hypot(dx,dy);if(length>1){dx/=length;dy/=length;}
  return{x:dx,y:dy};
}
function arrowCursor(x,y){
  const sx=Math.sign(x),sy=Math.sign(y),key=`${sx}:${sy}`;
  if(!cursors.has(key)){
    const angle=Math.atan2(sx,-sy)*180/Math.PI;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="rotate(${angle} 16 16)"><path d="M16 2 6 14h6v14h8V14h6Z" fill="#f1d79b" stroke="#182d25" stroke-width="2" stroke-linejoin="round"/><path d="m16 6-5 6h4v12" fill="none" stroke="#fff5d9" stroke-width="1.4"/></g></svg>`;
    cursors.set(key,`url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, auto`);
  }
  return cursors.get(key);
}

export class EdgeScroll {
  constructor(){
    this.point=null;this.cursor='';
    const track=event=>{
      if(event.pointerType!=='mouse'){this.reset();return;}
      this.point={x:event.clientX,y:event.clientY,buttons:event.buttons};
    };
    // Track the whole viewport so the header/footer do not swallow an edge.
    document.addEventListener('pointermove',track,{passive:true});
    document.addEventListener('pointerdown',track,{passive:true});
    document.addEventListener('pointerup',track,{passive:true});
    document.documentElement.addEventListener('pointerleave',()=>this.reset());
    window.addEventListener('blur',()=>this.reset());window.addEventListener('resize',()=>this.reset());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.reset();});
  }
  setCursor(value){
    if(this.cursor===value)return;this.cursor=value;
    if(value)document.documentElement.style.setProperty('--battlefield-cursor',value);
    else document.documentElement.style.removeProperty('--battlefield-cursor');
  }
  reset(){this.point=null;this.setCursor('');}
  tick(view,dt,{active,enabled,speed=1}){
    if(!active||!enabled||!this.point||!document.hasFocus()||(this.point.buttons&4)){this.setCursor('');return false;}
    const {x,y}=edgeVector(this.point.x,this.point.y,innerWidth,innerHeight);
    if(!x&&!y){this.setCursor('');return false;}
    const element=document.elementFromPoint(this.point.x,this.point.y);
    if(!element||element.closest(blockedControls)){this.setCursor('');return false;}
    this.setCursor(arrowCursor(x,y));
    const distance=dt*view.zoom*.5*Math.max(.25,Math.min(2,Number(speed)||1));
    // pan() maps screen directions through the current camera rotation.
    view.pan(x*distance,y*distance);return true;
  }
}
