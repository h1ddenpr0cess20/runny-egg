import { AIRTIME, LANES } from '../../src/core/tuning.js';

/**
 * A crude autopilot: jump the bar, step round the stone, stay off the other
 * eggs, and put a hand down when it wobbles. It plays worse than a person —
 * one lane of lookahead, no use of a feather it is standing on, no idea what
 * a place is — which is the point. If this thing can get round a heat without
 * breaking, the heat is fair.
 */
export function pilot(race) {
  const { player, track, rivals } = race.snapshot();
  const intent = { left: 0, right: 0, jump: false, tuck: false };
  if (player.down > 0) return intent;

  /** A hand down beats a second and a half of wobbling. */
  if (player.stumble > 0 && player.grounded) intent.tuck = true;

  const bar = track.nextHurdle(player.z);
  if (bar && player.grounded && bar.z - player.z < player.speed * AIRTIME * 0.44) {
    intent.jump = true;
    return intent;
  }

  /** Coming down off a bar, get down: the next one is already coming. */
  if (!player.grounded && player.vy < 0 && bar && bar.z - player.z > player.speed * AIRTIME) {
    intent.tuck = true;
  }

  const near = player.z + player.speed * 0.5;
  const busy = (lane) => rivals.some(
    (rival) => !rival.broken && rival.lane === lane
      && rival.z - player.z > -1.6 && rival.z - player.z < 4,
  );
  const shut = (lane) => lane < 0 || lane >= LANES
    || Boolean(track.blocked(lane, player.z + 0.4, near)) || busy(lane);

  if (!shut(player.lane)) return intent;

  for (const side of [-1, 1]) {
    if (shut(player.lane + side)) continue;
    if (side < 0) intent.left = 1;
    else intent.right = 1;
    return intent;
  }

  /** Nowhere to go: jump it and hope. Works on a stone, not on an egg. */
  if (player.grounded) intent.jump = true;
  return intent;
}

/** Run one heat out, to the tape or to `seconds`, and report what happened. */
export function runHeat(race, { seconds = 180, fps = 60, drive = pilot, seed } = {}) {
  /**
   * Yours, and the whole field's. `incidents` counts everybody's — one crude
   * autopilot's luck with the stones says nothing about whether the rest of
   * them are having a race, and it is the field that the drama is supposed to
   * come from.
   */
  const seen = { crack: 0, fall: 0, trip: 0, broke: [], overtake: 0, incidents: 0 };
  const off = [
    race.on('crack', (e) => { if (e.player) seen.crack += 1; }),
    race.on('fall', (e) => { seen.incidents += 1; if (e.player) seen.fall += 1; }),
    race.on('trip', (e) => { seen.incidents += 1; if (e.player) seen.trip += 1; }),
    race.on('break', (e) => { seen.incidents += 1; seen.broke.push(e.racer.name); }),
    race.on('overtake', () => { seen.overtake += 1; }),
  ];

  const before = race.state;
  race.play(...(seed === undefined ? [] : [seed]));
  for (let i = 0; i < seconds * fps && race.state === 'running'; i++) {
    race.advance(1 / fps, drive ? drive(race) : null);
  }
  for (const stop of off) stop();
  return { ...race.snapshot(), seen, before };
}

/** Run the whole card, or until the meet throws you out of it. */
export function runMeet(race, options = {}) {
  const card = [];
  let guard = 0;
  do {
    const heat = runHeat(race, { ...options, seed: card.length === 0 ? options.seed : undefined });
    card.push(heat.results ?? null);
    if (race.state !== 'ready') break;
  } while (guard++ < 12);
  return { ...race.snapshot(), card };
}
