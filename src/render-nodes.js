import {DataTexture,RGBAFormat,UnsignedByteType,MeshStandardMaterial} from 'three';
import {MeshStandardNodeMaterial as ThreeStandardNodeMaterial} from 'three/webgpu';
import {configureCompatibilityShadow} from './compatibility-depth.js';
export {WebGPURenderer,PMREMGenerator,ClippingGroup} from 'three/webgpu';
import {Fn,If,attribute,varying,texture,textureLoad,reference,uniformArray,uv,vec2,vec3,vec4,mat3,mat4,int,ivec2,float,instanceIndex,positionGeometry,positionView,normalLocal,normalViewGeometry,normalView,positionViewDirection,cameraViewMatrix,cameraWorldMatrix,materialColor,materialRoughness,materialOpacity,output,normalMap,mix,clamp,max,dot,smoothstep,exp,pow,sin,cos,fract,floor,reflect,normalize,step,interleavedGradientNoise,vogelDiskSample,screenCoordinate,renderGroup} from 'three/tsl';

const compatibilityPCF=Fn(({depthTexture,shadowCoord,shadow,depthLayer},builder)=>{
  const mapSize=reference('mapSize','vec2',shadow).setGroup(renderGroup),radius=reference('radius','float',shadow).setGroup(renderGroup),spread=radius.div(mapSize.x);
  const phi=interleavedGradientNoise(screenCoordinate.xy).mul(6.28318530718),samples=[];
  for(let i=0;i<5;i++){
    const coords=shadowCoord.xy.add(vogelDiskSample(i,5,phi).mul(spread));let depth=texture(depthTexture,coords);
    if(depthTexture.isArrayTexture)depth=depth.depth(depthLayer);
    samples.push(builder.renderer.reversedDepthBuffer?step(depth,shadowCoord.z):step(shadowCoord.z,depth));
  }
  return samples.reduce((sum,sample)=>sum.add(sample)).mul(.2);
});
export function configureDirectionalShadow(light,renderer){return configureCompatibilityShadow(light,renderer,compatibilityPCF);}

// r180's node copy preserves its graph but omits MeshStandardMaterial's PBR
// properties. Keep maps, colors and surface values when creating independent
// compilation previews, rigid batches, tinted variants and placement ghosts.
export class MeshStandardNodeMaterial extends ThreeStandardNodeMaterial {
  copy(source){
    super.copy(source);MeshStandardMaterial.prototype.copy.call(this,source);
    for(const [key,node]of Object.entries(source))if(node?.isNode)this[key]=node;
    return this;
  }
}

const pixel=(r,g,b)=>{const map=new DataTexture(new Uint8Array([r,g,b,255]),1,1,RGBAFormat,UnsignedByteType);map.needsUpdate=true;return map;};
const white=pixel(255,255,255),flat=pixel(128,128,255);
const value=(holder,type='float')=>reference('value',type,holder);
const sample=(holder,coords=uv(),fallback=white)=>{
  // TextureNode hashes the initial texture when sharing shader bindings. Start
  // with the real map so distinct surfaces never share a white-placeholder slot.
  const node=texture(holder.value||fallback,coords);
  node.onRenderUpdate(()=>{node.value=holder.value||fallback;});return node;
};
const weighted=(u,roles,coords,weights,suffix='')=>roles.map((role,i)=>sample(u[role+suffix],coords[i],suffix==='Normal'?flat:white).rgb.mul(weights[['x','y','z'][i]])).reduce((a,b)=>a.add(b));

export function terrain(material,u){
  const coords=[uv().mul(value(u.scale,'vec3').x),uv().mul(value(u.scale,'vec3').y),uv().mul(value(u.scale,'vec3').z)];
  const weights=Fn(()=>{const base=max(varying(attribute('terrainMix','vec3')),vec3(0));const road=sample(u.roads).r;const blend=mix(base,vec3(0,1,0),road.mul(.94));return blend.div(max(dot(blend,vec3(1)),.001));})();
  const macro=mix(vec3(1),clamp(materialColor.rgb.div(value(u.macroReference,'color')),vec3(.72),vec3(1.22)),value(u.macroStrength));
  const color=sample(u.grass,coords[0]).rgb.mul(value(u.grassTint,'color')).mul(macro).mul(weights.x)
    .add(sample(u.soil,coords[1]).rgb.mul(weights.y)).add(sample(u.rock,coords[2]).rgb.mul(weights.z)).mul(value(u.tint,'color'));
  material.colorNode=mix(materialColor.rgb,color,value(u.amount));
  if(u.grassNormal.value)material.normalNode=normalMap(weighted(u,['grass','soil','rock'],coords,weights,'Normal'),vec2(.35));
  if(u.grassArm.value)material.roughnessNode=materialRoughness.mul(clamp(weighted(u,['grass','soil','rock'],coords,weights,'Arm').g,.25,1));
  material.needsUpdate=true;
}

