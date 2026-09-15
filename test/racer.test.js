import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { advance, createRacer, fall, paceScale, toTheLine, trip } from '../src/core/racer.js';
import {
  AIRTIME, AIR_JUMPS, APEX, BOOST, COYOTE, DOWN, FLOAT, GROUND_Y, JUMP_SPEED,
  LANES, laneX, STUMBLE,
} from '../src/core/tuning.js';

const PACE = 14;
const STEP = 1 / 120;

function onTheLine(lane = 2) {
  return toTheLine(createRacer({ id: 'test', lane }), lane, PACE);
}

function push(racer, seconds, intent = null, pace = PACE) {
  let out = null;
  for (let i = 0; i < Math.round(seconds / STEP); i++) out = advance(racer, STEP, intent, { pace });
  return out;
}

const JUMP = { left: 0, right: 0, jump: true, tuck: false };
const TUCK = { left: 0, right: 0, jump: false, tuck: true };

describe('racer', () => {
  it('leaves the line under pace and winds up to it', () => {
    const racer = onTheLine();
    assert.ok(racer.speed < PACE * 0.5, 'it started at full pace from standing');
    push(racer, 4);
    assert.ok(racer.speed > PACE * 0.97, `only reached ${racer.speed.toFixed(1)} of ${PACE}`);
    assert.ok(racer.z > 40, 'it never got going');
  });

  it('jumps to the height the tuning says and comes back down', () => {
    const racer = onTheLine();
    push(racer, 1);
    advance(racer, STEP, JUMP, { pace: PACE });
    assert.ok(!racer.grounded);

    let peak = 0;
    for (let i = 0; i < 200 && !racer.grounded; i++) {
      advance(racer, STEP, null, { pace: PACE });
      peak = Math.max(peak, racer.y);
    }
    assert.ok(Math.abs(peak - APEX) < 0.08, `peaked at ${peak.toFixed(2)} against an apex of ${APEX.toFixed(2)}`);
    assert.ok(racer.grounded);
    assert.equal(racer.y, GROUND_Y);
  });

  it('hangs for about as long as the ruler the track is laid with says', () => {
    const racer = onTheLine();
    push(racer, 1);
    advance(racer, STEP, JUMP, { pace: PACE });
    let air = 0;
    while (!racer.grounded && air < 3) {
      advance(racer, STEP, null, { pace: PACE });
      air += STEP;
    }
    assert.ok(Math.abs(air - AIRTIME) < 0.05, `${air.toFixed(3)}s of air against ${AIRTIME.toFixed(3)}`);
  });

  it('gives one flail in the air, and it is weaker than the jump', () => {
    const racer = onTheLine();
    push(racer, 1);
    advance(racer, STEP, JUMP, { pace: PACE });
    assert.equal(racer.airJumps, AIR_JUMPS);
    push(racer, 0.2);
    const before = racer.y;
    advance(racer, STEP, JUMP, { pace: PACE });
    assert.equal(racer.airJumps, AIR_JUMPS - 1);
    assert.ok(racer.vy < JUMP_SPEED, 'the flail was as good as the jump');
    assert.ok(racer.vy > 0);

    /** And no more after that. */
    push(racer, 0.1);
    const vy = racer.vy;
    advance(racer, STEP, JUMP, { pace: PACE });
    assert.ok(racer.vy < vy, 'a third jump came out of nowhere');
    assert.ok(racer.y > before);
  });

  it('moves a lane per press and stops at the edges', () => {
    const racer = onTheLine(2);
    advance(racer, STEP, { left: 1, right: 0 }, { pace: PACE });
    assert.equal(racer.lane, 1);
    advance(racer, STEP, { left: 2, right: 0 }, { pace: PACE });
    assert.equal(racer.lane, 0, 'a double press should cross two lanes');
    advance(racer, STEP, { left: 1, right: 0 }, { pace: PACE });
    assert.equal(racer.lane, 0, 'it walked off the side of the track');
    advance(racer, STEP, { left: 0, right: LANES + 3 }, { pace: PACE });
    assert.equal(racer.lane, LANES - 1);

    push(racer, 1);
    assert.ok(Math.abs(racer.x - laneX(LANES - 1)) < 0.01, 'it never arrived in the lane');
  });

  it('takes a stumble out of the pace, and gets it back', () => {
    const racer = onTheLine();
    push(racer, 4);
    const full = racer.speed;
    trip(racer);
    assert.equal(paceScale(racer), STUMBLE.speed);
    push(racer, 0.4);
    assert.ok(racer.speed < full * 0.92, 'a stumble cost nothing');
    push(racer, 4);
    assert.ok(racer.speed > full * 0.97, 'it never got back up to pace');
  });

  it('puts a hand down on a wobble, for the speed it would have cost anyway', () => {
    const racer = onTheLine();
    push(racer, 4);
    trip(racer);
    const before = racer.speed;
    const out = advance(racer, STEP, TUCK, { pace: PACE });
    assert.ok(out.caught, 'the tuck did nothing');
    assert.equal(racer.stumble, 0);
    assert.ok(racer.speed < before, 'catching yourself should cost something');
  });

  it('will not catch a wobble that is a fall', () => {
    const racer = onTheLine();
    push(racer, 4);
    fall(racer);
    const out = advance(racer, STEP, TUCK, { pace: PACE });
    assert.ok(!out.caught);
    assert.ok(racer.down > 0);
    assert.equal(paceScale(racer), DOWN.speed);
  });

  it('gets up off the floor still wobbling', () => {
    const racer = onTheLine();
    push(racer, 4);
    fall(racer);
    const before = racer.z;
    push(racer, DOWN.time + 0.02);
    assert.equal(racer.down, 0);
    assert.ok(racer.stumble > 0, 'it stood straight up as if nothing had happened');
    assert.ok(racer.z - before < PACE * DOWN.time * 0.5, 'a fall barely slowed it');
  });

  it('ignores the controls while it is on the floor', () => {
    const racer = onTheLine(2);
    push(racer, 1);
    fall(racer);
    advance(racer, STEP, { left: 1, right: 0, jump: true, tuck: false }, { pace: PACE });
    assert.equal(racer.lane, 2, 'it changed lane lying down');
    assert.ok(racer.grounded, 'it jumped lying down');
  });

  it('drops out of the sky when it tucks', () => {
    const slow = onTheLine();
    const quick = onTheLine();
    push(slow, 1);
    push(quick, 1);
    advance(slow, STEP, JUMP, { pace: PACE });
    advance(quick, STEP, JUMP, { pace: PACE });
    push(slow, 0.3);
    push(quick, 0.3);

    let slowAir = 0;
    while (!slow.grounded && slowAir < 2) { advance(slow, STEP, null, { pace: PACE }); slowAir += STEP; }
    let quickAir = 0;
    while (!quick.grounded && quickAir < 2) { advance(quick, STEP, TUCK, { pace: PACE }); quickAir += STEP; }
    assert.ok(quickAir < slowAir * 0.6, `a tuck saved only ${(slowAir - quickAir).toFixed(3)}s`);
  });

  it('lands a tuck square and stops wobbling', () => {
    const racer = onTheLine();
    push(racer, 1);
    advance(racer, STEP, JUMP, { pace: PACE });
    push(racer, 0.2);
    trip(racer);
    let out = null;
    while (!racer.grounded) out = advance(racer, STEP, TUCK, { pace: PACE });
    assert.ok(out.stuck, 'the landing was not a tuck');
    assert.equal(racer.stumble, 0);
  });

  it('runs faster on a feather and floats higher on a puff', () => {
    const plain = onTheLine();
    const quick = onTheLine();
    push(plain, 4);
    push(quick, 4);
    quick.boost = BOOST.time;
    assert.equal(paceScale(quick), BOOST.speed);
    push(plain, 2);
    push(quick, 2);
    assert.ok(quick.z > plain.z + 5, `a feather was worth only ${(quick.z - plain.z).toFixed(1)}m`);

    const light = onTheLine();
    push(light, 1);
    light.float = FLOAT.time;
    advance(light, STEP, JUMP, { pace: PACE });
    let peak = 0;
    while (!light.grounded) {
      advance(light, STEP, null, { pace: PACE });
      peak = Math.max(peak, light.y);
    }
    assert.ok(peak > APEX * 1.3, `a puff only reached ${peak.toFixed(2)} against ${APEX.toFixed(2)}`);
  });

  it('forgives a jump pressed just late, and just early', () => {
    /** Coyote: pressed after the ground has gone. */
    const late = onTheLine();
    push(late, 1);
    late.grounded = false;
    late.coyote = COYOTE;
    late.airJumps = 0;
    advance(late, STEP, JUMP, { pace: PACE });
    assert.ok(late.vy > JUMP_SPEED * 0.9, 'a jump inside the coyote window was refused');

    /** Buffer: pressed before the landing. */
    const early = onTheLine();
    push(early, 1);
    advance(early, STEP, JUMP, { pace: PACE });
    /** Up, then down to just above the grass. Waiting on `y >= APEX` never
     *  returns: a discrete integration peaks a hair under the analytic apex. */
    while (early.vy > 0) advance(early, STEP, null, { pace: PACE });
    while (early.y > 0.3) advance(early, STEP, null, { pace: PACE });
    early.airJumps = 0;
    advance(early, STEP, JUMP, { pace: PACE });
    while (!early.grounded) advance(early, STEP, null, { pace: PACE });
    const out = advance(early, STEP, null, { pace: PACE });
    assert.ok(out.jumped || early.vy > 0, 'a jump buffered into a landing was dropped');
  });

  it('puts an egg back on the line with nothing left over', () => {
    const racer = onTheLine();
    push(racer, 4, JUMP);
    racer.cracks = 2;
    racer.boost = 3;
    trip(racer);
    toTheLine(racer, 1, PACE);
    assert.equal(racer.z, 0);
    assert.equal(racer.lane, 1);
    assert.equal(racer.x, laneX(1));
    assert.equal(racer.cracks, 0);
    assert.equal(racer.boost, 0);
    assert.equal(racer.stumble, 0);
    assert.ok(racer.grounded);
    assert.equal(paceScale(racer), 1);
  });
});
