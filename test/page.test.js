import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { HEATS } from '../src/core/tuning.js';
import { readBest, writeBest } from '../src/ui/best.js';
import { createHud, place } from '../src/ui/hud.js';
import { loadPage } from './helpers/dom.js';

function fakeStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
  };
}

function snapshot(over = {}) {
  return {
    state: 'running',
    heat: HEATS[2],
    heatIndex: 2,
    heats: HEATS.length,
    last: false,
    place: 3,
    field: 6,
    score: 4604,
    remaining: 287.6,
    time: 14.42,
    cracks: 1,
    crumbs: 9,
    player: { boost: 0, grip: 0, float: 0 },
    ...over,
  };
}

function results(over = {}) {
  return {
    heat: HEATS[2],
    heatIndex: 2,
    place: 2,
    time: 58.7,
    crumbs: 21,
    overtakes: 4,
    cracks: 1,
    clean: false,
    earned: 1320,
    score: 4604,
    outcome: 'advance',
    qualified: true,
    champion: false,
    last: false,
    standings: [
      { id: 'mint', name: 'Mint', tint: 0x9fd9b4, place: 1, finished: true, broken: false, time: 57.1, z: 840, you: false },
      { id: 'marc', name: 'Marc', tint: 0xffffff, place: 2, finished: true, broken: false, time: 58.7, z: 840, you: true },
      { id: 'soot', name: 'Soot', tint: 0x6f6a72, place: 3, finished: false, broken: false, time: 58.7, z: 702, you: false },
      { id: 'plum', name: 'Plum', tint: 0xa98ac4, place: 0, finished: false, broken: true, time: 31.2, z: 410, you: false },
    ],
    ...over,
  };
}

describe('page', () => {
  it('carries every element the HUD writes to', async () => {
    const page = await loadPage();
    for (const id of ['stage', 'place', 'heat', 'togo', 'time', 'score', 'cracks', 'effects',
      'callout', 'overlay', 'overlay-kicker', 'overlay-sub', 'overlay-lead', 'overlay-stats',
      'overlay-board', 'play', 'mute']) {
      assert.ok(page.document.getElementById(id), `#${id} is missing from index.html`);
    }
    page.close();
  });

  it('loads nothing but the module that boots the race', async () => {
    const page = await loadPage();
    const scripts = [...page.document.querySelectorAll('script')];
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0].type, 'module');
    assert.equal(scripts[0].getAttribute('src'), '/src/main.js');
    page.close();
  });

  it('tells a phone what to do with its thumb', async () => {
    const page = await loadPage();
    assert.ok(page.$('#keys .touch'), 'no touch instructions on the card');
    assert.match(page.$('#keys').textContent, /tuck/i);
    page.close();
  });
});

