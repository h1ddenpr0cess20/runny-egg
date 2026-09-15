/**
 * The field. Every egg in the race comes off this list, and the only things
 * that separate them are the three a spectator can actually see: what colour
 * they are, how big they are, and how well they run.
 *
 * The sizes are deliberately close together — nobody here is twice the egg
 * anybody else is. A big one is harder to steer round a stone and takes a
 * knock better; a small one is quicker off the mark and cracks easier. Eight
 * per cent either way is plenty to feel and not enough to be unfair.
 */

/**
 * `form` scales the pace the heat sets. `nerve` is how late they leave a
 * hurdle and how well they hold a line when something goes wrong; the heat's
 * own `skill` is multiplied through it, so the same egg runs the final better
 * than it ran the warm-up.
 */
export const ROSTER = [
  { id: 'russet', name: 'Russet', tint: 0xb87a4a, size: 1.07, form: 1.015, nerve: 0.82 },
  { id: 'bluebell', name: 'Bluebell', tint: 0x7fa7d6, size: 0.95, form: 1.025, nerve: 0.74 },
  { id: 'mint', name: 'Mint', tint: 0x9fd9b4, size: 1.0, form: 1.0, nerve: 0.9 },
  { id: 'coral', name: 'Coral', tint: 0xef9a8a, size: 0.93, form: 1.03, nerve: 0.62 },
  { id: 'clover', name: 'Clover', tint: 0xc9d67a, size: 1.05, form: 0.995, nerve: 0.86 },
  { id: 'plum', name: 'Plum', tint: 0xa98ac4, size: 0.97, form: 1.01, nerve: 0.7 },
  { id: 'soot', name: 'Soot', tint: 0x6f6a72, size: 1.08, form: 0.985, nerve: 0.95 },
];

/** Marc, who is not dyed and is not for sale. */
export const PLAYER_EGG = { id: 'marc', name: 'Marc', tint: 0xffffff, size: 1, form: 1 };

/** The `count` opponents a heat lines up, taken off the top of the list. */
export function fieldFor(count) {
  return ROSTER.slice(0, Math.max(0, Math.min(ROSTER.length, count)));
}
