// Inspect composited screenshots rather than a WebGL back buffer, which may
// legitimately be discarded after presentation. Exclude HUD pixels from the
// sample so that visible buttons cannot make an empty battlefield pass.
export async function battlefieldPixels(page,png){
  return page.evaluate(async base64=>{
    const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height).data,colors=new Set(),scale=canvas.width/innerWidth;
    let samples=0,sum=0,sum2=0;const field=frontier.view.renderer.domElement;
    for(let y=Math.floor(canvas.height*.38);y<canvas.height*.72;y+=3)for(let x=Math.floor(canvas.width*.2);x<canvas.width*.8;x+=3){if(document.elementFromPoint(x/scale,y/scale)!==field)continue;const i=(y*canvas.width+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2],value=(r+g+b)/3;colors.add((r<<16)|(g<<8)|b);sum+=value;sum2+=value*value;samples++;}
    const variance=samples?Math.max(0,sum2/samples-(sum/samples)**2):0;
    return {samples,colors:colors.size,luminanceVariance:variance,painted:samples>100&&colors.size>16&&variance>1};
  },png.toString('base64'));
}

export async function settleBattlefieldResize(page){
  await page.evaluate(async()=>{
    // setViewportSize can resolve before the window resize event clears the
    // drawing buffer. Wait for it before forcing the paused test's last draw.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    frontier.view.resize();await qaDraw();await new Promise(resolve=>requestAnimationFrame(resolve));await qaDraw();
  });
}

export async function capturePaintedBattlefield(page,file,{manual=false}={}){
  const deadline=Date.now()+20000;let png,pixels;
  do{if(manual)await settleBattlefieldResize(page);png=await page.screenshot({path:file});pixels=await battlefieldPixels(page,png);if(pixels.painted)return {png,pixels};await page.waitForTimeout(100);}while(Date.now()<deadline);
  throw new Error('Battlefield did not repaint after resize: '+JSON.stringify(pixels));
}
