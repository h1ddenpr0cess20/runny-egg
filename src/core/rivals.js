import { createRng, range } from './rng.js';
import { createRacer, toTheLine } from './racer.js';
import { fieldFor } from './roster.js';
import { AIRTIME, LANES } from './tuning.js';

/**
 * The other eggs. They do not get a physics of their own — they write the
 * same four intents your hands do and hand them to the same `advance`, which
 * is the only honest way to run a race: when one of them beats you it is
 * because it ran the hurdle better, not because it was allowed to.
 *
 * What they get instead of privileges is imperfection. Every rival has a
 * nerve, the heat has a skill, and everything below is timed, aimed and
 * decided through the product of the two: a nervous egg in the warm-up leaves
 * a hurdle far too late and hits the deck in front of everybody.
 */

/** How far ahead an egg looks for something to trip over, in seconds of run. */
const LOOK = { near: 0.42, far: 0.95 };

/** How long a decision sticks before it is allowed to change its mind. */
const THINK = { quick: 0.1, slow: 0.34 };

/** A jump is left this long before the bar, give or take a nerve. */
const LEAD = { good: 0.46, late: 0.2 };

/**
 * And how often it is left far too long. Jitter alone never produced a
 * clipped bar — the clearance window of a jump is wide enough that any lead
 * inside a reasonable spread sails over — so the mistake is modelled as the
 * mistake it is: an egg that simply did not go when it should have, and meets
 * the bar on the way up. This is where most of the wreckage in a hurdles heat
 * comes from, and it is the difference between a field and a procession.
 */
const MISTAKE = { chance: 0.13, early: 0.08, late: 0.2 };

/** The last quarter of a heat, where everybody suddenly has more. */
const KICK = { from: 0.74, gain: 0.09 };

/** How close is too close, when it is another egg in your lane. */
const TRAFFIC = { z: 3.6, lane: 2.4 };

/**
 * How often an egg moves over for no reason at all. Without this the field
 * runs the whole heat in the lanes it started in — on an empty stretch
 * nothing is ever in the way, so nothing ever moves, and five eggs hold
 * station like a formation team. Jockeying is most of the contact in a heat,
 * and contact is most of what the three cracks are for.
 */
const JOCKEY = { soonest: 2.2, latest: 6.5 };

/** How much of a look even the most nervous egg in the field takes before it
 *  moves over for no particular reason. */
const CARE = { idle: 0.4 };

function blank() {
  return { left: 0, right: 0, jump: false, tuck: false };
}

