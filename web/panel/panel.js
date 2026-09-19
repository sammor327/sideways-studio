import {
  COLOR_HELP, COLOR_KEYS, COLOR_LABELS, DESIGNED, LOOK_SCENES, PRESETS, SCENE_LABELS, resolveLook,
} from '../shared/look.js';
import { renderLookBuilder } from './lookbuilder.js';
import { renderPlatform } from './platform.js';
import { renderRiftAtlas } from './riftatlas.js';
import { setClock } from '../shared/clockcells.js';
import { setOffline } from '../shared/offline.js';
import { refreshFontSheet } from '../shared/fontsheet.js';

import { BRACKET_FORMATS, buildBracket } from '../shared/bracket.js';
import { SPONSOR_MAX, sponsorDock } from '../shared/sponsor.js';
import { SCENE_SOURCES } from '../shared/sources.js';
import { legendsFromStandings, legendsToText, parseLegendLines, resolveLegend } from '../shared/legendstats.js';

const $ = (id) => document.getElementById(id);
const winsNeeded = (seriesLength) => Math.ceil(seriesLength / 2);
const SIDES = [['l', 'left'], ['r', 'right']];

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
  // Disconnected means the app is closed: nothing here can work, so the page
  // says so over the whole surface until the reconnect loop gets through. An
  // update restart is the one planned outage, and gets the softer line.
  setOffline(!ok, { restarting: !ok && updateInfo?.phase === 'ready' });
}

// --- which graphic draws which field ---
//
// Every graphic reads the same match data (the score bug and the POV print the
// same points, the IGOs and the POV the same legend), so the panel keeps one
// field per fact and this map says which graphic draws which: each row label
// names its graphics, and a graphic put in preview opens and flashes its rows.
const SCENE_FIELDS = {
  scorebug: ['seriesLength', 'name', 'score', 'gameWins'],
  igo1v1: ['seriesLength', 'name', 'gameWins', 'legend', 'battlefield'],
  igo2v2: ['seriesLength', 'teamName', 'name', 'name2', 'gameWins',
    'legend', 'legend2', 'battlefield', 'battlefield2'],
  igodual: ['seriesLength', 'name', 'score', 'gameWins', 'seed', 'legend', 'legendText',
    'battlefield', 'champion', 'championText', 'eventName', 'roundTitle', 'timer', 'hand', 'handCount'],
  igobars: ['name', 'name2', 'score', 'legend', 'legendText', 'legend2',
    'champion', 'championText', 'champion2'],
  pov: ['name', 'score', 'legend', 'legendText', 'battlefield',
    'champion', 'championText', 'card'],
  // From the September 2026 broadcast scouting.
  igoportrait: ['seriesLength', 'name', 'score', 'gameWins', 'seed', 'record', 'country', 'legend', 'legendText',
    'champion', 'championText', 'archetype', 'handCount', 'turn', 'eventName', 'roundTitle', 'roundsRemaining', 'timer', 'card'],
  igorows: ['seriesLength', 'name', 'score', 'gameWins', 'record', 'country', 'pronouns', 'legend', 'legendText',
    'champion', 'championText', 'archetype', 'handCount', 'hand', 'turn', 'roundTitle', 'battlefield', 'battlefieldPool'],
  arenabug: ['seriesLength', 'name', 'score', 'gameWins', 'record', 'country', 'legend', 'legendText', 'eventName', 'roundTitle', 'timer'],
  slate: ['eventName', 'roundTitle', 'countdown', 'tables', 'casters', 'seeds', 'schedule', 'format', 'commands', 'sponsors', 'nextEvent', 'champion', 'name', 'country', 'legend', 'record'],
  handfan: ['name', 'country', 'legend', 'legendText', 'hand', 'handCount', 'roundTitle', 'timer', 'turn'],
  showdown: ['name', 'country', 'legend', 'hand', 'handCount', 'showdown'],
  // The starter kit (2026-09-15).
  cornertag: ['name', 'roundTitle', 'eventName', 'countdown'],
  lowerthird: ['name', 'country', 'legend', 'legendText', 'seed', 'record', 'bestFinish', 'eventName', 'roundTitle', 'casters'],
  headtohead: ['seriesLength', 'name', 'country', 'legend', 'legendText', 'seed', 'record', 'pronouns', 'playerTeam', 'seasonRecord', 'bestFinish', 'card', 'choseFirst', 'roundTitle', 'eventName'],
  profile: ['name', 'country', 'legend', 'legendText', 'seed', 'record', 'pronouns', 'playerTeam', 'seasonRecord', 'archetype', 'store', 'finishes', 'eventName', 'roundTitle', 'deck'],
  bracket: ['bracket', 'eventName'],
  standings: ['standings', 'eventName', 'roundTitle'],
  legendstats: ['legendStats', 'eventName'],
  pairings: ['pairings', 'eventName', 'roundTitle'],
  result: ['seriesLength', 'name', 'country', 'legend', 'legendText', 'score', 'gameWins', 'result', 'roundTitle', 'eventName'],
  sponsor: [],
  // The decks round (2026-09-18).
  matchup: ['seriesLength', 'name', 'country', 'legend', 'legendText', 'champion', 'championText', 'battlefield', 'gameWins', 'roundTitle', 'eventName'],
  sideboard: ['name', 'country', 'legend', 'deck'],
  decklists: ['name', 'country', 'legend', 'record', 'deck'],
  // The VS head to head (2026-09-19).
  vscard: ['name', 'legend', 'legendText', 'roundTitle', 'eventName'],
  // The card popup and the card row carry their content in their own
  // Graphic features groups (the search, the four slots), not in Match data;
  // listed so putting them in preview unfolds that card.
  cardpopup: [],
  cardrow: [],
};
const SCENE_NAMES = {
  scorebug: 'the score bug',
  igo1v1: 'the 1v1 overlay',
  igo2v2: 'the 2v2 overlay',
  igodual: 'the dual-column overlay',
  igobars: 'the 2v2 bars overlay',
  pov: 'the POV overlay',
  igoportrait: 'the portrait pillars overlay',
  igorows: 'the rows overlay',
  arenabug: 'the arena score bug',
  slate: 'the slate',
  handfan: 'the hand fan',
  showdown: 'the showdown',
  decklist: 'the decklist',
  cardpopup: 'the card popup',
  cardrow: 'the card row',
  cornertag: 'the corner tag',
  lowerthird: 'the lower third',
  headtohead: 'the match card',
  profile: 'the player profile',
  bracket: 'the bracket',
  standings: 'the standings',
  legendstats: 'the legend distribution',
  pairings: 'the pairings',
  result: 'the result strip',
  sponsor: 'the sponsor plate',
  matchup: 'the game intro',
  sideboard: 'the sideboard fly-in',
  decklists: 'the side by side decklists',
  vscard: 'the VS head to head',
};

// Short names for the on-air list, which lives in the narrow column between
// the monitors and has no room for "In-game overlay, portrait pillars".
const SCENE_SHORT = {
  scorebug: 'Score bug', cardpopup: 'Card popup', cardrow: 'Card row', igo1v1: '1v1 overlay', igo2v2: '2v2 overlay',
  igodual: 'Dual columns', igobars: '2v2 bars', pov: 'POV', decklist: 'Decklist',
  igoportrait: 'Portrait pillars', igorows: 'Rows', arenabug: 'Arena bug', slate: 'Slate',
  handfan: 'Hand fan', showdown: 'Showdown',
  cornertag: 'Corner tag', lowerthird: 'Lower third', headtohead: 'Match card', profile: 'Profile', bracket: 'Bracket', standings: 'Standings', pairings: 'Pairings', result: 'Result',
  legendstats: 'Legends', sponsor: 'Sponsor',
  matchup: 'Game intro', sideboard: 'Sideboard', decklists: 'Decklists 2up', vscard: 'VS card',
};
// Whether one graphic, set up the way preview has it, draws one field on one
// side. Webcam holders are windows for camera sources, so they draw no legend
// art, and a hidden POV column takes all of its text and art with it.
function sceneDraws(scene, field, side, bank) {
  if (!SCENE_FIELDS[scene].includes(field)) return false;
  const cfg = bank.scenes[scene];
  // The dual overlay and the 2v2 bars still name the legend on their tiles
  // in webcam mode; the sidebars draw nothing for it then.
  if (cfg.mode === 'webcam' && !['igodual', 'igobars', 'igoportrait', 'igorows'].includes(scene) && (field === 'legend' || field === 'legend2')) return false;
  if (scene === 'pov' && side && !(side === 'left' ? cfg.showLeft : cfg.showRight)) return false;
  if (scene === 'igodual') {
    if (!cfg.eventBlock && ['eventName', 'roundTitle', 'timer'].includes(field)) return false;
    if (!cfg.clock && field === 'timer') return false;
    if (!cfg.hand && ['hand', 'handCount'].includes(field)) return false;
  }
  if (scene === 'igoportrait') {
    if (!cfg.topBar && ['seriesLength', 'score', 'gameWins', 'timer', 'turn'].includes(field)) return false;
    if (!cfg.cardWell && field === 'card') return false;
  }
  if (scene === 'igorows') {
    if ((cfg.battlefields || 'off') === 'off' && ['battlefield', 'battlefieldPool'].includes(field)) return false;
    if (cfg.battlefields === 'one' && field === 'battlefieldPool') return false;
    if (!cfg.hand && ['hand', 'handCount'].includes(field)) return false;
    if (cfg.points === false && field === 'score') return false;
    if (cfg.turnCounter === false && cfg.activeTurn === false && field === 'turn') return false;
  }
  if (scene === 'showdown' && !cfg.hands && ['hand', 'handCount'].includes(field)) return false;
  if (scene === 'arenabug' && !cfg.clock && field === 'timer') return false;
  if (scene === 'slate') {
    if (field === 'seeds' && cfg.mode !== 'upnext') return false;
    if (field === 'tables' && !['upnext', 'starting', 'brb'].includes(cfg.mode)) return false;
    if (['schedule', 'format', 'sponsors'].includes(field) && cfg.mode !== 'starting' && !(field === 'sponsors' && cfg.mode === 'brb')) return false;
    if (field === 'commands' && cfg.mode !== 'brb') return false;
    if (['nextEvent', 'champion', 'name', 'country', 'legend', 'record'].includes(field) && cfg.mode !== 'thanks') return false;
    if (!cfg.countdown && field === 'countdown') return false;
    if (field === 'casters' && !['upnext', 'custom'].includes(cfg.mode)) return false;
  }
  // One-player graphics draw only the side they are set to.
  if ((scene === 'profile' || (scene === 'lowerthird' && cfg.mode === 'interview')) && side && cfg.side !== side) return false;
  if (scene === 'sideboard' && side && cfg.side !== 'both' && cfg.side !== side) return false;
  if (scene === 'profile' && !cfg.decklist && field === 'deck') return false;
  if (scene === 'profile' && cfg.decklist && field === 'finishes') return false;
  if (scene === 'lowerthird') {
    if (cfg.mode === 'casters' && !['casters', 'eventName', 'roundTitle'].includes(field)) return false;
    if (cfg.mode === 'coming' && !['name', 'roundTitle', 'eventName'].includes(field)) return false;
    if (cfg.mode === 'interview' && field === 'casters') return false;
  }
  if (scene === 'cornertag') {
    if (cfg.mode === 'match' && field === 'eventName') return false;
    if (cfg.mode === 'round' && field === 'name') return false;
    if (cfg.mode === 'custom' && ['name', 'roundTitle', 'eventName'].includes(field)) return false;
  }
  return true;
}

function listNames(keys) {
  const names = keys.map((key) => SCENE_NAMES[key]);
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// The label column says which graphics draw each row, so the map above is
// readable without picking every chip in turn.
for (const row of document.querySelectorAll('.field-row')) {
  const users = Object.keys(SCENE_FIELDS).filter((key) => SCENE_FIELDS[key].includes(row.dataset.field));
  if (!users.length) continue;
  const label = row.querySelector('.row-label');
  const drawn = `Shown on ${listNames(users)}.`;
  label.title = label.title ? `${label.title} ${drawn}` : drawn;
}

// --- rendering ---

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

  const dualPrev = s.preview.scenes.igodual;
  const dualBtn = $('toggleIgoDual');
  dualBtn.textContent = dualPrev.visible ? 'ON' : 'OFF';
  dualBtn.classList.toggle('on', dualPrev.visible);
  $('igoDualOnAir').classList.toggle('hidden', !s.program.scenes.igodual.visible);
  if (document.activeElement !== $('igoDualMode')) $('igoDualMode').value = dualPrev.mode;
  if (document.activeElement !== $('igoDualHandStyle')) $('igoDualHandStyle').value = dualPrev.handStyle || 'list';
  for (const [id, flag] of [['igoDualTrack', 'track'], ['igoDualEvent', 'eventBlock'], ['igoDualClock', 'clock'], ['igoDualCard', 'cardSlot'], ['igoDualHand', 'hand'], ['igoDualHandArt', 'handArt']]) {
    if (document.activeElement !== $(id)) $(id).checked = dualPrev[flag];
  }

  const barsPrev = s.preview.scenes.igobars;
  const barsBtn = $('toggleIgoBars');
  barsBtn.textContent = barsPrev.visible ? 'ON' : 'OFF';
  barsBtn.classList.toggle('on', barsPrev.visible);
  $('igoBarsOnAir').classList.toggle('hidden', !s.program.scenes.igobars.visible);
  if (document.activeElement !== $('igoBarsMode')) $('igoBarsMode').value = barsPrev.mode;

  const povPrev = s.preview.scenes.pov;
  const povBtn = $('togglePov');
  povBtn.textContent = povPrev.visible ? 'ON' : 'OFF';
  povBtn.classList.toggle('on', povPrev.visible);
  $('povOnAir').classList.toggle('hidden', !s.program.scenes.pov.visible);
  for (const [id, flag] of [['povShowLeft', povPrev.showLeft], ['povShowRight', povPrev.showRight]]) {
    if (document.activeElement !== $(id)) $(id).checked = flag;
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
  if (document.activeElement !== $('deckBackground')) $('deckBackground').checked = dk.background !== false;
  renderDeckLibrary();
  renderDeckFocus();

  const cp = s.preview.scenes.cardpopup;
  const cpAir = s.program.scenes.cardpopup.visible;
  const cardBtn = $('toggleCard');
  cardBtn.textContent = cp.visible ? 'ON' : 'OFF';
  cardBtn.classList.toggle('on', cp.visible);
  cardBtn.title = cp.card.cardId ? '' : 'Nothing staged: opens the card search under Graphic features';
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

// What a picker holds, the way the featured card shows it (Sam, 2026-09-17):
// the card beside the search box, and a Clear that is only live when there is
// something to clear. `base` is the input's id; its thumbnail and button are
// `<base>Thumb` and `<base>Clear`.
function renderPickThumb(base, src, filled) {
  const thumb = $(`${base}Thumb`);
  $(`${base}Clear`).disabled = !filled;
  if (!src) {
    thumb.classList.add('hidden');
    thumb.removeAttribute('src');
    return;
  }
  if (thumb.getAttribute('src') !== src) {
    thumb.onerror = () => thumb.classList.add('hidden');
    thumb.onload = () => thumb.classList.remove('hidden');
    thumb.src = src;
  }
}
const cardThumbSrc = (cardId) => (cardId ? `/cardart/thumb/${cardId}.webp` : '');
// Battlefields and champions are stored by name on most lines; the catalog
// the picker searched knows the card behind the name.
const catalogCardId = (catalog, name) => {
  const hit = name ? catalog.find((c) => c.cardName === name) : null;
  return hit ? hit.cardId : '';
};
// A legend shows its card; one picked before the card ids were kept falls
// back to its icon.
const legendThumbSrc = (cardId, slug) => cardThumbSrc(cardId) || (slug ? `/legendart/icon/${slug}.webp` : '');

function renderFeaturedCard(p, card) {
  renderPickThumb(`${p}card`, cardThumbSrc(card.cardId), Boolean(card.cardId));
}

// --- the look: colours and backgrounds, global or per graphic ---
//
// Scope 'global' edits theme.look (and the top-level accents); a scene key
// edits that graphic's own override, which only counts while "own look" is
// on. Every colour control shows the value that would air for the scope and
// a clear button that drops it back to the designed colour. Nothing here is
// cued: the look is setup, like the logo, and airs as it is edited.

let lookScope = 'global';
const LOOK_KEY = 'sidewaysStudio.lookScope';
try {
  const saved = localStorage.getItem(LOOK_KEY);
  if (saved === 'global' || LOOK_SCENES.includes(saved)) lookScope = saved;
} catch { /* per-session only */ }

$('lookScope').replaceChildren(
  Object.assign(document.createElement('option'), { value: 'global', textContent: 'All graphics' }),
  ...LOOK_SCENES.map((key) => Object.assign(document.createElement('option'), { value: key, textContent: SCENE_LABELS[key] })),
);
$('lookScope').value = lookScope;
$('lookScope').addEventListener('change', () => {
  lookScope = $('lookScope').value;
  try { localStorage.setItem(LOOK_KEY, lookScope); } catch { /* ignore */ }
  if (state) renderLook(state.theme);
});

// Where a patch for the current scope lands.
function lookPatch(fields) {
  if (lookScope === 'global') {
    const { accentA, accentB, ...rest } = fields;
    const theme = { look: rest };
    if (accentA !== undefined) theme.accentA = accentA;
    if (accentB !== undefined) theme.accentB = accentB;
    return { theme };
  }
  return { theme: { scenes: { [lookScope]: fields } } };
}

// The stored (possibly empty) fields for the scope, and the values that air.
function scopeStored(t) {
  return lookScope === 'global' ? t.look : t.scenes[lookScope];
}
function scopeEffective(t) {
  // For "all graphics" the preview colour is what an unthemed graphic shows:
  // the dual overlay's designed set, since it is the most complete.
  return resolveLook(t, lookScope === 'global' ? 'igodual' : lookScope);
}

const COLOR_ROWS = [
  ['accentA', 'Accent 1', 'Player 1 side, the first colour of the accent gradient.'],
  ['accentB', 'Accent 2', 'Player 2 side, the second colour of the accent gradient.'],
  ...COLOR_KEYS.map((key) => [key, COLOR_LABELS[key], COLOR_HELP[key]]),
];
$('lookColors').replaceChildren(...COLOR_ROWS.map(([key, label, help]) => {
  const row = document.createElement('div');
  row.className = 'look-color';
  row.dataset.key = key;
  row.title = help;
  const name = document.createElement('span');
  name.textContent = label;
  const input = document.createElement('input');
  input.type = 'color';
  input.id = `look-${key}`;
  input.setAttribute('aria-label', label);
  const clear = document.createElement('button');
  clear.className = 'clear-x';
  clear.textContent = '\u00d7';
  clear.title = 'Back to the designed colour';
  clear.setAttribute('aria-label', `Clear ${label}`);
  row.append(name, input, clear);
  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => post(lookPatch(colorField(key, input.value))), 120);
  });
  clear.addEventListener('click', () => post(lookPatch(colorField(key, ''))));
  return row;
}));
function colorField(key, value) {
  return key === 'accentA' || key === 'accentB' ? { [key]: value } : { colors: { [key]: value } };
}

$('presetRow').replaceChildren(...PRESETS.map((preset) => {
  const btn = document.createElement('button');
  btn.className = 'preset';
  btn.textContent = preset.name;
  btn.title = preset.hint;
  btn.addEventListener('click', () => {
    // A preset restates every colour it names and clears the rest, so two
    // presets in a row never blend.
    const fields = {
      accentA: preset.look.accentA || '',
      accentB: preset.look.accentB || '',
      colors: Object.fromEntries(COLOR_KEYS.map((k) => [k, (preset.look.colors || {})[k] || ''])),
      background: {
        kind: '', color: '', color2: '', angle: '', grain: '', dim: '',
        ...(preset.look.background || {}),
      },
    };
    if (lookScope !== 'global') fields.enabled = true;
    post(lookPatch(fields));
  });
  return btn;
}));

$('lookOwn').addEventListener('change', () => {
  if (lookScope === 'global') return;
  const on = $('lookOwn').checked;
  const fields = { enabled: on };
  // Switching a graphic to its own look starts it from what it shows now, so
  // nothing jumps on air.
  if (on && state) {
    const eff = resolveLook(state.theme, lookScope);
    fields.accentA = eff.accentA;
    fields.accentB = eff.accentB;
    fields.colors = { ...eff.colors };
    // The image stays whatever this graphic's own upload is; a copied URL
    // would be refused by the sanitizer anyway.
    const { image, ...background } = eff.background;
    fields.background = background;
  }
  post(lookPatch(fields));
});

$('bgKind').addEventListener('change', () => post(lookPatch({ background: { kind: $('bgKind').value } })));
for (const [id, key] of [['bgColor', 'color'], ['bgColor2', 'color2']]) {
  let timer = null;
  $(id).addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => post(lookPatch({ background: { [key]: $(id).value } })), 120);
  });
}
for (const [id, key] of [['bgAngle', 'angle'], ['bgGrain', 'grain'], ['bgDim', 'dim']]) {
  let timer = null;
  $(id).addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => post(lookPatch({ background: { [key]: Number($(id).value) } })), 100);
  });
}