export function unitPalette(material,u){
  const surface=varying(attribute('unitSurface','vec3'));
  const teams=uniformArray(u.teams.value,'color'),roofs=uniformArray(u.roofs.value,'color');
  const team=Fn(builder=>{
    if(!builder.object.isInstancedMesh)return vec3(1);
    const owner=int(clamp(attribute('instanceOwner','float'),0,7).add(.5));
    const mask=attribute('unitTeamMask','float');
    return mask.greaterThan(1.5).select(roofs.element(owner),mask.greaterThan(.5).select(teams.element(owner),vec3(1)));
  })().toVarying();
  const tile=clamp(floor(surface.z.add(.5)).sub(2),0,3),repeats=tile.lessThan(.5).select(6,tile.lessThan(1.5).select(4,tile.lessThan(2.5).select(2,10)));
  const coords=vec2(tile.mod(2),floor(tile.div(2))).mul(256).add(16).add(fract(uv().mul(repeats)).mul(224)).div(512);
  const character=surface.z.greaterThan(1.5).and(value(u.characterReady).greaterThan(.5)),wood=surface.z.greaterThan(.5).and(surface.z.lessThan(1.5));
  const tint=Fn(()=>{const color=vec3(1).toVar();If(character,()=>{color.assign(sample(u.characterColor,coords).rgb);}).ElseIf(wood,()=>{color.assign(sample(u.wood).rgb);});return color;})();
  material.colorNode=materialColor.rgb.mul(team).mul(tint);
  material.roughnessNode=clamp(surface.x,.04,1);material.metalnessNode=clamp(surface.y,0,1);material.normalNode=null;
  if(u.characterNormal.value){
    const detail=character.select(float(1).sub(smoothstep(18,44,positionView.length())),0);
    const amount=detail.mul(value(u.characterDetail)),active=amount.greaterThan(.001),strength=surface.z.greaterThan(4.5).select(.12,.3);
    const micro=Fn(()=>{const result=vec4(.5,.5,1,surface.x).toVar();If(active,()=>{result.assign(sample(u.characterNormal,coords,flat));});return result;})();
    material.roughnessNode=clamp(mix(surface.x,micro.a,amount),.04,1);
    material.normalNode=normalMap(micro.rgb,vec2(strength.mul(amount)));
  }
  material.needsUpdate=true;
}

export function structurePalette(material,u){
  const surface=varying(attribute('structureSurface','vec3')),mode=surface.z;
  const choose=(suffix='',fallback=white)=>Fn(()=>{
    const result=vec3(suffix==='Normal'?vec3(.5,.5,1):vec3(1)).toVar();
    If(mode.greaterThan(3.5),()=>{if(!suffix)result.assign(sample(u.roof).rgb);})
      .ElseIf(mode.greaterThan(2.5),()=>{result.assign(sample(u['plaster'+suffix],uv(),fallback).rgb);})
      .ElseIf(mode.greaterThan(1.5),()=>{result.assign(sample(u['stone'+suffix],uv(),fallback).rgb);})
      .ElseIf(mode.greaterThan(.5),()=>{result.assign(sample(u['wood'+suffix],uv(),fallback).rgb);});
    return result;
  })();
  material.colorNode=materialColor.rgb.mul(choose());
  const arm=choose('Arm'),active=mode.greaterThan(.5).and(mode.lessThan(3.5)).and(value(u.detail).greaterThan(.5));
  material.roughnessNode=clamp(surface.x.mul(active.select(arm.g,1)),.04,1);
  material.metalnessNode=clamp(surface.y,0,1);
  material.aoNode=active.select(mix(1,arm.r,.65),1);
  const normalScale=mode.greaterThan(2.5).select(.24,mode.greaterThan(1.5).select(.45,.3));
  material.normalNode=active.select(normalMap(choose('Normal',flat),vec2(normalScale)),normalViewGeometry);
  const night=value(u.night);
  material.emissiveNode=varying(attribute('structureEmission','vec3')).mul(night.mul(1.5).add(1)).add(vec3(.65,.3,.07).mul(varying(attribute('structureNightGlow','float'))).mul(night));
  material.needsUpdate=true;
}

export function rigidPose(material,rig){
  rig.poseNode=texture(rig.texture);
  const pose=Fn(()=>{
    const column=int(attribute('unitJoint','float').add(.5)).mul(4),row=int(instanceIndex);
    return mat4(...[0,1,2,3].map(offset=>textureLoad(rig.poseNode,ivec2(column.add(offset),row))));
  })();
  const transformed=Fn(()=>{
    const matrix=pose.toVar(),a=matrix.element(0).xyz,b=matrix.element(1).xyz,c=matrix.element(2).xyz;
    const scale=vec3(dot(a,a),dot(b,b),dot(c,c));
    normalLocal.assign(mat3(matrix).mul(normalLocal.div(scale)));
    return matrix.mul(vec4(positionGeometry,1)).xyz;
  })();
  // The node renderer already forwards positionNode into its shadow pass. In
  // r180 setting both hooks overwrites the saved override and leaks this pose
  // onto the next shadow caster, including meshes without a joint attribute.
  material.positionNode=transformed;
  material.needsUpdate=true;
}

