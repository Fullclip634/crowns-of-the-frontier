// One-shot, auditable transformation that removes sub-10px fixed font sizes.
// A 5px label is illegible at every device size and does not honour a user's
// preferred root font size. The floor uses rem so accessibility font settings
// and 125-200% browser zoom scale it, while clamp-like max() keeps the
// intended compact layout at default settings.
//   node scripts/raise-font-floor.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const directory=path.join(root,'src');
const FLOOR='font-size:max(.625rem,10px)';
const pattern=/font-size: *[0-9]px/g;
const check=process.argv.includes('--check');
let changed=0,total=0;
for(const file of fs.readdirSync(directory).filter(name=>name.endsWith('.css')).sort()){
  const target=path.join(directory,file),source=fs.readFileSync(target,'utf8');
  const matches=source.match(pattern)||[];total+=matches.length;
  const next=source.replace(pattern,FLOOR);
  if(next!==source){changed++;
    if(!check)fs.writeFileSync(target,next);
  }
}
const result={mode:check?'check':'apply',filesChanged:changed,declarationsRaised:total,floor:FLOOR};
console.log(JSON.stringify(result,null,2));
if(check&&total)process.exitCode=1;
