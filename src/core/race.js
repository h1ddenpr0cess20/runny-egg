import { createEmitter } from './emitter.js';
import { advance, createRacer, fall, toTheLine, trip } from './racer.js';
import { createField } from './rivals.js';
import { PLAYER_EGG } from './roster.js';
import { createTrack } from './track.js';
import {
  BOOST, CRACKS, DEBRIS, DOWN, FELLING, FLOAT, GRACE, GRIP, HEATS, HURDLE,
  LANES, PICKUP, PLAYER_PACE, SCORE, STUMBLE, YOLK, placeScore,
} from './tuning.js';

const STEP = 1 / 120;
const MAX_STEPS = 6;

/** How long two eggs have to stay off each other after a shoulder. */
const BARGE = 0.55;

/** And how long being stepped on keeps an egg that is already down there. */
const TRAMPLE = DOWN.time * 0.45;

/**
 * The run, with no pixels in it: a track, a field, three cracks and a card of
 * six heats. Everything the renderer draws and the HUD reads comes out of
 * here, and nothing in here knows either of them exists.
 *
 * Events: 'heat' 'jump' 'land' 'caught' 'crumb' 'prize' 'trip' 'fall' 'crack'
 * 'break' 'overtake' 'passed' 'finish' 'results' 'over'.
 */
