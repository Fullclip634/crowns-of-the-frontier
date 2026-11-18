import {DataTexture,RGBAFormat,UnsignedByteType,MeshStandardMaterial,MeshBasicMaterial} from 'three';
import {MeshStandardNodeMaterial as ThreeStandardNodeMaterial,MeshBasicNodeMaterial as ThreeBasicNodeMaterial} from 'three/webgpu';
import {configureCompatibilityShadow} from './compatibility-depth.js';
export {WebGPURenderer,PMREMGenerator,ClippingGroup} from 'three/webgpu';
import {Fn,If,attribute,varying,texture,textureLoad,reference,uniformArray,uv,vec2,vec3,vec4,mat3,mat4,int,ivec2,float,instanceIndex,positionGeometry,positionView,positionWorld,normalLocal,normalViewGeometry,normalView,positionViewDirection,cameraViewMatrix,cameraWorldMatrix,materialColor,materialRoughness,materialOpacity,output,normalMap,mix,clamp,min,max,abs,dot,smoothstep,exp,pow,sin,cos,fract,floor,reflect,normalize,step,interleavedGradientNoise,vogelDiskSample,screenCoordinate,renderGroup} from 'three/tsl';

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

// r180's node copy preserves its graph but omits classic material PBR/basic
// properties. Keep maps, colors and surface values when creating independent
// compilation previews, rigid batches, tinted variants and placement ghosts.
function copyMaterialProperties(BasePrototype,target,source){
  BasePrototype.copy.call(target,source);
  for(const [key,node]of Object.entries(source))if(node?.isNode)target[key]=node;
  return target;
}
export class MeshStandardNodeMaterial extends ThreeStandardNodeMaterial {
  copy(source){super.copy(source);return copyMaterialProperties(MeshStandardMaterial.prototype,this,source);}
}
export class MeshBasicNodeMaterial extends ThreeBasicNodeMaterial {
  copy(source){super.copy(source);return copyMaterialProperties(MeshBasicMaterial.prototype,this,source);}
}

const pixel=(r,g,b)=>{const map=new DataTexture(new Uint8Array([r,g,b,255]),1,1,RGBAFormat,UnsignedByteType);map.needsUpdate=true;return map;};
const white=pixel(255,255,255),flat=pixel(128,128,255);
const value=(holder,type='float')=>reference('value',type,holder);
export function battlefieldFog(material,fog,unexploredAlpha){
  const surface=material.outputNode||output,scale=value(fog.scale),position=positionWorld.xz.mul(scale);
  const border=smoothstep(.5,scale.mul(4).add(.5),max(abs(position.x),abs(position.y)));
  const sampled=texture(fog.mask.value,position.add(.5)).a;
  const amount=mix(sampled,unexploredAlpha,border).mul(value(fog.enabled));
  material.outputNode=vec4(mix(surface.rgb,value(fog.tint,'color'),amount),surface.a);
  material.needsUpdate=true;
}

const sample=(holder,coords=uv(),fallback=white)=>{
  // TextureNode hashes the initial texture when sharing shader bindings. Start
  // with the real map so distinct surfaces never share a white-placeholder slot.
  const node=texture(holder.value||fallback,coords);
  node.onRenderUpdate(()=>{node.value=holder.value||fallback;});return node;
};

