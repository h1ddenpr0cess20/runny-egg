import * as THREE from 'three';

/**
 * Nine in the morning, outdoors. Three lights and a sky to reflect, which is
 * all a field needs and rather less than the studio Marc was built in.
 *
 * There is no shadow map. A kilometre of track and seven eggs under a shadow
 * camera is a slideshow, and the thing a shadow is actually *for* here — being
 * able to read how high a jump is — is done better and for nothing by the
 * smudge `egg.js` puts on the grass directly under each egg.
 */
export function buildLights(scene) {
  const rig = new THREE.Group();
  rig.name = 'daylight';

  /** Sky above, grass below. Outdoors, half the light on anything comes up
   *  off the ground, and leaving it out is what makes a daylight scene look
   *  like a daylight scene with the lights off. */
  const sky = new THREE.HemisphereLight(0xbcd9ef, 0x6b8a44, 1.15);

  /** The sun, over the far end of the course, matching where `sky.js` draws
   *  it: light coming from somewhere the player cannot see is the fastest way
   *  to make a world feel painted. */
  const sun = new THREE.DirectionalLight(0xfff3d8, 2.35);
  sun.position.set(-6, 9, 14);

  /** And a cold one from behind, to keep the shaded side of a white egg from
   *  going to a flat grey. */
  const bounce = new THREE.DirectionalLight(0xd8e8ff, 0.42);
  bounce.position.set(5, 3, -8);

  rig.add(sky, sun, sun.target, bounce, bounce.target);
  scene.add(rig);
  return rig;
}

/**
 * What the shell reflects. Marc's material has clearcoat and sheen on it and
 * both of them are lit by the environment rather than by the lamps — with no
 * environment at all he goes matte, and a matte egg is a bean.
 *
 * It is a 64×32 canvas: warm sky, a sun blob, a horizon, and grass under it.
 * Nobody will ever see it directly; it exists to be smeared across a curve.
 */
export function buildEnvironment(scene, renderer) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    const g = ctx.createLinearGradient(0, 0, 0, 32);
    g.addColorStop(0, '#6fb0da');
    g.addColorStop(0.42, '#bcd9ef');
    g.addColorStop(0.5, '#e6eef0');
    g.addColorStop(0.54, '#7d9a55');
    g.addColorStop(1, '#4a6a30');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 32);

    ctx.fillStyle = 'rgba(255,248,225,0.95)';
    ctx.beginPath();
    ctx.ellipse(18, 7, 7, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.Texture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(texture).texture;
    /** The dome in `sky.js` is the backdrop; this one is only ever a
     *  reflection, so it is not handed to `scene.background`. */
    scene.environmentIntensity = 0.85;
    pmrem.dispose();
    texture.dispose();
  } catch {
  }
}
