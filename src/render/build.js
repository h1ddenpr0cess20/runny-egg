import * as THREE from 'three';

/**
 * A box at a time, merged into one buffer. A fence is a hundred boxes and a
 * hurdle is five, and a mesh apiece over a kilometre of track is how a race
 * stops being sixty frames a second — so everything in here made of straight
 * edges is built into one geometry and drawn once.
 */
/** Face bits, in the order FACES lists them. */
export const FACE = { px: 1, nx: 2, py: 4, ny: 8, pz: 16, nz: 32 };
const ALL = 63;

export function builder() {
  const position = [];
  const normal = [];
  const uv = [];
  const index = [];

  /** Each face, as its outward normal and its four corners in winding order,
   *  written as which end of each axis the corner takes. */
  const FACES = [
    [[1, 0, 0], [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]]],
    [[-1, 0, 0], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]],
    [[0, 1, 0], [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]]],
    [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
    [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]],
    [[0, 0, -1], [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]]],
  ];

  const UV = [[0, 0], [1, 0], [1, 1], [0, 1]];

  return {
    /**
     * A box by its centre and its size. `faces` is a mask over FACES in the
     * order above — anything laid flat on the grass leaves its underside out,
     * because nothing in this world ever gets to see it.
     */
    box(cx, cy, cz, w, h, d, faces = ALL) {
      const lo = [cx - w / 2, cy - h / 2, cz - d / 2];
      const hi = [cx + w / 2, cy + h / 2, cz + d / 2];
      for (const [bit, [n, corners]] of FACES.entries()) {
        if (!(faces & (1 << bit))) continue;
        const base = position.length / 3;
        corners.forEach((corner, i) => {
          position.push(
            corner[0] ? hi[0] : lo[0],
            corner[1] ? hi[1] : lo[1],
            corner[2] ? hi[2] : lo[2],
          );
          normal.push(...n);
          uv.push(...UV[i]);
        });
        index.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      return this;
    },

    /**
     * Four corners, wound the way they are given, with one normal for the
     * lot. Boxes cover the fences and the hurdles; this covers everything at
     * an angle — a tree's crossed canopies, a bunting flag, a treeline.
     */
    quad(corners, n) {
      const base = position.length / 3;
      corners.forEach((corner, i) => {
        position.push(corner[0], corner[1], corner[2]);
        normal.push(n[0], n[1], n[2]);
        uv.push(...UV[i]);
      });
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
      return this;
    },

    /** An upright panel at `angle` about y — a canopy, a board, a flag. */
    panel(cx, cy, cz, w, h, angle = 0) {
      const dx = Math.cos(angle) * w / 2;
      const dz = Math.sin(angle) * w / 2;
      return this.quad([
        [cx - dx, cy - h / 2, cz - dz],
        [cx + dx, cy - h / 2, cz + dz],
        [cx + dx, cy + h / 2, cz + dz],
        [cx - dx, cy + h / 2, cz - dz],
      ], [Math.sin(angle), 0, -Math.cos(angle)]);
    },

    get empty() { return index.length === 0; },

    geometry() {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geometry.setIndex(index);
      return geometry;
    },
  };
}

/**
 * Textures tile by the metre, and every rail is a different length, so the
 * repeat is baked into the geometry rather than into the texture — one timber
 * texture, shared by every post and bar on the course, whatever size each is.
 */
export function tile(geometry, u, v) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * u, uv.getY(i) * v);
  uv.needsUpdate = true;
  return geometry;
}
