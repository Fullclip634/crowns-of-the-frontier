import * as THREE from 'three';
import {wallConnections,wallTreeConnections} from './walls.js';
import {markInstancePrefix} from './render-batches.js';
import {terrainFloor} from './building-grounding.js';
import {wallTier,wallTierStyle,FORTIFIED_WALL_TECH} from './fortified-walls.js';

// Small masonry joints use two shared instance batches rather than a new mesh
// and material for every connection. The original Blender wall bodies remain.
// A Fortified Wall upgrade changes tier through per-instance colour and scale,
// so the two-batch budget is preserved with zero new Blender models.
export class WallVisuals{
  constructor(view){this.view=view;this.group=new THREE.Group();this.group.name='Connected stone walls';view.objects.add(this.group);this.capacity=0;this.links=[];this.revision=-1;this.matrix=new THREE.Matrix4();this.tint=new THREE.Color();this.allocate(32);}
  allocate(capacity){for(const mesh of this.meshes||[]){mesh.removeFromParent();mesh.dispose();}this.capacity=capacity;
    this.stone=new THREE.InstancedMesh(this.view.geo.box,this.view.materials.stone,capacity*3);this.foundation=new THREE.InstancedMesh(this.view.geo.box,this.view.materials.stoneDark,capacity);this.meshes=[this.stone,this.foundation];
    for(const mesh of this.meshes){mesh.count=0;mesh.castShadow=mesh.receiveShadow=true;mesh.frustumCulled=false;mesh.userData.wallIds=[];mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(mesh);}this.lastSignature=null;
  }
  piece(mesh,link,start,end,groundA,groundB,y,height,depth,color){
    const dx=end.x-start.x,dz=end.z-start.z,len=Math.hypot(dx,dz);if(len<.01)return;const index=mesh.count++,cx=(start.x+end.x)/2,cz=(start.z+end.z)/2;
    this.matrix.set(dx,0,-dz/len*depth,cx,groundB-groundA,height,0,(groundA+groundB)/2+y,dz,0,dx/len*depth,cz,0,0,0,1);mesh.setMatrixAt(index,this.matrix);mesh.userData.wallIds[index]=link.a.type==='wall'?link.a.id:link.b.id;
    // Instanced colour keeps every tier in the same material/batch.
    mesh.setColorAt(index,this.tint.setHex(color));
  }
  update(menu){const v=this.view,fogVersion=v.fogTexture?.version??0;const revisionChanged=this.revision!==v.sim.revision||this.entities!==v.sim.entities;
    // A researched masonry upgrade changes appearance without necessarily
    // changing the entity list, so track the tech table in the cheap guard too.
    const tierVersion=v.sim.players?.map(player=>player.tech?.[FORTIFIED_WALL_TECH]||0).join(',')||'';
    if(revisionChanged){this.links=[...wallConnections(v.sim.entities),...wallTreeConnections(v.sim.entities)].filter(link=>link.gap>.015||Math.hypot(link.end.x-link.start.x,link.end.z-link.start.z)<.12);this.revision=v.sim.revision;this.entities=v.sim.entities;}
    if(!revisionChanged&&this.lastMenu===menu&&this.lastFogVersion===fogVersion&&this.lastCount===this.links.length&&this.lastTierVersion===tierVersion)return;this.lastMenu=menu;this.lastFogVersion=fogVersion;this.lastCount=this.links.length;this.lastTierVersion=tierVersion;
    let capacity=this.capacity;while(capacity<this.links.length)capacity*=2;if(capacity!==this.capacity)this.allocate(capacity);
    const tierOf=link=>wallTier(v.sim,link.a),shown=e=>menu||e.owner===0||v.sim.isVisible(e.x,e.z);
    const signature=this.links.map(link=>`${link.a.id}:${link.b.id}:${link.start.x}:${link.start.z}:${link.end.x}:${link.end.z}:${shown(link.a)&&shown(link.b)}:${Math.min(link.a.progress??1,link.b.progress??1).toFixed(3)}:${tierOf(link)}`).join('|');
    if(signature===this.lastSignature)return;this.lastSignature=signature;for(const mesh of this.meshes){mesh.count=0;mesh.userData.wallIds.length=0;}
    let visible=0;
    for(const link of this.links){if(!shown(link.a)||!shown(link.b))continue;const progress=Math.min(link.a.progress??1,link.b.progress??1);if(progress<=0)continue;visible++;
      const style=wallTierStyle(tierOf(link)),ga=v.entityHeight(link.a),gb=v.entityHeight(link.b),span=Math.hypot(link.end.x-link.start.x,link.end.z-link.start.z),d=Math.hypot(link.b.x-link.a.x,link.b.z-link.a.z),dx=span>.001?(link.end.x-link.start.x)/span:(link.b.x-link.a.x)/d,dz=span>.001?(link.end.z-link.start.z)/span:(link.b.z-link.a.z)/d,start={x:link.start.x-dx*.08,z:link.start.z-dz*.08},end={x:link.end.x+dx*.08,z:link.end.z+dz*.08};
      this.piece(this.stone,link,start,end,ga,gb,style.bodyY*progress,style.height*progress,style.depth,style.color);
      const land=v.landscape||{surfaceHeightAt:(x,z)=>v.groundHeight?.(x,z)??Math.min(ga,gb)},floor=terrainFloor(land,Math.min(start.x,end.x)-1.06,Math.max(start.x,end.x)+1.06,Math.min(start.z,end.z)-1.06,Math.max(start.z,end.z)+1.06)-.12,depth=Math.max(.42,Math.max(ga,gb)+.29-floor);
      this.piece(this.foundation,link,start,end,ga,gb,.29-depth/2,depth,style.foundationDepth,style.foundationColor);
      if(progress>.8){this.piece(this.stone,link,start,end,ga,gb,(style.bodyY+style.height/2-.02)*progress,.18,style.depth+.03,style.color);const mid={x:(start.x+end.x)/2,z:(start.z+end.z)/2},half=Math.min(.275,link.gap*.35),capA={x:mid.x-dx*half,z:mid.z-dz*half},capB={x:mid.x+dx*half,z:mid.z+dz*half};this.piece(this.stone,link,capA,capB,ga,gb,style.capY*progress,style.capHeight*progress,style.depth+.03,style.color);}
    }
    for(const mesh of this.meshes){markInstancePrefix(mesh);mesh.boundingSphere=null;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}v.wallDiagnostics={connections:this.links.length,visible,batches:2,stoneInstances:this.stone.count};
  }
  dispose(){for(const mesh of this.meshes){mesh.removeFromParent();mesh.dispose();}this.group.removeFromParent();}
}
