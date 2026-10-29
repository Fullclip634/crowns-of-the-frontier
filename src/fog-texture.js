export function updateFogTexture(view){
  const size=view.sim.gridSize,canvas=view.fogCanvas;
  let image=view.fogImage,changed=false;
  if(canvas.width!==size||canvas.height!==size){canvas.width=canvas.height=size;image=null;}
  if(!image||image.width!==size||image.height!==size){
    image=view.fogImage=view.fogCtx.createImageData(size,size);changed=true;
    for(let pixel=0;pixel<image.data.length;pixel+=4){image.data[pixel]=19;image.data[pixel+1]=32;image.data[pixel+2]=30;}
  }
  const {visible,explored}=view.sim,data=image.data;
  for(let cell=0;cell<size*size;cell++){
    const alpha=visible[cell]?0:explored[cell]?100:197,pixel=cell*4+3;
    if(data[pixel]!==alpha){data[pixel]=alpha;changed=true;}
  }
  if(changed){view.fogCtx.putImageData(image,0,0);view.fogTexture.needsUpdate=true;}
  return changed;
}
