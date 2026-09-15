import * as THREE from 'three';

import { HURDLE, LANES, LANE_WIDTH, TRACK_HALF, YOLK } from '../core/tuning.js';
import { builder } from './build.js';
import { matte, prize, spill, SURFACE } from './materials.js';
import { THEME } from './theme.js';

/**
 * Everything that is actually on the track: bars to jump, lumps to miss,
 * things worth picking up, and what is left of whoever did not make it.
 *
 * These are factories. `view.js` pools them, because a heat has thirty
 * hurdles and seventy stones in it and only a dozen of each are ever in
 * shot — the pool is what keeps a kilometre of course to a screen's worth of
 * objects.
 */

/**
 * A hurdle, spanning every lane. There is no way round one, which is the
 * whole point of it, so it is built the width of the track with a leg on
 * every lane line — and it is painted, because a bar the colour of the
 * ground behind it is a bar you find out about by hitting.
 */
export function createHurdle() {
  const group = new THREE.Group();
  group.name = 'hurdle';

  const width = TRACK_HALF * 2;
  const legs = builder();
  const bar = builder();
  const stripes = builder();

  /** Feet and uprights, on every lane line so the thing has a scale you can
   *  read at speed: five bays means five lanes. */
  for (let lane = 0; lane <= LANES; lane++) {
    const x = -TRACK_HALF + lane * LANE_WIDTH;
    legs.box(x, HURDLE.height / 2, 0, 0.075, HURDLE.height, 0.075);
    legs.box(x, 0.03, 0.18, 0.1, 0.06, 0.62);
  }

  /** The bar itself, in alternating whites and reds. */
  const bands = 14;
  const step = width / bands;
  for (let i = 0; i < bands; i++) {
    const x = -width / 2 + (i + 0.5) * step;
    const into = i % 2 ? stripes : bar;
    into.box(x, HURDLE.height, 0, step, 0.11, 0.09);
  }
  /** And a lower rail, which is what tells you it is a hurdle and not a
   *  washing line. */
  bar.box(0, HURDLE.height * 0.45, 0, width, 0.055, 0.06);

  group.add(
    new THREE.Mesh(legs.geometry(), SURFACE.wood()),
    new THREE.Mesh(bar.geometry(), SURFACE.bar()),
    new THREE.Mesh(stripes.geometry(), SURFACE.stripe()),
  );
  return group;
}

/**
 * A rock, knocked out of shape so it is not obviously a ball.
 *
 * The displacement is hashed off the vertex *direction*, not its index, and
 * that is the whole trick: an icosahedron comes out of three.js non-indexed,
 * so every corner exists once per face that touches it. Hashing the index
 * gave each of those copies a different push and the stone came apart into a
 * spray of loose triangles you could see straight through. Hashing the
 * direction makes the copies agree, and a solid stays a solid.
 */
function rock(radius, colour, squash = 1) {
  const geometry = new THREE.IcosahedronGeometry(radius, 1);
  const position = geometry.attributes.position;
  const point = new THREE.Vector3();

  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    const n = point.clone().normalize();
    const hash = Math.sin(n.x * 127.1 + n.y * 311.7 + n.z * 74.7) * 43758.5453;
    point.multiplyScalar(0.78 + (hash - Math.floor(hash)) * 0.42);
    point.y *= squash;
    position.setXYZ(i, point.x, point.y, point.z);
  }

  /** Non-indexed, so this comes out faceted — which is what a rock wants. */
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, colour);
}

/**
 * Something on the track to go over on. There are three of them and they are
 * three because you have to be able to tell them apart at range: a boulder
 * fells anybody who touches it, and it had better not look like a pebble.
 */
