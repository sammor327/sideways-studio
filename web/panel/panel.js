const $ = (id) => document.getElementById(id);
const winsNeeded = (seriesLength) => Math.ceil(seriesLength / 2);

let state = null;

async function post(patch) {
  try {
    await fetch('/api/update', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
  } catch {
    setStatus(false);
  }
}

function setStatus(ok) {
  $('statusDot').classList.toggle('ok', ok);
  $('statusText').textContent = ok ? 'connected' : 'disconnected';
}

function renderScenes(s) {
  const sbPrev = s.preview.scenes.scorebug.visible;
  const sbAir = s.program.scenes.scorebug.visible;
  const sb = $('toggleScorebug');
  sb.textContent = sbPrev ? 'ON' : 'OFF';
  sb.classList.toggle('on', sbPrev);
  $('scorebugOnAir').classList.toggle('hidden', !sbAir);

  const igoPrev = s.preview.scenes.igo1v1;
  const igoBtn = $('toggleIgo');
  igoBtn.textContent = igoPrev.visible ? 'ON' : 'OFF';
  igoBtn.classList.toggle('on', igoPrev.visible);
  $('igoOnAir').classList.toggle('hidden', !s.program.scenes.igo1v1.visible);
  if (document.activeElement !== $('igoMode')) $('igoMode').value = igoPrev.mode;

  const igo2Prev = s.preview.scenes.igo2v2;
  const igo2Btn = $('toggleIgo2');
  igo2Btn.textContent = igo2Prev.visible ? 'ON' : 'OFF';
  igo2Btn.classList.toggle('on', igo2Prev.visible);
  $('igo2OnAir').classList.toggle('hidden', !s.program.scenes.igo2v2.visible);
  if (document.activeElement !== $('igo2Mode')) $('igo2Mode').value = igo2Prev.mode;

  const povPrev = s.preview.scenes.pov;
  const povBtn = $('togglePov');
  povBtn.textContent = povPrev.visible ? 'ON' : 'OFF';
  povBtn.classList.toggle('on', povPrev.visible);
  $('povOnAir').classList.toggle('hidden', !s.program.scenes.pov.visible);
  for (const [P, side, flag] of [['povl', 'left', povPrev.showLeft], ['povr', 'right', povPrev.showRight]]) {
    const box = $(`${P}Show`);
    if (document.activeElement !== box) box.checked = flag;
    renderFeaturedCard(P, s.preview.match[side].card);
  }

  const dk = s.preview.scenes.decklist;
  const dkBtn = $('toggleDeck');
  dkBtn.textContent = dk.visible ? 'ON' : 'OFF';
  dkBtn.classList.toggle('on', dk.visible);
  dkBtn.disabled = !dk.list.trim();
  $('deckOnAir').classList.toggle('hidden', !s.program.scenes.decklist.visible);
  if (document.activeElement !== $('deckList')) $('deckList').value = dk.list;
  // Summarise a list that arrived from state (a reload, or the other panel),
  // not just one the operator is typing.
  if (dk.list !== summarisedList) {
    summarisedList = dk.list;
    summariseDeck(dk.list);
  }
  if (document.activeElement !== $('deckSideboard')) $('deckSideboard').checked = dk.showSideboard;

  const cp = s.preview.scenes.cardpopup;
  const cpAir = s.program.scenes.cardpopup.visible;
  const cardBtn = $('toggleCard');
  cardBtn.textContent = cp.visible ? 'ON' : 'OFF';
  cardBtn.classList.toggle('on', cp.visible);
  cardBtn.disabled = !cp.card.cardId;
  $('cardOnAir').classList.toggle('hidden', !cpAir);

  const thumb = $('stagedThumb');
  if (cp.card.cardId) {
    $('stagedName').textContent = cp.card.cardName;
    $('stagedType').textContent = cp.card.cardType;
    const src = `/cardart/thumb/${cp.card.cardId}.webp`;
    if (thumb.getAttribute('src') !== src) {
      thumb.onerror = () => thumb.classList.add('hidden');
      thumb.onload = () => thumb.classList.remove('hidden');
      thumb.src = src;
    }
  } else {
    $('stagedName').textContent = 'Nothing staged';
    $('stagedType').textContent = '';
    thumb.classList.add('hidden');
    thumb.removeAttribute('src');
  }
}

// The POV featured card box: thumbnail, name, and a Clear that is only live
// when there is something to clear.
function renderFeaturedCard(P, card) {
  const thumb = $(`${P}CardThumb`);
  $(`${P}CardName`).textContent = card.cardId ? (card.cardName || card.cardId) : 'Nothing staged';
  $(`${P}CardClear`).disabled = !card.cardId;
  if (!card.cardId) {
    thumb.classList.add('hidden');
    thumb.removeAttribute('src');
    return;
  }
  const src = `/cardart/thumb/${card.cardId}.webp`;
  if (thumb.getAttribute('src') !== src) {
    thumb.onerror = () => thumb.classList.add('hidden');
    thumb.onload = () => thumb.classList.remove('hidden');
    thumb.src = src;
  }
}

function renderTheme(t) {
  if (document.activeElement !== $('accentA')) $('accentA').value = t.accentA;
  if (document.activeElement !== $('accentB')) $('accentB').value = t.accentB;
  $('fontSelect').value = t.font || '';
  const preview = $('logoPreview');
  if (t.logo) {
    let img = preview.querySelector('img');
    if (!img) {
      preview.replaceChildren();
      img = document.createElement('img');
      preview.appendChild(img);
    }
    if (img.getAttribute('src') !== t.logo) img.src = t.logo;
  } else {
    preview.replaceChildren(Object.assign(document.createElement('span'), { className: 'muted', textContent: 'No logo' }));
  }
  $('logoRemove').disabled = !t.logo;
}

// Never clobber a field the operator is typing in.
const setIfIdle = (id, value) => {
  const el = $(id);
  if (document.activeElement !== el) el.value = value;
};

function render(s) {
  state = s;
  const m = s.preview.match;
  // Never clobber a field the operator is typing in.
  if (document.activeElement !== $('lname')) $('lname').value = m.left.name;
  if (document.activeElement !== $('rname')) $('rname').value = m.right.name;
  if (document.activeElement !== $('llegend')) $('llegend').value = m.left.legend || '';
  if (document.activeElement !== $('rlegend')) $('rlegend').value = m.right.legend || '';
  if (document.activeElement !== $('lbf')) $('lbf').value = m.left.battlefield || '';
  if (document.activeElement !== $('rbf')) $('rbf').value = m.right.battlefield || '';
  if (document.activeElement !== $('lteam')) $('lteam').value = m.left.teamName || '';
  if (document.activeElement !== $('rteam')) $('rteam').value = m.right.teamName || '';
  if (document.activeElement !== $('lname2')) $('lname2').value = m.left.name2 || '';
  if (document.activeElement !== $('rname2')) $('rname2').value = m.right.name2 || '';
  if (document.activeElement !== $('llegend2')) $('llegend2').value = m.left.legend2 || '';
  if (document.activeElement !== $('rlegend2')) $('rlegend2').value = m.right.legend2 || '';
  if (document.activeElement !== $('lbf2')) $('lbf2').value = m.left.battlefield2 || '';
  if (document.activeElement !== $('rbf2')) $('rbf2').value = m.right.battlefield2 || '';
  for (const [P, side] of [['povl', 'left'], ['povr', 'right']]) {
    const sd = m[side];
    setIfIdle(`${P}Name`, sd.name);
    setIfIdle(`${P}Legend`, sd.legend || '');
    setIfIdle(`${P}LegendText`, sd.legend || '');
    setIfIdle(`${P}Champion`, sd.champion || '');
    setIfIdle(`${P}ChampionText`, sd.champion || '');
    setIfIdle(`${P}Bf`, sd.battlefield || '');
    setIfIdle(`${P}Score`, String(sd.score));
  }
  $('lscoreOut').textContent = m.left.score;
  $('rscoreOut').textContent = m.right.score;
  $('lwinsOut').textContent = m.left.gameWins;
  $('rwinsOut').textContent = m.right.gameWins;
  $('seriesLength').value = String(m.seriesLength);

  renderScenes(s);
  renderTheme(s.theme);

  // The TAKE button lights up whenever preview differs from what is on air.
  const pending = JSON.stringify(s.preview) !== JSON.stringify(s.program);
  $('takeBtn').classList.toggle('pending', pending);
}

// --- bus controls ---

$('takeBtn').addEventListener('click', () => post({ action: 'take' }));
$('clearBtn').addEventListener('click', () => post({ action: 'clear' }));

// --- match controls (all edits land in the preview bank) ---

// Points and game wins each appear in more than one card now, so an
// optimistic click has to repaint every display bound to that number.
function paintCounter(side, field, value) {
  $((side === 'left' ? 'l' : 'r') + (field === 'score' ? 'scoreOut' : 'winsOut')).textContent = value;
  if (field !== 'score') return;
  const el = $(side === 'left' ? 'povlScore' : 'povrScore');
  if (document.activeElement !== el) el.value = String(value);
}

for (const btn of document.querySelectorAll('.counter button')) {
  btn.addEventListener('click', () => {
    if (!state) return;
    const { side, field, step } = btn.dataset;
    // Optimistic: mutate the local copy immediately so rapid clicks stack
    // instead of re-sending the same stale value.
    const m = state.preview.match;
    const max = field === 'score' ? 8 : winsNeeded(m.seriesLength);
    const next = Math.min(max, Math.max(0, m[side][field] + Number(step)));
    m[side][field] = next;
    paintCounter(side, field, next);
    post({ match: { [side]: { [field]: next } } });
  });
}

// Debounced text fields, one timer per input so parallel edits never cancel
// each other. Battlefields are pickers now, not free text.
for (const [id, side, field] of [
  ['lname', 'left', 'name'], ['rname', 'right', 'name'],
  ['lname2', 'left', 'name2'], ['rname2', 'right', 'name2'],
  ['lteam', 'left', 'teamName'], ['rteam', 'right', 'teamName'],
  ['povlName', 'left', 'name'], ['povrName', 'right', 'name'],
  ['povlLegendText', 'left', 'legend'], ['povrLegendText', 'right', 'legend'],
  ['povlChampionText', 'left', 'champion'], ['povrChampionText', 'right', 'champion'],
]) {
  let timer = null;
  $(id).addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      post({ match: { [side]: { [field]: $(id).value } } });
    }, 300);
  });
}

