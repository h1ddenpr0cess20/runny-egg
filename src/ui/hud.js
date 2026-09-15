/**
 * The readouts, the callouts, and the card that covers them between heats.
 * Markup lives in index.html; this only ever writes text and flips `hidden`.
 */

const INTACT = '●';
const CRACKED = '◌';

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

/** What each pickup is called when it lands, and how long it says so. */
const EFFECT = { boost: 'feather', grip: 'straw', float: 'puff' };

const OUTCOME = {
  advance: { kicker: 'through', lead: 'That is a qualifying place. Next heat.' },
  'knocked out': { kicker: 'out', lead: 'Not in the places. The meet goes on without you.' },
  broken: { kicker: 'scrambled', lead: 'Three cracks and the shell went. That is the meet.' },
  finished: { kicker: 'the meet', lead: 'Round the whole card in one piece — which most of the field cannot say.' },
  champion: { kicker: 'gold', lead: 'First in the final. Every bird in the county saw it.' },
};

function stat(label, value) {
  return `<div class="stat"><dt>${label}</dt><dd>${value}</dd></div>`;
}

function metres(value) {
  return `${Math.max(0, Math.round(value))}m`;
}

function clock(seconds) {
  return `${Math.max(0, seconds).toFixed(1)}s`;
}

export function place(n) {
  return ORDINAL[n - 1] ?? `${n}th`;
}

/** HTML-safe: every name on the board comes off our own roster, but a board
 *  that writes unescaped strings is a habit worth not having. */
function safe(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function createHud(doc = document, maxCracks = 3) {
  const $ = (id) => doc.getElementById(id);

  const nodes = {
    place: $('place'),
    heat: $('heat'),
    togo: $('togo'),
    time: $('time'),
    score: $('score'),
    cracks: $('cracks'),
    effects: $('effects'),
    callout: $('callout'),
    overlay: $('overlay'),
    kicker: $('overlay-kicker'),
    sub: $('overlay-sub'),
    lead: $('overlay-lead'),
    stats: $('overlay-stats'),
    board: $('overlay-board'),
    play: $('play'),
  };

  /** The readouts are written sixty times a second and change a handful of
   *  times a heat, so each one only touches the DOM when its text moves. */
  const shown = {};
  function put(node, key, value, html = false) {
    if (!node || shown[key] === value) return;
    shown[key] = value;
    if (html) node.innerHTML = value;
    else node.textContent = value;
  }

  let clearing = null;

  function shell(cracks) {
    const left = Math.max(0, maxCracks - cracks);
    return INTACT.repeat(left) + `<span class="spent">${CRACKED.repeat(Math.min(maxCracks, cracks))}</span>`;
  }

  function effects(player) {
    const on = [];
    for (const [field, name] of Object.entries(EFFECT)) {
      if (player[field] > 0) on.push(`<li class="${field}">${name} ${player[field].toFixed(1)}</li>`);
    }
    return on.join('');
  }

  /**
   * The field, in the order the tape saw them. Anybody still out on the
   * course is shown by how much of it they had left — which needs the heat's
   * distance, not just how far they had come. Printing `z` here read "702m
   * out" for an egg that was 138m from the line.
   */
  function board(standings, distance) {
    return standings.map((row) => {
      const marks = [row.you ? 'you' : '', row.broken ? 'broken' : ''].filter(Boolean).join(' ');
      const spot = row.broken ? '—' : place(row.place);
      const short = Math.max(0, distance - row.z);
      const time = row.broken ? 'did not finish' : (row.finished ? clock(row.time) : `${metres(short)} short`);
      return `<li class="${marks}">
        <span class="spot">${spot}</span>
        <span class="who"><i style="background:#${row.tint.toString(16).padStart(6, '0')}"></i>${safe(row.name)}</span>
        <span class="when">${time}</span>
      </li>`;
    }).join('');
  }

  function panel(state) {
    nodes.overlay.hidden = false;
    nodes.overlay.dataset.state = state;
  }

  return {
    update(snapshot) {
      put(nodes.place, 'place', `${place(snapshot.place)} of ${snapshot.field}`);
      put(nodes.heat, 'heat', `${snapshot.heatIndex + 1}/${snapshot.heats} ${snapshot.heat.name}`);
      put(nodes.togo, 'togo', metres(snapshot.remaining));
      put(nodes.time, 'time', clock(snapshot.time));
      put(nodes.score, 'score', String(snapshot.score));
      put(nodes.cracks, 'cracks', shell(snapshot.cracks), true);
      put(nodes.effects, 'effects', effects(snapshot.player), true);
    },

    /**
     * A line across the middle of the screen for a second and a half. It is
     * the only way you find out that an egg two lanes over has just cracked
     * open, because you are looking at the track.
     */
    say(text, tone = '') {
      if (!nodes.callout) return;
      nodes.callout.hidden = false;
      nodes.callout.textContent = text;
      nodes.callout.className = tone;
      /** Restart the animation rather than let a second callout inherit the
       *  tail of the first one's fade. */
      nodes.callout.style.animation = 'none';
      void nodes.callout.offsetWidth;
      nodes.callout.style.animation = '';
      clearTimeout(clearing);
      clearing = setTimeout(() => { nodes.callout.hidden = true; }, 1600);
    },

    /** The card, before the gun. */
    card(snapshot, best) {
      panel('ready');
      const heat = snapshot.heat;
      nodes.kicker.textContent = `heat ${snapshot.heatIndex + 1} of ${snapshot.heats}`;
      nodes.sub.textContent = heat.name;
      nodes.lead.textContent = heat.blurb;
      nodes.board.hidden = true;
      nodes.stats.hidden = false;
      nodes.stats.innerHTML = [
        stat('distance', metres(heat.distance)),
        stat('field', heat.field),
        stat('through', snapshot.last ? 'all who finish' : `top ${heat.qualify}`),
        best > 0 ? stat('best', best) : '',
      ].join('');
      nodes.play.textContent = snapshot.heatIndex === 0 ? 'on your marks' : 'next heat';
    },

    /** The board, after it. */
    results(results, best) {
      panel(results.outcome === 'advance' ? 'through' : 'out');
      const copy = OUTCOME[results.outcome] ?? OUTCOME.advance;
      nodes.kicker.textContent = copy.kicker;
      nodes.sub.textContent = `${results.heat.name} — ${results.place ? place(results.place) : 'did not finish'}`;
      nodes.lead.textContent = copy.lead;
      nodes.stats.hidden = false;
      nodes.stats.innerHTML = [
        stat('time', clock(results.time)),
        stat('crumbs', results.crumbs),
        stat('passed', results.overtakes),
        stat('shell', results.clean ? 'clean' : `${results.cracks} cracked`),
        stat('earned', results.earned),
        stat('score', results.score),
      ].join('');
      nodes.board.hidden = false;
      nodes.board.innerHTML = board(results.standings, results.heat.distance);
      nodes.play.textContent = results.outcome === 'advance'
        ? 'next heat'
        : (best > 0 && results.score >= best ? 'run it again' : 'again');
    },

    running() {
      nodes.overlay.hidden = true;
      nodes.overlay.dataset.state = 'running';
    },

    onPlay(fn) {
      nodes.play.addEventListener('click', (event) => {
        event.stopPropagation();
        fn();
      });
    },
  };
}
