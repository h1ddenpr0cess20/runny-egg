/**
 * Where the chase camera sits and what it looks at, as plain arithmetic.
 *
 * It lives apart from the rest of the renderer so the framing can be asserted
 * without a WebGL context, and there is one thing worth asserting: the camera
 * sits *behind* the egg and looks the way the egg runs, down +z. That mirrors
 * the view — world +x lands on the left of the screen — which is the whole
 * reason `laneX` descends with the lane index.
 *
 * This one sits further back and higher than the one in Eggscape did, and it
 * is not for the scenery: five lanes and seven eggs is a lot of race, and the
 * egg two lanes over that is about to come across you has to be on the screen
 * before it arrives.
 */

/**
 * Two framings. A phone held upright has a narrow, tall window: the same
 * camera puts half the screen in the sky, so it gets pulled in, lifted, and
 * tilted down until the track fills the frame again.
 *
 * `prize` is the rest of that window's problem, and it is not about the
 * framing but about the glass. A crumb is a tenth of a metre across and the
 * far half of the lane arrives in a hand's width of screen through a wider
 * lens: what is perfectly legible at a desk is two grey pixels on a phone, and
 * a pickup you can only see on the metre you pass it is not a pickup, it is
 * something you missed. So they are drawn bigger there.
 */
export const WIDE = { back: 7.6, up: 2.8, lead: 9, aim: 1.2, prize: 1 };
export const TALL = { back: 6.4, up: 3.7, lead: 5.5, aim: 0.3, prize: 1.45 };

export function rigFor(aspect) {
  return aspect < 1 ? TALL : WIDE;
}

/**
 * How much bigger than itself a pickup is drawn, this far ahead of the egg.
 *
 * It is a lie, and the sliding scale is what keeps it an honest one: at the
 * egg's feet — where the reach that actually takes the thing is measured, and
 * where you can see it perfectly well anyway — it is drawn at about its own
 * size. The swell goes on with the distance, which is the only place it is
 * needed and the one place nothing but the eye is measuring.
 */
export const PRIZE = { far: 46, grow: 0.8 };

export function prizeSwell(rig, gap) {
  const off = Math.min(1, Math.max(0, gap / PRIZE.far));
  return (rig.prize ?? 1) * (1 + PRIZE.grow * off);
}

/**
 * The seat: behind the egg, over it, leaning a little the way it is going.
 *
 * It follows the egg's lane at less than one for one, so crossing the track
 * swings the camera rather than sliding the world sideways under a fixed one
 * — and so the lanes you are not in stay in shot.
 */
export function seat(out, player, level, rig, shake = 0, rand = Math.random) {
  return out.set(
    player.x * 0.45 + (rand() - 0.5) * shake * 0.8,
    Math.max(player.y * 0.6, level) + rig.up + (rand() - 0.5) * shake * 0.5,
    player.z - rig.back,
  );
}

/** And what it aims at: down the course, ahead of the egg. */
export function focus(out, player, level, rig) {
  return out.set(player.x * 0.6, level + rig.aim, player.z + rig.lead);
}
