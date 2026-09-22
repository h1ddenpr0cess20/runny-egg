import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compile, createMusic, hz } from '../src/ui/music.js';
import { SOUNDTRACK, forHeat } from '../src/ui/soundtrack.js';
import { HEATS } from '../src/core/tuning.js';
import { fakeAudio } from './helpers/audio.js';

/** What `main.js` asks for, and when. */
const ASKED = ['card', 'heat', 'podium', 'gold', 'out'];

const cues = compile(SOUNDTRACK.cues);
const instruments = SOUNDTRACK.instruments({ ctx: fakeAudio(), voice: () => null });

function running(progress) {
  return { state: 'running', progress };
}

/** The highest any heat takes the music. */
const TOP = Math.max(...HEATS.map((_, i) => forHeat(i).transpose));

describe('soundtrack', () => {
  it('has every cue the page asks for', () => {
    for (const name of ASKED) assert.ok(cues[name], `no "${name}" cue`);
  });

  it('plays every part on an instrument it has', () => {
    for (const cue of Object.values(cues)) {
      for (const part of cue.parts) {
        assert.equal(typeof instruments[part.play], 'function', `${cue.name} plays "${part.play}"`);
      }
    }
  });

  it('writes every part in whole bars, and loops them together', () => {
    for (const cue of Object.values(cues)) {
      for (const [i, part] of cue.parts.entries()) {
        const where = `${cue.name}, part ${i} (${part.play})`;
        assert.equal(part.steps.length % cue.bar, 0, `${where} is ${part.steps.length} steps`);
        assert.equal(cue.length % part.steps.length, 0, `${where} drifts against the rest of the cue`);
      }
    }
  });

  it('hands every sting on to a cue that exists', () => {
    for (const cue of Object.values(cues)) {
      if (cue.once && cue.then) assert.ok(cues[cue.then], `${cue.name} hands on to "${cue.then}"`);
    }
  });

  it('keeps every note where a speaker can play it, in every heat', () => {
    for (const cue of Object.values(cues)) {
      const up = cue.name === 'heat' ? TOP : 0;
      for (const part of cue.parts) {
        for (const step of part.steps) {
          for (const note of step?.notes ?? []) {
            const freq = hz(note + up);
            assert.ok(freq > 30 && freq < 5000, `${cue.name}/${part.play} has a note at ${freq.toFixed(0)}Hz`);
          }
        }
      }
    }
  });

  it('builds up the further round a heat gets, and never back down', () => {
    let last = 0;
    for (let progress = 0; progress <= 1; progress += 0.01) {
      const level = SOUNDTRACK.level(running(progress));
      assert.ok(Number.isInteger(level) && level >= last && level <= 3, `level ${level} at ${progress}`);
      last = level;
    }
    assert.equal(SOUNDTRACK.level(running(0)), 0);
    assert.equal(last, 3, 'the run-in is not the whole band');
    assert.equal(SOUNDTRACK.level({ state: 'ready', progress: 1 }), 0);
  });

  it('has something playing at every level of a heat', () => {
    for (let level = 0; level <= 3; level++) {
      const on = cues.heat.parts.filter((part) => part.at <= level && level < part.until);
      assert.ok(on.length > 0, `nothing plays at level ${level}`);
      if (level > 0) {
        assert.ok(cues.heat.parts.some((part) => part.at === level), `level ${level} adds nothing`);
      }
    }
  });

  it('plays every heat higher and quicker than the one before', () => {
    for (let i = 1; i < HEATS.length; i++) {
      assert.ok(forHeat(i).transpose > forHeat(i - 1).transpose, `heat ${i + 1} is no higher`);
      assert.ok(forHeat(i).bpm > forHeat(i - 1).bpm, `heat ${i + 1} is no quicker`);
    }
    assert.equal(forHeat(0).transpose, 0, 'the warm-up is not in the key it was written in');
  });

  it('waltzes on the card', () => {
    assert.equal(cues.card.bar, 12);
  });

  it('gets through a meet, the card, two heats and every ending, on real parts', () => {
    const ctx = fakeAudio();
    const music = createMusic(SOUNDTRACK, { context: ctx });
    const frame = (snapshot) => {
      ctx.advance(1 / 30);
      music.update(snapshot);
    };
    music.play('card');
    for (let t = 0; t < 8; t += 1 / 30) frame({ state: 'ready' });
    for (const [heat, ending] of [[0, 'podium'], [HEATS.length - 1, 'gold']]) {
      music.play('heat', forHeat(heat));
      for (let t = 0; t < 30; t += 1 / 30) frame(running(t / 30));
      assert.equal(music.level, 3);
      music.duck();
      music.play(ending);
      for (let t = 0; t < 12; t += 1 / 30) frame({ state: 'ready' });
      assert.equal(music.cue, 'card', `${ending} did not hand back to the card`);
    }
    music.play('out');
    for (let t = 0; t < 12; t += 1 / 30) frame({ state: 'over' });
    assert.equal(music.cue, 'card');

    const sources = ctx.started;
    assert.ok(sources.length > 500, `only ${sources.length} sources in a minute of music`);
    for (const source of sources) {
      assert.ok(source.stoppedAt > source.startedAt, 'a source was never stopped');
    }
    const ended = sources.filter((source) => source.ended);
    assert.ok(ended.length > sources.length * 0.9);
    assert.ok(ended.every((source) => source.outputs.size === 0), 'a finished note was left wired up');
  });
});
