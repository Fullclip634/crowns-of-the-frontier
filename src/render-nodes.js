import {DataTexture,RGBAFormat,UnsignedByteType,MeshStandardMaterial,MeshBasicMaterial,Color,Vector2,Vector3} from 'three';
import {MeshStandardNodeMaterial as ThreeStandardNodeMaterial,MeshBasicNodeMaterial as ThreeBasicNodeMaterial,RenderPipeline} from 'three/webgpu';
import {bloom} from 'three/addons/tsl/display/BloomNode.js';
import {configureCompatibilityShadow} from './compatibility-depth.js';
export {WebGPURenderer,PMREMGenerator,ClippingGroup,RenderPipeline} from 'three/webgpu';
import {Fn,If,attribute,varying,texture,textureLoad,reference,uniformArray,uv,vec2,vec3,vec4,mat3,mat4,int,ivec2,float,instanceIndex,instanceColor,positionGeometry,positionLocal,positionView,positionWorld,normalLocal,normalViewGeometry,normalView,positionViewDirection,cameraViewMatrix,cameraWorldMatrix,diffuseColor,materialColor,materialRoughness,materialOpacity,output,normalMap,mix,clamp,min,max,abs,dot,smoothstep,exp,pow,sin,cos,fract,floor,reflect,normalize,step,interleavedGradientNoise,vogelDiskSample,screenCoordinate,renderGroup,pass} from 'three/tsl';

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
// Keep the async WebGPU chunk completely independent of the main entry bundle.
const fallbackAtmosphere=()=>({
  cloudMap:{value:white},cloudOffset:{value:new Vector2(0,0)},cloudScale:{value:.0092},cloudStrength:{value:0},
  wetness:{value:0},sunDir:{value:new Vector3(-48,62,32).normalize()},sunColor:{value:new Color(0xffe7c4)},
  iblSky:{value:new Color(0x5282b4)},iblHorizon:{value:new Color(0xdce8ef)},iblGround:{value:new Color(0x6e7d56)},
  iblIntensity:{value:.46},night:{value:0},
});
export function battlefieldFog(material,fog,unexploredAlpha){
  const surface=material.outputNode||output,scale=value(fog.scale),position=positionWorld.xz.mul(scale);
  const border=smoothstep(.5,scale.mul(4).add(.5),max(abs(position.x),abs(position.y)));
  const fogUv=position.add(.5),fogStep=scale.mul(1.3),mask=fog.mask.value;
  // Five diagonal taps reuse the single mask TextureNode binding so WebGPU
  // compatibility sampler budgets stay unchanged while softening grid edges.
  const sampled=texture(mask,fogUv).a.mul(.4)
    .add(texture(mask,fogUv.add(vec2(fogStep,fogStep))).a
      .add(texture(mask,fogUv.add(vec2(fogStep.negate(),fogStep))).a)
      .add(texture(mask,fogUv.add(vec2(fogStep,fogStep.negate()))).a)
      .add(texture(mask,fogUv.add(vec2(fogStep.negate(),fogStep.negate()))).a).mul(.15));
  const amount=mix(sampled,unexploredAlpha,border).mul(value(fog.enabled));
  material.outputNode=vec4(mix(surface.rgb,value(fog.tint,'color'),amount),surface.a);
  material.needsUpdate=true;
}

export function grassWind(material,u){
  const time=value(u.time),strength=value(u.strength);
  const dir=u.dir?value(u.dir,'vec2'):vec2(.84,.54);
  material.positionNode=Fn(()=>{
    const position=positionLocal.toVar();
    If(strength.greaterThan(.0001),()=>{
      const bend=clamp(positionGeometry.y.mul(2.4),0,1);
      const wavePhase=dot(positionLocal.xz,dir.mul(.22));
      const gust=sin(time.mul(1.9).sub(wavePhase))
        .add(sin(time.mul(3.1).sub(positionLocal.x.mul(.39)).add(positionLocal.z.mul(.33))).mul(.38));
      const offset=gust.mul(bend.mul(bend)).mul(strength);
      position.addAssign(vec3(offset.mul(dir.x),0,offset.mul(dir.y)));
    });
    return position;
  })();
  material.needsUpdate=true;
}

function analyticIblOutput(metalness,roughness,atm,nightNode=null){
  // Use the same textured and vertex-tinted albedo as the direct lighting.
  const albedo=diffuseColor.rgb;
  const sunDir=normalize(value(atm.sunDir,'vec3'));
  const sunColor=value(atm.sunColor,'color');
  const iblSky=value(atm.iblSky,'color');
  const iblHorizon=value(atm.iblHorizon,'color');
  const iblGround=value(atm.iblGround,'color');
  const iblIntensity=value(atm.iblIntensity);
  const nightAmount=nightNode||value(atm.night);
  const wetness=value(atm.wetness);
  return Fn(()=>{
    const color=output.rgb.toVar();
    const nDotV=clamp(dot(normalView,positionViewDirection),0,1);
    const fresnel=pow(float(1).sub(nDotV),4);
    const worldNormal=normalize(normalView.transformDirection(cameraWorldMatrix));
    const worldRefl=normalize(reflect(positionViewDirection.negate(),normalView).transformDirection(cameraWorldMatrix));
    const skyUp=smoothstep(-.35,.78,worldRefl.y);
    const horizonBand=exp(abs(worldRefl.y).mul(-4.6));
    const envSpec=mix(iblGround.mul(.72),iblSky.mul(1.15),skyUp).add(iblHorizon.mul(horizonBand).mul(.34));
    const upMix=worldNormal.y.mul(.5).add(.5);
    const envDiffuse=mix(iblGround.mul(.85),mix(iblHorizon,iblSky,.45),upMix);
    const sunAlign=max(dot(worldRefl,sunDir),0);
    const gloss=clamp(float(1).sub(roughness),0,1);
    const specExp=mix(10,96,gloss.mul(gloss));
    const sunSpec=sunColor.mul(pow(sunAlign,specExp).mul(float(.28).add(gloss.mul(.62))).add(pow(sunAlign,12).mul(.07))).mul(float(1).sub(nightAmount.mul(.72)));
    const metalMask=smoothstep(.06,.48,metalness);
    const baseLuma=dot(color,vec3(.3,.59,.11));
    const lightFloor=clamp(baseLuma.mul(1.15).add(.30),.24,1.15);
    const shadowLift=float(1).sub(smoothstep(0,.55,baseLuma)).mul(float(1).sub(metalMask.mul(.75)));
    const diffuseBounce=albedo.mul(envDiffuse).mul(iblIntensity).mul(float(.08).add(shadowLift.mul(.16))).mul(float(1).sub(nightAmount.mul(.45)));
    const dielecSpecWeight=float(.04).add(fresnel.mul(.34)).mul(gloss.mul(gloss)).mul(float(.42).add(wetness.mul(.85))).mul(float(1).sub(metalMask.mul(.5)));
    const dielecSpec=envSpec.mul(.55).add(sunSpec.mul(.45)).mul(dielecSpecWeight).mul(iblIntensity).mul(lightFloor);
    const metalTint=mix(vec3(.78),albedo,float(.80));
    const metalFresnel=float(.28).add(fresnel.mul(.72));
    const metalSpec=metalTint.mul(envSpec.mul(.88).add(sunSpec.mul(.72))).mul(metalFresnel).mul(float(.22).add(gloss.mul(.78))).mul(metalMask).mul(iblIntensity).mul(lightFloor).mul(float(1).sub(nightAmount.mul(.42)));
    color.addAssign(diffuseBounce.add(dielecSpec).add(metalSpec));
    return vec4(color,output.a);
  })();
}

