import * as THREE from 'three';

/**
 * Every surface in the meadow, painted onto canvases at boot. Nothing here is
 * loaded over the wire: the grass, the dirt, the cinder, the wood and the
 * clouds are all a few hundred lines of 2d context, which is why a race
 * course this size is still a page and not a download.
 */

const cache = new Map();

function paint(size, draw, { height = size } = {}) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  draw(ctx, size, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  /** The track is looked at almost edge-on for the whole race, which is
   *  exactly where a mipmap gives up. Worth the samples. */
  texture.anisotropy = 16;
  return texture;
}

/** Specks, for anything that is meant to look like it grew or was dug. */
function fleck(ctx, size, count, colours, radius = 3) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colours[(Math.random() * colours.length) | 0];
    const r = 0.6 + Math.random() * radius;
    ctx.beginPath();
    ctx.ellipse(Math.random() * size, Math.random() * size, r, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Turf. Blades rather than noise: a field of short strokes all leaning the
 * same way, because mown grass has a nap and a flat green rectangle reads as
 * a snooker table from the first frame.
 */
function turf(ctx, size) {
  ctx.fillStyle = '#6f9445';
  ctx.fillRect(0, 0, size, size);

  /** The mower's stripes, which are the only reason a field reads as a field
   *  and not as a colour — they run with the track, so they run with you. */
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(0, (i * size) / 4, size, size / 4);
  }

  ctx.lineWidth = 1.1;
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 3 + Math.random() * 7;
    const lean = (Math.random() - 0.5) * 3;
    const shade = Math.random();
    ctx.strokeStyle = shade < 0.34
      ? 'rgba(62,94,42,0.55)'
      : (shade < 0.72 ? 'rgba(126,160,82,0.5)' : 'rgba(163,190,106,0.42)');
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + lean, y - len);
    ctx.stroke();
  }

  /** A daisy here and there, because somebody has to be optimistic. */
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = Math.random() < 0.6 ? 'rgba(250,250,240,0.8)' : 'rgba(246,222,120,0.75)';
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, 1.4 + Math.random() * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Bare dirt, raked along the run and trodden in. */
function dirt(ctx, size) {
  ctx.fillStyle = '#9c7c52';
  ctx.fillRect(0, 0, size, size);

  ctx.lineWidth = 1.6;
  for (let i = 0; i < 300; i++) {
    const y = Math.random() * size;
    ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(122,94,60,0.45)' : 'rgba(184,155,112,0.4)';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.3, y + (Math.random() - 0.5) * 8, size * 0.7, y + (Math.random() - 0.5) * 8, size, y);
    ctx.stroke();
  }
  fleck(ctx, size, 700, ['rgba(88,68,44,0.4)', 'rgba(206,182,142,0.34)', 'rgba(130,112,80,0.4)'], 3.4);

  /** Grit, and the odd stone too small to trip anybody. */
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = 'rgba(150,144,132,0.55)';
    ctx.beginPath();
    ctx.ellipse(Math.random() * size, Math.random() * size, 1 + Math.random() * 2.4, 1 + Math.random() * 1.6, Math.random(), 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Cinder: the red stuff they lay where the running actually matters. */
function cinder(ctx, size) {
  ctx.fillStyle = '#a8613f';
  ctx.fillRect(0, 0, size, size);
  fleck(ctx, size, 1500, [
    'rgba(132,70,44,0.42)', 'rgba(196,124,92,0.36)', 'rgba(88,48,32,0.35)', 'rgba(214,158,126,0.3)',
  ], 2.6);
  ctx.lineWidth = 1;
  for (let i = 0; i < 160; i++) {
    const y = Math.random() * size;
    ctx.strokeStyle = 'rgba(150,84,58,0.3)';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (Math.random() - 0.5) * 4);
    ctx.stroke();
  }
}

/** Sawn timber, for the rails and the posts and the legs of a hurdle. */
function wood(ctx, size) {
  ctx.fillStyle = '#a87f4e';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 40; i++) {
    const y = (i / 40) * size + (Math.random() - 0.5) * 4;
    ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(126,92,54,0.5)' : 'rgba(196,158,110,0.4)';
    ctx.lineWidth = 1 + Math.random() * 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.35, y + (Math.random() - 0.5) * 12, size * 0.7, y + (Math.random() - 0.5) * 12, size, y);
    ctx.stroke();
  }

  /** A couple of knots, which is what stops it reading as corduroy. */
  for (let i = 0; i < 3; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    for (let r = 12; r > 0; r -= 2.5) {
      ctx.strokeStyle = `rgba(104,74,42,${0.1 + (12 - r) * 0.035})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.62, 0.4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  fleck(ctx, size, 200, ['rgba(88,62,36,0.3)', 'rgba(214,182,136,0.25)'], 2);
}

/** Bark, for the trunks on the far side of the fence. */
function bark(ctx, size) {
  ctx.fillStyle = '#6d5439';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * size;
    ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(48,36,24,0.5)' : 'rgba(126,102,72,0.4)';
    ctx.lineWidth = 1 + Math.random() * 4;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + (Math.random() - 0.5) * 20, size * 0.4, x + (Math.random() - 0.5) * 20, size * 0.7, x, size);
    ctx.stroke();
  }
  fleck(ctx, size, 260, ['rgba(40,30,20,0.35)', 'rgba(146,124,92,0.25)', 'rgba(96,110,74,0.2)'], 3);
}

/** A tree's worth of leaves, on a transparent square, hung as a billboard. */
function canopy(ctx, size) {
  ctx.clearRect(0, 0, size, size);
  const mid = size / 2;
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * Math.PI * 2;
    /** Denser in the middle, so the silhouette has a body and a ragged edge. */
    const r = (Math.random() ** 0.62) * mid * 0.96;
    const x = mid + Math.cos(a) * r;
    const y = mid + Math.sin(a) * r * 0.86;
    const shade = Math.random();
    ctx.fillStyle = shade < 0.3
      ? 'rgba(56,86,40,0.95)'
      : (shade < 0.7 ? 'rgba(84,128,58,0.92)' : 'rgba(123,163,82,0.9)');
    ctx.beginPath();
    ctx.ellipse(x, y, 4 + Math.random() * 9, 3 + Math.random() * 6, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The clouds, painted once across a strip that wraps round the sky. */
function clouds(ctx, size, height) {
  ctx.clearRect(0, 0, size, height);

  for (let i = 0; i < 26; i++) {
    const cx = Math.random() * size;
    const cy = height * (0.25 + Math.random() * 0.55);
    const scale = 0.5 + Math.random() * 1.3;
    for (let puff = 0; puff < 16; puff++) {
      const px = cx + (Math.random() - 0.5) * 150 * scale;
      const py = cy + (Math.random() - 0.5) * 32 * scale;
      const r = (16 + Math.random() * 34) * scale;
      /** Bright on top, grey underneath — a cloud lit from above is the only
       *  thing in the sky that says which way up the world is. */
      const lift = py < cy ? 1 : 0.82;

      /**
       * Painted three times, a canvas width apart. The strip is wrapped round
       * a cylinder, so a puff that runs off one edge has to come back on the
       * other — without this there is a hard vertical seam hanging in the sky
       * exactly where the texture joins itself.
       */
      for (const wrap of [-size, 0, size]) {
        const g = ctx.createRadialGradient(px + wrap, py, 0, px + wrap, py, r);
        g.addColorStop(0, `rgba(${255 * lift | 0},${253 * lift | 0},${250 * lift | 0},0.5)`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px + wrap, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** And faded out top and bottom, so the band the cloud lives on does not
   *  announce where it stops. */
  ctx.globalCompositeOperation = 'destination-out';
  const fade = ctx.createLinearGradient(0, 0, 0, height);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.22, 'rgba(0,0,0,0)');
  fade.addColorStop(0.8, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, size, height);
  ctx.globalCompositeOperation = 'source-over';
}

const PAINTERS = { turf, dirt, cinder, wood, bark, canopy };

/** One texture per surface, for the whole meet. */
export function texture(name) {
  if (!cache.has(name)) cache.set(name, paint(name === 'canopy' ? 256 : 512, PAINTERS[name]));
  return cache.get(name);
}

function clamped(key, size, draw, options) {
  if (cache.has(key)) return cache.get(key);
  const made = paint(size, draw, options);
  if (made) {
    made.wrapS = THREE.ClampToEdgeWrapping;
    made.wrapT = THREE.ClampToEdgeWrapping;
  }
  cache.set(key, made);
  return made;
}

export function cloudStrip() {
  const key = 'clouds';
  if (cache.has(key)) return cache.get(key);
  const made = paint(1024, clouds, { height: 256 });
  if (made) {
    made.wrapS = THREE.RepeatWrapping;
    made.wrapT = THREE.ClampToEdgeWrapping;
  }
  cache.set(key, made);
  return made;
}

/**
 * The smudge an egg drops on the grass. The sun in here casts no real shadow
 * — there is one directional light and no shadow map, because a shadow map
 * over a kilometre of track is a slideshow — so this is the instrument as
 * much as the scenery: without it the height of a jump is unreadable.
 */
export function blot() {
  return clamped('blot', 128, (ctx, size) => {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(30,40,22,0.62)');
    g.addColorStop(0.45, 'rgba(30,40,22,0.32)');
    g.addColorStop(1, 'rgba(30,40,22,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
}

/** What is left of an egg that did not finish. */
export function yolkSplat() {
  return clamped('yolk', 256, (ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    const mid = size / 2;

    /** The white first, thin and wide and ragged. */
    ctx.fillStyle = 'rgba(250,246,228,0.72)';
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const r = mid * (0.62 + Math.sin(a * 3.1) * 0.12 + Math.sin(a * 7.3) * 0.07);
      const x = mid + Math.cos(a) * r;
      const y = mid + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.fill();

    /** A few thrown drops beyond it. */
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = mid * (0.6 + Math.random() * 0.36);
      ctx.fillStyle = 'rgba(250,246,228,0.5)';
      ctx.beginPath();
      ctx.arc(mid + Math.cos(a) * r, mid + Math.sin(a) * r, 2 + Math.random() * 6, 0, Math.PI * 2);
      ctx.fill();
    }

    /** And the yolk, sitting proud in the middle of it. */
    const g = ctx.createRadialGradient(mid - 8, mid - 8, 2, mid, mid, mid * 0.34);
    g.addColorStop(0, 'rgba(255,214,110,0.98)');
    g.addColorStop(0.7, 'rgba(246,179,43,0.96)');
    g.addColorStop(1, 'rgba(214,142,26,0.9)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(mid, mid, mid * 0.33, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** The sun, and the haze around it. A bare disc reads as a hole. */
export function sunDisc() {
  return clamped('sun', 128, (ctx, size) => {
    const mid = size / 2;
    const halo = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
    halo.addColorStop(0, 'rgba(255,250,232,1)');
    halo.addColorStop(0.28, 'rgba(255,246,214,0.92)');
    halo.addColorStop(0.42, 'rgba(255,240,196,0.34)');
    halo.addColorStop(0.72, 'rgba(255,236,186,0.09)');
    halo.addColorStop(1, 'rgba(255,236,186,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, size, size);
  });
}

/** The soft ring of light a boost drags behind it. */
export function glow() {
  return clamped('glow', 128, (ctx, size) => {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,226,140,0.85)');
    g.addColorStop(0.5, 'rgba(255,200,80,0.28)');
    g.addColorStop(1, 'rgba(255,190,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
}
