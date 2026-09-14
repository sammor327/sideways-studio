// State store: single source of truth for every scene and the panel.
// vMix-style bus model (locked Loop 2): the operator edits the PREVIEW bank,
// {action:"take"} clones preview into PROGRAM atomically, {action:"clear"}
// hides every program graphic without touching data. Broadcast URLs render
// the program bank; ?preview=1 renders the preview bank. Theme is global,
// not bussed: identity changes are setup, not cued graphics.
// All mutations pass applyUpdate()'s whitelist (broadcast-line-handoff
// §3.1/§3.5: one choke point, strict field whitelist, clamp numerics).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isCuratedFont } from './fonts.js';
import { DATA_DIR } from './runtime.js';
import { LOOK_SCENES, cleanLookPatch, emptyLook, emptySceneLook, mergeLook } from '../web/shared/look.js';

const SAVE_FILE = path.join(DATA_DIR, 'event.json');

// One side of the match. In 2v2 the side is a team: teamName plus the
// second player's fields (the flat *2 fields keep the sanitizer and the
// 1v1 scene unchanged). legendCardId2 and champion2 feed the teammate's
// tile on the 2v2 bars overlay, which draws card art and a champion line
// for both players like the POV does for one.
// The POV overlay reads the same side (Sam, Loop 5: one score, so the bug
// and the POV can never disagree on air) and adds the champion unit line,
// the featured card, and the card ids the art slots resolve against.
function defaultSide(name) {
  return {
    name, legend: '', legendSlug: '', battlefield: '',
    name2: '', legend2: '', legendSlug2: '', battlefield2: '', teamName: '',
    legendCardId2: '', champion2: '',
    champion: '', card: { cardId: '', cardName: '' },
    legendCardId: '', battlefieldCardId: '',
    // The Swiss seed into the cut ("1ST", "8TH"): the dual-column overlay
    // badges it under the webcam, the way the Regional Qualifier feed does.
    seed: '',
    // Identity lines every other TCG production prints (2026-09-14 overlay
    // scouting) and the experimental overlays draw: record "8-2-0", a
    // country code chip, pronouns, and the archetype string.
    record: '', country: '', pronouns: '', archetype: '',
    // Hidden information for the rows overlay: a list of cards in hand
    // (resolved cards, so the scene draws costs without a catalog), a plain
    // count for a TO who counts but cannot spot, and a "holds" line naming
    // the battlefields a side controls.
    handCount: 0, hand: [], holds: '',
    score: 0, gameWins: 0,
  };
}

// The round clock. Wall-clock based so every scene computes the same display
// from the same three numbers: elapsed is the time banked while paused,
// startedAt the moment the current run began (0 when paused), countdown the
// round length in ms (0 counts up). Driven by the timer action, which is a
// cue and lands in both banks at once.
function defaultTimer() {
  return { running: false, startedAt: 0, elapsed: 0, countdown: 0 };
}