function cloudLightNode(worldXZ,atm,strengthScale=1){
  const strength=value(atm.cloudStrength).mul(strengthScale);
  const scale=value(atm.cloudScale);
  const offset=value(atm.cloudOffset,'vec2');
  const skyTint=value(atm.iblSky,'color');
  const cover=sample(atm.cloudMap,worldXZ.mul(scale).add(offset)).r;
  const shade=clamp(cover.mul(strength),0,.55);
  const coolTint=mix(vec3(.84,.90,1),normalize(max(skyTint,vec3(.15))).mul(1.15),.35);
  return mix(vec3(1.03,1.015,.99),coolTint.mul(float(1).sub(shade.mul(.78))),shade);
}

export function createBloomPipeline(view){
  const pipeline=new RenderPipeline(view.renderer);
  const scenePass=pass(view.scene,view.camera);
  const scenePassColor=scenePass.getTextureNode('output');
  const bloomPass=bloom(scenePassColor,.22,.44,1.15);
  pipeline.outputNode=scenePassColor.add(bloomPass);
  return pipeline;
}

const sample=(holder,coords=uv(),fallback=white)=>{
  // TextureNode hashes the initial texture when sharing shader bindings. Start
  // with the real map so distinct surfaces never share a white-placeholder slot.
  const node=texture(holder.value||fallback,coords);
  node.onRenderUpdate(()=>{node.value=holder.value||fallback;});return node;
};

