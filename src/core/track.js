import { createRng, intBelow, pick, range } from './rng.js';
import {
  AIRTIME, APEX, BOOST, DEBRIS, FELLING, HEATS, HURDLE, LANES, laneX,
} from './tuning.js';

/**
 * The track. There are no holes in this one — it is a field with a race on
 * it, and the floor is the floor from the first metre to the last. Everything
 * the generator lays is *on* that floor: bars to jump, stones to miss, eggs
 * to not run into, and crumbs to make it worth going near any of them.
 *
 * A heat is a measured distance, so unlike an endless runner the whole thing
 * is laid at once. That is a few hundred objects for the longest heat on the
 * card, and it buys the field something worth more than the memory: a rival
 * forty metres up the track can see what is coming and run it properly.
 */

/** Track behind the start line, so there is grass under the field at t=0. */
const START_Z = -22;

/** A clean run-up off the line, and a clean run to the tape. */
const START_CLEAR = 34;
const FINISH_CLEAR = 16;

/** How much track is drawn past the line for the pull-up. */
export const RUNOUT = 110;

/** A jump's worth of ground, at the fastest this heat can be run. */
export function reachAt(pace) {
  return pace * BOOST.speed * AIRTIME;
}

/**
 * The rules a hurdle row is laid by, as shares of that reach. The minimum is
 * over one: whatever else a heat does to you, you always land between two
 * bars rather than meeting the second one still in the air from the first.
 */
export const RHYTHM = { min: 1.06, loose: 1.9 };

/** Nothing to trip over immediately after a bar, or right in front of one. */
export const HURDLE_CLEAR = { after: 4.5, before: 2.5 };

/** Two rows of stones never merge into one wall. */
export const ROW_GAP = 3.6;

/** However bad a row of stones gets, this many lanes are always open. */
export const OPEN_LANES = 2;

const TRIPS = ['stone', 'root', 'divot', 'clod'];

/** What is worth picking up, and how often it turns up at all. */
const PRIZES = ['feather', 'straw', 'puff', 'patch', 'feather'];