// --- upload guidance ---
//
// The server caps the logo at 2 MB and a background at 6 MB and refuses
// anything else with a one-line error, so the checks here exist to say so
// BEFORE a 40 MB photo is sent, and to warn (not block) when an image is
// smaller than the surface it will be stretched over. Sizes below are the
// design pixels each surface paints at on a 1920x1080 output.
const MB = 1024 * 1024;
const LOGO_RULE = { label: 'logo', maxBytes: 2 * MB, min: [720, 440] };
// Backgrounds are cover-fit: scaled to fill the surface and cropped, so
// the useful advice is the surface's shape, not just its size.
const BG_SURFACES = {
  global: { size: [1920, 1080], text: '1920 × 1080 covers everything: the decklist uses all of it, and the sidebars and columns show its middle. For a columns-only look use a portrait image, about 700 × 1080.' },
  decklist: { size: [1920, 1080], text: 'Full frame, 1920 × 1080.' },
  igodual: { size: [700, 1080], text: 'Each column is 350 × 1080 and shows the same image, scaled to fill and cropped, so a portrait image (about 700 × 1080) works best; a landscape photo shows only a narrow slice.' },
  igo1v1: { size: [610, 1080], text: 'The sidebar is a 305 × 1080 strip on the right; a portrait image (about 610 × 1080) works best. Landscape photos show their middle.' },
  igobars: { size: [1920, 108], text: 'Paints the two bars, full-width strips 1920 × 54 along the top and bottom edges; a wide, quiet texture works best. The tiles hanging off them keep the Panels colour.' },
  igo2v2: { size: [820, 1080], text: 'The sidebar is a 412 × 1080 strip on the right; a portrait image (about 820 × 1080) works best. Landscape photos show their middle.' },
  pov: { size: [528, 622], text: 'Paints the navy panels inside each 264 × 311 column frame, so a small image (about 528 × 622) is enough; detail will not read at that size.' },
  scorebug: { size: [1040, 128], text: 'Paints the two name plates, wide strips about 520 × 64 each; a wide, quiet texture works best.' },
  cardpopup: { size: [1240, 120], text: 'Paints the name plate under the card, a strip up to 620 × 60; a wide, quiet texture works best.' },
};
function bgAdvice(scope) {
  const s = BG_SURFACES[scope] || BG_SURFACES.global;
  return `PNG, JPG or WebP under 6 MB. ${s.text}`;
}

// Read the pixel size of an image file; null when it cannot be read (an
// SVG, or a browser without createImageBitmap), which skips the warning.
async function imageSize(file) {
  if (!('createImageBitmap' in window) || /svg/i.test(file.type)) return null;
  try {
    const bmp = await createImageBitmap(file);
    const size = [bmp.width, bmp.height];
    bmp.close();
    return size;
  } catch {
    return null;
  }
}

// True when the upload should go ahead.
async function checkUpload(file, rule) {
  if (file.size > rule.maxBytes) {
    alert(`That ${rule.label} is ${(file.size / MB).toFixed(1)} MB; the limit is ${rule.maxBytes / MB} MB. Export it smaller (a JPG or WebP at the recommended size is usually well under 1 MB).`);
    return false;
  }
  const size = await imageSize(file);
  if (size && (size[0] < rule.min[0] * 0.75 || size[1] < rule.min[1] * 0.75)) {
    return confirm(`That ${rule.label} is ${size[0]} × ${size[1]}, smaller than the recommended ${rule.min[0]} × ${rule.min[1]}, so it may look soft on air. Upload it anyway?`);
  }
  return true;
}

$('bgFile').addEventListener('change', async () => {
  const file = $('bgFile').files[0];
  if (!file) return;
  const surface = BG_SURFACES[lookScope] || BG_SURFACES.global;
  if (!(await checkUpload(file, { label: 'background', maxBytes: 6 * MB, min: surface.size }))) {
    $('bgFile').value = '';
    return;
  }
  const ext = file.name.split('.').pop().toLowerCase().replace('jpeg', 'jpg');
  const res = await fetch(`/api/theme/image?slot=${encodeURIComponent(lookScope)}&ext=${encodeURIComponent(ext)}`, {
    method: 'POST',
    body: await file.arrayBuffer(),
  }).then((r) => r.json()).catch(() => ({ ok: false, error: 'upload failed' }));
  if (!res.ok) alert(`Background upload failed: ${res.error}`);
  else if (lookScope !== 'global') post(lookPatch({ enabled: true }));
  $('bgFile').value = '';
});
$('bgRemove').addEventListener('click', () => post(lookPatch({ background: { image: '', kind: '' } })));

function renderLook(t) {
  const stored = scopeStored(t);
  const eff = scopeEffective(t);
  const global = lookScope === 'global';
  $('lookOwnRow').classList.toggle('hidden', global);
  $('lookGlobalOnly').classList.toggle('hidden', !global);
  if (!global && document.activeElement !== $('lookOwn')) $('lookOwn').checked = Boolean(stored.enabled);
  // A scene without its own look shows the inherited values, dimmed, so the
  // operator sees what it airs and where the values come from.
  const inert = !global && !stored.enabled;
  $('lookColors').classList.toggle('inert', inert);
  $('presetRow').classList.toggle('inert', false);
  document.querySelector('.look-bg').classList.toggle('inert', inert);

  for (const row of document.querySelectorAll('.look-color')) {
    const key = row.dataset.key;
    const input = row.querySelector('input');
    const isAccent = key === 'accentA' || key === 'accentB';
    const storedValue = isAccent ? (global ? t[key] : stored[key]) : stored.colors[key];
    const effective = isAccent ? eff[key] : (eff.colors[key] || eff.accentA);
    if (document.activeElement !== input) input.value = effective;
    row.classList.toggle('is-set', Boolean(storedValue));
    row.querySelector('button').disabled = !storedValue || (global && isAccent);
  }

  const b = stored.background;
  const ebg = eff.background;
  if (document.activeElement !== $('bgKind')) $('bgKind').value = b.kind || '';
  const kind = ebg.kind;
  $('bgColorRow').classList.toggle('hidden', kind === 'transparent');
  $('bgColor2Row').classList.toggle('hidden', kind !== 'gradient');
  $('bgAngleRow').classList.toggle('hidden', kind !== 'gradient');
  $('bgImageRow').classList.toggle('hidden', !(b.kind === 'image' || b.image));
  $('bgHint').classList.toggle('hidden', !(b.kind === 'image' || b.image));
  for (const [id, key] of [['bgColor', 'color'], ['bgColor2', 'color2']]) {
    if (document.activeElement !== $(id)) $(id).value = ebg[key];
  }
  for (const [id, key] of [['bgAngle', 'angle'], ['bgGrain', 'grain'], ['bgDim', 'dim']]) {
    if (document.activeElement !== $(id)) $(id).value = String(ebg[key]);
  }
  const bgPreview = $('bgPreview');
  if (b.image) {
    let img = bgPreview.querySelector('img');
    if (!img) { bgPreview.replaceChildren(); img = document.createElement('img'); bgPreview.appendChild(img); }
    if (img.getAttribute('src') !== b.image) img.src = b.image;
  } else {
    bgPreview.replaceChildren(Object.assign(document.createElement('span'), { className: 'muted', textContent: 'No image' }));
  }
  $('bgRemove').disabled = !b.image;
  $('bgHint').textContent = bgAdvice(lookScope);
  $('themeReset').textContent = global ? 'Reset to designed look' : `Reset ${SCENE_LABELS[lookScope]}`;

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
  $('igoRowsLogoRemove').disabled = !t.logo;
}

// Never clobber a field the operator is typing in.
const setIfIdle = (id, value) => {
  const el = $(id);
  if (document.activeElement !== el) el.value = value;
};

function render(s) {
  state = s;
  const m = s.preview.match;
  for (const [p, side] of SIDES) {
    const sd = m[side];
    setIfIdle(`${p}name`, sd.name);
    setIfIdle(`${p}score`, String(sd.score));
    $(`${p}winsOut`).textContent = sd.gameWins;
    // The legend picker and its "shown as" line are one field: the picker
    // fills it, the line edits the text without moving the art.
    setIfIdle(`${p}legend`, sd.legend || '');
    setIfIdle(`${p}legendText`, sd.legend || '');
    setIfIdle(`${p}bf`, sd.battlefield || '');
    setIfIdle(`${p}champion`, sd.champion || '');
    setIfIdle(`${p}championText`, sd.champion || '');
    setIfIdle(`${p}card`, sd.card.cardName || '');
    renderFeaturedCard(p, sd.card);
    setIfIdle(`${p}team`, sd.teamName || '');
    setIfIdle(`${p}name2`, sd.name2 || '');
    setIfIdle(`${p}legend2`, sd.legend2 || '');
    setIfIdle(`${p}champion2`, sd.champion2 || '');
    setIfIdle(`${p}bf2`, sd.battlefield2 || '');
    setIfIdle(`${p}seed`, sd.seed || '');
    renderPickThumb(`${p}legend`, legendThumbSrc(sd.legendCardId, sd.legendSlug), Boolean(sd.legend));
    renderPickThumb(`${p}legend2`, legendThumbSrc(sd.legendCardId2, sd.legendSlug2), Boolean(sd.legend2));
    renderPickThumb(`${p}bf`, cardThumbSrc(sd.battlefieldCardId || catalogCardId(battlefieldCatalog, sd.battlefield)), Boolean(sd.battlefield));
    renderPickThumb(`${p}bf2`, cardThumbSrc(catalogCardId(battlefieldCatalog, sd.battlefield2)), Boolean(sd.battlefield2));
    renderPickThumb(`${p}champion`, cardThumbSrc(catalogCardId(championCatalog, sd.champion)), Boolean(sd.champion));
    renderPickThumb(`${p}champion2`, cardThumbSrc(catalogCardId(championCatalog, sd.champion2)), Boolean(sd.champion2));
  }
  $('seriesLength').value = String(m.seriesLength);
  setIfIdle('eventName', s.preview.event.name || '');
  setIfIdle('roundTitle', s.preview.event.roundTitle || '');
  renderClock(m.timer);

  renderScenes(s);
  renderCardrow(s);
  renderOnAir(s);
  renderLook(s.theme);
  renderLookBuilder(s);
  renderPlatform(s);
  renderRiftAtlas(s);
  renderDecks(s);
  renderExtras(s);
  revealNewGraphics(s);

  // The TAKE button lights up whenever preview differs from what is on air.
  const pending = JSON.stringify(s.preview) !== JSON.stringify(s.program);
  $('takeBtn').classList.toggle('pending', pending);
}

// --- bus controls ---

$('takeBtn').addEventListener('click', () => post({ action: 'take' }));
// Two clears (Sam, 2026-09-16): CLEAR PROGRAM is the on-air recovery, every
// graphic off air with preview untouched; CLEAR PREVIEW empties the preview
// bank so the next TAKE airs a clean frame, with nothing on air changing.
$('clearBtn').addEventListener('click', () => post({ action: 'clear' }));
$('clearPreviewBtn').addEventListener('click', () => {
  armedFeatures.clear();
  post({ action: 'clearpreview' });
});

// What is on air, named under CLEAR. CLEAR is the whole-show recovery; this
// list is the aimed one, so the operator drops the graphic that should not be
// up without taking down the ones that should. Preview keeps what it holds,
// so TAKE puts a graphic back.
const takeOffAir = (key) => post({ action: 'off', scene: key });

// The same list for the preview bank, in green above it (Sam, 2026-09-17):
// what the next TAKE will air, and the X takes that one graphic back out of
// preview without touching anything on air.
const takeOutOfPreview = (key) => post({ scenes: { [key]: { visible: false } } });

const BUS_LISTS = [
  { bank: 'program', list: 'onAirList', rows: 'onAirRows', drop: takeOffAir, tip: (name) => `Take ${name} off air` },
  { bank: 'preview', list: 'previewList', rows: 'previewRows', drop: takeOutOfPreview, tip: (name) => `Take ${name} out of preview` },
];
const busShown = {};

function renderOnAir(s) {
  for (const { bank, list, rows, drop, tip } of BUS_LISTS) {
    const keys = Object.keys(s[bank].scenes).filter((key) => s[bank].scenes[key].visible);
    const signature = keys.join(',');
    if (signature === busShown[bank]) continue;
    busShown[bank] = signature;
    $(list).classList.toggle('hidden', !keys.length);
    $(rows).replaceChildren(...keys.map((key) => {
      const row = document.createElement('div');
      row.className = 'air-row';
      const name = document.createElement('span');
      name.className = 'air-name';
      name.textContent = SCENE_SHORT[key] || key;
      const off = document.createElement('button');
      off.type = 'button';
      off.className = 'air-x';
      off.textContent = '\u00d7';
      off.title = tip(SCENE_NAMES[key] || key);
      off.setAttribute('aria-label', off.title);
      off.addEventListener('click', () => drop(key));
      row.append(name, off);
      return row;
    }));
  }
}

// --- match data (all edits land in the preview bank) ---

function paintCounter(side, field, value) {
  const p = side === 'left' ? 'l' : 'r';
  if (field === 'score') setIfIdle(`${p}score`, String(value));
  else if (field === 'handCount') $(`${p}handOut`).textContent = value;
  else $(`${p}winsOut`).textContent = value;
}

for (const btn of document.querySelectorAll('.counter button')) {
  btn.addEventListener('click', () => {
    if (!state) return;
    const { side, field, step } = btn.dataset;
    // Optimistic: mutate the local copy immediately so rapid clicks stack
    // instead of re-sending the same stale value.
    const m = state.preview.match;
    const max = field === 'score' ? 8 : (field === 'handCount' ? 20 : winsNeeded(m.seriesLength));
    const next = Math.min(max, Math.max(0, m[side][field] + Number(step)));
    m[side][field] = next;
    paintCounter(side, field, next);
    if (field === 'handCount') renderHandChips(side === 'left' ? 'l' : 'r', m[side]);
    post({ match: { [side]: { [field]: next } } });
  });
}

// Direct score entry, for jumping to a number instead of stepping to it.
for (const [p, side] of SIDES) {
  const el = $(`${p}score`);
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
    post({ match: { [side]: { score: next } } });
  };
  el.addEventListener('change', commit);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { commit(); el.blur(); } });
}

// Debounced text fields, one timer per input so parallel edits never cancel
// each other. The two "shown as" lines write the same field their picker does.
for (const [p, side] of SIDES) {
  for (const [id, field] of [
    [`${p}name`, 'name'], [`${p}name2`, 'name2'], [`${p}team`, 'teamName'],
    [`${p}legendText`, 'legend'], [`${p}championText`, 'champion'], [`${p}seed`, 'seed'],
    [`${p}playerTeam`, 'team'], [`${p}store`, 'store'], [`${p}seasonRecord`, 'seasonRecord'], [`${p}bestFinish`, 'bestFinish'], [`${p}finishes`, 'finishes'],
  ]) {
    const el = $(id);
    let timer = null;
    const flush = () => {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
      post({ match: { [side]: { [field]: el.value } } });
    };
    el.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(flush, 300);
    });
    // Leaving the field sends the edit at once. Otherwise a counter click
    // inside the debounce window repaints this now-idle field from the older
    // state, and the timer then posts that instead of what was typed.
    el.addEventListener('blur', flush);
  }
}

$('seriesLength').addEventListener('change', () => {
  post({ match: { seriesLength: Number($('seriesLength').value) } });
});

$('resetMatch').addEventListener('click', () => {
  if (!confirm('Reset match in preview? Scores and game wins go to zero and all graphics switch off. Press TAKE afterward to put the reset on air.')) return;
  // A new match: no battlefield has been played yet.
  const unplayed = (side) => (state ? state.preview.match[side].battlefields || [] : []).map((b) => ({ ...b, played: false }));
  post({
    match: {
      left: { score: 0, gameWins: 0, battlefields: unplayed('left') },
      right: { score: 0, gameWins: 0, battlefields: unplayed('right') },
      choseFirst: '', result: { winner: '', note: '' },
    },
    scenes: {
      scorebug: { visible: false }, cardpopup: { visible: false }, cardrow: { visible: false },
      igo1v1: { visible: false }, igo2v2: { visible: false }, igodual: { visible: false }, igobars: { visible: false },
      pov: { visible: false },
      igoportrait: { visible: false }, igorows: { visible: false }, arenabug: { visible: false }, slate: { visible: false },
      handfan: { visible: false }, showdown: { visible: false },
      cornertag: { visible: false }, lowerthird: { visible: false }, headtohead: { visible: false }, profile: { visible: false },
      bracket: { visible: false }, standings: { visible: false }, legendstats: { visible: false }, pairings: { visible: false }, result: { visible: false }, sponsor: { visible: false },
      matchup: { visible: false }, sideboard: { visible: false }, decklists: { visible: false }, vscard: { visible: false },
    },
  });
  post({ action: 'turn', op: 'reset' });
});

// Swap sides moves the whole side, so every graphic follows at once instead
// of one disagreeing with another.
const SWAP_FIELDS = [
  'name', 'legend', 'legendSlug', 'legendCardId', 'battlefield', 'battlefieldCardId',
  'champion', 'name2', 'legend2', 'legendSlug2', 'legendCardId2', 'battlefield2', 'teamName',
  'champion2', 'score', 'gameWins', 'seed',
  'record', 'country', 'pronouns', 'archetype', 'handCount', 'hand', 'handUnknown',
  'team', 'store', 'seasonRecord', 'bestFinish', 'finishes',
  'deckList', 'deckName', 'battlefields',
];
$('swapSides').addEventListener('click', () => {
  if (!state) return;
  const m = state.preview.match;
  const copy = (side) => {
    const out = { card: { ...m[side].card } };
    for (const field of SWAP_FIELDS) out[field] = m[side][field];
    return out;
  };
  post({ match: { left: copy('right'), right: copy('left') } });
});

// --- scene toggles (preview bank; TAKE commits) ---

$('toggleScorebug').addEventListener('click', () => {
  if (!state) return;
  post({ scenes: { scorebug: { visible: !state.preview.scenes.scorebug.visible } } });
});

// With nothing staged these open their Graphic features group to pick cards
// (toggleScene), the same as a click on the picture.
$('toggleCard').addEventListener('click', () => toggleScene('cardpopup'));
$('toggleCardrow').addEventListener('click', () => toggleScene('cardrow'));
$('cardrowBackground').addEventListener('change', () => {
  post({ scenes: { cardrow: { background: $('cardrowBackground').checked } } });
});

// The IGOs and the POV overlay all live on the screen edges and would draw
// over each other, so switching one on switches the others off in preview.
const EDGE_SCENES = ['igo1v1', 'igo2v2', 'igodual', 'igobars', 'pov', 'igoportrait', 'igorows'];
function setEdgeScene(key, next) {
  const scenes = { [key]: { visible: next } };
  if (next) {
    for (const other of EDGE_SCENES) {
      if (other !== key) scenes[other] = { visible: false };
    }
  }
  post({ scenes });
}
function toggleEdgeScene(key) {
  if (!state) return;
  setEdgeScene(key, !state.preview.scenes[key].visible);
}
$('toggleIgo').addEventListener('click', () => toggleEdgeScene('igo1v1'));
$('toggleIgo2').addEventListener('click', () => toggleEdgeScene('igo2v2'));
$('toggleIgoDual').addEventListener('click', () => toggleEdgeScene('igodual'));
$('toggleIgoBars').addEventListener('click', () => toggleEdgeScene('igobars'));
$('togglePov').addEventListener('click', () => toggleEdgeScene('pov'));

$('igoDualMode').addEventListener('change', () => {
  post({ scenes: { igodual: { mode: $('igoDualMode').value } } });
});
for (const [id, flag] of [['igoDualTrack', 'track'], ['igoDualEvent', 'eventBlock'], ['igoDualClock', 'clock'], ['igoDualCard', 'cardSlot'], ['igoDualHand', 'hand'], ['igoDualHandArt', 'handArt']]) {
  $(id).addEventListener('change', () => post({ scenes: { igodual: { [flag]: $(id).checked } } }));
}
$('igoDualHandStyle').addEventListener('change', () => post({ scenes: { igodual: { handStyle: $('igoDualHandStyle').value } } }));
$('igoBarsMode').addEventListener('change', () => {
  post({ scenes: { igobars: { mode: $('igoBarsMode').value } } });
});

// --- event fields and the round clock ---

for (const [id, field] of [['eventName', 'name'], ['roundTitle', 'roundTitle']]) {
  const el = $(id);
  let timer = null;
  const flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    post({ event: { [field]: el.value } });
  };
  el.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(flush, 300); });
  el.addEventListener('blur', flush);
}