export function terrain(material,u){
  const scale=value(u.scale,'vec3'),worldPos=varying(positionGeometry);
  // Biome flags are constant per battlefield; specialize the TSL node graph at
  // compile time so non-matching biomes omit dead trig/magma ALU & registers.
  const biomeVec=u.biomeFlags?.value;
  const isSnow=!!(biomeVec&&biomeVec.x>.5);
  const isArid=!!(biomeVec&&!isSnow&&biomeVec.y>.5);
  const isVolcanic=!!(biomeVec&&!isSnow&&!isArid&&biomeVec.z>.5);
  const isShore=!!(biomeVec&&biomeVec.w>.5);
  const worldNormal=varying(normalize(normalLocal)),worldNormalY=worldNormal.y;
  const coords=[uv().mul(scale.x),uv().mul(scale.y),uv().mul(scale.z).mul(5.5)];
  const rotUv=p=>vec2(p.x.mul(.836).sub(p.y.mul(.548)),p.x.mul(.548).add(p.y.mul(.836)));
  const roadSample=sample(u.roads,uv().mul(2).sub(.5)).rgb;
  const terrainPaving=smoothstep(.81,.99,roadSample.r),roadStrength=clamp(roadSample.r.mul(1.30),0,1);
  const edgeNoise=sin(worldPos.x.mul(1.45).add(worldPos.z.mul(1.15))).mul(cos(worldPos.x.mul(.85).sub(worldPos.z.mul(1.65)))).mul(.14);
  const terrainRoad=smoothstep(.08,.88,roadStrength.add(edgeNoise.mul(roadStrength)));
  const baseMix=max(varying(attribute('terrainMix','vec3')),vec3(0));
  const shore=smoothstep(.05,.75,roadSample.b).mul(float(1).sub(smoothstep(.35,.85,baseMix.z)));
  const terrainBeach=isShore?smoothstep(.06,.76,roadSample.g.add(edgeNoise.mul(.55).mul(roadSample.g))).mul(float(1).sub(smoothstep(.32,.80,baseMix.z))).mul(float(1).sub(terrainRoad.mul(.85))):float(0);
  const shoreMix=isShore?max(shore,terrainBeach):shore;
  const mixed=mix(baseMix,vec3(0,1,0),clamp(terrainRoad.mul(.78).add(shoreMix.mul(.68)),0,.94));
  const grassRaw=mix(sample(u.grass,coords[0]).rgb,sample(u.grass,rotUv(coords[0].mul(.17)).add(vec2(.19,.43))).rgb,.46);
  const grassSample=clamp(grassRaw.sub(.5).mul(1.28).add(.5),.05,1.35);
  const soilSample=mix(sample(u.soil,coords[1]).rgb,sample(u.soil,rotUv(coords[1].mul(.19)).add(vec2(.31,.17))).rgb,.44);
  const triWBase=pow(abs(worldNormal),vec3(4.5));
  const triW=triWBase.div(max(triWBase.x.add(triWBase.y).add(triWBase.z),.001));
  const rockTop=mix(sample(u.rock,coords[2]).rgb,sample(u.rock,rotUv(coords[2].mul(2.45)).add(vec2(.23,.41))).rgb,.44);
  const rockSideX=sample(u.rock,worldPos.zy.mul(.088)).rgb;
  const rockSideZ=sample(u.rock,worldPos.xy.mul(.088).add(vec2(.37,.19))).rgb;
  const rockSample=rockSideX.mul(triW.x).add(rockTop.mul(triW.y)).add(rockSideZ.mul(triW.z));
  const lumaWeights=vec3(.3,.59,.11);
  const sampleLuma=vec3(dot(grassSample,lumaWeights),dot(soilSample,lumaWeights),dot(rockSample,lumaWeights).add(.16));
  const heightWeighted=mixed.mul(pow(max(sampleLuma,vec3(.06)),vec3(2.35)));
  const weights=heightWeighted.div(max(dot(heightWeighted,vec3(1)),.001));
  const macro=mix(vec3(1),clamp(materialColor.rgb.div(value(u.macroReference,'color')),vec3(.68),vec3(1.26)),value(u.macroStrength));
  let grassCol;
  if(isSnow){
    const driftWave=sin(worldPos.x.mul(.36).sub(worldPos.z.mul(.18)).add(sin(worldPos.z.mul(.13)).mul(1.4)));
    const snowSparkle=sin(worldPos.x.mul(5.1).add(worldPos.z.mul(4.3))).mul(cos(worldPos.z.mul(4.7).sub(worldPos.x.mul(3.8))));
    const snowTint=mix(vec3(.84,.91,.98),vec3(1.03,1.04,1.06),smoothstep(-.65,.65,driftWave));
    grassCol=grassSample.mul(snowTint).mul(float(.97).add(snowSparkle.mul(.04))).mul(mix(vec3(1),macro,.65));
  }else if(isArid){
    const sandRipple=sin(worldPos.x.mul(2.8).add(worldPos.z.mul(1.15)).add(sin(worldPos.z.mul(.45)).mul(1.6)));
    const duneShade=mix(vec3(.92,.80,.62),vec3(1.10,.99,.80),smoothstep(-.7,.7,sandRipple));
    grassCol=grassSample.mul(mix(vec3(1),value(u.grassTint,'color').mul(1.18),.48)).mul(duneShade).mul(macro);
  }else if(isVolcanic){
    const ashDrift=sin(worldPos.x.mul(.52).sub(worldPos.z.mul(.39)).add(sin(worldPos.z.mul(.25)).mul(1.5)));
    grassCol=mix(grassSample,soilSample.mul(.85),.30).mul(value(u.grassTint,'color')).mul(mix(vec3(.76,.72,.70),vec3(1.06,.99,.94),smoothstep(-.55,.55,ashDrift))).mul(macro);
  }else{
    const cloverDapple=sin(worldPos.x.mul(.42).add(worldPos.z.mul(.36))).mul(cos(worldPos.x.mul(.29).sub(worldPos.z.mul(.48))));
    const tuftGrain=sin(worldPos.x.mul(2.8).add(cos(worldPos.z.mul(2.1)))).mul(cos(worldPos.z.mul(2.6).sub(sin(worldPos.x.mul(1.9)))));
    grassCol=grassSample.mul(value(u.grassTint,'color')).mul(macro).mul(mix(vec3(.88,.94,.84),vec3(1.08,1.12,.94),smoothstep(-.42,.48,cloverDapple))).mul(float(.96).add(tuftGrain.mul(.09)));
  }
  const soilTint=u.soilTint?value(u.soilTint,'color'):vec3(.78,.74,.65);
  const baseSoilCol=soilSample.mul(soilTint).mul(mix(1,.70,shore)).mul(mix(1,.88,terrainRoad));
  let soilCol=baseSoilCol;
  if(isShore){
    const swashRipple=sin(worldPos.x.mul(2.6).add(worldPos.z.mul(1.5)).add(sin(worldPos.z.mul(.42)).mul(1.3)));
    const sandGrain=mix(vec3(dot(soilSample,lumaWeights)),soilSample,.48);
    const beachSand=sandGrain.mul(mix(vec3(1.06,.96,.72),vec3(1.26,1.16,.92),smoothstep(-.65,.65,swashRipple))).mul(mix(1,.74,shore.mul(.78)));
    soilCol=mix(baseSoilCol,beachSand,terrainBeach);
  }
  const strataWarp=sin(worldPos.x.mul(.19)).mul(1.5).add(cos(worldPos.z.mul(.19)).mul(1.5));
  const strata=float(.84).add(sin(worldPos.y.mul(6.4).add(strataWarp)).mul(.20)).add(cos(worldPos.y.mul(15.2).add(strataWarp.mul(1.7))).mul(.08));
  const ledgeDust=smoothstep(.72,.93,worldNormalY);
  let rawRock;
  if(isVolcanic){
    // Multi-frequency jagged basalt fractures broken into localized magma pockets (matches WebGL2).
    const fq=worldPos.xz.mul(.34).add(vec2(worldPos.y.mul(.42),worldPos.y.mul(-.36)));
    const fw=fq.add(vec2(sin(fq.x.mul(2.1).add(cos(fq.y.mul(1.9)))).mul(.42),cos(fq.y.mul(2.3).sub(sin(fq.x.mul(2.0)))).mul(.42)));
    const jag=sin(fw.x.mul(5.7).sub(fw.y.mul(4.9))).mul(.16).add(cos(fw.x.mul(8.3).add(fw.y.mul(7.1))).mul(.09));
    const ridgeA=abs(sin(fw.x.mul(1.65).add(fw.y.mul(1.05)).add(jag)).add(cos(fw.x.mul(.92).sub(fw.y.mul(1.75)).sub(jag))));
    const ridgeB=abs(sin(fw.x.mul(3.4).sub(fw.y.mul(2.5)).add(jag.mul(1.4))).add(cos(fw.y.mul(3.1).add(fw.x.mul(2.2)))));
    const pocket=smoothstep(.18,.72,sin(worldPos.x.mul(.085).add(cos(worldPos.z.mul(.072)).mul(1.8))).mul(cos(worldPos.z.mul(.081).sub(sin(worldPos.x.mul(.068)).mul(1.5)))).mul(.5).add(.5));
    const crevice=clamp(max(float(1).sub(smoothstep(.015,.15,ridgeA)),float(1).sub(smoothstep(.015,.12,ridgeB)).mul(.50)).mul(pocket),0,1);
    const slopeCrag=float(1).sub(smoothstep(.76,.96,worldNormalY));
    const emberMask=smoothstep(.28,.86,crevice).mul(smoothstep(.32,.78,weights.z)).mul(float(.22).add(slopeCrag.mul(.78)));
    const coreHot=smoothstep(.62,.95,crevice).mul(emberMask);
    const lavaGlow=vec3(1.65,.34,.04).mul(emberMask).mul(.78).add(vec3(2.1,1.05,.30).mul(coreHot).mul(.75));
    rawRock=rockSample.mul(value(u.cliffTint,'color')).mul(strata).mul(float(1).sub(crevice.mul(.42))).mul(vec3(.74,.72,.74)).add(lavaGlow);
  }else{
    const creviceA=smoothstep(.34,.88,abs(sin(worldPos.x.mul(1.65).sub(worldPos.y.mul(2.8))).mul(cos(worldPos.z.mul(1.65).add(worldPos.y.mul(2.5))))));
    const vertFissure=float(1).sub(smoothstep(.05,.34,abs(sin(worldPos.x.mul(1.15).add(worldPos.z.mul(.95)).add(sin(worldPos.y.mul(1.2)).mul(.45))))));
    const crevice=clamp(creviceA.mul(.72).add(vertFissure.mul(.52).mul(float(1).sub(worldNormalY))),0,1);
    const rimHighlight=smoothstep(.54,.72,worldNormalY).mul(float(1).sub(smoothstep(.76,.92,worldNormalY)));
    const baseRock=rockSample.mul(value(u.cliffTint,'color')).mul(strata).mul(float(1).sub(crevice.mul(.50)));
    rawRock=mix(baseRock,baseRock.mul(vec3(1.16,1.12,1.01)).add(vec3(.06,.05,.03)),rimHighlight.mul(.65));
  }
  const rockCol=mix(rawRock,grassCol.mul(.90),ledgeDust.mul(isSnow?.58:.34));
  const baseTerrainColor=grassCol.mul(weights.x).add(soilCol.mul(weights.y)).add(rockCol.mul(weights.z));
  const pavingHolder=u.paving||u.rock;
  const pavingUv=worldPos.xz.mul(.46);
  const pavingTex=mix(sample(pavingHolder,pavingUv).rgb,sample(pavingHolder,rotUv(pavingUv.mul(.31)).add(vec2(.41,.19))).rgb,.20);
  const pavingLuma=dot(pavingTex,lumaWeights);
  const pavingAo=mix(.62,1.12,smoothstep(.16,.70,pavingLuma));
  const mortar=float(1).sub(smoothstep(.18,.46,pavingLuma));
  const edgeWear=float(1).sub(smoothstep(.22,.86,terrainPaving)).mul(.58);
  const plazaTint=u.plazaTint?value(u.plazaTint,'color'):vec3(.61,.60,.55);
  const plazaColor=mix(pavingTex.mul(mix(vec3(1.08,1.02,.90),plazaTint.mul(1.42),.44)).mul(pavingAo),soilCol.mul(.88),clamp(mortar.mul(.34).add(edgeWear.mul(.44)),0,.72));
  const color=mix(baseTerrainColor,plazaColor,terrainPaving.mul(.94)).mul(value(u.tint,'color'));
  const packedGround=terrainRoad.mul(.18).mul(float(1).sub(terrainPaving.mul(.85)));
  const atm=u.atmosphere||fallbackAtmosphere();
  const wetness=value(atm.wetness);
  const rainDarken=mix(1,.78,wetness.mul(float(.45).add(max(terrainRoad,max(terrainPaving,weights.z)).mul(.55))));
  const cloudMod=cloudLightNode(worldPos.xz,atm,1);
  material.colorNode=mix(materialColor.rgb,color,value(u.amount).mul(float(1).sub(packedGround))).mul(rainDarken).mul(cloudMod);
  const rockCoordHigh=uv().mul(scale.z.mul(6.5));
  if(u.grassNormal.value){
    const grassNorm=sample(u.grassNormal,coords[0].mul(.42),flat).rgb;
    const soilNorm=sample(u.soilNormal,coords[1].mul(.55),flat).rgb;
    const rockNormTop=sample(u.rockNormal,rockCoordHigh,flat).rgb;
    const rockNormX=sample(u.rockNormal,worldPos.zy.mul(.088),flat).rgb;
    const rockNormZ=sample(u.rockNormal,worldPos.xy.mul(.088).add(vec2(.37,.19)),flat).rgb;
    const rockNorm=rockNormX.mul(triW.x).add(rockNormTop.mul(triW.y)).add(rockNormZ.mul(triW.z));
    material.normalNode=normalMap(grassNorm.mul(weights.x).add(soilNorm.mul(weights.y)).add(rockNorm.mul(weights.z)),vec2(mix(.52,.86,weights.z).mul(float(1).sub(terrainPaving.mul(.45)))));
  }else material.normalNode=null;
  if(u.grassArm.value){
    const grassArmSample=sample(u.grassArm,coords[0].mul(.17));
    const soilArmSample=sample(u.soilArm,coords[1].mul(.19));
    const rockArmSample=sample(u.rockArm,rockCoordHigh);
    const armAo=grassArmSample.r.mul(weights.x).add(soilArmSample.r.mul(weights.y)).add(rockArmSample.r.mul(weights.z));
    const armRough=grassArmSample.g.mul(weights.x).add(soilArmSample.g.mul(weights.y)).add(rockArmSample.g.mul(weights.z));
    const shoreRough=mix(armRough,.30,shore.mul(.62));
    const roughness=clamp(isSnow?mix(shoreRough,.44,.38):shoreRough,.22,1);
    const pavingRough=mix(.92,.62,smoothstep(.22,.78,pavingLuma));
    const baseRough=materialRoughness.mul(mix(roughness,pavingRough,terrainPaving));
    const wetSurface=wetness.mul(float(.35).add(max(terrainRoad,max(terrainPaving,weights.z)).mul(.65)));
    material.roughnessNode=clamp(mix(baseRough,.22,wetSurface.mul(.74)),.16,1);
    material.aoNode=mix(1,armAo,.65).mul(mix(1,pavingAo,terrainPaving.mul(.85)));
  }else{material.roughnessNode=null;material.aoNode=null;}
  material.needsUpdate=true;
}