export function createRace({ seed = 1, heats = HEATS, cracks = CRACKS } = {}) {
  const emitter = createEmitter();

  let meetSeed = seed;
  let index = 0;
  let state = 'ready';
  let track = null;
  let field = null;
  let player = createRacer(PLAYER_EGG);
  let banked = 0;
  let crumbs = 0;
  let overtakes = 0;
  let clean = true;
  let results = null;
  let outcome = null;
  let elapsed = 0;
  let carry = 0;
  let held = null;
  let ahead = new Map();
  /** Whether the current heat's track is laid and the field is on the line. */
  let lined = false;

  const heat = () => heats[Math.min(index, heats.length - 1)];
  const last = () => index >= heats.length - 1;

  /** Everybody in the race, you included, in no particular order. */
  function everyone() {
    return field ? [player, ...field.racers] : [player];
  }

  /** Still upright, still going, still able to take a place off you. */
  const running = (racer) => !racer.broken;

  function distance() {
    return track ? Math.max(0, Math.min(player.z, track.finish)) : 0;
  }

  /** What this heat is worth so far. Banked heats are already counted. */
  function live() {
    return Math.floor(distance() * SCORE.perMetre)
      + crumbs * SCORE.perCrumb
      + overtakes * SCORE.perOvertake;
  }

  function score() {
    return banked + live();
  }

  /** Where you are in the race right now: everybody still in it, by z. */
  function placeOf(racer) {
    let place = 1;
    for (const other of everyone()) {
      if (other === racer || !running(other)) continue;
      if (racer.finished) {
        if (other.finished && other.place && other.place < racer.place) place += 1;
      } else if (other.finished || other.z > racer.z) place += 1;
    }
    return place;
  }

  function snapshot() {
    return {
      state,
      outcome,
      heat: heat(),
      heatIndex: index,
      heats: heats.length,
      last: last(),
      track,
      player,
      rivals: field ? field.racers : [],
      racers: everyone(),
      cracks: player.cracks,
      maxCracks: cracks,
      crumbs,
      overtakes,
      clean,
      place: placeOf(player),
      field: everyone().filter(running).length,
      distance: distance(),
      remaining: track ? Math.max(0, track.finish - player.z) : 0,
      progress: track ? Math.min(1, Math.max(0, player.z / track.finish)) : 0,
      time: player.time,
      score: score(),
      results,
      elapsed,
    };
  }

  /**
   * A crack. Three of them and the shell goes, which is the only clock in
   * this game that does not reset when you cross a line — within a heat.
   * Between heats you are patched up, because six heats of three cracks is a
   * meet nobody finishes.
   */
  function crack(racer, reason) {
    if (racer.grace > 0 || racer.broken) return false;
    racer.cracks += 1;
    racer.grace = GRACE;
    if (racer === player) clean = false;
    emitter.emit('crack', { racer, reason, cracks: racer.cracks, player: racer === player });
    if (racer.cracks >= cracks) shatter(racer, reason);
    return true;
  }

  /**
   * And the last one. The shell lets go, what was inside it is on the grass,
   * and the grass keeps it — a broken egg leaves a slick that everybody still
   * running has to go round.
   */
  function shatter(racer, reason) {
    racer.broken = true;
    racer.down = Math.max(racer.down, 3);
    racer.speed = 0;
    const splat = track.spill(racer.lane, racer.z);
    emitter.emit('break', { racer, reason, splat, player: racer === player });
    if (racer === player) finish('broken');
  }

  /** Down you go, and a crack for it. */
  function floor(racer, reason, seconds = DOWN.time) {
    fall(racer, seconds);
    emitter.emit('fall', { racer, reason, player: racer === player });
    crack(racer, reason);
  }

  /** Knocked about, not knocked over — and the warning that the next one will. */
  function wobble(racer, reason) {
    const already = racer.stumble > 0;
    trip(racer, STUMBLE.time);
    emitter.emit('trip', { racer, reason, again: already, player: racer === player });
    return already;
  }

  function hurdles(racer) {
    const from = racer.z - racer.radius - HURDLE.halfDepth;
    const to = racer.z + racer.radius + HURDLE.halfDepth;
    for (let i = track.seek(track.hurdles, from); i < track.hurdles.length; i++) {
      const bar = track.hurdles[i];
      if (bar.z > to) break;
      if (bar.cleared.has(racer.id)) continue;
      /**
       * Over it *right now* is not over it yet — the overlap lasts a tenth of
       * a second and the egg has to be above the bar for all of it. Judging on
       * the tick the window opens failed every jump that was still rising
       * into it, which is most of them, and buried the field.
       */
      if (racer.y >= bar.height) continue;
      bar.cleared.add(racer.id);
      /** A trailing foot on the bar is a stumble, and running into one at
       *  chest height is exactly what it looks like. */
      if (racer.y >= bar.height - HURDLE.graze) {
        racer.vy = Math.min(racer.vy, -1);
        wobble(racer, 'hurdle');
      } else {
        floor(racer, 'hurdle');
      }
    }
  }

  /** How big a lump of debris actually is — which is how mean it is. */
  function bulk(lump) {
    return {
      x: DEBRIS.halfWidth * (0.7 + lump.bite * 0.6),
      z: DEBRIS.halfDepth * (0.7 + lump.bite * 0.6),
      y: DEBRIS.height * (0.6 + lump.bite),
    };
  }

  function stones(racer) {
    const from = racer.z - racer.radius - DEBRIS.halfDepth * 1.4;
    const to = racer.z + racer.radius + DEBRIS.halfDepth * 1.4;
    for (let i = track.seek(track.debris, from); i < track.debris.length; i++) {
      const lump = track.debris[i];
      if (lump.z > to) break;
      if (lump.struck?.has(racer.id)) continue;
      const size = bulk(lump);
      if (Math.abs(lump.x - racer.x) > racer.radius + size.x) continue;
      if (Math.abs(lump.z - racer.z) > racer.radius + size.z) continue;
      if (racer.y >= size.y) continue;

      lump.struck ??= new Set();
      lump.struck.add(racer.id);
      lump.hit = true;

      /** Straw underfoot and the whole track is flat. */
      if (racer.grip > 0) {
        emitter.emit('crunch', { racer, lump, player: racer === player });
        continue;
      }
      /**
       * Whether a stone trips you or fells you is the stone and the speed
       * together. A boulder fells anybody; a middling one only fells an egg
       * that met it flat out — which is what makes a feather through a rough
       * stretch a decision rather than a present.
       */
      const force = lump.bite * (racer.speed / heat().pace);
      if (force >= FELLING) floor(racer, lump.bite >= FELLING ? 'boulder' : 'stone');
      else if (wobble(racer, 'stone')) floor(racer, 'stone');
    }
  }

  function slicks(racer) {
    for (const splat of track.splats) {
      if (splat.struck?.has(racer.id)) continue;
      if (Math.abs(splat.z - racer.z) > racer.radius + YOLK.radius) continue;
      if (Math.abs(splat.x - racer.x) > racer.radius + YOLK.radius) continue;
      if (racer.y > 0.2 || racer.grip > 0) continue;
      splat.struck ??= new Set();
      splat.struck.add(racer.id);
      /** Yolk never breaks anybody. It just takes the race off you. */
      trip(racer, STUMBLE.time * 1.2);
      emitter.emit('trip', { racer, reason: 'yolk', again: false, player: racer === player });
    }
  }

  function prizes() {
    for (let i = track.seek(track.pickups, player.z - 2); i < track.pickups.length; i++) {
      const item = track.pickups[i];
      if (item.z > player.z + 2) break;
      if (item.taken) continue;
      if (Math.abs(item.x - player.x) > PICKUP.reach) continue;
      if (Math.abs(item.z - player.z) > PICKUP.reach) continue;
      if (Math.abs(player.y + player.height / 2 - item.y) > PICKUP.lift) continue;

      item.taken = true;
      if (item.kind === 'crumb') {
        crumbs += 1;
        player.crumbs += 1;
        emitter.emit('crumb', { item, crumbs });
        continue;
      }
      if (item.kind === 'feather') player.boost = BOOST.time;
      if (item.kind === 'straw') player.grip = GRIP.time;
      if (item.kind === 'puff') player.float = FLOAT.time;
      if (item.kind === 'patch') player.cracks = Math.max(0, player.cracks - 1);
      emitter.emit('prize', { item, kind: item.kind, player });
    }
  }

  /**
   * Eggs into eggs. This is what the three cracks are actually for: the track
   * can be read and the stones can be seen coming, but the field is six other
   * runners with their own ideas, and the one behind you cannot see round you.
   *
   * Whatever happens here happens to both of them. Contact is the one hazard
   * on the course with somebody else on the other end of it, and an egg that
   * clatters you and runs on unmarked is a stone that gets to choose where it
   * lies. The feather is the only thing that buys a better end of it, and it
   * buys it by being spent.
   */
  function contact(a, b) {
    if (a.broken || b.broken) return;
    if (a.contact > 0 || b.contact > 0) return;
    const reach = a.radius + b.radius;
    if (Math.abs(a.x - b.x) > reach) return;
    if (Math.abs(a.z - b.z) > reach) return;
    /** Over the top of somebody is not into them. */
    if (Math.abs(a.y - b.y) > Math.min(a.height, b.height) * 0.72) return;

    a.contact = BARGE;
    b.contact = BARGE;

    /**
     * An egg already flat on the grass is below everybody else's running
     * line: you go over it, or through where it used to be, and all it costs
     * is your balance. This is also the only thing standing between one fall
     * and the entire field going down in a heap behind it — a pile-up that
     * cracks everybody it touches cracks everybody who touches them.
     *
     * It is not nothing for the one on the floor, either. Being trodden on is
     * how an egg stays down: a boot while it is getting its feet under it buys
     * it another half second of lying there. What it does not buy is a crack,
     * because a shell that broke every time somebody went over it is the
     * pile-up again with a longer fuse.
     */
    if (a.down > 0 || b.down > 0) {
      for (const racer of [a, b]) {
        if (racer.down > 0) racer.down = Math.max(racer.down, TRAMPLE);
        else wobble(racer, 'heap');
      }
      emitter.emit('bump', { a, b, player: a === player || b === player });
      return;
    }

    /**
     * The feather goes through the back of somebody, which is the reward for
     * having crossed the track to pick it up — and it is not a free one. Going
     * through an egg at that pace is what the feather is spent on: the boost
     * ends on the contact, and what the charger carries out the other side is
     * a wobble. It is still the better end of the deal by a distance, because
     * the egg in front is on the grass with a crack in it.
     */
    const charging = a.boost > 0 && b.boost <= 0 ? a : (b.boost > 0 && a.boost <= 0 ? b : null);
    if (charging) {
      const hit = charging === a ? b : a;
      charging.boost = 0;
      trip(charging, STUMBLE.time);
      floor(hit, 'barged');
      emitter.emit('barge', { by: charging, hit, player: charging === player });
      return;
    }

    /**
     * A shoulder between two eggs that are both still on their feet, and
     * neither of them walks away from it: both go down, and going down is what
     * cracks a shell — here as it is for a stone and for a bar.
     *
     * One of them used to get up unmarked, and from inside the race that read
     * as a coin toss: the egg that came across you took nothing for it while
     * the crack was all yours. Two eggs into each other at fifteen metres a
     * second is two eggs on the grass, and the one that caused it pays the
     * same as the one that was there first.
     *
     * What is still decided is who gets up first, because that is the half
     * second the place is lost in. Being off balance when it landed, giving
     * away size, or catching the heels of the runner in front is what leaves
     * an egg down there longest.
     */
    const wasA = a.stumble > 0;
    const wasB = b.stumble > 0;
    const worse = wasA !== wasB
      ? (wasA ? a : b)
      : (Math.abs(a.size - b.size) > 0.06 ? (a.size <= b.size ? a : b) : (a.z <= b.z ? a : b));
    floor(a, 'egg', a === worse ? DOWN.time * 1.35 : DOWN.time * 0.8);
    floor(b, 'egg', b === worse ? DOWN.time * 1.35 : DOWN.time * 0.8);
    emitter.emit('bump', { a, b, player: a === player || b === player });
  }

  function crowd() {
    const all = everyone();
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) contact(all[i], all[j]);
    }
  }

  /** Crossing the line, and the order it happened in. */
  function tape(racer) {
    if (racer.finished || racer.broken || racer.z < track.finish) return;
    racer.finished = true;
    racer.finishTime = racer.time;
    racer.place = 1 + everyone().filter((other) => other !== racer && other.finished).length;
    emitter.emit('finish', { racer, place: racer.place, time: racer.finishTime, player: racer === player });
    if (racer === player) finish('line');
  }

  /** Who is in front of whom, and what changed since the last tick. */
  function order() {
    for (const rival of field.racers) {
      const was = ahead.get(rival.id) ?? rival.z > player.z;
      const now = rival.finished || (!player.finished && rival.z > player.z);
      if (was === now) continue;
      ahead.set(rival.id, now);
      if (rival.broken) continue;
      if (was && !now) {
        overtakes += 1;
        emitter.emit('overtake', { rival, overtakes });
      } else {
        emitter.emit('passed', { rival });
      }
    }
  }

  /**
   * The end of a heat, however it came. The order is taken as it stands the
   * moment you cross — anybody still out on the track is placed by how much
   * of it they had left, which is the same thing a photo finish does with
   * more ceremony.
   */
  function finish(how) {
    const standings = everyone()
      .map((racer) => ({
        id: racer.id,
        name: racer.name,
        tint: racer.tint,
        size: racer.size,
        broken: racer.broken,
        finished: racer.finished,
        cracks: racer.cracks,
        time: racer.finished ? racer.finishTime : racer.time,
        crossed: racer.place,
        z: racer.z,
        you: racer === player,
      }))
      .sort((a, b) => {
        if (a.broken !== b.broken) return a.broken ? 1 : -1;
        if (a.finished !== b.finished) return a.finished ? -1 : 1;
        /** Finishers are ranked by the order the tape saw them, which is the
         *  order they were given when they crossed it. */
        if (a.finished && b.finished) return a.crossed - b.crossed;
        return b.z - a.z;
      })
      .map((row, i) => ({ ...row, place: row.broken ? 0 : i + 1 }));

    const mine = standings.find((row) => row.you);
    const place = mine?.place ?? 0;

    let earned = live();
    if (how === 'line') {
      earned += placeScore(place);
      if (clean) earned += SCORE.clean;
    }
    banked += earned;

    const qualified = how === 'line' && place > 0 && place <= (heat().qualify ?? heats.length);
    const champion = how === 'line' && last() && place === 1;
    if (champion) banked += SCORE.meet;

    outcome = how === 'broken'
      ? 'broken'
      : (champion ? 'champion' : (last() ? 'finished' : (qualified ? 'advance' : 'knocked out')));

    results = {
      heat: heat(),
      heatIndex: index,
      standings,
      place,
      time: player.time,
      crumbs,
      overtakes,
      cracks: player.cracks,
      clean,
      earned,
      score: banked,
      outcome,
      qualified,
      champion,
      last: last(),
    };

    /** Only one of these lets you run again. Either way this heat's track is
     *  spent, and the next call to the line lays a new one. */
    lined = false;
    state = outcome === 'advance' ? 'ready' : 'over';
    if (outcome === 'advance') index += 1;
    emitter.emit('results', results);
    if (state === 'over') emitter.emit('over', snapshot());
  }

  /**
   * Lay a track, turn out a field, and put everybody on the line. Called by
   * both doors below and guarded by `lined`, so previewing a heat and then
   * starting it runs the same heat rather than laying a second one.
   */
  function lineUp(nextSeed = meetSeed) {
    if (lined) return;
    if (state === 'over' || !track) {
      meetSeed = nextSeed;
      index = 0;
      banked = 0;
      outcome = null;
      results = null;
    }

    const card = heat();
    const seed = meetSeed + index * 1013;
    track = createTrack({ seed, heat: card });
    field = createField({ seed, heat: card });
    player = createRacer(PLAYER_EGG);
    toTheLine(player, Math.floor(LANES / 2), card.pace);

    state = 'ready';
    crumbs = 0;
    overtakes = 0;
    clean = true;
    elapsed = 0;
    carry = 0;
    held = null;
    tick.intent = null;
    ahead = new Map(field.racers.map((rival) => [rival.id, false]));
    lined = true;

    emitter.emit('heat', snapshot());
  }

  function tick(dt) {
    elapsed += dt;

    const pace = heat().pace * PLAYER_PACE;
    const moved = advance(player, dt, tick.intent, { pace });
    tick.intent = null;

    if (moved.jumped) emitter.emit('jump', { racer: player, player: true });
    if (moved.landed) emitter.emit('land', { racer: player, player: true });
    if (moved.caught) emitter.emit('caught', { racer: player });

    const context = {
      track,
      all: everyone(),
      time: elapsed,
      progress: Math.min(1, player.z / track.finish),
    };

    for (const rival of field.racers) {
      if (rival.broken) continue;
      const intent = field.think(rival, dt, context);
      const was = rival.grounded;
      advance(rival, dt, intent, { pace: field.paceFor(rival, context) });
      if (was && !rival.grounded) emitter.emit('jump', { racer: rival, player: false });
      hurdles(rival);
      stones(rival);
      slicks(rival);
      tape(rival);
    }

    hurdles(player);
    stones(player);
    slicks(player);
    prizes();
    crowd();
    order();
    tape(player);
  }

  return {
    on: emitter.on,
    snapshot,

    get state() { return state; },
    get player() { return player; },
    get track() { return track; },
    get rivals() { return field ? field.racers : []; },
    get score() { return score(); },
    get heatIndex() { return index; },
    get results() { return results; },
    get outcome() { return outcome; },

    /**
     * Lay the next heat's track and put the field on the line, without
     * starting it. The page calls this so there is a race to look at behind
     * the card rather than an empty field — the start line is worth seeing.
     */
    preview(nextSeed = meetSeed) {
      if (state === 'running') return snapshot();
      lineUp(nextSeed);
      return snapshot();
    },

    /**
     * Start whatever comes next: the heat you have qualified for, or a whole
     * new meet if the last one is over. One button on the page, one door in
     * here — the page never has to know which of the two it is asking for.
     */
    play(nextSeed = meetSeed) {
      if (state === 'running') return snapshot();
      lineUp(nextSeed);
      state = 'running';
      emitter.emit('go', snapshot());
      return snapshot();
    },

    /**
     * Real seconds in, fixed ticks out. Physics at a steady 120Hz keeps a
     * hurdle a hurdle whatever the display is doing; a tab that was in the
     * background hands back a huge dt, and the clamp eats it rather than
     * teleporting the field through the tape.
     *
     * Intent is *held* until a tick spends it, which is not fussiness: a frame
     * shorter than the step runs no tick at all, and a display faster than
     * 120Hz has one of those every few frames. Handing intent straight to the
     * first tick threw away a press each time — roughly one in six on a 144Hz
     * screen, always the press you meant.
     */
    advance(dt, intent) {
      if (state !== 'running') return snapshot();
      held = hold(held, intent);
      carry = Math.min(carry + dt, STEP * MAX_STEPS);
      while (carry >= STEP) {
        carry -= STEP;
        tick.intent = held;
        held = null;
        tick(STEP);
        if (state !== 'running') break;
      }
      return snapshot();
    },
  };
}

/**
 * Fold a frame's intent into whatever is still waiting to be spent. Lane
 * presses add up, so a double tap crosses two lanes even when both taps landed
 * inside one frame; a jump and a tuck are flags, and pressing either twice
 * before a tick is still one of it.
 */
function hold(into, intent) {
  if (!intent) return into;
  const out = into ?? { left: 0, right: 0, jump: false, tuck: false };
  out.left += Number(intent.left ?? 0);
  out.right += Number(intent.right ?? 0);
  out.jump = out.jump || Boolean(intent.jump);
  out.tuck = out.tuck || Boolean(intent.tuck);
  return out;
}
