import * as THREE from 'three';

import { buildEnvironment, buildLights } from './daylight.js';
import { createSky } from './sky.js';
import { THEME } from './theme.js';

/**
 * Renderer, camera, haze and sky. The art direction of this one is almost
 * entirely the fog: the track runs a kilometre in a straight line, and
 * without something to dissolve the far end into, the whole course is visible
 * from the start line and the world ends in a hard edge against the sky.
 */
export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(THEME.haze, 1);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  /** Over one, because this is a bright morning and ACES pulls the midtones
   *  down — at 1.0 the grass went the colour of a wet Tuesday. */
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  /** Starts late and ends far: near fog on a course you run straight down
   *  hides the hurdle you are meant to be reading three seconds out. */
  scene.fog = new THREE.Fog(THEME.haze, 90, 320);

  /** 52°, not the 64° this started on: a wide lens stretches whatever sits
   *  away from the middle of the frame, and what sits there is the egg. */
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 900);
  camera.position.set(0, 3.4, -9);

  buildLights(scene);
  buildEnvironment(scene, renderer);

  const sky = createSky();
  if (sky) {
    /** Big enough to sit outside everything on the course and small enough to
     *  stay inside the far plane. It travels with the camera, so its radius is
     *  only ever a number the projection has to swallow. */
    sky.object.scale.setScalar(620);
    scene.add(sky.object);
  }

  function resize() {
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    /** A tall window needs a taller lens, or the track shrinks to a thread. */
    camera.fov = camera.aspect < 1 ? 64 : 52;
    camera.updateProjectionMatrix();
  }

  resize();
  addEventListener('resize', resize);

  return {
    renderer,
    scene,
    camera,
    resize,
    tick(dt) { sky?.update(dt, camera); },
    render() { renderer.render(scene, camera); },
  };
}
