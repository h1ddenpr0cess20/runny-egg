import { diatonic, hit, hold, rest, retune, shape } from './music.js';

/**
 * Runny Egg: a fairground organ at a village fête. Pipes with a tremulant,
 * a tuba going oom, a chord going pah, a bass drum, a woodblock, and a
 * glockenspiel for the crumbs — the band that plays at every sports day
 * there has ever been, wheeled out on a cart.
 *
 * Between heats it plays a waltz, because the card is the bit of the meet
 * where everybody stands about. During one it plays a galop in F, and every
 * heat it plays it a semitone higher and a little quicker than the last, so
 * the final is in B flat and in a hurry. Within a heat it builds: the tune
 * and the oom-pah off the line, the woodblock and the snare once the field
 * has settled, the glockenspiel past halfway, and a second rank of pipes for
 * the run-in.
 */

const F_MAJOR = [5, 7, 9, 10, 0, 2, 4];

const CHORDS = {
  F: { oom: ['f2', 'c2'], pah: 'a3+c4+f4', glock: ['f6', 'a6', 'c7', 'a6'] },
  C7: { oom: ['c2', 'g1'], pah: 'g3+bb3+e4', glock: ['e6', 'g6', 'bb6', 'g6'] },
  Bb: { oom: ['bb1', 'f2'], pah: 'bb3+d4+f4', glock: ['d6', 'f6', 'bb6', 'f6'] },
  Dm: { oom: ['d2', 'a1'], pah: 'a3+d4+f4', glock: ['d6', 'f6', 'a6', 'f6'] },
};

const GALOP = ['F', 'F', 'C7', 'F', 'F', 'Bb', 'C7', 'F'];
const each = (form, write) => form.map((name, i) => write(CHORDS[name], i)).join(' | ');

/** The last bar walks the tuba back up to the top. */
const oom = ({ oom: [root, fifth] }, i) => (i === 7
  ? 'f2 - . . . . . . c2 - . . e2 - . .'
  : `${root} - . . . . . . ${fifth} - . . . . . .`);
const pah = ({ pah: chord }) => `. . . . ${chord} - . . . . . . ${chord} - . .`;
const sparkle = ({ glock: [a, b, c, d] }) => `${a} . . . ${b} . . . ${c} . . . ${d} . . .`;

const TUNE = [
  'c5 . c5 . a4 . c5 . f5 - - - c5 - - -',
  'd5 . d5 . c5 . a4 . c5 - - - - - - -',
  'bb4 . bb4 . g4 . bb4 . e5 - - - c5 - - -',
  'a4 . c5 . f5 . a5 . g5 - f5 - e5 - d5 -',
  'c5 . c5 . a4 . c5 . f5 - - - a5 - - -',
  'bb5 - - - a5 - g5 - f5 - d5 - bb4 - d5 -',
  'c5 - - - e5 - g5 - bb5 - - - g5 - e5 -',
  'f5 - - - c5 - a4 - f4 - - - . . . .',
].join(' | ');
/** The second rank, a third under the first. */
const THIRDS = retune(TUNE, diatonic(F_MAJOR, -2));

/** The card: a waltz, three to a bar, on a steam whistle. */
const WALTZ = ['F', 'Dm', 'Bb', 'C7', 'F', 'Dm', 'C7', 'F'];
const CAROUSEL = [
  'a4 - - - c5 - - - f5 - - -',
  'e5 - - - - - - - d5 - - -',
  'd5 - - - f5 - - - bb5 - - -',
  'a5 - - - - - - - g5 - - -',
  'a4 - - - c5 - - - f5 - - -',
  'a5 - - - - - - - f5 - - -',
  'e5 - - - g5 - - - bb4 - - -',
  'a4 - - - - - - - - - - -',
].join(' | ');