$('seriesLength').addEventListener('change', () => {
  post({ match: { seriesLength: Number($('seriesLength').value) } });
});

$('resetMatch').addEventListener('click', () => {
  if (!confirm('Reset match in preview? Scores and game wins go to zero and all graphics switch off. Press TAKE afterward to put the reset on air.')) return;
  post({
    match: {
      left: { score: 0, gameWins: 0 },
      right: { score: 0, gameWins: 0 },
    },
    scenes: {
      scorebug: { visible: false }, cardpopup: { visible: false },
      igo1v1: { visible: false }, igo2v2: { visible: false }, pov: { visible: false },
    },
  });
});

// --- scene toggles (preview bank; TAKE commits) ---

$('toggleScorebug').addEventListener('click', () => {
  if (!state) return;
  post({ scenes: { scorebug: { visible: !state.preview.scenes.scorebug.visible } } });
});

$('toggleCard').addEventListener('click', () => {
  if (!state) return;
  const cp = state.preview.scenes.cardpopup;
  if (cp.card.cardId) post({ scenes: { cardpopup: { visible: !cp.visible } } });
});

// The two IGOs and the POV overlay all live on the screen edges and would
// draw over each other, so switching one on switches the others off in
// preview.
const EDGE_SCENES = ['igo1v1', 'igo2v2', 'pov'];
function toggleEdgeScene(key) {
  if (!state) return;
  const next = !state.preview.scenes[key].visible;
  const scenes = { [key]: { visible: next } };
  if (next) {
    for (const other of EDGE_SCENES) {
      if (other !== key) scenes[other] = { visible: false };
    }
  }
  post({ scenes });
}
$('toggleIgo').addEventListener('click', () => toggleEdgeScene('igo1v1'));
$('toggleIgo2').addEventListener('click', () => toggleEdgeScene('igo2v2'));
$('togglePov').addEventListener('click', () => toggleEdgeScene('pov'));

