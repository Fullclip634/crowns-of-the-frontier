import path from 'node:path';

export const MODEL_GZIP_DIR='.model-gzip';

export function modelGzipName(file){
  return MODEL_GZIP_DIR+'/'+path.basename(file)+'.gz';
}

export function acceptsGzip(header){
  const weights=new Map();
  for(const entry of String(header||'').split(',')){
    const [name,...parameters]=entry.trim().toLowerCase().split(';');
    const coding=name.trim();
    if(coding!=='gzip'&&coding!=='identity'&&coding!=='*')continue;
    const weight=parameters.find(parameter=>/^\s*q\s*=/.test(parameter));
    const quality=weight===undefined?1:Number(weight.slice(weight.indexOf('=')+1).trim());
    weights.set(coding,quality>=0&&quality<=1?quality:0);
  }
  const gzip=weights.get('gzip')??weights.get('*')??0;
  return gzip>0&&gzip>=(weights.get('identity')??0);
}