const FANFARE = 'c5 . c5 . c5 . f5 - - - - - a5 - - - | c6 - - - - - - - - - - - . . . .';
const GOLD = [
  'c5 . c5 . c5 . c5 . f5 - - - a5 - - -',
  'c6 - - - a5 - - - c6 - - - - - - -',
  'bb5 - a5 - g5 - f5 - g5 - - - e5 - - -',
  'f5 - - - - - - - - - - - . . . .',
].join(' | ');

/** Where each heat sits: a semitone up and four beats a minute quicker than
 *  the one before it. */
export function forHeat(index) {
  return { transpose: index, bpm: 126 + 4 * index };
}

function instruments({ voice }) {
  /** A rank of pipes: two squares a few cents apart, so they beat against
   *  each other, and a tremulant on the lot. */
  function pipes(out, t, dur, freqs, vel, { peak, tone, octave = 0 }) {
    const note = voice(t);
    const low = note.filter('lowpass', tone, 0.9);
    for (const freq of freqs) {
      note.osc('square', freq, -4).connect(low);
      note.osc('square', freq, 4).connect(low);
      if (octave) {
        const flute = note.osc('sine', freq * 2);
        const fluteAmp = note.gain(octave);
        flute.connect(fluteAmp).connect(low);
      }
    }
    const level = (peak * vel) / freqs.length;
    const amp = note.gain();
    note.wobble(amp.gain, 6.4, level * 0.22, 0.02);
    low.connect(amp).connect(out);
    note.play(shape(amp.gain, t, dur * 0.9, {
      peak: level, attack: 0.012, decay: 0.2, sustain: 0.85, release: 0.05,
    }));
  }

  return {
    pipes(out, t, dur, freqs, vel) {
      pipes(out, t, dur, freqs, vel, { peak: 0.16, tone: 3400, octave: 0.8 });
    },

    /** The accompaniment: short, and on the off-beat. */
    pah(out, t, dur, freqs, vel) {
      pipes(out, t, dur, freqs, vel, { peak: 0.2, tone: 1700 });
    },

    tuba(out, t, dur, [freq], vel) {
      const note = voice(t);
      const low = note.filter('lowpass', 480, 1.2);
      low.frequency.linearRampToValueAtTime(820, t + 0.03);
      low.frequency.setTargetAtTime(480, t + 0.03, 0.08);
      note.osc('sawtooth', freq).connect(low);
      note.osc('triangle', freq).connect(low);
      const amp = note.gain();
      low.connect(amp).connect(out);
      note.play(shape(amp.gain, t, dur * 0.9, {
        peak: 0.5 * vel, attack: 0.02, decay: 0.2, sustain: 0.6, release: 0.07,
      }));
    },

    glock(out, t, _dur, [freq], vel) {
      const note = voice(t);
      const bar = note.osc('sine', freq);
      const overtone = note.osc('sine', freq * 2.76);
      const overAmp = note.gain();
      overtone.connect(overAmp);
      hit(overAmp.gain, t, 0.12, 0.3);
      const amp = note.gain();
      bar.connect(amp);
      overAmp.connect(amp);
      amp.connect(out);
      note.play(hit(amp.gain, t, 0.7, 0.3 * vel));
    },

    /** A steam whistle: a sine, a breath of the steam, and a vibrato wide
     *  enough to be a little out of tune. */
    calliope(out, t, dur, [freq], vel) {
      const note = voice(t);
      const pipe = note.osc('sine', freq);
      note.wobble(pipe.detune, 6.8, 18, 0.05);
      const reed = note.osc('triangle', freq * 2);
      const reedAmp = note.gain(0.18);
      reed.connect(reedAmp);
      const steam = note.noise();
      const hiss = note.filter('bandpass', freq * 2, 4);
      const hissAmp = note.gain(0.25);
      steam.connect(hiss).connect(hissAmp);
      const amp = note.gain();
      pipe.connect(amp);
      reedAmp.connect(amp);
      hissAmp.connect(amp);
      amp.connect(out);
      note.play(shape(amp.gain, t, dur * 0.92, {
        peak: 0.3 * vel, attack: 0.03, decay: 0.3, sustain: 0.8, release: 0.1,
      }));
    },

    /** A big felt beater on a big drum. */
    drum(out, t, _dur, _freqs, vel) {
      const note = voice(t);
      const skin = note.osc('sine', 95);
      skin.frequency.exponentialRampToValueAtTime(52, t + 0.1);
      const amp = note.gain();
      skin.connect(amp).connect(out);
      const thud = note.noise();
      const low = note.filter('lowpass', 300);
      const thudAmp = note.gain();
      thud.connect(low).connect(thudAmp).connect(out);
      hit(thudAmp.gain, t, 0.06, 0.4 * vel);
      note.play(hit(amp.gain, t, 0.36, 0.9 * vel, 0.004));
    },

    snare(out, t, _dur, _freqs, vel) {
      const note = voice(t);
      const src = note.noise();
      const band = note.filter('bandpass', 2600, 0.9);
      const amp = note.gain();
      src.connect(band).connect(amp).connect(out);
      note.play(hit(amp.gain, t, 0.11, 0.5 * vel));
    },

    block(out, t, _dur, _freqs, vel) {
      const note = voice(t);
      const wood = note.osc('triangle', 1050);
      wood.frequency.exponentialRampToValueAtTime(900, t + 0.03);
      const amp = note.gain();
      wood.connect(amp).connect(out);
      note.play(hit(amp.gain, t, 0.045, 0.5 * vel, 0.001));
    },

    cymbal(out, t, _dur, _freqs, vel) {
      const note = voice(t);
      const src = note.noise();
      const air = note.filter('highpass', 5200);
      const shimmer = note.filter('peaking', 8500, 1.5);
      shimmer.gain.setValueAtTime(6, t);
      const amp = note.gain();
      src.connect(air).connect(shimmer).connect(amp).connect(out);
      note.play(hit(amp.gain, t, 1.3, 0.3 * vel));
    },

    /** Wah, wah, wah — and the last one given up on slowly. */
    trombone(out, t, dur, [freq], vel) {
      const note = voice(t);
      const low = note.filter('lowpass', 380, 3);
      low.frequency.linearRampToValueAtTime(1500, t + 0.12);
      low.frequency.setTargetAtTime(420, t + 0.15, dur / 3);
      const long = dur > 1;
      for (const cents of [-5, 5]) {
        const osc = note.osc('sawtooth', freq, cents);
        if (long) {
          osc.frequency.setTargetAtTime(freq * 0.94, t + dur * 0.4, dur / 2);
          note.wobble(osc.detune, 5.5, 45, dur * 0.3);
        }
        osc.connect(low);
      }
      const amp = note.gain();
      low.connect(amp).connect(out);
      note.play(shape(amp.gain, t, dur * 0.9, {
        peak: 0.3 * vel, attack: 0.04, decay: 0.4, sustain: 0.8, release: 0.2,
      }));
    },
  };
}