function defaultBank() {
  return {
    event: {
      name: '', roundTitle: '',
      // Experimental graphics: rounds left in the Swiss (0 = not shown), a
      // second clock for the slate's "stream resumes in", the feature tables
      // the up-next board lists, the caster desk, and a seeds paste.
      roundsRemaining: 0, countdown: defaultTimer(), tables: [], casters: [], seeds: '',
    },
    match: {
      seriesLength: 3,
      // Whose turn it is (chevron by the points on the experimental
      // overlays) and the turn counter; both are cues, so they act on air
      // without a TAKE like the clock does.
      activeSide: '', turn: 0,
      left: defaultSide('PLAYER ONE'),
      right: defaultSide('PLAYER TWO'),
      timer: defaultTimer(),
    },
    scenes: {
      scorebug: { visible: false },
      cardpopup: { visible: false, card: { cardId: '', cardName: '', cardType: '' } },
      // mode: legend art fills the holder boxes, or webcam leaves them
      // transparent for OBS sources behind (per-show toggle, SPEC; 2v2
      // matches 1v1 per Sam, Loop 4).
      igo1v1: { visible: false, mode: 'legend' },
      igo2v2: { visible: false, mode: 'legend' },
      // The dual-column overlay (the Regional Qualifier grammar): two full
      // height player columns. Its extras each switch off on their own: the
      // 1-8-1 point track top centre, the round clock, the event block
      // bottom left, and the docked featured card bottom right (which shows
      // the card popup's card and stands in for the popup while it is on).
      igodual: { visible: false, mode: 'legend', track: true, clock: true, eventBlock: true, cardSlot: true },
      // The 2v2 bars (the Singapore showmatch grammar): a bar per team
      // across the top and bottom edges with a legend / team camera /
      // legend cluster hanging off each. mode works like the sidebars'.
      igobars: { visible: false, mode: 'legend' },
      // Per-side flags: a POV stream often airs only the featured player's
      // column, and hiding a side removes its chrome with it.
      pov: { visible: false, showLeft: true, showRight: true },
      // The paste itself is the state: the scene resolves it to cards, so a
      // deck is one field rather than a serialised card list. background is
      // the plate's own full-bleed backdrop (off = only the cards paint, for
      // keying over the feed). deckName labels a list loaded from the saved
      // library. replay is a counter the "replay intro" cue bumps.
      decklist: { visible: false, list: '', showSideboard: true, background: true, deckName: '', replay: 0 },
      // --- experimental (Setup > Experimental switches them on in the panel) ---
      // Portrait pillars: a pillarboxed portrait table cam with a compact
      // game-state bar over it (the Yu-Gi-Oh grammar). handCam opens a
      // second transparent window on the left; cardWell docks the popup's
      // card on the right.
      igoportrait: { visible: false, mode: 'legend', topBar: true, handCam: false, cardWell: true },
      // Rows: slim bars top and bottom and a left column with both cameras
      // and the cards-in-hand list (the Magic grammar).
      igorows: { visible: false, mode: 'legend', hand: true },
      // Arena score bug: the Pokémon wide-shot bug on the 1-to-8 track, for
      // stage and player cameras. Exclusive with the score bug in the panel.
      arenabug: { visible: false, clock: true },
      // Slate: full-frame hold screens. upnext lists event.tables; the
      // others print a message and, when on, the countdown clock.
      slate: { visible: false, mode: 'upnext', text: '', countdown: true },
    },
  };
}

// Accents, font and logo predate the look model and every scene reads them
// at the top level. `look` is the organizer's global look (optional fields
// over each graphic's designed colours) and `scenes` holds per-graphic
// overrides; see web/shared/look.js.
function defaultTheme() {
  const scenes = {};
  for (const key of LOOK_SCENES) scenes[key] = emptySceneLook();
  // experimental is setup, not a cue: it decides which graphics the panel
  // lists, so it lives with the theme rather than in a bank.
  return { accentA: '#11b6fb', accentB: '#1bef19', font: '', logo: '', experimental: false, look: emptyLook(), scenes };
}

function mergeTheme(raw) {
  const theme = defaultTheme();
  if (!raw || typeof raw !== 'object') return theme;
  for (const key of ['accentA', 'accentB', 'font', 'logo']) {
    if (typeof raw[key] === 'string') theme[key] = raw[key];
  }
  theme.experimental = Boolean(raw.experimental);
  theme.look = mergeLook(raw.look);
  if (raw.scenes && typeof raw.scenes === 'object') {
    for (const key of LOOK_SCENES) theme.scenes[key] = mergeLook(raw.scenes[key], true);
  }
  return theme;
}

function defaultState() {
  return {
    version: 0,
    updatedAt: null,
    preview: defaultBank(),
    program: defaultBank(),
    theme: defaultTheme(),
  };
}

let state = defaultState();
const listeners = new Set();
let saveTimer = null;

