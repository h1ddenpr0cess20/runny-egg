import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { createRng } from '../core/rng.js';
import { THEME } from './theme.js';

/**
 * The crowd. They sit on the fence posts in ones and twos, they turn their
 * heads to watch you come, and when you get close enough they have had
 * enough and go — which is the only thing on this whole course that reacts
 * to you rather than being reacted to.
 *
 * There are also a few up there going round in circles, not watching at all.
 *
 * Birds are drawn from a pool and placed onto whichever posts are in front of
 * you, so a kilometre of fence costs about forty of them. Which post has a
 * bird on it is decided by the seed, not by the pool, so the same post has
 * the same bird every time you run that heat.
 */

/** How close you get before they have had enough. */
const STARTLE = 13;
const FLIGHT = 3.4;

/** How many perched and how many aloft, at once. Twenty was under the number
 *  of occupied posts a hundred metres of fence can put in shot at once, and
 *  the birds past the end of the pool simply did not get drawn. */
const PERCHED = 28;
const FLOCK = { birds: 6, flocks: 2, height: 26, radius: 34, size: 2 };

/**
 * A perched bird keeps its wings in. They fold back along the flank and tuck
 * shorter; `spread` in `flap` blends that away for one that is leaving. Held
 * out flat, which is where they used to sit, a bird on a post reads as a
 * paper aeroplane nailed to a fence.
 */
const FOLD = { sweep: 1.25, droop: 0.28, tuck: 0.62 };

/** How hard a bird going round in circles leans into them. */
const BANK = 0.34;

/** The window of fence a perched bird can be drawn in. */
const DRAW = { behind: 14, ahead: 105 };

let shared = null;

/**
 * Every part of a bird that does not move, merged into one geometry and
 * coloured per vertex. A bird used to be six meshes — body, belly, head,
 * beak, tail, two wings — and forty of them was two hundred and forty draw
 * calls for a thing the size of a thumbnail. Now it is three, and the ones
 * in the sky are one.
 */
function parts() {
  if (shared) return shared;

  const tint = (geometry, colour) => {
    const c = new THREE.Color(colour);
    const count = geometry.attributes.position.count;
    const colours = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colours.set([c.r, c.g, c.b], i * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    return geometry;
  };

  const body = tint(new THREE.SphereGeometry(0.11, 10, 7).scale(1, 0.95, 1.5), THEME.bird);
  const belly = tint(new THREE.SphereGeometry(0.11, 10, 7).scale(0.82, 0.62, 1.2), THEME.birdPale)
    .translate(0, -0.035, 0.02);
  const head = tint(new THREE.SphereGeometry(0.062, 8, 6), THEME.bird).translate(0, 0.095, 0.1);
  /** On the head, not above it. This sat at y=0.183 against a head centred
   *  at 0.095 with a radius of 0.062 — a beak floating a clear head's width
   *  over the skull it belonged to. */
  const beak = tint(new THREE.ConeGeometry(0.022, 0.075, 4), THEME.beak)
    .rotateX(Math.PI / 2).translate(0, 0.098, 0.172);
  /**
   * A tail and a wing, cut to shape rather than left as the rectangles they
   * used to be. A bird on the nearest fence post is three metres from the
   * camera and a tenth of the screen tall, which is close enough to see that
   * its wings are planks — they need a swept leading edge and a taper to the
   * tip, and that is six points and a `ShapeGeometry`.
   *
   * Both are cut in the XY plane and laid flat, so the shape's y becomes -z:
   * the leading edge is written negative to come out pointing forwards.
   */
  const blade = (points) => {
    const outline = new THREE.Shape();
    points.forEach(([x, y], i) => (i ? outline.lineTo(x, y) : outline.moveTo(x, y)));
    return new THREE.ShapeGeometry(outline).rotateX(-Math.PI / 2);
  };

  /** Laid flat by `blade`, then tipped up a little at the back. */
  const tail = tint(blade([
    [-0.045, -0.02], [0.045, -0.02], [0.075, 0.15], [-0.075, 0.15],
  ]), THEME.bird).rotateX(0.3).translate(0, 0.02, -0.175);

  /**
   * Root at the shoulder, tip outboard. Both sides are cut rather than one
   * side mirrored with a negative scale: a mirror flips the winding, and a
   * flipped face under `DoubleSide` is shaded off its far side — the two
   * wings of the same bird came out lit as if the sun were in two places.
   */
  const feathers = [[0, -0.068], [0.15, -0.05], [0.3, 0.02], [0.3, 0.055], [0.14, 0.098], [0, 0.072]];
  const wings = {
    '1': tint(blade(feathers), THEME.bird),
    '-1': tint(blade(feathers.map(([x, y]) => [-x, y]).reverse()), THEME.bird),
  };

  /** The sky birds never get close enough for a beat to read, so their wings
   *  are baked in and the whole bird rocks instead. One mesh apiece. */
  const spread = mergeGeometries([
    body.clone(), belly.clone(), head.clone(), beak.clone(), tail.clone(),
    wings['-1'].clone().rotateZ(-0.12).translate(-0.02, 0.03, 0),
    wings['1'].clone().rotateZ(0.12).translate(0.02, 0.03, 0),
  ]);

  shared = {
    still: mergeGeometries([body, belly, head, beak, tail]),
    wings,
    spread,
    /**
     * The birds' own material, not a borrowed one. Wings and tails are single
     * quads, and the shared matte is front-faced: every bird in the sky was
     * drawn from below, which is the one side its wings could not be seen
     * from. It was also reached out of the material cache and mutated in
     * place, which is a booby trap for the next surface that asks for white.
     */
    skin: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0,
      vertexColors: true,
      side: THREE.DoubleSide,
    }),
  };
  return shared;
}