const hash=Fn(([point])=>{
  const p=fract(vec3(point.x,point.y,point.x).mul(.1031)).toVar();p.addAssign(dot(p,p.yzx.add(33.33)));return fract(p.x.add(p.y).mul(p.z));
});
const noise=Fn(([point])=>{
  const cell=floor(point),f=fract(point).toVar();f.assign(f.mul(f).mul(float(3).sub(f.mul(2))));
  return mix(mix(hash(cell),hash(cell.add(vec2(1,0))),f.x),mix(hash(cell.add(vec2(0,1))),hash(cell.add(1)),f.x),f.y);
});

export function water(material){
  const time=value(material.frontierWaveTime),motion=value(material.frontierWaterMotion),ripples=value(material.frontierWaterRipples),detail=value(material.frontierWaterDetail),sky=value(material.frontierWaterSky,'color'),light=value(material.frontierWaterLight);
  const shore=attribute('frontierWaterShore','float'),bank=varying(vec2(attribute('frontierWaterDepth','float'),shore));
  const xz=varying(positionGeometry.xz),a=positionGeometry.x.mul(.9).add(positionGeometry.z.mul(.36)).add(time.mul(1.3)),b=positionGeometry.z.mul(.65).sub(time);
  const fade=smoothstep(0,1,shore).mul(motion);
  const wave=vec3(sin(a).mul(.05).add(cos(b).mul(.025)),cos(a).mul(.045),cos(a).mul(.018).sub(sin(b).mul(.01625))).mul(fade);
  const displaced=positionGeometry.add(vec3(0,wave.x,0));
  const waveNormal=Fn(()=>{normalLocal.assign(normalize(vec3(wave.y.negate(),1,wave.z.negate())));return displaced;})();
  material.positionNode=waveNormal;
  const absorption=float(1).sub(exp(max(bank.x,0).mul(-1.8)));
  material.colorNode=materialColor.rgb.mul(mix(value(material.frontierWaterShallow,'color'),value(material.frontierWaterDeep,'color'),absorption));
  material.opacityNode=materialOpacity.mul(mix(.45,1,absorption));
  material.normalNode=Fn(()=>{
    const distortion=detail.greaterThan(.5).select(noise(xz.mul(.28).add(vec2(time.mul(.06),time.mul(-.04)))).sub(.5).mul(4),0);
    const ra=cos(dot(xz,vec2(3.7,1.9)).add(time.mul(2.3)).add(distortion));
    const rb=cos(dot(xz,vec2(-2.1,3.1)).sub(time.mul(1.8)).sub(distortion.mul(.73)));
    const rc=cos(dot(xz,vec2(1.3,-4.2)).add(time.mul(1.2)).add(distortion.mul(.41)));
    const slope=vec2(.48,.247).mul(ra).add(vec2(-.23,.339).mul(rb)).add(vec2(.091,-.294).mul(rc));
    const coverage=float(1).div(float(1).add(xz.fwidth().length().mul(2.5)));
    return normalize(normalViewGeometry.add(mat3(cameraViewMatrix).mul(vec3(slope.x,0,slope.y)).mul(ripples).mul(coverage)));
  })();
  material.outputNode=Fn(()=>{
    const fresnel=float(.02).add(pow(float(1).sub(clamp(dot(normalView,positionViewDirection),0,1)),5).mul(.98));
    const reflection=reflect(positionViewDirection.negate(),normalView).transformDirection(cameraWorldMatrix);
    const skyGradient=sky.mul(mix(.72,1.12,clamp(reflection.y.mul(.5).add(.5),0,1)));
    const color=mix(output.rgb,skyGradient,fresnel).toVar();
    If(bank.y.lessThan(1.25),()=>{
      const cells=noise(xz.mul(1.7).add(vec2(time.mul(.18),time.mul(-.12))));
      const wash=sin(dot(xz,vec2(.23,.54)).add(time.mul(.7))).mul(.12).add(cells.sub(.5).mul(.18));
      const foam=float(1).sub(smoothstep(.06,.48,bank.y.add(wash))).mul(smoothstep(.22,.8,cells));
      color.assign(mix(color,vec3(.72,.75,.63).mul(light),foam.mul(.28)));
    });
    return vec4(color,output.a);
  })();
  material.needsUpdate=true;
}
