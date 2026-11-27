// Procedural Unit Voice, Brass War Horn & Unified Alert System for Crowns of the Frontier
// Uses vocal tract formant filters, harmonic brass synthesis, and coordinated speech queueing.
import {UNITS} from './data.js';

export function isHumanVoiceUnit(entity) {
  if (!entity) return false;
  if (entity.kind && entity.kind !== 'unit') return false;
  const def = entity.type ? UNITS[entity.type] : null;
  if (!def) return false;
  return !def.naval && def.role !== 'siege';
}

export function unitVoiceArchetype(entity) {
  if (!entity || !entity.type) return 'infantry';
  const def = UNITS[entity.type];
  if (!def) return 'infantry';
  if (entity.type === 'king' || def.hero) return 'hero';
  if (def.role === 'healer' || entity.type === 'monk') return 'healer';
  if (def.role === 'worker' || entity.type === 'villager') return 'worker';
  if (def.role === 'cavalry') return 'cavalry';
  if (def.role === 'ranged') return 'archer';
  return 'infantry';
}

export function formatAttackAlertText(event = {}) {
  const type = event?.targetType || '';
  if (type === 'towncenter') return 'Your town center is under attack!';
  if (type === 'keep') return 'Your castle is under attack!';
  if (type === 'wonder') return 'Your grand monument is under attack!';
  if (type === 'king') return 'Your sovereign is under attack!';
  if (type === 'villager' || type === 'fishingboat') return 'Your workers are under attack!';
  if (type === 'wall' || type === 'gate' || type === 'tower' || type === 'bombard') return 'Your defenses are under attack!';
  return 'Your kingdom is under attack.';
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
  raven: { basePitch: 95, formants: ['oh', 'uh', 'ah'], inflection: 0.98, speed: 0.92 },
  iron: { basePitch: 88, formants: ['uh', 'oh', 'ah'], inflection: 0.96, speed: 0.90 },
  jade: { basePitch: 128, formants: ['ee', 'eh', 'ah'], inflection: 1.08, speed: 1.06 }
};

export const VOICE_COOLDOWN = 0.75;
export const HORN_COOLDOWN = 12.0;
export const ATTACK_ANNOUNCE_COOLDOWN = 14.0;
export const NOTICE_WARN_COOLDOWN = 1.25;

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
    : kind === 'hold'
    ? [{ v: 'oh', d: 0.13, p: 0.92 }, { v: 'uh', d: 0.14, p: 0.88 }]
    : [{ v: 'oh', d: 0.10, p: 1.0 }, { v: 'eh', d: 0.15, p: 1.05 }]; // 'order'

  const masterEnv = context.createGain();
  let timeOffset = 0;
  for (const syl of pattern) {
    const vowel = FORMANTS[syl.v] || FORMANTS.ah;
    const dur = syl.d / profile.speed;
    const startTime = t0 + timeOffset;

    const osc = context.createOscillator();
    osc.type = 'triangle';
    const targetFreq = baseFreq * syl.p * profile.inflection;
    osc.frequency.setValueAtTime(targetFreq * 0.91, startTime);
    osc.frequency.exponentialRampToValueAtTime(targetFreq * 1.03, startTime + dur * 0.38);
    osc.frequency.exponentialRampToValueAtTime(targetFreq * 0.87, startTime + dur);

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
  // 174.61 Hz = F3 note, warm mellow medieval bronze horn (zero harsh sawtooth buzz).
  const freqBase = typeof fundamental === 'string'
    ? (fundamental === 'enemy' ? 116.54 : fundamental === 'ally' ? 220.0 : 174.61)
    : fundamental;
  const t0 = context.currentTime;
  const duration = 1.6;
  const master = context.createGain();

  const harmonics = [
    { mult: 1, gain: 0.22, wave: 'triangle' },
    { mult: 2, gain: 0.16, wave: 'triangle' },
    { mult: 3, gain: 0.10, wave: 'sine' },
    { mult: 4, gain: 0.055, wave: 'sine' },
    { mult: 5, gain: 0.028, wave: 'sine' },
    { mult: 6, gain: 0.014, wave: 'sine' }
  ];

  for (const h of harmonics) {
    const osc = context.createOscillator();
    osc.type = h.wave;
    const freq = freqBase * h.mult;
    osc.frequency.setValueAtTime(freq * 0.97, t0);
    osc.frequency.exponentialRampToValueAtTime(freq, t0 + 0.22);
    osc.frequency.setValueAtTime(freq, t0 + duration * 0.68);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.985, t0 + duration);

    const hGain = context.createGain();
    hGain.gain.setValueAtTime(0.0001, t0);
    hGain.gain.exponentialRampToValueAtTime(h.gain, t0 + 0.28);
    hGain.gain.setValueAtTime(h.gain * 0.80, t0 + duration * 0.65);
    hGain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(hGain);
    hGain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  const bellFilter = context.createBiquadFilter();
  bellFilter.type = 'lowpass';
  bellFilter.frequency.setValueAtTime(760, t0);
  bellFilter.frequency.exponentialRampToValueAtTime(1150, t0 + 0.28);
  bellFilter.frequency.exponentialRampToValueAtTime(640, t0 + duration);
  bellFilter.Q.value = 1.4;

  master.connect(bellFilter);
  return { output: bellFilter, duration };
}

