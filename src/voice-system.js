// Procedural Unit Voice & Brass War Horn System for Crowns of the Frontier
// Uses vocal tract formant filters and harmonic brass synthesis via Web Audio API.
import {UNITS} from './data.js';

export function isHumanVoiceUnit(entity) {
  if (!entity) return false;
  if (entity.kind && entity.kind !== 'unit') return false;
  const def = entity.type ? UNITS[entity.type] : null;
  if (!def) return false;
  return !def.naval && def.role !== 'siege';
}

const FORMANTS = {
  // F1, F2, F3 formant frequencies (Hz) for vowel shapes
  ah: [730, 1090, 2440],
  oh: [570, 840, 2410],
  eh: [530, 1840, 2480],
  ee: [270, 2290, 3010],
  uh: [520, 1190, 2390]
};

const FACTION_CADENCE = {
  alder: { basePitch: 120, formants: ['eh', 'ah', 'oh'], inflection: 1.05, speed: 1.0 },
  sun: { basePitch: 135, formants: ['ah', 'oh', 'uh'], inflection: 1.12, speed: 1.1 },
  raven: { basePitch: 95, formants: ['oh', 'uh', 'ah'], inflection: 0.98, speed: 0.92 }
};

export const VOICE_COOLDOWN = 0.75;
export const HORN_COOLDOWN = 12.0;

export function synthesizeVocalBark(context, faction = 'alder', kind = 'order', pitchModifier = 1.0) {
  const profile = FACTION_CADENCE[faction] || FACTION_CADENCE.alder;
  const t0 = context.currentTime;
  const baseFreq = profile.basePitch * pitchModifier;

  // Choose syllables based on action kind
  const pattern = kind === 'attack' 
    ? [{ v: 'ah', d: 0.08, p: 1.2 }, { v: 'oh', d: 0.16, p: 1.35 }] 
    : kind === 'select'
    ? [{ v: 'eh', d: 0.11, p: 1.0 }, { v: 'ee', d: 0.14, p: 1.08 }]
    : kind === 'work'
    ? [{ v: 'uh', d: 0.09, p: 0.95 }, { v: 'ah', d: 0.13, p: 1.0 }]
    : [{ v: 'oh', d: 0.10, p: 1.0 }, { v: 'eh', d: 0.15, p: 1.05 }]; // 'order'

  const masterEnv = context.createGain();
  let timeOffset = 0;
  for (const syl of pattern) {
    const vowel = FORMANTS[syl.v] || FORMANTS.ah;
    const dur = syl.d / profile.speed;
    const startTime = t0 + timeOffset;

    // Warm resonant glottal vocal excitation (replaces harsh buzzy raw sawtooth).
    const osc = context.createOscillator();
    osc.type = 'triangle';
    const targetFreq = baseFreq * syl.p * profile.inflection;
    osc.frequency.setValueAtTime(targetFreq * 0.91, startTime);
    osc.frequency.exponentialRampToValueAtTime(targetFreq * 1.03, startTime + dur * 0.38);
    osc.frequency.exponentialRampToValueAtTime(targetFreq * 0.87, startTime + dur);

    // Three-formant vocal tract chain (F1, F2, F3 resonance for natural timbre)
    const f1 = context.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = vowel[0];
    f1.Q.value = 3.8;

    const f2 = context.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = vowel[1];
    f2.Q.value = 4.2;

    const f3 = context.createBiquadFilter();
    f3.type = 'bandpass';
    f3.frequency.value = vowel[2] || 2450;
    f3.Q.value = 5.5;

    // Smooth human vocal amplitude envelope with clean onended disconnect
    const env = context.createGain();
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.exponentialRampToValueAtTime(0.19, startTime + 0.025);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

    osc.connect(f1);
    osc.connect(f2);
    osc.connect(f3);
    f1.connect(env);
    f2.connect(env);
    f3.connect(env);
    env.connect(masterEnv);

    osc.onended = () => { osc.disconnect(); f1.disconnect(); f2.disconnect(); f3.disconnect(); env.disconnect(); };
    osc.start(startTime);
    osc.stop(startTime + dur + 0.03);

    timeOffset += dur + 0.04;
  }
  return masterEnv;
}

