import * as THREE from 'three';

import { createRng, range } from '../core/rng.js';
import { CRACKS } from '../core/tuning.js';

/**
 * The cracks. Three of them and the shell goes, so they are the only health
 * bar this game has and they are painted on the thing itself — you read how
 * much is left off the egg, not off the corner of the screen.
 *
 * Each one is a jagged walk across the shell with a branch or two coming off
 * it, drawn as lines sitting a whisker outside the surface. They are seeded
 * per egg, so a given egg's first crack is always in the same place: the
 * damage is a property of that egg, not of the frame it is drawn in.
 */

/** Just outside the shell, so the line never fights the surface it is on. */
const LIFT = 1.008;

const STEP = 0.19;
const WANDER = 0.62;

/**
 * A point on the shell from a pair of angles. This is `shapeEgg`'s profile
 * applied by hand rather than read off the geometry: a crack needs points
 * *between* the vertices, and the profile is four lines of arithmetic.
 */
function onShell(theta, phi, out = new THREE.Vector3()) {
  const y = Math.cos(phi);
  const r = Math.sin(phi);
  const taper = 1 - 0.075 * y - 0.055 * y * y;
  return out.set(
    Math.cos(theta) * r * 0.84 * taper * LIFT,
    (y * 1.03 + 0.01) * LIFT,
    Math.sin(theta) * r * 0.84 * taper * LIFT,
  );
}

/** One jagged run across the shell, from an angle pair in a direction. */
function walk(points, rng, theta, phi, heading, steps) {
  let aim = heading;
  const point = new THREE.Vector3();
  let last = onShell(theta, phi).clone();

  for (let i = 0; i < steps; i++) {
    aim += range(rng, -WANDER, WANDER);
    theta += Math.cos(aim) * STEP;
    phi += Math.sin(aim) * STEP * 0.8;
    /** Keep off the very ends, where a crack would wrap round the pole and
     *  come back at itself. */
    phi = Math.min(Math.PI - 0.35, Math.max(0.35, phi));
    onShell(theta, phi, point);
    points.push(last.x, last.y, last.z, point.x, point.y, point.z);
    last = point.clone();
  }
  return { theta, phi, aim };
}

/**
 * `CRACKS` line sets, each one drawn only once it has been earned. They share
 * a material — a crack looks the same on every egg, because it is the same
 * shell underneath every colour.
 */
export function createCracks(seed = 1, colour = 0x6a3a2a) {
  const rng = createRng((seed >>> 0) + 0x9e3779b9);
  const group = new THREE.Group();
  group.name = 'cracks';

  const material = new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0.85 });
  const lines = [];

  for (let i = 0; i < CRACKS; i++) {
    const points = [];
    const theta = range(rng, 0, Math.PI * 2);
    const phi = range(rng, 1, 2.2);
    const heading = range(rng, 0, Math.PI * 2);

    const main = walk(points, rng, theta, phi, heading, 7 + Math.floor(rng() * 4));
    /** A branch off the middle of it, going the other way — a crack that is
     *  one clean line reads as a pen mark. */
    walk(points, rng, main.theta, main.phi, main.aim + range(rng, 1.1, 2.1), 3 + Math.floor(rng() * 3));
    if (rng() < 0.6) {
      walk(points, rng, theta, phi, heading + Math.PI + range(rng, -0.5, 0.5), 3 + Math.floor(rng() * 3));
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const line = new THREE.LineSegments(geometry, material);
    line.name = `crack-${i}`;
    line.visible = false;
    lines.push(line);
    group.add(line);
  }

  return {
    object: group,
    material,

    /** Show the first `count` of them, and no more. */
    show(count) {
      for (let i = 0; i < lines.length; i++) lines[i].visible = i < count;
    },

    dispose() {
      for (const line of lines) line.geometry.dispose();
      material.dispose();
    },
  };
}
