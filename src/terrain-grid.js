// Spend more of the fixed terrain vertex budget on playable ground. The outer
// skirt keeps the same extent, with wider cells in the distant scenery.
export function terrainGridAxis(size,segments){
  return Float32Array.from({length:segments+1},(_,index)=>{
    const t=index/segments*2-1,a=Math.abs(t);
    return Math.sign(t)*size/2*(a<=.75?a/1.5:.5+(a-.75)*2);
  });
}

// Use the stored Float32 coordinates for the final interpolation, so picking,
// unit feet and foundations agree with the triangles actually sent to the GPU.
export function terrainGridCoordinate(value,grid){
  if(!grid.axis)return (value+grid.size/2)/grid.size*grid.segments;
  const half=grid.size/4,a=Math.abs(value),t=Math.sign(value)*(a<=half?a/half*.75:.75+(a-half)/half*.25);
  let index=Math.max(0,Math.min(grid.segments-1,Math.floor((t+1)*.5*grid.segments)));
  if(value<grid.axis[index]&&index>0)index--;
  else if(value>grid.axis[index+1]&&index<grid.segments-1)index++;
  return index+(value-grid.axis[index])/(grid.axis[index+1]-grid.axis[index]);
}
