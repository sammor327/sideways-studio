// The Live game fold (2026-09-19, Sam: RiftAtlas's casting studio as a data
// source for Sideways Studio). The server runs the reader and writes Match
// data itself (server/riftatlas.js); this fold draws what it is doing, takes
// the room code, holds the switches, says which RiftAtlas player feeds which
// side, and lists the cards played most recently, each one click from the
// card popup in preview.

const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

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

let info = null;
let bank = null;
let pollTimer = null;
let lastError = '';

const DOT = {
  live: 'ok', loading: 'wait', waiting: 'wait', starting: 'wait', signin: 'wait',
  'signed-out': 'bad', 'no-access': 'bad', error: 'bad', idle: '',
};
const VERB = { played: 'played', chain_resolved: 'resolved', moved: 'moved', revealed: 'revealed', trashed: 'trashed' };
const ZONE = { battlefieldA: 'battlefield A', battlefieldB: 'battlefield B', battlefieldC: 'battlefield C', mainDeck: 'deck' };
const zone = (z) => ZONE[z] || z;
const thumb = (cardId) => (cardId ? `/cardart/thumb/${cardId}.webp` : '');

function img(cardId, className) {
  const i = el('img', className);
  i.alt = '';
  if (cardId) i.src = thumb(cardId); else i.classList.add('none');
  i.addEventListener('error', () => { i.removeAttribute('src'); i.classList.add('none'); });
  return i;
}

// The closed fold's own line: enough to know the feed is alive without
// opening it.
function summaryLine() {
  const { status, view, config } = info;
  if (status.state === 'live' && view) {
    const game = `Game ${view.gameNumber}${view.seriesLength > 1 ? ` of ${view.seriesLength}` : ''}`;
    const score = view.left && view.right ? `${view.left.score}-${view.right.score}` : '';
    return [view.room, game, view.live ? `Turn ${view.turn}` : (view.phase || '').replace(/_/g, ' '), score].filter(Boolean).join(' · ');
  }
  if (status.state === 'idle') return config.room ? `Not connected (${config.room})` : 'Not connected';
  return {
    starting: 'Starting', loading: 'Opening the room', waiting: 'Waiting for the room', signin: 'Signing in',
    'signed-out': 'Not signed in', 'no-access': 'No caster access', error: 'Reconnecting',
  }[status.state] || status.state;
}

function paintSide(side, p, active) {
  const row = el('div', `ra-side${active ? ' active' : ''}`);
  row.append(el('span', 'ra-who', side === 'left' ? 'P1' : 'P2'));
  if (!p) { row.append(el('span', 'ra-empty', 'waiting for the player')); return row; }
  row.append(img(p.legend && p.legend.cardId, 'ra-thumb'));
  const text = el('div', 'ra-text');
  const name = el('div', 'ra-name', p.name || 'Unnamed');
  if (p.active) name.append(el('span', 'ra-turn', 'TURN'));
  text.append(name);
  const bits = [
    `${p.score} pt`, `${p.wins} won`,
    `hand ${p.handCount}`,
    p.deck ? `deck ${p.deck.left}/${p.deck.total}` : '',
    p.battlefield ? p.battlefield.name : '',
  ].filter(Boolean);
  text.append(el('div', 'ra-bits', bits.join(' · ')));
  row.append(text);
  return row;
}

function paintCards() {
  const list = $('raCards');
  list.replaceChildren();
  const events = (info.view && info.view.events) || [];
  if (!events.length) {
    list.append(el('p', 'hint', 'Cards appear here as they are played. Click one to stage it in the card popup.'));
    return;
  }
  const staged = bank && bank.scenes && bank.scenes.cardpopup ? bank.scenes.cardpopup.card.cardId : '';
  for (const e of events.slice(0, 12)) {
    const b = el('button', `ra-card${e.cardId && e.cardId === staged ? ' on' : ''}`);
    b.type = 'button';
    b.title = e.cardId ? `Stage ${e.name} in the card popup (preview)` : `${e.name} is not in the card list; it stages by name`;
    b.append(img(e.cardId, 'ra-thumb'));
    const t = el('span', 'ra-text');
    t.append(el('span', 'ra-name', e.name));
    const where = e.from || e.to ? ` · ${[zone(e.from), zone(e.to)].filter(Boolean).join(' → ')}` : '';
    t.append(el('span', 'ra-bits', `${VERB[e.kind] || e.kind} · ${e.playerName || ''}${where}`));
    b.append(t);
    b.addEventListener('click', () => stage(e));
    list.append(b);
  }
}