export function createField({ seed = 1, heat, lanes = LANES } = {}) {
  const rng = createRng(seed ^ 0x5eed10);
  const roster = fieldFor(Math.max(0, (heat.field ?? 6) - 1));

  /** Lane 2 is the middle one and it belongs to you; the field takes the rest,
   *  spread out from the centre so the line looks like a line. */
  const order = [...Array(lanes).keys()]
    .filter((lane) => lane !== Math.floor(lanes / 2))
    .sort((a, b) => Math.abs(a - lanes / 2) - Math.abs(b - lanes / 2));

  /**
   * A card can enter more eggs than there are lanes left for them. Two of
   * them on the same lane on the same line start the heat inside each other,
   * and `contact` reads that for exactly what it looks like: from the second
   * heat on, a pair went down and took a crack each before anybody had run a
   * metre. So the line fills, and then the rest of the field starts a row
   * behind it — far enough back that nobody is standing in anybody.
   */
  const ROW_BACK = 2.4;

  const minds = new Map();
  const racers = roster.map((entry, i) => {
    const lane = order[i % order.length];
    const row = Math.floor(i / order.length);
    const racer = createRacer({ ...entry, lane });
    toTheLine(racer, lane, heat.pace, row ? -row * ROW_BACK : 0);
    minds.set(racer.id, {
      /** Everything this egg does badly, in one number. */
      poise: Math.min(1, entry.nerve * (0.55 + heat.skill * 0.6)),
      think: 0,
      bar: -1,
      rolled: -1,
      late: -1,
      jockey: range(rng, JOCKEY.soonest, JOCKEY.latest),
      phase: range(rng, 0, Math.PI * 2),
      swing: range(rng, 0.02, 0.055),
      luck: createRng((seed ^ 0x9e37) + i * 7919),
    });
    return racer;
  });

  /** Somebody else, close enough to be a problem, in this lane. */
  function traffic(racer, lane, all) {
    for (const other of all) {
      if (other === racer || other.broken || other.finished) continue;
      if (Math.abs(other.lane - lane) > 0.5) continue;
      const gap = other.z - racer.z;
      if (gap > -TRAFFIC.lane && gap < TRAFFIC.z) return other;
    }
    return null;
  }

  function clearLane(racer, lane, track, all, from, to) {
    if (lane < 0 || lane >= lanes) return false;
    if (track.blocked(lane, from, to)) return false;
    return !traffic(racer, lane, all);
  }

  /**
   * One rival's frame of intent. Reading order is the priority order: get over
   * the bar, get out of the way of the stone, get out of the way of the egg,
   * and get back on your feet.
   */
  function think(racer, dt, { track, all }) {
    const mind = minds.get(racer.id);
    const intent = blank();
    if (!mind || racer.broken || racer.finished) return intent;

    mind.think -= dt;

    /** A hand down, if this one has the wit to put it there. */
    if (racer.stumble > 0 && racer.grounded && mind.luck() < mind.poise * 0.5) intent.tuck = true;
    if (racer.down > 0) return intent;

    const bar = track.nextHurdle(racer.z);
    if (bar) {
      /**
       * Rolled once per bar, on the tick it becomes the next one. Rolling it
       * every tick of the approach — which is what a plain `!==` guard does,
       * because the flag it checks is the flag it might not set — turned a
       * one-in-a-hundred bar into a four-in-five bar, and every hurdles heat
       * ended with the whole field on the grass.
       */
      if (mind.rolled !== bar.id) {
        mind.rolled = bar.id;
        if (mind.luck() < (1 - mind.poise) * MISTAKE.chance) mind.late = bar.id;
      }
      const blown = mind.late === bar.id;
      /**
       * How badly. A jump's clearance window opens about a fifth of the way
       * along it, so the top of this range is a trailing foot on the bar and
       * the bottom of it is a somersault — which is why a blown bar is a
       * stumble about as often as it is a wreck.
       */
      const lead = blown
        ? MISTAKE.early + (MISTAKE.late - MISTAKE.early) * mind.luck()
        : LEAD.late + (LEAD.good - LEAD.late) * mind.poise;
      const jitter = blown ? 0 : (mind.luck() - 0.5) * (1 - mind.poise) * 0.34;
      const at = racer.speed * AIRTIME * (lead + jitter);
      if (bar.z - racer.z <= at && racer.grounded && bar.id !== mind.bar) {
        intent.jump = true;
        mind.bar = bar.id;
      }
      /**
       * Off the bar and straight back down — the ones with a rhythm do this,
       * and the ones without float into the next one. Only ever with clear
       * air in front: a tuck is twenty-two metres a second downwards, and
       * pulled half a metre short of a bar it is not a landing, it is a dive
       * into one.
       */
      const clearAir = bar.z - racer.z > racer.speed * AIRTIME * 0.5;
      if (!racer.grounded && racer.vy < 0 && clearAir && mind.poise > 0.62) intent.tuck = true;
    }

    mind.jockey -= dt;
    if (mind.think > 0) return intent;
    mind.think = THINK.slow - (THINK.slow - THINK.quick) * mind.poise;

    const near = racer.z + racer.speed * LOOK.near;
    const far = racer.z + racer.speed * (LOOK.near + LOOK.far * mind.poise);
    const ahead = track.blocked(racer.lane, racer.z + 0.5, far) || traffic(racer, racer.lane, all);

    if (!ahead) {
      /** Nothing in the way, so go looking for a better lane — which is how
       *  eggs end up in each other on an empty straight. */
      if (mind.jockey > 0 || !racer.grounded) return intent;
      mind.jockey = JOCKEY.soonest + mind.luck() * (JOCKEY.latest - JOCKEY.soonest);
      const side = mind.luck() < 0.5 ? -1 : 1;
      const lane = racer.lane + side;
      if (lane < 0 || lane >= lanes) return intent;
      /**
       * Look before you move. A shoulder puts both eggs on the grass now, so
       * an idle switch into an occupied lane costs the egg making it as much
       * as it costs whoever was in it — and a field that pulled out without
       * looking four times in ten spent the meet crashing into itself.
       *
       * Nerve still shows: the poised ones check every time, the nervous ones
       * mostly. Where it still tells is the swerve below, which is the one
       * made in a panic with a stone coming.
       */
      if (mind.luck() < CARE.idle + (1 - CARE.idle) * mind.poise
        && !clearLane(racer, lane, track, all, racer.z + 0.5, near)) return intent;
      if (side < 0) intent.left += 1;
      else intent.right += 1;
      return intent;
    }

    /** Blind panic at one end of the roster and a racing line at the other:
     *  a poised egg checks both sides and takes the clear one, a nervous one
     *  guesses, and sometimes guesses into the stone it was avoiding. */
    const sides = mind.luck() < 0.5 ? [-1, 1] : [1, -1];
    for (const side of sides) {
      const lane = racer.lane + side;
      if (!clearLane(racer, lane, track, all, racer.z + 0.5, near)) continue;
      if (mind.luck() > 0.12 + mind.poise * 0.85) break;
      if (side < 0) intent.left += 1;
      else intent.right += 1;
      return intent;
    }

    /** Nowhere to go and no time: jump it and hope, which works on a stone
     *  and does nothing at all about the egg in front. */
    if (racer.grounded && mind.luck() < mind.poise * 0.35) intent.jump = true;
    return intent;
  }

  /**
   * The pace a rival is trying to run. Form sets it, a slow swing over the
   * heat churns the order, and the last quarter is where everybody suddenly
   * remembers they can go faster.
   */
  function paceFor(racer, { time, progress }) {
    const mind = minds.get(racer.id);
    if (!mind) return heat.pace;
    const swing = Math.sin(time * 0.31 + mind.phase) * mind.swing;
    const kick = progress > KICK.from ? KICK.gain * mind.poise * ((progress - KICK.from) / (1 - KICK.from)) : 0;
    return heat.pace * racer.form * (1 + swing + kick);
  }

  return {
    racers,
    think,
    paceFor,
    poiseOf(id) { return minds.get(id)?.poise ?? 0; },
  };
}