$('igoMode').addEventListener('change', () => {
  post({ scenes: { igo1v1: { mode: $('igoMode').value } } });
});
$('igo2Mode').addEventListener('change', () => {
  post({ scenes: { igo2v2: { mode: $('igo2Mode').value } } });
});

// --- catalog pickers: type-ahead dropdowns over legends and battlefields ---

let legendCatalog = [];
let battlefieldCatalog = [];
let championCatalog = [];
// The battlefield and champion catalogs are derived from the card index, so
// on a machine that has not downloaded the card database yet they come back
// empty with HTTP 200. That is not an error to retry on, but the pickers are
// dead until it changes, so the database poller calls this again once the
// index lands rather than waiting for the operator to reload the panel.
let catalogsReady = false;
async function loadCatalogs() {
  try {
    legendCatalog = (await (await fetch('/api/legends', { cache: 'no-store' })).json()).legends;
    battlefieldCatalog = (await (await fetch('/api/battlefields', { cache: 'no-store' })).json()).battlefields;
    championCatalog = (await (await fetch('/api/champions', { cache: 'no-store' })).json()).champions;
    catalogsReady = battlefieldCatalog.length > 0 && championCatalog.length > 0;
  } catch {
    catalogsReady = false;
    setTimeout(loadCatalogs, 3000);
  }
}
loadCatalogs();

