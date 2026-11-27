// Node-safe core of the sampled-audio layer. The bank is deliberately free of
// browser-only imports so it can be verified in the unit test suite; the
// browser wiring lives in sampled-audio.js.

export const SAMPLE_DIRECTORY='audio/';
export const SAMPLE_MANIFEST='audio/manifest.json';
export const MAX_PARALLEL_SAMPLE_LOADS=4;
export const MAX_SAMPLE_BYTES=1_500_000;

export const UI_SAMPLE_CUES=Object.freeze([
  'select','order','coin','complete','alarm','victory',
  'defeat','age-up','chat-all','chat-team','flare','tribute','notice-warn',
  'place','bld-town','bld-castle','bld-dock',
]);
export const HORN_SAMPLE_CUES=Object.freeze(['horn','horn-enemy','horn-ally']);
export const FOLEY_SAMPLE_CUES=Object.freeze([
  'chop','mine','hammer','anvil','hoof','march','fire',
  'cannon','trebuchet','collapse','hero-skill','boiling-oil',
]);
export const AMBIENCE_SAMPLE_CUES=Object.freeze(['amb-meadow','amb-coast','amb-river','amb-tundra','amb-arid','amb-volcanic']);
export const VOICE_SAMPLE_CUES=Object.freeze([
  'voice-select','voice-order','voice-attack','voice-work',
  'voice-worker-select','voice-worker-hold','unit-hero','unit-hold',
]);
export const COMMS_SAMPLE_CUES=Object.freeze([
  'comms-alert','comms-begin','comms-enemy','comms-ally',
  'comms-ally-attack','comms-ally-hold','comms-ally-help','comms-objective','comms-female',
  'comms-female-attack','comms-female-hold','comms-female-help',
]);
export const GRUNT_SAMPLE_CUES=Object.freeze(['grunt-0','grunt-1','grunt-2']);
export const MUSIC_STEM_CUES=Object.freeze(['music-peace','music-tension','music-battle','music-climax']);
export const COMBAT_KINDS=Object.freeze(['metal','arrow','wood','siege','earth']);
export const COMBAT_VARIANTS=4;
export function combatCue(kind,variant=0){return `${kind}-${((variant%COMBAT_VARIANTS)+COMBAT_VARIANTS)%COMBAT_VARIANTS}`;}

const GROUP_PRIORITY=Object.freeze({ui:0,voice:1,combat:2,foley:3,weather:4,music:5});

export function sampleURL(file,base='http://localhost/',directory=SAMPLE_DIRECTORY){
  return new URL(directory+file,base).toString();
}

function preferFallbackCodec(){
  try{
    if(typeof globalThis.Audio!=='function')return false;
    const probe=new globalThis.Audio();
    return typeof probe.canPlayType==='function'&&!probe.canPlayType('audio/ogg; codecs="vorbis"');
  }catch{return false;}
}

// Micro-yield between browser decode batches so audio startup never steals a render frame.
function yieldBatch(){
  if(typeof globalThis.requestAnimationFrame==='function'){
    return new Promise(resolve=>setTimeout(resolve,0));
  }
  return Promise.resolve();
}

