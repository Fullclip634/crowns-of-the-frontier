export const CONTROL_ACTIONS = [
  ['panUp','Pan forward','w'],['panDown','Pan backward','s'],['panLeft','Pan left','a'],['panRight','Pan right','d'],
  ['rotateLeft','Rotate left','q'],['rotateRight','Rotate right','e'],['production','Production overview','p'],
  ['inspect','Inspect model','i'],['camera-view','Camera angle','v'],['home','Center town','h'],['army','Select army','m'],
  ['build','Construction','b'],['attackmove','Attack move','f'],['patrol','Patrol','r'],['guard','Guard an ally','g'],
  ['stop','Stop / hold','x'],['idle','Idle villagers','.'],['focus','Focus selection','space'],['help','Help','?'],
].map(([id,label,key])=>({id,label,key}));
export const DEFAULT_BINDINGS=Object.fromEntries(CONTROL_ACTIONS.map(a=>[a.id,a.key]));
const RESERVED=new Set(['escape','tab','shift','control','alt','meta','capslock','unidentified','dead']);
const NAMED=new Set(['space','arrowup','arrowdown','arrowleft','arrowright','home','end','pageup','pagedown','insert','delete','enter','backspace']);
export function normalizeKey(key){return key===' '?'space':String(key||'').toLowerCase();}
export function keyLabel(key){return key==='space'?'Space':key.startsWith('arrow')?key.slice(5)[0].toUpperCase()+key.slice(6)+' arrow':key.length===1?key.toUpperCase():key[0]?.toUpperCase()+key.slice(1);}
export function bindingErrors(bindings){
  const errors=[],used=new Map();
  for(const a of CONTROL_ACTIONS){const key=normalizeKey(bindings[a.id]);
    if(!key||RESERVED.has(key)||/^[1-9]$/.test(key)||!(key.length===1||NAMED.has(key))){errors.push(`${a.label}: choose a single key. Escape, Tab, and 1–9 are reserved.`);continue;}
    if(used.has(key))errors.push(`${a.label} and ${used.get(key)} both use ${keyLabel(key)}.`);else used.set(key,a.label);
  }return errors;
}
export function readBindings(saved){
  if(!saved||typeof saved!=='object')return {...DEFAULT_BINDINGS};
  const bindings=Object.fromEntries(CONTROL_ACTIONS.map(a=>[a.id,normalizeKey(saved[a.id]??a.key)]));
  return bindingErrors(bindings).length?{...DEFAULT_BINDINGS}:bindings;
}
export function controlForKey(key,bindings){
  const normalized=normalizeKey(key),match=CONTROL_ACTIONS.find(a=>bindings[a.id]===normalized);
  if(match)return match.id;
  return {arrowup:'panUp',arrowdown:'panDown',arrowleft:'panLeft',arrowright:'panRight'}[normalized]||null;
}
export function heldControl(keys,id,bindings){return [...keys].some(key=>controlForKey(key,bindings)===id);}
