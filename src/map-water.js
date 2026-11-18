// Single source of truth for water channels. Landscape (mesh, water, bridges)
// and Simulation (navigation, placement, water detection) must agree exactly,
// or players walk on invisible rivers. Legacy definitions are preserved byte
// for byte; new map kinds get their own channel layout.
const CHANNELS=Object.freeze({
  coast:Object.freeze([{center:0,width:14,frequency:.03,bend:2}]),
  valley:Object.freeze([{center:0,width:5,frequency:.045,bend:4}]),
  rivers:Object.freeze([{center:-19,width:4,frequency:.045,bend:3},{center:19,width:4,frequency:.045,bend:3}]),
  riverland:Object.freeze([{center:-25,width:5,frequency:.038,bend:6},{center:25,width:5,frequency:.038,bend:6}]),
  archipelago:Object.freeze([{center:-40,width:8,frequency:.026,bend:8},{center:40,width:8,frequency:.026,bend:8}]),
});
const EMPTY=Object.freeze([]);
export function waterChannels(map){return CHANNELS[map]||EMPTY;}
const channelCenter=(channel,z)=>channel.center+Math.sin(z*channel.frequency)*channel.bend;
export function channelAt(map,x,z){return waterChannels(map).some(channel=>Math.abs(x-channel.center-Math.sin(z*channel.frequency)*channel.bend)<channel.width);}

function bankAt(channels,x,z){
  return channels.reduce((index,channel)=>index+Number(x>channelCenter(channel,z)),0);
}
export function landBank(map,x,z){return bankAt(waterChannels(map),x,z);}

function dryFootprint(channels,x,z,r,bank){
  return channels.every((channel,index)=>{
    const direction=index<bank?1:-1;
    return [-r,0,r].every(offset=>direction*(x-channelCenter(channel,z+offset))>channel.width+r+.4);
  });
}
export function dryBankFootprint(map,x,z,r,bank){return dryFootprint(waterChannels(map),x,z,r,bank);}

// Classic starts can be reused on any map. Keep their relative layout, and
// move the whole settlement to one bank when a channel crosses its footprint.
export function drySettlementStart(map,halfWorld,start,sites){
  const channels=waterChannels(map);
  if(!channels.length||!sites.length)return start;
  const footprints=sites.map(site=>({x:site.x,z:site.z,r:site.r+(site.type==='towncenter'?1.8:site.kind==='building'?1.15:.25)}));
  const fits=(dx,dz,region)=>footprints.every(({x,z,r})=>{
    x+=dx;z+=dz;
    if(Math.abs(x)+r>halfWorld-2||Math.abs(z)+r>halfWorld-2)return false;
    return dryFootprint(channels,x,z,r,region);
  });
  if(fits(0,0,bankAt(channels,start.x,start.z)))return start;
  const xSide=Math.sign(start.x),zSide=Math.sign(start.z),outerBank=xSide<0?0:channels.length;
  const limit=halfWorld*2,oppositeBankPenalty=2*limit**2+1;
  let best=start,bestScore=Infinity;
  for(let dz=-limit;dz<=limit;dz++){
    const z=start.z+dz;
    if(Math.sign(z)!==zSide||Math.abs(z)>halfWorld-2||dz*dz>=bestScore)continue;
    for(let dx=-limit;dx<=limit;dx++){
      const x=start.x+dx;
      if(Math.sign(x)!==xSide||Math.abs(x)>halfWorld-2)continue;
      const region=bankAt(channels,x,z),score=dx*dx+dz*dz+(region===outerBank?0:oppositeBankPenalty);
      if(score<bestScore&&fits(dx,dz,region)){best={x,z};bestScore=score;}
    }
  }
  return best;
}