// Loading is best-effort, priority-tiered (instant comms/alerts/voices first,
// heavy music/weather stems second), and bounded so gameplay FPS never hitches.
// When `lazyLoops` is enabled (touch/mobile devices), long looping weather and
// music beds stay unloaded until `ensure(name)` is requested and can be evicted
// with `evict(name)` to save ~35-45 MB of uncompressed Float32 PCM RAM.
export function createSampleBank({context,fetchData=globalThis.fetch,base=globalThis.document?.baseURI||'http://localhost/',concurrency=MAX_PARALLEL_SAMPLE_LOADS,manifestURL=SAMPLE_MANIFEST,lazyLoops=false}={}){
  const buffers=new Map(),cues=new Map(),status=new Map(),pendingCues=new Map(),errors=[];
  const lazyGroups=lazyLoops?new Set(['weather','music']):null;
  let ready=false,coreReady=false,loading=null,manifestReady=null,totalBytes=0;
  let useFallbackFirst=false;

  async function decodeCue(name,cue){
    if(buffers.has(name))return buffers.get(name).buffer;
    if(pendingCues.has(name))return pendingCues.get(name);
    const task=(async()=>{
      try{
        if(!fetchData)throw new Error('No fetch implementation');
        if(!context?.decodeAudioData)throw new Error('No audio decoder');
        const candidates=useFallbackFirst&&cue.fallbackFile
          ?[[cue.fallbackFile,cue.fallbackBytes??cue.bytes],[cue.file,cue.bytes]]
          :cue.fallbackFile
            ?[[cue.file,cue.bytes],[cue.fallbackFile,cue.fallbackBytes??cue.bytes]]
            :[[cue.file,cue.bytes]];
        let buffer=null,loadedBytes=0,lastError='Sample request failed';
        for(const [file,expectedBytes]of candidates){
          if(!file)continue;
          if((expectedBytes||0)>MAX_SAMPLE_BYTES){lastError='Sample exceeds the size budget';continue;}
          const asset=await fetchData(sampleURL(file,base));
          if(!asset?.ok){lastError='Sample request failed';continue;}
          const data=await asset.arrayBuffer();
          const decode=context.decodeAudioData.bind(context);
          try{
            buffer=await decode(data);
            if(buffer){loadedBytes=expectedBytes||data.byteLength||0;break;}
            lastError='Decoder returned no buffer';
          }catch(decodeErr){lastError=decodeErr?.message||'Decode failed';}
        }
        if(!buffer)throw new Error(lastError);
        buffers.set(name,{buffer,cue,bytes:loadedBytes});status.set(name,'loaded');totalBytes+=loadedBytes;
        return buffer;
      }catch(error){status.set(name,'failed');errors.push(`${name}: ${error.message}`);return null;}
      finally{pendingCues.delete(name);}
    })();
    pendingCues.set(name,task);
    return task;
  }

  const bank={
    get ready(){return ready;},
    get coreReady(){return coreReady;},
    get lazyLoops(){return Boolean(lazyGroups);},
    get buffers(){return buffers;},
    has(name){return buffers.has(name);},
    get(name){return buffers.get(name)?.buffer||null;},
    cue(name){return cues.get(name)||null;},
    isLoop(name){return !!cues.get(name)?.loop;},
    status(name){return status.get(name)||'pending';},
    diagnostics(){return {ready,coreReady,lazyLoops:Boolean(lazyGroups),loaded:buffers.size,failed:errors.length,total:cues.size,bytes:totalBytes,errors:errors.slice(),samples:[...status.entries()].map(([name,state])=>({name,state}))};},
    async ensure(name){
      if(buffers.has(name))return buffers.get(name).buffer;
      if(manifestReady)await manifestReady;
      const cue=cues.get(name);
      if(!cue||status.get(name)==='failed')return null;
      return decodeCue(name,cue);
    },
    evict(name){
      const entry=buffers.get(name);
      if(!entry)return false;
      buffers.delete(name);
      totalBytes=Math.max(0,totalBytes-(entry.bytes||0));
      status.set(name,'pending');
      return true;
    },
    load(){
      if(loading)return loading;
      let resolveManifest;
      manifestReady=new Promise(resolve=>{resolveManifest=resolve;});
      loading=(async()=>{
        try{
          if(!fetchData)throw new Error('No fetch implementation');
          if(!context?.decodeAudioData)throw new Error('No audio decoder');
          const response=await fetchData(new URL(manifestURL,base).toString());
          if(!response?.ok)throw new Error('Sample manifest unavailable');
          const manifest=await response.json();
          const rawEntries=Object.entries(manifest.cues||{});
          // Priority-tier ordering: UI, alerts, horns, voices & combat decode before long loops.
          const entries=rawEntries.slice().sort(([,a],[,b])=>(GROUP_PRIORITY[a?.group]??9)-(GROUP_PRIORITY[b?.group]??9));
          for(const [name,cue]of entries){cues.set(name,cue);status.set(name,'pending');}
          useFallbackFirst=preferFallbackCodec();
          resolveManifest();
          const eagerEntries=lazyGroups?entries.filter(([,cue])=>!lazyGroups.has(cue?.group)):entries;
          const step=Math.max(1,concurrency);
          for(let i=0;i<eagerEntries.length;i+=step){
            const batch=eagerEntries.slice(i,i+step);
            if(!coreReady&&batch.every(([,c])=>(GROUP_PRIORITY[c?.group]??9)>=4))coreReady=true;
            await Promise.allSettled(batch.map(([name,cue])=>decodeCue(name,cue)));
            if(i+step<eagerEntries.length)await yieldBatch();
          }
        }catch(error){errors.push(error.message);resolveManifest();}
        coreReady=true;
        ready=true;
        return bank.diagnostics();
      })();
      return loading;
    },
    // The procedural combat synthesiser keys its cache as `${kind}:${variant}`.
    // Seeding that cache with decoded samples swaps the source without
    // changing any of the existing spatialisation, budgeting or panning.
    seedCombatBuffers(engine){
      engine.combatBuffers??=new Map();
      let seeded=0;
      for(const kind of COMBAT_KINDS)for(let variant=0;variant<COMBAT_VARIANTS;variant++){
        const buffer=bank.get(combatCue(kind,variant));if(!buffer)continue;
        engine.combatBuffers.set(`${kind}:${variant}`,buffer);seeded++;
      }
      return seeded;
    },
  };
  return bank;
}
