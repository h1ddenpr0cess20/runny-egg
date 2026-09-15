import './styles.css';

import { createRace } from './core/race.js';
import { CRACKS } from './core/tuning.js';
import { createScene } from './render/scene.js';
import { createView } from './render/view.js';
import { readBest, writeBest } from './ui/best.js';
import { createHud, place } from './ui/hud.js';
import { createInput } from './ui/input.js';
import { createSound } from './ui/sound.js';

const seed = () => Math.floor(Math.random() * 1e6);

const stage = createScene(document.getElementById('stage'));
const view = createView(stage);
const hud = createHud(document, CRACKS);
const sound = createSound();
const race = createRace({ seed: seed() });

let best = readBest();

/** What a pickup is called when you take it. */
const NAMED = {
  feather: 'feather — go',
  straw: 'straw — sure-footed',
  puff: 'puff — light on your feet',
  patch: 'patched up',
};

/**
 * A heat has been laid and the field is on the line — which happens before
 * the gun as well as at it, because the start line is worth looking at.
 */
race.on('heat', (snapshot) => {
  view.reset(snapshot);
  view.snap();
  hud.update(snapshot);
  hud.card(snapshot, best);
});

race.on('go', () => {
  hud.running();
  sound.play('go');
});

/** Everything below is the player's egg unless it says otherwise: the field
 *  is doing all of this too, and sixty events a second of somebody else's
 *  race is a racket, not a soundtrack. */
race.on('jump', (event) => {
  if (!event.player) return;
  sound.play('jump');
});

race.on('land', (event) => {
  if (!event.player) return;
  view.kick(1.6);
  sound.play('land');
});

race.on('caught', () => {
  view.kick(1.1);
  sound.play('caught');
});

race.on('crumb', () => {
  view.kick(0.5);
  sound.play('crumb');
});

race.on('prize', (event) => {
  view.kick(1.2);
  sound.play('prize');
  hud.say(NAMED[event.kind] ?? event.kind, 'good');
});

race.on('trip', (event) => {
  if (!event.player) return;
  view.kick(1.4);
  view.jolt(0.3);
  sound.play('trip');
});

race.on('fall', (event) => {
  view.kick(2.4, event.racer.id);
  if (!event.player) return;
  view.jolt(0.8);
  sound.play('fall');
});

race.on('crack', (event) => {
  if (!event.player) return;
  view.kick(2, event.racer.id);
  view.jolt(1);
  sound.play('crack');
  /** What is left, not what is spent — and the last one says nothing, because
   *  the shell is already going and `break` has the line for it. Counting up
   *  read "1 cracks" on the first one an egg ever took. */
  const left = CRACKS - event.cracks;
  if (left === 1) hud.say('one crack left', 'bad');
  else if (left > 1) hud.say(`${left} cracks left`, 'bad');
});

/**
 * Somebody has gone. Yours ends the meet; anybody else's is the thing you
 * came to watch, and it gets its own line because you will be looking at the
 * track rather than at the egg it happened to.
 */
race.on('break', (event) => {
  view.jolt(event.player ? 1 : 0.35);
  sound.play(event.player ? 'break' : 'away', { volume: event.player ? 1 : 0.7 });
  if (!event.player) hud.say(`${event.racer.name} is out`, 'gone');
});

race.on('barge', (event) => {
  if (!event.player) return;
  view.kick(1.8);
  view.jolt(0.4);
  hud.say(`through ${event.hit.name}`, 'good');
});

race.on('overtake', (event) => {
  sound.play('overtake');
  hud.say(`past ${event.rival.name}`, 'good');
});

race.on('finish', (event) => {
  if (!event.player) return;
  sound.play('tape');
  hud.say(`${place(event.place)} across the line`, event.place === 1 ? 'good' : '');
});

race.on('results', (results) => {
  best = writeBest(results.score);
  hud.results(results, best);
});

race.on('over', () => {
  sound.play('out', { at: 0.35 });
});

function play() {
  if (race.state === 'running') return;
  race.play(seed());
  /** The press that started the heat is not also its first jump. */
  input.take();
}

const input = createInput(window, { onConfirm: play });
hud.onPlay(play);

/** Lay the first heat so there is a start line behind the card. */
race.preview(seed());

const mute = document.getElementById('mute');
function setMuted(value) {
  sound.muted = value;
  mute.textContent = value ? 'audio off' : 'audio on';
  mute.setAttribute('aria-pressed', String(value));
}
mute.addEventListener('click', (event) => {
  event.stopPropagation();
  setMuted(!sound.muted);
});
addEventListener('keydown', (event) => {
  if (event.code === 'KeyM') setMuted(!sound.muted);
});

/**
 * Real seconds go in; the race turns them into fixed ticks of its own. The
 * clamp is for the tab that was in the background for a minute — it comes
 * back to one long frame, and the field should not teleport through the tape.
 */
let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;

  const snapshot = race.advance(dt, input.take());
  view.sync(snapshot, dt, now / 1000);
  stage.tick(dt);
  if (snapshot.state === 'running') hud.update(snapshot);
  stage.render();

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