const TTS_FEMALE_PATTERN = /female|google us english\b|zira|hazel|susan|sonia|aria|ava|emma|jenny|libby|samantha|victoria|karen|moira|tessa|fiona|kate|serena|claire|natasha|clara|michelle|ana\b|amy\b|joanna|salli|kimberly|kendra/i;
const TTS_MALE_PATTERN = /\bmale\b|david|george|ryan|brian|andrew|guy|daniel|james|mark|richard|steffan|arthur|chris|christopher|eric|roger|tony|davis|jason|brandon|oliver|thomas|william|liam|connor|mitchell|alex|fred|matthew|joey|justin/i;

export function selectAnnouncerVoice(synth) {
  try {
    const voices = synth.getVoices?.() || [];
    if (!voices.length) return null;
    const english = voices.filter(v => /^en\b/i.test(v.lang || ''));
    const pool = english.length ? english : voices;
    // Royal Herald is always male — strictly prefer male voices and never let a female voice win by alphabetical order!
    const score = v => {
      const name = (v.name || '').toLowerCase();
      let s = 0;
      if (/natural|neural|online/.test(name)) s += 38;
      if (/google uk|microsoft (ryan|brian|andrew|george|guy|david|daniel|arthur|mark|richard|steffan)/.test(name)) s += 26;
      if (/en-gb/i.test(v.lang || '')) s += 14;
      if (TTS_MALE_PATTERN.test(name) && !TTS_FEMALE_PATTERN.test(name)) s += 55;
      else if (TTS_FEMALE_PATTERN.test(name)) s -= 95;
      return s;
    };
    const ranked = [...pool].sort((a, b) => score(b) - score(a));
    return ranked[0] || pool[0];
  } catch {
    return null;
  }
}

