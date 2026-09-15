import * as THREE from 'three';

import { createRng, intBelow, range } from '../core/rng.js';
import { TRACK_HALF } from '../core/tuning.js';
import { builder } from './build.js';
import { flat, foliage, SURFACE } from './materials.js';
import { THEME } from './theme.js';

/**
 * Everything beside the track. None of it is in the way — you cannot leave
 * the five lanes — so all of it is here for one reason: to give a kilometre
 * of straight line something to measure itself against. A course with nothing
 * beside it does not read as fast, it reads as a treadmill.
 *
 * It is built once per heat and merged down to five meshes: rails, posts,
 * trunks, leaves and bunting. Individually it is about two thousand objects.
 */

/** Where the fence runs, and how it is made. */
const FENCE = {
  out: TRACK_HALF + 2.4,
  spacing: 5,
  post: { w: 0.16, h: 1.15 },
  rail: { thick: 0.09, high: 0.95, low: 0.55 },
};

/** The trees behind it, and the woods behind them. */
const TREES = { from: TRACK_HALF + 7, to: 62, every: 17 };
const TREELINE = { out: 132, height: 17, step: 26 };

/** Flags over the last of it, because somebody has to make an occasion. */
const BUNTING = { before: 70, spacing: 3.4, sag: 0.5, size: 0.42 };

/** A marker every hundred metres, so the distance is on the course. */
const MARKER = { every: 100, height: 1.5 };

export function createScenery(track) {
  const rng = createRng((track.seed >>> 0) + 0x515e);
  const group = new THREE.Group();
  group.name = 'scenery';

  const from = track.start - 60;
  const to = track.runout + 60;

  const posts = builder();
  const rails = builder();
  const trunks = builder();
  const leaves = builder();
  const flags = builder();
  /** Filled as the pennants go on, and handed to the geometry below. */
  const flagColours = [];

  /** Every post the birds are allowed to sit on, handed to `birds.js`. */
  const perches = [];

  for (const side of [-1, 1]) {
    const x = FENCE.out * side;

    for (let z = from; z < to; z += FENCE.spacing) {
      posts.box(x, FENCE.post.h / 2, z, FENCE.post.w, FENCE.post.h, FENCE.post.w);
      perches.push({ x, y: FENCE.post.h, z });
    }

    /** Two rails the whole way, as one box each: a rail per bay was eight
     *  hundred boxes and looks exactly the same. */
    const run = to - from;
    const mid = (from + to) / 2;
    for (const height of [FENCE.rail.high, FENCE.rail.low]) {
      rails.box(x, height, mid, FENCE.rail.thick, FENCE.rail.thick * 1.6, run);
    }

    /** Trees, thinning out as they go back, none of them on the track. */
    for (let z = from; z < to; z += TREES.every) {
      const count = 1 + intBelow(rng, 3);
      for (let i = 0; i < count; i++) {
        const out = range(rng, TREES.from, TREES.to) * side;
        const at = z + range(rng, -TREES.every * 0.45, TREES.every * 0.45);
        tree(trunks, leaves, out, at, range(rng, 0.8, 1.45), rng);
      }
    }

    /**
     * And the woods, a long way out: a ragged strip of canopy with nothing
     * behind it. The fog has most of it, which is the point — it gives the
     * haze something to be a haze *of*.
     */
    for (let z = from; z < to; z += TREELINE.step) {
      const height = TREELINE.height * range(rng, 0.7, 1.25);
      leaves.panel(
        TREELINE.out * side,
        height / 2,
        z + range(rng, -6, 6),
        TREELINE.step * 1.7,
        height,
        0,
      );
    }
  }

  /** Bunting over the run-in, strung post to post and sagging between. */
  for (const side of [-1, 1]) {
    const x = FENCE.out * side;
    for (let z = track.finish - BUNTING.before; z < track.finish + 12; z += BUNTING.spacing) {
      const t = ((z - (track.finish - BUNTING.before)) / BUNTING.spacing) % 4;
      const drop = Math.sin((t / 4) * Math.PI) * BUNTING.sag;
      const colour = THEME.bunting[Math.floor(z / BUNTING.spacing) % THEME.bunting.length];
      pennant(flags, flagColours, x + 0.28 * -side, FENCE.post.h + 0.62 - drop, z, BUNTING.size, colour);
    }
  }

  group.add(
    new THREE.Mesh(posts.geometry(), SURFACE.wood()),
    new THREE.Mesh(rails.geometry(), SURFACE.wood()),
    new THREE.Mesh(trunks.geometry(), SURFACE.bark()),
    new THREE.Mesh(leaves.geometry(), foliage()),
  );

  /**
   * The flags are vertex-coloured so five colours of bunting is still one
   * draw call — a material apiece would be five, on a thing nobody looks at.
   */
  const flagGeometry = flags.geometry();
  flagGeometry.setAttribute('color', new THREE.Float32BufferAttribute(flagColours, 3));
  const buntingMesh = new THREE.Mesh(
    flagGeometry,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  );
  buntingMesh.name = 'bunting';
  group.add(buntingMesh);

  /** Hundred-metre boards, and a taller one at the line. */
  for (let z = MARKER.every; z < track.finish; z += MARKER.every) {
    group.add(marker(z, false));
  }
  group.add(marker(track.finish, true));

  return {
    object: group,
    perches,

    dispose() {
      group.traverse((node) => {
        if (node.isMesh) node.geometry.dispose();
      });
    },
  };
}

function pennant(build, colours, x, y, z, size, colour) {
  const c = new THREE.Color(colour);
  build.panel(x, y, z, size, size * 1.3, Math.PI / 2);
  for (let i = 0; i < 4; i++) colours.push(c.r, c.g, c.b);
}

/**
 * A tree: a trunk, and two canopies crossed through it. Crossed billboards
 * read better at forty metres than a thousand triangles of real branches, and
 * this course has a hundred trees on it.
 */
function tree(trunks, leaves, x, z, scale, rng) {
  const height = 4.2 * scale;
  const spread = 4.6 * scale;
  const lean = range(rng, -0.25, 0.25);

  trunks.box(x, height / 2, z, 0.34 * scale, height, 0.34 * scale);
  const crown = height + spread * 0.3;
  leaves.panel(x, crown, z, spread, spread * 1.05, lean);
  leaves.panel(x, crown, z, spread, spread * 1.05, lean + Math.PI / 2);
}

/** A board on a post, one every hundred metres. The line gets a red one. */
function marker(z, finish) {
  const group = new THREE.Group();
  const build = builder();
  const x = TRACK_HALF + 1.1;
  const height = finish ? MARKER.height * 1.8 : MARKER.height;

  for (const side of [-1, 1]) {
    build.box(x * side, height / 2, z, 0.1, height, 0.1);
    build.box(x * side, height, z, 0.62, 0.34, 0.06);
  }

  group.add(new THREE.Mesh(build.geometry(), flat(finish ? THEME.barStripe : THEME.chalk, {
    side: THREE.DoubleSide,
  })));
  return group;
}