// The clock is a cue: start, pause, reset and set act on both banks, so the
// overlay on air follows without a TAKE. The panel shows the same arithmetic
// the scene draws.
let clockState = { running: false, startedAt: 0, elapsed: 0, countdown: 0 };
function clockText(t) {
  const total = t.elapsed + (t.running ? Date.now() - t.startedAt : 0);
  const ms = t.countdown > 0 ? Math.max(0, t.countdown - total) : total;
  const s = Math.floor(ms / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}
function renderClock(t) {
  if (!t) return;
  clockState = t;
  setClock($('clockOut'), clockText(t));
  $('clockStart').textContent = t.running ? 'Pause' : 'Start';
  $('clockStart').classList.toggle('on', t.running);
  if (document.activeElement !== $('clockMinutes')) $('clockMinutes').value = String(Math.round(t.countdown / 60000));
}
setInterval(() => { if (clockState.running) setClock($('clockOut'), clockText(clockState)); }, 500);
$('clockStart').addEventListener('click', () => post({ action: 'timer', op: clockState.running ? 'pause' : 'start' }));
$('clockReset').addEventListener('click', () => post({ action: 'timer', op: 'reset' }));
$('clockSet').addEventListener('click', () => {
  const minutes = Math.max(0, Math.min(600, Math.trunc(Number($('clockMinutes').value)) || 0));
  post({ action: 'timer', op: 'set', minutes });
});
$('clockMinutes').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('clockSet').click(); });

$('igoMode').addEventListener('change', () => {
  post({ scenes: { igo1v1: { mode: $('igoMode').value } } });
});
$('igo2Mode').addEventListener('change', () => {
  post({ scenes: { igo2v2: { mode: $('igo2Mode').value } } });
});

$('povShowLeft').addEventListener('change', () => post({ scenes: { pov: { showLeft: $('povShowLeft').checked } } }));
$('povShowRight').addEventListener('change', () => post({ scenes: { pov: { showRight: $('povShowRight').checked } } }));

$('povReset').addEventListener('click', () => {
  post({
    match: {
      left: { champion: '', card: { cardId: '', cardName: '' } },
      right: { champion: '', card: { cardId: '', cardName: '' } },
    },
  });
  for (const id of ['lcard', 'rcard', 'lchampion', 'rchampion', 'lchampionText', 'rchampionText']) $(id).value = '';
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
    if (state) render(state);
  } catch {
    catalogsReady = false;
    setTimeout(loadCatalogs, 3000);
  }
}
loadCatalogs();

// The data panel scrolls, and its lowest pickers sit near the bottom of the
// window: a list with no room below opens upward instead of off the card.
function placeList(input, list) {
  const box = input.closest('.card');
  if (!box) return;
  const frame = box.getBoundingClientRect();
  const at = input.getBoundingClientRect();
  const below = frame.bottom - at.bottom;
  list.classList.toggle('up', below < 270 && at.top - frame.top > below);
}

// Generic wiring: filter a catalog as the operator types, click or Enter
// picks, clearing the field clears the assignment. Leaving the field without
// picking puts back what is actually assigned, so a half-typed search never
// reads as the data that will air.
function wirePicker(inputId, listId, { search, renderItem, onPick, onClear, current }) {
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
    placeList(input, list);
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
  input.addEventListener('blur', () => setTimeout(() => {
    close();
    if (document.activeElement !== input && state) input.value = current();
  }, 150));
  // The X beside the field clears the assignment, the same as emptying the
  // search by hand.
  const clearBtn = $(`${inputId}Clear`);
  if (clearBtn) clearBtn.addEventListener('click', () => { onClear(); input.value = ''; close(); });
}

// idField is the card id the legend art resolves against on the POV, the
// dual columns and the 2v2 bars (the sidebars draw hero cutouts by slug).
for (const [p, side] of SIDES) {
  for (const [inputId, nameField, slugField, idField] of [
    [`${p}legend`, 'legend', 'legendSlug', 'legendCardId'],
    [`${p}legend2`, 'legend2', 'legendSlug2', 'legendCardId2'],
  ]) {
    wirePicker(inputId, `${inputId}Results`, {
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
      current: () => state.preview.match[side][nameField] || '',
    });
  }

  for (const [inputId, field, idField] of [
    [`${p}bf`, 'battlefield', 'battlefieldCardId'],
    [`${p}bf2`, 'battlefield2', null],
  ]) {
    wirePicker(inputId, `${inputId}Results`, {
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
      current: () => state.preview.match[side][field] || '',
    });
  }

  // Champion unit picker. The POV overlay's CHAMPION line carries Riftbound's
  // Champion Unit glyph in the designer file, so it names a champion unit
  // card; picking one also stages it as that side's featured card (Sam, Loop 5).
  wirePicker(`${p}champion`, `${p}championResults`, {
    search: (q) => championCatalog.filter((c) => c.cardName.toLowerCase().includes(q)),
    renderItem: (c) => ({ label: c.cardName, icon: `/cardart/thumb/${c.cardId}.webp` }),
    onPick: (c) => post({ match: { [side]: {
      champion: c.cardName,
      card: { cardId: c.cardId, cardName: c.cardName },
    } } }),
    // Clearing the search clears the line only: a card the operator picked by
    // hand is never wiped by a stray backspace here.
    onClear: () => post({ match: { [side]: { champion: '' } } }),
    current: () => state.preview.match[side].champion || '',
  });

  // The teammate's champion line, for the 2v2 bars' second tile. A line
  // only: the featured card stays the first player's.
  wirePicker(`${p}champion2`, `${p}champion2Results`, {
    search: (q) => championCatalog.filter((c) => c.cardName.toLowerCase().includes(q)),
    renderItem: (c) => ({ label: c.cardName, icon: `/cardart/thumb/${c.cardId}.webp` }),
    onPick: (c) => post({ match: { [side]: { champion2: c.cardName } } }),
    onClear: () => post({ match: { [side]: { champion2: '' } } }),
    current: () => state.preview.match[side].champion2 || '',
  });
}

// Featured card search: any card, one independent search per side. The card
// catalog is too big to ship to the panel, so this goes through the server's
// ranked search, like the card popup does.
function wireCardSearch(p, side) {
  const input = $(`${p}card`);
  const list = $(`${p}cardResults`);
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
      sub.textContent = [card.cardType, card.cardId].filter(Boolean).join(' · ');
      meta.append(name, sub);
      li.append(img, meta);
      li.addEventListener('mousedown', (e) => { e.preventDefault(); stage(card); });
      return li;
    }));
    placeList(input, list);
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
  input.addEventListener('blur', () => setTimeout(() => {
    close();
    if (document.activeElement !== input && state) input.value = state.preview.match[side].card.cardName || '';
  }, 150));

  $(`${p}cardClear`).addEventListener('click', () => {
    post({ match: { [side]: { card: { cardId: '', cardName: '' } } } });
    input.value = '';
  });
}
for (const [p, side] of SIDES) wireCardSearch(p, side);

// --- browser source URLs: always visible, copy failure never silent ---

$('outputUrl').value = `${location.origin}/output/`;
$('scorebugUrl').value = `${location.origin}/scenes/scorebug/?transparent=1`;
$('cardpopupUrl').value = `${location.origin}/scenes/cardpopup/?transparent=1`;
$('cardrowUrl').value = `${location.origin}/scenes/cardrow/?transparent=1`;
$('igoUrl').value = `${location.origin}/scenes/igo1v1/?transparent=1`;
$('igo2Url').value = `${location.origin}/scenes/igo2v2/?transparent=1`;
$('igoDualUrl').value = `${location.origin}/scenes/igodual/?transparent=1`;
$('igoBarsUrl').value = `${location.origin}/scenes/igobars/?transparent=1`;
$('povUrl').value = `${location.origin}/scenes/pov/?transparent=1`;
$('decklistUrl').value = `${location.origin}/scenes/decklist/?transparent=1`;
$('igoPortraitUrl').value = `${location.origin}/scenes/igoportrait/?transparent=1`;
$('igoRowsUrl').value = `${location.origin}/scenes/igorows/?transparent=1`;
$('arenaUrl').value = `${location.origin}/scenes/arenabug/?transparent=1`;
$('sponsorUrl').value = `${location.origin}/scenes/sponsor/?transparent=1`;
$('slateUrl').value = `${location.origin}/scenes/slate/?transparent=1`;
$('handfanUrl').value = `${location.origin}/scenes/handfan/?transparent=1`;
$('showdownUrl').value = `${location.origin}/scenes/showdown/?transparent=1`;
for (const key of ['cornertag', 'lowerthird', 'headtohead', 'vscard', 'profile', 'bracket', 'standings', 'legendstats', 'pairings', 'result', 'matchup', 'sideboard', 'decklists']) {
  $(`${key}Url`).value = `${location.origin}/scenes/${key}/?transparent=1`;
}

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
  // The search can sit low in Graphic features, so its list opens upward when
  // there is no room below.
  placeList($('cardSearch'), list);
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

// --- card row: four slots, each its own search, and the highlight star ---
//
// Slots are positional so an operator can swap card 2 without touching the
// rest: a pick sends the four slots with one changed, an empty sends null in
// that slot. Picking into any slot switches the row on in preview (the
// popup's staging rule); the star is the focus cue and acts on air at once.

function wireRowSlot(i) {
  const input = $(`rowCard${i}`);
  const list = $(`rowCard${i}Results`);
  let hits = [];
  let timer = null;
  const close = () => { list.classList.remove('open'); list.replaceChildren(); };
  const current = () => (state ? state.preview.scenes.cardrow.cards[i].cardName || '' : '');
  const slotsWith = (card) => state.preview.scenes.cardrow.cards.map((c, k) => (k === i ? card : c));
  const pick = (card) => {
    if (!state) return;
    post({ scenes: { cardrow: { visible: true, cards: slotsWith({ cardId: card.cardId, cardName: card.cardName, cardType: card.cardType }) } } });
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
      sub.textContent = [card.cardType, card.cardId].filter(Boolean).join(' · ');
      meta.append(name, sub);
      li.append(img, meta);
      li.addEventListener('mousedown', (e) => { e.preventDefault(); pick(card); });
      return li;
    }));
    placeList(input, list);
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
    if (e.key === 'Enter' && hits.length) pick(hits[0]);
    if (e.key === 'Escape') { hits = []; draw(); }
  });
  input.addEventListener('blur', () => setTimeout(() => {
    close();
    if (document.activeElement !== input && state) input.value = current();
  }, 150));
  $(`rowClear${i}`).addEventListener('click', () => {
    if (!state) return;
    post({ scenes: { cardrow: { cards: slotsWith(null) } } });
    input.value = '';
  });
  $(`rowFocus${i}`).addEventListener('click', () => {
    if (!state) return;
    const now = state.preview.scenes.cardrow.focus;
    post({ action: 'focus', scene: 'cardrow', slot: now === i ? -1 : i });
  });
}
for (let i = 0; i < 4; i += 1) wireRowSlot(i);

function renderCardrow(s) {
  const cr = s.preview.scenes.cardrow;
  const any = cr.cards.some((c) => c.cardId);
  const btn = $('toggleCardrow');
  btn.textContent = cr.visible ? 'ON' : 'OFF';
  btn.classList.toggle('on', cr.visible);
  btn.title = any ? '' : 'No cards picked: opens the card row slots under Graphic features';
  $('cardrowOnAir').classList.toggle('hidden', !s.program.scenes.cardrow.visible);
  if (document.activeElement !== $('cardrowBackground')) $('cardrowBackground').checked = cr.background !== false;
  cr.cards.forEach((c, i) => {
    setIfIdle(`rowCard${i}`, c.cardName || '');
    const thumb = $(`rowThumb${i}`);
    if (c.cardId) {
      const src = `/cardart/thumb/${c.cardId}.webp`;
      if (thumb.getAttribute('src') !== src) {
        thumb.onerror = () => thumb.classList.add('hidden');
        thumb.onload = () => thumb.classList.remove('hidden');
        thumb.src = src;
      }
    } else {
      thumb.classList.add('hidden');
      thumb.removeAttribute('src');
    }
    $(`rowClear${i}`).disabled = !c.cardId;
    const star = $(`rowFocus${i}`);
    star.disabled = !c.cardId;
    star.classList.toggle('on', cr.focus === i && Boolean(c.cardId));
  });
}

// --- decks and battlefields (2026-09-18) ---
//
// Each player's own list (the sideboard fly-in and the side by side
// decklists draw it) and the three battlefields they brought (the rows
// overlay lists them). A deck comes from the saved library or a paste, and
// loading one fills the player's battlefields from its Battlefields section,
// keeping the played mark of any that stay. This game makes a battlefield
// the one in play; the server marks it played as it does.

const deckSummaries = new Map();
async function deckSummary(list) {
  if (!list.trim()) return null;
  if (deckSummaries.has(list)) return deckSummaries.get(list);
  try {
    const res = await fetch('/api/decklist/parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ list }),
    });
    const deck = res.ok ? await res.json() : null;
    if (deck) {
      deckSummaries.set(list, deck);
      if (deckSummaries.size > 16) deckSummaries.delete(deckSummaries.keys().next().value);
    }
    return deck;
  } catch {
    return null;
  }
}

async function loadSideDeck(side, list, deckName) {
  const before = state ? (state.preview.match[side].battlefields || []) : [];
  await post({ match: { [side]: { deckList: list, deckName } } });
  const deck = await deckSummary(list);
  if (!deck || !deck.battlefields.length) return;
  const played = new Map(before.map((b) => [b.name.toLowerCase(), b.played]));
  post({ match: { [side]: { battlefields: deck.battlefields.slice(0, 3).map((b) => ({
    name: b.name,
    cardId: b.cardId || '',
    played: played.get(b.name.toLowerCase()) || false,
  })) } } });
}

// Populate from decklist (Sam, 2026-09-18): the player's legend, champion
// and three battlefields from their own list, as if each were picked by
// hand. The legend brings its slug and card id (so its art lands
// everywhere), the champion its card, staged as the featured card as the
// champion picker does, and the battlefields keep any played marks. The
// button says what it filled.
async function fillFromDeck(side, btn) {
  const sd = state && state.preview.match[side];
  const deck = sd ? await deckSummary(sd.deckList || '') : null;
  const patch = {};
  const got = [];
  if (deck && deck.legend) {
    const l = legendCatalog.find((x) => x.cardId && x.cardId === deck.legend.cardId)
      || legendCatalog.find((x) => x.name.toLowerCase() === deck.legend.name.toLowerCase());
    Object.assign(patch, l
      ? { legend: l.name, legendSlug: l.slug, legendCardId: l.cardId || deck.legend.cardId || '' }
      : { legend: deck.legend.name, legendSlug: '', legendCardId: deck.legend.cardId || '' });
    got.push('legend');
  }
  if (deck && deck.champion) {
    const c = championCatalog.find((x) => x.cardId === deck.champion.cardId)
      || championCatalog.find((x) => x.cardName.toLowerCase() === deck.champion.name.toLowerCase());
    const name = c ? c.cardName : deck.champion.name;
    Object.assign(patch, { champion: name, card: { cardId: c ? c.cardId : (deck.champion.cardId || ''), cardName: name } });
    got.push('champion');
  }
  if (deck && deck.battlefields.length) {
    const played = new Map((sd.battlefields || []).map((b) => [b.name.toLowerCase(), b.played]));
    patch.battlefields = deck.battlefields.slice(0, 3).map((b) => ({
      name: b.name,
      cardId: b.cardId || '',
      played: played.get(b.name.toLowerCase()) || false,
    }));
    got.push(`${patch.battlefields.length} battlefield${patch.battlefields.length === 1 ? '' : 's'}`);
  }
  if (got.length) post({ match: { [side]: patch } });
  const said = got.length ? `Filled the ${got.join(', ')}`
    : (sd && sd.deckList.trim() ? 'No legend, champion or battlefields in the list' : 'No decklist for this player');
  btn.textContent = said;
  clearTimeout(btn.resetTimer);
  btn.resetTimer = setTimeout(() => { btn.textContent = 'Populate from decklist'; }, 2500);
}

// One slot of a player's three: a pick replaces it (or joins the end), a
// clear takes it off and the rest move up.
function setPoolEntry(side, i, entry) {
  if (!state) return;
  const pool = [...(state.preview.match[side].battlefields || [])];
  if (entry) {
    if (i < pool.length) pool[i] = entry;
    else pool.push(entry);
  } else if (i < pool.length) {
    pool.splice(i, 1);
  }
  post({ match: { [side]: { battlefields: pool } } });
}

for (const [p, side] of SIDES) {
  $(`${p}deckPick`).addEventListener('change', () => {
    const v = $(`${p}deckPick`).value;
    if (v === '__paste') return;
    if (!v) { post({ match: { [side]: { deckList: '', deckName: '' } } }); return; }
    const deck = (library.decks || []).find((d) => d.name === v);
    if (deck) loadSideDeck(side, deck.list, deck.name);
  });
  const ta = $(`${p}deckList`);
  let timer = null;
  const flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    loadSideDeck(side, ta.value, '');
  };
  ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(flush, 700); });
  ta.addEventListener('blur', flush);
  $(`${p}deckFill`).addEventListener('click', () => fillFromDeck(side, $(`${p}deckFill`)));
  for (let i = 0; i < 3; i += 1) {
    wirePicker(`${p}bfp${i}`, `${p}bfp${i}Results`, {
      search: (q) => battlefieldCatalog.filter((b) => b.cardName.toLowerCase().includes(q)),
      renderItem: (b) => ({ label: b.cardName, icon: `/cardart/thumb/${b.cardId}.webp` }),
      onPick: (b) => setPoolEntry(side, i, { name: b.cardName, cardId: b.cardId, played: false }),
      onClear: () => setPoolEntry(side, i, null),
      current: () => ((state.preview.match[side].battlefields || [])[i] || {}).name || '',
    });
  }
}

function renderDeckLine(p, list) {
  $(`${p}deckFill`).disabled = !list.trim();
  const line = $(`${p}deckLine`);
  if (line.dataset.list === list) return;
  line.dataset.list = list;
  line.classList.remove('warn');
  if (!list.trim()) { line.textContent = 'No deck loaded'; return; }
  line.textContent = 'Reading the list…';
  deckSummary(list).then((deck) => {
    if (line.dataset.list !== list) return;
    if (!deck) { line.textContent = 'Could not read the list'; line.classList.add('warn'); return; }
    const bits = [deck.legend ? deck.legend.name : 'No legend', `${deck.counts.main} main`, `${deck.counts.sideboard} sideboard`];
    if (deck.counts.unresolved) bits.push(`${deck.counts.unresolved} not found`);
    line.textContent = bits.join(' · ');
    line.title = line.textContent;
    line.classList.toggle('warn', deck.counts.unresolved > 0);
  });
}

function renderBfChips(p, side, sd) {
  const box = $(`${p}bfChips`);
  const pool = sd.battlefields || [];
  const now = String(sd.battlefield || '').toLowerCase();
  const key = JSON.stringify([pool, now]);
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  if (!pool.length) {
    box.replaceChildren(Object.assign(document.createElement('span'), { className: 'muted', textContent: 'Add battlefields above, or load a deck' }));
    return;
  }
  const chips = pool.map((b) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isNow = Boolean(now) && b.name.toLowerCase() === now;
    btn.className = `bf-chip${isNow ? ' now' : ''}${b.played ? ' played' : ''}`;
    btn.textContent = b.name;
    btn.title = isNow ? `${b.name}: in play this game` : `Play this game on ${b.name}${b.played ? ' (played earlier this match)' : ''}`;
    btn.addEventListener('click', () => post({ match: { [side]: {
      battlefield: b.name,
      battlefieldCardId: b.cardId || catalogCardId(battlefieldCatalog, b.name) || '',
    } } }));
    return btn;
  });
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'clear-mini';
  clear.textContent = '↺';
  clear.title = 'Clear the played marks, for a new match';
  clear.setAttribute('aria-label', 'Clear the played marks');
  clear.disabled = !pool.some((b) => b.played);
  clear.addEventListener('click', () => post({ match: { [side]: { battlefields: pool.map((b) => ({ ...b, played: false })) } } }));
  box.replaceChildren(...chips, clear);
}

function renderDecks(s) {
  const decks = library.decks || [];
  for (const [p, side] of SIDES) {
    const sd = s.preview.match[side];
    const list = sd.deckList || '';
    const sel = $(`${p}deckPick`);
    const saved = decks.find((d) => d.name === sd.deckName && d.list === list);
    const want = !list.trim() ? '' : (saved ? saved.name : '__paste');
    const key = JSON.stringify([decks.map((d) => d.name), want, sd.deckName]);
    if (sel.dataset.key !== key) {
      sel.dataset.key = key;
      const opts = [new Option('No deck', '')];
      // A list loaded from a saved deck and then changed says so; one the
      // library never had is just its name, or a pasted list.
      const edited = sd.deckName && decks.some((d) => d.name === sd.deckName);
      if (want === '__paste') opts.push(new Option(edited ? `${sd.deckName} (edited)` : (sd.deckName || 'Pasted list'), '__paste'));
      for (const d of decks) opts.push(new Option(d.name, d.name));
      sel.replaceChildren(...opts);
    }
    if (document.activeElement !== sel) sel.value = want;
    setIfIdle(`${p}deckList`, list);
    renderDeckLine(p, list);
    for (let i = 0; i < 3; i += 1) {
      const b = (sd.battlefields || [])[i];
      setIfIdle(`${p}bfp${i}`, b ? b.name : '');
      renderPickThumb(`${p}bfp${i}`, cardThumbSrc(b ? (b.cardId || catalogCardId(battlefieldCatalog, b.name)) : ''), Boolean(b));
    }
    renderBfChips(p, side, sd);
  }
}

