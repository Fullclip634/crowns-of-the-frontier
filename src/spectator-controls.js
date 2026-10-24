const observerActions=new Set([
  'pause','close','save','menu','restart','settings','apply-settings','help','fullscreen',
  'camera-left','camera-right','camera-closer','camera-farther','camera-view','camera-panels','camera-options',
  'weather','home','army','idle','deselect','speed','objectives-expand','inspect','map-expand','dismiss-rotate',
  'copy-graphics-report','retry-battlefield','reload-battlefield','retry-graphics',
]);

export function isSpectatingAI(playing,sim){
  return !!(playing&&sim?.options.mode==='custom'&&sim.options.spectator&&!sim.options.multiplayer);
}

export function spectatorActionAllowed(name){return observerActions.has(name);}
