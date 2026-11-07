// Node-safe core of the sampled-audio layer. The bank is deliberately free of
// browser-only imports so it can be verified in the unit test suite; the
// browser wiring lives in sampled-audio.js.

export const SAMPLE_DIRECTORY='audio/';
export const SAMPLE_MANIFEST='audio/manifest.json';
export const MAX_PARALLEL_SAMPLE_LOADS=4;
export const MAX_SAMPLE_BYTES=1_500_000;

export const UI_SAMPLE_CUES=Object.freeze(['select','order','coin','complete','alarm','victory']);
export const COMBAT_KINDS=Object.freeze(['metal','arrow','wood','siege','earth']);
export const COMBAT_VARIANTS=4;
export function combatCue(kind,variant=0){return `${kind}-${((variant%COMBAT_VARIANTS)+COMBAT_VARIANTS)%COMBAT_VARIANTS}`;}

export function sampleURL(file,base='http://localhost/',directory=SAMPLE_DIRECTORY){
  return new URL(directory+file,base).toString();
}

// Loading is best-effort and bounded. Any missing, corrupt or unsupported
// sample simply leaves the procedural Web Audio layer in charge.
export function createSampleBank({context,fetchData=globalThis.fetch,base=globalThis.document?.baseURI||'http://localhost/',concurrency=MAX_PARALLEL_SAMPLE_LOADS,manifestURL=SAMPLE_MANIFEST}={}){
  const buffers=new Map(),cues=new Map(),status=new Map(),errors=[];
  let ready=false,loading=null,totalBytes=0;
  const bank={
    get ready(){return ready;},
    get buffers(){return buffers;},
    has(name){return buffers.has(name);},
    get(name){return buffers.get(name)?.buffer||null;},
    cue(name){return cues.get(name)||null;},
    isLoop(name){return !!cues.get(name)?.loop;},
    status(name){return status.get(name)||'pending';},
    diagnostics(){return {ready,loaded:buffers.size,failed:errors.length,total:cues.size,bytes:totalBytes,errors:errors.slice(),samples:[...status.entries()].map(([name,state])=>({name,state}))};},
    load(){
      if(loading)return loading;
      loading=(async()=>{
        try{
          if(!fetchData)throw new Error('No fetch implementation');
          if(!context?.decodeAudioData)throw new Error('No audio decoder');
          const response=await fetchData(new URL(manifestURL,base).toString());
          if(!response?.ok)throw new Error('Sample manifest unavailable');
          const manifest=await response.json();
          const entries=Object.entries(manifest.cues||{});
          for(const [name,cue]of entries){cues.set(name,cue);status.set(name,'pending');}
          for(let i=0;i<entries.length;i+=Math.max(1,concurrency)){
            const batch=entries.slice(i,i+Math.max(1,concurrency));
            await Promise.allSettled(batch.map(async([name,cue])=>{
              try{
                if(cue.bytes>MAX_SAMPLE_BYTES)throw new Error('Sample exceeds the size budget');
                const asset=await fetchData(sampleURL(cue.file,base));
                if(!asset?.ok)throw new Error('Sample request failed');
                const data=await asset.arrayBuffer();
                const decode=context.decodeAudioData.bind(context);
                const buffer=await decode(data);
                if(!buffer)throw new Error('Decoder returned no buffer');
                buffers.set(name,{buffer,cue});status.set(name,'loaded');totalBytes+=cue.bytes||0;
              }catch(error){status.set(name,'failed');errors.push(`${name}: ${error.message}`);}
            }));
          }
        }catch(error){errors.push(error.message);}
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
