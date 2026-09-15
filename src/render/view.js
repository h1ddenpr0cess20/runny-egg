import * as THREE from 'three';

import { approach, clamp, spring } from '../core/motion.js';
import { BOOST, EGG, laneX } from '../core/tuning.js';
import { createBirds } from './birds.js';
import { createEgg, createShadow, EGG_SCALE } from './egg.js';
import { createGround } from './ground.js';
import { streak } from './materials.js';
import { createDebris, createHurdle, createPickup, createSplat } from './props.js';
import { createScenery } from './scenery.js';
import { focus as aimAt, rigFor, seat } from './rig.js';

const CHASE = 6;
const DRAW = { behind: 22, ahead: 150 };

/** How hard a shell rocks while it runs, and how fast. */
const ROCK = { amount: 0.08, speed: 11, lean: 0.13, spin: 0.45 };

/**
 * The squash spring, and the step it is integrated at. It is explicit Euler,
 * so a long frame does not slow it down — it blows it up: one 250ms hitch and
 * the shell pins at its limits and stays there, wobbling between a pancake and
 * a capsule. Sub-stepping is the whole fix, and it matters because the
 * silhouette is the asset.
 */
const SQUASH = { k: 190, c: 11, step: 1 / 120, max: 0.4, stretch: -0.08 };

/** Which prop stands in for which lump on the track. */
const LUMP = { boulder: 'boulder', root: 'root', divot: 'root', stone: 'rock', clod: 'rock' };

function createPool(scene, make) {
  const items = [];
  let cursor = 0;

  return {
    begin() { cursor = 0; },
    take() {
      let item = items[cursor];
      if (!item) {
        item = make();
        items[cursor] = item;
        scene.add(item);
      }
      item.visible = true;
      cursor += 1;
      return item;
    },
    end() { for (let i = cursor; i < items.length; i++) items[i].visible = false; },
  };
}

/**
 * The one place that knows both the race and the scene graph. Everything it
 * draws comes off a snapshot — it holds no state the race depends on, so a
 * new heat is a `reset()` and nothing more.
 */