export function terrain(material,u){
  const scale=value(u.scale,'vec3'),worldPos=varying(positionGeometry),flags=u.biomeFlags?value(u.biomeFlags,'vec4'):vec4(0,0,0,0);
  const worldNormal=varying(normalize(normalLocal)),worldNormalY=worldNormal.y;
  const coords=[uv().mul(scale.x),uv().mul(scale.y),uv().mul(scale.z).mul(5.5)];
  const roadSample=sample(u.roads,uv().mul(2).sub(.5)).rgb;
  const terrainPaving=smoothstep(.81,.99,roadSample.r),roadStrength=clamp(roadSample.r.mul(1.30),0,1);
  const edgeNoise=sin(worldPos.x.mul(1.45).add(worldPos.z.mul(1.15))).mul(cos(worldPos.x.mul(.85).sub(worldPos.z.mul(1.65)))).mul(.14);
  const terrainRoad=smoothstep(.08,.88,roadStrength.add(edgeNoise.mul(roadStrength)));
  const baseMix=max(varying(attribute('terrainMix','vec3')),vec3(0));
  const shore=smoothstep(.05,.75,roadSample.b).mul(float(1).sub(smoothstep(.35,.85,baseMix.z)));
  const terrainBeach=flags.w.greaterThan(.5).select(smoothstep(.08,.78,roadSample.g.add(edgeNoise.mul(.5).mul(roadSample.g))).mul(float(1).sub(smoothstep(.32,.80,baseMix.z))).mul(float(1).sub(terrainRoad.mul(.85))),float(0));
  const mixed=mix(baseMix,vec3(0,1,0),clamp(terrainRoad.mul(.78).add(max(shore,terrainBeach).mul(.62)),0,.92));
  const grassRaw=mix(sample(u.grass,coords[0]).rgb,sample(u.grass,coords[0].mul(.16).add(vec2(.19,.43))).rgb,.46);
  const grassSample=clamp(grassRaw.sub(.5).mul(1.32).add(.5),.05,1.35);
  const soilSample=sample(u.soil,coords[1].mul(.55)).rgb;
  const triWBase=pow(abs(worldNormal),vec3(4));
  const triW=triWBase.div(max(triWBase.x.add(triWBase.y).add(triWBase.z),.001));
  const rockTop=mix(sample(u.rock,coords[2]).rgb,sample(u.rock,coords[2].mul(2.727).add(vec2(.23,.41))).rgb,.46);
  const rockSideX=sample(u.rock,worldPos.zy.mul(.085)).rgb;
  const rockSideZ=sample(u.rock,worldPos.xy.mul(.085).add(vec2(.37,.19))).rgb;
  const rockSample=rockSideX.mul(triW.x).add(rockTop.mul(triW.y)).add(rockSideZ.mul(triW.z));
  const lumaWeights=vec3(.3,.59,.11);
  const sampleLuma=vec3(dot(grassSample,lumaWeights),dot(soilSample,lumaWeights),dot(rockSample,lumaWeights).add(.16));
  const heightWeighted=mixed.mul(pow(max(sampleLuma,vec3(.08)),vec3(1.65)));
  const weights=heightWeighted.div(max(dot(heightWeighted,vec3(1)),.001));
  const macro=mix(vec3(1),clamp(materialColor.rgb.div(value(u.macroReference,'color')),vec3(.68),vec3(1.26)),value(u.macroStrength));
  const cloverDapple=sin(worldPos.x.mul(.42).add(worldPos.z.mul(.36))).mul(cos(worldPos.x.mul(.29).sub(worldPos.z.mul(.48))));
  const tuftGrain=sin(worldPos.x.mul(2.8).add(cos(worldPos.z.mul(2.1)))).mul(cos(worldPos.z.mul(2.6).sub(sin(worldPos.x.mul(1.9)))));
  const baseGrassCol=grassSample.mul(value(u.grassTint,'color')).mul(macro).mul(mix(vec3(.88,.94,.84),vec3(1.08,1.12,.94),smoothstep(-.42,.48,cloverDapple))).mul(float(.96).add(tuftGrain.mul(.09)));
  const driftWave=sin(worldPos.x.mul(.42).sub(worldPos.z.mul(.19)).add(sin(worldPos.z.mul(.14)).mul(1.3)));
  const snowSparkle=sin(worldPos.x.mul(4.3).add(worldPos.z.mul(3.7))).mul(cos(worldPos.z.mul(4.1).sub(worldPos.x.mul(3.2))));
  const snowMask=mix(float(.86),float(1.04),smoothstep(-.6,.65,driftWave)).mul(float(.97).add(snowSparkle.mul(.045)));
  const snowBase=mix(vec3(.86,.91,.96),vec3(.99,1,1.02),smoothstep(-.5,.5,driftWave));
  const snowCol=mix(baseGrassCol,grassSample.mul(snowBase).mul(snowMask).mul(macro),.85);
  const sandRipple=sin(worldPos.x.mul(3.4).add(worldPos.z.mul(1.3)).add(sin(worldPos.z.mul(.6)).mul(1.4)));
  const aridShade=mix(vec3(.88,.72,.48),vec3(1.12,.96,.70),smoothstep(-.7,.7,sandRipple));
  const sandCol=mix(baseGrassCol,mix(soilSample,grassSample,.28).mul(value(u.grassTint,'color')).mul(aridShade).mul(macro),.72);
  const ashNoise=sin(worldPos.x.mul(1.8).sub(worldPos.z.mul(1.4))).mul(cos(worldPos.z.mul(1.5).add(worldPos.x.mul(1.2))));
  const ashBase=soilSample.mul(value(u.grassTint,'color')).mul(mix(vec3(.76,.72,.70),vec3(1.06,.98,.94),smoothstep(-.5,.5,ashNoise))).mul(macro);
  const ashCol=mix(baseGrassCol,ashBase,.68);
  const grassCol=flags.x.greaterThan(.5).select(snowCol,flags.y.greaterThan(.5).select(sandCol,flags.z.greaterThan(.5).select(ashCol,baseGrassCol)));
  const soilTint=u.soilTint?value(u.soilTint,'color'):vec3(.78,.74,.65);
  const soilLuma=dot(soilSample,lumaWeights);
  const swashRipple=sin(worldPos.x.mul(2.9).add(worldPos.z.mul(1.7)).add(sin(worldPos.z.mul(.45)).mul(1.2)));
  const beachSand=mix(vec3(.51,.43,.29),vec3(.72,.63,.44),smoothstep(-.6,.6,swashRipple)).mul(mix(1,.76,shore)).mul(float(.68).add(soilLuma.mul(.54)));
  const baseSoilCol=soilSample.mul(soilTint).mul(mix(1,.72,shore)).mul(mix(1,.88,terrainRoad));
  const soilCol=mix(baseSoilCol,beachSand,terrainBeach);
  const strataWarp=sin(worldPos.x.mul(.19)).mul(1.5).add(cos(worldPos.z.mul(.19)).mul(1.5));
  const strata=float(.84).add(sin(worldPos.y.mul(6.4).add(strataWarp)).mul(.20)).add(cos(worldPos.y.mul(15.2).add(strataWarp.mul(1.7))).mul(.08));
  const crevice=smoothstep(.42,.88,sin(worldPos.x.mul(1.45).sub(worldPos.y.mul(2.6))).mul(cos(worldPos.z.mul(1.45).add(worldPos.y.mul(2.3)))));
  const ledgeDust=smoothstep(.64,.90,worldNormalY);
  const emberMask=smoothstep(.62,.92,crevice).mul(smoothstep(.22,.75,weights.z)).mul(float(1).sub(ledgeDust));
  const rawRock=rockSample.mul(value(u.cliffTint,'color')).mul(strata).mul(float(1).sub(crevice.mul(.34))).add(flags.z.greaterThan(.5).select(vec3(1.35,.38,.08).mul(emberMask).mul(.55),vec3(0)));
  const rockCol=mix(rawRock,grassCol.mul(.90),ledgeDust.mul(.36));
  const color=grassCol.mul(weights.x).add(soilCol.mul(weights.y)).add(rockCol.mul(weights.z)).mul(value(u.tint,'color'));
  const packedGround=max(terrainPaving.mul(.72),terrainRoad.mul(.24));
  material.colorNode=mix(materialColor.rgb,color,value(u.amount).mul(float(1).sub(packedGround)));
  const rockCoordHigh=uv().mul(scale.z.mul(6.5));
  if(u.grassNormal.value){
    const grassNorm=sample(u.grassNormal,coords[0].mul(.42),flat).rgb;
    const soilNorm=sample(u.soilNormal,coords[1].mul(.55),flat).rgb;
    const rockNorm=sample(u.rockNormal,rockCoordHigh,flat).rgb;
    material.normalNode=normalMap(grassNorm.mul(weights.x).add(soilNorm.mul(weights.y)).add(rockNorm.mul(weights.z)),vec2(mix(.48,.76,weights.z).mul(float(1).sub(terrainPaving.mul(.52)))));
  }else material.normalNode=null;
  if(u.grassArm.value){
    const armRough=sample(u.grassArm,coords[0].mul(.16)).g.mul(weights.x).add(sample(u.soilArm,coords[1].mul(.18)).g.mul(weights.y)).add(sample(u.rockArm,rockCoordHigh).g.mul(weights.z));
    const roughness=clamp(mix(mix(armRough,.34,shore.mul(.55)),.48,flags.x.mul(.35)),.22,1);
    material.roughnessNode=materialRoughness.mul(mix(roughness,.94,terrainPaving));
  }else material.roughnessNode=null;
  material.needsUpdate=true;
}

