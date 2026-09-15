/**
 * Every number the race is tuned by, in one place. The track generator and
 * the tests both read from here, which is what keeps a hurdle a hurdle the
 * egg can actually clear: the jump's reach and rise are derived from these,
 * never guessed.
 */

export const LANES = 5;
export const LANE_WIDTH = 1.9;

/**
 * Lane index → world x. Lane 2 is the middle of a five-lane track, and lane 0
 * is the one on the left of the screen.
 *
 * It descends, which looks wrong written down and is the only thing that plays
 * right: the eggs run towards +z and the chase camera sits behind them looking
 * the same way, so the view is mirrored — world +x draws on the left. An
 * ascending mapping put lane 0 on the right, and `left` moved the egg right.
 */
export function laneX(lane) {
  return ((LANES - 1) / 2 - lane) * LANE_WIDTH;
}

/** The chalked edges of the track, which nothing is ever laid outside. */
export const TRACK_HALF = (LANES * LANE_WIDTH) / 2;

/**
 * Pace is set by the heat rather than by the metre: this is a race over a
 * measured distance, not an endless fall, so the field runs at the pace the
 * card says and the heats get faster as the meet goes on.
 *
 * Speed is eased towards its target rather than set, which buys the start of
 * a heat a run-up and makes every stumble cost the seconds it takes to wind
 * back up.
 */
export const ACCEL = 2.2;
export const PACE_FROM_STANDING = 0.42;

/**
 * You are a whisker quicker than the median of the field and slower than the
 * best of it, which is the whole shape of the game: you do not win these by
 * being fast, you win them by being the one that did not go down.
 */
export const PLAYER_PACE = 1.015;

/**
 * What multiplies the pace, and for how long. The feather runs long enough to
 * be spent rather than merely noticed: at two and a half seconds it was over
 * before the lane it bought you was any use, and the whole point of it is that
 * it is worth crossing the track for.
 */
export const BOOST = { speed: 1.34, time: 3.6 };
export const STUMBLE = { speed: 0.55, time: 0.85 };
export const DOWN = { speed: 0.1, time: 1.15 };
export const FLOAT = { jump: 1.16, gravity: 0.72, time: 7 };
export const GRIP = { time: 6 };

export const GRAVITY = 26;
export const JUMP_SPEED = 9.4;
/** A second jump exists, and it is a flail — enough to save a hurdle read
 *  badly, never enough to make one free. */
export const AIR_JUMPS = 1;
export const AIR_JUMP_SPEED = JUMP_SPEED * 0.72;
export const TUCK_SPEED = -22;

/** How long a full jump hangs, and how high it gets — the track's ruler. */
export const AIRTIME = (2 * JUMP_SPEED) / GRAVITY;
export const APEX = (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY);

export const COYOTE = 0.11;
export const JUMP_BUFFER = 0.13;
export const LANE_CHASE = 11;

/** The floor. There are no holes in this one — see `track.js`. */
export const GROUND_Y = 0;

export const EGG = { radius: 0.46, height: 1.4 };

/**
 * A hurdle: a bar on two legs, spanning every lane, low enough that a jump
 * clears it with room to spare and high enough that running at it does not.
 */
export const HURDLE = { height: 0.74, halfDepth: 0.2, graze: 0.2 };

/** A stone, a root, a divot — whatever is lying on the track to be tripped on. */
export const DEBRIS = { halfWidth: 0.5, halfDepth: 0.42, height: 0.4 };
/** A lump of debris meaner than this does not trip you, it fells you. */
export const FELLING = 0.68;

/** What a broken egg leaves behind, and how far the slick spreads. */
export const YOLK = { radius: 1.05 };

/**
 * How near a crumb has to be to count. `lift` is measured from the middle of
 * the egg rather than its feet, which is why a crumb sitting at the apex of a
 * jump is comfortably taken and one a metre above it is not.
 */
export const PICKUP = { reach: 0.95, lift: 1.2 };

export const CRACKS = 3;
/** A moment of grace after a crack, so one bump is not three. */
export const GRACE = 1.5;

/** How much track is kept live around the field. */
export const AHEAD = 190;
export const BEHIND = 55;

/**
 * Scoring. A metre is a point; the rest is what you did with it.
 */
export const SCORE = {
  perMetre: 1,
  perCrumb: 25,
  perOvertake: 15,
  clean: 150,
  meet: 1000,
  /** By finishing place, and a consolation for anyone further back. */
  place: [500, 340, 240, 170, 120, 80, 50],
  placeFloor: 30,
};

export function placeScore(place) {
  return SCORE.place[place - 1] ?? SCORE.placeFloor;
}

/**
 * The card. Six heats, each faster and fuller than the last, and each with a
 * different reason to be frightened of it — `hurdles` and `debris` are the
 * densities the track generator lays to, `skill` is how well the field runs
 * it, and `qualify` is how many of them get to run the next one.
 *
 * The final qualifies everybody who finishes it: getting there is the meet,
 * and winning it is the gold.
 */
export const HEATS = [
  {
    name: 'the warm-up', blurb: 'Six eggs, one field, nothing in the way but each other.',
    distance: 620, pace: 12.6, field: 5, hurdles: 0, debris: 0.5, skill: 0.5, qualify: 4,
  },
  {
    name: 'the flat', blurb: 'The same again, quicker, and the groundsman has been slacking.',
    distance: 760, pace: 13.6, field: 6, hurdles: 0, debris: 0.95, skill: 0.62, qualify: 4,
  },
  {
    name: 'first hurdles', blurb: 'Bars across all five lanes. There is no way round one.',
    distance: 840, pace: 14.2, field: 6, hurdles: 0.8, debris: 0.45, skill: 0.68, qualify: 3,
  },
  {
    name: 'the scramble', blurb: 'Cross country. Stones the size of your head, and a crowd.',
    distance: 920, pace: 15.1, field: 7, hurdles: 0.3, debris: 1.15, skill: 0.74, qualify: 3,
  },
  {
    name: 'high hurdles', blurb: 'A rhythm race. Land wrong once and the rest of it is arithmetic.',
    distance: 1000, pace: 15.8, field: 7, hurdles: 1, debris: 0.55, skill: 0.8, qualify: 2,
  },
  {
    name: 'the final', blurb: 'Everything the meet has, at once, in front of every bird in the county.',
    distance: 1180, pace: 16.5, field: 7, hurdles: 0.7, debris: 1.1, skill: 0.88, qualify: 7,
  },
];

export function heatAt(index) {
  return HEATS[Math.min(index, HEATS.length - 1)];
}
