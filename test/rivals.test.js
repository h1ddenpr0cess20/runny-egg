import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { advance } from '../src/core/racer.js';
import { createField } from '../src/core/rivals.js';
import { ROSTER } from '../src/core/roster.js';
import { createTrack } from '../src/core/track.js';
import { HEATS, LANES } from '../src/core/tuning.js';

const STEP = 1 / 120;

/** Run a field down a track on its own, with no player in it. */
function heatOut(heat, seed = 1, seconds = 90) {
  const track = createTrack({ seed, heat });
  const field = createField({ seed, heat });
  const all = field.racers;
  let time = 0;
  const jumped = new Set();
  /** Crossings are recorded here rather than read off `racer.time`, which
   *  only stops when `race.js` stops it — on its own a field runs the clock
   *  past the line and every egg looks like a dead heat. */
  const crossed = new Map();

  for (let i = 0; i < seconds / STEP; i++) {
    time += STEP;
    const progress = Math.min(1, Math.max(...all.map((r) => r.z)) / track.finish);
    for (const racer of all) {
      if (racer.broken) continue;
      const intent = field.think(racer, STEP, { track, all, time });
      if (intent.jump) jumped.add(racer.id);
      advance(racer, STEP, intent, { pace: field.paceFor(racer, { time, progress }) });
      if (!crossed.has(racer.id) && racer.z >= track.finish) crossed.set(racer.id, time);
    }
    if (all.every((racer) => racer.z > track.finish || racer.broken)) break;
  }
  return { track, field, all, jumped, crossed, time };
}

describe('the field', () => {
  it('turns out the number of eggs the heat card asks for', () => {
    for (const heat of HEATS) {
      const field = createField({ seed: 1, heat });
      assert.equal(field.racers.length, heat.field - 1);
      assert.equal(new Set(field.racers.map((r) => r.id)).size, field.racers.length);
    }
    assert.ok(HEATS.every((heat) => heat.field - 1 <= ROSTER.length), 'a heat wants more eggs than exist');
  });

  it('gives every one of them a colour, a size and a name of its own', () => {
    const { racers } = createField({ seed: 1, heat: HEATS[5] });
    assert.equal(new Set(racers.map((r) => r.tint)).size, racers.length);
    assert.equal(new Set(racers.map((r) => r.name)).size, racers.length);
    const sizes = racers.map((r) => r.size);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) > 0.08, 'they are all the same egg');
    assert.ok(Math.max(...sizes) - Math.min(...sizes) < 0.3, 'one of them is a different species');
  });

  it('lines them up off the middle lane, which is yours', () => {
    for (const heat of HEATS) {
      const { racers } = createField({ seed: 3, heat });
      for (const racer of racers) {
        assert.notEqual(racer.lane, Math.floor(LANES / 2));
        assert.ok(racer.lane >= 0 && racer.lane < LANES);
      }
    }
  });

  it('runs the better heats better', () => {
    const easy = createField({ seed: 1, heat: HEATS[0] });
    const hard = createField({ seed: 1, heat: HEATS[5] });
    for (const entry of ROSTER.slice(0, 4)) {
      assert.ok(
        hard.poiseOf(entry.id) > easy.poiseOf(entry.id),
        `${entry.name} is no better in the final than in the warm-up`,
      );
    }
  });

  it('jumps the bars rather than walking through them', () => {
    const { jumped, all } = heatOut(HEATS[4], 2);
    assert.equal(jumped.size, all.length, 'somebody never left the ground on a hurdles course');
  });

  it('gets round a heat on its own, mostly upright', () => {
    for (const seed of [1, 2, 3, 7]) {
      const { track, all } = heatOut(HEATS[3], seed);
      const home = all.filter((racer) => racer.z >= track.finish);
      assert.ok(home.length >= all.length - 2, `seed ${seed}: only ${home.length} of ${all.length} got round`);
      for (const racer of all) assert.ok(racer.z > 0, 'an egg never left the line');
    }
  });

  it('does not all finish together — a race has a spread in it', () => {
    const { crossed } = heatOut(HEATS[5], 5);
    const times = [...crossed.values()];
    assert.ok(times.length > 2, 'barely anybody finished');
    assert.ok(Math.max(...times) - Math.min(...times) > 0.5, 'the whole field dead-heated');
  });

  it('moves about the track instead of holding its lane all race', () => {
    const { all } = heatOut(HEATS[0], 4, 60);
    const start = createField({ seed: 4, heat: HEATS[0] }).racers.map((r) => r.lane);
    const moved = all.filter((racer, i) => racer.lane !== start[i]).length;
    assert.ok(moved > 0, 'the field ran the whole heat in the lanes it started in');
  });

  it('is the same field for the same seed', () => {
    const a = heatOut(HEATS[2], 8).all.map((r) => [r.id, r.z.toFixed(4), r.cracks].join());
    const b = heatOut(HEATS[2], 8).all.map((r) => [r.id, r.z.toFixed(4), r.cracks].join());
    assert.deepEqual(a, b);
  });
});
