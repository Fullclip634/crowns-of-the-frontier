import {UNITS,BUILDINGS} from './data.js';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export const projectileWeapon=entity=>entity.kind==='building'?(BUILDINGS[entity.type]?.damage||0)>0:(UNITS[entity.type]?.damage||0)>0&&(UNITS[entity.type]?.range||0)>5;
export const siegeProjectile=entity=>['catapult','warship'].includes(entity.type);
export const attackInterval=entity=>entity.kind==='building'?1.6:UNITS[entity.type]?.cooldown||1.2;
export const releaseDelay=entity=>entity.kind==='building'?0:entity.type==='catapult'?.35:entity.type==='warship'?.18:.14;
export function flightDuration(entity,distance){return siegeProjectile(entity)?clamp(distance/30,.45,1.4):clamp(distance/34,.14,.65);}
export function siegeArmAngle(entity,offset=0){return entity.cooldown>0?Math.sin(clamp((attackInterval(entity)-entity.cooldown+offset)/.7,0,1)*Math.PI)*1.15:0;}
export function combatRenderOffset(view){return clamp((view.combatTime??view.sim?.time??0)-(view.sim?.time??0),0,.2);}
const buildingHeight=type=>({tower:6.2,keep:7.5,towncenter:5.8,wall:2.4,gate:3.8}[type]||2.6);
export function projectileTargetHeight(target,siege=false){return siege?.25:target.kind==='building'?Math.min(3.5,buildingHeight(target.type)*.6):UNITS[target.type]?.naval?1.15:1.35;}
