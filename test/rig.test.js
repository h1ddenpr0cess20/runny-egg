import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';

import { LANES, laneX } from '../src/core/tuning.js';
import { focus, rigFor, seat, TALL, WIDE } from '../src/render/rig.js';

/**
 * The bug this file exists for: the chase camera sits behind the egg and looks
 * the way the egg runs, which mirrors the picture — world +x comes out on the
 * left of the screen. Get `laneX` the intuitive way round and every control is
 * backwards, silently, with nothing in the core to catch it.
 *
 * So the assertion is made where it can be seen: a lane is projected through
 * the real rig, and the side of the frame it lands on is checked. It caught
 * the mistake once in Eggscape with three lanes; it is here with five because
 * the mistake is a property of the camera, not of the course.
 */
function ndcX(lane, { aspect = 16 / 9, z = 0, ahead = 0 } = {}) {
  const player = { x: laneX(Math.floor(LANES / 2)), y: 0, z, lane: Math.floor(LANES / 2) };
  const rig = rigFor(aspect);
  const camera = new THREE.PerspectiveCamera(aspect < 1 ? 64 : 52, aspect, 0.1, 900);

  camera.position.copy(seat(new THREE.Vector3(), player, 0, rig, 0, () => 0.5));
  camera.lookAt(focus(new THREE.Vector3(), player, 0, rig));
  camera.updateMatrixWorld(true);

  return new THREE.Vector3(laneX(lane), 0.7, z + ahead).project(camera).x;
}

describe('the chase camera', () => {
  it('draws lane 0 on the left of the screen and the last lane on the right', () => {
    for (const aspect of [16 / 9, 4 / 3, 0.46]) {
      for (const ahead of [0, 6, 20]) {
        const left = ndcX(0, { aspect, ahead });
        const right = ndcX(LANES - 1, { aspect, ahead });
        assert.ok(left < 0, `lane 0 drew at ${left.toFixed(3)}, which is the right half`);
        assert.ok(right > 0, `lane ${LANES - 1} drew at ${right.toFixed(3)}, which is the left half`);
        const middle = ndcX(Math.floor(LANES / 2), { aspect, ahead });
        assert.ok(Math.abs(middle) < 1e-9, 'the middle lane is the middle one');
      }
    }
  });

  it('puts the lanes across the screen in order, wherever the egg has got to', () => {
    for (const z of [0, 250, 4000]) {
      const across = [...Array(LANES).keys()].map((lane) => ndcX(lane, { z }));
      assert.deepEqual(across, [...across].sort((a, b) => a - b), `out of order at ${z}m`);
    }
  });

  it('sits behind the egg and looks past it, which is what does the mirroring', () => {
    for (const rig of [WIDE, TALL]) {
      const player = { x: 0, y: 0, z: 100 };
      assert.ok(seat(new THREE.Vector3(), player, 0, rig).z < player.z, 'the camera got in front');
      assert.ok(focus(new THREE.Vector3(), player, 0, rig).z > player.z, 'it is looking backwards');
    }
  });

  it('keeps the whole field in shot, not just the lane you are in', () => {
    /** Five lanes and seven eggs: the one two lanes over that is about to
     *  come across you has to be on the screen before it arrives. */
    for (const aspect of [16 / 9, 4 / 3]) {
      for (const lane of [0, LANES - 1]) {
        const at = ndcX(lane, { aspect, ahead: 4 });
        assert.ok(Math.abs(at) < 1, `lane ${lane} drew off the side of the frame at ${at.toFixed(2)}`);
      }
    }
  });

  it('lifts and pulls in for a window taller than it is wide', () => {
    assert.equal(rigFor(16 / 9), WIDE);
    assert.equal(rigFor(0.46), TALL);
    assert.ok(TALL.up > WIDE.up && TALL.back < WIDE.back);
  });
});