function paint() {
  if (!info) return;
  const { config, status, view, running, signingIn } = info;
  const room = $('raRoom');
  if (document.activeElement !== room && !room.dataset.dirty) room.value = config.room || '';
  const typed = room.value.trim().toUpperCase();
  const connectedHere = running && (!typed || typed === config.room);
  const go = $('raConnect');
  go.textContent = connectedHere ? 'Disconnect' : 'Connect';
  go.classList.toggle('ra-go', !connectedHere);
  go.disabled = signingIn;
  $('raSignIn').disabled = signingIn;

  const line = $('raStatus');
  line.textContent = lastError || status.message || '';
  line.className = `ra-status ${DOT[status.state] || ''}${lastError ? ' bad' : ''}`;
  $('raDot').className = `ra-dot ${DOT[status.state] || ''}`;
  $('raLine').textContent = summaryLine();

  $('raLive').checked = config.live;
  $('raFollow').checked = config.follow;
  $('raShow').checked = config.show;

  const map = $('raMap');
  map.replaceChildren();
  if (view && view.players === 2) {
    map.append(paintSide('left', view.left, view.live && view.left && view.left.active));
    map.append(paintSide('right', view.right, view.live && view.right && view.right.active));
    if (config.live && !view.onAir) {
      map.append(el('p', 'hint ra-note', 'Preview holds other players than air: live values go to preview until you TAKE.'));
    }
    if (!view.settled) map.append(el('p', 'hint ra-note', 'RiftAtlas is still opening the room; nothing is written until it gets there.'));
  } else if (view && view.players > 2) {
    map.append(el('p', 'hint', 'This is a 2v2 room; Live game reads 1v1 rooms so far.'));
  }
  $('raLoad').disabled = !(view && view.players === 2 && view.settled);
  $('raSwap').disabled = !(view && view.players === 2);
  $('raSwap').classList.toggle('on', config.swap);
  paintCards();
}

async function refresh() {
  try {
    info = await api('/api/riftatlas');
  } catch { /* the app is restarting; the next poll tries again */ }
  paint();
}

function schedule() {
  clearTimeout(pollTimer);
  const busy = info && (info.running || info.signingIn);
  pollTimer = setTimeout(async () => { await refresh(); schedule(); }, document.hidden ? 5000 : (busy ? 1000 : 3000));
}

async function act(path, body) {
  const res = await api(path, body);
  lastError = res.ok === false ? (res.error || 'That did not work.') : '';
  if (res.config) info = { config: res.config, status: res.status, view: res.view, running: res.running, signingIn: res.signingIn };
  paint();
  schedule();
  return res;
}

async function stage(e) {
  await fetch('/api/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scenes: { cardpopup: { visible: true, card: { cardId: e.cardId || '', cardName: e.name, cardType: e.cardType || '' } } } }),
  }).catch(() => {});
}

$('raRoom').addEventListener('input', () => { $('raRoom').dataset.dirty = '1'; paint(); });
$('raRoom').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') $('raConnect').click(); });
$('raConnect').addEventListener('click', async () => {
  const room = $('raRoom').value.trim();
  const typed = room.toUpperCase();
  if (info && info.running && (!typed || typed === info.config.room)) {
    await act('/api/riftatlas/disconnect', {});
  } else {
    delete $('raRoom').dataset.dirty;
    await act('/api/riftatlas/connect', { room });
  }
});
$('raSignIn').addEventListener('click', () => act('/api/riftatlas/signin', {}));
$('raLoad').addEventListener('click', () => act('/api/riftatlas/load', {}));
$('raSwap').addEventListener('click', () => act('/api/riftatlas/config', { swap: !(info && info.config.swap) }));
$('raLive').addEventListener('change', (ev) => act('/api/riftatlas/config', { live: ev.target.checked }));
$('raFollow').addEventListener('change', (ev) => act('/api/riftatlas/config', { follow: ev.target.checked }));
$('raShow').addEventListener('change', (ev) => act('/api/riftatlas/config', { show: ev.target.checked }));
// A panel in a background tab has its timers throttled (to once a minute
// after five minutes); coming back to it catches up at once.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) schedule();
  else refresh().then(schedule);
});

refresh().then(schedule);

// Called by panel.js on every state render: the card list marks the card
// that is staged in the popup now.
export function renderRiftAtlas(s) {
  bank = s && s.preview ? s.preview : bank;
  if (info) paintCards();
}