// Generic wiring: filter a catalog as the operator types, click or Enter
// picks, clearing the field clears the assignment.
function wirePicker(inputId, listId, { search, renderItem, onPick, onClear }) {
  const input = $(inputId);
  const list = $(listId);
  const close = () => { list.classList.remove('open'); list.replaceChildren(); };
  const pick = (item) => {
    onPick(item);
    input.value = renderItem(item).label;
    close();
  };
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { onClear(); close(); return; }
    const hits = search(q).slice(0, 8);
    list.replaceChildren(...hits.map((item) => {
      const { label, icon } = renderItem(item);
      const li = document.createElement('li');
      if (icon) {
        const img = document.createElement('img');
        img.src = icon;
        img.alt = '';
        img.onerror = () => img.classList.add('hidden');
        li.append(img);
      }
      const meta = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = label;
      meta.append(name);
      li.append(meta);
      li.addEventListener('mousedown', (e) => { e.preventDefault(); pick(item); });
      return li;
    }));
    list.classList.toggle('open', hits.length > 0);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = input.value.trim().toLowerCase();
      // Every catalog entry contains the empty string, so without this an
      // Enter pressed just to dismiss the field would assign the catalog's
      // first legend or champion: wrong name, wrong art, no confirmation.
      // Nothing typed means nothing picked.
      if (!q) { close(); return; }
      const hit = search(q)[0];
      if (hit) pick(hit);
    }
    if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
}

// idField is the card id the POV legend art resolves against. The 2v2
// second-player pickers have none: that overlay draws hero cutouts only.
for (const [inputId, listId, side, nameField, slugField, idField] of [
  ['llegend', 'llegendResults', 'left', 'legend', 'legendSlug', 'legendCardId'],
  ['rlegend', 'rlegendResults', 'right', 'legend', 'legendSlug', 'legendCardId'],
  ['llegend2', 'llegend2Results', 'left', 'legend2', 'legendSlug2', null],
  ['rlegend2', 'rlegend2Results', 'right', 'legend2', 'legendSlug2', null],
  ['povlLegend', 'povlLegendResults', 'left', 'legend', 'legendSlug', 'legendCardId'],
  ['povrLegend', 'povrLegendResults', 'right', 'legend', 'legendSlug', 'legendCardId'],
]) {
  wirePicker(inputId, listId, {
    search: (q) => legendCatalog.filter((l) => l.name.toLowerCase().includes(q)),
    renderItem: (l) => ({ label: l.name, icon: `/legendart/icon/${l.slug}.webp` }),
    onPick: (l) => post({ match: { [side]: {
      [nameField]: l.name,
      [slugField]: l.slug,
      ...(idField ? { [idField]: l.cardId || '' } : {}),
    } } }),
    onClear: () => post({ match: { [side]: {
      [nameField]: '',
      [slugField]: '',
      ...(idField ? { [idField]: '' } : {}),
    } } }),
  });
}

for (const [inputId, listId, side, field, idField] of [
  ['lbf', 'lbfResults', 'left', 'battlefield', 'battlefieldCardId'],
  ['rbf', 'rbfResults', 'right', 'battlefield', 'battlefieldCardId'],
  ['lbf2', 'lbf2Results', 'left', 'battlefield2', null],
  ['rbf2', 'rbf2Results', 'right', 'battlefield2', null],
  ['povlBf', 'povlBfResults', 'left', 'battlefield', 'battlefieldCardId'],
  ['povrBf', 'povrBfResults', 'right', 'battlefield', 'battlefieldCardId'],
]) {
  wirePicker(inputId, listId, {
    search: (q) => battlefieldCatalog.filter((b) => b.cardName.toLowerCase().includes(q)),
    renderItem: (b) => ({ label: b.cardName, icon: `/cardart/thumb/${b.cardId}.webp` }),
    onPick: (b) => post({ match: { [side]: {
      [field]: b.cardName,
      ...(idField ? { [idField]: b.cardId } : {}),
    } } }),
    onClear: () => post({ match: { [side]: {
      [field]: '',
      ...(idField ? { [idField]: '' } : {}),
    } } }),
  });
}

// Champion unit picker. The POV overlay's CHAMPION line carries Riftbound's
// Champion Unit glyph in the designer file, so it names a champion unit card;
// picking one also stages it in that side's featured card slot (Sam, Loop 5).
for (const [inputId, listId, side] of [
  ['povlChampion', 'povlChampionResults', 'left'],
  ['povrChampion', 'povrChampionResults', 'right'],
]) {
  wirePicker(inputId, listId, {
    search: (q) => championCatalog.filter((c) => c.cardName.toLowerCase().includes(q)),
    renderItem: (c) => ({ label: c.cardName, icon: `/cardart/thumb/${c.cardId}.webp` }),
    onPick: (c) => post({ match: { [side]: {
      champion: c.cardName,
      card: { cardId: c.cardId, cardName: c.cardName },
    } } }),
    // Clearing the search clears the line only: a card the operator picked by
    // hand is never wiped by a stray backspace here.
    onClear: () => post({ match: { [side]: { champion: '' } } }),
  });
}