// --- theme controls ---

async function loadFontList() {
  try {
    const data = await (await fetch('/api/fonts', { cache: 'no-store' })).json();
    const sel = $('fontSelect');
    const current = state?.theme.font || data.active || '';
    sel.replaceChildren(
      Object.assign(document.createElement('option'), { value: '', textContent: 'TES default (Aktiv Grotesk)' }),
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
    if (!res.cached) refreshFontSheet();
    loadFontList();
  } catch {
    $('fontStatus').textContent = 'Font download failed. Check the connection and try again.';
  }
});

// Download all fonts (Sam, 2026-09-18): every font in the list saved on
// this computer, one after another, so any of them works at a venue with no
// internet. The ones already saved are skipped.
$('fontAll').addEventListener('click', async () => {
  const btn = $('fontAll');
  const status = $('fontStatus');
  btn.disabled = true;
  try {
    const data = await (await fetch('/api/fonts', { cache: 'no-store' })).json();
    const todo = data.fonts.filter((f) => !f.cached);
    let failed = 0;
    for (const [i, f] of todo.entries()) {
      status.textContent = `Downloading ${f.family} (${i + 1} of ${todo.length})…`;
      try {
        const res = await (await fetch('/api/fonts/download', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ family: f.family }),
        })).json();
        if (!res.ok) failed += 1;
      } catch {
        failed += 1;
      }
    }
    status.textContent = !todo.length ? 'Every font is already saved on this computer.'
      : (failed ? `Saved ${todo.length - failed} of ${todo.length}; ${failed} could not download. Is the internet up? Press again to retry them.`
        : `All ${data.fonts.length} fonts are saved on this computer and work offline.`);
    if (todo.length > failed) refreshFontSheet();
    loadFontList();
  } catch {
    status.textContent = 'Could not read the font list. Is the app running?';
  } finally {
    btn.disabled = false;
  }
});

// Whether this computer can draw the TES default's Aktiv Grotesk: a canvas
// measure against a fallback-only face, so the note says what will air.
(function aktivNote() {
  const note = $('fontAktiv');
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    const width = (font) => { ctx.font = `800 40px ${font}`; return ctx.measureText('Sideways Studio 0123 WMQ').width; };
    const here = width("'Aktiv Grotesk', monospace") !== width('monospace');
    note.textContent = here
      ? 'Aktiv Grotesk is installed on this computer, so the TES default airs in it.'
      : 'Aktiv Grotesk is not on this computer, so the TES default airs in Segoe UI. Activate Aktiv Grotesk in Adobe Fonts (or install it) and restart OBS to air in it.';
  } catch {
    note.textContent = '';
  }
})();

// The event logo can be uploaded from the Look card or from the rows
// overlay's options; both write the one theme logo.
async function uploadLogo(input) {
  const file = input.files[0];
  if (!file) return;
  if (!(await checkUpload(file, LOGO_RULE))) {
    input.value = '';
    return;
  }
  const ext = file.name.split('.').pop().toLowerCase().replace('jpeg', 'jpg');
  const res = await fetch(`/api/theme/logo?ext=${encodeURIComponent(ext)}`, {
    method: 'POST',
    body: await file.arrayBuffer(),
  }).then((r) => r.json()).catch(() => ({ ok: false, error: 'upload failed' }));
  if (!res.ok) alert(`Logo upload failed: ${res.error}`);
  input.value = '';
}
for (const id of ['logoFile', 'igoRowsLogoFile']) $(id).addEventListener('change', () => uploadLogo($(id)));
for (const id of ['logoRemove', 'igoRowsLogoRemove']) $(id).addEventListener('click', () => post({ theme: { logo: '' } }));

$('themeReset').addEventListener('click', () => {
  const cleared = {
    accentA: '', accentB: '',
    colors: Object.fromEntries(COLOR_KEYS.map((k) => [k, ''])),
    background: { kind: '', color: '', color2: '', angle: '', grain: '', dim: '', image: '' },
  };
  if (lookScope === 'global') {
    post({ theme: { accentA: '#11b6fb', accentB: '#1bef19', font: '', logo: '', look: cleared } });
  } else {
    post({ theme: { scenes: { [lookScope]: { ...cleared, enabled: false } } } });
  }
});

// --- card database status and downloads ---

let dbPollTimer = null;
// The last status the poller saw: what a button press measures its outcome
// against (was the list already there, how many cards did it have).
let dbLast = null;

// A one-off after upgrading from a build that cached card art in the clear.
// It can overlap a launch refresh, so it reads as a note on the end of
// whatever else the database is doing rather than replacing it.
function migrationNote(s) {
  if (!s.migration || !s.migration.active) return '';
  const of = s.migration.total ? ` ${s.migration.done} of ${s.migration.total}.` : '.';
  return ` Encrypting the card art already saved on this machine:${of} The graphics work normally while this runs.`;
}

function describeDb(s) {
  return describeDbState(s) + migrationNote(s);
}

// The pack download, which reports in bytes rather than files: it is one
// request for the whole of the full art, not nine hundred.
const dbFetch = (s) => (s.library && s.library.fetch) || { phase: 'idle' };
const dbMb = (n) => `${Math.round((n / 1024 / 1024) * 10) / 10} MB`;

// 0 to 1 for the bar, or null when there is nothing measurable to show.
function dbProgressFraction(s) {
  const f = dbFetch(s);
  if (f.phase === 'downloading' && f.total) return f.done / f.total;
  if (s.progress.phase !== 'idle' && s.progress.total) return s.progress.done / s.progress.total;
  return null;
}

function describeDbState(s) {
  const f = dbFetch(s);
  if (f.phase === 'checking') return 'Looking for the card art download…';
  if (f.phase === 'downloading') {
    return f.total
      ? `Downloading the card art that comes with this version: ${dbMb(f.done)} of ${dbMb(f.total)}`
      : 'Downloading the card art that comes with this version…';
  }
  if (f.phase === 'verifying') return 'Checking the card art download…';
  if (s.progress.phase === 'index') return 'Downloading the card index…';
  if (s.progress.phase === 'thumbs') return `Downloading card thumbnails: ${s.progress.done} of ${s.progress.total}`;
  if (s.progress.phase === 'full') return `Downloading full card art: ${s.progress.done} of ${s.progress.total}`;
  if (!s.indexed) return 'Not downloaded yet. Card search needs the database: press "Download card database".';
  const bits = [`${s.cardCount} cards`, `${s.thumbsCached} thumbnails saved`];
  if (s.fullCached) bits.push(`${s.fullCached} full art files saved`);
  let text = bits.join(', ') + '.';
  if (s.fromBundledIndex) {
    // The card list came with the app rather than off the internet, which is
    // the normal case: the card database is private, so new sets arrive with
    // an app update. Saying "checked today" here would be a lie about a list
    // that does not move on its own.
    text += ' This card list came with the app; new sets arrive with app updates.';
  } else if (s.indexUpdatedAt) {
    const days = Math.floor((Date.now() - Date.parse(s.indexUpdatedAt)) / 86400000);
    text += days < 1 ? ' Card list checked today.' : ` Card list from ${days === 1 ? 'yesterday' : `${days} days ago`}; it refreshes on launch when online.`;
  }
  if (f.lastError) text += ` Last card art download problem: ${f.lastError}`;
  else if (s.progress.lastError && s.fromBundledIndex) {
    // The launch check runs on its own and fails on every machine that cannot
    // reach the card database, which is most of them. Reporting the site's
    // error text here would read as something broken and something to fix, and
    // it is neither. Say what happened and that it does not matter.
    text += ' The last check for new sets could not reach the card database, which is expected; every card here still works.';
  } else if (s.progress.lastError) text += ` Last download problem: ${s.progress.lastError}`;
  else if (s.progress.errors) text += ` ${s.progress.errors} files failed last run, run the download again to retry.`;
  return text;
}

async function pollDbStatus() {
  try {
    const s = await (await fetch('/api/cards/status', { cache: 'no-store' })).json();
    dbLast = s;
    // A finished first-run download is what fills the catalogs the pickers read.
    if (s.indexed && !catalogsReady) loadCatalogs();
    $('dbStatus').textContent = describeDb(s);
    const busy = s.progress.phase !== 'idle' || dbFetch(s).phase !== 'idle';
    $('dbSync').disabled = busy;
    $('dbSync').textContent = s.indexed ? 'Check for new sets' : 'Download card database';
    $('dbPrefetchFull').disabled = busy || !s.indexed;
    const fraction = dbProgressFraction(s);
    $('dbProgressWrap').classList.toggle('hidden', !busy || fraction === null);
    if (fraction !== null) $('dbProgress').style.width = `${Math.round(fraction * 100)}%`;
    clearTimeout(dbPollTimer);
    dbPollTimer = setTimeout(pollDbStatus, busy ? 700 : 5000);
  } catch {
    clearTimeout(dbPollTimer);
    dbPollTimer = setTimeout(pollDbStatus, 3000);
  }
}

// What a download button did, when it did nothing visible. Both buttons used
// to answer with silence when there was nothing to fetch ("Check for new
// sets" over a current list, the offline button with every file on disk),
// and silence reads as broken (Sam, 2026-09-16). Sam chose the browser's own
// dialog, the way the panel's other prompts work. It opens only for a press
// that downloaded nothing: a run that did fetch files shows its progress bar
// and changes the status line, and a modal arriving minutes later, in front
// of TAKE, would be the wrong trade on a live panel.
const dbCount = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const dbSentence = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Polls until the run a button just started is over, and hands back the
// status it ended on. The busy phase alone is not enough to wait on: an
// index refresh over a current list is done inside one poll interval and is
// never seen busy, so the caller says what "over" looks like.
async function dbSettled(isDone) {
  const until = Date.now() + 20 * 60 * 1000;
  for (;;) {
    await new Promise((r) => setTimeout(r, 600));
    let s;
    try {
      s = await (await fetch('/api/cards/status', { cache: 'no-store' })).json();
    } catch {
      continue;
    }
    if (isDone(s) || Date.now() > until) return s;
  }
}

async function dbPost(url) {
  try {
    return await (await fetch(url, { method: 'POST' })).json();
  } catch {
    return { ok: false, error: 'could not reach the app; is it still running?' };
  }
}

$('dbSync').addEventListener('click', async () => {
  const before = dbLast;
  const r = await dbPost('/api/cards/sync');
  if (!r.ok) {
    alert(`${dbSentence(r.error)}.`);
    return;
  }
  pollDbStatus();
  // Over when this run has stamped lastSync, or given up with an error.
  const wasSynced = before ? before.lastSync : null;
  const s = await dbSettled((st) => st.progress.phase === 'idle' && (st.lastSync !== wasSynced || st.progress.lastError));
  if (s.progress.lastError) {
    // The card database is private, so this check fails for everyone but the
    // person who runs it, and it is not a fault they can do anything about:
    // their cards came with the app and still work. Say that instead of an
    // error about a site they were never going to reach (Sam, 2026-09-17).
    if (s.indexed && s.library && s.library.bundled) {
      alert(`The card list that came with this version is what you have: ${dbCount(s.cardCount, 'card')}, and every one of them works offline. New sets arrive with app updates, so there is nothing to do here.`);
      return;
    }
    // "Is the internet up?" only when the failure looks like no connection.
    // A page served instead of the card list, or a bad status, is the host's
    // problem, and the message the server wrote already says so.
    const err = String(s.progress.lastError);
    const offline = /fetch failed|ENOTFOUND|ECONN|EAI_AGAIN|aborted|timed? ?out|network/i.test(err);
    alert(`Could not check for new sets: ${err}.${offline ? ' Is the internet up?' : ''}`);
    return;
  }
  // Files came down, or the list itself changed: the progress bar showed it
  // and the status line has the new numbers. Only a check that changed
  // nothing needs saying out loud.
  const had = before && before.indexed ? before.cardCount : 0;
  if (s.progress.total > 0 || s.cardCount !== had) return;
  alert(`Nothing new: the card list is current. ${dbCount(s.cardCount, 'card')} and ${s.thumbsCached} of ${s.thumbsAvailable} thumbnails are saved and ready to use.`);
});

$('dbPrefetchFull').addEventListener('click', async () => {
  const r = await dbPost('/api/cards/prefetch-full');
  if (!r.ok) {
    alert(`${dbSentence(r.error)}.`);
    return;
  }
  if (r.complete) {
    alert(`All ${dbCount(r.fullAvailable, 'card art file')} are already saved on this computer and ready for offline use.`);
    return;
  }
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
  if (!list.trim()) {
    $('deckSummary').textContent = 'Nothing pasted yet.';
    deckCards = [];
    renderDeckFocus();
    return;
  }
  try {
    const d = await (await fetch('/api/decklist/parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ list }),
    })).json();
    deckCards = focusableCards(d);
    renderDeckFocus();
    const bits = [`${d.counts.main} main`];
    if (d.counts.sideboard) bits.push(`${d.counts.sideboard} sideboard`);
    if (d.counts.runes) bits.push(`${d.counts.runes} runes`);
    if (d.counts.unresolved) bits.push(`${d.counts.unresolved} not in the card database`);
    $('deckSummary').textContent = bits.join(', ') + '.'
      + (d.warnings.length ? ' ' + d.warnings[0] : '');
  } catch {
    $('deckSummary').textContent = 'Could not read that list.';
    deckCards = [];
    renderDeckFocus();
  }
}

$('deckList').addEventListener('input', () => {
  clearTimeout(deckTimer);
  const list = $('deckList').value;
  deckTimer = setTimeout(() => {
    // A hand-edited list is no longer the saved deck it may have started as.
    post({ scenes: { decklist: { list, deckName: '' } } });
    summariseDeck(list);
  }, 400);
});

$('deckSideboard').addEventListener('change', () => {
  post({ scenes: { decklist: { showSideboard: $('deckSideboard').checked } } });
});

$('deckBackground').addEventListener('change', () => {
  post({ scenes: { decklist: { background: $('deckBackground').checked } } });
});

$('deckClear').addEventListener('click', () => {
  if (!confirm('Clear the decklist in preview?')) return;
  $('deckList').value = '';
  post({ scenes: { decklist: { list: '', visible: false, deckName: '', focus: '' } } });
  summariseDeck('');
});

$('deckReplay').addEventListener('click', () => {
  post({ action: 'replay', scene: 'decklist' });
});

// --- decklist highlight ---
//
// The select lists the cards the plate draws, in plate order, from the same
// parse the summary reads. The highlight is the focus cue, both banks at
// once, so ‹ › step through a deck on air with no TAKE per card.
let deckCards = [];

function focusableCards(d) {
  const out = [];
  const seen = new Set();
  const add = (card, group) => {
    if (!card || !card.cardId || seen.has(card.cardId)) return;
    seen.add(card.cardId);
    out.push({ cardId: card.cardId, name: card.name, group, label: `${group}: ${card.name}` });
  };
  add(d.legend, 'Legend');
  for (const c of d.main) add(c, 'Main');
  for (const c of d.battlefields) add(c, 'Battlefield');
  add(d.champion, 'Champion');
  for (const c of d.sideboard) add(c, 'Sideboard');
  return out;
}

function currentDeckFocus() {
  const focus = state ? state.preview.scenes.decklist.focus || '' : '';
  return deckCards.some((c) => c.cardId === focus) ? focus : '';
}

// The picker is a button (thumbnail + name) over the same results list the
// card searches use, so each card shows its art beside its name; a native
// select cannot draw an image in an option (Sam, 2026-09-16).
const focusList = $('deckFocusList');
const closeFocusList = () => {
  focusList.classList.remove('open');
  focusList.replaceChildren();
  $('deckFocusBtn').setAttribute('aria-expanded', 'false');
};
function openFocusList() {
  const current = currentDeckFocus();
  const item = (cardId, name, sub, icon) => {
    const li = document.createElement('li');
    if (icon) {
      const img = document.createElement('img');
      img.src = icon;
      img.alt = '';
      img.onerror = () => img.classList.add('hidden');
      li.append(img);
    }
    const meta = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = name;
    meta.append(strong);
    if (sub) {
      const span = document.createElement('span');
      span.textContent = sub;
      meta.append(span);
    }
    li.append(meta);
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(cardId === current));
    if (cardId === current) li.classList.add('current');
    li.addEventListener('mousedown', (e) => { e.preventDefault(); deckFocusTo(cardId); closeFocusList(); });
    return li;
  };
  focusList.replaceChildren(
    item('', 'None', 'the plain plate', null),
    ...deckCards.map((c) => item(c.cardId, c.name, c.group, `/cardart/thumb/${c.cardId}.webp`)),
  );
  placeList($('deckFocusBtn'), focusList);
  focusList.classList.add('open');
  $('deckFocusBtn').setAttribute('aria-expanded', 'true');
}

function renderDeckFocus() {
  const current = currentDeckFocus();
  const card = deckCards.find((c) => c.cardId === current) || null;
  $('deckFocusName').textContent = card ? card.name : 'None';
  const thumb = $('deckFocusThumb');
  if (card) {
    const src = `/cardart/thumb/${card.cardId}.webp`;
    if (thumb.getAttribute('src') !== src) {
      thumb.onerror = () => thumb.classList.add('hidden');
      thumb.onload = () => thumb.classList.remove('hidden');
      thumb.src = src;
    }
  } else {
    thumb.classList.add('hidden');
    thumb.removeAttribute('src');
  }
  const on = state ? state.preview.scenes.decklist.focusOn !== false : true;
  const toggle = $('deckFocusToggle');
  toggle.textContent = on ? 'Highlight on' : 'Highlight off';
  toggle.classList.toggle('on', on && Boolean(card));
  const none = !deckCards.length;
  for (const id of ['deckFocusBtn', 'deckFocusPrev', 'deckFocusNext']) $(id).disabled = none;
  toggle.disabled = none || !card;
  if (focusList.classList.contains('open')) openFocusList();
}

const deckFocusTo = (cardId) => post({ action: 'focus', scene: 'decklist', cardId });
$('deckFocusBtn').addEventListener('click', () => {
  if (focusList.classList.contains('open')) closeFocusList(); else openFocusList();
});
$('deckFocusBtn').addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFocusList(); });
$('deckFocusBtn').addEventListener('blur', () => setTimeout(closeFocusList, 150));
// The toggle flicks the highlight off and back on with the card kept: the
// plain plate while the casters talk, the same card back with one click.
$('deckFocusToggle').addEventListener('click', () => {
  if (!state) return;
  post({ action: 'focus', scene: 'decklist', on: state.preview.scenes.decklist.focusOn === false });
});
function stepDeckFocus(dir) {
  if (!deckCards.length) return;
  const at = deckCards.findIndex((c) => c.cardId === currentDeckFocus());
  const next = at < 0 ? (dir > 0 ? 0 : deckCards.length - 1) : (at + dir + deckCards.length) % deckCards.length;
  deckFocusTo(deckCards[next].cardId);
}
$('deckFocusPrev').addEventListener('click', () => stepDeckFocus(-1));
$('deckFocusNext').addEventListener('click', () => stepDeckFocus(1));

// --- saved decks ---
//
// The library is prepared in the deck editor; here each saved deck is one
// click away from preview. Loading never touches program: TAKE airs it, and
// the plate builds in on the swap. The library is not part of the bussed
// state, so it is fetched on its own and refetched when the server announces
// a change.

let library = { version: null, decks: [] };

async function loadDeckLibrary() {
  try {
    const res = await fetch('/api/decklist/library', { cache: 'no-store' });
    if (res.ok) library = await res.json();
    renderDeckLibrary();
    if (state) renderDecks(state);
  } catch { /* the next announcement or reconnect retries */ }
}

// What a bank's decklist is called: the saved deck it came from, else the
// legend line of the list itself, else a plain description.
function deckLabel(sc) {
  if (!sc.list.trim()) return null;
  if (sc.deckName) return sc.deckName;
  const legend = sc.list.match(/^\s*legend\s*:\s*(.+)$/im);
  return legend ? legend[1].trim() : 'Pasted list';
}