export function createTrack({ seed = 1, heat = HEATS[0] } = {}) {
  const rng = createRng(seed);

  const sections = [];
  const hurdles = [];
  const debris = [];
  const pickups = [];
  /** Filled in during the race, by whoever does not finish it. */
  const splats = [];

  const length = heat.distance;
  const reach = reachAt(heat.pace);

  let cursor = START_Z;
  let ids = 0;
  let lastHurdleZ = -Infinity;
  let lastRowZ = -Infinity;
  let sincePrize = 0;

  /** Everything dangerous lives between the run-up and the run-in. */
  const open = () => cursor > START_CLEAR && cursor < length - FINISH_CLEAR;

  function section(len, surface) {
    const z0 = cursor;
    cursor = Math.min(length + RUNOUT, cursor + len);
    sections.push({ z0, z1: cursor, surface });
    return sections[sections.length - 1];
  }

  function hurdle(z) {
    if (z - lastHurdleZ < reach * RHYTHM.min) return null;
    if (z > length - FINISH_CLEAR || z < START_CLEAR) return null;
    lastHurdleZ = z;
    const bar = { id: ids++, z, height: HURDLE.height, cleared: new Set() };
    hurdles.push(bar);
    return bar;
  }

  /**
   * A row of stones. It never fills the track — `OPEN_LANES` of it are always
   * running lanes — and it never lands on top of the row before it, which is
   * the difference between a thing to weave through and a wall.
   */
  function row(z, count, bite = () => range(rng, 0.2, 0.6)) {
    if (!open() || z - lastRowZ < ROW_GAP) return 0;
    for (const bar of hurdles) {
      if (z > bar.z - HURDLE_CLEAR.before && z < bar.z + HURDLE_CLEAR.after) return 0;
    }

    const lanes = [...Array(LANES).keys()];
    for (let i = lanes.length - 1; i > 0; i--) {
      const j = intBelow(rng, i + 1);
      [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    }

    const take = Math.max(1, Math.min(count, LANES - OPEN_LANES));
    for (const lane of lanes.slice(0, take)) {
      const weight = bite();
      debris.push({
        id: ids++,
        z,
        lane,
        x: laneX(lane),
        bite: weight,
        kind: weight >= FELLING ? 'boulder' : pick(rng, TRIPS),
        hit: false,
      });
    }
    lastRowZ = z;
    return take;
  }

  function prize(z, lane, kind) {
    if (z > length - 6) return null;
    const item = { id: ids++, z, lane, x: laneX(lane), y: 0.8, kind, taken: false };
    pickups.push(item);
    sincePrize = 0;
    return item;
  }

  function crumbs(z0, z1, lane, step = 2.6) {
    for (let z = z0; z < z1; z += step) {
      if (z > length - 4) break;
      pickups.push({ id: ids++, z, lane, x: laneX(lane), y: 0.75, kind: 'crumb', taken: false });
    }
  }

  /** Crumbs thrown over a bar in an arc, which is the generator saying jump. */
  function arc(bar, lane) {
    for (let i = -1; i <= 1; i++) {
      pickups.push({
        id: ids++,
        z: bar.z + i * 2.6,
        lane,
        x: laneX(lane),
        y: bar.height + 0.4 + (1 - Math.abs(i)) * 0.55,
        kind: 'crumb',
        taken: false,
      });
    }
  }

  /** Open ground. Somewhere to get the pace back and pick up what is lying on it. */
  function straight() {
    const seg = section(range(rng, 26, 44), 'turf');
    if (open()) crumbs(seg.z0 + 4, seg.z1 - 4, intBelow(rng, LANES));
  }

  /** A run of bars, to a rhythm the jump can actually hold. */
  function hurdleRun(rows) {
    const spacing = reach * range(rng, RHYTHM.min, RHYTHM.min + 0.28);
    const seg = section(spacing * (rows + 1), 'cinder');
    for (let i = 1; i <= rows; i++) {
      const bar = hurdle(seg.z0 + spacing * i);
      if (bar && rng() < 0.75) arc(bar, intBelow(rng, LANES));
    }
  }

  /** Stones laid so the open lane walks across the track: a weave. */
  function chicane(rows) {
    const step = Math.max(ROW_GAP + 1.4, reach * 0.42);
    const seg = section(step * (rows + 1), 'dirt');
    let clear = intBelow(rng, LANES);
    for (let i = 1; i <= rows; i++) {
      const z = seg.z0 + step * i;
      const lanes = [...Array(LANES).keys()].filter((lane) => lane !== clear);
      for (const lane of lanes.slice(0, LANES - OPEN_LANES)) {
        if (z - lastRowZ < ROW_GAP || !open()) break;
        debris.push({
          id: ids++,
          z,
          lane,
          x: laneX(lane),
          bite: range(rng, 0.2, 0.55),
          kind: pick(rng, TRIPS),
          hit: false,
        });
        lastRowZ = z;
      }
      pickups.push({ id: ids++, z, lane: clear, x: laneX(clear), y: 0.75, kind: 'crumb', taken: false });
      /** The way through never moves more than a lane between rows. */
      clear = Math.max(0, Math.min(LANES - 1, clear + (rng() < 0.5 ? -1 : 1)));
    }
  }

  /**
   * The big ones. A boulder does not trip an egg, it fells it — so it is laid
   * where it can be seen coming, alone, with crumbs down the lane beside it.
   */
  function boulders() {
    const seg = section(range(rng, 34, 50), 'dirt');
    const count = 1 + intBelow(rng, 2);
    for (let i = 0; i < count; i++) {
      const z = seg.z0 + (seg.z1 - seg.z0) * ((i + 1) / (count + 1));
      const laid = row(z, 1 + intBelow(rng, 2), () => range(rng, FELLING, 0.95));
      if (laid) {
        const safe = debris[debris.length - 1].lane;
        crumbs(z + 3, z + 9, (safe + 2) % LANES, 3);
      }
    }
  }

  /** Something worth having, usually with something in front of it. */
  function prizeRun() {
    const seg = section(range(rng, 30, 42), 'turf');
    const lane = intBelow(rng, LANES);
    const z = seg.z0 + (seg.z1 - seg.z0) * 0.6;
    if (rng() < 0.55) row(z - 8, 2);
    prize(z, lane, pick(rng, PRIZES));
    if (open()) crumbs(seg.z0 + 3, z - 4, (lane + 1) % LANES, 3.4);
  }

  /** Stones scattered over open ground, a row at a time. */
  function rough(d) {
    const seg = section(range(rng, 30, 48), 'dirt');
    const rows = 2 + Math.round(d * 3);
    for (let i = 1; i <= rows; i++) {
      const z = seg.z0 + (seg.z1 - seg.z0) * (i / (rows + 1));
      row(z, 1 + intBelow(rng, 2));
    }
    if (rng() < 0.6) crumbs(seg.z0 + 4, seg.z1 - 4, intBelow(rng, LANES), 4);
  }

  /** The run-up: flat, empty, and long enough to find your feet on. */
  section(START_Z * -1 + START_CLEAR, 'cinder');
  crumbs(6, START_CLEAR - 4, Math.floor(LANES / 2), 4.5);

  while (cursor < length - FINISH_CLEAR) {
    sincePrize += 1;
    const roll = rng();
    const wantsHurdles = rng() < heat.hurdles;
    const wantsRough = rng() < heat.debris * 0.6;

    if (sincePrize >= 3 && rng() < 0.5) prizeRun();
    else if (wantsHurdles && roll < 0.72) hurdleRun(2 + intBelow(rng, 1 + Math.round(heat.hurdles * 3)));
    else if (wantsRough && roll < 0.5) chicane(2 + intBelow(rng, 3));
    else if (wantsRough && roll < 0.78) rough(heat.debris);
    else if (wantsRough) boulders();
    else straight();
  }

  /** The run-in, and the pull-up on the far side of the line. */
  section(Math.max(0, length - cursor), 'cinder');
  section(RUNOUT, 'turf');

  hurdles.sort((a, b) => a.z - b.z);
  debris.sort((a, b) => a.z - b.z);
  pickups.sort((a, b) => a.z - b.z);

  /** First index in a z-sorted list at or past z. The lists never change
   *  length during a heat, so this stays honest all the way down the track. */
  function seek(list, z) {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].z < z) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  return {
    seed,
    heat,
    length,
    start: START_Z,
    finish: length,
    runout: length + RUNOUT,
    reach,

    sections,
    hurdles,
    debris,
    pickups,
    splats,

    /** The floor, which is a floor everywhere. Kept as a function because the
     *  physics asks a question and deserves an answer, not a constant. */
    groundAt() { return 0; },

    seek,

    /** The next bar past z, for anything deciding when to leave the ground. */
    nextHurdle(z) {
      const bar = hurdles[seek(hurdles, z + 1e-6)];
      return bar ?? null;
    },

    /** Whether a lane has something in it between two points — what a rival
     *  asks before it commits to a line, and what the tests ask of every seed. */
    blocked(lane, z0, z1) {
      for (let i = seek(debris, z0); i < debris.length && debris[i].z <= z1; i++) {
        if (debris[i].lane === lane) return debris[i];
      }
      for (const splat of splats) {
        if (splat.lane === lane && splat.z >= z0 && splat.z <= z1) return splat;
      }
      return null;
    },

    /** What a broken egg leaves on the track for everybody behind it. */
    spill(lane, z) {
      const splat = { id: ids++, lane, x: laneX(lane), z, kind: 'yolk' };
      splats.push(splat);
      return splat;
    },
  };
}

/** The tallest thing a jump has to clear, as a share of what it can. */
export const CLEARANCE = HURDLE.height / APEX;
export { DEBRIS, HURDLE };
