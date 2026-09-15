import * as THREE from 'three';

import { cloudStrip, sunDisc } from './textures.js';
import { THEME } from './theme.js';

/**
 * The morning. A dome with the sky painted up it, a band of cloud turning
 * slowly round the outside of everything, and the sun sitting over the far
 * end of the track where the field is running.
 *
 * All of it travels with the camera, so the sky never gets any closer however
 * far down the course the race gets — which is what a sky is.
 */

function gradient() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#5fa8d8');
  g.addColorStop(0.42, '#9fcbe8');
  g.addColorStop(0.72, '#cfe4ee');
  g.addColorStop(0.88, '#dfe9ec');
  /** Under the horizon is haze rather than sky: the fog fades the far end of
   *  the course into this, and a seam there is the one thing that gives the
   *  whole trick away. */
  g.addColorStop(1, '#cfdfe2');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createSky() {
  const map = gradient();
  if (!map) return null;

  const group = new THREE.Group();
  group.name = 'sky';

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 24),
    new THREE.MeshBasicMaterial({ map, side: THREE.BackSide, depthWrite: false, fog: false }),
  );
  dome.renderOrder = -100;
  group.add(dome);

  /** Cloud, on a band round the middle rather than over the top: you are an
   *  egg on the ground and you are never going to look straight up. */
  const clouds = new THREE.Mesh(
    new THREE.CylinderGeometry(0.94, 0.94, 0.52, 48, 1, true),
    new THREE.MeshBasicMaterial({
      map: cloudStrip(),
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      fog: false,
      opacity: 0.9,
    }),
  );
  clouds.position.y = 0.2;
  clouds.renderOrder = -99;
  group.add(clouds);

  const sun = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.34),
    new THREE.MeshBasicMaterial({
      map: sunDisc(),
      color: THEME.sun,
      fog: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.AdditiveBlending,
    }),
  );
  /** Over the far end of the course, low enough to be in shot. */
  sun.position.set(-0.28, 0.3, 0.9);
  sun.lookAt(0, 0, 0);
  sun.renderOrder = -98;
  group.add(sun);

  let turn = 0;

  return {
    object: group,

    update(dt, camera) {
      group.position.copy(camera.position);
      turn += dt * 0.004;
      clouds.rotation.y = turn;
    },
  };
}