export function speakKingdomAlert(text = 'Your kingdom is under attack.', volume = 0.65, onFallback = null) {
  const synth = globalThis.speechSynthesis;
  const Utterance = globalThis.SpeechSynthesisUtterance;
  if (!synth || typeof synth.speak !== 'function' || typeof Utterance !== 'function') return false;
  try {
    const voices = synth.getVoices?.() || [];
    if (typeof synth.getVoices === 'function' && voices.length === 0) return false;
    const utterance = new Utterance(text);
    const chosen = selectAnnouncerVoice(synth);
    if (chosen) utterance.voice = chosen;
    utterance.lang = chosen?.lang || 'en-US';
    utterance.rate = 0.95;
    utterance.pitch = 0.88;
    utterance.volume = Math.max(0.20, Math.min(0.95, volume));
    let settled = false;
    let watchdog = null;
    const triggerFallback = () => {
      if (settled) return;
      settled = true;
      if (watchdog !== null) { clearTimeout(watchdog); watchdog = null; }
      try { synth.cancel?.(); } catch {}
      onFallback?.();
    };
    if (typeof onFallback === 'function' && typeof setTimeout === 'function') {
      utterance.onstart = () => {
        settled = true;
        if (watchdog !== null) { clearTimeout(watchdog); watchdog = null; }
      };
      utterance.onerror = triggerFallback;
      watchdog = setTimeout(triggerFallback, 240);
      watchdog?.unref?.();
    }
    synth.cancel?.();
    synth.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

export function installVoiceSystem(AudioEngine) {
  const p = AudioEngine.prototype;

  p.setSpeechDirector = function(director) {
    this.speechDirector = director || null;
  };

  p.warHorn = function(fundamental = 174.61) {
    if (!this.context || this.context.state !== 'running' || this.settings.volume <= 0) return false;
    if (this.settings.warHorns === false) return false;

    const channel = typeof fundamental === 'string' ? fundamental : 'royal';
    const now = this.context.currentTime;
    this.lastHornByChannel ??= {};
    const last = channel === 'royal' ? (this.lastHornAt ?? -Infinity) : (this.lastHornByChannel[channel] ?? -Infinity);
    const cd = channel === 'royal' ? HORN_COOLDOWN : 6.0;
    if (now - last < cd) return false;
    if (channel === 'royal') this.lastHornAt = now;
    this.lastHornByChannel[channel] = now;

    const horn = synthesizeWarHorn(this.context, fundamental);
    const hornGain = this.context.createGain();
    hornGain.gain.value = 0.24;
    const outBus = this.voiceBus || this.master;

    horn.output.connect(hornGain);
    hornGain.connect(outBus);
    if (this.reverbSend) hornGain.connect(this.reverbSend);
    this.duckMusic?.(1.6, 0.62);
    return true;
  };

  p.playNoticeWarn = function() {
    if (!this.context || this.context.state !== 'running' || this.settings.volume <= 0) return false;
    const now = this.context.currentTime;
    if (now - (this.lastNoticeWarnAt ?? -Infinity) < NOTICE_WARN_COOLDOWN) return false;
    this.lastNoticeWarnAt = now;
    this.play?.('notice-warn');
    return true;
  };

  p.announceAttack = function(text = 'Your kingdom is under attack.', opts = {}) {
    if (this.settings.volume <= 0) return false;
    const now = this.context ? this.context.currentTime : performance.now() / 1000;
    if (now - (this.lastAttackAnnounceAt ?? -Infinity) < ATTACK_ANNOUNCE_COOLDOWN) return false;
    this.lastAttackAnnounceAt = now;
    this.duckMusic?.(2.4, 0.50);

    // 1. Always fire the unmistakable watchtower iron bell + urgent war horn immediately via Web Audio
    //    (0ms latency, guaranteed offline & immune to browser speechSynthesis autoplay blocking).
    this.play?.('alarm');

    // 2. Coordinate spoken Royal Herald line cleanly through the unified Speech Director so it
    //    never cancels or collides with WarComms enemy/ally speech!
    const voiceAllowed = this.settings.voiceComms !== false && (this.settings.voiceVolume ?? 1) > 0;
    if (!voiceAllowed) return true;

    if (this.speechDirector && typeof this.speechDirector.speak === 'function') {
      this.speechDirector.speak({
        speaker: opts.speaker || 'Royal Herald',
        role: 'herald',
        faction: opts.faction || 'alder',
        text,
        cue: 'comms-alert',
        priority: 1,
        urgent: true,
        horn: false,
        showBanner: false,
      });
      return true;
    }

    // Prefer real recorded CC0 male herald voice when the sample bank is decoded (no robotic browser TTS!).
    if (this.settings.ttsNarration !== true && this.sampleBank?.has('comms-alert') && typeof this.playCommsVoice === 'function') {
      this.playCommsVoice('comms-alert', { delaySec: 0.35 });
      return true;
    }

    if (this.settings.ttsNarration === true) {
      const vol = (this.settings.volume ?? 0.65) * (this.settings.voiceVolume ?? 1);
      speakKingdomAlert(text, vol, null);
    }
    return true;
  };
}
