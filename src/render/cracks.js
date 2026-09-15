import * as THREE from 'three';

import { createRng, range } from '../core/rng.js';
import { CRACKS } from '../core/tuning.js';

/**
 * The cracks. Three of them and the shell goes, so they are the only health
 * bar this game has and they are painted on the thing itself — you read how
 * much is left off the egg, not off the corner of the screen.
 *
 * Each one is a jagged fissure walked across the shell, and each one is built
 * as a ribbon rather than as a line. A line is the obvious way to do this and
 * it is wrong: `LineBasicMaterial` is one pixel wide in WebGL whatever
 * `linewidth` says and whatever distance it is seen from, so a crack drawn
 * that way is a pixel of noise on an egg two hundred pixels tall and a pixel
 * of noise on one four pixels tall. A ribbon has a width in metres — it
 * tapers to a hairline at the far end, and it opens up as the camera comes
 * in, which is what damage on a shell actually does.
 *
 * They are seeded per egg, so a given egg's first crack is always in the same
 * place: the damage is a property of that egg, not of the frame it is drawn
 * in.
 */

/** How far clear of the shell the ribbon floats, along the surface normal. */
const LIFT = 0.006;

/** How far a fissure walks per step, and how much it is allowed to wander.
 *  The walk used to turn by up to 0.62 radians a step over a 0.19 step, which
 *  is not a crack, it is a scribble — it doubled back over itself twice in a
 *  run and read as a pen mark. Short steps and a shallow wander give the
 *  zig-zag a shell actually splits along. */
const STEP = 0.11;
const WANDER = 0.33;

/** Half-widths, in shell units: the fissure at its mouth and a branch at its. */
const WIDTH = { main: 0.026, branch: 0.015 };

/**
 * The band of shell a crack is allowed to live in, as polar angles. Not the
 * whole sphere: the camera sits behind the egg and above it, so the underside
 * is never in shot, and a fissure walked onto the bottom of the shell is a
 * crack you paid for and never saw. `WALK` is the wider fence the wander is
 * held inside once it has started.
 */
const BAND = { from: 0.8, to: 1.95 };
const WALK = { from: 0.5, to: 2.15 };

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
    Math.cos(theta) * r * 0.84 * taper,
    y * 1.03 + 0.01,
    Math.sin(theta) * r * 0.84 * taper,
  );
}

const EDGE = 1e-3;
const ahead = new THREE.Vector3();
const behind = new THREE.Vector3();
const across = new THREE.Vector3();
const along = new THREE.Vector3();

/**
 * Which way the shell faces at a point, taken off the profile either side of
 * it. Analytic would be four more lines of calculus for the same answer; the
 * profile is cheap and this runs seven times a heat.
 */
function shellNormal(theta, phi, out) {
  across.subVectors(onShell(theta + EDGE, phi, ahead), onShell(theta - EDGE, phi, behind));
  along.subVectors(onShell(theta, phi + EDGE, ahead), onShell(theta, phi - EDGE, behind));
  return out.crossVectors(across, along).normalize();
}

/** One jagged run across the shell, as the angle pairs it passes through. */
function walk(rng, from, heading, steps) {
  const path = [];
  let { theta, phi } = from;
  let aim = heading;

  for (let i = 0; i <= steps; i++) {
    path.push({ theta, phi });
    aim += range(rng, -WANDER, WANDER);
    theta += Math.cos(aim) * STEP;
    phi += Math.sin(aim) * STEP * 0.8;
    phi = Math.min(WALK.to, Math.max(WALK.from, phi));
  }

  return { path, aim };
}

/**
 * A run of angle pairs, widened into a strip lying on the shell. The width
 * falls away along the length, so a fissure is at its widest where it started
 * — which is where whatever caused it hit — and closes to nothing at the far
 * end rather than stopping dead.
 */
function ribbon(path, half, into) {
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const side = new THREE.Vector3();
  const next = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const first = into.position.length / 3;

  for (let i = 0; i < path.length; i++) {
    const at = path[i];
    onShell(at.theta, at.phi, point);
    shellNormal(at.theta, at.phi, normal);

    const after = path[Math.min(i + 1, path.length - 1)];
    const before = path[Math.max(i - 1, 0)];
    side.crossVectors(
      along.subVectors(onShell(after.theta, after.phi, next), onShell(before.theta, before.phi, prev)),
      normal,
    );
    /** Two identical steps in a row would leave nothing to be square to. */
    if (side.lengthSq() < 1e-12) side.set(normal.z, 0, -normal.x);
    side.normalize();

    const width = half * (1 - i / (path.length - 1)) ** 0.7;
    point.addScaledVector(normal, LIFT);
    into.position.push(
      point.x - side.x * width, point.y - side.y * width, point.z - side.z * width,
      point.x + side.x * width, point.y + side.y * width, point.z + side.z * width,
    );
  }

  for (let i = 0; i < path.length - 1; i++) {
    const rung = first + i * 2;
    into.index.push(rung, rung + 1, rung + 2, rung + 1, rung + 3, rung + 2);
  }
}

/**
 * `CRACKS` fissures, each one drawn only once it has been earned. They share
 * a material — a crack looks the same on every egg, because it is the same
 * shell underneath every colour.
 */
export function createCracks(seed = 1, colour = 0x2c1c14) {
  const rng = createRng((seed >>> 0) + 0x9e3779b9);
  const group = new THREE.Group();
  group.name = 'cracks';

  /**
   * Unlit and nearly black: a crack is a gap, and a gap does not catch the
   * morning. Offset towards the camera on top of the lift, because the shell
   * it sits on is a 128×96 sphere and a millimetre of float is not something
   * to trust a depth buffer with at three hundred metres of view.
   */
  const material = new THREE.MeshBasicMaterial({
    color: colour,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });

  const fissures = [];

  for (let i = 0; i < CRACKS; i++) {
    const into = { position: [], index: [] };
    const start = { theta: range(rng, 0, Math.PI * 2), phi: range(rng, BAND.from, BAND.to) };
    const heading = range(rng, 0, Math.PI * 2);

    const main = walk(rng, start, heading, 7 + Math.floor(rng() * 4));
    ribbon(main.path, WIDTH.main, into);

    /** A branch off the middle of it, going the other way — a fissure that is
     *  one clean line reads as a pen mark. */
    const fork = main.path[Math.floor(main.path.length * 0.45)];
    const turn = range(rng, 1, 2) * (rng() < 0.5 ? -1 : 1);
    ribbon(walk(rng, fork, main.aim + turn, 3 + Math.floor(rng() * 3)).path, WIDTH.branch, into);

    /** And often a shorter one back the other way out of the mouth. */
    if (rng() < 0.7) {
      const back = walk(rng, start, heading + Math.PI + range(rng, -0.5, 0.5), 2 + Math.floor(rng() * 3));
      ribbon(back.path, WIDTH.branch, into);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(into.position, 3));
    geometry.setIndex(into.index);
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `crack-${i}`;
    mesh.visible = false;
    mesh.renderOrder = 3;
    fissures.push(mesh);
    group.add(mesh);
  }

  return {
    object: group,
    material,

    /** Show the first `count` of them, and no more. */
    show(count) {
      for (let i = 0; i < fissures.length; i++) fissures[i].visible = i < count;
    },

    dispose() {
      for (const mesh of fissures) mesh.geometry.dispose();
      material.dispose();
    },
  };
}
