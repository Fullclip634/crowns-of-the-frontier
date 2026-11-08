import path from 'node:path';

// Fixed project-owned destinations keep preview work away from the live roster.
export function artBuildPlan(project,args=[]){
  if(args.some(arg=>!['--stage','--resources-only','--pack-only'].includes(arg))||new Set(args).size!==args.length)throw new Error('Use --stage and optionally --resources-only or --pack-only.');
  const staged=args.includes('--stage'),resources=args.includes('--resources-only'),packOnly=args.includes('--pack-only');
  if(resources&&!staged)throw new Error('Resource previews require --stage; they are not a complete game catalogue.');
  // Packing settings can be iterated in about a minute against the raw export
  // that Blender already produced, instead of re-authoring every model.
  if(packOnly&&!staged)throw new Error('--pack-only needs --stage so it can reuse a candidate raw export.');
  const stage=staged?(resources?'resources':'full'):'';
  const candidate=path.join(project,'.tools','art-candidate',stage||'full');
  return {stage,resources,packOnly,sourceDirectory:resources?path.join(candidate,'source'):path.join(project,'.tools','art-source'),
    rawDirectory:staged?path.join(candidate,'raw'):path.join(project,'.tools','art-refined'),
    outputDirectory:staged?path.join(candidate,'optimized'):path.join(project,'src','assets3d')};
}
