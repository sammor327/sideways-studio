// The Tournament platform tab (2026-09-18, Sam, the night before Convergence
// #3): "a match selection menu for the user to choose a match and instantly
// populate all relevant information", beside every graphic that draws it.
//
// The server holds the connection (server/platform.js: the event, the key,
// the 30-second refresh) and does every load, so a click here is one POST
// and the preview bank changes the way any Studio edit does. This module
// draws the picker from the server's summary, polls a small status while the
// tab is open, and runs the right-hand grid: the look builder's tile pages
// (?tile=) without ?sample=1, so every tile shows the preview bank.

import { tileFor } from '../shared/looktiles.js';
import { SCENE_LABELS } from '../shared/look.js';

const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

async function api(path, body) {
  const res = await fetch(path, body === undefined ? { cache: 'no-store' } : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch { /* not JSON: the status says enough */ }
  if (!res.ok && data.ok === undefined) data.ok = false;
  if (!res.ok && !data.error) data.error = `The app answered HTTP ${res.status}.`;
  return data;
}

// --- state ---

let view = document.body.dataset.view || 'studio';
let info = null;
let summary = null;
let dataVersion = -1;
let bank = null;
const ui = { round: '', follow: true, group: 0, search: '' };

// --- the connection card ---

const STATUS_LABEL = { 'Not Started': 'not started', Ongoing: 'live', Complete: 'finished' };
const ago = (ms) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 5 ? 'just now' : s < 60 ? `${s} s ago` : `${Math.round(s / 60)} min ago`;
};

function paintConnection() {
  if (!info) return;
  const { config, status } = info;
  const input = $('pfEvent');
  if (document.activeElement !== input && !input.dataset.dirty) input.value = config.event || '';
  $('pfKey').placeholder = config.hasKey ? `Key saved (ends ${config.keyHint}); paste a new one to replace it` : 'Optional: paste your TopDeck API key';
  $('pfAuto').checked = config.auto;
  const line = $('pfStatus');
  line.classList.toggle('bad', status.state === 'error');
  line.classList.toggle('warn', status.state === 'ok' && Boolean(status.warning));
  if (!config.event) line.textContent = 'Not connected. Paste the event link and press Connect.';
  else if (status.state === 'loading' && !status.fetchedAt) line.textContent = 'Reading TopDeck…';
  else if (status.state === 'error') line.textContent = status.fetchedAt ? `${status.error} Showing the data from ${ago(status.fetchedAt)}.` : status.error;
  else if (summary) {
    const parts = [summary.name || config.event, STATUS_LABEL[summary.status] || '', `${summary.players} players`,
      summary.groups.length ? `${summary.groups.length} groups` : '', `updated ${ago(status.fetchedAt)}`];
    line.textContent = parts.filter(Boolean).join(' · ') + (status.warning ? `. ${status.warning}` : '');
  } else line.textContent = 'Reading TopDeck…';
  const src = $('pfSource');
  src.textContent = status.source === 'api' ? 'TopDeck API' : status.source === 'page' ? 'Public page' : '';
  src.title = status.source === 'page' ? 'No API key (or the API failed): reading the event\'s public page on topdeck.gg' : '';
  $('pfRefresh').disabled = !config.event;
  for (const id of ['pfStandings', 'pfLegends', 'pfBracket', 'pfUpNextClear']) $(id).disabled = !summary;
  $('pfBracket').disabled = !summary || !summary.bracketReady;
  $('pfBracket').title = summary && !summary.bracketReady ? 'The bracket has not started on TopDeck yet' : '';
  paintPairingsButton();
}

// What Pairings to preview loads: the round picked under Matches and, in a
// pooled Swiss, the group picked there.
function paintPairingsButton() {
  const r = currentRound();
  const tables = r ? r.tables.filter((t) => !ui.group || t.group === ui.group).length : 0;
  $('pfPairings').disabled = !tables;
  $('pfPairingsWhat').textContent = r ? `${r.label}${ui.group ? ` · Group ${ui.group}` : ''} · ${tables} table${tables === 1 ? '' : 's'}` : '';
}