// Featured card search: any card, one independent search per side. The card
// catalog is too big to ship to the panel, so this goes through the server's
// ranked search, like the card popup does.
function wireCardSearch(inputId, listId, side) {
  const input = $(inputId);
  const list = $(listId);
  let timer = null;
  let hits = [];
  const close = () => { list.classList.remove('open'); list.replaceChildren(); };
  const stage = (card) => {
    post({ match: { [side]: { card: { cardId: card.cardId, cardName: card.cardName } } } });
    input.value = card.cardName;
    hits = [];
    close();
  };
  const draw = () => {
    list.replaceChildren(...hits.map((card) => {
      const li = document.createElement('li');
      const img = document.createElement('img');
      img.src = `/cardart/thumb/${card.cardId}.webp`;
      img.alt = '';
      img.onerror = () => img.classList.add('hidden');
      const meta = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = card.cardName;
      const sub = document.createElement('span');
      sub.textContent = [card.cardType, card.cardId].filter(Boolean).join(' \u00b7 ');
      meta.append(name, sub);
      li.append(img, meta);
      li.addEventListener('mousedown', (e) => { e.preventDefault(); stage(card); });
      return li;
    }));
    list.classList.toggle('open', hits.length > 0);
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { hits = []; draw(); return; }
    timer = setTimeout(async () => {
      try {
        const data = await (await fetch(`/api/cards/search?q=${encodeURIComponent(q)}`)).json();
        hits = data.indexed ? data.results : [];
        draw();
      } catch { /* the server comes back; the next keystroke searches again */ }
    }, 200);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && hits.length) stage(hits[0]);
    if (e.key === 'Escape') { hits = []; draw(); }
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
}
wireCardSearch('povlCard', 'povlCardResults', 'left');
wireCardSearch('povrCard', 'povrCardResults', 'right');

// --- POV overlay controls ---

for (const [id, side] of [['povlCardClear', 'left'], ['povrCardClear', 'right']]) {
  $(id).addEventListener('click', () => {
    post({ match: { [side]: { card: { cardId: '', cardName: '' } } } });
    $(side === 'left' ? 'povlCard' : 'povrCard').value = '';
  });
}

// Direct score entry, for jumping to a number instead of stepping to it.
for (const [id, side] of [['povlScore', 'left'], ['povrScore', 'right']]) {
  const el = $(id);
  const commit = () => {
    const raw = el.value.trim();
    const parsed = Math.trunc(Number(raw));
    // Unparseable input puts back the number that is on the graphic. Zeroing a
    // live score because someone fat-fingered a letter is not a recovery.
    const current = state ? state.preview.match[side].score : 0;
    const next = raw !== '' && Number.isFinite(parsed)
      ? Math.min(8, Math.max(0, parsed))
      : current;
    el.value = String(next);
    if (state) state.preview.match[side].score = next;
    $(`${side === 'left' ? 'l' : 'r'}scoreOut`).textContent = next;
    post({ match: { [side]: { score: next } } });
  };
  el.addEventListener('change', commit);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { commit(); el.blur(); } });
}

$('povlShow').addEventListener('change', () => post({ scenes: { pov: { showLeft: $('povlShow').checked } } }));
$('povrShow').addEventListener('change', () => post({ scenes: { pov: { showRight: $('povrShow').checked } } }));

// Swap sides moves the whole side, so the score bug and the in-game overlays
// follow the POV instead of disagreeing with it.
const SWAP_FIELDS = [
  'name', 'legend', 'legendSlug', 'legendCardId', 'battlefield', 'battlefieldCardId',
  'champion', 'name2', 'legend2', 'legendSlug2', 'battlefield2', 'teamName',
  'score', 'gameWins',
];
$('povSwap').addEventListener('click', () => {
  if (!state) return;
  const m = state.preview.match;
  const copy = (side) => {
    const out = { card: { ...m[side].card } };
    for (const field of SWAP_FIELDS) out[field] = m[side][field];
    return out;
  };
  post({ match: { left: copy('right'), right: copy('left') } });
});

$('povReset').addEventListener('click', () => {
  post({
    match: {
      left: { champion: '', card: { cardId: '', cardName: '' } },
      right: { champion: '', card: { cardId: '', cardName: '' } },
    },
  });
  for (const id of ['povlCard', 'povrCard', 'povlChampion', 'povrChampion']) $(id).value = '';
});

// --- browser source URLs: always visible, copy failure never silent ---