function mergeBank(bank, raw) {
  for (const key of ['event', 'match', 'scenes']) {
    if (raw[key] && typeof raw[key] === 'object') Object.assign(bank[key], raw[key]);
  }
  // Saves from older versions predate some fields: layer loaded data over
  // fresh defaults so every side and scene carries the full shape.
  const fresh = defaultBank();
  bank.match.left = { ...fresh.match.left, name: '', ...bank.match.left };
  bank.match.right = { ...fresh.match.right, name: '', ...bank.match.right };
  // The featured card is the one nested object on a side, so the spread above
  // would carry a partial card straight through from an older save.
  for (const side of [bank.match.left, bank.match.right]) {
    side.card = { ...fresh.match.left.card, ...(side.card || {}) };
  }
  bank.match.timer = { ...fresh.match.timer, ...(bank.match.timer || {}) };
  bank.match = { ...fresh.match, ...bank.match };
  // Event fields grew with the experimental graphics; older saves carry only
  // the name and round title, and a hand or table list must be an array.
  bank.event = { ...fresh.event, ...bank.event };
  bank.event.countdown = { ...fresh.event.countdown, ...(bank.event.countdown || {}) };
  for (const key of ['tables', 'casters']) {
    if (!Array.isArray(bank.event[key])) bank.event[key] = [];
  }
  for (const side of [bank.match.left, bank.match.right]) {
    if (!Array.isArray(side.hand)) side.hand = [];
  }
  for (const key of Object.keys(fresh.scenes)) {
    bank.scenes[key] = { ...fresh.scenes[key], ...bank.scenes[key] };
  }
}

// Load saved state; migrate pre-bus saves (Loop 0/1 kept event/match/scenes at
// the top level and cardpopup as staged/live) into both banks. Called once at
// startup rather than on import: the packaged build is bundled to CommonJS,
// which has no top-level await.
export async function initState() {
  try {
    const raw = JSON.parse(await readFile(SAVE_FILE, 'utf8'));
    if (raw.preview && raw.program) {
      mergeBank(state.preview, raw.preview);
      mergeBank(state.program, raw.program);
      state.theme = mergeTheme(raw.theme);
    } else if (raw.match) {
      mergeBank(state.preview, raw);
      mergeBank(state.program, raw);
      for (const bank of [state.preview, state.program]) {
        const cp = bank.scenes.cardpopup;
        if (cp && (cp.staged || cp.live)) {
          bank.scenes.cardpopup = {
            visible: Boolean(cp.visible),
            card: { ...defaultBank().scenes.cardpopup.card, ...(cp.live?.cardId ? cp.live : cp.staged || {}) },
          };
        }
      }
      // Preview mirrors program after migration so the first TAKE is a no-op.
      state.preview = structuredClone(state.program);
    }
    if (Number.isInteger(raw.version)) state.version = raw.version;
  } catch {
    // First run or unreadable save: start from defaults.
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await mkdir(DATA_DIR, { recursive: true });
      await writeFile(SAVE_FILE, JSON.stringify(state, null, 2));
    } catch (err) {
      console.warn('autosave failed:', err.message);
    }
  }, 400);
}

export const cleanStr = (v, max) =>
  String(v).replace(/[ -]/g, '').trim().slice(0, max);
const clampInt = (v, min, max) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};

export const winsNeeded = (seriesLength) => Math.ceil(seriesLength / 2);

// Card ids become art URLs and cache filenames; anything outside this shape
// is dropped to empty rather than trusted.
const cleanCardId = (v) => {
  const s = cleanStr(v, 16);
  return /^[A-Za-z0-9-]*$/.test(s) ? s : '';
};
const cleanHex = (v, fallback) => {
  const s = cleanStr(v, 7);
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : fallback;
};

// The card list a spotter builds for the rows overlay: each entry is a card
// the panel resolved through the search, carried with the cost the scene
// draws. Anything malformed drops rather than airing as a blank row.
const DOMAINS = ['Body', 'Calm', 'Chaos', 'Fury', 'Mind', 'Order'];
function cleanHandCard(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const cardId = cleanCardId(raw.cardId);
  const cardName = cleanStr(raw.cardName || '', 80);
  if (!cardId && !cardName) return null;
  const domains = Array.isArray(raw.domains) ? raw.domains.filter((d) => DOMAINS.includes(d)).slice(0, 2) : [];
  const energy = raw.energy === '' || raw.energy === null || raw.energy === undefined ? null : clampInt(raw.energy, 0, 20);
  return { cardId, cardName, energy, domains };
}