export function synthesizeWarHorn(context, fundamental = 174.61) {
  // 174.61 Hz = F3 note, classical medieval bronze battle horn
  const t0 = context.currentTime;
  const duration = 1.6;
  const master = context.createGain();

  // Multi-harmonic brass overtones (1x, 2x, 3x, 4x, 5x, 6x harmonics)
  const harmonics = [
    { mult: 1, gain: 0.35 },
    { mult: 2, gain: 0.28 },
    { mult: 3, gain: 0.22 },
    { mult: 4, gain: 0.14 },
    { mult: 5, gain: 0.08 },
    { mult: 6, gain: 0.04 }
  ];

  for (const h of harmonics) {
    const osc = context.createOscillator();
    osc.type = 'sawtooth';
    const freq = fundamental * h.mult;
    // Characteristic brass horn pitch lip-swell at onset
    osc.frequency.setValueAtTime(freq * 0.97, t0);
    osc.frequency.exponentialRampToValueAtTime(freq, t0 + 0.18);
    osc.frequency.setValueAtTime(freq, t0 + duration * 0.7);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.98, t0 + duration);

    const hGain = context.createGain();
    hGain.gain.setValueAtTime(0.0001, t0);
    hGain.gain.exponentialRampToValueAtTime(h.gain, t0 + 0.22);
    hGain.gain.setValueAtTime(h.gain * 0.85, t0 + duration * 0.65);
    hGain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(hGain);
    hGain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  // Resonant horn bell filter (warm acoustic low-pass)
  const bellFilter = context.createBiquadFilter();
  bellFilter.type = 'lowpass';
  bellFilter.frequency.setValueAtTime(1400, t0);
  bellFilter.frequency.exponentialRampToValueAtTime(2200, t0 + 0.25);
  bellFilter.frequency.exponentialRampToValueAtTime(1200, t0 + duration);
  bellFilter.Q.value = 2.2;

  master.connect(bellFilter);
  return { output: bellFilter, duration };
}

export function installVoiceSystem(AudioEngine) {
  const p = AudioEngine.prototype;

  p.voice = function(kind = 'order', unit = null, faction = 'alder', pan = 0) {
    if (!isHumanVoiceUnit(unit)) return false;
    if (!this.context || this.context.state !== 'running' || this.settings.volume <= 0) return false;
    if (this.settings.unitVoices === false) return false;

    const now = this.context.currentTime;
    if (now - (this.lastVoiceAt ?? -Infinity) < VOICE_COOLDOWN) return false;
    this.lastVoiceAt = now;

    const pitchMod = unit?.type === 'king' ? 0.82 : unit?.type === 'villager' ? 1.08 : 1.0;
    const env = synthesizeVocalBark(this.context, faction, kind, pitchMod);
    if (!env) return false;

    const voiceGain = this.context.createGain();
    voiceGain.gain.value = (this.settings.volume || 0.65) * 0.36;
    const outBus = this.voiceBus || this.master;

    if (this.context.createStereoPanner) {
      const panner = this.context.createStereoPanner();
      panner.pan.value = Math.max(-0.8, Math.min(0.8, pan));
      env.connect(voiceGain);
      voiceGain.connect(panner);
      panner.connect(outBus);
      if (this.reverbSend) panner.connect(this.reverbSend);
    } else {
      env.connect(voiceGain);
      voiceGain.connect(outBus);
      if (this.reverbSend) voiceGain.connect(this.reverbSend);
    }
    this.duckMusic?.(0.85, 0.70);

    return true;
  };

  p.warHorn = function(fundamental = 174.61) {
    if (!this.context || this.context.state !== 'running' || this.settings.volume <= 0) return false;
    if (this.settings.warHorns === false) return false;

    const now = this.context.currentTime;
    if (now - (this.lastHornAt ?? -Infinity) < HORN_COOLDOWN) return false;
    this.lastHornAt = now;

    const horn = synthesizeWarHorn(this.context, fundamental);
    const hornGain = this.context.createGain();
    hornGain.gain.value = (this.settings.volume || 0.65) * 0.42;
    const outBus = this.voiceBus || this.master;

    horn.output.connect(hornGain);
    hornGain.connect(outBus);
    if (this.reverbSend) hornGain.connect(this.reverbSend);
    this.duckMusic?.(1.9, 0.58);
    return true;
  };
}