$('outputUrl').value = `${location.origin}/output/`;
$('scorebugUrl').value = `${location.origin}/scenes/scorebug/?transparent=1`;
$('cardpopupUrl').value = `${location.origin}/scenes/cardpopup/?transparent=1`;
$('igoUrl').value = `${location.origin}/scenes/igo1v1/?transparent=1`;
$('igo2Url').value = `${location.origin}/scenes/igo2v2/?transparent=1`;
$('povUrl').value = `${location.origin}/scenes/pov/?transparent=1`;
$('decklistUrl').value = `${location.origin}/scenes/decklist/?transparent=1`;

for (const input of document.querySelectorAll('.url-input')) {
  input.addEventListener('focus', () => input.select());
}
for (const btn of document.querySelectorAll('button[data-copy]')) {
  btn.addEventListener('click', async () => {
    const input = $(btn.dataset.copy);
    try {
      await navigator.clipboard.writeText(input.value);
      btn.textContent = 'Copied!';
    } catch {
      // Clipboard can be unavailable (unfocused document, some embeds):
      // select the text and tell the operator what to press.
      input.focus();
      input.select();
      btn.textContent = 'Press Ctrl+C';
    }
    setTimeout(() => { btn.textContent = 'Copy'; }, 1800);
  });
}

// --- card search and staging ---

let searchTimer = null;
let results = [];

function renderResults() {
  const list = $('cardResults');
  list.replaceChildren(...results.map((c, i) => {
    const li = document.createElement('li');
    const img = document.createElement('img');
    img.src = `/cardart/thumb/${c.cardId}.webp`;
    img.alt = '';
    img.onerror = () => img.classList.add('hidden');
    const meta = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = c.cardName;
    const sub = document.createElement('span');
    sub.textContent = [c.cardType, c.cardId].filter(Boolean).join(' · ');
    meta.append(name, sub);
    li.append(img, meta);
    li.tabIndex = 0;
    li.addEventListener('click', () => stageCard(i));
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter') stageCard(i); });
    return li;
  }));
  list.classList.toggle('open', results.length > 0);
}

function stageCard(i) {
  const c = results[i];
  if (!c) return;
  // Staging switches the popup on in preview so a single TAKE airs it.
  post({ scenes: { cardpopup: { visible: true, card: { cardId: c.cardId, cardName: c.cardName, cardType: c.cardType } } } });
  results = [];
  renderResults();
  $('cardSearch').value = c.cardName;
}

$('cardSearch').addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = $('cardSearch').value.trim();
  if (q.length < 2) { results = []; renderResults(); return; }
  searchTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/cards/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!data.indexed) {
        results = [];
        renderResults();
        $('dbStatus').textContent = 'Download the card database in Setup to search cards.';
        return;
      }
      results = data.results;
      renderResults();
    } catch { /* server will come back; search again on next keystroke */ }
  }, 200);
});

// Enter stages the top result: fewest clicks for a solo operator.
$('cardSearch').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && results.length) stageCard(0);
  if (e.key === 'Escape') { results = []; renderResults(); }
});

// --- theme controls ---

let accentTimer = null;
for (const id of ['accentA', 'accentB']) {
  $(id).addEventListener('input', () => {
    clearTimeout(accentTimer);
    accentTimer = setTimeout(() => {
      post({ theme: { accentA: $('accentA').value, accentB: $('accentB').value } });
    }, 150);
  });
}

async function loadFontList() {
  try {
    const data = await (await fetch('/api/fonts', { cache: 'no-store' })).json();
    const sel = $('fontSelect');
    const current = state?.theme.font || data.active || '';
    sel.replaceChildren(
      Object.assign(document.createElement('option'), { value: '', textContent: 'TES default' }),
      ...data.fonts.map((f) => Object.assign(document.createElement('option'), {
        value: f.family,
        textContent: f.cached ? f.family : `${f.family} (downloads on pick)`,
      })),
    );
    for (const opt of sel.options) {
      if (opt.value) opt.style.fontFamily = `'${opt.value}', sans-serif`;
    }
    sel.value = current;
  } catch { /* retried next poll */ }
}

$('fontSelect').addEventListener('change', async () => {
  const family = $('fontSelect').value;
  if (!family) { post({ theme: { font: '' } }); return; }
  $('fontStatus').textContent = `Getting ${family} ready…`;
  try {
    const res = await (await fetch('/api/fonts/download', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ family }),
    })).json();
    if (!res.ok) {
      $('fontStatus').textContent = `Could not download ${family}: ${res.error}. Is the internet up?`;
      $('fontSelect').value = state?.theme.font || '';
      return;
    }
    post({ theme: { font: family } });
    $('fontStatus').textContent = `${family} is saved on this computer and works offline.`;
    loadFontList();
  } catch {
    $('fontStatus').textContent = 'Font download failed. Check the connection and try again.';
  }
});