/** One perched bird: a body, and two wings that can beat. */
function createBird() {
  const p = parts();
  const bird = new THREE.Group();

  const still = new THREE.Mesh(p.still, p.skin);
  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.add(new THREE.Mesh(p.wings[side], p.skin));
    pivot.position.set(0.02 * side, 0.03, 0);
    return pivot;
  });

  bird.add(still, ...wings);
  bird.name = 'bird';
  bird.userData = { wings };
  return bird;
}

/** One in the sky, wings out, all of it a single draw. */
function createGlider() {
  const p = parts();
  const bird = new THREE.Mesh(p.spread, p.skin);
  bird.name = 'glider';
  bird.userData = { wings: null };
  return bird;
}

function pool(scene, size, make) {
  const items = Array.from({ length: size }, () => {
    const item = make();
    item.visible = false;
    scene.add(item);
    return item;
  });
  let cursor = 0;
  return {
    begin() { cursor = 0; },
    take() {
      const item = items[cursor];
      if (!item) return null;
      cursor += 1;
      item.visible = true;
      return item;
    },
    end() { for (let i = cursor; i < items.length; i++) items[i].visible = false; },
  };
}

/** How close this particular bird lets you get. The ones on the near side go
 *  early; the ones further out hold their nerve. */
function holdsUntil(post, player) {
  return STARTLE - Math.min(6, Math.abs(post.x - player.x) * 0.5);
}

/**
 * The beat, and how far out the wings are while they do it. `spread` of zero
 * is a bird sitting down with them folded back along its flank; one is a bird
 * leaving with them out. Anything in between is neither, so nothing asks for
 * it.
 */
function flap(bird, time, { rate, amount, spread = 0 }) {
  const wings = bird.userData.wings;
  if (!wings) return;
  const beat = Math.sin(time * rate) * amount;
  const folded = 1 - spread;
  for (let i = 0; i < wings.length; i++) {
    const side = i ? 1 : -1;
    wings[i].rotation.y = side * FOLD.sweep * folded;
    wings[i].rotation.z = side * (beat - FOLD.droop * folded);
    wings[i].scale.x = FOLD.tuck + (1 - FOLD.tuck) * spread;
  }
}