export function unitPalette(material,u){
  const surface=varying(attribute('unitSurface','vec3'));
  const teams=uniformArray(u.teams.value,'color'),roofs=uniformArray(u.roofs.value,'color');
  const team=Fn(builder=>{
    if(!builder.object.isInstancedMesh)return vec3(1);
    const owner=int(clamp(attribute('instanceOwner','float'),0,7).add(.5));
    const mask=attribute('unitTeamMask','float');
    return mask.greaterThan(1.5).select(roofs.element(owner),mask.greaterThan(.01).select(mix(vec3(.76,.71,.61),teams.element(owner),clamp(mask,0,1)),vec3(1)));
  })().toVarying();
  const tile=clamp(floor(surface.z.add(.5)).sub(2),0,3),repeats=tile.lessThan(.5).select(6,tile.lessThan(1.5).select(4,tile.lessThan(2.5).select(2,10)));
  const coords=vec2(tile.mod(2),floor(tile.div(2))).mul(256).add(16).add(fract(uv().mul(repeats)).mul(224)).div(512);
  const character=surface.z.greaterThan(1.5).and(value(u.characterReady).greaterThan(.5)),wood=surface.z.greaterThan(.5).and(surface.z.lessThan(1.5)),steel=surface.z.greaterThan(3.5).and(surface.z.lessThan(4.5));
  const tint=Fn(()=>{
    const color=vec3(1).toVar();
    If(character,()=>{
      const charTex=sample(u.characterColor,coords).rgb;
      color.assign(steel.select(mix(charTex,charTex.mul(vec3(1.06,1.08,1.12)),.55),charTex));
    }).ElseIf(wood,()=>{color.assign(sample(u.wood).rgb);});
    return color;
  })();
  material.colorNode=materialColor.rgb.mul(team).mul(tint);
  const steelRough=steel.select(.82,1);
  material.roughnessNode=clamp(surface.x.mul(steelRough),.04,1);material.metalnessNode=clamp(surface.y.add(steel.select(.08,0)),0,steel.select(.62,1));material.normalNode=null;
  if(u.characterNormal.value){
    const detail=character.select(float(1).sub(smoothstep(42,110,positionView.length())),0);
    const amount=detail.mul(value(u.characterDetail)),active=amount.greaterThan(.001),strength=surface.z.greaterThan(4.5).select(.16,.38);
    const micro=Fn(()=>{const result=vec4(.5,.5,1,surface.x).toVar();If(active,()=>{result.assign(sample(u.characterNormal,coords,flat));});return result;})();
    material.roughnessNode=clamp(mix(surface.x,micro.a,amount).mul(steelRough),.04,1);
    material.normalNode=normalMap(micro.rgb,vec2(strength.mul(amount)));
  }
  material.needsUpdate=true;
}