const COUNTRY = /^[A-Z]{0,3}$/;
// The identity block one player carries on an up-next table card. Its
// fields are a subset of a side's, cleaned by the same rules.
function cleanTableSide(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const country = cleanStr(r.country || '', 3).toUpperCase();
  const legendSlug = cleanStr(r.legendSlug || '', 60);
  return {
    name: cleanStr(r.name || '', 40),
    country: COUNTRY.test(country) ? country : '',
    record: cleanStr(r.record || '', 12),
    seed: cleanStr(r.seed || '', 8),
    legend: cleanStr(r.legend || '', 60),
    legendSlug: /^[a-z0-9-]*$/.test(legendSlug) ? legendSlug : '',
    legendCardId: cleanCardId(r.legendCardId || ''),
  };
}
function cleanTable(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return { label: cleanStr(r.label || '', 24), left: cleanTableSide(r.left), right: cleanTableSide(r.right) };
}
function cleanCaster(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = cleanStr(raw.name || '', 40);
  if (!name) return null;
  return { name, role: cleanStr(raw.role || '', 30) };
}

function applySide(side, patch) {
  if (patch.name !== undefined) side.name = cleanStr(patch.name, 40);
  if (patch.record !== undefined) side.record = cleanStr(patch.record, 12);
  if (patch.country !== undefined) {
    const c = cleanStr(patch.country, 3).toUpperCase();
    if (COUNTRY.test(c)) side.country = c;
  }
  if (patch.pronouns !== undefined) side.pronouns = cleanStr(patch.pronouns, 16);
  if (patch.archetype !== undefined) side.archetype = cleanStr(patch.archetype, 40);
  if (patch.handCount !== undefined) side.handCount = clampInt(patch.handCount, 0, 20);
  if (patch.holds !== undefined) side.holds = cleanStr(patch.holds, 80);
  if (Array.isArray(patch.hand)) side.hand = patch.hand.map(cleanHandCard).filter(Boolean).slice(0, 12);
  if (patch.legend !== undefined) side.legend = cleanStr(patch.legend, 60);
  if (patch.legendSlug !== undefined) {
    const s = cleanStr(patch.legendSlug, 60);
    if (/^[a-z0-9-]*$/.test(s)) side.legendSlug = s;
  }
  if (patch.battlefield !== undefined) side.battlefield = cleanStr(patch.battlefield, 40);
  if (patch.name2 !== undefined) side.name2 = cleanStr(patch.name2, 40);
  if (patch.legend2 !== undefined) side.legend2 = cleanStr(patch.legend2, 60);
  if (patch.legendSlug2 !== undefined) {
    const s = cleanStr(patch.legendSlug2, 60);
    if (/^[a-z0-9-]*$/.test(s)) side.legendSlug2 = s;
  }
  if (patch.battlefield2 !== undefined) side.battlefield2 = cleanStr(patch.battlefield2, 40);
  if (patch.teamName !== undefined) side.teamName = cleanStr(patch.teamName, 40);
  if (patch.champion !== undefined) side.champion = cleanStr(patch.champion, 40);
  if (patch.champion2 !== undefined) side.champion2 = cleanStr(patch.champion2, 40);
  if (patch.seed !== undefined) side.seed = cleanStr(patch.seed, 8);
  // Card ids become art URLs: same shape guard as any other card id.
  if (patch.legendCardId !== undefined) side.legendCardId = cleanCardId(patch.legendCardId);
  if (patch.legendCardId2 !== undefined) side.legendCardId2 = cleanCardId(patch.legendCardId2);
  if (patch.battlefieldCardId !== undefined) side.battlefieldCardId = cleanCardId(patch.battlefieldCardId);
  if (patch.card && typeof patch.card === 'object') applyCard(side.card, patch.card);
  if (patch.score !== undefined) side.score = clampInt(patch.score, 0, 8);
  if (patch.gameWins !== undefined) side.gameWins = clampInt(patch.gameWins, 0, 3);
}

