import * as THREE from 'three';

import { shapeEgg } from '../core/shape.js';
import { createShellSkin } from './skin.js';

/**
 * Marc's shell, verbatim from src/client/egg/shell.js: the same 128×96 sphere
 * pushed through the same profile, wearing the same physical material —
 * speckled cream, a bump off the speckles, clearcoat and sheen on top.
 *
 * The geometry and the skin are built once and shared by every egg on the
 * start line, because there are seven of them and the skin is a 2048×1024
 * canvas. What is *not* shared is the material: each egg gets its own clone
 * so it can be dyed, which is the only difference between Marc and the field.
 */
let shared = null;

function base() {
  if (shared) return shared;

  const geometry = new THREE.SphereGeometry(1, 128, 96);
  shapeEgg(geometry.attributes.position.array);
  geometry.computeVertexNormals();

  const skin = createShellSkin(THREE);

  const material = new THREE.MeshPhysicalMaterial({
    name: 'eggshell',
    color: new THREE.Color(skin.map ? '#ffffff' : '#f0e3cd'),
    map: skin.map,
    bumpMap: skin.bumpMap,
    bumpScale: 0.7,
    roughness: 0.52,
    metalness: 0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.6,
    sheen: 0.4,
    sheenColor: new THREE.Color('#fff2dd'),
  });

  shared = { geometry, material, skin };
  return shared;
}

/**
 * One shell, dyed. The tint multiplies the speckled cream rather than
 * replacing it, so Bluebell is the same egg as Marc with a wash over it —
 * the speckles still show through, which is the whole reason they are eggs
 * and not billiard balls.
 */
export function createShell(tint = 0xffffff) {
  const { geometry, material } = base();
  const mine = material.clone();
  mine.color = new THREE.Color(tint);
  const mesh = new THREE.Mesh(geometry, mine);
  mesh.name = 'shell';
  return { mesh, geometry, material: mine };
}