$('logoFile').addEventListener('change', async () => {
  const file = $('logoFile').files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase().replace('jpeg', 'jpg');
  const res = await fetch(`/api/theme/logo?ext=${encodeURIComponent(ext)}`, {
    method: 'POST',
    body: await file.arrayBuffer(),
  }).then((r) => r.json()).catch(() => ({ ok: false, error: 'upload failed' }));
  if (!res.ok) alert(`Logo upload failed: ${res.error}`);
  $('logoFile').value = '';
});

$('logoRemove').addEventListener('click', () => post({ theme: { logo: '' } }));

$('themeReset').addEventListener('click', () => {
  post({ theme: { accentA: '#11b6fb', accentB: '#1bef19', font: '', logo: '' } });
});

// --- card database status and downloads ---

let dbPollTimer = null;

function describeDb(s) {
  if (s.progress.phase === 'index') return 'Downloading the card index…';
  if (s.progress.phase === 'thumbs') return `Downloading card thumbnails: ${s.progress.done} of ${s.progress.total}`;
  if (s.progress.phase === 'full') return `Downloading full card art: ${s.progress.done} of ${s.progress.total}`;
  if (!s.indexed) return 'Not downloaded yet. Card search needs the database: press "Download card database".';
  const bits = [`${s.cardCount} cards`, `${s.thumbsCached} thumbnails saved`];
  if (s.fullCached) bits.push(`${s.fullCached} full art files saved`);
  let text = bits.join(', ') + '.';
  if (s.progress.lastError) text += ` Last download problem: ${s.progress.lastError}`;
  else if (s.progress.errors) text += ` ${s.progress.errors} files failed last run, run the download again to retry.`;
  return text;
}

async function pollDbStatus() {
  try {
    const s = await (await fetch('/api/cards/status', { cache: 'no-store' })).json();
    // A finished first-run download is what fills the catalogs the pickers read.
    if (s.indexed && !catalogsReady) loadCatalogs();
    $('dbStatus').textContent = describeDb(s);
    const busy = s.progress.phase !== 'idle';
    $('dbSync').disabled = busy;
    $('dbSync').textContent = s.indexed ? 'Check for new sets' : 'Download card database';
    $('dbPrefetchFull').disabled = busy || !s.indexed;
    $('dbProgressWrap').classList.toggle('hidden', !busy || !s.progress.total);
    if (busy && s.progress.total) {
      $('dbProgress').style.width = `${Math.round((s.progress.done / s.progress.total) * 100)}%`;
    }
    clearTimeout(dbPollTimer);
    dbPollTimer = setTimeout(pollDbStatus, busy ? 700 : 5000);
  } catch {
    clearTimeout(dbPollTimer);
    dbPollTimer = setTimeout(pollDbStatus, 3000);
  }
}

$('dbSync').addEventListener('click', async () => {
  await fetch('/api/cards/sync', { method: 'POST' });
  pollDbStatus();
});
$('dbPrefetchFull').addEventListener('click', async () => {
  await fetch('/api/cards/prefetch-full', { method: 'POST' });
  pollDbStatus();
});

pollDbStatus();
loadFontList();

// --- decklist ---
//
// The server owns parsing and name resolution, so the count the operator reads
// here is the same one the plate draws.

let deckTimer = null;
let summarisedList = null;

async function summariseDeck(list) {
  if (!list.trim()) { $('deckSummary').textContent = 'Nothing pasted yet.'; return; }
  try {
    const d = await (await fetch('/api/decklist/parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ list }),
    })).json();
    const bits = [`${d.counts.main} main`];
    if (d.counts.sideboard) bits.push(`${d.counts.sideboard} sideboard`);
    if (d.counts.runes) bits.push(`${d.counts.runes} runes`);
    if (d.counts.unresolved) bits.push(`${d.counts.unresolved} not in the card database`);
    $('deckSummary').textContent = bits.join(', ') + '.'
      + (d.warnings.length ? ' ' + d.warnings[0] : '');
  } catch {
    $('deckSummary').textContent = 'Could not read that list.';
  }
}

$('deckList').addEventListener('input', () => {
  clearTimeout(deckTimer);
  const list = $('deckList').value;
  deckTimer = setTimeout(() => {
    post({ scenes: { decklist: { list } } });
    summariseDeck(list);
  }, 400);
});

$('deckSideboard').addEventListener('change', () => {
  post({ scenes: { decklist: { showSideboard: $('deckSideboard').checked } } });
});

$('deckClear').addEventListener('click', () => {
  if (!confirm('Clear the decklist in preview?')) return;
  $('deckList').value = '';
  post({ scenes: { decklist: { list: '', visible: false } } });
  summariseDeck('');
});

