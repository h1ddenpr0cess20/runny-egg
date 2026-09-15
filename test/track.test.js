import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createTrack, HURDLE_CLEAR, OPEN_LANES, reachAt, RHYTHM, ROW_GAP,
} from '../src/core/track.js';
import {
  APEX, DEBRIS, EGG, HEATS, HURDLE, LANES, LANE_WIDTH, laneX,
} from '../src/core/tuning.js';

const SEEDS = [1, 2, 3, 7, 42, 1024, 65535];

function every(fn) {
  for (const seed of SEEDS) {
    for (const [index, heat] of HEATS.entries()) {
      fn(createTrack({ seed, heat }), `seed ${seed}, heat ${index} (${heat.name})`);
    }
  }
}

describe('track', () => {
  it('lays the same heat for the same seed, and a different one otherwise', () => {
    const key = (track) => track.debris.map((d) => [d.z, d.lane, d.bite].join()).join('|')
      + track.hurdles.map((h) => h.z).join('|');
    assert.equal(key(createTrack({ seed: 9, heat: HEATS[3] })), key(createTrack({ seed: 9, heat: HEATS[3] })));
    assert.notEqual(key(createTrack({ seed: 9, heat: HEATS[3] })), key(createTrack({ seed: 10, heat: HEATS[3] })));
  });

  it('has a floor under every metre of it — there are no holes in this one', () => {
    every((track, where) => {
      for (let z = track.start; z < track.runout; z += 3) {
        assert.equal(track.groundAt(0, z), 0, `${where}: a hole at ${z}`);
      }
    });
  });

  it('runs from behind the line to well past it', () => {
    every((track, where) => {
      assert.ok(track.start < 0, `${where}: the field starts off the end of the track`);
      assert.equal(track.finish, track.heat.distance);
      assert.ok(track.runout > track.finish + 50, `${where}: nowhere to pull up`);
      assert.equal(track.sections[0].z0, track.start);
      const covered = track.sections[track.sections.length - 1].z1;
      assert.ok(covered >= track.finish, `${where}: the track stops at ${covered} short of the line`);
    });
  });

  it('leaves the start and the finish clean', () => {
    every((track, where) => {
      for (const thing of [...track.hurdles, ...track.debris]) {
        assert.ok(thing.z > 20, `${where}: something to hit ${thing.z.toFixed(1)}m off the line`);
        assert.ok(thing.z < track.finish - 10, `${where}: something to hit on the run-in`);
      }
    });
  });

  it('never puts two bars closer than a jump can land between them', () => {
    every((track, where) => {
      const floor = reachAt(track.heat.pace) * RHYTHM.min;
      for (let i = 1; i < track.hurdles.length; i++) {
        const gap = track.hurdles[i].z - track.hurdles[i - 1].z;
        assert.ok(
          gap >= floor - 1e-9,
          `${where}: bars ${gap.toFixed(2)}m apart against a ${floor.toFixed(2)}m landing`,
        );
      }
    });
  });

  it('never raises a bar a jump cannot clear', () => {
    every((track, where) => {
      for (const bar of track.hurdles) {
        assert.ok(bar.height < APEX * 0.62, `${where}: a ${bar.height}m bar against a ${APEX.toFixed(2)}m apex`);
        assert.ok(bar.height > EGG.height * 0.4, `${where}: a bar low enough to ignore`);
      }
    });
  });

  it('keeps the landing off a bar, and the take-off into one, clean', () => {
    every((track, where) => {
      for (const bar of track.hurdles) {
        for (const lump of track.debris) {
          const after = lump.z - bar.z;
          assert.ok(
            after < -HURDLE_CLEAR.before || after > HURDLE_CLEAR.after,
            `${where}: a stone ${after.toFixed(2)}m from a bar`,
          );
        }
      }
    });
  });

  it('always leaves lanes open through a row of stones', () => {
    every((track, where) => {
      /** Anything inside one egg-and-a-stone of the same z is the same wall
       *  as far as somebody running at it is concerned. */
      const span = EGG.radius * 2 + DEBRIS.halfDepth * 2;
      for (const lump of track.debris) {
        const wall = new Set(
          track.debris.filter((other) => Math.abs(other.z - lump.z) < span).map((other) => other.lane),
        );
        assert.ok(
          LANES - wall.size >= OPEN_LANES,
          `${where}: ${wall.size} of ${LANES} lanes blocked at ${lump.z.toFixed(1)}`,
        );
      }
    });
  });

  it('never stacks a row of stones on top of the row before it', () => {
    every((track, where) => {
      const rows = [...new Set(track.debris.map((lump) => lump.z))].sort((a, b) => a - b);
      for (let i = 1; i < rows.length; i++) {
        assert.ok(
          rows[i] - rows[i - 1] >= ROW_GAP - 1e-9,
          `${where}: rows ${(rows[i] - rows[i - 1]).toFixed(2)}m apart`,
        );
      }
    });
  });

  it('keeps everything it lays inside the lanes, on the ground', () => {
    every((track, where) => {
      for (const lump of track.debris) {
        assert.ok(lump.lane >= 0 && lump.lane < LANES, `${where}: a stone off the track`);
        assert.equal(lump.x, laneX(lump.lane));
        assert.ok(lump.bite > 0 && lump.bite <= 1);
      }
      for (const item of track.pickups) {
        assert.ok(Math.abs(item.x) <= LANE_WIDTH * 2, `${where}: a pickup outside the lanes`);
        assert.equal(item.x, laneX(item.lane));
        /** Reachable means the middle of the egg can get to it at the top of
         *  a jump — crumbs arc *over* a bar, so the ceiling is not the apex. */
        const ceiling = APEX + EGG.height / 2;
        assert.ok(item.y > 0 && item.y < ceiling, `${where}: a pickup at ${item.y} is out of reach`);
        assert.ok(item.z < track.finish, `${where}: a pickup past the line`);
      }
    });
  });

  it('gives a hurdles heat hurdles and a flat one none', () => {
    for (const seed of SEEDS) {
      const flat = createTrack({ seed, heat: HEATS[0] });
      assert.equal(flat.hurdles.length, 0, 'the warm-up has bars in it');
      const bars = createTrack({ seed, heat: HEATS[4] });
      assert.ok(bars.hurdles.length >= 8, `high hurdles laid only ${bars.hurdles.length} bars`);
    }
  });

  it('puts something worth having on every heat', () => {
    every((track, where) => {
      const crumbs = track.pickups.filter((item) => item.kind === 'crumb');
      const prizes = track.pickups.filter((item) => item.kind !== 'crumb');
      assert.ok(crumbs.length > 20, `${where}: only ${crumbs.length} crumbs`);
      assert.ok(prizes.length >= 1, `${where}: nothing to pick up but crumbs`);
    });
  });

  it('answers what is in a lane, and what is not', () => {
    const track = createTrack({ seed: 4, heat: HEATS[3] });
    const lump = track.debris[3];
    assert.equal(track.blocked(lump.lane, lump.z - 1, lump.z + 1)?.id, lump.id);
    assert.equal(track.blocked((lump.lane + 2) % LANES, lump.z - 0.2, lump.z + 0.2), null);
    assert.equal(track.blocked(lump.lane, track.finish + 50, track.finish + 90), null);
  });

  it('finds the next bar ahead, and runs out of bars at the end', () => {
    const track = createTrack({ seed: 11, heat: HEATS[4] });
    assert.ok(track.hurdles.length > 0);
    for (const bar of track.hurdles) {
      const found = track.nextHurdle(bar.z - 1);
      assert.ok(found && found.z >= bar.z - 1);
      assert.ok(found.z <= bar.z, 'it skipped a bar');
    }
    assert.equal(track.nextHurdle(track.runout), null);
  });

  it('takes a spill, and everybody behind has to go round it', () => {
    const track = createTrack({ seed: 5, heat: HEATS[1] });
    assert.equal(track.splats.length, 0);
    const splat = track.spill(1, 300);
    assert.equal(track.splats.length, 1);
    assert.equal(splat.x, laneX(1));
    assert.equal(track.blocked(1, 299, 301), splat);
    assert.equal(track.blocked(3, 299, 301), null);
  });

  it('sizes a bar and a stone so one is jumped and the other is missed', () => {
    assert.ok(HURDLE.height > DEBRIS.height, 'a stone is taller than a hurdle');
    assert.ok(HURDLE.height * 2 < EGG.height * 1.2, 'a hurdle you would have to vault');
  });
});
