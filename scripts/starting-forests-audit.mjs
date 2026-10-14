import fs from 'node:fs';
import {Simulation} from '../src/simulation.js';
import {battlePreset} from '../src/custom-battle.js';
import {forestSettlements,forestEntrances} from '../src/starting-forests.js';

const results=[];
for(const map of ['highlands','desert','winter','canyon','valley','rivers','coast']) {
  for(const mapSize of ['spacious','large','huge']) {
    const sim=new Simulation({mode:'custom',map,mapSize,slots:battlePreset('4v4'),seed:512});
    for(const base of forestSettlements(sim)) {
      const scout=sim.owned(base.owner,'unit','scout')[0],trees=sim.entities.filter(e=>e.startForest===base.owner);
      const entrances=forestEntrances(sim,base).map(dir=>{
        const point={x:base.x+dir.x*37,z:base.z+dir.z*37};
        if(sim.isWater(point.x,point.z))return 'water';
        sim.pathTo(scout,point);return scout.pathStatus;
      });
      const grid=sim.grid(base.owner),neighbors=trees.filter(tree=>[[2,0],[-2,0],[0,2],[0,-2]].some(([dx,dz])=>{
        const cell=sim.cell(tree.x+dx,tree.z+dz);return grid[cell.z*sim.gridSize+cell.x];
      })).length;
      results.push({map,mapSize,owner:base.owner,trees:trees.length,neighbors,entrances});
    }
  }
}
fs.writeFileSync('artifacts/starting-forests-audit.json',JSON.stringify(results,null,2));
console.log(JSON.stringify({bases:results.length,minTrees:Math.min(...results.map(r=>r.trees)),maxTrees:Math.max(...results.map(r=>r.trees)),blocked:results.filter(r=>r.entrances.includes('blocked'))},null,2));