// Shared by the card popup and by each side's featured POV card. cardType is
// only carried by the popup, so it is written only where the target has it.
// A decklist is the one field where newlines carry meaning, so this keeps
// them and strips every other control character.
export const cleanMultiline = (v, max) => String(v)
  .split(/\r?\n/)
  .map((line) => line.replace(/[\u0000-\u001f\u007f]/g, '').trimEnd())
  .join('\n')
  .slice(0, max);

function applyCard(card, patch) {
  if (patch.cardId !== undefined) card.cardId = cleanCardId(patch.cardId);
  if (patch.cardName !== undefined) card.cardName = cleanStr(patch.cardName, 80);
  if (patch.cardType !== undefined && 'cardType' in card) card.cardType = cleanStr(patch.cardType, 24);
}

// Field whitelist for one bank; every operator edit lands in PREVIEW only.
function applyBankPatch(bank, patch) {
  if (patch.event && typeof patch.event === 'object') {
    if (patch.event.name !== undefined) bank.event.name = cleanStr(patch.event.name, 80);
    if (patch.event.roundTitle !== undefined) bank.event.roundTitle = cleanStr(patch.event.roundTitle, 60);
    if (patch.event.roundsRemaining !== undefined) bank.event.roundsRemaining = clampInt(patch.event.roundsRemaining, 0, 99);
    if (patch.event.seeds !== undefined) bank.event.seeds = cleanMultiline(patch.event.seeds, 800);
    if (Array.isArray(patch.event.tables)) bank.event.tables = patch.event.tables.slice(0, 4).map(cleanTable);
    if (Array.isArray(patch.event.casters)) bank.event.casters = patch.event.casters.slice(0, 4).map(cleanCaster).filter(Boolean);
  }

  if (patch.match && typeof patch.match === 'object') {
    if (patch.match.seriesLength !== undefined) {
      const sl = Number(patch.match.seriesLength);
      if ([1, 3, 5].includes(sl)) bank.match.seriesLength = sl;
    }
    if (['', 'left', 'right'].includes(patch.match.activeSide)) bank.match.activeSide = patch.match.activeSide;
    if (patch.match.turn !== undefined) bank.match.turn = clampInt(patch.match.turn, 0, 99);
    if (patch.match.left && typeof patch.match.left === 'object') applySide(bank.match.left, patch.match.left);
    if (patch.match.right && typeof patch.match.right === 'object') applySide(bank.match.right, patch.match.right);
  }

  // Game wins can never exceed what the current series length allows.
  const cap = winsNeeded(bank.match.seriesLength);
  bank.match.left.gameWins = Math.min(bank.match.left.gameWins, cap);
  bank.match.right.gameWins = Math.min(bank.match.right.gameWins, cap);

  if (patch.scenes && typeof patch.scenes === 'object') {
    if (patch.scenes.scorebug && typeof patch.scenes.scorebug === 'object') {
      if (patch.scenes.scorebug.visible !== undefined) {
        bank.scenes.scorebug.visible = Boolean(patch.scenes.scorebug.visible);
      }
    }
    if (patch.scenes.cardpopup && typeof patch.scenes.cardpopup === 'object') {
      const cp = patch.scenes.cardpopup;
      if (cp.card && typeof cp.card === 'object') applyCard(bank.scenes.cardpopup.card, cp.card);
      if (cp.visible !== undefined) bank.scenes.cardpopup.visible = Boolean(cp.visible);
      // A popup with no card can never be on.
      if (!bank.scenes.cardpopup.card.cardId) bank.scenes.cardpopup.visible = false;
    }
    if (patch.scenes.decklist && typeof patch.scenes.decklist === 'object') {
      const d = patch.scenes.decklist;
      if (d.visible !== undefined) bank.scenes.decklist.visible = Boolean(d.visible);
      if (d.showSideboard !== undefined) bank.scenes.decklist.showSideboard = Boolean(d.showSideboard);
      if (d.background !== undefined) bank.scenes.decklist.background = Boolean(d.background);
      if (d.list !== undefined) bank.scenes.decklist.list = cleanMultiline(d.list, 6000);
      if (d.deckName !== undefined) bank.scenes.decklist.deckName = cleanStr(d.deckName, 60);
      // A decklist with no list can never be on, however the list got emptied
      // (same rule as a popup with no card): otherwise the panel shows a
      // disabled ON toggle and an ON AIR pill over a blank graphic.
      if (!bank.scenes.decklist.list.trim()) bank.scenes.decklist.visible = false;
    }
    if (patch.scenes.pov && typeof patch.scenes.pov === 'object') {
      const p = patch.scenes.pov;
      if (p.visible !== undefined) bank.scenes.pov.visible = Boolean(p.visible);
      if (p.showLeft !== undefined) bank.scenes.pov.showLeft = Boolean(p.showLeft);
      if (p.showRight !== undefined) bank.scenes.pov.showRight = Boolean(p.showRight);
    }
    const IGO_FLAGS = {
      igodual: ['track', 'clock', 'eventBlock', 'cardSlot'],
      igoportrait: ['topBar', 'handCam', 'cardWell'],
      igorows: ['hand'],
    };
    for (const key of ['igo1v1', 'igo2v2', 'igodual', 'igobars', 'igoportrait', 'igorows']) {
      if (patch.scenes[key] && typeof patch.scenes[key] === 'object') {
        const igo = patch.scenes[key];
        if (igo.visible !== undefined) bank.scenes[key].visible = Boolean(igo.visible);
        if (igo.mode !== undefined && ['legend', 'webcam'].includes(igo.mode)) {
          bank.scenes[key].mode = igo.mode;
        }
        for (const flag of IGO_FLAGS[key] || []) {
          if (igo[flag] !== undefined) bank.scenes[key][flag] = Boolean(igo[flag]);
        }
      }
    }
    if (patch.scenes.arenabug && typeof patch.scenes.arenabug === 'object') {
      const a = patch.scenes.arenabug;
      if (a.visible !== undefined) bank.scenes.arenabug.visible = Boolean(a.visible);
      if (a.clock !== undefined) bank.scenes.arenabug.clock = Boolean(a.clock);
    }
    if (patch.scenes.slate && typeof patch.scenes.slate === 'object') {
      const s = patch.scenes.slate;
      if (s.visible !== undefined) bank.scenes.slate.visible = Boolean(s.visible);
      if (SLATE_MODES.includes(s.mode)) bank.scenes.slate.mode = s.mode;
      if (s.text !== undefined) bank.scenes.slate.text = cleanStr(s.text, 120);
      if (s.countdown !== undefined) bank.scenes.slate.countdown = Boolean(s.countdown);
    }
  }
}

