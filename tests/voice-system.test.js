import test from 'node:test';
import assert from 'node:assert/strict';
import {synthesizeVocalBark, synthesizeWarHorn, installVoiceSystem, VOICE_COOLDOWN, HORN_COOLDOWN} from '../src/voice-system.js';
import {AudioEngine} from '../src/audio.js';

class MockParam {
  constructor(val = 0) {
    this.value = val;
    this.events = [];
  }
  setValueAtTime(v, t) {
    this.value = v;
    this.events.push({ type: 'set', v, t });
  }
  exponentialRampToValueAtTime(v, t) {
    this.value = v;
    this.events.push({ type: 'ramp', v, t });
  }
}

class MockNode {
  constructor() {
    this.connections = [];
  }
  connect(dest) {
    this.connections.push(dest);
  }
  disconnect() {
    this.connections.length = 0;
  }
}

function mockContext() {
  const oscs = [];
  const filters = [];
  const gains = [];
  return {
    currentTime: 10.0,
    state: 'running',
    oscs,
    filters,
    gains,
    createOscillator() {
      const osc = new MockNode();
      osc.type = 'sine';
      osc.frequency = new MockParam(440);
      osc.start = (t) => { osc.startTime = t; };
      osc.stop = (t) => { osc.stopTime = t; };
      oscs.push(osc);
      return osc;
    },
    createBiquadFilter() {
      const f = new MockNode();
      f.type = 'lowpass';
      f.frequency = new MockParam(1000);
      f.Q = new MockParam(1);
      filters.push(f);
      return f;
    },
    createGain() {
      const g = new MockNode();
      g.gain = new MockParam(1);
      gains.push(g);
      return g;
    },
    createStereoPanner() {
      const p = new MockNode();
      p.pan = new MockParam(0);
      return p;
    }
  };
}

test('synthesizeVocalBark creates formant filters and envelope chain for all actions and factions', () => {
  const ctx = mockContext();
  const factions = ['alder', 'sun', 'raven'];
  const actions = ['order', 'attack', 'select', 'work'];

  for (const faction of factions) {
    for (const act of actions) {
      const ctxLocal = mockContext();
      const env = synthesizeVocalBark(ctxLocal, faction, act, 1.0);
      assert.ok(env, `Vocal envelope created for ${faction} ${act}`);
      assert.ok(ctxLocal.oscs.length >= 1, 'Oscillators created for syllables');
      assert.ok(ctxLocal.filters.length >= 2, 'Formant bandpass filters created');
      assert.ok(ctxLocal.oscs.every(o => o.startTime !== undefined && o.stopTime !== undefined), 'Oscillators are scheduled');
    }
  }
});

test('synthesizeWarHorn creates multi-harmonic brass overtones and resonant bell filter', () => {
  const ctx = mockContext();
  const res = synthesizeWarHorn(ctx, 174.61);
  assert.ok(res.output, 'War horn output filter created');
  assert.equal(res.duration, 1.6);
  assert.equal(ctx.oscs.length, 6, '6 harmonic brass overtone oscillators created');
  assert.ok(ctx.filters.length >= 1, 'Bell filter created');
});

test('AudioEngine voice and warHorn methods handle cooldowns, mute, and settings', () => {
  const audio = new AudioEngine({ volume: 0.8, music: false, unitVoices: true, warHorns: true });
  const ctx = mockContext();
  audio.context = ctx;
  audio.master = ctx.createGain();

  // Initial trigger succeeds
  assert.equal(audio.voice('order', { type: 'swordsman' }, 'alder'), true);

  // Triggering again immediately within VOICE_COOLDOWN returns false
  assert.equal(audio.voice('order', { type: 'swordsman' }, 'alder'), false);

  // After cooldown, trigger succeeds again
  ctx.currentTime += VOICE_COOLDOWN + 0.1;
  assert.equal(audio.voice('attack', { type: 'knight' }, 'raven'), true);

  // Setting unitVoices to false disables voice barks
  audio.settings.unitVoices = false;
  ctx.currentTime += VOICE_COOLDOWN + 0.1;
  assert.equal(audio.voice('order', { type: 'villager' }, 'sun'), false);
  audio.settings.unitVoices = true;

  // War horn initial trigger succeeds
  assert.equal(audio.warHorn(), true);

  // War horn within HORN_COOLDOWN returns false
  assert.equal(audio.warHorn(), false);

  // War horn after cooldown succeeds
  ctx.currentTime += HORN_COOLDOWN + 0.5;
  assert.equal(audio.warHorn(), true);

  // Setting warHorns to false disables war horns
  audio.settings.warHorns = false;
  ctx.currentTime += HORN_COOLDOWN + 0.5;
  assert.equal(audio.warHorn(), false);
});