function renderDeckLibrary() {
  if (!state) return;
  const prev = state.preview.scenes.decklist;
  const air = state.program.scenes.decklist;
  $('deckPrevName').textContent = deckLabel(prev) || 'Nothing loaded';
  $('deckAirName').textContent = air.visible && air.list.trim() ? deckLabel(air) : 'Nothing on air';

  const filter = $('deckFilter').value.trim().toLowerCase();
  $('deckFilter').classList.toggle('hidden', library.decks.length < 10);
  const shown = library.decks.filter((d) => !filter || d.name.toLowerCase().includes(filter)
    || (d.player || '').toLowerCase().includes(filter));
  $('deckLibHint').classList.toggle('hidden', library.decks.length > 0);
  $('deckChips').replaceChildren(...shown.map((d) => {
    const chip = document.createElement('span');
    chip.className = 'deck-chip';
    // Matched on the list itself, so an edited copy no longer claims the name.
    chip.classList.toggle('in-preview', prev.list === d.list);
    chip.classList.toggle('on-air', air.visible && air.list === d.list);
    const load = document.createElement('button');
    load.className = 'chip-load';
    load.textContent = d.name;
    load.title = [d.player && `Player: ${d.player}`, d.event && `Event: ${d.event}`, 'Click to load into preview']
      .filter(Boolean).join('\n');
    load.addEventListener('click', () => {
      post({ scenes: { decklist: {
        list: d.list, background: d.background, showSideboard: d.showSideboard, deckName: d.name,
      } } });
    });
    const del = document.createElement('button');
    del.className = 'chip-del';
    del.textContent = '×';
    del.title = `Delete "${d.name}" from the saved decks`;
    del.addEventListener('click', async () => {
      if (!confirm(`Delete the saved deck "${d.name}"? Preview and program keep what they show.`)) return;
      await fetch('/api/decklist/library', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ remove: d.name }),
      }).catch(() => {});
      loadDeckLibrary();
    });
    chip.append(load, del);
    return chip;
  }));
}

$('deckFilter').addEventListener('input', renderDeckLibrary);
loadDeckLibrary();

$('toggleDeck').addEventListener('click', () => {
  if (!state) return;
  setFullScene('decklist', !state.preview.scenes.decklist.visible);
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

// The version this panel was served by. When the app comes back after an
// update it is a different build, and this page's script is the old one, so
// the panel reloads itself rather than run stale code against a new server
// with the "Update ready, restarting" bar still up (Sam, 2026-09-16).
let servedVersion = null;

async function pollUpdate(interval = 300000) {
  try {
    const u = await (await fetch('/api/update/status', { cache: 'no-store' })).json();
    if (servedVersion === null) servedVersion = u.currentVersion;
    else if (u.currentVersion !== servedVersion) { location.reload(); return; }
    renderUpdate(u);
  } catch { /* the app may be restarting into the new version */ }
  clearTimeout(updatePollTimer);
  // Fast while a download runs, and stays fast through the restart ('ready'
  // is the last phase the old build reports before it exits), so the new
  // build is noticed within a second of coming up rather than at the next
  // five-minute poll.
  const fast = updateInfo && ['downloading', 'verifying', 'ready', 'checking'].includes(updateInfo.phase);
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

// --- the September 2026 graphics (from the five-game overlay scouting) ---
//
// Portrait pillars, rows, the arena score bug, the slate, the hand fan and
// the showdown. Until 0.10.0 they sat behind Setup > Experimental; now they
// are listed with everything else in the Graphics folds. theme.experimental
// is still saved for older events and no longer read here.
const EXP_SCENES = ['igoportrait', 'igorows', 'arenabug', 'slate', 'handfan', 'showdown', 'cornertag', 'lowerthird', 'headtohead', 'profile', 'bracket', 'standings', 'result', 'matchup', 'sideboard', 'decklists', 'vscard', 'legendstats', 'pairings'];
const EXP_TOGGLES = { igoportrait: 'toggleIgoPortrait', igorows: 'toggleIgoRows', arenabug: 'toggleArena', slate: 'toggleSlate', handfan: 'toggleHandfan', showdown: 'toggleShowdown',
  cornertag: 'toggleCornertag', lowerthird: 'toggleLowerthird', headtohead: 'toggleHeadtohead', profile: 'toggleProfile', bracket: 'toggleBracket', standings: 'toggleStandings', result: 'toggleResult',
  matchup: 'toggleMatchup', sideboard: 'toggleSideboard', decklists: 'toggleDecklists', vscard: 'toggleVscard', legendstats: 'toggleLegendstats', pairings: 'togglePairings' };
const EXP_ON_AIR = { igoportrait: 'igoPortraitOnAir', igorows: 'igoRowsOnAir', arenabug: 'arenaOnAir', slate: 'slateOnAir', handfan: 'handfanOnAir', showdown: 'showdownOnAir',
  cornertag: 'cornertagOnAir', lowerthird: 'lowerthirdOnAir', headtohead: 'headtoheadOnAir', profile: 'profileOnAir', bracket: 'bracketOnAir', standings: 'standingsOnAir', result: 'resultOnAir',
  matchup: 'matchupOnAir', sideboard: 'sideboardOnAir', decklists: 'decklistsOnAir', vscard: 'vscardOnAir', legendstats: 'legendstatsOnAir', pairings: 'pairingsOnAir' };

// The full-frame graphics cover everything, so switching one on in preview
// switches the others off, the way the edge overlays do.
const FULL_SCENES = ['slate', 'decklist', 'headtohead', 'vscard', 'profile', 'bracket', 'standings', 'legendstats', 'pairings', 'decklists'];
function setFullScene(key, next) {
  const scenes = { [key]: { visible: next } };
  if (next) for (const other of FULL_SCENES) if (other !== key) scenes[other] = { visible: false };
  post({ scenes });
}

$('toggleIgoPortrait').addEventListener('click', () => toggleEdgeScene('igoportrait'));
$('toggleIgoRows').addEventListener('click', () => toggleEdgeScene('igorows'));
// The arena bug sits where the score bug sits, so one replaces the other.
$('toggleArena').addEventListener('click', () => {
  if (!state) return;
  const next = !state.preview.scenes.arenabug.visible;
  post({ scenes: { arenabug: { visible: next }, ...(next ? { scorebug: { visible: false } } : {}) } });
});
$('toggleSlate').addEventListener('click', () => {
  if (!state) return;
  setFullScene('slate', !state.preview.scenes.slate.visible);
});
for (const key of ['headtohead', 'vscard', 'profile', 'bracket', 'standings', 'legendstats', 'pairings']) {
  $(EXP_TOGGLES[key]).addEventListener('click', () => {
    if (!state) return;
    setFullScene(key, !state.preview.scenes[key].visible);
  });
}
for (const key of ['cornertag', 'lowerthird', 'result']) {
  $(EXP_TOGGLES[key]).addEventListener('click', () => {
    if (!state) return;
    post({ scenes: { [key]: { visible: !state.preview.scenes[key].visible } } });
  });
}
for (const [id, flag] of [['slateSchedule', 'schedule'], ['slateTicker', 'ticker'], ['slateCamera', 'camera']]) {
  $(id).addEventListener('change', () => post({ scenes: { slate: { [flag]: $(id).checked } } }));
}
$('cornertagMode').addEventListener('change', () => post({ scenes: { cornertag: { mode: $('cornertagMode').value } } }));
$('lowerthirdMode').addEventListener('change', () => post({ scenes: { lowerthird: { mode: $('lowerthirdMode').value } } }));
$('lowerthirdSide').addEventListener('change', () => post({ scenes: { lowerthird: { side: $('lowerthirdSide').value } } }));
$('profileSide').addEventListener('change', () => post({ scenes: { profile: { side: $('profileSide').value } } }));
for (const [id, flag] of [['profileCamera', 'camera'], ['profileDecklist', 'decklist']]) {
  $(id).addEventListener('change', () => post({ scenes: { profile: { [flag]: $(id).checked } } }));
}
for (const [id, scene, field] of [['cornertagText', 'cornertag', 'text'], ['lowerthirdCred', 'lowerthird', 'credential'], ['h2hStatus', 'headtohead', 'status']]) {
  const el = $(id);
  let timer = null;
  const flush = () => { if (timer === null) return; clearTimeout(timer); timer = null; post({ scenes: { [scene]: { [field]: el.value } } }); };
  el.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(flush, 300); });
  el.addEventListener('blur', flush);
}
$('igoPortraitMode').addEventListener('change', () => post({ scenes: { igoportrait: { mode: $('igoPortraitMode').value } } }));
for (const [id, flag] of [['igoPortraitTop', 'topBar'], ['igoPortraitHand', 'handCam'], ['igoPortraitCard', 'cardWell']]) {
  $(id).addEventListener('change', () => post({ scenes: { igoportrait: { [flag]: $(id).checked } } }));
}
$('igoRowsMode').addEventListener('change', () => post({ scenes: { igorows: { mode: $('igoRowsMode').value } } }));
$('igoRowsHand').addEventListener('change', () => post({ scenes: { igorows: { hand: $('igoRowsHand').checked } } }));
$('igoRowsHandStyle').addEventListener('change', () => post({ scenes: { igorows: { handStyle: $('igoRowsHandStyle').value } } }));
$('igoRowsHandArt').addEventListener('change', () => post({ scenes: { igorows: { handArt: $('igoRowsHandArt').checked } } }));
for (const [id, flag] of [['igoRowsActive', 'activeTurn'], ['igoRowsPoints', 'points'], ['igoRowsTurn', 'turnCounter'], ['igoRowsLogo', 'eventLogo'], ['igoRowsClock', 'clock'], ['igoRowsCard', 'cardDock']]) {
  $(id).addEventListener('change', () => post({ scenes: { igorows: { [flag]: $(id).checked } } }));
}
$('igoRowsShowdown').addEventListener('change', () => post({ scenes: { igorows: { showdown: $('igoRowsShowdown').checked } } }));
$('toggleHandfan').addEventListener('click', () => {
  if (!state) return;
  post({ scenes: { handfan: { visible: !state.preview.scenes.handfan.visible } } });
});
$('handfanSide').addEventListener('change', () => post({ scenes: { handfan: { side: $('handfanSide').value } } }));
$('handfanOpponent').addEventListener('change', () => post({ scenes: { handfan: { opponent: $('handfanOpponent').checked } } }));
$('handfanShowdown').addEventListener('change', () => post({ scenes: { handfan: { showdown: $('handfanShowdown').checked } } }));
$('handfanIdentity').addEventListener('change', () => post({ scenes: { handfan: { identity: $('handfanIdentity').checked } } }));
$('handfanClock').addEventListener('change', () => post({ scenes: { handfan: { clock: $('handfanClock').checked } } }));
$('toggleShowdown').addEventListener('click', () => {
  if (!state) return;
  post({ scenes: { showdown: { visible: !state.preview.scenes.showdown.visible } } });
});
$('showdownMode').addEventListener('change', () => post({ scenes: { showdown: { mode: $('showdownMode').value } } }));
$('showdownHands').addEventListener('change', () => post({ scenes: { showdown: { hands: $('showdownHands').checked } } }));

// --- the decks round (2026-09-18): game intro, sideboard fly-in, side by
// side decklists, and the rows overlay's battlefields ---
for (const key of ['matchup', 'sideboard']) {
  $(EXP_TOGGLES[key]).addEventListener('click', () => {
    if (!state) return;
    post({ scenes: { [key]: { visible: !state.preview.scenes[key].visible } } });
  });
}
$(EXP_TOGGLES.decklists).addEventListener('click', () => {
  if (!state) return;
  setFullScene('decklists', !state.preview.scenes.decklists.visible);
});
$('matchupGame').addEventListener('change', () => post({ scenes: { matchup: { game: Number($('matchupGame').value) } } }));
$('sideboardSide').addEventListener('change', () => post({ scenes: { sideboard: { side: $('sideboardSide').value } } }));
$('decklistsSideboards').addEventListener('change', () => post({ scenes: { decklists: { sideboards: $('decklistsSideboards').checked } } }));
$('igoRowsBattlefields').addEventListener('change', () => post({ scenes: { igorows: { battlefields: $('igoRowsBattlefields').value } } }));

// --- the showdown chain: cues on both banks ---
//
// Open names the battlefield (picked from the catalog so the takeover band
// gets its art), then a click on any hand chip plays that card onto the
// chain; Resolve pops the top and the card leaves its hand; Undo puts the
// last card back; Close ends it.
let sdPick = null;
wirePicker('sdBattlefield', 'sdBattlefieldResults', {
  search: (q) => battlefieldCatalog.filter((b) => b.cardName.toLowerCase().includes(q)),
  renderItem: (b) => ({ label: b.cardName, icon: `/cardart/thumb/${b.cardId}.webp` }),
  onPick: (b) => { sdPick = { battlefield: b.cardName, battlefieldCardId: b.cardId }; if (state) renderShowdown(state); },
  // Cleared is a pick too: the next Open names no battlefield, where a null
  // pick would put the last showdown's one back.
  onClear: () => { sdPick = { battlefield: '', battlefieldCardId: '' }; if (state) renderShowdown(state); },
  current: () => (sdPick ? sdPick.battlefield : (state.preview.match.showdown.battlefield || '')),
});
$('sdBattlefield').addEventListener('blur', () => setTimeout(() => { if (state) renderShowdown(state); }, 200));
$('sdOpen').addEventListener('click', () => {
  if (!state) return;
  const typed = $('sdBattlefield').value.trim();
  const pick = sdPick || (typed ? { battlefield: typed, battlefieldCardId: '' } : {});
  // The graphic airs only while a showdown is open, so opening one is the
  // moment to want it: Open switches it on in preview when it is off. TAKE
  // still airs it; a cue never puts a graphic on air by itself.
  if (!state.preview.scenes.showdown.visible) post({ scenes: { showdown: { visible: true } } });
  post({ action: 'chain', op: 'open', ...pick });
});
$('sdClose').addEventListener('click', () => post({ action: 'chain', op: 'close' }));
$('sdResolve').addEventListener('click', () => post({ action: 'chain', op: 'resolve' }));
$('sdUnplay').addEventListener('click', () => post({ action: 'chain', op: 'unplay' }));
$('sdPriority').addEventListener('change', () => post({ action: 'chain', op: 'priority', side: $('sdPriority').value }));

function renderShowdown(s) {
  const sd = s.preview.match.showdown || { active: false, chain: [], priority: '' };
  const active = Boolean(sd.active);
  $('sdOpen').classList.toggle('on', active);
  $('sdOpen').textContent = active ? 'Reopen' : 'Open';
  for (const id of ['sdClose', 'sdResolve', 'sdUnplay', 'sdPriority']) $(id).disabled = !active;
  $('sdResolve').disabled = !active || !(sd.chain || []).length;
  $('sdUnplay').disabled = !active || !(sd.chain || []).length;
  if (document.activeElement !== $('sdPriority')) $('sdPriority').value = sd.priority || '';
  if (document.activeElement !== $('sdBattlefield') && !sdPick) $('sdBattlefield').value = sd.battlefield || '';
  {
    const bf = sdPick || sd;
    renderPickThumb('sdBattlefield', cardThumbSrc(bf.battlefieldCardId || catalogCardId(battlefieldCatalog, bf.battlefield)), Boolean(bf.battlefield));
  }
  const chain = sd.chain || [];
  const key = JSON.stringify(chain);
  if ($('sdChain').dataset.key !== key) {
    $('sdChain').dataset.key = key;
    $('sdChain').replaceChildren(...[...chain].reverse().map((e, i) => {
      const row = document.createElement('div');
      row.className = `entry ${e.side}${i === 0 ? ' top' : ''}`;
      row.append(
        Object.assign(document.createElement('span'), { className: 'n', textContent: String(chain.length - i) }),
        Object.assign(document.createElement('span'), { textContent: e.cardName || e.cardId }),
        Object.assign(document.createElement('span'), { className: 'who', textContent: `${e.side === 'left' ? 'P1' : 'P2'}${i === 0 ? ' · resolves next' : ''}` }),
      );
      return row;
    }));
  }
  const prevOn = s.preview.scenes.showdown.visible;
  const airOn = s.program.scenes.showdown.visible;
  let hint;
  if (!active) {
    hint = 'Pick the battlefield and press Open when a showdown starts. Open also switches the Showdown graphic on in preview.';
  } else {
    hint = chain.length ? 'Click a card in either Cards in hand to play it onto the chain.' : 'Open. Click a card in either Cards in hand to play it onto the chain.';
    if (prevOn && !airOn) hint += ' The Showdown graphic is in preview: TAKE airs it.';
  }
  $('sdHint').textContent = hint;
  document.querySelector('.field-row[data-field="showdown"]').classList.toggle('sd-active', active);

  // The line under the graphic's name warns while the graphic is up with no
  // showdown open, since that is the one state where "on" shows nothing.
  const note = $('showdownNote');
  const airOpen = Boolean(s.program.match.showdown && s.program.match.showdown.active);
  let warn = '';
  if (airOn && !airOpen) warn = 'On air with no showdown open, so nothing shows yet. Press Open in Match data, under Hands and showdown.';
  else if (prevOn && !active) warn = 'In preview with no showdown open, so nothing shows yet. Press Open in Match data, under Hands and showdown.';
  note.classList.toggle('warn', Boolean(warn));
  note.textContent = warn || SHOWDOWN_NOTE;
}
const SHOWDOWN_NOTE = $('showdownNote').textContent;
$('arenaClock').addEventListener('change', () => post({ scenes: { arenabug: { clock: $('arenaClock').checked } } }));
$('slateMode').addEventListener('change', () => post({ scenes: { slate: { mode: $('slateMode').value } } }));
$('slateCountdown').addEventListener('change', () => post({ scenes: { slate: { countdown: $('slateCountdown').checked } } }));
{
  let timer = null;
  const flush = () => { if (timer === null) return; clearTimeout(timer); timer = null; post({ scenes: { slate: { text: $('slateText').value } } }); };
  $('slateText').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(flush, 300); });
  $('slateText').addEventListener('blur', flush);
}

// Per-side text fields the experimental overlays print. The country code is
// uppercased as typed so the chip on air matches the field.
for (const [p, side] of SIDES) {
  for (const [id, field] of [[`${p}record`, 'record'], [`${p}country`, 'country'], [`${p}pronouns`, 'pronouns'], [`${p}archetype`, 'archetype']]) {
    const el = $(id);
    let timer = null;
    const flush = () => {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
      post({ match: { [side]: { [field]: el.value } } });
    };
    el.addEventListener('input', () => {
      if (field === 'country') el.value = el.value.toUpperCase();
      clearTimeout(timer);
      timer = setTimeout(flush, 300);
    });
    el.addEventListener('blur', flush);
  }
}

// Cards in hand: the server's ranked search, then one row per card the way
// the featured card reads (Sam, 2026-09-17): the card, its name, an X. A
// reaction or an action lights up in its player's colour, blue for Player 1
// and green for Player 2, since those are the cards a showdown turns on. The
// list is posted whole so the sanitizer sees the same shape the scene reads.
// The hand count less the cards listed is the unknown cards, worked out here
// and on the graphics alike; there is no second number to keep in step.
const KIND_LETTER = { reaction: 'R', action: 'A', unit: 'U', champion: 'C', gear: 'G', spell: 'S' };
const KIND_WORD = { reaction: 'Reaction', action: 'Action', unit: 'Unit', champion: 'Champion', gear: 'Gear', spell: 'Spell' };
function renderHandChips(p, sd) {
  const hand = sd.hand || [];
  const unknown = Math.max(0, (sd.handCount || 0) - hand.length);
  const box = $(`${p}handChips`);
  // A full hand says so in its search box rather than ignoring the pick.
  const search = $(`${p}handSearch`);
  const full = hand.length >= 20;
  if (search.disabled !== full) {
    search.disabled = full;
    search.placeholder = full ? 'Hand full: 20 cards' : 'Add a card\u2026';
  }
  const sdOpen = Boolean(state && state.preview.match.showdown && state.preview.match.showdown.active);
  const key = `${JSON.stringify(hand)}#${unknown}${sdOpen ? '#open' : ''}`;
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  const side = p === 'l' ? 'left' : 'right';
  const rows = hand.map((c, i) => {
    const row = document.createElement('div');
    const hot = c.kind === 'reaction' || c.kind === 'action';
    row.className = `hand-card ${side}${hot ? ' hot' : ''}${c.played ? ' played' : ''}`;
    row.title = c.played ? 'On the chain: click to take it back into the hand' : 'Click to mark it played onto the chain';
    const img = document.createElement('img');
    img.className = 'card-thumb';
    img.alt = '';
    img.onerror = () => img.classList.add('hidden');
    img.src = cardThumbSrc(c.cardId);
    row.append(img);
    const name = document.createElement('span');
    name.className = 'nm';
    name.textContent = c.cardName || c.cardId;
    row.append(name);
    if (c.kind) {
      const k = document.createElement('span');
      k.className = `k ${c.kind}`;
      k.textContent = KIND_LETTER[c.kind] || '';
      k.title = KIND_WORD[c.kind] || '';
      row.append(k);
    }
    if (c.energy !== null && c.energy !== undefined) {
      const small = document.createElement('small');
      small.textContent = String(c.energy);
      small.title = `${c.energy} energy`;
      row.append(small);
    }
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'clear-x';
    x.textContent = '\u00d7';
    x.title = 'Remove from hand';
    x.setAttribute('aria-label', `Remove ${c.cardName || c.cardId} from the hand`);
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!state) return;
      const next = (state.preview.match[side].hand || []).filter((_, j) => j !== i);
      post({ match: { [side]: { hand: next } } });
    });
    row.append(x);
    if (sdOpen && !c.played) { row.classList.add('playable'); row.title = 'Play onto the chain'; }
    row.addEventListener('click', () => {
      if (!state) return;
      const open = Boolean(state.preview.match.showdown && state.preview.match.showdown.active);
      if (open && !c.played) { post({ action: 'chain', op: 'play', side, index: i }); return; }
      const next = (state.preview.match[side].hand || []).map((card, j) => (j === i ? { ...card, played: !card.played } : card));
      post({ match: { [side]: { hand: next } } });
    });
    return row;
  });
  if (unknown > 0) {
    const row = document.createElement('div');
    row.className = 'hand-card unknown';
    row.title = 'The hand count less the cards listed above. The graphics draw these as unknown cards.';
    row.textContent = `+ ${unknown} unknown card${unknown === 1 ? '' : 's'}`;
    rows.push(row);
  }
  box.replaceChildren(...rows);
}
function wireHandSearch(p, side) {
  const input = $(`${p}handSearch`);
  const list = $(`${p}handResults`);
  let timer = null;
  let hits = [];
  const close = () => { list.classList.remove('open'); list.replaceChildren(); };
  const add = (card) => {
    if (!state) return;
    const current = state.preview.match[side].hand || [];
    if (current.length >= 20) return;
    const hand = [...current, { cardId: card.cardId, cardName: card.cardName, energy: card.energy ?? null, domains: card.domains || [], kind: card.kind || '' }];
    // Listing more cards than the count says raises the count, since the
    // cards are in the hand. A count of 0 stays 0: "as many as are listed".
    const count = state.preview.match[side].handCount || 0;
    post({ match: { [side]: { hand, ...(count > 0 && hand.length > count ? { handCount: hand.length } : {}) } } });
    input.value = '';
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
      sub.textContent = [card.cardType, card.energy !== undefined && card.energy !== null ? `${card.energy} energy` : ''].filter(Boolean).join(' · ');
      meta.append(name, sub);
      li.append(img, meta);
      li.addEventListener('mousedown', (e) => { e.preventDefault(); add(card); });
      return li;
    }));
    placeList(input, list);
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
      } catch { /* the next keystroke searches again */ }
    }, 200);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && hits.length) add(hits[0]);
    if (e.key === 'Escape') { hits = []; draw(); }
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
}
for (const [p, side] of SIDES) wireHandSearch(p, side);

