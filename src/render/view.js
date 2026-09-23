import * as THREE from 'three';

import { approach, clamp, spring } from '../core/motion.js';
import { EGG_GIRTH } from '../core/shape.js';
import { BOOST, EGG, laneX } from '../core/tuning.js';
import { createBirds } from './birds.js';
import { createEgg, createShadow, EGG_SCALE } from './egg.js';
import { createGround } from './ground.js';
import { streak } from './materials.js';
import { createDebris, createHurdle, createPickup, createSplat } from './props.js';
import { createScenery } from './scenery.js';
import { focus as aimAt, prizeSwell, rigFor, seat } from './rig.js';

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
const SQUASH = { k: 190, c: 11, step: 1 / 120, max: 0.26, stretch: -0.08, kick: 3 };

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
      /** The shadow's plane and its own material go with it — six heats of
       *  seven eggs is forty-two of each left behind otherwise. */
      runner.shadow.geometry.dispose();
      runner.shadow.material.dispose();
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

  function syncTrack(track, player, time, rig) {
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
      /**
       * Drawn at the size the framing needs it to be rather than the size it
       * is, and lifted by what it grew so a swollen crumb still sits on the
       * grass instead of half inside it. The bob rides the same number: what
       * catches an eye at forty metres is the moving thing, and on a phone
       * there is not enough of the thing for it to move by.
       */
      const swell = prizeSwell(rig, item.z - player.z);
      mesh.scale.setScalar(swell);
      mesh.position.set(
        item.x,
        item.y + (swell - 1) * 0.12 + Math.sin(time * 2.4 + item.z) * 0.08 * swell,
        item.z,
      );
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

    /** Going over is eased rather than switched, so a fall is a fall and not
     *  a frame in which the egg is suddenly lying down. */
    const over = racer.down > 0 || racer.broken ? 1 : 0;
    runner.spill = approach(runner.spill, over, racer.broken ? 4 : 9, dt);
    /** How much of the egg is still on its feet, which is how much of the run
     *  animation still has anything to say about it. */
    const upright = 1 - runner.spill;

    /**
     * Squash freely, stretch barely. The rebound of a landing used to pull the
     * shell into a capsule, and a stretched egg is not an egg — the silhouette
     * is the asset, so the spring is only allowed to flatten it.
     *
     * And it is let go of entirely as the egg goes over. The spring works
     * along the shell's own long axis, and an egg on its side has that axis
     * lying across the ground: squashing it there pulled the silhouette out
     * sideways into a shape that was not an egg from any angle, which is what
     * a hit used to do to one.
     */
    const s = clamp(runner.squash.p, SQUASH.stretch, SQUASH.max) * upright;
    /** Wider by as much as it loses in height. A shell that flattens without
     *  spreading does not read as squashed, it reads as deflating. */
    const girth = 1 / Math.sqrt(1 - s);

    /**
     * How high the middle of an egg sits: half its height on its feet, half
     * its *width* once it is over. Those are different numbers, and the
     * collider radius is a third one — using it for the fallen case put a
     * quarter of a metre of shell under the grass.
     */
    const standing = (EGG.height * racer.size) / 2;
    const fallen = EGG_GIRTH * EGG_SCALE * racer.size;

    egg.object.position.set(
      racer.x,
      /** There is nothing holding a broken one up. */
      racer.broken ? 0 : racer.y + standing * upright + fallen * runner.spill,
      racer.z,
    );

    egg.object.scale.set(girth, 1 - s, girth);
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
    /** Into it on a feather, and a little into it on a full belly. */
    const lean = ROCK.lean * (racer.boost > 0 ? 2.1 : (racer.fed > 0 ? 1.4 : 1));

    /**
     * Where the egg is and which way it is facing go on the group; the pose
     * goes on the body under it. They are split because the two shell halves
     * of a broken one hang off the same group, and they must not be tipped
     * over with the shell that broke — nor squashed by a spring that was
     * still ringing when it went.
     */
    if (running && racer.down <= 0 && !racer.broken) egg.object.rotation.y += dt * ROCK.spin;

    egg.body.rotation.set(
      running ? (lean + (racer.grounded ? 0 : -0.12) + (racer.tucked ? 0.3 : 0)) * upright : 0,
      0,
      (rock + drift + wobble) * upright + runner.spill * (Math.PI / 2),
    );

    /**
     * On the line, waiting: the egg does what Marc does, which is rock. Only
     * if it is actually standing, though — this used to overwrite the tip, so
     * the moment a heat ended every broken egg on the course sat up and bobbed
     * at half its height, sunk to the middle in the grass.
     */
    if (!running && runner.spill < 0.02) {
      egg.body.rotation.z = Math.sin(time * 1.2 + runner.phase) * 0.08;
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

    /**
     * A moment of grace is a blink, not a tint — the material is per egg but
     * the geometry is not, and a flashing egg reads from anywhere. Gone one
     * frame in three rather than every other one: at an even duty it strobed
     * for a second and a half, and what it strobed away half the time was the
     * crack it had just been given.
     */
    const blinking = racer.grace > 0 && !racer.broken;
    egg.body.visible = !blinking || Math.floor(time * 12) % 3 !== 0;

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
      if (!runner) return;
      /** Kicks land on top of each other — a fall on the same frame as the
       *  landing that caused it is two of them, and a barge in a heap is
       *  several — and an unbounded spring is what turns a shell into a
       *  pancake it never comes back from. */
      runner.squash.v = clamp(runner.squash.v + force, -SQUASH.kick, SQUASH.kick);
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
      birds.reset(scenery.perches, snapshot.track.seed);

      snapshot.racers.forEach((racer, i) => enrol(racer, i));

      shake = 0;
      placed = false;
    },

    sync(snapshot, dt, time) {
      const { track, player, racers, state } = snapshot;
      if (!track) return;

      const running = state === 'running';
      const rig = rigFor(camera.aspect);
      syncTrack(track, player, time, rig);

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