$('toggleDeck').addEventListener('click', () => {
  if (!state) return;
  post({ scenes: { decklist: { visible: !state.preview.scenes.decklist.visible } } });
});

// --- update channel ---
//
// The launch prompt in the app's own window is the main path; this banner is
// the second chance, so a skipped update can be taken between matches instead
// of waiting for the next restart. Polling is slow on purpose: the answer
// only changes when a release is published.

const NEWLINE = String.fromCharCode(10);
let updateInfo = null;
let updatePollTimer = null;

function renderUpdate(u) {
  updateInfo = u;
  $('versionLine').textContent = `Sideways Studio ${u.currentVersion}`
    + (u.phase === 'disabled' ? ' (running from source, updates are off)' : '');
  $('updateCheck').disabled = u.phase === 'disabled' || u.phase === 'checking';

  const busy = u.phase === 'downloading' || u.phase === 'verifying' || u.phase === 'ready';
  const show = u.phase === 'available' || busy || u.phase === 'error';
  $('updateBar').classList.toggle('hidden', !show);
  if (!show) return;

  if (u.phase === 'error') {
    $('updateHeadline').textContent = 'Update failed';
    $('updateNotes').textContent = u.error || '';
    $('updateProgress').textContent = '';
  } else if (busy) {
    $('updateHeadline').textContent = u.phase === 'ready'
      ? 'Update ready, restarting'
      : `Downloading ${u.version}`;
    $('updateNotes').textContent = u.phase === 'ready'
      ? 'The app closes and reopens on its own. Your browser sources reconnect.'
      : '';
    $('updateProgress').textContent = u.phase === 'verifying' ? 'checking the download' : `${u.progress}%`;
  } else {
    $('updateHeadline').textContent = u.required
      ? `Required update: ${u.currentVersion} to ${u.version}`
      : `Update available: ${u.currentVersion} to ${u.version}`;
    $('updateNotes').textContent = (u.notes || '').split(NEWLINE)[0];
    $('updateProgress').textContent = '';
  }
  $('updateInstall').disabled = busy;
  $('updateInstall').textContent = u.phase === 'error' ? 'Try again' : 'Install and restart';
  // A required release has no skip: that is the point of marking one.
  $('updateSkip').classList.toggle('hidden', busy || u.required || u.phase === 'error');
}

async function pollUpdate(interval = 300000) {
  try {
    renderUpdate(await (await fetch('/api/update/status', { cache: 'no-store' })).json());
  } catch { /* the app may be restarting into the new version */ }
  clearTimeout(updatePollTimer);
  const fast = updateInfo && ['downloading', 'verifying', 'checking'].includes(updateInfo.phase);
  updatePollTimer = setTimeout(() => pollUpdate(interval), fast ? 500 : interval);
}

$('updateCheck').addEventListener('click', async () => {
  $('updateCheck').disabled = true;
  $('updateCheck').textContent = 'Checking…';
  try {
    const u = await (await fetch('/api/update/check', { method: 'POST' })).json();
    renderUpdate(u);
    if (u.phase === 'uptodate') $('versionLine').textContent = `Sideways Studio ${u.currentVersion}, up to date`;
    else if (u.error) $('versionLine').textContent = `Sideways Studio ${u.currentVersion}, could not reach the update server`;
  } catch { /* leave the line as it was */ }
  $('updateCheck').textContent = 'Check for updates';
  $('updateCheck').disabled = false;
  pollUpdate();
});

$('updateInstall').addEventListener('click', async () => {
  if (!confirm('Install the update now? The graphics stop while the app restarts, so do this between matches.')) return;
  $('updateInstall').disabled = true;
  await fetch('/api/update/install', { method: 'POST' }).catch(() => {});
  pollUpdate();
});

$('updateSkip').addEventListener('click', async () => {
  await fetch('/api/update/skip', { method: 'POST' }).catch(() => {});
  pollUpdate();
});

pollUpdate();

// --- sync: same contract as the stage client ---

let version = -1;

function apply(s) {
  if (!s || !Number.isInteger(s.version) || s.version <= version) return;
  version = s.version;
  render(s);
}

async function fullFetch() {
  try {
    const res = await fetch('/api/state', { cache: 'no-store' });
    if (res.ok) { apply(await res.json()); setStatus(true); }
  } catch {
    setStatus(false);
  }
}

function connect() {
  const ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'state') apply(msg.state);
    } catch { /* ignore */ }
  };
  ws.onopen = () => { setStatus(true); fullFetch(); };
  ws.onclose = () => { setStatus(false); setTimeout(connect, 1500); };
  ws.onerror = () => ws.close();
}

fullFetch();
connect();