export function createDebris(kind) {
  const group = new THREE.Group();
  group.name = `debris-${kind}`;

  if (kind === 'root') {
    /** A root, or a rut — long, low and across your line. */
    const build = builder();
    build.box(0, 0.06, 0, 1.5, 0.13, 0.22);
    build.box(-0.5, 0.11, 0.1, 0.5, 0.14, 0.18);
    build.box(0.45, 0.1, -0.12, 0.6, 0.12, 0.2);
    group.add(new THREE.Mesh(build.geometry(), SURFACE.root()));
    return group;
  }

  const boulder = kind === 'boulder';
  const body = rock(boulder ? 0.52 : 0.38, boulder ? matte(0x847d70, { roughness: 0.96 }) : SURFACE.stone(), 0.82);
  body.position.y = boulder ? 0.34 : 0.2;
  group.add(body);

  if (boulder) {
    /**
     * A cap of moss. It is the only green thing on the track that is not the
     * track, and it is there so that the one lump that will put you on the
     * floor is the one lump you can pick out of a field of them.
     */
    const cap = rock(0.4, matte(THEME.leaf, { roughness: 1 }), 0.4);
    cap.position.y = 0.58;
    group.add(cap);
  } else {
    const chip = rock(0.14, SURFACE.stone(), 0.9);
    chip.position.set(0.3, 0.08, -0.2);
    group.add(chip);
  }

  return group;
}

const CRUMB = 0.11;

/**
 * Something worth going near. The crumb is the currency; the other four are
 * the reason to take a line you would not otherwise take, which is the only
 * job a pickup has in a race.
 */
export function createPickup(kind) {
  const group = new THREE.Group();
  group.name = `pickup-${kind}`;

  if (kind === 'crumb') {
    /** A crumb: a little irregular lump of bread, not a coin. */
    const body = new THREE.Mesh(new THREE.DodecahedronGeometry(CRUMB, 0), prize(THEME.crumb, 0.35));
    body.rotation.set(0.4, 0.7, 0.2);
    body.scale.set(1.2, 0.9, 1);
    group.add(body);
    return group;
  }

  if (kind === 'feather') {
    /** A feather: a quill and a vane, edge on, so it flashes as it turns. */
    const vane = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12, 0, Math.PI), prize(THEME.feather, 0.7));
    vane.scale.set(0.5, 1, 1);
    vane.material.side = THREE.DoubleSide;
    const quill = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.02, 0.62, 5),
      prize(THEME.white, 0.3),
    );
    group.add(vane, quill);
    return group;
  }

  if (kind === 'straw') {
    /** Straw: a handful of it, crossed, the way it comes out of a nest. */
    const material = prize(THEME.straw, 0.3);
    for (let i = 0; i < 7; i++) {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.55, 4), material);
      stalk.rotation.set(Math.PI / 2, (i / 7) * Math.PI, (i % 3) * 0.3);
      stalk.position.y = 0.05 + (i % 3) * 0.04;
      group.add(stalk);
    }
    return group;
  }

  if (kind === 'puff') {
    /** A dandelion clock, which is the lightest thing in the county. */
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), prize(THEME.white, 0.4));
    group.add(core);
    const seed = prize(THEME.puff, 0.8);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 4), seed);
      tuft.position.set(Math.cos(a) * 0.19, Math.sin(i * 1.7) * 0.16, Math.sin(a) * 0.19);
      tuft.lookAt(0, 0, 0);
      group.add(tuft);
    }
    return group;
  }

  /** A patch: sticking plaster for a shell, and it looks like one. */
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.2), prize(THEME.patch, 0.5));
  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.42), prize(THEME.patch, 0.5));
  group.add(pad, cross);
  return group;
}

/**
 * What is left where an egg stopped being one. It lies flat on the grass and
 * it stays there for the rest of the heat, because everybody still running
 * has to go round it.
 */
export function createSplat() {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(YOLK.radius * 2.4, YOLK.radius * 2.4), spill());
  mesh.renderOrder = 2;
  mesh.rotation.x = -Math.PI / 2;
  mesh.name = 'splat';
  return mesh;
}
