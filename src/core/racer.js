import { approach, clamp } from './motion.js';
import {
  ACCEL, AIR_JUMPS, AIR_JUMP_SPEED, BOOST, COYOTE, DOWN, EGG, FED, FLOAT, GRAVITY,
  GROUND_Y, JUMP_BUFFER, JUMP_SPEED, LANES, LANE_CHASE, laneX, PACE_FROM_STANDING,
  STUMBLE, TUCK_SPEED,
} from './tuning.js';

const NONE = { left: 0, right: 0, jump: false, tuck: false };

/**
 * One egg in the race — yours or anybody else's. There is only one of these
 * and only one `advance`, which is the point: a rival that beats you to the
 * line did it under the same gravity, off the same jump, losing the same
 * second to the same stone. The only thing that differs is who writes the
 * intent.
 */
export function createRacer({
  id = 'egg', name = 'Egg', tint = 0xffffff, size = 1, form = 1, lane = 2, z = 0,
} = {}) {
  return {
    id,
    name,
    tint,
    size,
    form,

    lane,
    x: laneX(lane),
    y: GROUND_Y,
    z,
    vy: 0,
    /** Off the line rather than out of nowhere: a heat opens with a run-up. */
    speed: 0,

    radius: EGG.radius * size,
    height: EGG.height * size,

    grounded: true,
    tucked: false,
    airJumps: AIR_JUMPS,
    coyote: COYOTE,
    buffer: 0,

    /** Off balance, on the floor, and the moment of mercy after a crack. */
    stumble: 0,
    down: 0,
    grace: 0,
    /** How long since the last shoulder, so one barge is not twenty. */
    contact: 0,

    /** What was picked up and is still running. */
    boost: 0,
    grip: 0,
    float: 0,
    fed: 0,

    cracks: 0,
    broken: false,
    finished: false,
    time: 0,
    /** Stopped the moment the tape goes, because `time` never stops. */
    finishTime: 0,
    place: 0,
    crumbs: 0,
  };
}

/** What the pace is multiplied by right now, and nothing else touches speed. */
export function paceScale(racer) {
  if (racer.down > 0) return DOWN.speed;
  if (racer.stumble > 0) return STUMBLE.speed;
  if (racer.boost > 0) return BOOST.speed;
  if (racer.fed > 0) return FED.speed;
  return 1;
}

/**
 * One physics tick for one egg. The legs run themselves — intent only picks a
 * lane, jumps, and tucks. Returns what happened, because the race above cares
 * and the physics does not.
 *
 * Forgiveness lives here: a jump pressed just after the bar has gone under you
 * (coyote) and a jump pressed just before you land (buffer) both count, which
 * is the whole difference between a hurdles race and an argument.
 */
