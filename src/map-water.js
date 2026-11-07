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
export function channelAt(map,x,z){return waterChannels(map).some(channel=>Math.abs(x-channel.center-Math.sin(z*channel.frequency)*channel.bend)<channel.width);}