$('pfEvent').addEventListener('input', () => { $('pfEvent').dataset.dirty = '1'; });
$('pfConnect').addEventListener('click', async () => {
  const body = { event: $('pfEvent').value.trim(), auto: $('pfAuto').checked };
  const key = $('pfKey').value.trim();
  if (key) body.key = key;
  $('pfConnect').disabled = true;
  $('pfStatus').textContent = 'Reading TopDeck…';
  const res = await api('/api/platform/config', body);
  $('pfConnect').disabled = false;
  if (!res.ok) {
    $('pfStatus').textContent = res.error;
    $('pfStatus').classList.add('bad');
    return;
  }
  $('pfKey').value = '';
  delete $('pfEvent').dataset.dirty;
  info = res;
  dataVersion = -1;
  ui.follow = true;
  await poll();
});
$('pfKey').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('pfConnect').click(); });
$('pfEvent').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('pfConnect').click(); });
$('pfAuto').addEventListener('change', async () => {
  info = { ...info, ...(await api('/api/platform/config', { auto: $('pfAuto').checked })) };
  paintConnection();
});
$('pfRefresh').addEventListener('click', async () => {
  $('pfRefresh').disabled = true;
  $('pfStatus').textContent = 'Reading TopDeck…';
  const res = await api('/api/platform/refresh', {});
  $('pfRefresh').disabled = false;
  if (res.config) info = res;
  await poll();
});

// --- the match picker ---

function currentRound() {
  if (!summary || !summary.rounds.length) return null;
  return summary.rounds.find((r) => r.id === ui.round) || summary.rounds[summary.rounds.length - 1];
}

function paintRounds() {
  const sel = $('pfRound');
  const rounds = summary ? summary.rounds : [];
  // Follow the newest round as TopDeck adds them, unless one was picked.
  if (rounds.length && (ui.follow || !rounds.some((r) => r.id === ui.round))) ui.round = rounds[rounds.length - 1].id;
  const opts = rounds.map((r) => [r.id, `${r.label} · ${r.done}/${r.tables.length} done`]);
  const sig = JSON.stringify(opts);
  if (sel.dataset.sig !== sig) {
    sel.dataset.sig = sig;
    sel.replaceChildren(...(opts.length ? opts.map(([v, t]) => Object.assign(el('option', '', t), { value: v })) : [Object.assign(el('option', '', 'No rounds yet'), { value: '' })]));
  }
  sel.value = ui.round;
  sel.disabled = !rounds.length;

  const r = currentRound();
  const groups = r && r.stage === 'swiss' && summary.groups.length ? summary.groups : [];
  if (!groups.includes(ui.group)) ui.group = 0;
  const seg = $('pfGroups');
  const gsig = JSON.stringify([groups, ui.group]);
  if (seg.dataset.sig !== gsig) {
    seg.dataset.sig = gsig;
    seg.replaceChildren(...(groups.length ? [0, ...groups] : []).map((g) => {
      const b = el('button', ui.group === g ? 'on' : '', g ? `G${g}` : 'All');
      b.type = 'button';
      b.title = g ? `Group ${g} only` : 'Every group';
      b.addEventListener('click', () => { ui.group = g; paintRounds(); paintList(); });
      return b;
    }));
  }
  const info2 = $('pfRoundInfo');
  info2.textContent = r ? (r.byes.length ? `${r.byes.length} bye${r.byes.length === 1 ? '' : 's'}` : '') : '';
  info2.title = r && r.byes.length ? `Byes: ${r.byes.join(', ')}` : '';

  const sg = $('pfStandGroup');
  const all = summary ? summary.groups : [];
  const ssig = JSON.stringify(all);
  if (sg.dataset.sig !== ssig) {
    const keep = sg.value;
    sg.dataset.sig = ssig;
    sg.replaceChildren(...[...all.map((g) => [g, `Group ${g}`]), [0, all.length ? 'Every player' : 'All players']]
      .map(([v, t]) => Object.assign(el('option', '', t), { value: String(v) })));
    if ([...sg.options].some((o) => o.value === keep)) sg.value = keep;
  }
  // The legend distribution defaults to the whole event, the standings to a group.
  const lg = $('pfLegendGroup');
  if (lg.dataset.sig !== ssig) {
    const keep = lg.value;
    lg.dataset.sig = ssig;
    lg.replaceChildren(...[[0, all.length ? 'Whole event' : 'All players'], ...all.map((g) => [g, `Group ${g}`])]
      .map(([v, t]) => Object.assign(el('option', '', t), { value: String(v) })));
    if ([...lg.options].some((o) => o.value === keep)) lg.value = keep;
  }
  paintPairingsButton();
}

$('pfRound').addEventListener('change', () => {
  ui.round = $('pfRound').value;
  ui.follow = summary && ui.round === summary.rounds[summary.rounds.length - 1].id;
  paintRounds();
  paintList();
  $('pfList').scrollTop = 0;
});
$('pfSearch').addEventListener('input', () => { ui.search = norm($('pfSearch').value); paintList(); });