// Turn counter and active side: cues, so they act on air at once.
$('turnNext').addEventListener('click', () => post({ action: 'turn', op: 'next' }));
$('turnBack').addEventListener('click', () => post({ action: 'turn', op: 'prev' }));
$('turnReset').addEventListener('click', () => post({ action: 'turn', op: 'reset' }));
$('activeSide').addEventListener('change', () => post({ action: 'turn', op: 'side', side: $('activeSide').value }));

{
  const el = $('roundsRemaining');
  const commit = () => {
    const n = Math.max(0, Math.min(99, Math.trunc(Number(el.value)) || 0));
    el.value = String(n);
    post({ event: { roundsRemaining: n } });
  };
  el.addEventListener('change', commit);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { commit(); el.blur(); } });
}

// The break clock: the same arithmetic as the round clock, its own numbers.
let cdState = { running: false, startedAt: 0, elapsed: 0, countdown: 0 };
function renderCountdown(t) {
  if (!t) return;
  cdState = t;
  setClock($('cdOut'), clockText(t));
  $('cdStart').textContent = t.running ? 'Pause' : 'Start';
  $('cdStart').classList.toggle('on', t.running);
  if (document.activeElement !== $('cdMinutes')) $('cdMinutes').value = String(Math.round(t.countdown / 60000));
}
setInterval(() => { if (cdState.running) setClock($('cdOut'), clockText(cdState)); }, 500);
$('cdStart').addEventListener('click', () => post({ action: 'timer', which: 'countdown', op: cdState.running ? 'pause' : 'start' }));
$('cdReset').addEventListener('click', () => post({ action: 'timer', which: 'countdown', op: 'reset' }));
$('cdSet').addEventListener('click', () => {
  const minutes = Math.max(0, Math.min(600, Math.trunc(Number($('cdMinutes').value)) || 0));
  post({ action: 'timer', which: 'countdown', op: 'set', minutes });
});
$('cdMinutes').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('cdSet').click(); });

// Up-next tables as one line each. "Table 1: Shoji (KR, 8-2-0, 3rd) [Yasuo,
// Unforgiven] vs Margaux (FR, 7-3-0, 6th) [Jinx, Loose Cannon]". Only the
// two names are required; the legend in brackets resolves against the
// catalog so the slate gets art, and the text is rewritten in this shape
// once it lands so what resolved is visible.
function parseTableSide(text) {
  const m = String(text).trim().match(/^(.*?)(?:\s*\(([^)]*)\))?(?:\s*\[([^\]]*)\])?\s*$/);
  const out = { name: '', country: '', record: '', seed: '', legend: '', legendSlug: '', legendCardId: '' };
  if (!m) return out;
  out.name = m[1].trim();
  for (const part of (m[2] || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    if (/^[A-Za-z]{2,3}$/.test(part) && !out.country) out.country = part.toUpperCase();
    else if (/^\d+-\d+(-\d+)?$/.test(part) && !out.record) out.record = part;
    else if (!out.seed) out.seed = part;
  }
  const q = (m[3] || '').trim().toLowerCase();
  if (q) {
    const hit = legendCatalog.find((l) => l.name.toLowerCase() === q) || legendCatalog.find((l) => l.name.toLowerCase().includes(q));
    if (hit) { out.legend = hit.name; out.legendSlug = hit.slug; out.legendCardId = hit.cardId || ''; } else out.legend = m[3].trim();
  }
  return out;
}
function parseTables(text) {
  const tables = [];
  const bad = [];
  for (const raw of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    let label = '';
    let line = raw;
    const colon = raw.indexOf(':');
    if (colon > 0 && colon < raw.search(/\svs\.?\s/i)) { label = raw.slice(0, colon).trim(); line = raw.slice(colon + 1); }
    const halves = line.split(/\s+vs\.?\s+/i);
    if (halves.length !== 2) { bad.push(raw); continue; }
    tables.push({ label, left: parseTableSide(halves[0]), right: parseTableSide(halves[1]) });
  }
  return { tables: tables.slice(0, 4), bad };
}
function tableSideText(s) {
  const bits = [s.country, s.record, s.seed].filter(Boolean);
  return `${s.name}${bits.length ? ` (${bits.join(', ')})` : ''}${s.legend ? ` [${s.legend}]` : ''}`;
}
function tablesToText(tables) {
  return tables.map((t) => `${t.label ? `${t.label}: ` : ''}${tableSideText(t.left)} vs ${tableSideText(t.right)}`).join('\n');
}
{
  let timer = null;
  const flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    const { tables, bad } = parseTables($('tablesText').value);
    $('tablesHint').textContent = bad.length ? `Could not read: ${bad[0]}. Each line needs "name vs name".` : (tables.length ? `${tables.length} table${tables.length === 1 ? '' : 's'}.` : '');
    post({ event: { tables } });
  };
  $('tablesText').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(flush, 500); });
  $('tablesText').addEventListener('blur', flush);
}
{
  let timer = null;
  const flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    const casters = $('castersText').value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const parts = l.split(/\s+-\s+|\s+–\s+/).map((x) => x.trim());
      const name = parts.shift() || '';
      // "@handle" may sit in either remaining slot; whatever is left is the role.
      const hi = parts.findIndex((x) => x.startsWith('@'));
      const handle = hi >= 0 ? parts.splice(hi, 1)[0] : '';
      return { name, role: parts.join(' ').trim(), handle };
    });
    post({ event: { casters } });
  };
  $('castersText').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(flush, 500); });
  $('castersText').addEventListener('blur', flush);
}
{
  let timer = null;
  const flush = () => { if (timer === null) return; clearTimeout(timer); timer = null; post({ event: { seeds: $('seedsText').value } }); };
  $('seedsText').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(flush, 500); });
  $('seedsText').addEventListener('blur', flush);
}
const castersToText = (casters) => casters.map((c) => [c.name, c.role, c.handle].filter(Boolean).join(' - ')).join('\n');

// --- the starter kit's event fields: schedule, format, commands, sponsors, next event ---

// "10:00 Swiss round 9": a leading time (anything without spaces) then the title.
function parseSchedule(text) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 8).map((l) => {
    const m = l.match(/^(\S{1,12})\s+(.+)$/);
    return m && /\d/.test(m[1]) ? { time: m[1], title: m[2].trim() } : { time: '', title: l };
  });
}
const scheduleToText = (rows) => rows.map((r) => (r.time ? `${r.time} ${r.title}` : r.title)).join('\n');
{
  let timer = null;
  const flush = () => { if (timer === null) return; clearTimeout(timer); timer = null; post({ event: { schedule: parseSchedule($('scheduleText').value) } }); };
  $('scheduleText').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(flush, 500); });
  $('scheduleText').addEventListener('blur', flush);
}
$('scheduleNow').addEventListener('change', () => post({ event: { scheduleNow: Number($('scheduleNow').value) } }));
for (const [id, field] of [['formatText', 'format'], ['commandsText', 'commands'], ['sponsorsText', 'sponsors'], ['nextName', 'nextName'], ['nextWhen', 'nextWhen']]) {
  const el = $(id);
  let timer = null;
  const flush = () => { if (timer === null) return; clearTimeout(timer); timer = null; post({ event: { [field]: el.value } }); };
  el.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(flush, 300); });
  el.addEventListener('blur', flush);
}
$('champion').addEventListener('change', () => post({ event: { champion: $('champion').value } }));
$('choseFirst').addEventListener('change', () => post({ match: { choseFirst: $('choseFirst').value } }));
$('resultWinner').addEventListener('change', () => post({ match: { result: { winner: $('resultWinner').value } } }));
{
  let timer = null;
  const flush = () => { if (timer === null) return; clearTimeout(timer); timer = null; post({ match: { result: { note: $('resultNote').value } } }); };
  $('resultNote').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(flush, 300); });
  $('resultNote').addEventListener('blur', flush);
}

// --- the bracket editor ---
//
// Players one per line in seed order (the up-next table-side shape), the
// format, then one row per match with the two names, the scores and a
// winner button each. Rows come from the shared model, so what the panel
// lists is what the scene draws.
$('bracketFormat').addEventListener('change', () => post({ event: { bracket: { format: $('bracketFormat').value } } }));
{
  let timer = null;
  const flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    const players = $('bracketPlayers').value.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 16).map(parseTableSide);
    post({ event: { bracket: { players } } });
  };
  $('bracketPlayers').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(flush, 500); });
  $('bracketPlayers').addEventListener('blur', flush);
}
const playersToText = (players) => players.map(tableSideText).join('\n');

function postResult(id, patch) {
  if (!state) return;
  const results = structuredClone(state.preview.event.bracket.results || {});
  results[id] = { top: 0, bottom: 0, winner: '', ...(results[id] || {}), ...patch };
  post({ event: { bracket: { results } } });
}
let bracketKey = null;
function renderBracketEditor(s) {
  const b = s.preview.event.bracket || { format: 'se8', players: [], results: {} };
  if (document.activeElement !== $('bracketFormat')) $('bracketFormat').value = b.format || 'se8';
  setIfIdle('bracketPlayers', playersToText(b.players || []));
  const f = BRACKET_FORMATS[b.format] || BRACKET_FORMATS.se8;
  const n = (b.players || []).filter((p) => p.name).length;
  $('bracketHint').textContent = n ? `${n} of ${f.players} players entered.` : `Enter ${f.players} players, one per line, in seed order.`;
  const built = buildBracket(b.format || 'se8', b.players || [], b.results || {});
  const key = JSON.stringify(built.matches.map((m) => [m.id, m.top.player && m.top.player.name, m.bottom.player && m.bottom.player.name, m.topScore, m.bottomScore, m.winner, m.state]));
  if (key === bracketKey) return;
  bracketKey = key;
  const nodes = [];
  let lastRound = null;
  for (const m of built.matches) {
    const roundKey = `${m.losers ? 'L' : 'W'}${m.round}`;
    if (roundKey !== lastRound) {
      lastRound = roundKey;
      nodes.push(Object.assign(document.createElement('div'), { className: 'br-round', textContent: m.label.replace(/\s\d+$/, '') }));
    }
    const row = document.createElement('div');
    row.className = 'br-match';
    row.dataset.id = m.id;
    const who = (slot, which) => Object.assign(document.createElement('span'), {
      className: `who${slot.player ? '' : ' tbd'}${m.winner === which ? ' win' : ''}`,
      textContent: slot.player ? slot.player.name : (slot.placeholder || 'TBD'),
      title: slot.player ? slot.player.name : '',
    });
    const score = (which, value) => {
      const inp = document.createElement('input');
      inp.className = 'sc';
      inp.inputMode = 'numeric';
      inp.value = String(value);
      inp.dataset.which = which;
      inp.setAttribute('aria-label', `${m.label} ${which} score`);
      inp.disabled = m.state === 'waiting';
      return inp;
    };
    const winBtn = (which) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `win-btn${m.winner === which ? ' on' : ''}`;
      btn.dataset.win = which;
      btn.textContent = m.winner === which ? 'Won' : 'Wins';
      btn.disabled = m.state === 'waiting';
      btn.title = m.winner === which ? 'Clear this result' : `${which === 'top' ? 'Top' : 'Bottom'} player wins`;
      return btn;
    };
    row.append(who(m.top, 'top'), score('top', m.topScore), who(m.bottom, 'bottom'), score('bottom', m.bottomScore));
    const btns = document.createElement('div');
    btns.style.display = 'contents';
    row.append(winBtn('top'), Object.assign(document.createElement('span'), { className: 'id', textContent: `${m.label} · ${m.id}` }), winBtn('bottom'));
    nodes.push(row);
  }
  $('bracketMatches').replaceChildren(...nodes);
}
$('bracketMatches').addEventListener('click', (e) => {
  const btn = e.target.closest('.win-btn');
  if (!btn) return;
  const id = btn.closest('.br-match').dataset.id;
  const cur = state && state.preview.event.bracket.results[id];
  postResult(id, { winner: cur && cur.winner === btn.dataset.win ? '' : btn.dataset.win });
});
$('bracketMatches').addEventListener('change', (e) => {
  const inp = e.target.closest('input.sc');
  if (!inp) return;
  const id = inp.closest('.br-match').dataset.id;
  postResult(id, { [inp.dataset.which]: Math.max(0, Math.min(9, Number(inp.value) || 0)) });
});

// --- the standings editor: pipe-separated rows in rank order ---
function parseStandings(text) {
  const rows = [];
  const bad = [];
  for (const raw of text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 64)) {
    const parts = raw.split('|').map((x) => x.trim());
    if (parts.length < 2) {
      // The table-side shape with trailing numbers: Name (CN, 9-1-0) [Irelia] 27 68.4
      const m = raw.match(/^(.*?)((?:\s+[\d.]+)*)$/);
      const side = parseTableSide(m ? m[1] : raw);
      if (!side.name) { bad.push(raw); continue; }
      const nums = (m && m[2] ? m[2].trim().split(/\s+/) : []).map(Number);
      rows.push({ ...side, points: nums[0] || 0, omw: nums[1] || 0, gw: nums[2] || 0, ogw: nums[3] || 0 });
      continue;
    }
    const [name, country = '', legendText = '', record = '', points = '0', omw = '0', gw = '0', ogw = '0'] = parts;
    if (!name) { bad.push(raw); continue; }
    const side = parseTableSide(`${name} (${[country, record].filter(Boolean).join(', ')})${legendText ? ` [${legendText}]` : ''}`);
    rows.push({ ...side, points: Number(points) || 0, omw: Number(omw) || 0, gw: Number(gw) || 0, ogw: Number(ogw) || 0 });
  }
  return { rows, bad };
}
const standingsToText = (rows) => rows.map((r) => [r.name, r.country, r.legend, r.record, r.points, r.omw || '', r.gw || '', r.ogw || ''].join(' | ').replace(/( \| )+$/, '')).join('\n');
{
  let timer = null;
  const flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    const { rows, bad } = parseStandings($('standingsText').value);
    $('standingsHint').textContent = bad.length ? `Could not read: ${bad[0]}.` : (rows.length ? `${rows.length} row${rows.length === 1 ? '' : 's'}, ${Math.max(1, Math.ceil(rows.length / 20))} page${rows.length > 20 ? 's' : ''}.` : '');
    post({ event: { standings: { rows } } });
  };
  $('standingsText').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(flush, 500); });
  $('standingsText').addEventListener('blur', flush);
}
$('standingsCut').addEventListener('change', () => post({ event: { standings: { cut: Number($('standingsCut').value) } } }));
$('standingsPrev').addEventListener('click', () => { if (state) post({ scenes: { standings: { page: Math.max(1, (state.preview.scenes.standings.page || 1) - 1) } } }); });
$('standingsNext').addEventListener('click', () => { if (state) post({ scenes: { standings: { page: Math.min(4, (state.preview.scenes.standings.page || 1) + 1) } } }); });
$('standingsLegends').addEventListener('change', () => post({ scenes: { standings: { legends: $('standingsLegends').checked } } }));

// --- the pairings editor: one table per line, the Up next shape ---
// "Table 12: Dax (US, 2-1) [Viktor] vs Shoji (KR, 2-1) [Yasuo] = 2-1". The
// table number leads ("Table 12:", "T12:" or "12:"; a line without one
// takes the number after the highest so far); "= 2-1" closes a finished
// table, the left player's games first ("= draw" for a draw, "= W-L" or
// "= L-W" for a win with no games reported); "Bye: A, B" lists the byes.
// What the Tournament platform loads is written back in the same shape.
const PAIRINGS_PER_PAGE = 32;
function parsePairings(text) {
  const rows = [];
  const byes = [];
  const bad = [];
  for (const raw of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const bye = raw.match(/^byes?\s*:\s*(.*)$/i);
    if (bye) { byes.push(...bye[1].split(',').map((x) => x.trim()).filter(Boolean)); continue; }
    let line = raw;
    let table = 0;
    const lead = line.match(/^(?:table\s*|t)?(\d{1,4})\s*[:.]\s*/i);
    if (lead) { table = Number(lead[1]); line = line.slice(lead[0].length); }
    const done = { status: '', score: [0, 0], winner: '' };
    const res = line.match(/\s+=\s*(?:([0-9wl])\s*[-\u2013]\s*([0-9wl])|(draw))\s*$/i);
    if (res) {
      line = line.slice(0, res.index);
      done.status = 'done';
      const [a, b] = [String(res[1] || '').toLowerCase(), String(res[2] || '').toLowerCase()];
      if (res[3]) done.winner = 'draw';
      else if (a === 'w' || b === 'w') done.winner = a === 'w' ? 'left' : 'right';
      else {
        done.score = [Number(a) || 0, Number(b) || 0];
        done.winner = done.score[0] > done.score[1] ? 'left' : done.score[1] > done.score[0] ? 'right' : 'draw';
      }
    }
    const halves = line.split(/\s+vs\.?\s+/i);
    if (halves.length !== 2) { bad.push(raw); continue; }
    const next = rows.reduce((top, r) => Math.max(top, r.table), 0) + 1;
    rows.push({ table: table || next, left: parseTableSide(halves[0]), right: parseTableSide(halves[1]), ...done });
  }
  return { rows: rows.slice(0, 128), byes: byes.slice(0, 16), bad };
}
function pairingsToText(pr) {
  const lines = (pr.rows || []).map((r) => {
    let result = '';
    if (r.status === 'done' && r.winner === 'draw') result = ' = draw';
    else if (r.status === 'done' && r.winner && !r.score[0] && !r.score[1]) result = r.winner === 'left' ? ' = W-L' : ' = L-W';
    else if (r.status === 'done' && r.winner) result = ` = ${r.score[0]}-${r.score[1]}`;
    return `${r.table ? `Table ${r.table}: ` : ''}${tableSideText(r.left)} vs ${tableSideText(r.right)}${result}`;
  });
  if ((pr.byes || []).length) lines.push(`Bye: ${pr.byes.join(', ')}`);
  return lines.join('\n');
}
{
  let timer = null;
  const flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    const { rows, byes, bad } = parsePairings($('pairingsText').value);
    const pages = Math.max(1, Math.ceil(rows.length / PAIRINGS_PER_PAGE));
    $('pairingsHint').textContent = bad.length ? `Could not read: ${bad[0]}. Each table needs "name vs name".`
      : (rows.length ? `${rows.length} table${rows.length === 1 ? '' : 's'}, ${pages} page${pages === 1 ? '' : 's'}${byes.length ? `, ${byes.length} bye${byes.length === 1 ? '' : 's'}` : ''}.` : '');
    post({ event: { pairings: { rows, byes } } });
  };
  $('pairingsText').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(flush, 500); });
  $('pairingsText').addEventListener('blur', flush);
}
const pairingsPages = () => Math.max(1, Math.ceil(((state && state.preview.event.pairings && state.preview.event.pairings.rows) || []).length / PAIRINGS_PER_PAGE));
$('pairingsPrev').addEventListener('click', () => { if (state) post({ scenes: { pairings: { page: Math.max(1, Math.min(pairingsPages(), state.preview.scenes.pairings.page || 1) - 1) } } }); });
$('pairingsNext').addEventListener('click', () => { if (state) post({ scenes: { pairings: { page: Math.min(pairingsPages(), (state.preview.scenes.pairings.page || 1) + 1) } } }); });
$('pairingsLegends').addEventListener('change', () => post({ scenes: { pairings: { legends: $('pairingsLegends').checked } } }));
$('pairingsResults').addEventListener('change', () => post({ scenes: { pairings: { results: $('pairingsResults').checked } } }));

