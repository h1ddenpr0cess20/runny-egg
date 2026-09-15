import * as THREE from 'three';

import { createRng, range } from '../core/rng.js';
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
 * Geometry a pickup builds once and every copy of that pickup shares. The
 * pool is what keeps the *scene* small; this is what keeps the build small,
 * because a dandelion is sixty instances of two shapes and there is no sense
 * in tessellating either of them again for the second clock on the course.
 */
const shared = new Map();
function once(key, make) {
  if (!shared.has(key)) shared.set(key, make());
  return shared.get(key);
}

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
 *
 * `floor` is for the things that were broken off something rather than worn
 * round by a river: everything below it is flattened into one torn face.
 * `offset` shifts the hash, which is the only way two lumps the same size
 * come out as two lumps rather than as the same one twice.
 */
function rock(radius, colour, squash = 1, {
  detail = 1, base = 0.78, spread = 0.42, floor = null, offset = 0,
} = {}) {
  const geometry = new THREE.IcosahedronGeometry(radius, detail);
  const position = geometry.attributes.position;
  const point = new THREE.Vector3();

  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    const n = point.clone().normalize();
    const hash = Math.sin(n.x * 127.1 + n.y * 311.7 + n.z * 74.7 + offset) * 43758.5453;
    point.multiplyScalar(base + (hash - Math.floor(hash)) * spread);
    point.y *= squash;
    if (floor !== null) point.y = Math.max(point.y, floor * radius);
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

/**
 * Rings of points, sewn into a surface, and the geometry that comes off the
 * end of it. It is the same trick `cracks.js` widens a fissure with, one
 * dimension up: everything organic in here — a vane, a barb, a quill — is a
 * run of cross-sections with a width that goes somewhere along its length,
 * and a box cannot do any of them.
 */
function sew(rings, into, { closed = false } = {}) {
  const across = rings[0].length;
  const first = into.position.length / 3;

  for (const ring of rings) {
    for (const point of ring) into.position.push(point[0], point[1], point[2]);
  }

  const spans = closed ? across : across - 1;
  for (let i = 0; i < rings.length - 1; i++) {
    const rung = first + i * across;
    for (let j = 0; j < spans; j++) {
      const a = rung + j;
      const b = rung + ((j + 1) % across);
      into.index.push(a, b, b + across, a, b + across, a + across);
    }
  }
  return into;
}

function stitched(into) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(into.position, 3));
  geometry.setIndex(into.index);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The feather, which is the one pickup that has to look like the thing it is
 * named after, because "feather" is the only word the callout gives you.
 *
 * It was a half-disc on a stick, and what that read as was a lollipop. A
 * feather is four things, and leaving any of them out is what makes the
 * silhouette wrong: a shaft that curves, two vanes of *different* widths
 * either side of it, a cupped section rather than a flat one, and a serrated
 * edge — barbs. A leaf has one width and a smooth outline; that is the
 * difference, and at this size the outline is all anybody gets.
 */
const FEATHER = {
  /** Calamus to tip, and how much of that is bare quill before the vane. */
  length: 0.66,
  bare: 0.3,
  /** Half-widths. The trailing vane is the broad one — a feather with two
   *  matching sides is a leaf. */
  wide: 0.13,
  narrow: 0.08,
  /** How far the vanes cup away from the shaft, and how many rungs it takes
   *  to lay one. */
  curl: 0.08,
  steps: 46,
};

/** Where the shaft is, `t` of the way up it: it leans, and it curves away out
 *  of its own plane, because a feather that is straight is a dart. */
function shaft(t) {
  return [t * t * 0.06, -FEATHER.length / 2 + t * FEATHER.length, t ** 2.6 * 0.1];
}

/**
 * How wide a vane is, `u` of the way along it: nothing at the quill, widest
 * at about a third, and a point at the tip. The ripple is the barbs — it is
 * a few per cent of the width and it is the whole difference between a
 * feather and a petal at the distance these are read from.
 */
function vane(u) {
  const body = Math.sin(Math.PI * u ** 0.62) ** 0.9;
  const barbs = 1 - 0.07 * (0.5 - 0.5 * Math.cos(u * 88));
  /** Never quite nothing: a ring of three identical points is three
   *  degenerate triangles, and what those shade to is a black spot on the
   *  tip. */
  return Math.max(body * barbs, 0.025);
}

