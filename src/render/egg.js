import * as THREE from 'three';

import { EGG_HEIGHT, shapeEgg } from '../core/shape.js';
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
      shards.traverse((node) => {
        if (node.isMesh) {
          node.geometry.dispose();
          node.material.dispose();
        }
      });
    },
  };
}

/**
 * Two halves of a shell, for an egg that did not finish. They are cut off the
 * same profile as the whole one — a broken egg is recognisably the egg it was
 * a second ago, which is most of why it lands. It used to be a plain sphere
 * with a stretch on it, which is a different shape and read as one.
 *
 * Each half is drawn twice: the dyed outside, and a cream inside behind it.
 * A single double-sided bowl is the obvious way to do this and it is wrong —
 * with the same colour on both faces and no thickness anywhere, you look
 * straight into it and the thing reads as a smear of tinted glass rather than
 * as a piece of shell. Real shell is dyed on one side and not on the other,
 * and that contrast is the only thing that makes it look solid.
 *
 * They are built resting on y=0 rather than hanging below the middle of an
 * egg that is no longer there, because `view.js` drops the whole group to the
 * grass the moment the shell goes.
 */
function createShards(tint) {
  const group = new THREE.Group();
  group.name = 'shards';

  const outside = new THREE.MeshStandardMaterial({
    color: new THREE.Color(tint).multiplyScalar(0.98),
    roughness: 0.58,
    metalness: 0,
    side: THREE.FrontSide,
  });

  /** What an eggshell is actually like on the inside, whatever colour it has
   *  been dyed on the outside. */
  const inside = new THREE.MeshStandardMaterial({
    color: 0xf6ecdc,
    roughness: 0.94,
    metalness: 0,
    side: THREE.BackSide,
  });

  for (const [i, tilt] of [-1, 1].entries()) {
    /** Half a shell, split along its long axis, so the inside shows. */
    const geometry = new THREE.SphereGeometry(1, 36, 24, 0, Math.PI);
    shapeEgg(geometry.attributes.position.array);

    /**
     * Tipped onto its side with the break facing up and out, the way half a
     * shell comes to rest — then dropped onto the grass by whatever its own
     * lowest point turns out to be, which is cheaper to measure than to work
     * out from three rotations.
     */
    geometry.rotateX(Math.PI / 2);
    geometry.rotateZ(tilt * 0.34);
    geometry.rotateY(tilt * 0.5);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.translate(tilt * 0.46, -geometry.boundingBox.min.y, i * 0.3 - 0.15);
    geometry.computeBoundingBox();

    group.add(new THREE.Mesh(geometry, outside), new THREE.Mesh(geometry, inside));
  }

  return group;
}

/**
 * The smudge an egg puts on the grass, which is how you read a jump.
 *
 * Its material is its own rather than the shared one: the opacity tracks how
 * high *this* egg is off the grass, and seven shadows sharing one material
 * means seven shadows all wearing whichever egg was drawn last — the field's
 * shadows faded in and out together with the back marker's jump.
 */
export function createShadow() {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), shade().clone());
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 1;
  mesh.name = 'shadow';
  return mesh;
}