export const SOUNDTRACK = {
  volume: 0.22,
  space: {
    /** Out in the open: a little of the church across the green, and an
     *  echo off the marquee. */
    reverb: { seconds: 1.8, decay: 3.5, level: 0.6 },
    echo: { beats: 0.5, feedback: 0.2, tone: 2800 },
  },
  instruments,

  /** The further round, the more of the band. */
  level(snapshot) {
    if (snapshot.state !== 'running') return 0;
    const round = snapshot.progress;
    return round < 0.15 ? 0 : round < 0.45 ? 1 : round < 0.8 ? 2 : 3;
  },

  cues: {
    card: {
      bpm: 150,
      bar: 12,
      parts: [
        { play: 'tuba', gain: 0.55, notes: each(WALTZ, ({ oom: [root] }) => `${hold(root, 3)} . . . . . . . . .`) },
        { play: 'pah', gain: 1.1, pan: 0.15, notes: each(WALTZ, ({ pah: chord }) => `. . . . ${chord} - . . ${chord} - . .`) },
        { play: 'calliope', gain: 0.68, wet: 0.3, echo: 0.1, notes: CAROUSEL },
        {
          play: 'glock', gain: 1.2, wet: 0.3, pan: -0.3,
          notes: each(WALTZ, ({ glock: [a] }, i) => (i % 2 ? rest(12) : `${a} . . . . . . . . . . .`)),
        },
      ],
    },

    heat: {
      bpm: 126,
      parts: [
        { play: 'tuba', gain: 0.66, notes: each(GALOP, oom) },
        { play: 'pah', gain: 1.35, pan: 0.15, notes: each(GALOP, pah) },
        { play: 'drum', gain: 0.7, notes: 'x . . . . . . . x . . . . . . .' },
        { play: 'pipes', gain: 0.73, wet: 0.2, notes: TUNE },
        { play: 'block', gain: 1.6, at: 1, pan: -0.35, notes: '. . x . . . x . . . x . . . x .' },
        { play: 'snare', gain: 2.2, at: 1, pan: 0.2, notes: '. . . . X . . o . . . . X . o o' },
        { play: 'glock', gain: 0.9, at: 2, wet: 0.25, pan: -0.3, notes: each(GALOP, sparkle) },
        { play: 'cymbal', gain: 0.75, at: 2, wet: 0.2, notes: `X ${rest(63)} X ${rest(63)}` },
        { play: 'pipes', gain: 0.51, at: 3, wet: 0.2, pan: 0.25, notes: THIRDS },
      ],
    },

    /** Through to the next heat. */
    podium: {
      bpm: 120,
      once: true,
      then: 'card',
      parts: [
        { play: 'pipes', gain: 0.73, wet: 0.3, notes: FANFARE },
        { play: 'pipes', gain: 0.51, wet: 0.3, notes: retune(FANFARE, diatonic(F_MAJOR, -2)) },
        { play: 'tuba', gain: 0.66, notes: 'f2 - . . . . . . c2 - . . . . . . | f2 - - - - - - - . . . . . . . .' },
        { play: 'drum', gain: 0.7, notes: 'x . . . . . . . x . . . . . . . | X . . . . . . . . . . . . . . .' },
        { play: 'cymbal', gain: 0.75, wet: 0.3, notes: `${rest(16)} | X ${rest(15)}` },
      ],
    },

    /** The gold. */
    gold: {
      bpm: 112,
      once: true,
      then: 'card',
      parts: [
        { play: 'pipes', gain: 0.73, wet: 0.3, notes: GOLD },
        { play: 'pipes', gain: 0.51, wet: 0.3, notes: retune(GOLD, diatonic(F_MAJOR, -2)) },
        { play: 'glock', gain: 0.9, wet: 0.35, notes: retune(GOLD, (note) => note + 12) },
        {
          play: 'tuba', gain: 0.66,
          notes: 'f2 - . . . . . . c2 - . . . . . . | f2 - . . . . . . a1 - . . . . . . | bb1 - . . . . . . c2 - . . . . . . | f2 - - - - - - - . . . . . . . .',
        },
        { play: 'drum', gain: 0.7, notes: `x . . . x . . . x . . . x . . . | X . . . x . . . x . . . x . . . | x . . . x . . . x . . . x x x x | X ${rest(15)}` },
        { play: 'cymbal', gain: 0.75, wet: 0.3, notes: `X ${rest(15)} | X ${rest(15)} | ${rest(16)} | X ${rest(15)}` },
      ],
    },

    /** Out of the meet. */
    out: {
      bpm: 92,
      once: true,
      then: 'card',
      parts: [
        { play: 'trombone', gain: 0.9, wet: 0.3, notes: `${rest(8)} bb3 - - - a3 - - - | ab3 - - - ${hold('g3', 16)} ${rest(12)}` },
      ],
    },
  },
};
