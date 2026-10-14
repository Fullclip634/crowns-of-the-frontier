import * as THREE from 'three';
import {wallConnections} from './walls.js';
import {markInstancePrefix} from './render-batches.js';

// Small masonry joints use two shared instance batches rather than a new mesh
// and material for every connection. The original Blender wall bodies remain.
export class WallVisuals{
  constructor(view){this.view=view;this.group=new THREE.Group();this.group.name='Connected stone walls';view.objects.add(this.group);this.capacity=0;this.links=[];this.revision=-1;this.matrix=new THREE.Matrix4();this.allocate(32);}
  allocate(capacity){for(const mesh of this.meshes||[]){mesh.removeFromParent();mesh.dispose();}this.capacity=capacity;
    this.stone=new THREE.InstancedMesh(this.view.geo.box,this.view.materials.stone,capacity*3);this.foundation=new THREE.InstancedMesh(this.view.geo.box,this.view.materials.stoneDark,capacity);this.meshes=[this.stone,this.foundation];
    for(const mesh of this.meshes){mesh.count=0;mesh.castShadow=mesh.receiveShadow=true;mesh.frustumCulled=false;mesh.userData.wallIds=[];mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(mesh);}this.lastSignature=null;
  }
  piece(mesh,link,start,end,groundA,groundB,y,height,depth){
    const dx=end.x-start.x,dz=end.z-start.z,len=Math.hypot(dx,dz);if(len<.01)return;const index=mesh.count++,cx=(start.x+end.x)/2,cz=(start.z+end.z)/2;
    this.matrix.set(dx,0,-dz/len*depth,cx,groundB-groundA,height,0,(groundA+groundB)/2+y,dz,0,dx/len*depth,cz,0,0,0,1);mesh.setMatrixAt(index,this.matrix);mesh.userData.wallIds[index]=link.a.type==='wall'?link.a.id:link.b.id;
  }
  update(menu){const v=this.view;if(this.revision!==v.sim.revision||this.entities!==v.sim.entities){this.links=wallConnections(v.sim.entities).filter(link=>link.gap>.015||Math.hypot(link.end.x-link.start.x,link.end.z-link.start.z)<.12);this.revision=v.sim.revision;this.entities=v.sim.entities;}
    let capacity=this.capacity;while(capacity<this.links.length)capacity*=2;if(capacity!==this.capacity)this.allocate(capacity);
    const shown=e=>menu||e.owner===0||v.sim.isVisible(e.x,e.z),signature=this.links.map(link=>`${link.a.id}:${link.b.id}:${link.start.x}:${link.start.z}:${link.end.x}:${link.end.z}:${shown(link.a)&&shown(link.b)}:${Math.min(link.a.progress,link.b.progress).toFixed(3)}`).join('|');
    if(signature===this.lastSignature)return;this.lastSignature=signature;for(const mesh of this.meshes){mesh.count=0;mesh.userData.wallIds.length=0;}
    let visible=0;
    for(const link of this.links){if(!shown(link.a)||!shown(link.b))continue;const progress=Math.min(link.a.progress,link.b.progress);if(progress<=0)continue;visible++;
      const ga=v.entityHeight(link.a),gb=v.entityHeight(link.b),span=Math.hypot(link.end.x-link.start.x,link.end.z-link.start.z),d=Math.hypot(link.b.x-link.a.x,link.b.z-link.a.z),dx=span>.001?(link.end.x-link.start.x)/span:(link.b.x-link.a.x)/d,dz=span>.001?(link.end.z-link.start.z)/span:(link.b.z-link.a.z)/d,start={x:link.start.x-dx*.08,z:link.start.z-dz*.08},end={x:link.end.x+dx*.08,z:link.end.z+dz*.08};
      this.piece(this.stone,link,start,end,ga,gb,1.67*progress,3.55*progress,1.47);this.piece(this.foundation,link,start,end,ga,gb,.08,.42,2.12);
      if(progress>.8){this.piece(this.stone,link,start,end,ga,gb,3.43*progress,.18,1.5);const mid={x:(start.x+end.x)/2,z:(start.z+end.z)/2},half=Math.min(.275,link.gap*.35),capA={x:mid.x-dx*half,z:mid.z-dz*half},capB={x:mid.x+dx*half,z:mid.z+dz*half};this.piece(this.stone,link,capA,capB,ga,gb,3.65*progress,.85*progress,1.5);}
    }
    for(const mesh of this.meshes){markInstancePrefix(mesh);mesh.boundingSphere=null;}v.wallDiagnostics={connections:this.links.length,visible,batches:2,stoneInstances:this.stone.count};
  }
  dispose(){for(const mesh of this.meshes){mesh.removeFromParent();mesh.dispose();}this.group.removeFromParent();}
}
