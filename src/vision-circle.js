const circles=new Map();

// Vision radii are integer navigation cells. Cache each circle's row widths,
// then paint contiguous spans without repeating a distance test for every cell.
export function revealVisionCircle(visible,explored,size,x,z,radius){
  let spans=circles.get(radius);
  if(!spans){spans=new Int32Array(radius*2+1);for(let row=-radius;row<=radius;row++)spans[row+radius]=Math.floor(Math.sqrt(radius*radius-row*row));circles.set(radius,spans);}
  for(let row=Math.max(0,z-radius);row<=Math.min(size-1,z+radius);row++){
    const span=spans[row-z+radius],start=row*size+Math.max(0,x-span),end=row*size+Math.min(size,x+span+1);
    for(let cell=start;cell<end;cell++){visible[cell]=1;explored[cell]=1;}
  }
}
