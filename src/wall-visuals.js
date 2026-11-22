import * as THREE from 'three';
import {wallConnections,wallSupportConnections,wallTreeConnections,isWallCorner} from './walls.js';
import {markInstancePrefix} from './render-batches.js';
import {terrainFloor} from './building-grounding.js';
import {wallTier,wallTierStyle,FORTIFIED_WALL_TECH} from './fortified-walls.js';

// Connected walls use shared instanced batches rather than a new mesh and
// material per connection: wooden palisade stakes in Age 1-2, warm brown stone
// masonry in Castle Age, and gleaming silver fortified masonry after upgrade.
export class WallVisuals{
  constructor(view){this.view=view;this.group=new THREE.Group();this.group.name='Connected stone walls';view.objects.add(this.group);this.capacity=0;this.links=[];this.revision=-1;this.matrix=new THREE.Matrix4();this.tint=new THREE.Color();this.allocate(32);}
  allocate(capacity){for(const mesh of this.meshes||[]){mesh.removeFromParent();mesh.dispose();}this.capacity=capacity;
    this.stone=new THREE.InstancedMesh(this.view.geo.box,this.view.materials.stone,capacity*3);this.foundation=new THREE.InstancedMesh(this.view.geo.box,this.view.materials.stoneDark,capacity);
    this.palisade=this.view.materials.wood?new THREE.InstancedMesh(this.view.geo.box,this.view.materials.wood,capacity*12):null;
    this.meshes=this.palisade?[this.stone,this.foundation,this.palisade]:[this.stone,this.foundation];
    for(const mesh of this.meshes){mesh.count=0;mesh.castShadow=mesh.receiveShadow=true;mesh.frustumCulled=false;mesh.userData.wallIds=[];mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(mesh);}this.lastSignature=null;
  }
  piece(mesh,link,start,end,groundA,groundB,y,height,depth,color){
    const dx=end.x-start.x,dz=end.z-start.z,len=Math.hypot(dx,dz);if(len<.01)return;const index=mesh.count++,cx=(start.x+end.x)/2,cz=(start.z+end.z)/2;
    this.matrix.set(dx,0,-dz/len*depth,cx,groundB-groundA,height,0,(groundA+groundB)/2+y,dz,0,dx/len*depth,cz,0,0,0,1);mesh.setMatrixAt(index,this.matrix);mesh.userData.wallIds[index]=link.a.type==='wall'?link.a.id:link.b.id;
    // Instanced colour keeps every tier in the same material/batch.
    mesh.setColorAt(index,this.tint.setHex(color));
  }
  stake(mesh,link,x,z,yCenter,height,width,depth,dx,dz,color){
    const index=mesh.count++;
    this.matrix.set(dx*width,0,-dz*depth,x,0,height,0,yCenter,dz*width,0,dx*depth,z,0,0,0,1);
    mesh.setMatrixAt(index,this.matrix);
    mesh.userData.wallIds[index]=link.a.type==='wall'?link.a.id:link.b.id;
    mesh.setColorAt(index,this.tint.setHex(color));
  }
  update(menu){const v=this.view,fogVersion=v.fogTexture?.version??0;const revisionChanged=this.revision!==v.sim.revision||this.entities!==v.sim.entities;
    // Both age advances (Palisade -> Stone at Castle Age) and Fortified Walls
    // change connector appearance without necessarily changing entity count.
    let tierVersion=0;
    const players=v.sim.players;
    if(players)for(let i=0;i<players.length;i++)tierVersion=tierVersion*64+Math.min(3,players[i]?.age||0)*16+Math.min(15,(players[i]?.tech?.[FORTIFIED_WALL_TECH]||0)+1);
    if(revisionChanged){
      const buildings=typeof v.sim.candidatesFor==='function'?v.sim.candidatesFor('building'):v.sim.entities;
      let hasWall=false,hasGate=false;
      for(const e of buildings)if(e.hp>0&&e.kind==='building'){if(e.type==='wall'){hasWall=true;break;}if(e.type==='gate')hasGate=true;}
      this.links=hasWall||hasGate?[...wallConnections(buildings),...(hasWall?wallTreeConnections(v.sim.entities):[]),...(hasWall?wallSupportConnections(v.sim.entities):[])].filter(link=>link.gap>.015||Math.hypot(link.end.x-link.start.x,link.end.z-link.start.z)<.12):[];
      this.revision=v.sim.revision;this.entities=v.sim.entities;
    }
    if(!revisionChanged&&this.lastMenu===menu&&this.lastFogVersion===fogVersion&&this.lastCount===this.links.length&&this.lastTierVersion===tierVersion)return;this.lastMenu=menu;this.lastFogVersion=fogVersion;this.lastCount=this.links.length;this.lastTierVersion=tierVersion;
    let capacity=this.capacity;while(capacity<this.links.length)capacity*=2;if(capacity!==this.capacity)this.allocate(capacity);
    const tierOf=link=>{
      const ta=wallTier(v.sim,link.a),tb=wallTier(v.sim,link.b);
      if(ta==='fortified'||tb==='fortified')return 'fortified';
      const wa=link.a.type==='wall'||link.a.type==='gate',wb=link.b.type==='wall'||link.b.type==='gate';
      if((wa&&ta==='palisade')||(wb&&tb==='palisade'))if((!wa||ta==='palisade')&&(!wb||tb==='palisade'))return 'palisade';
      return 'stone';
    };
    const shown=e=>menu||e.owner===0||v.sim.isVisible(e.x,e.z);
    const signature=this.links.map(link=>`${link.a.id}:${link.b.id}:${link.start.x}:${link.start.z}:${link.end.x}:${link.end.z}:${shown(link.a)&&shown(link.b)}:${Math.min(link.a.progress??1,link.b.progress??1).toFixed(3)}:${tierOf(link)}`).join('|');
    if(signature===this.lastSignature)return;this.lastSignature=signature;for(const mesh of this.meshes){mesh.count=0;mesh.userData.wallIds.length=0;}
    let visible=0;
    for(const link of this.links){if(!shown(link.a)||!shown(link.b))continue;const progress=Math.min(link.a.progress??1,link.b.progress??1);if(progress<=0)continue;visible++;
      const tier=tierOf(link),style=wallTierStyle(tier),ga=v.entityHeight(link.a),gb=v.entityHeight(link.b),span=Math.hypot(link.end.x-link.start.x,link.end.z-link.start.z),d=Math.hypot(link.b.x-link.a.x,link.b.z-link.a.z),dx=span>.001?(link.end.x-link.start.x)/span:(link.b.x-link.a.x)/d,dz=span>.001?(link.end.z-link.start.z)/span:(link.b.z-link.a.z)/d,inA=isWallCorner(v.sim,link.a)?.32:.08,inB=isWallCorner(v.sim,link.b)?.32:.08,start={x:link.start.x-dx*inA,z:link.start.z-dz*inA},end={x:link.end.x+dx*inB,z:link.end.z+dz*inB};
      const land=v.landscape||{surfaceHeightAt:(x,z)=>v.groundHeight?.(x,z)??Math.min(ga,gb)},floor=terrainFloor(land,Math.min(start.x,end.x)-1.06,Math.max(start.x,end.x)+1.06,Math.min(start.z,end.z)-1.06,Math.max(start.z,end.z)+1.06)-.12;
      if(tier==='palisade'&&this.palisade){
        const run=Math.hypot(end.x-start.x,end.z-start.z),steps=Math.max(3,Math.min(10,Math.ceil(run/.24)));
        for(let k=0;k<steps;k++){
          const t=(k+.5)/steps,px=start.x+(end.x-start.x)*t,pz=start.z+(end.z-start.z)*t,g=ga+(gb-ga)*t;
          const vary=.88+((k*41+link.a.id*13)%18)/100,top=g+style.height*progress*vary,bot=Math.min(g-.34,floor);
          const shade=k%3===0?0x9e978b:k%3===1?0x8a8378:0x787167;
          this.stake(this.palisade,link,px,pz,(top+bot)*.5,Math.max(.3,top-bot),.22,.22,dx,dz,shade);
        }
        this.piece(this.palisade,link,start,end,ga,gb,.65*progress,.13,.38,0x585046);
        if(progress>.55)this.piece(this.palisade,link,start,end,ga,gb,1.62*progress,.13,.38,0x585046);
        continue;
      }
      this.piece(this.stone,link,start,end,ga,gb,style.bodyY*progress,style.height*progress,style.depth,style.color);
      const depth=Math.max(.42,Math.max(ga,gb)+.29-floor);
      this.piece(this.foundation,link,start,end,ga,gb,.29-depth/2,depth,style.foundationDepth,style.foundationColor);
      if(progress>.8){this.piece(this.stone,link,start,end,ga,gb,(style.bodyY+style.height/2-.02)*progress,.18,style.depth+.03,style.color);const mid={x:(start.x+end.x)/2,z:(start.z+end.z)/2},half=Math.min(.275,link.gap*.35),capA={x:mid.x-dx*half,z:mid.z-dz*half},capB={x:mid.x+dx*half,z:mid.z+dz*half};this.piece(this.stone,link,capA,capB,ga,gb,style.capY*progress,style.capHeight*progress,style.depth+.03,style.color);}
    }
    for(const mesh of this.meshes){markInstancePrefix(mesh);mesh.boundingSphere=null;if(mesh.instanceColor&&mesh.count>0){mesh.instanceColor.clearUpdateRanges();mesh.instanceColor.addUpdateRange(0,mesh.count*3);mesh.instanceColor.needsUpdate=true;}}
    const activeBatches=this.palisade?((this.stone.count>0?2:0)+(this.palisade.count>0?1:0)||2):2;
    v.wallDiagnostics={connections:this.links.length,visible,batches:activeBatches,stoneInstances:this.stone.count,palisadeInstances:this.palisade?.count||0};
  }
  dispose(){for(const mesh of this.meshes){mesh.removeFromParent();mesh.dispose();}this.group.removeFromParent();}
}
