import {Simulation} from './simulation.js';

/**
 * Decides whether to run the live 3D Main Menu Diorama.
 * Automatically preserves the instant static poster on modest/low-RAM devices,
 * Performance (low) preset, or Reduced Motion — guaranteeing zero menu lag.
 */
export function shouldRunMenuDiorama({settings,modestDevice=false,hasView=true}={}){
  if(!hasView||modestDevice)return false;
  if(!settings)return false;
  if(settings.quality==='low')return false;
  if(settings.reducedMotion)return false;
  return true;
}

/**
 * Builds a serene, peaceful Castle-Age Frontier village for the Main Menu backdrop.
 * Zero AI opponent overhead (`tickAI` disabled); purely decorative villagers & patrol.
 */
export function createMenuDioramaSim(){
  const sim=new Simulation({mode:'sandbox',faction:'alder',map:'valley',seed:2026});
  sim.tickAI=()=>{};
  sim.players[0].age=2;
  const tc=sim.owned(0,'building','towncenter')[0];
  if(tc){
    const layout=[
      ['mill',-9,-4],
      ['house',8,-6],
      ['house',10,3],
      ['barracks',-10,7],
      ['market',4,10],
      ['tower',14,-1],
      ['farm',-13,-9],
      ['farm',-6,-11],
    ];
    for(const [type,dx,dz] of layout){
      const x=tc.x+dx,z=tc.z+dz;
      if(!sim.isWater(x,z))sim.addBuilding(type,0,x,z,true);
    }
    // Gentle scenic garrison patrol around the village square
    const knight=sim.addUnit('knight',0,tc.x+6,tc.z+6);
    const spear1=sim.addUnit('spearman',0,tc.x-5,tc.z+9);
    const spear2=sim.addUnit('spearman',0,tc.x-3,tc.z+10);
    if(knight)sim.patrol([knight.id],tc.x-8,tc.z-8,false);
    if(spear1&&spear2)sim.patrol([spear1.id,spear2.id],tc.x+11,tc.z+8,false);
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
      // Offset camera target slightly left so the settlement shines on the open right 60% of the Hero Menu
      const focusX=(tc?.x||0)-5,focusZ=(tc?.z||0)+2;
      view.angle=Math.PI*.32;
      view.tilt=.62;
      view.zoom=34;
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
    view.angle+=frameDt*.048;
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