export const SLATE_MODES = ['upnext', 'starting', 'brb', 'thanks', 'custom'];

function applyThemePatch(patch) {
  if (patch.accentA !== undefined) state.theme.accentA = cleanHex(patch.accentA, state.theme.accentA);
  if (patch.accentB !== undefined) state.theme.accentB = cleanHex(patch.accentB, state.theme.accentB);
  if (patch.font !== undefined) {
    const f = cleanStr(patch.font, 40);
    if (f === '' || isCuratedFont(f)) state.theme.font = f;
  }
  // Clients may only clear the logo; the upload route sets the real value.
  if (patch.logo === '') state.theme.logo = '';
  if (patch.experimental !== undefined) state.theme.experimental = Boolean(patch.experimental);
  // The look: same rule for background images (clients clear, the upload
  // route sets). Everything else is hex, enum or clamped integer.
  if (patch.look && typeof patch.look === 'object') cleanLookPatch(state.theme.look, patch.look);
  if (patch.scenes && typeof patch.scenes === 'object') {
    for (const key of LOOK_SCENES) {
      if (patch.scenes[key] && typeof patch.scenes[key] === 'object') {
        cleanLookPatch(state.theme.scenes[key], patch.scenes[key]);
      }
    }
  }
}

// The upload route calls this after writing the file to disk.
export function setThemeLogo(urlPath) {
  state.theme.logo = urlPath;
  bump();
}

// Background image uploads: slot is 'global' or a scene key. Uploading sets
// the kind to image as well, since that is what the operator meant.
export function setThemeImage(slot, urlPath) {
  const target = slot === 'global' ? state.theme.look : state.theme.scenes[slot];
  if (!target) return false;
  target.background.image = urlPath;
  target.background.kind = 'image';
  bump();
  return true;
}