export function unitPalette(material,u){
  const surface=varying(attribute('unitSurface','vec3'));
  const teams=uniformArray(u.teams.value,'color'),roofs=uniformArray(u.roofs.value,'color');
  const team=Fn(builder=>{
    if(!builder.object.isInstancedMesh)return vec3(1);
    const owner=int(clamp(attribute('instanceOwner','float'),0,7).add(.5));
    const mask=attribute('unitTeamMask','float');
    const bold=smoothstep(.55,.98,clamp(mask,0,1));
    const herald=mix(vec3(.76,.71,.61),teams.element(owner),clamp(mask,0,1)).mul(mix(1,1.10,bold));
    return mask.greaterThan(1.5).select(roofs.element(owner),mask.greaterThan(.01).select(herald,vec3(1)));
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
  const atm=u.atmosphere||fallbackAtmosphere();
  const wetness=value(atm.wetness);
  material.colorNode=materialColor.rgb.mul(team).mul(tint);
  const steelRough=steel.select(.76,1);
  material.roughnessNode=clamp(mix(surface.x.mul(steelRough),surface.x.mul(steelRough).mul(.60),wetness.mul(.72)),.04,1);material.metalnessNode=clamp(surface.y.add(steel.select(.12,0)),0,steel.select(.68,1));material.normalNode=null;
  if(u.characterNormal.value){
    const detail=character.select(float(1).sub(smoothstep(42,110,positionView.length())),0);
    const amount=detail.mul(value(u.characterDetail)),active=amount.greaterThan(.001),strength=surface.z.greaterThan(4.5).select(.16,.38);
    const micro=Fn(()=>{const result=vec4(.5,.5,1,surface.x).toVar();If(active,()=>{result.assign(sample(u.characterNormal,coords,flat));});return result;})();
    const roughBase=mix(surface.x,micro.a,amount).mul(steelRough);
    material.roughnessNode=clamp(mix(roughBase,roughBase.mul(.60),wetness.mul(.72)),.04,1);
    material.normalNode=normalMap(micro.rgb,vec2(strength.mul(amount)));
  }
  material.outputNode=analyticIblOutput(material.metalnessNode,material.roughnessNode,atm);
  material.needsUpdate=true;
}

export function structurePalette(material,u){
  const surface=varying(attribute('structureSurface','vec3')),mode=surface.z,worldPos=varying(positionGeometry);
  const nightGlowAttr=varying(attribute('structureNightGlow','float'));
  const plinthMask=float(1).sub(smoothstep(0,.85,max(0,worldPos.y)));
  const roofPbr=u.roofPbr?value(u.roofPbr,'vec3'):vec3(0,0,0);
  const roofUv=roofPbr.x.greaterThan(.5).select(uv().mul(1.65),uv());
  const choose=(suffix='',fallback=white)=>Fn(()=>{
    const result=vec3(suffix==='Normal'?vec3(.5,.5,1):vec3(1)).toVar();
    If(mode.greaterThan(3.5),()=>{
      if(!suffix){
        const shingle=float(.96).add(sin(worldPos.y.mul(19.5).add(worldPos.x.add(worldPos.z).mul(2.8))).mul(.055));
        const roofSample=sample(u.roof,roofUv).rgb;
        const roofLuma=dot(roofSample,vec3(.30,.59,.11));
        const roofDetail=mix(vec3(roofLuma.mul(1.95).add(.28)),roofSample.mul(1.46),.25);
        const roofCol=roofPbr.x.greaterThan(.5).select(mix(vec3(1),roofDetail,.78),roofSample);
        const eaveWeather=mix(.88,1.04,smoothstep(1.8,6.2,worldPos.y));
        result.assign(roofCol.mul(shingle).mul(eaveWeather));
      }else if(u['roof'+suffix]){
        const ready=suffix==='Normal'?roofPbr.y:roofPbr.z;
        If(ready.greaterThan(.5),()=>{result.assign(sample(u['roof'+suffix],roofUv,fallback).rgb);});
      }
    }).ElseIf(mode.greaterThan(2.5),()=>{
      if(!suffix){
        const plasterTex=sample(u.plaster,uv().mul(1.15),fallback).rgb;
        const plinthStone=sample(u.stone,uv().mul(1.6),fallback).rgb.mul(.84);
        const skipPlinth=smoothstep(-.2,-.8,nightGlowAttr);
        const canvasMask=smoothstep(-1.2,-1.8,nightGlowAttr);
        const basePlaster=mix(plasterTex.mul(1.04),plinthStone,plinthMask.mul(.65).mul(float(1).sub(skipPlinth)));
        const cU=worldPos.x.mul(2.4).add(worldPos.z.mul(.7));
        const cV=worldPos.z.mul(2.4).sub(worldPos.x.mul(.7));
        const weaveA=sin(worldPos.x.mul(58).add(worldPos.z.mul(14))).mul(sin(worldPos.z.mul(58).sub(worldPos.x.mul(14))));
        const weaveB=sin(worldPos.x.mul(29).add(worldPos.y.mul(26))).mul(cos(worldPos.z.mul(31).sub(worldPos.y.mul(19))));
        const foldWave=sin(cU.mul(2.9).add(sin(cV.mul(1.7)).mul(.9))).mul(.55).add(cos(cV.mul(3.4).sub(cU.mul(1.1))).mul(.45));
        const mottle=sin(worldPos.x.mul(3.1).add(worldPos.z.mul(2.7))).mul(cos(worldPos.z.mul(2.3).sub(worldPos.x.mul(1.9))));
        const seam=float(1).sub(smoothstep(.92,.99,abs(sin(worldPos.x.mul(2.6).add(worldPos.z.mul(2.6))))).mul(.16));
        const eaveWeather=mix(.84,1.05,smoothstep(1.4,3.6,worldPos.y));
        const clothLuma=clamp(float(.90).add(foldWave.mul(.17)).add(mottle.mul(.09)).add(weaveA.mul(.055)).add(weaveB.mul(.045)),.56,1.16).mul(seam).mul(eaveWeather);
        const clothTint=mix(vec3(.88,.76,.58),vec3(1.06,1.00,.88),smoothstep(-.65,.75,foldWave.add(mottle.mul(.4))));
        const hideCanvas=mix(plasterTex.mul(.5).add(vec3(.5)),vec3(1),.55).mul(clothTint).mul(clothLuma);
        result.assign(mix(basePlaster,hideCanvas,canvasMask));
      }else if(suffix==='Normal')result.assign(sample(u.plasterNormal,uv(),fallback).rgb);
    }).ElseIf(mode.greaterThan(1.5),()=>{
      if(!suffix){
        const ashlar=float(.96).add(sin(worldPos.y.mul(12)).mul(cos(worldPos.x.sub(worldPos.z).mul(4.8))).mul(.07));
        const stoneSample=sample(u.stone,uv().mul(1.25),fallback).rgb;
        const stoneLuma=dot(stoneSample,vec3(.30,.59,.11));
        const warmBrownStone=stoneSample.mul(vec3(1.14,1,.84));
        const coolAshlar=mix(stoneSample,vec3(stoneLuma.mul(1.28),stoneLuma.mul(1.30),stoneLuma.mul(1.34)),.76);
        const silverStone=smoothstep(-.2,-.8,nightGlowAttr);
        result.assign(mix(warmBrownStone,coolAshlar,silverStone).mul(ashlar).mul(mix(1,.85,plinthMask.mul(.48))));
      }else result.assign(sample(u['stone'+suffix],uv(),fallback).rgb);
    }).ElseIf(mode.greaterThan(.5),()=>{
      if(!suffix){
        const grain=float(.94).add(sin(worldPos.x.add(worldPos.y.mul(2.6)).add(worldPos.z).mul(11.5)).mul(.075));
        const woodSample=sample(u.wood,uv().mul(1.25),fallback).rgb;
        const woodLuma=dot(woodSample,vec3(.30,.59,.11));
        const weatheredMask=smoothstep(-.2,-.8,nightGlowAttr);
        const thatchMask=smoothstep(-1.2,-1.8,nightGlowAttr);
        const barkGroove=sin(worldPos.x.mul(26).add(worldPos.z.mul(26)).add(sin(worldPos.y.mul(6.5)).mul(1.4)));
        const driftTone=clamp(woodLuma.mul(2.55).add(.48).add(barkGroove.mul(.10)),.44,1.18);
        const weatheredDrift=vec3(driftTone.mul(1.04),driftTone.mul(.99),driftTone.mul(.90));
        const chosenWood=mix(woodSample,weatheredDrift,weatheredMask).mul(grain);
        const tierCoord=worldPos.y.mul(6.2).add(sin(worldPos.x.mul(3.7).add(worldPos.z.mul(3.3))).mul(.22));
        const tierIdx=floor(tierCoord),tierFrac=fract(tierCoord);
        const stalkPos=worldPos.x.mul(36).add(worldPos.z.mul(36)).add(tierIdx.mul(19.7));
        const fiberA=sin(stalkPos.add(sin(worldPos.y.mul(14).add(stalkPos.mul(.22))).mul(1.4)));
        const fiberB=sin(stalkPos.mul(2.17).sub(worldPos.y.mul(23)).add(tierIdx.mul(8.3)));
        const fiberC=cos(worldPos.x.mul(62).sub(worldPos.z.mul(57)).add(worldPos.y.mul(18)));
        const bundle=sin(worldPos.x.add(worldPos.z).mul(11.4).add(tierIdx.mul(5.3))).mul(.5).add(.5);
        const tierShadow=mix(.66,1.06,smoothstep(0,.28,tierFrac));
        const fiberShade=clamp(float(.78).add(fiberA.mul(.19)).add(fiberB.mul(.13)).add(fiberC.mul(.09)).add(bundle.sub(.5).mul(.16)),.44,1.18);
        const patchNoise=sin(worldPos.x.mul(2.6).sub(worldPos.z.mul(2.3))).mul(cos(worldPos.z.mul(3.5).add(worldPos.y.mul(2.1))));
        const reedColor=mix(vec3(.72,.63,.46),vec3(1.12,1.02,.80),clamp(fiberA.mul(.48).add(.5).add(patchNoise.mul(.22)),0,1));
        const dampMoss=mix(reedColor,vec3(.68,.74,.52),smoothstep(2.8,1.5,worldPos.y).mul(max(patchNoise,0)).mul(.28));
        const shaggyThatch=dampMoss.mul(tierShadow).mul(fiberShade).mul(mix(.86,1.08,clamp(woodLuma.mul(2.2).add(.42),0,1)));
        result.assign(mix(chosenWood,shaggyThatch,thatchMask));
      }else result.assign(sample(u['wood'+suffix],uv(),fallback).rgb);
    }).Else(()=>{
      if(!suffix){
        const clothMask=smoothstep(-1.2,-1.8,nightGlowAttr);
        const linen=sin(worldPos.x.mul(46).add(worldPos.y.mul(22))).mul(cos(worldPos.z.mul(46).sub(worldPos.y.mul(22))));
        const fold=sin(worldPos.x.mul(6.2).add(worldPos.z.mul(5.8)).add(worldPos.y.mul(3.1)));
        result.assign(mix(vec3(1),vec3(clamp(float(.84).add(fold.mul(.09)).add(linen.mul(.055)),.68,1.02)),clothMask));
      }
    });
    return result;
  })();
  const earthSkirt=float(1).sub(smoothstep(0,.48,max(0,worldPos.y)));
  const groundAo=mix(.79,1,smoothstep(0,1.25,max(0,worldPos.y)));
  const structureOcclusion=mix(.80,1,smoothstep(0,1.2,max(0,worldPos.y)));
  const soot=mix(vec3(1),vec3(.86,.82,.73),earthSkirt.mul(.48));
  const roofUp=varying(normalLocal.y);
  const atm=u.atmosphere||fallbackAtmosphere();
  const wetness=value(atm.wetness);
  const snowFlag=u.snow?value(u.snow):float(0);
  const structWetFace=wetness.mul(mix(.45,1,smoothstep(.15,.85,roofUp)));
  const cloudMod=cloudLightNode(positionWorld.xz,atm,.85);
  material.colorNode=Fn(()=>{
    const color=materialColor.rgb.mul(choose()).toVar();
    If(snowFlag.greaterThan(.5).and(mode.greaterThan(3.5)),()=>{
      const drift=sin(worldPos.x.mul(1.85).add(worldPos.z.mul(.71))).mul(cos(worldPos.z.mul(1.31).sub(worldPos.y.mul(.77))));
      const edging=sin(worldPos.x.mul(9.6).sub(worldPos.z.mul(12))).mul(.12);
      const settle=smoothstep(.23,.76,roofUp).mul(smoothstep(-.60,.45,drift.mul(.49).add(edging).add(.28)));
      const grain=float(.84).add(dot(sample(u.roof,roofUv).rgb,vec3(.3,.59,.11)).mul(.16));
      color.assign(mix(color,vec3(.67,.76,.84).mul(grain),settle.mul(.88)));
    });
    return color.mul(soot).mul(groundAo).mul(mix(1,.84,structWetFace)).mul(cloudMod);
  })();
  const active=mode.greaterThan(.5).and(value(u.detail).greaterThan(.5));
  const arm=Fn(()=>{const result=vec3(1).toVar();If(active,()=>{result.assign(choose('Arm'));});return result;})();
  const normSample=Fn(()=>{const result=vec3(.5,.5,1).toVar();If(active,()=>{result.assign(choose('Normal',flat));});return result;})();
  const rainGloss=wetness.mul(mix(.42,.94,smoothstep(.10,.75,roofUp)));
  const roofRough=mode.greaterThan(3.5).select(mix(.68,1.06,arm.g),arm.g);
  const baseRough=surface.x.mul(roofRough);
  material.roughnessNode=clamp(mix(baseRough,baseRough.mul(.40),rainGloss),.04,1);
  material.metalnessNode=clamp(surface.y,0,1);
  material.aoNode=mix(1,arm.r,mode.greaterThan(3.5).select(.82,.72)).mul(structureOcclusion);
  const normalScale=mode.greaterThan(3.5).select(.62,mode.greaterThan(2.5).select(.30,mode.greaterThan(1.5).select(.54,.38)));
  material.normalNode=active.select(normalMap(normSample,vec2(normalScale)),normalViewGeometry);
  const night=value(u.night);
  material.emissiveNode=varying(attribute('structureEmission','vec3')).mul(night.mul(1.65).add(1)).add(vec3(1.18,.56,.16).mul(max(nightGlowAttr,0)).mul(night));
  material.outputNode=analyticIblOutput(material.metalnessNode,material.roughnessNode,atm,night);
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
  const foamStrength=value(material.frontierWaterFoam),sunDir=normalize(value(material.frontierWaterSunDir,'vec3')),sunColor=value(material.frontierWaterSunColor,'color');
  const shore=attribute('frontierWaterShore','float'),bank=varying(vec2(attribute('frontierWaterDepth','float'),shore));
  const pierWake=Fn(builder=>builder.geometry?.hasAttribute?.('frontierWaterPier')?attribute('frontierWaterPier','float'):float(0))().toVarying();
  const xz=varying(positionGeometry.xz),a=positionGeometry.x.mul(.9).add(positionGeometry.z.mul(.36)).add(time.mul(1.3)),b=positionGeometry.z.mul(.65).sub(time);
  const fade=smoothstep(0,1,shore).mul(motion);
  const wave=vec3(sin(a).mul(.05).add(cos(b).mul(.025)),cos(a).mul(.045),cos(a).mul(.018).sub(sin(b).mul(.01625))).mul(fade);
  const displaced=positionGeometry.add(vec3(0,wave.x,0));
  const waveNormal=Fn(()=>{normalLocal.assign(normalize(vec3(wave.y.negate(),1,wave.z.negate())));return displaced;})();
  material.positionNode=waveNormal;
  const depth=min(max(bank.x,0),bank.y.mul(1.6)),absorption=float(1).sub(exp(depth.mul(-1.48)));
  const transmit=exp(vec3(depth.mul(-1.95),depth.mul(-1.04),depth.mul(-.72)));
  const shallowCol=value(material.frontierWaterShallow,'color'),deepCol=value(material.frontierWaterDeep,'color');
  const current=sin(xz.x.mul(1.22).add(sin(xz.y.mul(.34).add(time.mul(.34))).mul(.86)).add(xz.y.mul(.13)).sub(time.mul(.55)));
  const rippleFlow=vec2(time.mul(.22),time.mul(-.14));
  const flowWarp=noise(xz.mul(.24).add(rippleFlow.mul(.35))).mul(2.4);
  const streakA=noise(vec2(xz.x.mul(.42).add(flowWarp),xz.y.mul(1.85).sub(time.mul(.32))));
  const streakB=noise(vec2(xz.x.mul(1.15).sub(flowWarp.mul(.65)),xz.y.mul(3.4).add(time.mul(.42))));
  const waveStreak=smoothstep(.56,.88,streakA.mul(.62).add(streakB.mul(.38))).mul(smoothstep(.22,1.05,bank.y));
  const shallowVis=float(1).sub(smoothstep(.06,.98,depth)).mul(smoothstep(0,.30,bank.y));
  material.colorNode=Fn(()=>{
    const baseCol=mix(deepCol,shallowCol,clamp(transmit.mul(.68).add(float(1).sub(absorption).mul(.32)),0,1)).toVar();
    If(detail.greaterThan(.5).and(shallowVis.greaterThan(.01)),()=>{
      const pebbles=mix(noise(xz.mul(2.4)),noise(xz.mul(6.2).add(vec2(3.7,1.9))),.45);
      const bedTint=shallowCol.mul(mix(vec3(.92,.90,.76),vec3(1.18,1.16,1.02),pebbles));
      baseCol.assign(mix(baseCol,bedTint,shallowVis.mul(.46)));
    });
    const tone=materialColor.rgb.mul(baseCol).mul(float(1.02).add(current.mul(.095))).add(shallowCol.mul(.55).add(vec3(.32,.52,.58)).mul(waveStreak).mul(.22).mul(light)).toVar();
    If(detail.greaterThan(.5).and(depth.lessThan(1.35)),()=>{
      const warp=vec2(noise(xz.mul(.72).add(vec2(time.mul(.11),time.mul(-.08)))).sub(.5),noise(xz.mul(.78).sub(vec2(time.mul(.09),time.mul(.12)))).sub(.5)).mul(.55);
      const cuv=xz.add(warp);
      const ca=noise(cuv.mul(1.55).add(vec2(time.mul(.24),time.mul(.15))));
      const cb=noise(cuv.mul(2.35).sub(vec2(time.mul(.18),time.mul(-.26))));
      const cc=noise(cuv.mul(3.8).add(vec2(time.mul(-.21),time.mul(.19))));
      const web=pow(max(0,float(1).sub(abs(ca.sub(cb)).mul(2.15))),4.0);
      const shimmer=pow(max(0,float(1).sub(abs(cb.sub(cc)).mul(2.3))),3.5).mul(.48);
      const caustic=web.add(shimmer).mul(float(1).sub(absorption.mul(.80))).mul(light).mul(float(1).sub(smoothstep(.60,1.35,depth))).mul(.40);
      tone.addAssign(shallowCol.mul(.70).add(sunColor.mul(.48)).mul(caustic));
    });
    return tone;
  })();
  const wetEdge=smoothstep(0,.36,bank.y).mul(smoothstep(0,.16,depth));
  material.opacityNode=materialOpacity.mul(mix(.28,1,smoothstep(0,.82,absorption))).mul(wetEdge);
  material.normalNode=Fn(()=>{
    const distortion=float(0).toVar();
    If(detail.greaterThan(.5),()=>{distortion.assign(noise(xz.mul(.30).add(vec2(time.mul(.09),time.mul(.06)))).sub(.5).mul(4.1));});
    const ra=cos(dot(xz,vec2(3.7,1.9)).add(time.mul(2.5)).add(distortion));
    const rb=cos(dot(xz,vec2(-2.1,3.1)).sub(time.mul(2.0)).sub(distortion.mul(.73)));
    const rc=cos(dot(xz,vec2(1.3,-4.2)).add(time.mul(1.5)).add(distortion.mul(.41)));
    const rd=detail.greaterThan(.5).select(cos(dot(xz,vec2(-3.8,-2.5)).add(time.mul(3.0)).sub(distortion.mul(.55))),0);
    const re=detail.greaterThan(.5).select(cos(dot(xz,vec2(6.4,-5.1)).sub(time.mul(3.7)).add(distortion.mul(.62))),0);
    const slope=vec2(.42,.22).mul(ra).add(vec2(-.22,.31).mul(rb)).add(vec2(.10,-.27).mul(rc)).add(vec2(-.18,-.12).mul(rd)).add(vec2(.11,-.09).mul(re));
    const coverage=float(1).div(float(1).add(xz.fwidth().length().mul(2.35)));
    return normalize(normalViewGeometry.add(mat3(cameraViewMatrix).mul(vec3(slope.x,0,slope.y)).mul(ripples.mul(1.12)).mul(coverage)));
  })();
  material.outputNode=Fn(()=>{
    const fresnel=float(.035).add(pow(float(1).sub(clamp(dot(normalView,positionViewDirection),0,1)),4.4).mul(.965));
    const reflection=normalize(reflect(positionViewDirection.negate(),normalView).transformDirection(cameraWorldMatrix));
    const skyElevation=pow(clamp(reflection.y,0,1),.62);
    const skyGradient=mix(sky.mul(1.16),sky.mul(vec3(.56,.75,.98)),skyElevation);
    const sunAlign=max(dot(reflection,sunDir),0);
    const glint=pow(sunAlign,128).mul(1.15).add(pow(sunAlign,22).mul(.18));
    const color=mix(output.rgb,skyGradient,fresnel.mul(mix(.65,1,smoothstep(0,.45,bank.y)))).add(sunColor.mul(glint).mul(light).mul(smoothstep(0,.32,bank.y))).toVar();
    If(bank.y.lessThan(2.20).and(depth.lessThan(.96)),()=>{
      const drift=vec2(time.mul(.16),time.mul(-.12));
      const cells=noise(xz.mul(1.75).add(drift));
      const foamNoise=float(cells).toVar();
      If(detail.greaterThan(.5),()=>{foamNoise.assign(mix(cells,noise(xz.mul(4.4).sub(drift.mul(1.45))),.44));});
      const surfPhase=sin(depth.mul(6.8).sub(time.mul(1.9)).add(cells.mul(2.6)).add(dot(xz,vec2(.18,.24))));
      const surfBand=smoothstep(.28,.88,surfPhase).mul(float(1).sub(smoothstep(.18,.86,depth))).mul(float(1).sub(smoothstep(.85,2.20,bank.y)));
      const wash=sin(dot(xz,vec2(.27,.58)).add(time.mul(1.15))).mul(.12).add(cells.sub(.5).mul(.2));
      const waterline=float(1).sub(smoothstep(.14,.58,depth.add(wash))).mul(float(1).sub(smoothstep(.55,1.55,bank.y)));
      const lacing=smoothstep(.30,.76,foamNoise).mul(smoothstep(.04,.20,bank.y));
      const foamMask=clamp(waterline.mul(.94).add(surfBand.mul(.64)).mul(lacing).mul(foamStrength),0,.95);
      const foamCol=mix(vec3(.88,.95,.97),vec3(.99,1,1),surfBand).mul(light);
      color.assign(mix(color,foamCol,foamMask));
    });
    If(pierWake.greaterThan(.02),()=>{
      const pierPulse=sin(xz.y.mul(3.8).sub(time.mul(4.4)).add(abs(xz.x).mul(1.4))).mul(.5).add(.5);
      const pierNoise=noise(xz.mul(2.9).sub(vec2(0,time.mul(.65))));
      const pierFoam=clamp(pierWake.mul(float(.48).add(pierPulse.mul(.52))).mul(smoothstep(.22,.78,pierNoise.add(pierWake.mul(.35)))),0,.78);
      color.assign(mix(color,vec3(.94,.98,1).mul(light),pierFoam));
    });
    return vec4(color,output.a);
  })();
  material.needsUpdate=true;
}

export function skyDome(material,u){
  const dir=normalize(varying(positionGeometry)),horizon=value(u.horizon,'color'),zenith=value(u.zenith,'color');
  const sunDir=normalize(value(u.sunDir,'vec3')),sunColor=value(u.sunColor,'color');
  const night=value(u.night),clouds=value(u.clouds);
  const height=clamp(dir.y,0,1),skyT=pow(height,.50);
  const base=mix(horizon,zenith,skyT);
  const haze=exp(abs(dir.y).mul(-7.8)).mul(.20).mul(float(1).sub(night.mul(.72))).mul(float(1).sub(clouds.mul(.58)));
  const sunDot=max(dot(dir,sunDir),0);
  const solarClear=float(1).sub(clouds.mul(.84)).mul(float(1).sub(night.mul(.92)));
  const sunGlow=sunColor.mul(pow(sunDot,7).mul(.24).add(pow(sunDot,72).mul(.52))).mul(solarClear);
  const warmScatter=exp(abs(dir.y).mul(-5.2)).mul(pow(sunDot,2.5)).mul(.16).mul(solarClear);
  const moonGlow=vec3(.78,.86,1).mul(pow(sunDot,52).mul(.24)).mul(night).mul(float(1).sub(clouds.mul(.84)));
  material.colorNode=clamp(base.add(horizon.mul(haze)).add(sunColor.mul(warmScatter)).add(sunGlow).add(moonGlow),0,2);
  material.needsUpdate=true;
}

export function coolAshlarStone(material){
  if(!material?.isNodeMaterial)return;
  const base=materialColor.rgb;
  const luma=dot(base,vec3(.30,.59,.11));
  const warmStone=base.mul(vec3(1.06,.96,.84));
  const silverStone=mix(base,vec3(luma.mul(1.28),luma.mul(1.30),luma.mul(1.34)),.76).mul(vec3(.96,.98,1.02));
  const silverMask=Fn(builder=>builder.object?.instanceColor?smoothstep(.02,.07,instanceColor.b.sub(instanceColor.r)):float(0))();
  material.colorNode=mix(warmStone,silverStone,silverMask);
  material.needsUpdate=true;
}