export function advance(racer, dt, intent, { pace = 12 } = {}) {
  const act = intent ?? NONE;

  racer.grace = Math.max(0, racer.grace - dt);
  racer.contact = Math.max(0, racer.contact - dt);
  racer.boost = Math.max(0, racer.boost - dt);
  racer.grip = Math.max(0, racer.grip - dt);
  racer.float = Math.max(0, racer.float - dt);
  racer.fed = Math.max(0, racer.fed - dt);

  /**
   * Time on the floor does not count against being off balance — you get up
   * wobbling, every time, which is what makes the second stone the dangerous
   * one rather than the first.
   */
  const wasDown = racer.down > 0;
  racer.down = Math.max(0, racer.down - dt);
  const up = wasDown && racer.down <= 0;
  if (up) racer.stumble = Math.max(racer.stumble, DOWN.rise);
  else if (!wasDown) racer.stumble = Math.max(0, racer.stumble - dt);

  const target = pace * paceScale(racer);
  /** A fall takes the speed out of an egg far faster than the egg puts it
   *  back — the whole cost of going down is the winding up afterwards. */
  racer.speed = approach(racer.speed, target, racer.down > 0 ? ACCEL * 4 : ACCEL, dt);
  racer.z += racer.speed * dt;
  racer.time += dt;

  /**
   * Lanes move by however many presses arrived, not by one a tick: two taps
   * inside a frame mean two lanes, which is what the hand that made them was
   * asking for. Flat on your face, they mean nothing at all.
   */
  const step = Number(act.right ?? 0) - Number(act.left ?? 0);
  if (step && racer.down <= 0) racer.lane = clamp(racer.lane + step, 0, LANES - 1);
  const chase = LANE_CHASE * (racer.stumble > 0 ? 0.55 : 1);
  racer.x = approach(racer.x, laneX(racer.lane), chase, dt);

  racer.buffer = act.jump ? JUMP_BUFFER : Math.max(0, racer.buffer - dt);
  if (!racer.grounded) racer.coyote = Math.max(0, racer.coyote - dt);

  let jumped = false;
  const airborne = !racer.grounded && racer.coyote <= 0;
  if (racer.down <= 0 && racer.buffer > 0 && (racer.grounded || racer.coyote > 0 || racer.airJumps > 0)) {
    if (airborne) racer.airJumps -= 1;
    /** The second one is a flail: it saves a hurdle you read late, and it
     *  never turns one into a formality. */
    racer.vy = (airborne ? AIR_JUMP_SPEED : JUMP_SPEED) * (racer.float > 0 ? FLOAT.jump : 1);
    racer.grounded = false;
    racer.tucked = false;
    racer.coyote = 0;
    racer.buffer = 0;
    jumped = true;
  }

  /**
   * The tuck does two jobs, and they are the same job: get your weight back
   * under you. In the air it drops you like a stone, which is how you come
   * off a hurdle without floating into the next one. On the floor, mid-wobble,
   * it is a hand down — the stumble is over, and it costs you the speed you
   * would have spent finishing it.
   */
  let caught = false;
  if (act.tuck && racer.down <= 0) {
    if (!racer.grounded) {
      racer.vy = Math.min(racer.vy, TUCK_SPEED);
      racer.tucked = true;
    } else if (racer.stumble > 0) {
      racer.stumble = 0;
      racer.speed *= 0.84;
      caught = true;
    }
  }

  const gravity = GRAVITY * (racer.tucked ? 1.25 : (racer.float > 0 ? FLOAT.gravity : 1));
  racer.vy -= gravity * dt;
  racer.y += racer.vy * dt;

  const was = racer.grounded;
  const tucking = racer.tucked;
  let landed = false;

  if (racer.vy <= 0 && racer.y <= GROUND_Y) {
    racer.y = GROUND_Y;
    racer.vy = 0;
    racer.grounded = true;
    racer.tucked = false;
    racer.airJumps = AIR_JUMPS;
    racer.coyote = COYOTE;
    landed = !was;
    /** Landed square out of a tuck, the wobble goes with the impact. */
    if (landed && tucking) racer.stumble = 0;
  } else {
    racer.grounded = false;
  }

  return { jumped, landed, caught, up, stuck: landed && tucking };
}

/** Knocked about but still on your feet. */
export function trip(racer, seconds = STUMBLE.time) {
  racer.stumble = Math.max(racer.stumble, seconds);
  return racer;
}

/**
 * Over you go. Everything a fall costs is here: the seconds on the floor, the
 * speed, and the crack — because an egg that hits the ground at fifteen metres
 * a second does not get up unmarked.
 *
 * What it does not cost is a second fall's worth of wobbling afterwards. The
 * stumble used to be set to the whole time on the floor, so an egg got up and
 * then lurched along at half pace for as long again — unless it knew to put a
 * hand down, which the field always did and a player mostly did not. Whatever
 * wobble brought you down is spent by the fall, and you get up with a short
 * one of your own.
 */
export function fall(racer, seconds = DOWN.time) {
  racer.down = Math.max(racer.down, seconds);
  racer.stumble = DOWN.rise;
  racer.grounded = true;
  racer.tucked = false;
  racer.y = GROUND_Y;
  racer.vy = 0;
  racer.speed *= DOWN.keep;
  return racer;
}

/**
 * Put an egg on the line, at the pace a standing start leaves it. `z` is how
 * far behind that line it goes, for a field with more eggs in it than the
 * track has lanes to put them on.
 */
export function toTheLine(racer, lane, pace, z = 0) {
  racer.lane = lane;
  racer.x = laneX(lane);
  racer.y = GROUND_Y;
  racer.z = z;
  racer.vy = 0;
  racer.speed = pace * PACE_FROM_STANDING;
  racer.grounded = true;
  racer.tucked = false;
  racer.airJumps = AIR_JUMPS;
  racer.coyote = COYOTE;
  racer.buffer = 0;
  racer.stumble = 0;
  racer.down = 0;
  racer.grace = 0;
  racer.contact = 0;
  racer.boost = 0;
  racer.grip = 0;
  racer.float = 0;
  racer.fed = 0;
  racer.cracks = 0;
  racer.broken = false;
  racer.finished = false;
  racer.time = 0;
  racer.finishTime = 0;
  racer.place = 0;
  racer.crumbs = 0;
  return racer;
}
