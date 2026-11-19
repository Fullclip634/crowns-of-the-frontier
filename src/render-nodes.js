import {DataTexture,RGBAFormat,UnsignedByteType,MeshStandardMaterial,MeshBasicMaterial,Color,Vector2,Vector3} from 'three';
import {MeshStandardNodeMaterial as ThreeStandardNodeMaterial,MeshBasicNodeMaterial as ThreeBasicNodeMaterial,RenderPipeline} from 'three/webgpu';
import {bloom} from 'three/addons/tsl/display/BloomNode.js';
import {configureCompatibilityShadow} from './compatibility-depth.js';
export {WebGPURenderer,PMREMGenerator,ClippingGroup,RenderPipeline} from 'three/webgpu';
import {Fn,If,attribute,varying,texture,textureLoad,reference,uniformArray,uv,vec2,vec3,vec4,mat3,mat4,int,ivec2,float,instanceIndex,positionGeometry,positionLocal,positionView,positionWorld,normalLocal,normalViewGeometry,normalView,positionViewDirection,cameraViewMatrix,cameraWorldMatrix,materialColor,materialRoughness,materialOpacity,output,normalMap,mix,clamp,min,max,abs,dot,smoothstep,exp,pow,sin,cos,fract,floor,reflect,normalize,step,interleavedGradientNoise,vogelDiskSample,screenCoordinate,renderGroup,pass} from 'three/tsl';

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
  const bend=clamp(positionGeometry.y.mul(2.4),0,1),bendSq=bend.mul(bend);
  const gust=sin(time.mul(1.9).add(positionLocal.x.mul(.24)).add(positionLocal.z.mul(.18)))
    .add(sin(time.mul(3.1).sub(positionLocal.x.mul(.39)).add(positionLocal.z.mul(.33))).mul(.35));
  const offset=gust.mul(bendSq).mul(strength);
  material.positionNode=positionLocal.add(vec3(offset.mul(.84),0,offset.mul(.54)));
  material.needsUpdate=true;
}

function analyticIblOutput(albedo,metalness,roughness,atm,nightNode=null){
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
  const atm=u.atmosphere||fallbackAtmosphere();
  const wetness=value(atm.wetness);
  const rainDarken=mix(1,.80,wetness.mul(float(.45).add(max(terrainRoad,max(terrainPaving,weights.z)).mul(.55))));
  const cloudMod=cloudLightNode(worldPos.xz,atm,1);
  material.colorNode=mix(materialColor.rgb,color,value(u.amount).mul(float(1).sub(packedGround))).mul(rainDarken).mul(cloudMod);
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
    const baseRough=materialRoughness.mul(mix(roughness,.94,terrainPaving));
    const wetSurface=wetness.mul(float(.35).add(max(terrainRoad,max(terrainPaving,weights.z)).mul(.65)));
    material.roughnessNode=clamp(mix(baseRough,.24,wetSurface.mul(.72)),.18,1);
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
  const atm=u.atmosphere||fallbackAtmosphere();
  const wetness=value(atm.wetness);
  material.colorNode=materialColor.rgb.mul(team).mul(tint);
  const steelRough=steel.select(.82,1);
  material.roughnessNode=clamp(mix(surface.x.mul(steelRough),surface.x.mul(steelRough).mul(.60),wetness.mul(.72)),.04,1);material.metalnessNode=clamp(surface.y.add(steel.select(.08,0)),0,steel.select(.62,1));material.normalNode=null;
  if(u.characterNormal.value){
    const detail=character.select(float(1).sub(smoothstep(42,110,positionView.length())),0);
    const amount=detail.mul(value(u.characterDetail)),active=amount.greaterThan(.001),strength=surface.z.greaterThan(4.5).select(.16,.38);
    const micro=Fn(()=>{const result=vec4(.5,.5,1,surface.x).toVar();If(active,()=>{result.assign(sample(u.characterNormal,coords,flat));});return result;})();
    const roughBase=mix(surface.x,micro.a,amount).mul(steelRough);
    material.roughnessNode=clamp(mix(roughBase,roughBase.mul(.60),wetness.mul(.72)),.04,1);
    material.normalNode=normalMap(micro.rgb,vec2(strength.mul(amount)));
  }
  material.outputNode=analyticIblOutput(materialColor.rgb.mul(team),material.metalnessNode,material.roughnessNode,atm);
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
  const soot=mix(vec3(1),vec3(.88,.84,.75),earthSkirt.mul(.45));
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
      const grain=float(.84).add(dot(sample(u.roof).rgb,vec3(.3,.59,.11)).mul(.16));
      color.assign(mix(color,vec3(.67,.76,.84).mul(grain),settle.mul(.88)));
    });
    return color.mul(soot).mul(groundAo).mul(mix(1,.84,structWetFace)).mul(cloudMod);
  })();
  const active=mode.greaterThan(.5).and(mode.lessThan(3.5)).and(value(u.detail).greaterThan(.5));
  const arm=Fn(()=>{const result=vec3(1).toVar();If(active,()=>{result.assign(choose('Arm'));});return result;})();
  const normSample=Fn(()=>{const result=vec3(.5,.5,1).toVar();If(active,()=>{result.assign(choose('Normal',flat));});return result;})();
  const rainGloss=wetness.mul(mix(.42,.92,smoothstep(.10,.75,roofUp)));
  const baseRough=surface.x.mul(arm.g);
  material.roughnessNode=clamp(mix(baseRough,baseRough.mul(.42),rainGloss),.04,1);
  material.metalnessNode=clamp(surface.y,0,1);
  material.aoNode=mix(1,arm.r,.72).mul(structureOcclusion);
  const normalScale=mode.greaterThan(2.5).select(.30,mode.greaterThan(1.5).select(.54,.38));
  material.normalNode=active.select(normalMap(normSample,vec2(normalScale)),normalViewGeometry);
  const night=value(u.night);
  material.emissiveNode=varying(attribute('structureEmission','vec3')).mul(night.mul(1.65).add(1)).add(vec3(1.18,.56,.16).mul(varying(attribute('structureNightGlow','float'))).mul(night));
  material.outputNode=analyticIblOutput(materialColor.rgb,material.metalnessNode,material.roughnessNode,atm,night);
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
    const fresnel=float(.04).add(pow(float(1).sub(clamp(dot(normalView,positionViewDirection),0,1)),4.2).mul(.96));
    const reflection=normalize(reflect(positionViewDirection.negate(),normalView).transformDirection(cameraWorldMatrix));
    const skyElevation=pow(clamp(reflection.y,0,1),.65);
    const skyGradient=mix(sky.mul(1.12),sky.mul(vec3(.60,.76,.98)),skyElevation);
    const sunAlign=max(dot(reflection,sunDir),0);
    const glint=pow(sunAlign,96).mul(.85).add(pow(sunAlign,18).mul(.16));
    const color=mix(output.rgb,skyGradient,fresnel).add(sunColor.mul(glint).mul(light).mul(smoothstep(0,.35,bank.y))).toVar();
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
