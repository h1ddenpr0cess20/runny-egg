import * as THREE from 'three';

import { LANES, LANE_WIDTH, laneX, TRACK_HALF } from '../core/tuning.js';
import { builder, tile } from './build.js';
import { marking, SURFACE } from './materials.js';
import { THEME } from './theme.js';

/**
 * The floor, and there is a lot of it: a kilometre of running track with a
 * county either side. All of it is built once when a heat starts, because a
 * heat is a measured distance — there is nothing to stream in, and a track
 * that exists all at once is a track a rival forty metres up can be running
 * on properly.
 */

/** Metres of world per repeat of a surface texture. */
const TILE = { turf: 4.5, dirt: 3.2, cinder: 3 };

/** How far the field reaches either side of the track, and how far back. */
const FIELD = { half: 520, behind: 240, beyond: 620 };

/** Chalk. Wide enough to read at speed, thin enough to be paint. */
const LINE = { width: 0.13, lift: 0.012 };
const TAPE = { depth: 0.45, lift: 0.014 };

/** The track is laid a hair over the grass, so the two never z-fight. */
const DECK = 0.006;

function slab(w, l, material, uTile, vTile) {
  const geometry = new THREE.PlaneGeometry(w, l);
  tile(geometry, w / uTile, l / vTile);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export function createGround(track) {
  const group = new THREE.Group();
  group.name = 'ground';

  const length = track.runout - track.start + FIELD.behind + FIELD.beyond;
  const middle = (track.start - FIELD.behind + track.runout + FIELD.beyond) / 2;

  /**
   * The county. One plane, two triangles, running out past where the fog has
   * already given up — cheaper than anything clever and there is nothing on
   * it to give the size away.
   */
  const meadow = slab(FIELD.half * 2, length, SURFACE.turf(), TILE.turf, TILE.turf);
  meadow.position.set(0, 0, middle);
  meadow.receiveShadow = false;
  group.add(meadow);

  /**
   * The track itself, a section at a time, because the surface changes along
   * it — turf where it is just a field, dirt where it has been churned up,
   * and cinder where somebody decided the running mattered.
   */
  const width = TRACK_HALF * 2;
  for (const section of track.sections) {
    const run = section.z1 - section.z0;
    if (run <= 0) continue;
    const surface = SURFACE[section.surface] ? section.surface : 'turf';
    /** Turf sections are the field showing through rather than a laid
     *  surface, so they are left as the meadow they already are. */
    if (surface === 'turf') continue;
    const deck = slab(width, run, SURFACE[surface](), TILE[surface], TILE[surface]);
    deck.position.set(0, DECK, (section.z0 + section.z1) / 2);
    group.add(deck);
  }

  /**
   * The chalk. Six lines the length of the course, plus the two that matter —
   * and they are built into one geometry, because a line per lane per section
   * was four hundred meshes and the track has not started yet.
   */
  const paint = builder();
  const from = track.start;
  const to = track.runout;
  const run = to - from;
  const midZ = (from + to) / 2;

  for (let lane = 0; lane <= LANES; lane++) {
    const x = laneX(lane) + LANE_WIDTH / 2;
    paint.box(x, LINE.lift, midZ, LINE.width, 0.004, run);
  }
  /** The outside edges get a heavier line, the way a marked-out track does. */
  for (const edge of [-TRACK_HALF, TRACK_HALF]) {
    paint.box(edge, LINE.lift, midZ, LINE.width * 2.2, 0.004, run);
  }

  const lines = new THREE.Mesh(paint.geometry(), marking(THEME.chalk));
  lines.name = 'lanes';
  group.add(lines);

  /** The start, and the one everybody is running at. */
  const tape = builder();
  tape.box(0, TAPE.lift, 0, width, 0.005, TAPE.depth);
  tape.box(0, TAPE.lift, track.finish, width, 0.005, TAPE.depth * 1.6);
  group.add(new THREE.Mesh(tape.geometry(), marking(0xffffff)));

  /** A chequer across the line, so it reads as the finish from a long way
   *  back rather than as one more stripe on a striped track. */
  const chequer = builder();
  const squares = 18;
  const step = width / squares;
  for (let i = 0; i < squares; i += 2) {
    chequer.box(-width / 2 + (i + 0.5) * step, TAPE.lift + 0.002, track.finish - 0.36, step, 0.004, 0.32);
    chequer.box(-width / 2 + (i + 1.5) * step, TAPE.lift + 0.002, track.finish + 0.36, step, 0.004, 0.32);
  }
  group.add(new THREE.Mesh(chequer.geometry(), marking(0x2b2b2b)));

  return {
    object: group,

    dispose() {
      group.traverse((node) => {
        if (node.isMesh) node.geometry.dispose();
      });
    },
  };
}