export function createBirds(scene) {
  const perched = pool(scene, PERCHED, createBird);
  const aloft = pool(scene, FLOCK.birds * FLOCK.flocks, createGlider);

  /** Which posts have a bird, and which of those have gone. Both are keyed
   *  on the post rather than on the pool slot, so a bird that took off does
   *  not come back the moment the pool recycles the thing it was drawn with. */
  let occupied = [];
  let gone = new Map();
  let perches = [];

  return {
    /**
     * A new heat: a new fence, and every bird back on it. Seeded off the heat
     * rather than off how many posts there are, or two different courses that
     * happened to run the same distance would be sat on identically.
     */
    reset(next = [], seed = 0) {
      perches = next;
      gone = new Map();
      const rng = createRng(((seed >>> 0) + perches.length) * 2654435761);
      occupied = perches.map(() => rng() < 0.34);
    },

    /**
     * Perched birds fidget and watch; startled ones climb away over their
     * shoulder. Nothing here is simulated — a bird's whole life is a function
     * of where you are and how long ago it left, which is why forty of them
     * cost nothing to keep.
     */
    sync(player, time) {
      perched.begin();
      for (let i = 0; i < perches.length; i++) {
        if (!occupied[i]) continue;
        const post = perches[i];
        const gap = post.z - player.z;
        if (gap < -DRAW.behind || gap > DRAW.ahead) continue;

        if (!gone.has(i) && gap < holdsUntil(post, player)) gone.set(i, time);
        const since = gone.has(i) ? time - gone.get(i) : 0;
        if (since > FLIGHT) continue;

        const bird = perched.take();
        if (!bird) break;

        const away = Math.sign(post.x) || 1;
        if (since > 0) {
          /**
           * Up, out and *on*, getting faster — nothing flies away from
           * something frightening in a straight line at constant speed, and
           * nothing flies away from it by going back over the top of it
           * either. This used to leave down the track towards the egg that
           * had just frightened it, climbing thirty metres in three seconds
           * while it did.
           */
          const lift = since * 2.8 + since * since * 0.7;
          bird.position.set(
            post.x + away * since * 2.4,
            post.y + lift,
            post.z + since * 2.2 + Math.sin(since * 7) * 0.25,
          );
          bird.rotation.set(-0.5, away * 0.85, away * -0.42);
          flap(bird, time, { rate: 16, amount: 0.95, spread: 1 });
        } else {
          bird.position.set(post.x, post.y + 0.1, post.z);
          /** Round to watch you come, then round to watch you go. */
          bird.rotation.set(0, Math.atan2(player.x - post.x, player.z - post.z), 0);
          flap(bird, time + i, { rate: 2.4, amount: 0.07 });
        }
      }
      perched.end();

      /** And the ones that were never interested. */
      aloft.begin();
      for (let f = 0; f < FLOCK.flocks; f++) {
        const spin = time * (0.12 + f * 0.035) + f * 2.1;
        const cx = (f ? 1 : -1) * 40;
        const cz = player.z + 65 + f * 40;
        for (let b = 0; b < FLOCK.birds; b++) {
          const bird = aloft.take();
          if (!bird) break;
          const a = spin + (b / FLOCK.birds) * Math.PI * 2;
          const r = FLOCK.radius * (0.6 + (b % 3) * 0.2);
          bird.position.set(
            cx + Math.cos(a) * r,
            FLOCK.height + f * 8 + Math.sin(a * 2 + b) * 2.2,
            cz + Math.sin(a) * r,
          );
          /**
           * Pointed the way it is actually going. A bird at angle `a` round a
           * circle travels along the tangent, which is a yaw of `-a` — the
           * quarter turn that used to be added to that had the whole flock
           * crabbing sideways through the sky for the entire race.
           *
           * And it leans the same way the whole way round, because that is
           * what turning in one direction is. Rolling by the cosine of the
           * angle banked it left, then right, then left again on a circle it
           * never stopped turning the same way on.
           */
          bird.rotation.set(0, -a, BANK + Math.sin(time * 1.7 + b) * 0.07);
          bird.scale.setScalar(FLOCK.size);
        }
      }
      aloft.end();
    },
  };
}
