const VOICES = {
  jump: { from: 380, to: 760, time: 0.11, type: 'triangle', gain: 0.045 },
  land: { from: 240, to: 130, time: 0.07, type: 'triangle', gain: 0.038 },
  crumb: { from: 920, to: 1480, time: 0.07, type: 'square', gain: 0.04 },
  prize: { from: 620, to: 1620, time: 0.22, type: 'square', gain: 0.055 },
  /** A hand down: short, dry, and a relief. */
  caught: { from: 520, to: 300, time: 0.09, type: 'triangle', gain: 0.045 },
  trip: { from: 300, to: 190, time: 0.12, type: 'sawtooth', gain: 0.05 },
  fall: { from: 260, to: 70, time: 0.3, type: 'sawtooth', gain: 0.075 },
  /** The one that matters. */
  crack: { from: 1400, to: 220, time: 0.18, type: 'square', gain: 0.085 },
  break: { from: 700, to: 40, time: 0.75, type: 'sawtooth', gain: 0.1 },
  overtake: { from: 500, to: 880, time: 0.12, type: 'triangle', gain: 0.04 },
  /** Somebody else's day ending, a little way off. */
  away: { from: 500, to: 110, time: 0.4, type: 'sawtooth', gain: 0.045 },
  go: { from: 200, to: 840, time: 0.34, type: 'square', gain: 0.055 },
  tape: { from: 660, to: 1320, time: 0.5, type: 'square', gain: 0.07 },
  out: { from: 300, to: 50, time: 0.9, type: 'sawtooth', gain: 0.09 },
};

/** A handful of oscillators' worth of village fête, built on the first
 *  gesture because no browser will start an AudioContext before one. */
export function createSound() {
  let ctx = null;
  let muted = false;

  function context() {
    if (ctx) return ctx;
    const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    return ctx;
  }

  return {
    get muted() { return muted; },
    set muted(value) { muted = Boolean(value); },

    play(name, { at = 0, volume = 1 } = {}) {
      const voice = VOICES[name];
      if (!voice || muted) return;
      const audio = context();
      if (!audio) return;
      if (audio.state === 'suspended') audio.resume();

      const now = audio.currentTime + at;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = voice.type;
      osc.frequency.setValueAtTime(voice.from, now);
      osc.frequency.exponentialRampToValueAtTime(voice.to, now + voice.time);
      gain.gain.setValueAtTime(Math.max(0.0001, voice.gain * volume), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + voice.time);
      osc.connect(gain).connect(audio.destination);
      osc.start(now);
      osc.stop(now + voice.time + 0.02);
    },
  };
}
