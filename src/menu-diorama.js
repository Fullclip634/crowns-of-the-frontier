import {Simulation} from './simulation.js';

/**
 * Decides whether to run the live 3D Main Menu Diorama.
 * Automatically preserves the instant static key-art poster on modest/low-RAM devices,
 * Performance (low) preset, Reduced Motion, or when the player chooses Painted Key Art.
 */
export function shouldRunMenuDiorama({settings,modestDevice=false,hasView=true}={}){
  if(!hasView||!settings)return false;
  if(settings.menuBackdrop==='artwork')return false;
  if(settings.menuBackdrop==='diorama')return true;
  if(modestDevice)return false;
  if(settings.quality==='low')return false;
  if(settings.reducedMotion)return false;
  return true;
}

/**
 * Builds a grand walled Castle-Age medieval Citadel for the Live 3D Main Menu backdrop.
 * Zero AI opponent overhead (`tickAI` disabled); features stone walls, gatehouses,
 * a towering Keep, watchtowers, bustling farms, and patrolling knights & garrison troops.
 */
export function createMenuDioramaSim(){
  const sim=new Simulation({mode:'sandbox',faction:'alder',map:'valley',seed:2026});
  sim.tickAI=()=>{};
  sim.players[0].age=2;
  const tc=sim.owned(0,'building','towncenter')[0];
  if(tc){
    const layout=[
      ['keep',-9,-8],
      ['tower',13,-9],
      ['tower',-14,6],
      ['tower',12,11],
      ['mill',-9,-1],
      ['house',8,-6],
      ['house',10,2],
      ['barracks',-8,8],
      ['stable',2,11],
      ['blacksmith',-1,12],
      ['market',5,-12],
      ['monastery',-13,-1],
      ['farm',-15,-9],
      ['farm',-6,-14],
    ];
    for(const [type,dx,dz] of layout){
      const x=tc.x+dx,z=tc.z+dz;
      if(!sim.isWater(x,z))sim.addBuilding(type,0,x,z,true);
    }
    // Stone curtain wall & gatehouses framing the citadel perimeter
    const wallPerimeter=[
      [-17,-12], [-14,-13], [-11,-14], [-8,-15], [-4,-15], [4,-15], [8,-15], [11,-14], [14,-12],
      [16,-9], [16,-5], [16,-1], [16,3], [16,7], [15,11],
      [-17,-8], [-17,-4], [-17,0], [-17,4], [-16,9], [-13,13], [-9,15], [-5,16], [5,16], [9,15], [13,13],
    ];
    for(const [dx,dz] of wallPerimeter){
      const x=tc.x+dx,z=tc.z+dz;
      if(!sim.isWater(x,z))sim.addBuilding('wall',0,x,z,true);
    }
    for(const [dx,dz] of [[0,-15],[0,16]]){
      const x=tc.x+dx,z=tc.z+dz;
      if(!sim.isWater(x,z))sim.addBuilding('gate',0,x,z,true);
    }
    // Scenic royal garrison patrols (Knights, Men-at-Arms, Archers & Spearmen)
    const knight1=sim.addUnit('knight',0,tc.x+6,tc.z+6);
    const knight2=sim.addUnit('knight',0,tc.x+4,tc.z+8);
    const spear1=sim.addUnit('spearman',0,tc.x-5,tc.z+9);
    const spear2=sim.addUnit('spearman',0,tc.x-3,tc.z+10);
    const sword1=sim.addUnit('swordsman',0,tc.x+2,tc.z-10);
    const archer1=sim.addUnit('archer',0,tc.x-6,tc.z-11);
    const archer2=sim.addUnit('archer',0,tc.x+8,tc.z-10);
    if(knight1&&knight2)sim.patrol([knight1.id,knight2.id],tc.x-6,tc.z-12,false);
    if(spear1&&spear2)sim.patrol([spear1.id,spear2.id],tc.x+11,tc.z+8,false);
    if(sword1)sim.patrol([sword1.id],tc.x-10,tc.z+5,false);
    if(archer1&&archer2)sim.patrol([archer1.id,archer2.id],tc.x+12,tc.z-4,false);
    // Assign starting villagers so they chop, farm, and haul goods peacefully
    for(const v of sim.owned(0,'unit','villager'))sim.assignWorker(v);
  }
  return sim;
}

/**
 * Lightweight 30-FPS Main Menu 3D diorama controller.
 * Shares the single WorldView renderer (0 extra WebGL/WebGPU contexts) and
 * releases its scenic Simulation immediately when a real battle begins.
 */
export class MenuDioramaController {
  constructor(){
    this.active=false;
    this.sim=null;
    this.lastRender=0;
    this.stepAccum=0;
    this.revealed=false;
  }

  start(view,worldEl,settings,modestDevice=false){
    if(!shouldRunMenuDiorama({settings,modestDevice,hasView:Boolean(view)})){
      this.stop(worldEl);
      return false;
    }
    if(this.active&&this.sim&&view.sim===this.sim)return true;
    try{
      const sim=createMenuDioramaSim();
      this.sim=sim;
      this.active=true;
      this.revealed=false;
      this.lastRender=0;
      this.stepAccum=0;
      view.attach(sim);
      const tc=sim.owned(0,'building','towncenter')[0];
      // Offset camera target slightly left so the grand walled citadel shines on the open right 60% of the Hero Menu
      const focusX=(tc?.x||0)-6,focusZ=(tc?.z||0)+2;
      view.angle=Math.PI*.30;
      view.tilt=.56;
      view.zoom=42;
      view.focus(focusX,focusZ);
      view.updateCamera();
      return true;
    }catch{
      this.stop(worldEl);
      return false;
    }
  }

  tick(view,worldEl,dt,now,pausedByModal=false){
    if(!this.active||!this.sim||!view||view.graphicsFatal||view.graphicsLoading)return false;
    if(pausedByModal||document.hidden)return false;
    // Strictly capped at 30 FPS on the landing screen to keep GPU cool and responsive
    if(now-this.lastRender<33.3)return false;
    const frameDt=this.lastRender?Math.min(.1,Math.max(.016,(now-this.lastRender)/1000)):dt;
    this.lastRender=now;
    this.stepAccum+=frameDt*.6;
    if(this.stepAccum>=.1){
      this.sim.tick(.1);
      this.stepAccum=Math.min(this.stepAccum-.1,.1);
    }
    view.angle+=frameDt*.042;
    view.updateCamera();
    if(view.render(frameDt,true)!==false&&!this.revealed){
      this.revealed=true;
      worldEl?.classList.remove('world-poster');
    }
    return true;
  }

  stop(worldEl){
    this.active=false;
    this.sim=null;
    this.revealed=false;
    this.stepAccum=0;
    if(worldEl)worldEl.classList.add('world-poster');
  }
}
