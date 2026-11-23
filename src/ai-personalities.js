/**
 * Selectable AI Commander Personalities for Skirmish & Custom Battles.
 * Zero extra simulation overhead — pure O(1) profile weight tuning.
 */
export const AI_PERSONALITIES=Object.freeze({
  balanced:{
    id:'balanced',
    name:'Balanced Marshal',
    desc:'Adapts economy, fortifications, and counter-armies evenly.',
    attackFactor:1,
    raidFactor:1,
    workerFactor:1,
    retreatFactor:1,
  },
  rusher:{
    id:'rusher',
    name:'Vanguard Rusher',
    desc:'Pressures early with swift raiding columns and relentless skirmishes.',
    attackFactor:.72,
    raidFactor:.78,
    workerFactor:.85,
    retreatFactor:.88,
  },
  boomer:{
    id:'boomer',
    name:'Economic Boomer',
    desc:'Expands villagers and age upgrades rapidly before unleashing grand armies.',
    attackFactor:1.35,
    raidFactor:1.32,
    workerFactor:1.25,
    retreatFactor:1.05,
  },
  turtle:{
    id:'turtle',
    name:'Iron Bastion',
    desc:'Fortifies strongholds and holds defensive lines before counter-marching.',
    attackFactor:1.4,
    raidFactor:1.15,
    workerFactor:1.05,
    retreatFactor:1.18,
  },
  admiral:{
    id:'admiral',
    name:'Sea Admiral',
    desc:'Prioritizes harbors, warships, and flanking landings across waterways.',
    attackFactor:.95,
    raidFactor:1.05,
    workerFactor:1,
    retreatFactor:1,
    navalFocus:true,
  },
});

export function normalizePersonality(id){
  return Object.hasOwn(AI_PERSONALITIES,id)?id:'balanced';
}

export function personalitySpec(id){
  return AI_PERSONALITIES[normalizePersonality(id)];
}

/** Applies personality multipliers to a base AI profile without mutating the source object. */
export function applyPersonalityProfile(baseProfile,personalityId='balanced'){
  const p=personalitySpec(personalityId);
  if(p.id==='balanced')return baseProfile;
  return {
    ...baseProfile,
    workers:Math.max(12,Math.round(baseProfile.workers*p.workerFactor)),
    raid:Math.max(5,Math.round(baseProfile.raid*p.raidFactor)),
    retreat:Math.max(.35,Math.min(.95,baseProfile.retreat*p.retreatFactor)),
    attackFactor:p.attackFactor,
    navalFocus:!!p.navalFocus,
  };
}
