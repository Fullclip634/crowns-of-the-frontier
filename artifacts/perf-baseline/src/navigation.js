export class MinHeap {
  constructor(){this.items=[];}
  get size(){return this.items.length;}
  push(id,score){const item={id,score};let i=this.items.length;this.items.push(item);while(i>0){const parent=(i-1)>>1;if(this.items[parent].score<=score)break;this.items[i]=this.items[parent];i=parent;}this.items[i]=item;}
  pop(){if(!this.items.length)return null;const first=this.items[0],last=this.items.pop();if(this.items.length){let i=0;while(true){let child=i*2+1;if(child>=this.items.length)break;if(child+1<this.items.length&&this.items[child+1].score<this.items[child].score)child++;if(last.score<=this.items[child].score)break;this.items[i]=this.items[child];i=child;}this.items[i]=last;}return first.id;}
}

// Visit every crossed cell, including both neighbors at a diagonal corner.
// A clear straight segment avoids running A* for open ground and short trips.
export function clearSegment(sim,grid,from,to){
  const size=sim.gridSize,half=sim.halfWorld,start=sim.cell(from.x,from.z),end=sim.cell(to.x,to.z);
  let x=start.x,z=start.z;const dx=to.x-from.x,dz=to.z-from.z,sx=Math.sign(dx),sz=Math.sign(dz),tx=dx?2/Math.abs(dx):Infinity,tz=dz?2/Math.abs(dz):Infinity;
  let nextX=dx?((x+(sx>0?1:0))*2-half-from.x)/dx:Infinity,nextZ=dz?((z+(sz>0?1:0))*2-half-from.z)/dz:Infinity;
  const open=(xx,zz)=>xx>=0&&zz>=0&&xx<size&&zz<size&&!grid[zz*size+xx];if(!open(x,z))return false;
  for(let n=0;n<size*2+2;n++){
    if(x===end.x&&z===end.z)return true;
    if(Math.abs(nextX-nextZ)<1e-9){if(!open(x+sx,z)||!open(x,z+sz))return false;x+=sx;z+=sz;nextX+=tx;nextZ+=tz;}
    else if(nextX<nextZ){x+=sx;nextX+=tx;}else{z+=sz;nextZ+=tz;}
    if(!open(x,z))return false;
  }return false;
}

function regionsFor(sim,grid){
  if(grid.pathRegions)return grid.pathRegions;const size=sim.gridSize,labels=new Uint16Array(grid.length),queue=sim.regionQueue?.length===grid.length?sim.regionQueue:(sim.regionQueue=new Uint32Array(grid.length));let region=0;
  for(let first=0;first<grid.length;first++)if(!grid[first]&&!labels[first]){region++;let read=0,write=1;queue[0]=first;labels[first]=region;
    while(read<write){const id=queue[read++],x=id%size,z=Math.floor(id/size);for(const next of [x>0?id-1:-1,x<size-1?id+1:-1,z>0?id-size:-1,z<size-1?id+size:-1])if(next>=0&&!grid[next]&&!labels[next]){labels[next]=region;queue[write++]=next;}}
  }grid.pathRegions=labels;return labels;
}

export function findPath(sim,e,dest){
  const naval=!!sim.unitDefinition(e).naval,grid=sim.grid(e.owner,naval),size=sim.gridSize||80,half=sim.halfWorld||80;
  const nearest=(cell,point,labels=null,region=0)=>{if(!grid[cell.z*size+cell.x]&&(!labels||labels[cell.z*size+cell.x]===region))return cell;let best=null,score=Infinity;
    for(let radius=1;radius<12;radius++){for(let z=Math.max(0,cell.z-radius);z<=Math.min(size-1,cell.z+radius);z++)for(let x=Math.max(0,cell.x-radius);x<=Math.min(size-1,cell.x+radius);x++)if(!grid[z*size+x]&&(!labels||labels[z*size+x]===region)){const wx=x*2-half+1,wz=z*2-half+1,n=Math.hypot(wx-point.x,wz-point.z)+Math.hypot(wx-e.x,wz-e.z)*.005;if(n<score){score=n;best={x,z};}}if(best&&score<radius*2)return best;}return best;};
  const requested=sim.cell(dest.x,dest.z),exact=!grid[requested.z*size+requested.x],a=nearest(sim.cell(e.x,e.z),e);let b=nearest(requested,dest);if(!a||!b){e.pathStatus='blocked';return[];}
  const start=a.z*size+a.x;let end=b.z*size+b.x;
  if(start===end){e.pathStatus='ready';return[exact?{x:dest.x,z:dest.z}:{x:b.x*2-half+1,z:b.z*2-half+1}];}
  if(exact&&clearSegment(sim,grid,e,dest)){e.pathStatus='ready';return[{x:dest.x,z:dest.z}];}
  const labels=regionsFor(sim,grid);if(labels[start]!==labels[end]){if(!exact)b=nearest(requested,dest,labels,labels[start]);if(exact||!b){e.pathStatus='blocked';return[];}end=b.z*size+b.x;}
  const scratch=sim.pathScratch?.size===size?sim.pathScratch:(sim.pathScratch={size,came:new Int32Array(size*size),cost:new Float32Array(size*size),closed:new Uint8Array(size*size)});
  const came=scratch.came.fill(-1),cost=scratch.cost.fill(Infinity),closed=scratch.closed.fill(0),open=new MinHeap();
  const h=id=>Math.hypot(id%size-b.x,Math.floor(id/size)-b.z);cost[start]=0;open.push(start,h(start));let closest=start,found=-1,iterations=0;
  while(open.size&&iterations++<size*size*2){const current=open.pop();if(closed[current])continue;if(h(current)<h(closest))closest=current;if(current===end){found=current;break;}closed[current]=1;const x=current%size,z=Math.floor(current/size);
    for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const nx=x+dx,nz=z+dz,id=nz*size+nx;if(nx<0||nz<0||nx>=size||nz>=size||grid[id]||closed[id]||dx&&dz&&(grid[z*size+nx]||grid[nz*size+x]))continue;const n=cost[current]+(dx&&dz?1.414:1);if(n<cost[id]){cost[id]=n;came[id]=current;open.push(id,n+h(id));}}
  }
  e.pathStatus=found<0?'blocked':'ready';const result=[];let id=found<0?closest:found;while(id!==start&&id>=0){result.push({x:id%size*2-half+1,z:Math.floor(id/size)*2-half+1});id=came[id];}result.reverse();if(found>=0&&exact&&result.length)result[result.length-1]={x:dest.x,z:dest.z};return result;
}
