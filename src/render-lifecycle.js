// Navigation must release GPU contexts before the next document loads its art.
// Cached back/forward documents keep their live renderer and resume normally.
export function releaseRenderers(view){
  if(!view||view.renderingReleased)return false;
  view.renderingReleased=true;
  view.releaseRendererWatch?.();
  view.impactEffects?.dispose();
  const renderers=new Set([view.renderer,view.modelPortrait?.renderer].filter(Boolean));
  for(const renderer of renderers){renderer.dispose();renderer.forceContextLoss?.();}
  return true;
}
