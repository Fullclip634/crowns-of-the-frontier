export const FRAME_RATES={auto:'Automatic · 60 FPS desktop / 30 FPS touch',60:'60 FPS · smoother motion',30:'30 FPS · lower power use'};
export function normalizeFrameRate(value){return Object.hasOwn(FRAME_RATES,String(value))?String(value):'auto';}
export function targetFrameRate(settings,touch=globalThis.matchMedia?.('(pointer: coarse)').matches||false){
  const value=normalizeFrameRate(settings.frameRate);return value==='auto'?(touch?30:60):Number(value);
}

// Keep a deadline instead of rounding every frame's elapsed time. Otherwise a
// 16.6 ms display tick can miss a 16.67 ms threshold and silently halve 60 FPS.
export class FramePacer{
  due(now,interval){
    if(this.interval!==interval||now<(this.lastNow??-Infinity)){this.interval=interval;this.next=now;}
    this.lastNow=now;if(now+.5<this.next)return false;
    this.next+=interval;if(this.next<now)this.next=now+interval;
    return true;
  }
}