// The match in preview now, found among a round's tables in either order.
function inPreview(t) {
  if (!bank) return null;
  const L = norm(bank.match.left.name), R = norm(bank.match.right.name);
  const a = norm(t.players[0] && t.players[0].name), b = norm(t.players[1] && t.players[1].name);
  if (L === a && R === b) return { swap: false };
  if (L === b && R === a) return { swap: true };
  return null;
}

function legendIcon(p) {
  const img = el('img', 'pf-ic');
  img.alt = '';
  img.loading = 'lazy';
  if (p.legendSlug) {
    img.src = `/legendart/icon/${p.legendSlug}.webp`;
    img.addEventListener('error', () => img.classList.add('none'), { once: true });
  } else img.classList.add('none');
  return img;
}

function playerCell(p, won, side) {
  const cell = el('span', `pf-p ${side === 'l' ? 'pf-left' : 'pf-right'}${won ? ' won' : ''}${p.dropped ? ' dropped' : ''}`);
  cell.title = [p.name, p.legend, p.record && `${p.record} going in`, p.dropped ? 'dropped' : ''].filter(Boolean).join(' · ');
  const name = el('span', 'pf-n', p.name || 'Unknown');
  const rec = el('span', 'pf-r', p.record || '');
  if (side === 'l') cell.append(legendIcon(p), name, rec);
  else cell.append(rec, name, legendIcon(p));
  return cell;
}

function paintList() {
  const list = $('pfList');
  const r = currentRound();
  if (!r) {
    list.replaceChildren(el('p', 'pf-empty', summary ? 'TopDeck has no pairings for this event yet. They appear here the moment round 1 is paired.' : 'Connect an event to list its matches.'));
    return;
  }
  const rows = r.tables.filter((t) => (!ui.group || t.group === ui.group)
    && (!ui.search || t.players.some((p) => norm(p.name).includes(ui.search))));
  if (!rows.length) {
    list.replaceChildren(el('p', 'pf-empty', 'No match fits the filter.'));
    return;
  }
  list.replaceChildren(...rows.map((t) => {
    const row = el('div', `pf-row ${t.status}`);
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    const here = inPreview(t);
    if (here) row.classList.add('on');
    const score = el('span', 'pf-score');
    if (t.status === 'done') score.textContent = t.draw ? 'Draw' : t.games ? `${t.games[0]}–${t.games[1]}` : 'Done';
    else if (t.status === 'pending') score.textContent = 'Pending';
    else score.append(el('span', 'pf-live', 'Live'));
    const add = el('button', 'pf-add', '+');
    add.type = 'button';
    add.title = `Add table ${t.table} to the Up next board`;
    add.setAttribute('aria-label', add.title);
    row.append(
      el('span', 'pf-t', `T${t.table}`),
      el('span', 'pf-g', t.group ? `G${t.group}` : ''),
      playerCell(t.players[0] || {}, t.winner === 0, 'l'),
      score,
      playerCell(t.players[1] || {}, t.winner === 1, 'r'),
      add,
    );
    row.title = `Load table ${t.table} into preview`;
    const load = () => loadMatch(r.id, t.table, here ? here.swap : false);
    row.addEventListener('click', (e) => { if (!e.target.closest('.pf-add')) load(); });
    row.addEventListener('keydown', (e) => {
      if (e.target !== row) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); load(); }
    });
    add.addEventListener('click', () => loadExtra({ kind: 'upnext', round: r.id, table: t.table }, `Table ${t.table} added to Up next`));
    return row;
  }));
}

// --- loading ---

function say(text, bad = false) {
  const line = $('pfLast');
  line.textContent = text;
  line.classList.toggle('bad', bad);
}

let loaded = null;
async function loadMatch(round, table, swap) {
  const res = await api('/api/platform/load', { kind: 'match', round, table, swap });
  if (!res.ok) { say(res.error || 'That did not load.', true); return; }
  loaded = { round, table, swap };
  const decks = res.decks.filter(Boolean).length;
  const counts = res.games ? ` Games ${res.games[0]}–${res.games[1]} from TopDeck.`
    : res.newPairing ? ' Points and games start at 0.' : ' Same pairing: your counts are kept.';
  say(`Table ${res.table} is in preview: ${res.names[0]} vs ${res.names[1]}, ${res.roundTitle}. `
    + `${decks === 2 ? 'Both decklists' : decks === 1 ? 'One decklist' : 'No decklists yet (TopDeck shows them once the organizer allows)'}.`
    + `${counts} TAKE to air.`);
  // Standings default to the group this match is in.
  if (res.group && [...$('pfStandGroup').options].some((o) => o.value === String(res.group))) $('pfStandGroup').value = String(res.group);
}

