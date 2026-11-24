import {projectileVisualEvents} from './projectile-combat.js';
import {prepareViewport,nearViewport} from './render-batches.js';
import {projectileTargetHeight} from './combat-timing.js';
import {witnessedEffect} from './battle-effects.js';

export function combatTime(view){
  const time=view.sim?.time||0;
  return Number.isFinite(view.combatTime)&&view.combatTime>=time&&view.combatTime<=time+.3?view.combatTime:time;
}

export function installCombatPresentation(WorldView){
  const p=WorldView.prototype,effect=p.effect,attach=p.attach,render=p.render;
  p.effect=function(event){
    if(event.pendingImpact){
      const age=Math.max(event.flightAge||0,combatTime(this)-event.releasedAt);if(age>=event.flightDuration)return;
      const seen=this.projectileSeen??=new Map(),key=`${event.projectile}:${event.garrisonArrow||0}`;
      if(seen.has(key))return;
      prepareViewport(this);const a=event.entity,b=event.target,radius=Math.hypot(a.x-b.x,a.z-b.z)*.5+12;
      if(!nearViewport(this,(a.x+b.x)*.5,this.entityHeight(a)+3,(a.z+b.z)*.5,radius))return;
      const before=this.fx.length,result=effect.call(this,{...event,flightAge:Math.max(0,age)});
      if(this.fx.length>before)seen.set(key,event.releasedAt+event.flightDuration+.5);return result;
    }
    if(event.type==='projectile-impact'){
      const point=event.target;if(!point||!witnessedEffect(this,point))return;
      prepareViewport(this);if(!nearViewport(this,point.x,this.entityHeight(point)+1,point.z,5))return;
      const before=this.fx.length,gy=this.entityHeight(point);
      this.burst(point.x,point.z,event.fireball?0xff7a22:event.siege?0xb5aa95:event.flaming?0xffa438:point.kind==='building'?0xc3a17a:0xd9d7bd,event.fireball?2.35:event.siege?1.6:event.flaming?.55:.24);
      if(event.fireball){this.sparks?.(point.x,gy+.6,point.z,0xffa634,2.1);this.smoke?.(point.x,gy+.7,point.z,1.75);this.crater?.(point.x,point.z,2.5,5.5);}
      else if(event.siege){this.sparks?.(point.x,gy+.4,point.z,0xffd68a,1.2);this.crater?.(point.x,point.z,1.6);}
      else if(event.flaming){this.sparks?.(point.x,gy+.8,point.z,0xff9e38,.7);}
      for(let i=before;i<this.fx.length;i++)if(!this.fx[i].crater)this.fx[i].object.position.y=gy+projectileTargetHeight(point,event.siege);
      return;
    }
    return effect.call(this,event);
  };
  p.syncCombatProjectiles=function(){
    const time=combatTime(this),seen=this.projectileSeen??=new Map();
    for(const [key,expiry]of seen)if(expiry<time)seen.delete(key);
    const source=this.sim?.options.multiplayer?this.sim.visualProjectiles:this.sim?.projectiles;
    const camera=[this.target?.x,this.target?.z,this.zoom,this.angle,this.tilt,this.camera?.aspect].join(':');
    if(this.projectileSyncSource===source&&this.projectileSyncTime===this.sim?.time&&this.projectileSyncCamera===camera)return;
    this.projectileSyncSource=source;this.projectileSyncTime=this.sim?.time;this.projectileSyncCamera=camera;
    const events=this.sim?.options.multiplayer?this.sim.visualProjectiles||[]:projectileVisualEvents(this.sim?.projectiles,this.sim?.time||0);
    for(const event of events)this.effect(event);
  };
  p.attach=function(sim){this.projectileSeen=new Map();this.projectileSyncSource=null;this.projectileSyncTime=NaN;this.combatTime=sim.time;return attach.call(this,sim);};
  p.render=function(dt,menu){if(this.sim)this.syncCombatProjectiles();return render.call(this,dt,menu);};
}