describe('hud', () => {
  it('writes the race onto the readouts', async () => {
    const page = await loadPage();
    const hud = createHud(page.document, 3);

    hud.update(snapshot());
    assert.equal(page.$('#place').textContent, '3rd of 6');
    assert.equal(page.$('#heat').textContent, '3/6 first hurdles');
    assert.equal(page.$('#togo').textContent, '288m');
    assert.equal(page.$('#time').textContent, '14.4s');
    assert.equal(page.$('#score').textContent, '4604');
    page.close();
  });

  it('draws the shell as what is left of it, not as what is gone', async () => {
    const page = await loadPage();
    const hud = createHud(page.document, 3);

    hud.update(snapshot({ cracks: 0 }));
    assert.equal(page.$('#cracks').textContent.length, 3);
    assert.equal(page.$('#cracks').querySelector('.spent').textContent.length, 0);

    hud.update(snapshot({ cracks: 2 }));
    assert.equal(page.$('#cracks').textContent.length, 3, 'the shell changed size');
    assert.equal(page.$('#cracks').querySelector('.spent').textContent.length, 2);
    page.close();
  });

  it('shows what was picked up, for as long as it lasts', async () => {
    const page = await loadPage();
    const hud = createHud(page.document, 3);

    hud.update(snapshot());
    assert.equal(page.$('#effects').textContent, '');

    hud.update(snapshot({ player: { boost: 2.1, grip: 0, float: 5.5 } }));
    const text = page.$('#effects').textContent;
    assert.match(text, /feather 2\.1/);
    assert.match(text, /puff 5\.5/);
    assert.doesNotMatch(text, /straw/, 'it announced straw nobody is standing on');
    page.close();
  });

  it('opens on the heat card, with the distance and what gets you through', async () => {
    const page = await loadPage();
    const hud = createHud(page.document, 3);

    hud.card(snapshot({ heatIndex: 0, heat: HEATS[0] }), 0);
    assert.equal(page.$('#overlay').hidden, false);
    assert.equal(page.$('#overlay').dataset.state, 'ready');
    assert.match(page.$('#overlay-kicker').textContent, /heat 1 of 6/i);
    assert.equal(page.$('#overlay-sub').textContent, HEATS[0].name);
    assert.equal(page.$('#overlay-lead').textContent, HEATS[0].blurb);
    assert.equal(page.$('#overlay-board').hidden, true, 'a board before anybody has run');
    assert.match(page.$('#overlay-stats').textContent, /620m/);
    assert.match(page.$('#overlay-stats').textContent, /TOP 4|top 4/i);
    assert.equal(page.$('#play').textContent, 'on your marks');

    hud.card(snapshot({ heatIndex: 2 }), 900);
    assert.match(page.$('#overlay-stats').textContent, /900/, 'the best score went missing');
    assert.equal(page.$('#play').textContent, 'next heat');
    page.close();
  });

  it('says the whole field gets through the final', async () => {
    const page = await loadPage();
    const hud = createHud(page.document, 3);
    hud.card(snapshot({ heatIndex: 5, heat: HEATS[5], last: true }), 0);
    assert.match(page.$('#overlay-stats').textContent, /all who finish/i);
    page.close();
  });

  it('gets out of the way while a heat is being run', async () => {
    const page = await loadPage();
    const hud = createHud(page.document, 3);
    hud.running();
    assert.equal(page.$('#overlay').hidden, true);
    page.close();
  });

  it('puts the whole field on the board, in order, with you marked', async () => {
    const page = await loadPage();
    const hud = createHud(page.document, 3);

    hud.results(results(), 4000);
    const board = page.$('#overlay-board');
    assert.equal(board.hidden, false);
    assert.equal(board.children.length, 4);

    const rows = [...board.children];
    assert.match(rows[0].textContent, /1st\s*Mint/);
    assert.ok(rows[1].classList.contains('you'), 'your own row is not marked');
    assert.match(rows[1].textContent, /Marc/);
    /** Somebody still out on the track is shown by how much of it is left,
     *  not by how much of it they got through. */
    assert.match(rows[2].textContent, /138m short/);
    assert.ok(rows[3].classList.contains('broken'));
    assert.match(rows[3].textContent, /did not finish/);
    page.close();
  });

  it('reports the heat back, and says whether you are through', async () => {
    const page = await loadPage();
    const hud = createHud(page.document, 3);

    hud.results(results(), 4000);
    assert.equal(page.$('#overlay').dataset.state, 'through');
    assert.match(page.$('#overlay-kicker').textContent, /through/i);
    assert.equal(page.$('#play').textContent, 'next heat');
    const stats = page.$('#overlay-stats').textContent;
    for (const value of ['58.7s', '21', '4', '4604']) assert.match(stats, new RegExp(value));

    hud.results(results({ outcome: 'broken', place: 0, qualified: false }), 4000);
    assert.equal(page.$('#overlay').dataset.state, 'out');
    assert.match(page.$('#overlay-kicker').textContent, /scrambled/i);
    assert.match(page.$('#overlay-sub').textContent, /did not finish/i);

    hud.results(results({ outcome: 'champion', place: 1, last: true }), 4000);
    assert.match(page.$('#overlay-kicker').textContent, /gold/i);
    page.close();
  });

  it('calls out what just happened, then takes it away', async () => {
    const page = await loadPage();
    const hud = createHud(page.document, 3);

    assert.equal(page.$('#callout').hidden, true);
    hud.say('Plum is out', 'gone');
    assert.equal(page.$('#callout').hidden, false);
    assert.equal(page.$('#callout').textContent, 'Plum is out');
    assert.equal(page.$('#callout').className, 'gone');
    page.close();
  });

  it('starts a heat from the button', async () => {
    const page = await loadPage();
    const hud = createHud(page.document, 3);
    let started = 0;
    hud.onPlay(() => { started += 1; });
    page.$('#play').dispatchEvent(new page.window.MouseEvent('click', { bubbles: true }));
    assert.equal(started, 1);
    page.close();
  });

  it('counts places the way a racecard does', () => {
    assert.equal(place(1), '1st');
    assert.equal(place(2), '2nd');
    assert.equal(place(3), '3rd');
    assert.equal(place(4), '4th');
    assert.equal(place(11), '11th');
  });
});

describe('best', () => {
  it('remembers the best meet and nothing else', () => {
    const storage = fakeStorage();
    assert.equal(readBest(storage), 0);
    assert.equal(writeBest(4200, storage), 4200);
    assert.equal(readBest(storage), 4200);
    assert.equal(writeBest(100, storage), 4200, 'a worse meet overwrote a better one');
    assert.equal(writeBest(9000.7, storage), 9000);
  });

  it('shrugs off a browser that will not store anything', () => {
    const broken = {
      getItem() { throw new Error('denied'); },
      setItem() { throw new Error('denied'); },
    };
    assert.equal(readBest(broken), 0);
    assert.equal(writeBest(300, broken), 300);
    assert.equal(readBest(undefined), 0);
  });

  it('ignores junk left in storage', () => {
    assert.equal(readBest(fakeStorage({ 'runny-egg:best': 'scrambled' })), 0);
    assert.equal(readBest(fakeStorage({ 'runny-egg:best': '-5' })), 0);
  });
});
