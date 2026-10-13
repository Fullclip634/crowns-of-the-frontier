import fs from 'node:fs';
import {chromium} from '@playwright/test';

const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const page=await browser.newPage();
  const frames=['before','after'].map(name=>`data:image/png;base64,${fs.readFileSync(`artifacts/rig-high-${name}.png`).toString('base64')}`);
  const result=await page.evaluate(async sources=>{
    const images=await Promise.all(sources.map(src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src;})));
    const width=images[0].width,height=images[0].height,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(images[0],0,0);const first=ctx.getImageData(0,0,width,height);
    ctx.clearRect(0,0,width,height);ctx.drawImage(images[1],0,0);const second=ctx.getImageData(0,0,width,height),diff=ctx.createImageData(width,height);
    let changed=0,redder=0,darker=0;
    for(let i=0;i<diff.data.length;i+=4){const delta=Math.max(...[0,1,2].map(c=>Math.abs(first.data[i+c]-second.data[i+c])));if(delta){changed++;const brightness=[0,1,2].reduce((sum,c)=>sum+second.data[i+c]-first.data[i+c],0);if(brightness>0)redder++;else darker++;}diff.data[i]=Math.min(255,delta*8);diff.data[i+1]=delta?24:0;diff.data[i+2]=delta?16:0;diff.data[i+3]=255;}
    ctx.putImageData(diff,0,0);return {png:canvas.toDataURL('image/png'),width,height,changed,redder,darker};
  },frames);
  fs.writeFileSync('artifacts/rig-high-diff.png',Buffer.from(result.png.split(',')[1],'base64'));
  console.log(JSON.stringify({width:result.width,height:result.height,changed:result.changed,brighter:result.redder,darker:result.darker}));
}finally{await browser.close();}
