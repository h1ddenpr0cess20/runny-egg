import * as THREE from 'three';

import { EGG_HEIGHT } from '../core/shape.js';
import { EGG } from '../core/tuning.js';
import { createCracks } from './cracks.js';
import { shade } from './materials.js';
import { createShell } from './shell.js';

/** The shaped shell has its own height; an egg has to fit its collider. */
export const EGG_SCALE = EGG.height / EGG_HEIGHT;

/**
 * One runner. Marc undyed, or one of the field with a wash over him — the
 * same geometry, the same speckled skin, the same physical material, at a
 * size within eight per cent either way.
 *
 * Everything that happens to an egg over a heat is visible on it: the cracks
 * are drawn on the shell as they are earned, and when the third one goes the
 * shell comes apart into two halves and stays on the grass where it stopped.
 */
export function createEgg({ tint = 0xffffff, size = 1, seed = 1 } = {}) {
  const object = new THREE.Group();
  object.name = 'egg';

  const shell = createShell(tint);
  const cracks = createCracks(seed);

  /**
   * The shell and its cracks live under a `body` that the run animates, and
   * the group above it carries the position. Keeping them apart is what lets
   * the shell squash on a landing without the shadow squashing with it.
   */
  const body = new THREE.Group();
  body.name = 'body';
  body.add(shell.mesh, cracks.object);

  const shards = createShards(tint);
  shards.visible = false;

  object.add(body, shards);
  object.scale.setScalar(EGG_SCALE * size);

  return {
    object,
    body,
    shell,
    shards,
    size,

    /** How much of the shell is left, drawn on the shell. */
    cracks(count) { cracks.show(count); },

    /**
     * The end of it. The shell halves open out and the whole thing settles —
     * what was inside is drawn on the grass by `props.js`, because it stays
     * there after the egg is long gone.
     */
    broken(yes) {
      shell.mesh.visible = !yes;
      cracks.object.visible = !yes;
      shards.visible = yes;
    },

    dispose() {
      cracks.dispose();
      shell.material.dispose();
      for (const half of shards.children) half.geometry.dispose();
    },
  };
}

/**
 * Two halves of a shell, hollow, for an egg that did not finish. They are cut
 * off the same profile as the whole one — a broken egg is recognisably the
 * egg it was a second ago, which is most of why it lands.
 */
function createShards(tint) {
  const group = new THREE.Group();
  group.name = 'shards';

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(tint).multiplyScalar(0.98),
    roughness: 0.58,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  for (const [i, tilt] of [-1, 1].entries()) {
    /** Half a shell, open along its long axis, so the inside shows. */
    const geometry = new THREE.SphereGeometry(0.82, 28, 20, 0, Math.PI);
    const positions = geometry.attributes.position.array;
    for (let p = 0; p < positions.length; p += 3) positions[p + 1] *= 1.12;
    geometry.computeVertexNormals();

    const half = new THREE.Mesh(geometry, material);
    half.rotation.set(Math.PI / 2 + tilt * 0.35, tilt * 0.9, tilt * 0.5);
    half.position.set(tilt * 0.42, -0.62, i * 0.12 - 0.06);
    group.add(half);
  }

  return group;
}

/** The smudge an egg puts on the grass, which is how you read a jump. */
export function createShadow() {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), shade());
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 1;
  mesh.name = 'shadow';
  return mesh;
}