export function structurePalette(material,u){
  const surface=varying(attribute('structureSurface','vec3')),mode=surface.z,worldPos=varying(positionGeometry);
  const plinthMask=float(1).sub(smoothstep(0,.82,max(0,worldPos.y)));
  const choose=(suffix='',fallback=white)=>Fn(()=>{
    const result=vec3(suffix==='Normal'?vec3(.5,.5,1):vec3(1)).toVar();
    If(mode.greaterThan(3.5),()=>{
      if(!suffix){
        const shingle=float(.97).add(sin(worldPos.y.mul(19.5).add(worldPos.x.add(worldPos.z).mul(2.8))).mul(.055));
        result.assign(sample(u.roof).rgb.mul(shingle));
      }
    }).ElseIf(mode.greaterThan(2.5),()=>{
      if(!suffix){
        const plasterTex=sample(u.plaster,uv().mul(1.15),fallback).rgb;
        const plinthStone=sample(u.stone,uv().mul(1.6),fallback).rgb.mul(.84);
        result.assign(mix(plasterTex.mul(1.04),plinthStone,plinthMask.mul(.62)));
      }else result.assign(sample(u['plaster'+suffix],uv(),fallback).rgb);
    }).ElseIf(mode.greaterThan(1.5),()=>{
      if(!suffix){
        const ashlar=float(.96).add(sin(worldPos.y.mul(12)).mul(cos(worldPos.x.sub(worldPos.z).mul(4.8))).mul(.07));
        result.assign(sample(u.stone,uv().mul(1.25),fallback).rgb.mul(ashlar).mul(mix(1,.85,plinthMask.mul(.48))));
      }else result.assign(sample(u['stone'+suffix],uv(),fallback).rgb);
    }).ElseIf(mode.greaterThan(.5),()=>{
      if(!suffix){
        const grain=float(.96).add(sin(worldPos.x.add(worldPos.y.mul(2.4)).add(worldPos.z).mul(10.5)).mul(.055));
        result.assign(sample(u.wood,uv().mul(1.2),fallback).rgb.mul(grain));
      }else result.assign(sample(u['wood'+suffix],uv(),fallback).rgb);
    });
    return result;
  })();
  const earthSkirt=float(1).sub(smoothstep(0,.44,max(0,worldPos.y)));
  const groundAo=mix(.84,1,smoothstep(0,1.15,max(0,worldPos.y)));
  const structureOcclusion=mix(.84,1,smoothstep(0,1.1,max(0,worldPos.y)));
  material.colorNode=materialColor.rgb.mul(choose()).mul(mix(vec3(1),vec3(.88,.84,.75),earthSkirt.mul(.45))).mul(groundAo);
  const active=mode.greaterThan(.5).and(mode.lessThan(3.5)).and(value(u.detail).greaterThan(.5));
  const arm=Fn(()=>{const result=vec3(1).toVar();If(active,()=>{result.assign(choose('Arm'));});return result;})();
  const normSample=Fn(()=>{const result=vec3(.5,.5,1).toVar();If(active,()=>{result.assign(choose('Normal',flat));});return result;})();
  material.roughnessNode=clamp(surface.x.mul(arm.g),.04,1);
  material.metalnessNode=clamp(surface.y,0,1);
  material.aoNode=mix(1,arm.r,.72).mul(structureOcclusion);
  const normalScale=mode.greaterThan(2.5).select(.30,mode.greaterThan(1.5).select(.54,.38));
  material.normalNode=active.select(normalMap(normSample,vec2(normalScale)),normalViewGeometry);
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
  const foamStrength=value(material.frontierWaterFoam);
  const shore=attribute('frontierWaterShore','float'),bank=varying(vec2(attribute('frontierWaterDepth','float'),shore));
  const xz=varying(positionGeometry.xz),a=positionGeometry.x.mul(.9).add(positionGeometry.z.mul(.36)).add(time.mul(1.3)),b=positionGeometry.z.mul(.65).sub(time);
  const fade=smoothstep(0,1,shore).mul(motion);
  const wave=vec3(sin(a).mul(.05).add(cos(b).mul(.025)),cos(a).mul(.045),cos(a).mul(.018).sub(sin(b).mul(.01625))).mul(fade);
  const displaced=positionGeometry.add(vec3(0,wave.x,0));
  const waveNormal=Fn(()=>{normalLocal.assign(normalize(vec3(wave.y.negate(),1,wave.z.negate())));return displaced;})();
  material.positionNode=waveNormal;
  const depth=min(max(bank.x,0),bank.y.mul(1.6)),absorption=float(1).sub(exp(depth.mul(-1.65)));
  const shallowCol=value(material.frontierWaterShallow,'color'),deepCol=value(material.frontierWaterDeep,'color');
  const current=sin(xz.x.mul(1.22).add(sin(xz.y.mul(.34).add(time.mul(.34))).mul(.86)).add(xz.y.mul(.13)).sub(time.mul(.55)));
  material.colorNode=Fn(()=>{
    const tone=materialColor.rgb.mul(mix(shallowCol,deepCol,absorption)).mul(float(1).add(current.mul(.078))).toVar();
    If(detail.greaterThan(.5).and(depth.lessThan(1.10)),()=>{
      const a=noise(xz.mul(1.45).add(vec2(time.mul(.22),time.mul(.14))));
      const b=noise(xz.mul(2.15).sub(vec2(time.mul(.16),time.mul(-.25))));
      const caustic=pow(max(0,float(1).sub(abs(a.sub(b)).mul(2))),4)
        .mul(float(1).sub(absorption)).mul(light).mul(float(1).sub(smoothstep(.55,1.10,depth))).mul(.24);
      tone.addAssign(shallowCol.mul(caustic));
    });
    return tone;
  })();
  const wetEdge=smoothstep(0,.44,bank.y).mul(smoothstep(0,.22,depth));
  material.opacityNode=materialOpacity.mul(mix(.30,1,absorption)).mul(wetEdge);
  material.normalNode=Fn(()=>{
    const distortion=float(0).toVar();
    If(detail.greaterThan(.5),()=>{distortion.assign(noise(xz.mul(.28).add(vec2(time.mul(.08),time.mul(.05)))).sub(.5).mul(3.8));});
    const ra=cos(dot(xz,vec2(3.7,1.9)).add(time.mul(2.4)).add(distortion));
    const rb=cos(dot(xz,vec2(-2.1,3.1)).sub(time.mul(1.9)).sub(distortion.mul(.73)));
    const rc=cos(dot(xz,vec2(1.3,-4.2)).add(time.mul(1.4)).add(distortion.mul(.41)));
    const rd=detail.greaterThan(.5).select(cos(dot(xz,vec2(-3.8,-2.5)).add(time.mul(2.9)).sub(distortion.mul(.55))),0);
    const slope=vec2(.42,.22).mul(ra).add(vec2(-.22,.31).mul(rb)).add(vec2(.10,-.27).mul(rc)).add(vec2(-.18,-.12).mul(rd));
    const coverage=float(1).div(float(1).add(xz.fwidth().length().mul(2.5)));
    return normalize(normalViewGeometry.add(mat3(cameraViewMatrix).mul(vec3(slope.x,0,slope.y)).mul(ripples).mul(coverage)));
  })();
  material.outputNode=Fn(()=>{
    const fresnel=float(.02).add(pow(float(1).sub(clamp(dot(normalView,positionViewDirection),0,1)),5).mul(.98));
    const reflection=reflect(positionViewDirection.negate(),normalView).transformDirection(cameraWorldMatrix);
    const skyGradient=sky.mul(mix(.76,1.18,clamp(reflection.y.mul(.5).add(.5),0,1)));
    const color=mix(output.rgb,skyGradient,fresnel).toVar();
    If(bank.y.lessThan(1.65).and(depth.lessThan(.82)),()=>{
      const drift=vec2(time.mul(.16),time.mul(-.11));
      const cells=noise(xz.mul(1.65).add(drift));
      const foamNoise=float(cells).toVar();
      If(detail.greaterThan(.5),()=>{foamNoise.assign(mix(cells,noise(xz.mul(4.1).sub(drift.mul(1.4))),.38));});
      const wash=sin(dot(xz,vec2(.27,.58)).add(time.mul(1.15))).mul(.14).add(cells.sub(.5).mul(.2));
      const waterline=float(1).sub(smoothstep(.18,.68,depth.add(wash))).mul(float(1).sub(smoothstep(.65,1.65,bank.y)));
      const lacing=smoothstep(.32,.79,foamNoise).mul(smoothstep(.05,.22,bank.y));
      color.assign(mix(color,vec3(.84,.88,.80).mul(light),waterline.mul(lacing).mul(foamStrength)));
    });
    return vec4(color,output.a);
  })();
  material.needsUpdate=true;
}

export function skyDome(material,u){
  const dir=normalize(varying(positionGeometry)),horizon=value(u.horizon,'color'),zenith=value(u.zenith,'color');
  const sunDir=normalize(value(u.sunDir,'vec3')),sunColor=value(u.sunColor,'color');
  const night=value(u.night),clouds=value(u.clouds);
  const height=clamp(dir.y,0,1),skyT=pow(height,.52);
  const base=mix(horizon,zenith,skyT);
  const haze=exp(abs(dir.y).mul(-8.5)).mul(.16).mul(float(1).sub(night.mul(.72))).mul(float(1).sub(clouds.mul(.65)));
  const sunDot=max(dot(dir,sunDir),0);
  const solarClear=float(1).sub(clouds.mul(.86)).mul(float(1).sub(night.mul(.92)));
  const sunGlow=sunColor.mul(pow(sunDot,10).mul(.22).add(pow(sunDot,84).mul(.46))).mul(solarClear);
  const moonGlow=vec3(.78,.86,1).mul(pow(sunDot,56).mul(.20)).mul(night).mul(float(1).sub(clouds.mul(.84)));
  material.colorNode=clamp(base.add(horizon.mul(haze)).add(sunGlow).add(moonGlow),0,2);
  material.needsUpdate=true;
}
