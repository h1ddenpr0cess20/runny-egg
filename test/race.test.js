import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createRace } from '../src/core/race.js';
import {
  BOOST, CRACKS, FELLING, FLOAT, GRACE, GRIP, HEATS, HURDLE, LANES, laneX, SCORE,
} from '../src/core/tuning.js';
import { pilot, runHeat, runMeet } from './helpers/pilot.js';

const SEEDS = [1, 2, 3, 7, 42];

function started(seed = 1, heats = HEATS) {
  const race = createRace({ seed, heats });
  race.play(seed);
  return race;
}

function play(race, seconds, intent = null) {
  for (let i = 0; i < seconds * 60 && race.state === 'running'; i++) race.advance(1 / 60, intent);
  return race.snapshot();
}

/** Clear the track and put one thing on it, in the player's lane, ahead. */
function only(race, what, ahead = 14) {
  const { player, track } = race.snapshot();
  track.hurdles.length = 0;
  track.debris.length = 0;
  track.pickups.length = 0;
  track.splats.length = 0;
  for (const rival of race.rivals) rival.z = -400;

  const thing = { id: 900, z: player.z + ahead, lane: player.lane, x: player.x, ...what };
  if (what.height !== undefined) {
    thing.cleared = new Set();
    track.hurdles.push(thing);
  } else if (what.bite !== undefined) {
    track.debris.push(thing);
  } else {
    track.pickups.push(thing);
  }
  return thing;
}

/** Put a rival shoulder to shoulder with you, inside the contact window. */
function shoulderTo(race) {
  const rival = race.rivals[0];
  rival.z = race.player.z + 0.4;
  rival.lane = race.player.lane;
  rival.x = race.player.x;
  rival.speed = race.player.speed;
  return rival;
}

