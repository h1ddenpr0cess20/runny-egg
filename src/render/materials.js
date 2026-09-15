import * as THREE from 'three';

import { blot, glow, texture, yolkSplat } from './textures.js';
import { THEME } from './theme.js';

/**
 * Every surface on the course, shared. A heat builds a few thousand objects
 * out of about a dozen materials, and a material is a shader program — one
 * per hurdle is how a meadow becomes a slideshow.
 */
const cache = new Map();

/** Painted matte: a colour, optionally tiled with one of the painted maps. */
export function matte(color, { map = null, roughness = 0.85, metalness = 0 } = {}) {
  const key = `matte:${color}:${map}:${roughness}:${metalness}`;
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshStandardMaterial({
      color,
      map: map ? texture(map) : null,
      roughness,
      metalness,
    }));
  }
  return cache.get(key);
}

export const SURFACE = {
  turf: () => matte(0xffffff, { map: 'turf', roughness: 0.96 }),
  dirt: () => matte(0xffffff, { map: 'dirt', roughness: 0.94 }),
  cinder: () => matte(0xffffff, { map: 'cinder', roughness: 0.92 }),
  wood: () => matte(0xffffff, { map: 'wood', roughness: 0.8 }),
  bark: () => matte(0xffffff, { map: 'bark', roughness: 0.95 }),
  chalk: () => matte(THEME.chalk, { roughness: 0.9 }),
  bar: () => matte(THEME.bar, { roughness: 0.6 }),
  stripe: () => matte(THEME.barStripe, { roughness: 0.65 }),
  stone: () => matte(THEME.stone, { roughness: 0.94 }),
  root: () => matte(THEME.root, { roughness: 0.95 }),
};

/**
 * Leaves, cut out of a painted square and hung facing the camera. A tree made
 * of geometry costs a thousand triangles and reads worse at forty metres than
 * two crossed billboards, and the far side of this fence has a hundred trees
 * on it.
 */
export function foliage() {
  if (!cache.has('foliage')) {
    cache.set('foliage', new THREE.MeshStandardMaterial({
      map: texture('canopy'),
      transparent: true,
      /** Cut out rather than blended: a blended canopy sorts against itself
       *  and flickers grey holes every time the camera moves. */
      alphaTest: 0.42,
      depthWrite: true,
      roughness: 0.92,
      side: THREE.DoubleSide,
    }));
  }
  return cache.get('foliage');
}

/**
 * A crumb, a feather, a patch. Handed a little of its own light back, because
 * it has to be spotted, reached and taken at sixteen metres a second on a
 * track the colour of a plant pot, and a plain matte one is simply not there
 * in time.
 *
 * `side` is in the key rather than set on the way out. Everything here is
 * shared and cached, so a caller that reached in and flipped `.side` on the
 * material it was handed flipped it for every other prize dyed the same
 * colour — which is the sort of thing that works until a second one wants it
 * the other way.
 */
export function prize(color, glowStrength = 0.5, { side = THREE.FrontSide } = {}) {
  const key = `prize:${color}:${glowStrength}:${side}`;
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshStandardMaterial({
      color,
      emissive: new THREE.Color(color),
      emissiveIntensity: glowStrength,
      roughness: 0.4,
      metalness: 0.1,
      side,
    }));
  }
  return cache.get(key);
}

/** Paint on the ground: chalk lines and the finish, laid over the surface. */
export function marking(color = THEME.chalk) {
  const key = `mark:${color}`;
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshStandardMaterial({
      color,
      roughness: 0.88,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }));
  }
  return cache.get(key);
}

/** The smudge under an egg. */
export function shade() {
  if (!cache.has('shade')) {
    cache.set('shade', new THREE.MeshBasicMaterial({
      map: blot(),
      transparent: true,
      depthWrite: false,
      fog: true,
    }));
  }
  return cache.get('shade');
}

/**
 * What is left on the grass where an egg stopped being one.
 *
 * It sits a centimetre or two clear of the ground and takes no polygon
 * offset. It used to take a heavy one, to keep it off the turf, and that
 * pulled it forward far enough in depth to win against the two shell halves
 * lying *in* it — so the yolk drew over the shell and the shell looked like
 * frosted glass. Height beats offset here: there is nothing else within a
 * centimetre of it to fight with.
 */
export function spill() {
  if (!cache.has('spill')) {
    cache.set('spill', new THREE.MeshBasicMaterial({
      map: yolkSplat(),
      transparent: true,
      depthWrite: false,
      fog: true,
    }));
  }
  return cache.get('spill');
}

/** The heat haze a feather drags behind it. */
export function streak() {
  if (!cache.has('streak')) {
    cache.set('streak', new THREE.MeshBasicMaterial({
      map: glow(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }));
  }
  return cache.get('streak');
}

/** Flat and unlit, for bunting, birds and anything else too small to shade. */
export function flat(color, { opacity = 1, side = THREE.FrontSide } = {}) {
  const key = `flat:${color}:${opacity}:${side}`;
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      side,
    }));
  }
  return cache.get(key);
}