async function loadExtra(body, done) {
  const res = await api('/api/platform/load', body);
  if (!res.ok) { say(res.error || 'That did not load.', true); return; }
  say(typeof done === 'function' ? done(res) : done);
}

$('pfStandings').addEventListener('click', () => {
  const group = Number($('pfStandGroup').value);
  loadExtra({ kind: 'standings', group, cut: Number($('pfCut').value) },
    (res) => `${group ? `Group ${group} standings` : 'Standings'} after round ${res.round} are in preview (${res.count} players, ${res.leader} on top). TAKE to air.`);
});
$('pfLegends').addEventListener('click', () => {
  const group = Number($('pfLegendGroup').value) || 0;
  loadExtra({ kind: 'legends', group },
    (res) => `The legend distribution${group ? ` for group ${group}` : ''} is in preview: ${res.players} players on ${res.legends} legends, ${res.lead} the most played${res.unknown ? ` (${res.unknown} with no legend on TopDeck left out)` : ''}. TAKE to air.`);
});
$('pfPairings').addEventListener('click', () => {
  const r = currentRound();
  if (!r) return;
  const plural = (k, word) => `${k} ${word}${k === 1 ? '' : 's'}`;
  loadExtra({ kind: 'pairings', round: r.id, group: ui.group }, (res) => `${res.label} pairings are in preview: ${plural(res.count, 'table')}`
    + `${res.done ? `, ${res.done} finished` : ''}${res.byes ? `, ${plural(res.byes, 'bye')}` : ''}`
    + `${res.dropped ? ` (the first 128: ${res.dropped} more do not fit; pick a group)` : ''}. TAKE to air.`);
});
$('pfBracket').addEventListener('click', () => loadExtra({ kind: 'bracket' },
  (res) => `The ${res.format === 'se16' ? 'Top 16' : 'Top 8'} is in preview with ${res.results} result${res.results === 1 ? '' : 's'}. TAKE to air.`));
$('pfUpNextClear').addEventListener('click', () => loadExtra({ kind: 'upnext-clear' }, 'Up next is empty in preview.'));
$('pfSwap').addEventListener('click', () => {
  if (loaded) loadMatch(loaded.round, loaded.table, !loaded.swap);
});

function paintLoaded() {
  const bar = $('pfLoaded');
  let hit = null;
  if (summary && bank) {
    for (const r of summary.rounds) {
      for (const t of r.tables) {
        const here = inPreview(t);
        if (here) hit = { r, t, swap: here.swap };
      }
    }
  }
  if (hit) {
    loaded = { round: hit.r.id, table: hit.t.table, swap: hit.swap };
    bar.textContent = `Preview: ${bank.match.left.name} vs ${bank.match.right.name} · ${hit.r.label}${hit.t.group ? ` · Group ${hit.t.group}` : ''} · Table ${hit.t.table}`;
  } else {
    bar.textContent = bank && summary ? 'The match in preview is not one of this event\'s tables.' : 'No match loaded from TopDeck yet.';
  }
  $('pfSwap').disabled = !hit;
}

// --- polling: a small status while the tab is open, the summary on change ---

let pollTimer = 0;
async function poll() {
  clearTimeout(pollTimer);
  try {
    const next = await api('/api/platform');
    if (next.config) info = next;
    if (info && info.status.version !== dataVersion) {
      const data = await api('/api/platform/data');
      if (data.config) {
        info = data;
        summary = data.summary;
        dataVersion = data.status.version;
      }
      paintRounds();
      paintList();
      paintLoaded();
    }
    paintConnection();
  } catch { /* the app is restarting: the next poll tries again */ }
  if (view === 'platform') pollTimer = setTimeout(poll, info && info.status.state === 'loading' ? 1000 : 4000);
}

// --- the graphics that draw the event's data ---

const PF_TILES = [
  { label: 'In-game overlays', keys: ['igodual', 'igorows', 'igorows-bf', 'igo1v1', 'igoportrait', 'pov', 'scorebug'] },
  { label: 'Match graphics', keys: ['matchup', 'headtohead', 'vscard', 'profile', 'profile-deck', 'decklists', 'sideboard', 'result'] },
  { label: 'Event graphics', keys: ['standings', 'legendstats', 'pairings', 'bracket', 'slate'] },
];