// The Legends switch's note: with it on, say when rows have no legend to
// show (TopDeck shows legends only once the organizer allows it, and a
// typed row may name none), since the graphic then draws empty slots.
function legendNote(id, on, players) {
  const note = $(id);
  const known = players.filter((p) => p.legendSlug || p.legendCardId).length;
  let text = '';
  if (on && players.length && !known) text = 'None of these players has a legend yet, so the graphic shows empty portraits and no legend names. Switch Legends off, or load them again once the legends are known.';
  else if (on && known < players.length) text = `${players.length - known} of ${players.length} players have no legend and show an empty portrait.`;
  note.textContent = text;
  note.classList.toggle('warn', Boolean(text));
}

// --- the legend distribution editor (2026-09-19) ---
//
// One legend per line, read by web/shared/legendstats.js: the legend, how
// many played it, its win rate or record. Legends resolve against the
// catalog so the graphic gets their faces, and the text is written back in
// the same shape once it lands, so what resolved is plain to see. The line
// under the box names what could not be read or matched until the text
// reads clean, and otherwise sums the list up. While a line cannot be read
// the box keeps the operator's own text, so the line is there to fix.
let legendProblem = '';
let legendPosted = '';
let legendKeepText = false;
const legendKey = (rows) => rows.map((r) => `${r.legend}:${r.players || 0}`).join('|');
const resolveTyped = (text) => resolveLegend(legendCatalog, text);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
function legendSummary(ls) {
  const rows = ls.rows || [];
  if (!rows.length) return '';
  const players = rows.reduce((n, r) => n + (r.players || 0), 0);
  return `${plural(rows.length, 'legend')}${players ? `, ${plural(players, 'player')}` : ''}${ls.total > players ? ` of ${ls.total}` : ''}.`;
}
{
  let timer = null;
  const flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    const { rows, bad, unknown } = parseLegendLines($('legendText').value, resolveTyped);
    legendProblem = bad.length ? `Could not read: ${bad[0]}.`
      : unknown.length ? `No legend called ${unknown.slice(0, 3).join(', ')}${unknown.length > 3 ? ` and ${unknown.length - 3} more` : ''}: shown as typed, with no picture.`
        : rows.length > 64 ? `${rows.length} legends: the first 64 by count are kept.` : '';
    if (legendProblem) $('legendHint').textContent = legendProblem;
    const kept = [...rows].sort((a, b) => (b.players || 0) - (a.players || 0) || (b.share || 0) - (a.share || 0)).slice(0, 64);
    legendPosted = legendKey(kept);
    legendKeepText = bad.length > 0;
    post({ event: { legendStats: { rows: kept } } });
  };
  $('legendText').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(flush, 600); });
  // Leaving the box shows what the lines became (full names, repeats
  // merged), whether or not there is still an edit to send.
  $('legendText').addEventListener('blur', () => {
    if (timer !== null) flush();
    else if (state && !legendKeepText) $('legendText').value = legendsToText(state.preview.event.legendStats.rows || []);
  });
}
{
  let timer = null;
  const flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    post({ event: { legendStats: { total: Math.max(0, Math.trunc(Number($('legendTotal').value) || 0)) } } });
  };
  $('legendTotal').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(flush, 400); });
  $('legendTotal').addEventListener('blur', flush);
}
for (const [id, field] of [['legendLabel', 'label'], ['legendNote', 'note']]) {
  const el = $(id);
  let timer = null;
  const flush = () => { if (timer === null) return; clearTimeout(timer); timer = null; post({ event: { legendStats: { [field]: el.value } } }); };
  el.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(flush, 300); });
  el.addEventListener('blur', flush);
}
// Standings rows already carry their legend and record, so a small event
// typed into Match data needs no second list. Their records hold every
// match, mirrors included, and the note says so.
$('legendFromStandings').addEventListener('click', () => {
  if (!state) return;
  const st = state.preview.event.standings || { rows: [] };
  const { rows, skipped } = legendsFromStandings(st.rows || []);
  if (!rows.length) {
    legendProblem = (st.rows || []).length ? 'None of the standings rows names a legend.' : 'Match data › Standings is empty.';
    $('legendHint').textContent = legendProblem;
    return;
  }
  // Players with no legend are worth a line that stays while these rows do.
  legendPosted = legendKey(rows);
  legendKeepText = false;
  legendProblem = skipped ? `Counted ${plural(rows.reduce((n, r) => n + r.players, 0), 'player')} from the standings; ${skipped} with no legend left out.` : '';
  post({ event: { legendStats: {
    rows, total: 0, label: st.label || '',
    note: 'Win rate: the players\' records in the standings, mirror matches included.',
  } } });
  if (legendProblem) $('legendHint').textContent = legendProblem;
});
$('legendstatsRate').addEventListener('change', () => post({ scenes: { legendstats: { winRate: $('legendstatsRate').checked } } }));
$('legendstatsTop').addEventListener('change', () => post({ scenes: { legendstats: { top: Number($('legendstatsTop').value) } } }));

function renderExtras(s) {
  const prev = s.preview;
  const prog = s.program;
  for (const key of EXP_SCENES) {
    const on = prev.scenes[key].visible;
    const btn = $(EXP_TOGGLES[key]);
    btn.textContent = on ? 'ON' : 'OFF';
    btn.classList.toggle('on', on);
    $(EXP_ON_AIR[key]).classList.toggle('hidden', !prog.scenes[key].visible);
  }
  const pp = prev.scenes.igoportrait;
  if (document.activeElement !== $('igoPortraitMode')) $('igoPortraitMode').value = pp.mode;
  for (const [id, flag] of [['igoPortraitTop', 'topBar'], ['igoPortraitHand', 'handCam'], ['igoPortraitCard', 'cardWell']]) {
    if (document.activeElement !== $(id)) $(id).checked = pp[flag];
  }
  const rw = prev.scenes.igorows;
  if (document.activeElement !== $('igoRowsMode')) $('igoRowsMode').value = rw.mode;
  if (document.activeElement !== $('igoRowsHand')) $('igoRowsHand').checked = rw.hand;
  if (document.activeElement !== $('igoRowsHandStyle')) $('igoRowsHandStyle').value = rw.handStyle || 'list';
  if (document.activeElement !== $('igoRowsBattlefields')) $('igoRowsBattlefields').value = rw.battlefields || 'off';
  if (document.activeElement !== $('matchupGame')) $('matchupGame').value = String(prev.scenes.matchup.game || 0);
  if (document.activeElement !== $('sideboardSide')) $('sideboardSide').value = prev.scenes.sideboard.side;
  if (document.activeElement !== $('decklistsSideboards')) $('decklistsSideboards').checked = prev.scenes.decklists.sideboards !== false;
  if (document.activeElement !== $('igoRowsHandArt')) $('igoRowsHandArt').checked = rw.handArt !== false;
  if (document.activeElement !== $('igoRowsShowdown')) $('igoRowsShowdown').checked = Boolean(rw.showdown);
  for (const [id, flag] of [['igoRowsActive', 'activeTurn'], ['igoRowsPoints', 'points'], ['igoRowsTurn', 'turnCounter'], ['igoRowsLogo', 'eventLogo'], ['igoRowsClock', 'clock'], ['igoRowsCard', 'cardDock']]) {
    if (document.activeElement !== $(id)) $(id).checked = rw[flag] !== false;
  }
  const hf = prev.scenes.handfan;
  if (document.activeElement !== $('handfanSide')) $('handfanSide').value = hf.side || 'left';
  if (document.activeElement !== $('handfanOpponent')) $('handfanOpponent').checked = Boolean(hf.opponent);
  if (document.activeElement !== $('handfanShowdown')) $('handfanShowdown').checked = Boolean(hf.showdown);
  if (document.activeElement !== $('handfanIdentity')) $('handfanIdentity').checked = hf.identity !== false;
  if (document.activeElement !== $('handfanClock')) $('handfanClock').checked = hf.clock !== false;
  const sdc = prev.scenes.showdown;
  if (document.activeElement !== $('showdownMode')) $('showdownMode').value = sdc.mode || 'strip';
  if (document.activeElement !== $('showdownHands')) $('showdownHands').checked = sdc.hands !== false;
  renderShowdown(s);
  renderSponsor(s);
  if (document.activeElement !== $('arenaClock')) $('arenaClock').checked = prev.scenes.arenabug.clock;
  const sl = prev.scenes.slate;
  if (document.activeElement !== $('slateMode')) $('slateMode').value = sl.mode;
  setIfIdle('slateText', sl.text || '');
  $('slateText').classList.toggle('hidden', sl.mode !== 'custom');
  if (document.activeElement !== $('slateCountdown')) $('slateCountdown').checked = sl.countdown;
  for (const [id, flag] of [['slateSchedule', 'schedule'], ['slateTicker', 'ticker'], ['slateCamera', 'camera']]) {
    if (document.activeElement !== $(id)) $(id).checked = sl[flag] !== false;
  }
  const ct = prev.scenes.cornertag;
  if (document.activeElement !== $('cornertagMode')) $('cornertagMode').value = ct.mode || 'match';
  setIfIdle('cornertagText', ct.text || '');
  $('cornertagText').classList.toggle('hidden', ct.mode !== 'custom');
  const lt = prev.scenes.lowerthird;
  if (document.activeElement !== $('lowerthirdMode')) $('lowerthirdMode').value = lt.mode || 'casters';
  if (document.activeElement !== $('lowerthirdSide')) $('lowerthirdSide').value = lt.side || 'left';
  setIfIdle('lowerthirdCred', lt.credential || '');
  $('lowerthirdSide').parentElement.classList.toggle('hidden', lt.mode !== 'interview');
  $('lowerthirdCred').classList.toggle('hidden', lt.mode !== 'interview');
  setIfIdle('h2hStatus', prev.scenes.headtohead.status || '');
  if (document.activeElement !== $('profileSide')) $('profileSide').value = prev.scenes.profile.side || 'left';
  if (document.activeElement !== $('profileCamera')) $('profileCamera').checked = prev.scenes.profile.camera !== false;
  if (document.activeElement !== $('profileDecklist')) $('profileDecklist').checked = Boolean(prev.scenes.profile.decklist);
  $('standingsPage').textContent = String(prev.scenes.standings.page || 1);
  if (document.activeElement !== $('standingsCut')) $('standingsCut').value = String(prev.event.standings ? prev.event.standings.cut : 8);
  setIfIdle('standingsText', standingsToText(prev.event.standings ? prev.event.standings.rows || [] : []));
  {
    const ls = prev.event.legendStats || { rows: [], total: 0, label: '', note: '' };
    // A problem stays named while the rows are the ones it was about; rows
    // from anywhere else (the platform, Count from standings) clear it.
    if (legendKey(ls.rows || []) !== legendPosted) {
      legendProblem = '';
      legendKeepText = false;
    }
    if (!legendKeepText) setIfIdle('legendText', legendsToText(ls.rows || []));
    setIfIdle('legendTotal', ls.total ? String(ls.total) : '');
    const counted = (ls.rows || []).reduce((n, r) => n + (r.players || 0), 0);
    $('legendTotal').placeholder = counted ? `auto (${counted})` : 'auto';
    setIfIdle('legendLabel', ls.label || '');
    setIfIdle('legendNote', ls.note || '');
    if (document.activeElement !== $('legendText')) $('legendHint').textContent = legendProblem || legendSummary(ls);
    const lsc = prev.scenes.legendstats;
    if (document.activeElement !== $('legendstatsRate')) $('legendstatsRate').checked = lsc.winRate !== false;
    if (document.activeElement !== $('legendstatsTop')) $('legendstatsTop').value = String(lsc.top || 8);
  }
  if (document.activeElement !== $('standingsLegends')) $('standingsLegends').checked = prev.scenes.standings.legends !== false;
  legendNote('standingsLegendNote', prev.scenes.standings.legends !== false, prev.event.standings ? prev.event.standings.rows || [] : []);
  {
    const pr = prev.event.pairings || { rows: [], byes: [] };
    const pages = Math.max(1, Math.ceil((pr.rows || []).length / PAIRINGS_PER_PAGE));
    const page = Math.min(pages, prev.scenes.pairings.page || 1);
    $('pairingsPage').textContent = pages > 1 ? `${page} of ${pages}` : String(page);
    if (document.activeElement !== $('pairingsLegends')) $('pairingsLegends').checked = prev.scenes.pairings.legends !== false;
    if (document.activeElement !== $('pairingsResults')) $('pairingsResults').checked = prev.scenes.pairings.results !== false;
    legendNote('pairingsLegendNote', prev.scenes.pairings.legends !== false, (pr.rows || []).flatMap((r) => [r.left, r.right]).filter((p) => p && p.name));
    setIfIdle('pairingsText', pairingsToText(pr));
  }
  renderBracketEditor(s);
  if (document.activeElement !== $('choseFirst')) $('choseFirst').value = prev.match.choseFirst || '';
  if (document.activeElement !== $('resultWinner')) $('resultWinner').value = (prev.match.result && prev.match.result.winner) || '';
  setIfIdle('resultNote', (prev.match.result && prev.match.result.note) || '');
  if (document.activeElement !== $('champion')) $('champion').value = prev.event.champion || '';
  setIfIdle('scheduleText', scheduleToText(prev.event.schedule || []));
  {
    const sel = $('scheduleNow');
    const rows = prev.event.schedule || [];
    const want = rows.map((r) => r.title).join('|');
    if (sel.dataset.want !== want) {
      sel.dataset.want = want;
      sel.replaceChildren(Object.assign(document.createElement('option'), { value: '-1', textContent: 'Not set' }), ...rows.map((r, i) => Object.assign(document.createElement('option'), { value: String(i), textContent: `${r.time ? `${r.time} ` : ''}${r.title}` })));
    }
    if (document.activeElement !== sel) sel.value = String(Number.isInteger(prev.event.scheduleNow) ? prev.event.scheduleNow : -1);
  }
  setIfIdle('formatText', prev.event.format || '');
  setIfIdle('commandsText', prev.event.commands || '');
  setIfIdle('sponsorsText', prev.event.sponsors || '');
  setIfIdle('nextName', prev.event.nextName || '');
  setIfIdle('nextWhen', prev.event.nextWhen || '');

  for (const [p, side] of SIDES) {
    const sd = prev.match[side];
    setIfIdle(`${p}record`, sd.record || '');
    setIfIdle(`${p}country`, sd.country || '');
    setIfIdle(`${p}pronouns`, sd.pronouns || '');
    setIfIdle(`${p}archetype`, sd.archetype || '');
    setIfIdle(`${p}playerTeam`, sd.team || '');
    setIfIdle(`${p}store`, sd.store || '');
    setIfIdle(`${p}seasonRecord`, sd.seasonRecord || '');
    setIfIdle(`${p}bestFinish`, sd.bestFinish || '');
    setIfIdle(`${p}finishes`, sd.finishes || '');
    $(`${p}handOut`).textContent = sd.handCount || 0;
    renderHandChips(p, sd);
  }
  $('turnOut').textContent = prev.match.turn || 0;
  if (document.activeElement !== $('activeSide')) $('activeSide').value = prev.match.activeSide || '';
  setIfIdle('roundsRemaining', String(prev.event.roundsRemaining || 0));
  renderCountdown(prev.event.countdown);
  setIfIdle('tablesText', tablesToText(prev.event.tables || []));
  setIfIdle('castersText', castersToText(prev.event.casters || []));
  setIfIdle('seedsText', prev.event.seeds || '');

  renderThumbs(s);
}

// --- graphic thumbnails: click to put a graphic in preview ---
//
// Each row in the Graphics card carries its scene rendered small, from the
// preview bank with ?force=1 so it draws whether or not it is switched on.

const THUMB_URL = (key) => `/scenes/${key}/?transparent=1&preview=1&force=1&anim=0`;

// A click on a picture: in preview already, take it out; otherwise put it in
// (the edge scenes still switch each other off, the two bugs swap).
function toggleScene(key) {
  if (!state) return;
  const prev = state.preview;
  if (prev.scenes[key] && prev.scenes[key].visible) {
    post({ scenes: { [key]: { visible: false } } });
    return;
  }
  if (EDGE_SCENES.includes(key)) { setEdgeScene(key, true); return; }
  if (key === 'scorebug') { post({ scenes: { scorebug: { visible: true }, arenabug: { visible: false } } }); return; }
  if (key === 'arenabug') { post({ scenes: { arenabug: { visible: true }, scorebug: { visible: false } } }); return; }
  if (key === 'cardpopup') {
    if (prev.scenes.cardpopup.card.cardId) post({ scenes: { cardpopup: { visible: true } } });
    else armFeature('cardpopup', 'cardSearch');
    return;
  }
  if (key === 'cardrow') {
    if (prev.scenes.cardrow.cards.some((c) => c.cardId)) post({ scenes: { cardrow: { visible: true } } });
    else armFeature('cardrow', 'rowCard0');
    return;
  }
  if (key === 'sponsor') {
    if (prev.scenes.sponsor.items.length) post({ scenes: { sponsor: { visible: true } } });
    else armFeature('sponsor', 'sponsorName');
    return;
  }
  if (key === 'decklist') {
    if (prev.scenes.decklist.list.trim()) setFullScene('decklist', true);
    return;
  }
  if (FULL_SCENES.includes(key)) { setFullScene(key, true); return; }
  post({ scenes: { [key]: { visible: true } } });
}

// --- the chain beside the star: copy one graphic's browser-source link ---
//
// The same URL Setup lists for that graphic (web/shared/sources.js is the one
// list), so adding a single graphic to OBS or vMix never means a trip to
// Setup (Sam, 2026-09-19).
const CHAIN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
const CHECK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
const SOURCE_PATH = new Map(SCENE_SOURCES.map((s) => [s.key, s.path]));
const sourceLink = (key) => `${location.origin}${SOURCE_PATH.get(key) || `/scenes/${key}/?transparent=1`}`;

function paintLinkButton(btn, key, copied) {
  const name = SCENE_LABELS[key] || key;
  btn.classList.toggle('copied', copied);
  btn.innerHTML = copied ? CHECK_ICON : CHAIN_ICON;
  btn.title = copied ? `Copied: ${sourceLink(key)}` : `Copy the browser-source link for ${name} (1920 x 1080)`;
  btn.setAttribute('aria-label', copied ? `${name} link copied` : `Copy the browser-source link for ${name}`);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // The async clipboard can be refused (an unfocused page, some embeds);
    // the old copy command still works in most of those.
    const ta = Object.assign(document.createElement('textarea'), { value: text, readOnly: true });
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

async function copySourceLink(btn, key) {
  const url = sourceLink(key);
  if (!(await copyText(url))) {
    // Nothing reached the clipboard: hand the operator the link to copy.
    window.prompt('Copy this browser-source link (Ctrl+C):', url);
    return;
  }
  paintLinkButton(btn, key, true);
  clearTimeout(btn.copiedTimer);
  btn.copiedTimer = setTimeout(() => paintLinkButton(btn, key, false), 1600);
}

for (const row of document.querySelectorAll('.scene-row[data-scene]')) {
  const key = row.dataset.scene;
  const thumb = document.createElement('div');
  thumb.className = 'scene-thumb';
  thumb.tabIndex = 0;
  thumb.setAttribute('role', 'button');
  thumb.title = `Put ${SCENE_NAMES[key] || key} in preview`;
  const frame = document.createElement('iframe');
  frame.title = '';
  frame.tabIndex = -1;
  frame.setAttribute('allowtransparency', 'true');
  const tag = document.createElement('span');
  tag.className = 'thumb-tag';
  tag.textContent = 'Preview';
  thumb.append(frame, tag);
  thumb.addEventListener('click', () => toggleScene(key));
  thumb.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleScene(key); } });
  row.prepend(thumb);
  const badge = row.querySelector('.onair');
  badge.title = `Take ${SCENE_NAMES[key] || key} off air`;
  badge.addEventListener('click', () => takeOffAir(key));
  const star = document.createElement('button');
  star.type = 'button';
  star.className = 'fav-star';
  star.addEventListener('click', () => toggleFavorite(key));
  row.querySelector('.scene-name').prepend(star);
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'link-copy';
  link.addEventListener('click', () => copySourceLink(link, key));
  star.after(link);
  paintLinkButton(link, key, false);
}