// The timer is a cue like CLEAR: it acts on both banks so the clock never
// waits for a TAKE. Every op is idempotent enough to survive a double click.
// which: 'round' (the match clock, default) or 'countdown' (the slate's
// "stream resumes in" clock). Same arithmetic, separate numbers.
function applyTimer(patch) {
  const now = Date.now();
  for (const bank of [state.preview, state.program]) {
    const t = patch.which === 'countdown' ? bank.event.countdown : bank.match.timer;
    switch (patch.op) {
      case 'start':
        if (!t.running) { t.running = true; t.startedAt = now; }
        break;
      case 'pause':
        if (t.running) { t.elapsed += now - t.startedAt; t.running = false; t.startedAt = 0; }
        break;
      case 'reset':
        t.running = false; t.startedAt = 0; t.elapsed = 0;
        break;
      case 'set': {
        // Minutes for the round; 0 means count up. Setting also resets.
        const minutes = Math.min(600, Math.max(0, Number(patch.minutes) || 0));
        t.countdown = Math.round(minutes * 60000);
        t.running = false; t.startedAt = 0; t.elapsed = 0;
        break;
      }
      default:
        return false;
    }
  }
  return true;
}

export function getState() {
  return state;
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function bump() {
  state.version += 1;
  state.updatedAt = new Date().toISOString();
  scheduleSave();
  for (const fn of listeners) fn(state);
}

// Whitelist merge: unknown keys are dropped silently, numerics clamped.
// Actions: take (preview -> program, atomic) and clear (all program graphics
// off, data untouched: the wrong-graphic-on-air recovery).
export function applyUpdate(patch) {
  if (!patch || typeof patch !== 'object') return { ok: false, error: 'invalid body' };

  if (patch.action === 'take') {
    state.program = structuredClone(state.preview);
    bump();
    return { ok: true, version: state.version };
  }
  if (patch.action === 'clear') {
    for (const scene of Object.values(state.program.scenes)) scene.visible = false;
    bump();
    return { ok: true, version: state.version };
  }
  // Replay the decklist build-in on air. Like CLEAR it is a cue, not an edit,
  // so it acts on program directly; preview gets the same count so TAKE does
  // not light up for a difference nobody made.
  if (patch.action === 'replay' && patch.scene === 'decklist') {
    const next = (state.program.scenes.decklist.replay || 0) + 1;
    state.program.scenes.decklist.replay = next;
    state.preview.scenes.decklist.replay = next;
    bump();
    return { ok: true, version: state.version };
  }
  if (patch.action === 'timer') {
    if (!applyTimer(patch)) return { ok: false, error: 'unknown timer op' };
    bump();
    return { ok: true, version: state.version };
  }
  // The turn counter and the active side are cues like the clock: a spotter
  // clicks "next turn" and the overlay on air follows at once.
  if (patch.action === 'turn') {
    for (const bank of [state.preview, state.program]) {
      const m = bank.match;
      switch (patch.op) {
        case 'next':
          m.turn = Math.min(99, m.turn + 1);
          // A turn passes to the other player; an unset side starts with left.
          m.activeSide = m.activeSide === 'left' ? 'right' : 'left';
          break;
        case 'prev': m.turn = Math.max(0, m.turn - 1); break;
        case 'reset': m.turn = 0; m.activeSide = ''; break;
        case 'set': m.turn = clampInt(patch.turn, 0, 99); break;
        case 'side':
          if (['', 'left', 'right'].includes(patch.side)) m.activeSide = patch.side;
          break;
        default:
          return { ok: false, error: 'unknown turn op' };
      }
    }
    bump();
    return { ok: true, version: state.version };
  }
  if (patch.action !== undefined) return { ok: false, error: 'unknown action' };

  applyBankPatch(state.preview, patch);
  if (patch.theme && typeof patch.theme === 'object') applyThemePatch(patch.theme);
  bump();
  return { ok: true, version: state.version };
}