/** The two places the barbs have come unzipped, as notches in the trailing
 *  edge. Every feather off a real bird has a couple. */
const SPLITS = [0.54, 0.79];
function split(u) {
  let width = 1;
  for (const at of SPLITS) width *= 1 - 0.36 * Math.exp(-(((u - at) / 0.02) ** 2));
  return width;
}

function createFeather() {
  const web = { position: [], index: [] };
  const rings = [];

  for (let i = 0; i <= FEATHER.steps; i++) {
    const u = i / FEATHER.steps;
    const [x, y, z] = shaft(FEATHER.bare + u * (1 - FEATHER.bare));
    const lead = vane(u) * FEATHER.narrow;
    const trail = vane(u) * FEATHER.wide * split(u);

    /**
     * The cup. Both vanes fall away from the shaft, and further as they
     * widen, so the thing has a section instead of being a card. That is what
     * keeps it lit when it turns edge-on to the camera, which it does twice a
     * second all the way down the straight.
     */
    const cup = (half) => -FEATHER.curl * (half / FEATHER.wide) ** 2 * (0.55 + 0.45 * u);

    rings.push([
      [x - lead, y, z + cup(lead)],
      [x, y, z],
      [x + trail, y, z + cup(trail)],
    ]);
  }
  sew(rings, web);

  /** The shaft: a four-sided tube that thins to a hair, laid up the same
   *  curve the vane hangs off. */
  const quill = { position: [], index: [] };
  const tube = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const [x, y, z] = shaft(t);
    const r = 0.018 * (1 - 0.74 * t);
    const ring = [];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      ring.push([x + Math.cos(a) * r, y, z + Math.sin(a) * r]);
    }
    tube.push(ring);
  }
  sew(tube, quill, { closed: true });

  /**
   * And the down at the bottom of it — the loose barbs that never zipped up
   * into a vane. They are sixteen strands of nothing, and they are there because
   * they break the join between shaft and vane, which is where the lollipop
   * was most obviously a lollipop.
   */
  const fluff = createRng(0xfea7e);
  for (let i = 0; i < 16; i++) {
    const side = i % 2 ? 1 : -1;
    const [x, y, z] = shaft(0.14 + (i % 8) * 0.026);
    const length = range(fluff, 0.035, 0.085);
    const rise = range(fluff, -0.1, 0.45);
    const strand = [];
    for (let s = 0; s <= 4; s++) {
      const k = s / 4;
      const half = 0.005 * (1 - k) + 0.0006;
      const px = x + side * length * k;
      const py = y + length * k * rise - 0.5 * length * k * k;
      strand.push([[px, py - half, z], [px, py + half, z]]);
    }
    sew(strand, quill);
  }

  /**
   * The lean is baked in here rather than left to the frame, because
   * `view.js` writes a pickup's rotation every tick and anything set on the
   * group outside it is gone by the next one.
   */
  const tilt = new THREE.Group();
  tilt.rotation.set(0.12, 0, 0.3);
  tilt.add(
    new THREE.Mesh(stitched(web), prize(THEME.feather, 0.7, { side: THREE.DoubleSide })),
    new THREE.Mesh(stitched(quill), prize(THEME.featherPale, 0.4, { side: THREE.DoubleSide })),
  );
  return tilt;
}

/**
 * A dandelion clock. Thirty seeds packed evenly over a ball, each one a stalk
 * with a parachute on the end of it, and two that have already left.
 *
 * The even packing is the point. Fourteen tufts at scattered heights is a
 * burr, not a clock — and the tufts were aimed with `lookAt`, which points a
 * cone's *side* at what it is given rather than its axis, so every seed on
 * the old one was lying across its own stalk with its point out.
 */
const PUFF = { seeds: 42, core: 0.05, stalk: 0.09, pappus: 0.085, brush: 0.043 };

