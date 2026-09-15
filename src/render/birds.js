import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { createRng } from '../core/rng.js';
import { matte } from './materials.js';
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

/** How many perched and how many aloft, at once. */
const PERCHED = 20;
const FLOCK = { birds: 6, flocks: 2, height: 26, radius: 34 };

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

  const body = tint(new THREE.SphereGeometry(0.11, 8, 6).scale(1, 0.95, 1.5), THEME.bird);
  const belly = tint(new THREE.SphereGeometry(0.11, 8, 6).scale(0.82, 0.62, 1.2), THEME.birdPale)
    .translate(0, -0.035, 0.02);
  const head = tint(new THREE.SphereGeometry(0.062, 6, 5), THEME.bird).translate(0, 0.095, 0.1);
  const beak = tint(new THREE.ConeGeometry(0.022, 0.075, 4), THEME.beak)
    .rotateX(Math.PI / 2).translate(0, 0.183, 0.185);
  const tail = tint(new THREE.PlaneGeometry(0.1, 0.16), THEME.bird)
    .rotateX(-Math.PI / 2.2).translate(0, 0.02, -0.19);

  const wing = tint(new THREE.PlaneGeometry(0.3, 0.13), THEME.bird).rotateX(-Math.PI / 2);

  /** The sky birds never get close enough for a beat to read, so their wings
   *  are baked in and the whole bird rocks instead. One mesh apiece. */
  const spread = mergeGeometries([
    body.clone(), belly.clone(), head.clone(), beak.clone(), tail.clone(),
    wing.clone().translate(-0.16, 0.03, 0),
    wing.clone().translate(0.16, 0.03, 0),
  ]);

  shared = {
    still: mergeGeometries([body, belly, head, beak, tail]),
    wing,
    spread,
    skin: matte(0xffffff, { roughness: 0.85 }),
  };
  shared.skin.vertexColors = true;
  shared.skin.needsUpdate = true;
  return shared;
}

/** One perched bird: a body, and two wings that can beat. */
function createBird() {
  const p = parts();
  const bird = new THREE.Group();

  const still = new THREE.Mesh(p.still, p.skin);
  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    const wing = new THREE.Mesh(p.wing, p.skin);
    wing.position.x = 0.15 * side;
    pivot.add(wing);
    pivot.position.set(0.02 * side, 0.03, 0);
    return pivot;
  });

  bird.add(still, ...wings);
  bird.userData = { wings };
  return bird;
}

/** One in the sky, wings out, all of it a single draw. */
function createGlider() {
  const p = parts();
  const bird = new THREE.Mesh(p.spread, p.skin);
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

function flap(bird, time, rate, amount) {
  if (!bird.userData.wings) return;
  const beat = Math.sin(time * rate) * amount;
  bird.userData.wings[0].rotation.z = -beat;
  bird.userData.wings[1].rotation.z = beat;
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
    /** A new heat: a new fence, and every bird back on it. */
    reset(next = []) {
      perches = next;
      gone = new Map();
      const rng = createRng(perches.length * 2654435761);
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
          /** Up, out and back, getting faster — nothing flies away from
           *  something frightening in a straight line at constant speed. */
          const lift = since * 3.4 + since * since * 1.6;
          bird.position.set(
            post.x + away * since * 2.6,
            post.y + lift,
            post.z - since * 1.4 + Math.sin(since * 6) * 0.2,
          );
          bird.rotation.set(-0.35, away * (0.7 + since * 0.35), away * -0.5);
          flap(bird, time, 17, 1);
        } else {
          bird.position.set(post.x, post.y + 0.1, post.z);
          /** Round to watch you come, then round to watch you go. */
          bird.rotation.set(0, Math.atan2(player.x - post.x, player.z - post.z), 0);
          flap(bird, time + i, 2.4, 0.1);
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
          /** With the wings baked out flat, the beat is the whole bird
           *  rolling — which is what a gull at fifty metres looks like. */
          bird.rotation.set(0, -a + Math.PI / 2, Math.cos(a) * 0.3 + Math.sin(time * 5 + b) * 0.22);
          bird.scale.setScalar(1.5);
        }
      }
      aloft.end();
    },
  };
}