describe('race', () => {
  it('waits to be started, and nothing moves until it is', () => {
    const race = createRace({ seed: 1 });
    assert.equal(race.state, 'ready');
    assert.equal(race.track, null);
    play(race, 2);
    assert.equal(race.state, 'ready');
    assert.equal(race.player.z, 0);
  });

  it('lines the field up with you in the middle and everybody on the line', () => {
    const race = started();
    assert.equal(race.player.lane, Math.floor(LANES / 2));
    assert.equal(race.player.x, laneX(Math.floor(LANES / 2)));
    assert.equal(race.rivals.length, HEATS[0].field - 1);
    for (const rival of race.rivals) {
      assert.equal(rival.z, 0);
      assert.notEqual(rival.lane, race.player.lane, 'a rival started on top of you');
      assert.ok(rival.size > 0.9 && rival.size < 1.1, 'a rival the wrong size entirely');
    }
    const lanes = new Set(race.rivals.map((rival) => rival.lane));
    assert.equal(lanes.size, race.rivals.length, 'two eggs in one lane on the line');
  });

  it('scores the ground covered, and never goes backwards', () => {
    const race = started(9);
    let last = 0;
    for (let i = 0; i < 60 * 25 && race.state === 'running'; i++) {
      race.advance(1 / 60, pilot(race));
      assert.ok(race.score >= last, 'the score went backwards');
      last = race.score;
    }
    const snapshot = race.snapshot();
    assert.ok(snapshot.distance > 100);
    assert.equal(
      snapshot.score,
      Math.floor(snapshot.distance) + snapshot.crumbs * SCORE.perCrumb + snapshot.overtakes * SCORE.perOvertake,
    );
  });

  it('stops counting distance at the line', () => {
    const race = started(4);
    const finish = race.track.finish;
    play(race, 400, pilot(race) && null);
    assert.ok(race.snapshot().distance <= finish + 1e-9);
  });

  describe('hurdles', () => {
    it('costs a crack to run into one', () => {
      const race = started(3);
      only(race, { height: HURDLE.height });
      const falls = [];
      race.on('fall', (e) => falls.push(e.reason));
      play(race, 3);
      assert.deepEqual(falls, ['hurdle']);
      assert.equal(race.player.cracks, 1);
    });

    it('costs nothing to jump one', () => {
      const race = started(3);
      const bar = only(race, { height: HURDLE.height });
      race.on('fall', () => assert.fail('a cleared bar put the egg down'));
      race.on('trip', () => assert.fail('a cleared bar was a stumble'));
      while (race.state === 'running' && bar.z - race.player.z > race.player.speed * 0.32) {
        race.advance(1 / 120, null);
      }
      race.advance(1 / 120, { left: 0, right: 0, jump: true, tuck: false });
      while (race.state === 'running' && race.player.z < bar.z + 3) race.advance(1 / 120, null);
      assert.equal(race.player.cracks, 0);
    });

    it('is a stumble, not a fall, when a foot catches the top of it', () => {
      const race = started(3);
      const bar = only(race, { height: HURDLE.height }, 40);
      const trips = [];
      race.on('trip', (e) => trips.push(e.reason));
      race.on('fall', () => assert.fail('a graze put the egg down'));

      /**
       * Hold the egg at exactly a grazing height through the whole crossing.
       * Setting it once metres out does not work — gravity has the rest of
       * the run-in to turn a graze into a face-first one.
       */
      while (race.state === 'running' && race.player.z < bar.z - 1.5) race.advance(1 / 120, null);
      while (race.state === 'running' && race.player.z < bar.z + 1.5) {
        race.player.y = bar.height - HURDLE.graze * 0.5;
        race.player.vy = 0;
        race.player.grounded = false;
        race.advance(1 / 120, null);
      }
      assert.deepEqual(trips, ['hurdle']);
      assert.equal(race.player.cracks, 0);
    });
  });

  describe('what is lying on the track', () => {
    it('trips you on a stone and fells you on a boulder', () => {
      const tripped = started(3);
      only(tripped, { bite: 0.3, kind: 'stone' });
      const trips = [];
      tripped.on('trip', (e) => trips.push(e.reason));
      tripped.on('fall', () => assert.fail('a pebble put the egg down'));
      play(tripped, 3);
      assert.deepEqual(trips, ['stone']);
      assert.equal(tripped.player.cracks, 0);

      const felled = started(3);
      only(felled, { bite: FELLING + 0.1, kind: 'boulder' });
      const falls = [];
      felled.on('fall', (e) => falls.push(e.reason));
      play(felled, 3);
      assert.deepEqual(falls, ['boulder']);
      assert.equal(felled.player.cracks, 1);
    });

    it('fells you on the second stone when you are still wobbling from the first', () => {
      const race = started(3);
      const first = only(race, { bite: 0.3, kind: 'stone' });
      race.track.debris.push({ ...first, id: 901, z: first.z + 4 });
      const falls = [];
      race.on('fall', (e) => falls.push(e.reason));
      play(race, 3);
      assert.deepEqual(falls, ['stone']);
      assert.equal(race.player.cracks, 1);
    });

    it('lets a jump clear a stone entirely', () => {
      const race = started(3);
      const lump = only(race, { bite: 0.4, kind: 'stone' });
      race.on('trip', () => assert.fail('a jumped stone still tripped the egg'));
      while (race.state === 'running' && lump.z - race.player.z > race.player.speed * 0.3) {
        race.advance(1 / 120, null);
      }
      race.advance(1 / 120, { left: 0, right: 0, jump: true, tuck: false });
      while (race.state === 'running' && race.player.z < lump.z + 2) race.advance(1 / 120, null);
      assert.equal(race.player.cracks, 0);
    });

    it('walks straight over everything with straw underfoot', () => {
      const race = started(3);
      only(race, { bite: FELLING + 0.2, kind: 'boulder' });
      race.player.grip = GRIP.time;
      let crunched = 0;
      race.on('crunch', () => { crunched += 1; });
      race.on('fall', () => assert.fail('straw did not hold'));
      play(race, 3);
      assert.equal(crunched, 1);
      assert.equal(race.player.cracks, 0);
    });

    it('slips on yolk without cracking on it', () => {
      const race = started(3);
      only(race, { bite: 0.3, kind: 'stone' });
      race.track.debris.length = 0;
      const splat = race.track.spill(race.player.lane, race.player.z + 14);
      splat.x = race.player.x;
      const trips = [];
      race.on('trip', (e) => trips.push(e.reason));
      race.on('fall', () => assert.fail('yolk broke an egg'));
      play(race, 3);
      assert.deepEqual(trips, ['yolk']);
      assert.equal(race.player.cracks, 0);
    });
  });

  describe('what is worth picking up', () => {
    it('pays for a crumb once', () => {
      const race = started(3);
      only(race, { kind: 'crumb', y: 0.75, taken: false });
      let taken = 0;
      race.on('crumb', () => { taken += 1; });
      play(race, 3);
      assert.equal(taken, 1);
      assert.equal(race.snapshot().crumbs, 1);
      assert.ok(race.score >= SCORE.perCrumb);
    });

    it('hands over a feather, some straw, a puff and a patch', () => {
      for (const [kind, field, value] of [
        ['feather', 'boost', BOOST.time], ['straw', 'grip', GRIP.time], ['puff', 'float', FLOAT.time],
      ]) {
        const race = started(3);
        only(race, { kind, y: 0.8, taken: false });
        play(race, 1.6);
        assert.ok(race.player[field] > value - 1, `a ${kind} gave ${race.player[field]} of ${value}`);
      }

      const mended = started(3);
      only(mended, { kind: 'patch', y: 0.8, taken: false });
      mended.player.cracks = 2;
      play(mended, 1.6);
      assert.equal(mended.player.cracks, 1, 'a patch mended nothing');
    });
  });

  describe('the other eggs', () => {
    it('costs a crack to run into one, and gives a moment of grace after', () => {
      const race = started(3);
      only(race, { bite: 0.1 });
      race.track.debris.length = 0;
      shoulderTo(race);

      const cracks = [];
      race.on('crack', (e) => { if (e.player) cracks.push(e.reason); });
      play(race, 1.2);
      assert.deepEqual(cracks, ['egg']);
      assert.ok(race.player.grace > 0);
      assert.ok(race.player.grace <= GRACE);
    });

    it('takes the egg that ran into you down with you', () => {
      const race = started(3);
      race.track.debris.length = 0;
      const rival = shoulderTo(race);

      const cracked = new Set();
      const floored = new Set();
      race.on('crack', (e) => cracked.add(e.racer.id));
      race.on('fall', (e) => floored.add(e.racer.id));
      play(race, 1.2);
      assert.deepEqual([...floored].sort(), ['marc', rival.id].sort(), 'somebody kept their feet');
      assert.deepEqual([...cracked].sort(), ['marc', rival.id].sort(), 'somebody got up unmarked');
    });

    it('goes through the back of one on a feather, and spends the feather on it', () => {
      const race = started(3);
      race.track.debris.length = 0;
      race.player.boost = BOOST.time;
      const rival = shoulderTo(race);

      let barged = null;
      race.on('barge', (e) => { barged = e; });
      race.on('crack', (e) => { if (e.player) assert.fail('a barge cost the barger a crack'); });
      play(race, 1);
      assert.ok(barged, 'the boost went straight through without touching');
      assert.equal(barged.hit.id, rival.id);
      assert.ok(rival.down > 0, 'the barged egg stayed on its feet');
      assert.ok(race.player.down <= 0, 'the barger went down with it');
      assert.equal(race.player.boost, 0, 'the feather survived the egg it went through');
    });

    it('goes over an egg already on the floor for the price of your balance', () => {
      const race = started(3);
      race.track.debris.length = 0;
      const rival = shoulderTo(race);
      rival.down = 2;

      race.on('crack', () => assert.fail('a fallen egg cracked somebody'));
      const trips = [];
      race.on('trip', (e) => { if (e.player) trips.push(e.reason); });
      play(race, 0.4);
      assert.deepEqual(trips, ['heap']);
    });

    it('treads the one on the floor back down rather than stepping over it', () => {
      const race = started(3);
      race.track.debris.length = 0;
      const rival = shoulderTo(race);
      /** On its way up, which is the moment a boot in the back costs it. */
      rival.down = 0.05;

      race.advance(1 / 60, null);
      assert.ok(rival.down > 0.05, 'the egg on the grass got up as if nobody had been over it');
      assert.ok(race.player.cracks === 0 && rival.cracks === 0, 'a heap cracked somebody');
    });
  });

  describe('three cracks', () => {
    it('breaks the shell on the third and ends the meet there', () => {
      const race = started(3);
      const breaks = [];
      race.on('break', (e) => breaks.push(e));
      /** Three boulders, far enough apart that the grace from one is long
       *  spent by the next — a fall costs a second on the floor, so metres
       *  are the only honest way to space them. */
      only(race, { bite: FELLING + 0.1, kind: 'boulder' }, 30);
      for (let i = 1; i < CRACKS; i++) {
        race.track.debris.push({
          id: 910 + i, z: race.player.z + 30 + i * 45, lane: race.player.lane,
          x: race.player.x, bite: FELLING + 0.1, kind: 'boulder',
        });
      }
      play(race, 30);
      assert.equal(breaks.length, 1);
      assert.ok(breaks[0].player);
      assert.equal(race.player.cracks, CRACKS);
      assert.ok(race.player.broken);
      assert.equal(race.state, 'over');
      assert.equal(race.outcome, 'broken');
    });

    it('leaves a slick on the grass where the shell went', () => {
      const race = started(3);
      race.player.cracks = CRACKS - 1;
      race.player.grace = 0;
      only(race, { bite: FELLING + 0.1, kind: 'boulder' }, 16);
      play(race, 4);
      assert.equal(race.track.splats.length, 1);
      assert.equal(race.track.splats[0].lane, race.player.lane);
    });

    it('does not spend two cracks on one bump', () => {
      const race = started(3);
      const lump = only(race, { bite: FELLING + 0.1, kind: 'boulder' }, 10);
      race.track.debris.push({ ...lump, id: 902, z: lump.z + 1.1, struck: undefined });
      play(race, 2);
      assert.equal(race.player.cracks, 1, 'the grace window let a second crack through');
    });

    it('patches you up between heats', () => {
      const race = started(1);
      race.player.cracks = 2;
      runHeat(race, { seconds: 200 });
      if (race.state !== 'ready') return;
      race.play();
      assert.equal(race.player.cracks, 0, 'the cracks came along to the next heat');
    });
  });

  describe('the card', () => {
    it('advances on a qualifying place and throws you out below it', () => {
      for (const seed of SEEDS) {
        const race = createRace({ seed });
        const heat = runHeat(race, { seconds: 200, seed });
        const results = heat.results;
        assert.ok(results, `seed ${seed} never finished a heat`);
        if (results.outcome === 'advance') {
          assert.ok(results.place <= HEATS[0].qualify);
          assert.equal(race.state, 'ready');
          assert.equal(race.heatIndex, 1);
        } else {
          assert.ok(results.place > HEATS[0].qualify || results.outcome === 'broken');
          assert.equal(race.state, 'over');
        }
      }
    });

    it('places the whole field, once each, in a sensible order', () => {
      const race = createRace({ seed: 2 });
      const { results } = runHeat(race, { seconds: 200, seed: 2 });
      const places = results.standings.filter((row) => !row.broken).map((row) => row.place);
      assert.deepEqual(places, places.map((_, i) => i + 1), 'the places are not 1..n');
      assert.equal(new Set(results.standings.map((row) => row.id)).size, results.standings.length);
      assert.equal(results.standings.filter((row) => row.you).length, 1);
      for (const row of results.standings) {
        if (row.broken) assert.equal(row.place, 0, 'a broken egg was given a place');
      }
    });

    it('pays for the place, and pays more for a clean one', () => {
      const race = createRace({ seed: 7 });
      const { results } = runHeat(race, { seconds: 200, seed: 7 });
      const base = Math.floor(HEATS[0].distance) + results.crumbs * SCORE.perCrumb
        + results.overtakes * SCORE.perOvertake;
      const expected = base + SCORE.place[results.place - 1] + (results.clean ? SCORE.clean : 0);
      assert.equal(results.earned, expected);
    });

    it('runs the card in order, each heat longer and quicker than the last', () => {
      for (let i = 1; i < HEATS.length; i++) {
        assert.ok(HEATS[i].pace > HEATS[i - 1].pace, `heat ${i} is no quicker`);
        assert.ok(HEATS[i].distance > HEATS[i - 1].distance, `heat ${i} is no longer`);
        assert.ok(HEATS[i].skill > HEATS[i - 1].skill, `heat ${i} is no better run`);
      }
    });

    it('lays a different track for each heat of the same meet', () => {
      const race = createRace({ seed: 5 });
      race.play(5);
      const first = race.track;
      runHeat(race, { seconds: 200 });
      if (race.state !== 'ready') return;
      race.play();
      assert.notEqual(race.track, first);
      assert.notEqual(race.track.finish, first.finish);
    });

    it('starts a whole new meet after one ends', () => {
      const race = createRace({ seed: 1, heats: [HEATS[0]] });
      runHeat(race, { seconds: 200, seed: 1 });
      assert.equal(race.state, 'over');
      const banked = race.score;
      assert.ok(banked > 0);
      race.play(2);
      assert.equal(race.state, 'running');
      assert.equal(race.heatIndex, 0);
      assert.ok(race.score < banked, 'the new meet kept the old meet money');
      assert.equal(race.player.cracks, 0);
    });
  });

  it('counts an overtake when one actually happens', () => {
    const race = started(1);
    const rival = race.rivals[0];
    rival.z = race.player.z + 30;
    const overtakes = [];
    race.on('overtake', (e) => overtakes.push(e.rival.id));
    play(race, 1);
    assert.equal(race.snapshot().overtakes, 0);
    rival.z = race.player.z - 20;
    play(race, 0.2);
    assert.ok(overtakes.includes(rival.id), 'passing an egg counted for nothing');
  });

  it('holds a press until a tick can spend it', () => {
    const race = started(1);
    const lane = race.player.lane;
    race.advance(1 / 144, { left: 1, right: 0, jump: false, tuck: false });
    assert.equal(race.player.lane, lane, 'the frame was too short to tick');
    race.advance(1 / 144, null);
    assert.equal(race.player.lane, lane - 1, 'the press was dropped on the floor');
  });

  it('eats a frame that was gone for a minute instead of teleporting', () => {
    const steady = started(8);
    const stalled = started(8);
    play(steady, 1);
    stalled.advance(60, null);
    assert.ok(stalled.player.z < steady.player.z, 'one huge frame outran a second of racing');
    assert.ok(stalled.player.z > 0);
  });

  it('stops dead once a heat is over', () => {
    const race = createRace({ seed: 1, heats: [HEATS[0]] });
    runHeat(race, { seconds: 200, seed: 1 });
    assert.notEqual(race.state, 'running');
    const resting = race.player.z;
    play(race, 3);
    assert.equal(race.player.z, resting);
  });

  it('is winnable: a crude autopilot gets round every heat on every seed', () => {
    for (const seed of SEEDS) {
      const race = createRace({ seed });
      const meet = runMeet(race, { seconds: 200, seed });
      const ran = meet.card.filter(Boolean);
      assert.ok(ran.length >= 3, `seed ${seed} stopped the autopilot after ${ran.length} heats`);
      for (const results of ran) {
        assert.notEqual(results.outcome, 'broken', `seed ${seed}: the autopilot was broken in ${results.heat.name}`);
        assert.ok(results.place >= 1, `seed ${seed}: no place in ${results.heat.name}`);
      }
      assert.ok(meet.score > 4000, `seed ${seed} scored only ${meet.score}`);
    }
  });

  it('gives the field a race, not a procession', () => {
    /**
     * Somebody should be crashing, somebody should be passing you, and the
     * order at the tape should not be the order off the line.
     *
     * Counted over the whole field rather than over your own shell, which is
     * the only way to count it: the player here is a crude autopilot, and
     * whether it happened to take four stones in a row on one seed is its luck
     * with a line, not evidence about the race going on around it.
     */
    let incidents = 0;
    let churn = 0;
    for (const seed of SEEDS) {
      const race = createRace({ seed, heats: HEATS.slice(3) });
      const heat = runHeat(race, { seconds: 200, seed });
      incidents += heat.seen.incidents;
      const order = heat.results.standings.map((row) => row.id).join();
      const lined = ['marc', ...race.rivals.map((rival) => rival.id)].join();
      if (order !== lined) churn += 1;
    }
    assert.ok(incidents > SEEDS.length * 3, `only ${incidents} incidents over ${SEEDS.length} heats`);
    assert.ok(churn >= SEEDS.length - 1, 'the field finished in the order it started');
  });
});
