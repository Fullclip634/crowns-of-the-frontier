export const SIMULATION_STEP=.1;

// Fixed simulation steps follow foreground elapsed time, independently of the
// capped camera/effect delta. Bound recovery work after a stall or at high speed
// so catching up cannot create an unbounded main-thread loop.
export class SimulationPacer{
  constructor(){this.reset();}
  reset(){this.accumulator=0;this.discardedSeconds=0;}
  advance(elapsed,speed=1){
    const seconds=Number.isFinite(elapsed)?Math.max(0,elapsed):0,scale=Number.isFinite(speed)&&speed>0?speed:1;
    const accepted=Math.min(.25,seconds),pending=this.accumulator+accepted*scale;
    this.discardedSeconds+=(seconds-accepted)*scale+Math.max(0,pending-.5);
    this.accumulator=Math.min(.5,pending);
    const steps=Math.min(3,Math.floor((this.accumulator+1e-9)/SIMULATION_STEP));
    this.accumulator=Math.max(0,this.accumulator-steps*SIMULATION_STEP);return steps;
  }
}