const PREFS_KEY = 'sidewaysStudio.platform';
const BACKDROPS = ['checker', 'dark', 'table'];
let backdrop = 'checker';
try {
  const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
  if (BACKDROPS.includes(saved.backdrop)) backdrop = saved.backdrop;
} catch { /* storage blocked: the default */ }

const grid = $('pfTiles');
const tiles = [];
const newFrame = () => {
  const f = el('iframe');
  f.tabIndex = -1;
  f.setAttribute('aria-hidden', 'true');
  f.setAttribute('allowtransparency', 'true');
  return f;
};
for (const group of PF_TILES) {
  const members = group.keys.map(tileFor).filter(Boolean);
  const head = el('h3', 'look-group-title');
  head.append(el('span', '', group.label), el('span', 'look-group-count', String(members.length)));
  const wrap = el('div', 'look-group-grid');
  for (const t of members) {
    const card = el('article', 'look-tile pf-tile');
    const frameBox = el('div', 'tile-frame');
    const frame = newFrame();
    frameBox.append(frame, el('span', 'tile-loading', 'Loading'));
    const meta = el('div', 'tile-meta');
    const names = el('div', 'tile-names');
    names.append(el('span', 'tile-name', SCENE_LABELS[t.scene] || t.scene));
    if (t.variant) names.append(el('span', 'tile-variant', t.variant));
    meta.append(names);
    card.append(frameBox, meta);
    wrap.append(card);
    tiles.push({ tile: t, card, frameBox, frame, loaded: false });
  }
  grid.append(head, wrap);
}
const tileUrl = (t) => `/scenes/${t.scene}/?transparent=1&preview=1&force=1&anim=0&tile=${encodeURIComponent(t.key)}`;
new ResizeObserver(() => {
  const first = tiles[0] && tiles[0].frameBox;
  if (first && first.clientWidth) grid.style.setProperty('--tile-scale', String(first.clientWidth / 1920));
}).observe(tiles[0].frameBox);

function loadTile(entry) {
  if (entry.loaded) return;
  entry.card.classList.remove('loaded');
  entry.frame.addEventListener('load', () => entry.card.classList.add('loaded'), { once: true });
  entry.frame.src = tileUrl(entry.tile);
  entry.loaded = true;
}
function unloadTiles() {
  for (const entry of tiles) {
    if (!entry.loaded) continue;
    const fresh = newFrame();
    entry.frame.replaceWith(fresh);
    entry.frame = fresh;
    entry.loaded = false;
    entry.card.classList.remove('loaded');
  }
}
const nearby = new IntersectionObserver((seen) => {
  if (view !== 'platform') return;
  for (const s of seen) {
    if (!s.isIntersecting) continue;
    const entry = tiles.find((x) => x.card === s.target);
    if (entry) loadTile(entry);
  }
}, { root: grid, rootMargin: '400px 0px' });

function applyBackdrop() {
  for (const b of BACKDROPS) grid.classList.toggle(`backdrop-${b}`, backdrop === b);
  for (const btn of document.querySelectorAll('[data-pf-backdrop]')) {
    const on = btn.dataset.pfBackdrop === backdrop;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}
for (const btn of document.querySelectorAll('[data-pf-backdrop]')) {
  btn.addEventListener('click', () => {
    backdrop = btn.dataset.pfBackdrop;
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ backdrop })); } catch { /* this session only */ }
    applyBackdrop();
  });
}

// --- the tab ---

function onView(next) {
  view = next;
  if (view === 'platform') {
    applyBackdrop();
    for (const entry of tiles) { nearby.unobserve(entry.card); nearby.observe(entry.card); }
    poll();
  } else {
    clearTimeout(pollTimer);
    unloadTiles();
  }
}
window.addEventListener('sideways:view', (e) => onView(e.detail));
onView(view);

// Called by panel.js after every state render: the picker marks the match
// that is in preview, whichever tab made it.
export function renderPlatform(s) {
  bank = s && s.preview ? s.preview : bank;
  if (view !== 'platform' || !summary) return;
  paintLoaded();
  const r = currentRound();
  if (!r) return;
  const rows = $('pfList').querySelectorAll('.pf-row');
  const shown = r.tables.filter((t) => (!ui.group || t.group === ui.group) && (!ui.search || t.players.some((p) => norm(p.name).includes(ui.search))));
  shown.forEach((t, i) => { if (rows[i]) rows[i].classList.toggle('on', Boolean(inPreview(t))); });
}