export function createView({ scene, camera }) {
  const birds = createBirds(scene);

  const hurdles = createPool(scene, createHurdle);
  const lumps = {
    rock: createPool(scene, () => createDebris('rock')),
    boulder: createPool(scene, () => createDebris('boulder')),
    root: createPool(scene, () => createDebris('root')),
  };
  const prizes = {};
  for (const kind of ['crumb', 'feather', 'straw', 'puff', 'patch']) {
    prizes[kind] = createPool(scene, () => createPickup(kind));
  }
  const splats = createPool(scene, createSplat);

  /** One of these per egg on the line, keyed by who it is. */
  const runners = new Map();

  const trail = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), streak());
  trail.visible = false;
  scene.add(trail);

  let ground = null;
  let scenery = null;
  let placed = false;
  let shake = 0;

  const target = new THREE.Vector3();
  const aim = new THREE.Vector3();

  function clearRunners() {
    for (const runner of runners.values()) {
      scene.remove(runner.egg.object, runner.shadow);
      runner.egg.dispose();
    }
    runners.clear();
  }

  /** Build the egg for one racer, once, and keep it for the heat. */
  function enrol(racer, index) {
    const egg = createEgg({ tint: racer.tint, size: racer.size, seed: index * 7919 + 13 });
    const shadow = createShadow();
    scene.add(egg.object, shadow);
    const runner = {
      egg,
      shadow,
      squash: { p: 0, v: 0 },
      /** So the whole field does not rock in step like a chorus line. */
      phase: index * 1.7,
      spill: 0,
      cracks: -1,
      broken: false,
    };
    runners.set(racer.id, runner);
    return runner;
  }

  function syncTrack(track, player, time) {
    hurdles.begin();
    for (let i = track.seek(track.hurdles, player.z - DRAW.behind); i < track.hurdles.length; i++) {
      const bar = track.hurdles[i];
      if (bar.z > player.z + DRAW.ahead) break;
      hurdles.take().position.set(0, 0, bar.z);
    }
    hurdles.end();

    for (const pool of Object.values(lumps)) pool.begin();
    for (let i = track.seek(track.debris, player.z - DRAW.behind); i < track.debris.length; i++) {
      const lump = track.debris[i];
      if (lump.z > player.z + DRAW.ahead) break;
      const mesh = lumps[LUMP[lump.kind] ?? 'rock'].take();
      /** Bigger is meaner, and it is meant to look it — the size on the
       *  grass is the same number the race resolves the trip with. */
      mesh.scale.setScalar(0.7 + lump.bite * 0.75);
      mesh.position.set(lump.x, lump.hit ? -0.04 : 0, lump.z);
      mesh.rotation.y = lump.id * 1.37;
    }
    for (const pool of Object.values(lumps)) pool.end();

    for (const pool of Object.values(prizes)) pool.begin();
    for (let i = track.seek(track.pickups, player.z - DRAW.behind); i < track.pickups.length; i++) {
      const item = track.pickups[i];
      if (item.z > player.z + DRAW.ahead) break;
      if (item.taken) continue;
      const mesh = prizes[item.kind]?.take();
      if (!mesh) continue;
      mesh.position.set(item.x, item.y + Math.sin(time * 2.4 + item.z) * 0.08, item.z);
      /** Crumbs sit still on the ground; the rest turn, because the rest are
       *  worth crossing the track for and have to say so. */
      if (item.kind === 'crumb') mesh.rotation.set(0.4, item.z, 0.2);
      else mesh.rotation.set(0, time * 1.6 + item.z, Math.sin(time + item.z) * 0.15);
    }
    for (const pool of Object.values(prizes)) pool.end();

    splats.begin();
    for (const splat of track.splats) {
      if (splat.z < player.z - DRAW.behind || splat.z > player.z + DRAW.ahead) continue;
      const mesh = splats.take();
      mesh.position.set(splat.x, 0.035, splat.z);
      mesh.rotation.z = splat.id * 2.2;
    }
    splats.end();
  }

  /**
   * One egg, drawn. Everything about how a racer is doing is on the egg
   * itself: how far over it is leaning, how hard it is rocking, how many
   * cracks are drawn on the shell, and whether it is still on its feet.
   */
  function syncEgg(racer, runner, dt, time, running) {
    const { egg } = runner;

    for (let left = Math.min(dt, 0.25); left > 0; left -= SQUASH.step) {
      spring(runner.squash, SQUASH.k, SQUASH.c, Math.min(SQUASH.step, left), 0);
    }
    /**
     * Squash freely, stretch barely. The rebound of a landing used to pull the
     * shell into a capsule, and a stretched egg is not an egg — the silhouette
     * is the asset, so the spring is only allowed to flatten it.
     */
    const s = clamp(runner.squash.p, SQUASH.stretch, SQUASH.max);

    /** Going over is eased rather than switched, so a fall is a fall and not
     *  a frame in which the egg is suddenly lying down. */
    const over = racer.down > 0 || racer.broken ? 1 : 0;
    runner.spill = approach(runner.spill, over, racer.broken ? 4 : 9, dt);

    const lying = runner.spill * (Math.PI / 2);
    const height = EGG.height * racer.size;
    egg.object.position.set(
      racer.x,
      racer.y + (height / 2) * (1 - runner.spill) + racer.radius * 0.7 * runner.spill,
      racer.z,
    );

    egg.object.scale.set(1 + s * 0.4, 1 - s, 1 + s * 0.4);
    egg.object.scale.multiplyScalar(EGG_SCALE * racer.size);

    /**
     * The shell stays upright while it is running. An egg tumbling end over
     * end is a shape you cannot read — half the time it is pointing at you —
     * and the silhouette, fat end down, is the whole asset. So it rocks, and
     * it turns on the spot, and it leans into the lane it is crossing to.
     *
     * The one thing that does put it over is going down, which is the point:
     * an egg on its side is an egg in trouble, readable from the back of the
     * field at a glance.
     */
    const pace = racer.speed / 14;
    const rocking = running && racer.grounded && racer.down <= 0;
    const rock = rocking ? Math.sin(time * ROCK.speed * pace + runner.phase) * ROCK.amount : 0;
    /** A wobble is a rock that has got away from it. */
    const wobble = racer.stumble > 0 && racer.down <= 0
      ? Math.sin(time * 19 + runner.phase) * 0.22
      : 0;
    const drift = clamp((laneX(racer.lane) - racer.x) * -0.42, -0.4, 0.4);
    const lean = racer.boost > 0 ? ROCK.lean * 2.1 : ROCK.lean;

    egg.object.rotation.set(
      running ? lean + (racer.grounded ? 0 : -0.12) + (racer.tucked ? 0.3 : 0) : 0,
      egg.object.rotation.y + (running && racer.down <= 0 ? dt * ROCK.spin : 0),
      rock + drift + wobble + lying,
    );

    if (!running) {
      /** On the line, waiting: the egg does what Marc does, which is rock. */
      egg.object.rotation.z = Math.sin(time * 1.2 + runner.phase) * 0.08;
      egg.object.position.y += Math.sin(time * 1.5 + runner.phase) * 0.04;
    }

    if (runner.cracks !== racer.cracks) {
      runner.cracks = racer.cracks;
      egg.cracks(racer.cracks);
    }
    if (runner.broken !== racer.broken) {
      runner.broken = racer.broken;
      egg.broken(racer.broken);
    }

    /** A moment of grace is a blink, not a tint — the material is per egg but
     *  the geometry is not, and a flashing egg reads from anywhere. */
    egg.body.visible = racer.grace <= 0 || Math.floor(time * 14) % 2 === 0;

    const lift = Math.max(0, racer.y);
    runner.shadow.visible = !racer.broken;
    runner.shadow.position.set(racer.x, 0.025, racer.z);
    runner.shadow.scale.setScalar(clamp(racer.size * (1 - lift * 0.12), 0.45, 1.15));
    runner.shadow.material.opacity = clamp(1 - lift * 0.1, 0.35, 1);
  }

  return {
    /** A landing, a pickup and a crack all read as a kick in the springs. */
    kick(force, id = 'marc') {
      const runner = runners.get(id);
      if (runner) runner.squash.v += force;
    },
    jolt(force) { shake = Math.min(1, shake + force); },

    /**
     * Cut to the field rather than chase it — used when a heat is laid and
     * everybody is suddenly somewhere else.
     */
    snap() { placed = false; },

    /**
     * A new heat. The track is a kilometre of geometry and the field is up to
     * seven eggs, and all of it is thrown away and rebuilt, because that is
     * cheaper to be sure of than it is to reuse.
     */
    reset(snapshot) {
      ground?.dispose();
      scenery?.dispose();
      if (ground) scene.remove(ground.object);
      if (scenery) scene.remove(scenery.object);
      clearRunners();

      ground = createGround(snapshot.track);
      scenery = createScenery(snapshot.track);
      scene.add(ground.object, scenery.object);
      birds.reset(scenery.perches);

      snapshot.racers.forEach((racer, i) => enrol(racer, i));

      shake = 0;
      placed = false;
    },

    sync(snapshot, dt, time) {
      const { track, player, racers, state } = snapshot;
      if (!track) return;

      const running = state === 'running';
      syncTrack(track, player, time);

      for (const [i, racer] of racers.entries()) {
        const runner = runners.get(racer.id) ?? enrol(racer, i);
        syncEgg(racer, runner, dt, time, running);
      }

      birds.sync(player, time);

      /** The streak a feather drags, laid flat behind the egg it belongs to. */
      trail.visible = player.boost > 0 && !player.broken;
      if (trail.visible) {
        trail.position.set(player.x, player.y + 0.5, player.z - 1.4);
        trail.lookAt(camera.position);
        const left = player.boost / BOOST.time;
        trail.scale.setScalar(0.8 + left * 0.7);
        trail.material.opacity = Math.min(1, left * 1.8);
      }

      shake = approach(shake, 0, 6, dt);

      const rig = rigFor(camera.aspect);
      seat(target, player, 0, rig, shake);
      if (placed) camera.position.lerp(target, 1 - Math.exp(-dt * CHASE));
      else {
        camera.position.copy(target);
        placed = true;
      }

      camera.lookAt(aimAt(aim, player, 0, rig));
    },
  };
}
