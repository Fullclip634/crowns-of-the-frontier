import * as THREE from 'three';
import {campaignObjective} from './campaigns.js';
export function installCampaignView(WorldView){
  const p=WorldView.prototype,render=p.render;
  p.render=function(dt,menu=false){
    if(!this.campaignMarker){const group=new THREE.Group(),material=new THREE.MeshBasicMaterial({color:0xf2ce77,transparent:true,opacity:.8,depthWrite:false});
      const ring=new THREE.Mesh(new THREE.RingGeometry(2.6,2.85,40),material);ring.rotation.x=-Math.PI/2;ring.position.y=.25;group.add(ring);
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,5,6),material);pole.position.set(2.4,2.5,0);group.add(pole);
      const banner=new THREE.Mesh(new THREE.BoxGeometry(1.4,.8,.08),material);banner.position.set(3.05,4.45,0);group.add(banner);this.campaignMarker=group;this.scene.add(group);}
    const marker=this.sim&&campaignObjective(this.sim)?.marker;
    this.campaignMarker.visible=!!marker&&!menu&&this.sim.isExplored(marker.x,marker.z);
    if(marker)this.campaignMarker.position.set(marker.x,this.groundHeight(marker.x,marker.z),marker.z);
    render.call(this,dt,menu);
  };
}