function createPuff() {
  const group = new THREE.Group();
  const pale = prize(THEME.white, 0.4);

  group.add(new THREE.Mesh(
    once('puff-core', () => new THREE.SphereGeometry(PUFF.core, 9, 7)),
    pale,
  ));

  const stalks = new THREE.InstancedMesh(
    once('puff-stalk', () => new THREE.CylinderGeometry(0.003, 0.005, PUFF.stalk, 3)),
    pale,
    PUFF.seeds,
  );
  /** Open-ended and two-sided: a seed head is a little upturned brush, and a
   *  closed cone is a spike. */
  const chutes = new THREE.InstancedMesh(
    once('puff-chute', () => new THREE.ConeGeometry(PUFF.brush, PUFF.pappus, 7, 1, true)),
    prize(THEME.puff, 0.8, { side: THREE.DoubleSide }),
    PUFF.seeds,
  );

  const up = new THREE.Vector3(0, 1, 0);
  const out = new THREE.Vector3();
  const back = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const at = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const matrix = new THREE.Matrix4();

  for (let i = 0; i < PUFF.seeds; i++) {
    /** Fibonacci over the sphere, which is the cheap way to get thirty
     *  directions with no crowding and no bald patch. */
    const y = 1 - (2 * i + 1) / PUFF.seeds;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * 2.399963;
    out.set(Math.cos(a) * ring, y, Math.sin(a) * ring);

    /** Two of them have already gone, which is the other half of what a
     *  dandelion clock is for. */
    const away = i === 9 ? 0.15 : i === 31 ? 0.1 : 0;

    turn.setFromUnitVectors(up, out);
    at.copy(out).multiplyScalar(PUFF.core + PUFF.stalk / 2 + away);
    stalks.setMatrixAt(i, matrix.compose(at, turn, one));

    /** Apex inwards, mouth out. */
    turn.setFromUnitVectors(up, back.copy(out).negate());
    at.copy(out).multiplyScalar(PUFF.core + PUFF.stalk + PUFF.pappus / 2 + away);
    chutes.setMatrixAt(i, matrix.compose(at, turn, one));
  }

  for (const mesh of [stalks, chutes]) {
    mesh.instanceMatrix.needsUpdate = true;
    /** The instances sit a quarter of a metre off the origin they were
     *  tessellated around, and a bounding sphere that does not know that
     *  culls the whole clock the moment the middle of it leaves the frame. */
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  return group;
}

/**
 * Straw: a handful lifted out of a nest. Mostly lying the same way, with a
 * couple across the rest — a pile at even angles is a game of jackstraws, and
 * one at no angles at all is a fat stick.
 */
const STRAW = { stalks: 9, crossers: 2 };

function createStraw() {
  const group = new THREE.Group();
  const rng = createRng(0x57a2b1);

  /** Open-ended, because straw is a tube and the ends of a handful of it are
   *  the giveaway that it is not a bundle of dowel. */
  const geometry = once('straw-stalk', () => new THREE.CylinderGeometry(0.012, 0.017, 1, 5, 1, true));
  const pale = new THREE.InstancedMesh(geometry, prize(THEME.strawPale, 0.22, { side: THREE.DoubleSide }), 3);
  const dun = new THREE.InstancedMesh(geometry, prize(THEME.straw, 0.28, { side: THREE.DoubleSide }), STRAW.stalks - 3);

  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const at = new THREE.Vector3();
  const stretch = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const counts = [0, 0];

  for (let i = 0; i < STRAW.stalks; i++) {
    const length = range(rng, 0.34, 0.6);
    const yaw = i >= STRAW.stalks - STRAW.crossers
      ? range(rng, 1.05, 1.5)
      : range(rng, -0.32, 0.32);
    const pitch = range(rng, -0.16, 0.16);
    dir.set(Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch));

    turn.setFromUnitVectors(up, dir);
    at.set(range(rng, -0.05, 0.05), -0.05 + i * 0.016, range(rng, -0.06, 0.06));
    stretch.set(1, length, 1);

    const into = i % 3 === 0 ? 0 : 1;
    const mesh = into === 0 ? pale : dun;
    mesh.setMatrixAt(counts[into]++, matrix.compose(at, turn, stretch));
  }

  for (const mesh of [pale, dun]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  return group;
}

/**
 * A sticking plaster: a rounded strip with a gauze pad in the middle of it,
 * bowed along its length because a plaster is stuck to something curved and a
 * flat one is a lolly stick.
 */
const PLASTER = { length: 0.44, width: 0.15, thick: 0.02, arch: 0.042, steps: 14 };

/** How high the bow has lifted the tape, `along` of the way out from the
 *  middle of it, as a fraction of half its length. The pads are placed with
 *  this too — they have to sit on the curve, not at the height of its peak. */
function bow(along) {
  return PLASTER.arch * Math.max(0, 1 - along * along);
}

function strap() {
  const { length, width, thick, steps } = PLASTER;
  const r = width / 2;
  const end = length / 2 - r;

  const shape = new THREE.Shape();
  shape.moveTo(-end, -r);
  /**
   * The long edges are walked in steps rather than drawn in one line. The bow
   * below moves vertices, and an edge with no vertices along it has nothing
   * to bend: drawn the obvious way this came out as two flat slabs with a
   * kink between them, arched by three fifths of what it was asked for, and
   * the gauze pad — placed at the height the arch was *meant* to reach — was
   * swallowed whole by the tape it was supposed to be sitting on.
   */
  for (let i = 1; i <= steps; i++) shape.lineTo(-end + (2 * end * i) / steps, -r);
  shape.absarc(end, 0, r, -Math.PI / 2, Math.PI / 2, false);
  for (let i = 1; i <= steps; i++) shape.lineTo(end - (2 * end * i) / steps, r);
  shape.absarc(-end, 0, r, Math.PI / 2, Math.PI * 1.5, false);

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 7 });
  geometry.translate(0, 0, -thick / 2);

  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    position.setZ(i, position.getZ(i) + bow(position.getX(i) / (length / 2)));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function createPatch() {
  const group = new THREE.Group();
  const tape = prize(THEME.patch, 0.5);
  const gauze = prize(THEME.white, 0.45);
  const strip = once('plaster-strip', strap);
  const pad = once('plaster-pad', () => new THREE.BoxGeometry(0.17, 0.105, 0.014));

  /**
   * Two of them, crossed. One plaster is a plaster; two crossed is first aid,
   * and first aid is what has to read at forty metres. They are stood upright
   * rather than laid flat — the old one was a slab on the floor of the lane
   * and what you saw of it at range was its edge — and the second is turned
   * out of the first one's plane so that the cross never goes side-on to the
   * camera all at once.
   */
  for (const [roll, lean, padAt] of [[0.42, 0, 0.12], [-1.05, 0.55, -0.12]]) {
    const arm = new THREE.Group();
    arm.rotation.set(0, lean, roll);
    arm.add(new THREE.Mesh(strip, tape));

    /**
     * A pad on each face, and both of them pushed off the middle — the two
     * straps cross through their own middles, so a pad left there is a pad
     * under the other plaster, and a plaster with nothing on it is a stick of
     * chewing gum. They go opposite ways, which is why one is always clear.
     *
     * The height they sit at is the height the bow has reached where they
     * sit, not the height of the middle of it: pinned to the middle, a pad
     * floats clear of the tape at one end and is swallowed by it at the other.
     */
    const lift = bow(padAt / (PLASTER.length / 2));
    for (const face of [1, -1]) {
      const gauzePad = new THREE.Mesh(pad, gauze);
      gauzePad.position.set(padAt, 0, lift + face * 0.013);
      arm.add(gauzePad);
    }
    group.add(arm);
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
    /**
     * A crumb, which is a piece torn off something rather than a bead: a
     * chunky lump with one flat face where it came away, and a smaller one
     * beside it, because crumbs do not come singly.
     */
    const body = rock(CRUMB, prize(THEME.crumb, 0.4), 0.85, {
      detail: 1, base: 0.62, spread: 0.7, floor: -0.35,
    });
    body.rotation.set(0.35, 0.8, 0.12);
    const chip = rock(CRUMB * 0.46, prize(THEME.crust, 0.35), 0.8, {
      detail: 0, base: 0.55, spread: 0.8, floor: -0.3, offset: 2.4,
    });
    chip.position.set(CRUMB * 1.05, -CRUMB * 0.3, CRUMB * 0.35);
    chip.rotation.set(0.7, 0.3, 0.9);
    group.add(body, chip);
    return group;
  }

  if (kind === 'feather') group.add(createFeather());
  else if (kind === 'straw') group.add(createStraw());
  else if (kind === 'puff') group.add(createPuff());
  else group.add(createPatch());

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
