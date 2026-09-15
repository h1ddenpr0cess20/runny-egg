/**
 * The egg profile, verbatim from Marc (github.com/h1ddenpr0cess20/marc,
 * src/client/egg/shell.js): a unit sphere's vertices pushed into a shell —
 * narrower at the top, a touch longer than it is wide. Every egg in here is
 * this function's output; nothing redraws it by hand.
 */
export function shapeEgg(positions) {
  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1];
    const taper = 1 - 0.075 * y - 0.055 * y * y;
    positions[i] *= 0.84 * taper;
    positions[i + 2] *= 0.84 * taper;
    positions[i + 1] = y * 1.03 + 0.01;
  }
  return positions;
}

/** How tall the shaped shell stands, for fitting it to the collider. */
export const EGG_HEIGHT = 2 * 1.03;

/**
 * How fat the shaped shell gets, for laying one on its side. The taper is not
 * symmetric about the middle, so the widest ring sits a little below it — and
 * this is not the collider radius either, which is smaller. Guessing one from
 * the other is what buried a fallen egg a quarter of a metre in the grass.
 */
export const EGG_GIRTH = (() => {
  let widest = 0;
  for (let i = 0; i <= 512; i++) {
    const y = -1 + (2 * i) / 512;
    const taper = 1 - 0.075 * y - 0.055 * y * y;
    widest = Math.max(widest, Math.sqrt(Math.max(0, 1 - y * y)) * 0.84 * taper);
  }
  return widest;
})();
