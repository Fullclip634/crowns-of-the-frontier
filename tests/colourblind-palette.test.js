import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAYER_COLORS,COLORBLIND_PLAYER_COLORS,playerPalette} from '../src/custom-battle.js';

// Team colour is the only cue distinguishing armies, so it has to survive colour
// blindness. Colours are simulated with Machado, Oliveira and Fernandes (2009)
// severity-1.0 matrices in linear RGB and compared as CIE Lab dE76, where a
// difference below about 10 is hard to name and below 5 is effectively the same
// colour.
const CVD={deuteranopia:[[0.367322,0.860646,-0.227968],[0.280085,0.672501,0.047413],[-0.011820,0.042940,0.968881]],
  protanopia:[[0.152286,1.052583,-0.204868],[0.114503,0.786281,0.099216],[-0.003882,-0.048116,1.051998]],
  tritanopia:[[1.255528,-0.076749,-0.178779],[-0.078411,0.930809,0.147602],[0.004733,0.691367,0.303900]]};
const toLinear=c=>(c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
function lab(hex,kind){
  const rgb=[(hex>>16)&255,(hex>>8)&255,hex&255].map(v=>toLinear(v/255));
  const out=kind?CVD[kind].map(row=>Math.max(0,Math.min(1,row[0]*rgb[0]+row[1]*rgb[1]+row[2]*rgb[2]))):rgb;
  const [r,g,b]=out,X=.4124564*r+.3575761*g+.1804375*b,Y=.2126729*r+.7151522*g+.072175*b,Z=.0193339*r+.119192*g+.9503041*b;
  const f=t=>(t>.008856?Math.cbrt(t):7.787*t+16/116),fx=f(X/.95047),fy=f(Y),fz=f(Z/1.08883);
  return [116*fy-16,500*(fx-fy),200*(fy-fz)];
}
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
function closestPair(palette,kind){
  let worst={dE:Infinity,pair:null};
  for(let i=0;i<palette.length;i++)for(let j=i+1;j<palette.length;j++){
    const dE=distance(lab(palette[i],kind),lab(palette[j],kind));
    if(dE<worst.dE)worst={dE,pair:[palette[i],palette[j]]};
  }
  return worst;
}
const hex=n=>'#'+n.toString(16).padStart(6,'0');

test('both palettes define eight distinct kingdom colours',()=>{
  for(const [name,palette] of [['default',PLAYER_COLORS],['colourblind',COLORBLIND_PLAYER_COLORS]]){
    assert.equal(palette.length,8,`${name} covers eight kingdoms`);
    assert.equal(new Set(palette).size,8,`${name} has no duplicate entries`);
    for(const colour of palette)assert.ok(Number.isInteger(colour)&&colour>=0&&colour<=0xffffff,`${name} entry ${hex(colour)} is a colour`);
  }
});

// This is the defect the option exists to fix: the shipped palette separates red
// from green by hue alone, which is the axis deuteranopia and protanopia remove.
test('the default palette collapses under red-green colour blindness',()=>{
  const deuteranopia=closestPair(PLAYER_COLORS,'deuteranopia');
  assert.ok(deuteranopia.dE<10,`deuteranopia leaves ${deuteranopia.pair.map(hex).join(' and ')} at dE ${deuteranopia.dE.toFixed(1)}`);
});

test('the colour-blind palette stays distinguishable under every simulated type',()=>{
  const results={};
  for(const kind of [null,'deuteranopia','protanopia','tritanopia']){
    const worst=closestPair(COLORBLIND_PLAYER_COLORS,kind);
    results[kind||'normal']=worst;
    assert.ok(worst.dE>=15,`${kind||'normal vision'}: closest pair ${worst.pair.map(hex).join(' and ')} is only dE ${worst.dE.toFixed(1)}`);
  }
  // The worst case must still beat the default palette's worst case by a margin
  // a player would actually notice, not by a rounding error.
  const defaultWorst=Math.min(...[null,'deuteranopia','protanopia','tritanopia'].map(kind=>closestPair(PLAYER_COLORS,kind).dE));
  const fixedWorst=Math.min(...Object.values(results).map(r=>r.dE));
  assert.ok(fixedWorst>=defaultWorst*2,`worst-case separation improves from dE ${defaultWorst.toFixed(1)} to ${fixedWorst.toFixed(1)}`);
});

test('the palette selector returns the requested set and defaults to the shipped one',()=>{
  assert.equal(playerPalette(true),COLORBLIND_PLAYER_COLORS);
  assert.equal(playerPalette(false),PLAYER_COLORS);
  assert.equal(playerPalette(undefined),PLAYER_COLORS);
});
