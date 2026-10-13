import fs from 'node:fs';
import {Simulation} from '../src/simulation.js';
const sim=Simulation.restore(JSON.parse(fs.readFileSync(process.env.PROFILE_SAVE||'artifacts/blender-custom-battle-save.json','utf8'))),stats={};
const names=['get','nearest','pathTo','move','tickUnit','tickBuilding','tickAI','assignWorker','grid','canSee','updateFog','checkVictory'];
for(const name of names){const original=sim[name];if(typeof original!=='function')continue;stats[name]={calls:0,milliseconds:0};sim[name]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{stats[name].calls++;stats[name].milliseconds+=performance.now()-start;}};}
const ticks=Number(process.env.PROFILE_TICKS)||200,times=[];
for(let i=0;i<ticks&&!sim.ended;i++){const start=performance.now();sim.tick(.1);times.push(performance.now()-start);}
times.sort((a,b)=>a-b);
const result={ticks:times.length,units:sim.entities.filter(e=>e.kind==='unit'&&e.hp>0).length,totalMilliseconds:times.reduce((a,b)=>a+b,0),median:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],inclusiveMethods:Object.entries(stats).sort((a,b)=>b[1].milliseconds-a[1].milliseconds)};
fs.writeFileSync('artifacts/simulation-profile.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