function renderThumbs(s) {
  for (const row of document.querySelectorAll('.scene-row[data-scene]')) {
    const key = row.dataset.scene;
    const thumb = row.querySelector('.scene-thumb');
    const frame = thumb.querySelector('iframe');
    const want = THUMB_URL(key);
    if (frame.getAttribute('src') !== want) frame.src = want;
    const inPreview = Boolean(s.preview.scenes[key] && s.preview.scenes[key].visible);
    const onAir = Boolean(s.program.scenes[key] && s.program.scenes[key].visible);
    thumb.classList.toggle('in-preview', inPreview);
    thumb.classList.toggle('on-air', onAir);
    // An empty card popup or card row still answers a click (it opens its
    // picker), so it dims but keeps the pointer; an empty decklist does not.
    const empty = (key === 'cardpopup' && !s.preview.scenes.cardpopup.card.cardId)
      || (key === 'cardrow' && !s.preview.scenes.cardrow.cards.some((c) => c.cardId))
      || (key === 'sponsor' && !s.preview.scenes.sponsor.items.length)
      || (key === 'sideboard' && !(s.preview.scenes.sideboard.side === 'both' ? ['left', 'right'] : [s.preview.scenes.sideboard.side])
        .some((k) => s.preview.match[k].deckList.trim()))
      || (key === 'decklists' && !s.preview.match.left.deckList.trim() && !s.preview.match.right.deckList.trim());
    const cantShow = key === 'decklist' && !s.preview.scenes.decklist.list.trim();
    thumb.classList.toggle('empty', empty);
    thumb.classList.toggle('disabled', cantShow);
    const deckGraphic = key === 'sideboard' || key === 'decklists';
    const idle = empty ? (key === 'sponsor' ? 'Add a sponsor' : (deckGraphic ? 'Load a deck' : 'Pick a card')) : (cantShow ? 'Nothing staged' : 'Click to preview');
    thumb.querySelector('.thumb-tag').textContent = onAir ? 'On air' : (inPreview ? 'In preview' : idle);
    thumb.title = inPreview ? `Take ${SCENE_NAMES[key] || key} out of preview`
      : (empty ? (deckGraphic ? `Load a deck under Match data › Decks and battlefields for ${SCENE_NAMES[key] || key}` : `Pick cards for ${SCENE_NAMES[key] || key} under Graphic features`) : `Put ${SCENE_NAMES[key] || key} in preview`);
  }
  renderFeatures(s);
  renderSections(s);
}

// The Graphic features card shows the options of whatever is in preview,
// so an operator edits the graphic they are looking at, not a list of all.
//
// The card popup and the card row hold their content there too (the search
// and the staged card, the four slots), and neither goes into preview empty,
// so a click on either with nothing picked arms its group: it shows until a
// pick puts the graphic in preview, the same click comes again, or CLEAR
// PREVIEW. The popup's search also shows while an overlay that docks the
// staged card is in preview with its dock on, since that is where it lands.
const armedFeatures = new Set();

function armFeature(key, inputId) {
  if (armedFeatures.has(key)) {
    armedFeatures.delete(key);
    if (state) renderFeatures(state);
    return;
  }
  armedFeatures.add(key);
  foldCard($('featuresCard'), true);
  if (state) renderFeatures(state);
  const input = $(inputId);
  input.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  input.focus({ preventScroll: true });
}

function featureShown(key, s) {
  const scenes = s.preview.scenes;
  if (scenes[key] && scenes[key].visible) {
    armedFeatures.delete(key);
    return true;
  }
  if (armedFeatures.has(key)) return true;
  if (key === 'cardpopup') {
    return Boolean((scenes.igodual.visible && scenes.igodual.cardSlot)
      || (scenes.igoportrait.visible && scenes.igoportrait.cardWell)
      || (scenes.igorows.visible && scenes.igorows.cardDock !== false));
  }
  return false;
}

function renderFeatures(s) {
  let any = false;
  for (const group of document.querySelectorAll('.feature-group')) {
    const on = featureShown(group.dataset.scene, s);
    group.classList.toggle('hidden', !on);
    any = any || on;
  }
  $('featuresHint').classList.toggle('hidden', any);
}

// --- graphics folds: 1v1, 2v2 and Other ---
//
// The Graphics card lists its rows in three folds, so a 1v1 show never
// scrolls past the 2v2 layouts. They start closed on every load; a fold's
// heading counts what is in preview and on air inside it, and a graphic put
// in preview opens its fold (revealNewGraphics).
function renderSections(s) {
  for (const sec of document.querySelectorAll('details.scene-section')) {
    const keys = [...sec.querySelectorAll('.scene-row[data-scene]')].map((row) => row.dataset.scene);
    // Counted on every paint: a starred graphic moves between folds.
    sec.querySelector('.sec-count').textContent = `${keys.length} graphic${keys.length === 1 ? '' : 's'}`;
    const inPreview = keys.filter((key) => s.preview.scenes[key] && s.preview.scenes[key].visible).length;
    const onAir = keys.filter((key) => s.program.scenes[key] && s.program.scenes[key].visible).length;
    const prev = sec.querySelector('.sec-pill.prev');
    prev.textContent = `${inPreview} in preview`;
    prev.classList.toggle('hidden', !inPreview);
    const air = sec.querySelector('.sec-pill.air');
    air.textContent = `${onAir} on air`;
    air.classList.toggle('hidden', !onAir);
  }
}

// --- favorites: a starred graphic moves to the fold at the top ---
//
// The star beside a graphic's name moves its row into Favorites, above 1v1,
// and the same star sends it home to where it was listed. The row moves
// rather than being copied, so there is one picture, one switch and one ON
// AIR badge per graphic wherever it sits. Which graphics are starred is one
// operator's convenience, kept in this browser like the folds, never in
// match state.
const FAVORITES_KEY = 'sidewaysStudio.favorites';
const sceneRows = [...document.querySelectorAll('.scene-row[data-scene]')];
// Where each row was listed, so an unstarred one goes back in its old place.
const sceneHome = new Map(sceneRows.map((row, order) => [row.dataset.scene, { row, group: row.parentElement, order }]));

let favorites = [];
try {
  const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
  if (Array.isArray(saved)) favorites = [...new Set(saved.filter((key) => sceneHome.has(key)))];
} catch { /* storage blocked or corrupt: nothing starred */ }

function placeFavorites() {
  const favGroup = $('favoritesGroup');
  for (const key of favorites) favGroup.append(sceneHome.get(key).row);
  for (const [key, home] of sceneHome) {
    const starred = favorites.includes(key);
    const name = SCENE_NAMES[key] || key;
    const star = home.row.querySelector('.fav-star');
    star.textContent = starred ? '\u2605' : '\u2606';
    star.classList.toggle('on', starred);
    star.setAttribute('aria-pressed', starred ? 'true' : 'false');
    star.title = starred ? `Take ${name} out of Favorites` : `Add ${name} to Favorites`;
    star.setAttribute('aria-label', star.title);
    if (starred || home.row.parentElement === home.group) continue;
    // Back home, ahead of the first neighbour that was listed after it.
    const next = [...home.group.querySelectorAll('.scene-row[data-scene]')]
      .find((other) => sceneHome.get(other.dataset.scene).order > home.order);
    home.group.insertBefore(home.row, next || null);
  }
  $('favoritesEmpty').classList.toggle('hidden', favorites.length > 0);
  if (state) renderSections(state);
}

function toggleFavorite(key) {
  const starred = favorites.includes(key);
  favorites = starred ? favorites.filter((k) => k !== key) : [...favorites, key];
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch { /* this session only */ }
  placeFavorites();
  // The row just left for the top of the card: show where it went.
  if (!starred) $('favoritesGroup').closest('details').open = true;
}

placeFavorites();
// Favorites is the one fold that starts open: it holds what the operator
// asked to keep at hand.
if (favorites.length) $('favoritesGroup').closest('details').open = true;

// --- resizable cards: drag the bottom edge ---
//
// Every control card ends in a grip that sets the card's height, up or down
// only: the columns stay where they are. Double-click on the grip lets the
// card size itself again. Heights are one operator's convenience, kept in
// this browser like the folds, never in match state.
const CARD_SIZE_KEY = 'sidewaysStudio.cardHeights';
const MIN_CARD_HEIGHT = 72;

let cardHeights = {};
try {
  const saved = JSON.parse(localStorage.getItem(CARD_SIZE_KEY) || '{}');
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    for (const [key, px] of Object.entries(saved)) {
      if (Number.isFinite(px) && px >= MIN_CARD_HEIGHT) cardHeights[key] = Math.round(px);
    }
  }
} catch { /* storage blocked or corrupt: every card sizes itself */ }

function saveCardHeights() {
  try { localStorage.setItem(CARD_SIZE_KEY, JSON.stringify(cardHeights)); } catch { /* this session only */ }
}

// A set height also stops the card growing or shrinking with its stack.
function sizeCard(card, px) {
  if (px) {
    card.style.height = `${px}px`;
    card.style.flex = '0 0 auto';
  } else {
    card.style.height = '';
    card.style.flex = '';
  }
}

for (const card of document.querySelectorAll('.card[data-size]')) {
  const key = card.dataset.size;
  const grip = document.createElement('div');
  grip.className = 'card-resizer';
  grip.title = 'Drag to change the height of this card. Double-click to let it size itself.';
  grip.setAttribute('role', 'separator');
  grip.setAttribute('aria-orientation', 'horizontal');
  grip.setAttribute('aria-label', `Resize the ${card.querySelector('h2').textContent.trim()} card`);
  grip.tabIndex = 0;
  card.append(grip);
  if (cardHeights[key]) sizeCard(card, cardHeights[key]);
  // Keyboard: the arrows step the height, Backspace lets the card size itself.
  grip.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowDown' ? 16 : (e.key === 'ArrowUp' ? -16 : 0);
    if (!step && e.key !== 'Backspace') return;
    e.preventDefault();
    if (step) cardHeights[key] = Math.max(MIN_CARD_HEIGHT, Math.round(card.getBoundingClientRect().height + step));
    else delete cardHeights[key];
    sizeCard(card, cardHeights[key] || 0);
    saveCardHeights();
  });
  grip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    // preventDefault keeps the drag from selecting text, and also keeps the
    // grip from taking focus, so focus it by hand for the arrow keys.
    e.preventDefault();
    grip.focus();
    const startY = e.clientY;
    const startH = card.getBoundingClientRect().height;
    let moved = false;
    grip.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
    const move = (ev) => {
      moved = true;
      sizeCard(card, Math.max(MIN_CARD_HEIGHT, Math.round(startH + ev.clientY - startY)));
    };
    const done = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', done);
      grip.removeEventListener('pointercancel', done);
      document.body.classList.remove('resizing');
      // A click that never moved pins nothing: the card keeps sizing itself.
      if (!moved) return;
      cardHeights[key] = Math.round(card.getBoundingClientRect().height);
      saveCardHeights();
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', done);
    grip.addEventListener('pointercancel', done);
  });
  grip.addEventListener('dblclick', () => {
    sizeCard(card, 0);
    delete cardHeights[key];
    saveCardHeights();
  });
}

// --- foldable control cards ---
//
// Five cards in the control band fold from their heading, so an operator on
// a short screen keeps the ones a show actually uses open. Which are folded
// is a per-browser convenience, not match state: it never reaches the wire.
const CARD_FOLD_KEY = 'sidewaysStudio.foldedCards';

let foldedCards = new Set();
try {
  const saved = JSON.parse(localStorage.getItem(CARD_FOLD_KEY) || '[]');
  if (Array.isArray(saved)) foldedCards = new Set(saved.filter((k) => typeof k === 'string'));
} catch { /* storage blocked or corrupt: every card starts open */ }

function foldCard(card, open, { remember = true } = {}) {
  card.classList.toggle('collapsed', !open);
  card.querySelector('.fold-btn').setAttribute('aria-expanded', open ? 'true' : 'false');
  // A folded card is only its heading tall; a set height comes back with it.
  if (!open) sizeCard(card, 0);
  else if (card.dataset.size && cardHeights[card.dataset.size]) sizeCard(card, cardHeights[card.dataset.size]);
  if (!remember) return;
  if (open) foldedCards.delete(card.dataset.fold);
  else foldedCards.add(card.dataset.fold);
  try { localStorage.setItem(CARD_FOLD_KEY, JSON.stringify([...foldedCards])); } catch { /* this session only */ }
}

for (const card of document.querySelectorAll('.card.foldable')) {
  foldCard(card, !foldedCards.has(card.dataset.fold), { remember: false });
  card.querySelector('.fold-btn').addEventListener('click', () => {
    foldCard(card, card.classList.contains('collapsed'));
  });
}

// --- folds: everything starts collapsed; a graphic opens what it needs ---
//
// Every collapsible section (the Match data folds and the Setup sections)
// starts closed on every load. When a graphic is put in preview, the folds
// holding fields it draws open and those rows flash once, so the operator
// is taken to the data that graphic shows instead of hunting for it.

let previewedBefore = null;

function sectionsFor(fields) {
  const out = new Map();
  for (const sec of document.querySelectorAll('details.field-section')) {
    const rows = [...sec.querySelectorAll('.field-row')].filter((row) => fields.has(row.dataset.field));
    if (rows.length) out.set(sec, rows);
  }
  return out;
}

// The Graphics fold holding each of these graphics opens.
function openSectionsFor(keys) {
  for (const key of keys) {
    const row = document.querySelector(`.scene-row[data-scene="${key}"]`);
    const sec = row && row.closest('details.scene-section');
    if (sec) sec.open = true;
  }
}

function flashRow(row) {
  row.classList.remove('flash');
  // Restart the animation even if the row flashed a moment ago.
  void row.offsetWidth;
  row.classList.add('flash');
  setTimeout(() => row.classList.remove('flash'), 1700);
}

function revealNewGraphics(s) {
  const visibleIn = (bank) => Object.keys(bank.scenes).filter((key) => bank.scenes[key].visible);
  const now = new Set(visibleIn(s.preview));
  if (previewedBefore === null) {
    previewedBefore = now;
    // First paint: the folds holding whatever is already in preview or on
    // air open, so a show in progress is in view.
    openSectionsFor([...now, ...visibleIn(s.program)]);
    return;
  }
  const fresh = [...now].filter((key) => !previewedBefore.has(key));
  previewedBefore = now;
  if (!fresh.length) return;
  openSectionsFor(fresh);
  const drawn = fresh.filter((key) => Object.hasOwn(SCENE_FIELDS, key));
  if (!drawn.length) return;
  foldCard($('featuresCard'), true);
  const fields = new Set();
  for (const key of drawn) {
    for (const field of SCENE_FIELDS[key]) {
      if (sceneDraws(key, field, null, s.preview)) fields.add(field);
    }
  }
  let first = null;
  for (const [sec, rows] of sectionsFor(fields)) {
    if (sec.classList.contains('hidden')) continue;
    sec.open = true;
    for (const row of rows) {
      flashRow(row);
      first = first || row;
    }
  }
  // Rows outside any fold flash too, so the score bug lights points and names.
  for (const row of document.querySelectorAll('.field-grid > .field-row')) {
    if (fields.has(row.dataset.field)) flashRow(row);
  }
  if (first) first.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

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
      else if (msg.type === 'library' && msg.version !== library.version) loadDeckLibrary();
    } catch { /* ignore */ }
  };
  ws.onopen = () => { setStatus(true); fullFetch(); loadDeckLibrary(); };
  ws.onclose = () => { setStatus(false); setTimeout(connect, 1500); };
  ws.onerror = () => ws.close();
}

fullFetch();
connect();

// --- the sponsor plate ---
//
// The sponsor list lives on the plate (bussed like everything else, so a
// new sponsor goes to air on TAKE). Art uploads first and comes back as a
// URL the server wrote; the sponsor is then added with it. The note over
// the options says where the plate will land with preview as it is.
function sponsorItems() {
  return state ? state.preview.scenes.sponsor.items : [];
}
function postSponsorItems(items) {
  post({ scenes: { sponsor: { items } } });
}
function sponsorError(msg) {
  $('sponsorError').textContent = msg || '';
  $('sponsorError').classList.toggle('hidden', !msg);
}

$('toggleSponsor').addEventListener('click', () => toggleScene('sponsor'));
$('sponsorPosition').addEventListener('change', () => post({ scenes: { sponsor: { position: $('sponsorPosition').value } } }));
$('sponsorDocked').addEventListener('change', () => post({ scenes: { sponsor: { dock: $('sponsorDocked').checked } } }));
for (const [id, field] of [['sponsorInterval', 'interval'], ['sponsorEvery', 'every'], ['sponsorDuration', 'duration']]) {
  $(id).addEventListener('change', () => post({ scenes: { sponsor: { [field]: Number($(id).value) } } }));
}
{
  const el = $('sponsorLabel');
  let timer = null;
  const flush = () => { if (timer === null) return; clearTimeout(timer); timer = null; post({ scenes: { sponsor: { label: el.value } } }); };
  el.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(flush, 300); });
  el.addEventListener('blur', flush);
}

async function uploadSponsorArt(file) {
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' }[file.type];
  if (!ext) throw new Error('Sponsor art must be a PNG, JPG, WebP or SVG.');
  const res = await fetch(`/api/sponsor/image?ext=${ext}`, { method: 'POST', body: file });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.ok) throw new Error(out.error || 'The upload failed.');
  return out.url;
}

$('sponsorAdd').addEventListener('click', async () => {
  const name = $('sponsorName').value.trim();
  const file = $('sponsorFile').files[0];
  if (!name && !file) { sponsorError('Give the sponsor a name, art, or both.'); return; }
  if (sponsorItems().length >= SPONSOR_MAX) { sponsorError(`The plate holds ${SPONSOR_MAX} sponsors.`); return; }
  $('sponsorAdd').disabled = true;
  try {
    const image = file ? await uploadSponsorArt(file) : '';
    // The first sponsor also puts the plate in preview, the way a first card
    // puts the card row there.
    const first = sponsorItems().length === 0;
    post({ scenes: { sponsor: { items: [...sponsorItems(), { name, image }], ...(first ? { visible: true } : {}) } } });
    $('sponsorName').value = '';
    $('sponsorFile').value = '';
    sponsorError('');
  } catch (err) {
    sponsorError(err.message);
  } finally {
    $('sponsorAdd').disabled = false;
  }
});

function renderSponsor(s) {
  const cfg = s.preview.scenes.sponsor;
  if (document.activeElement !== $('sponsorPosition')) $('sponsorPosition').value = cfg.position || 'auto';
  if (document.activeElement !== $('sponsorDocked')) $('sponsorDocked').checked = cfg.dock !== false;
  if (document.activeElement !== $('sponsorInterval')) $('sponsorInterval').value = cfg.interval;
  if (document.activeElement !== $('sponsorEvery')) $('sponsorEvery').value = cfg.every;
  if (document.activeElement !== $('sponsorDuration')) $('sponsorDuration').value = cfg.duration;
  $('sponsorDuration').disabled = !(cfg.every > 0);
  if (document.activeElement !== $('sponsorLabel')) $('sponsorLabel').value = cfg.label || '';
  $('sponsorOnAir').classList.toggle('hidden', !s.program.scenes.sponsor.visible);
  const btn = $('toggleSponsor');
  btn.textContent = cfg.visible ? 'ON' : 'OFF';
  btn.classList.toggle('on', cfg.visible);
  const dock = sponsorDock(s.preview);
  const where = dock.host ? `Docks into ${dock.label}` : (cfg.dock === false ? `Pinned to ${dock.label}` : `No in-game overlay in preview: sits in ${dock.label}`);
  const cycle = cfg.every > 0 ? `, up for ${cfg.duration} s every ${cfg.every} min` : '';
  $('sponsorDock').textContent = `${where} at ${dock.w} x ${dock.h}${cycle}.`;
  renderSponsorList(cfg.items);
}

let shownSponsors = '';
function renderSponsorList(items) {
  const key = JSON.stringify(items);
  if (key === shownSponsors) return;
  // Leave the list alone while one of its names is being typed in.
  if ($('sponsorList').contains(document.activeElement)) return;
  shownSponsors = key;
  $('sponsorList').replaceChildren(...items.map((sp, i) => {
    const row = document.createElement('div');
    row.className = 'sponsor-row';
    const art = document.createElement('div');
    art.className = 'sponsor-art';
    if (sp.image) art.append(Object.assign(document.createElement('img'), { src: sp.image, alt: '' }));
    else art.textContent = 'No art';
    const name = Object.assign(document.createElement('input'), { value: sp.name, maxLength: 60, placeholder: 'Name (shown when there is no art)' });
    name.addEventListener('change', () => postSponsorItems(sponsorItems().map((it, k) => (k === i ? { ...it, name: name.value } : it))));
    const move = (d) => {
      const list = [...sponsorItems()];
      const j = i + d;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      postSponsorItems(list);
    };
    const up = Object.assign(document.createElement('button'), { className: 'clear-mini', textContent: '▲', title: 'Earlier in the rotation', disabled: i === 0 });
    up.addEventListener('click', () => move(-1));
    const down = Object.assign(document.createElement('button'), { className: 'clear-mini', textContent: '▼', title: 'Later in the rotation', disabled: i === items.length - 1 });
    down.addEventListener('click', () => move(1));
    const del = Object.assign(document.createElement('button'), { className: 'clear-mini', textContent: '×', title: 'Remove this sponsor' });
    del.addEventListener('click', () => postSponsorItems(sponsorItems().filter((_, k) => k !== i)));
    row.append(art, name, up, down, del);
    return row;
  }));
}
