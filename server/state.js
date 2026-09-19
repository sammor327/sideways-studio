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
import { flowOf, kindOf } from './carddb.js';
import { DRAWS_MAX, ROWS_CHOICES, ROWS_DEFAULT, cardKey, countBy } from '../web/shared/odds.js';
import { TRASH_MAX } from '../web/shared/trash.js';
import { BRACKET_FORMAT_KEYS, cleanBracketResults } from '../web/shared/bracket.js';
import { SPONSOR_MAX, SPONSOR_POSITIONS } from '../web/shared/sponsor.js';
import {
  ROLL_OPS, ROLL_SPEEDS, ROLL_SPEED_DEFAULT, ROLL_STATES, SLICE_MODES, SLICES_DEFAULT, TOP_DEFAULT, TOP_MAX, TOP_MIN, rollElapsed,
} from '../web/shared/legendstats.js';
import { FOCUS_MAX, nextFocus, pairingsPageOf, playerKey, standingsPlaceOf } from '../web/shared/focus.js';
import {
  MIN_MATCHES_DEFAULT, MIN_MATCHES_MAX, SIZE_DEFAULT, SIZE_MAX, SIZE_MIN,
  cleanFocus as cleanMatrixFocus, cleanKey as cleanMatrixKey, cleanMatrix, cleanPick as cleanMatrixPick,
} from '../web/shared/matrix.js';
import { HOLD_DEFAULT, HOLD_MAX, HOLD_MIN, TICKER_PER_MAX, TICKER_SHOWS } from '../web/shared/ticker.js';

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
    handCount: 0, hand: [], holds: '', handUnknown: 0,
    // The profile and match card lines (2026-09-15 starter kit): team and
    // store, the season record, the best finish, and up to three top
    // finishes one per line.
    team: '', store: '', seasonRecord: '', bestFinish: '', finishes: '',
    // The player's own deck (2026-09-18): the paste itself, as the decklist
    // graphic keeps it, and the saved deck it came from. The sideboard fly-in
    // and the side-by-side decklists draw it.
    deckList: '', deckName: '',
    // The trash (2026-09-19, Riftbound's graveyard): every card in it, the
    // oldest first as the pile grew, each resolved like a hand card and
    // carrying its Flow cost when it has one, which the trash graphic
    // lights up. For the odds to draw: drawn is every card seen to leave
    // the main deck this game ({ cardId, cardName, n }), kept as cards
    // reach the hand and the trash (applyDeckSeen) and corrected in the
    // panel; deckLeft is a live feed's own count of each card left in the
    // deck, which the odds take over the list while it is there.
    trash: [], drawn: [], deckLeft: [],
    // The three battlefields the player brought, in the order typed, each
    // marked once it has been played this match. The one in play now is
    // `battlefield` above; making a pool entry the current battlefield marks
    // it played (applySide). The rows overlay lists the pool. A battlefield
    // whose game is decided also carries that game's number and whether this
    // player won it (game, result 'won' or 'lost', 2026-09-19): the rows
    // overlay crowns it or crosses it out. A live feed says so itself; by
    // hand, the game wins say it (recordGame).
    battlefields: [],
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

// One slot of the card row: the same three fields the popup's card carries.
export const ROW_SLOTS = 4;
const emptyRowCard = () => ({ cardId: '', cardName: '', cardType: '' });

function defaultBank() {
  return {
    event: {
      name: '', roundTitle: '',
      // Experimental graphics: rounds left in the Swiss (0 = not shown), a
      // second clock for the slate's "stream resumes in", the feature tables
      // the up-next board lists, the caster desk, and a seeds paste.
      roundsRemaining: 0, countdown: defaultTimer(), tables: [], casters: [], seeds: '',
      // The starter kit (2026-09-15): the hold's day schedule with the
      // current block, a format blurb, chat commands, sponsor names, the
      // next event for the sign-off, the champion the sign-off names, the
      // bracket and the standings.
      schedule: [], scheduleNow: -1, format: '', commands: '', sponsors: '', nextName: '', nextWhen: '', champion: '',
      bracket: { format: 'se8', players: [], results: {} },
      // label: the standings' own line ("Group 2 · after Round 3"), set by the
      // Tournament platform; empty falls back to "after <round title>".
      standings: { rows: [], cut: 8, label: '' },
      // The legend distribution (2026-09-19): one row per legend with how
      // many played it and its record (web/shared/legendstats.js). total is
      // the field size when the rows do not list everyone (0 = what they add
      // up to); label and note are the graphic's sub line and foot line, set
      // by whichever source filled the rows.
      legendStats: { rows: [], total: 0, label: '', note: '' },
      // The round's pairings (2026-09-19, Sam: "a pairing graphic to review
      // all the current matches for the round"): one row a table, each side
      // an up-next table side, with the table's result once it is in. label
      // names the round ("Round 3 · Group 2", set by the Tournament platform);
      // empty falls back to the round title. byes: the players sitting out.
      // src: which TopDeck event, round and group the tables came from, so
      // the platform can bring in fresh results on its own (followPairings);
      // typed tables have none.
      pairings: { rows: [], label: '', byes: [], src: '' },
      // The matchup matrix (2026-09-19): the legends and each pair's record
      // against each other (web/shared/matrix.js). title names the event
      // the numbers are from when it is not this one (a Rift Registry
      // event); label and note are the graphic's sub line and foot line;
      // source credits whose numbers they are ("Rift Registry",
      // "TopDeck.gg"), empty for typed ones.
      matrix: { legends: [], pairs: [], title: '', label: '', note: '', source: '' },
    },
    match: {
      seriesLength: 3,
      // Whose turn it is (chevron by the points on the experimental
      // overlays) and the turn counter; both are cues, so they act on air
      // without a TAKE like the clock does.
      activeSide: '', turn: 0,
      // The showdown: the contested battlefield, who can respond, and the
      // chain of cards played onto it in order. Driven by the chain cue so
      // it never waits for a TAKE; the showdown scene draws it.
      // might is each side's total at the contested battlefield when a live
      // feed knows it (RiftAtlas), null when nobody does.
      showdown: { active: false, battlefield: '', battlefieldCardId: '', priority: '', chain: [], might: { left: null, right: null } },
      // Who chose to go first in game one (the match card prints it) and the
      // result strip's winner with a line about where they go next.
      choseFirst: '', result: { winner: '', note: '' },
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
      // hand claims the bottom of both columns for that player's cards in
      // hand, in the rows overlay's two styles; whatever a column had down
      // there slides out for it and comes back when the hand goes off,
      // except that the card popup's card, docked while the popup is on,
      // takes the bottom right from player 2's hand in turn.
      // handArt puts each card's art beside its name, in either style.
      igodual: {
        visible: false, mode: 'legend', track: true, clock: true, eventBlock: true, cardSlot: true,
        hand: false, handStyle: 'list', handArt: true,
      },
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
      // focus is the card id the plate highlights (lifted and enlarged, the
      // rest blurred and dimmed); empty is no highlight. Driven by the focus
      // cue, so it lands in both banks and acts on air without a TAKE.
      // focusOn switches the highlight off and back on without losing the
      // card, so an operator can flick it while talking (Sam, 2026-09-16).
      decklist: { visible: false, list: '', showSideboard: true, background: true, deckName: '', replay: 0, focus: '', focusOn: true },
      // Card row: up to four cards side by side, each with a name plate. The
      // four slots are positional (an empty slot has no card id) so the panel
      // can edit one without re-sending the rest. focus is the slot index the
      // row enlarges while the others shrink and dim; -1 is an even row. Like
      // the decklist's, it is a cue and lands in both banks.
      // background paints the look's ground behind the row (the TES plate
      // photo by design); off, only the cards paint, for keying over a feed.
      cardrow: { visible: false, cards: [emptyRowCard(), emptyRowCard(), emptyRowCard(), emptyRowCard()], focus: -1, background: true },
      // --- from the September 2026 broadcast scouting (listed with the rest since 0.10.0) ---
      // Portrait pillars: a pillarboxed portrait table cam with a compact
      // game-state bar over it (the Yu-Gi-Oh grammar). handCam opens a
      // second transparent window on the left; cardWell docks the popup's
      // card on the right.
      igoportrait: { visible: false, mode: 'legend', topBar: true, handCam: false, cardWell: true },
      // Rows: slim bars top and bottom and a left column with both cameras
      // and the cards-in-hand list (the Magic grammar). handStyle 'list' or
      // 'lanes', which marks each card's type on its row (neither style sorts
      // the hand); handArt puts each card's art beside its name. cardDock
      // docks the card popup's card in the middle of the column while the
      // popup is on (the hands or the event logo slide out for it) instead
      // of the popup flying in over the feed. showdownView splits the middle
      // of the column between the players while a showdown is open: each
      // side's might and the cards it played (2026-09-19).
      igorows: { visible: false, mode: 'legend', hand: true, handStyle: 'list', handArt: true, showdown: false, activeTurn: true, points: true, turnCounter: true, eventLogo: true, clock: true, cardDock: true, showdownView: true,
        // Battlefields in each player's block: 'off', 'one' (this game's) or
        // 'all' (the three brought, the played ones marked).
        battlefields: 'off' },
      // Arena score bug: the Pokémon wide-shot bug on the 1-to-8 track, for
      // stage and player cameras. Exclusive with the score bug in the panel.
      arenabug: { visible: false, clock: true },
      // Slate: full-frame hold screens. upnext lists event.tables; the
      // others print a message and, when on, the countdown clock.
      slate: { visible: false, mode: 'upnext', text: '', countdown: true, schedule: true, ticker: true, camera: true },
      // Hand fan: one player's hand as real cards fanned along the bottom
      // edge, the other's known cards small at the top. showdown lights the
      // reactions until the real showdown state exists.
      handfan: { visible: false, side: 'left', opponent: true, showdown: false, identity: true, clock: true },
      // Showdown: the chain as cards. strip docks into the camera window of
      // whichever in-game overlay is on; takeover is the full lower band
      // with cameras and both hands.
      showdown: { visible: false, mode: 'strip', hands: true },
      // --- the out-of-game starter kit (2026-09-15) ---
      // Corner tag: "UP NEXT · match · clock" top right, over anything.
      // text and sub: the custom mode's two lines. label: the label box's
      // word ('' = "Up next"), showLabel switches the box off; clock switches
      // the break clock off. dock (2026-09-19, Sam: "anchored for the in game
      // overlays"): with an in-game overlay up, sit in the top right corner
      // of the game area it leaves (web/shared/anchor.js), not the frame's.
      cornertag: { visible: false, mode: 'match', text: '', sub: '', label: '', showLabel: true, clock: true, dock: true },
      // Lower third: the caster pair, an interview name with a credential
      // line, the coming-up bar, or custom: the operator's own text (a line
      // and a second under it). label/showLabel: the coming-up and custom
      // bars' label box ('' = its own word, "Coming up" or "Up next"). dock:
      // with an in-game overlay up, sit along the bottom of its game area.
      lowerthird: { visible: false, mode: 'casters', side: 'left', credential: '', text: '', sub: '', label: '', showLabel: true, dock: true },
      // Match card (the spec's head-to-head): both sides with a centre column.
      headtohead: { visible: false, status: '' },
      // Head to head, VS (2026-09-19): the Sideways Showdown head-to-head,
      // both legend cards tilted either side of a VS, names, round, event.
      vscard: { visible: false },
      // Player profile: one side, legend art backdrop, stat tiles.
      // camera: the transparent window bottom right for the player's feed.
      // decklist: the player's own list (side.deckList) down the left.
      profile: { visible: false, side: 'left', camera: true, decklist: false },
      // Bracket and standings draw event.bracket and event.standings.
      // legends: the legend portrait beside each player and the legend's
      // name to the right (2026-09-19, Sam); off for an event whose legends
      // are not known yet.
      bracket: { visible: false },
      // group: which group's standings are up when the rows carry groups
      // (2026-09-19, Sam: "alternate through the groups more easily"); ''
      // or a group that is not there means the first. focus: the players
      // highlighted (web/shared/focus.js playerKey), newest last: their rows
      // light up and grow a little while the rest dim. A cue like the card
      // row's highlight, so it lands in both banks and acts on air at once.
      standings: { visible: false, page: 1, legends: true, group: '', focus: [] },
      // The legend distribution: a pie of the legends played and a table of
      // their shares, the win rate column switchable (Sam: "make the win rate
      // option able to be toggled"). slices: which legends get a slice of
      // their own (multi: every legend two or more players brought, the
      // default; all; top: the largest `top`); the rest fold into Other.
      // focus: the highlighted slices (legendstats.js sliceKey), newest last.
      // roll: the table's roll when it is longer than its box, { state, at,
      // done } (legendstats.js rollAt); autoRoll starts it as the graphic
      // comes on air, loop sends it back up and round again, speed is slow,
      // normal or fast. The highlight and the roll are cues (the focus and
      // roll actions): they land in both banks and act on air at once.
      legendstats: {
        visible: false, winRate: true, top: TOP_DEFAULT, slices: SLICES_DEFAULT, focus: [],
        roll: { state: 'stop', at: 0, done: 0 }, autoRoll: true, loop: true, speed: ROLL_SPEED_DEFAULT,
      },
      // Pairings draw event.pairings, 32 tables a page in two columns.
      // legends as the standings'; results marks the finished tables with
      // their games and dims the player who lost. focus: the table numbers
      // highlighted, newest last: a highlighted table grows in its column
      // while the rest dim (a cue, like the standings' highlight).
      pairings: { visible: false, page: 1, legends: true, results: true, focus: [] },
      // Ongoing matches (2026-09-19, Sam: "a graphic that shows ongoing
      // matches"): the tables of event.pairings that have not finished,
      // bigger the fewer there are, 32 a page at most.
      ongoing: { visible: false, page: 1, legends: true },
      // Results ticker (2026-09-19, Sam: "an ongoing ticker that fits at the
      // bottom of the screen ... rotate and animate through them all"): the
      // tables of event.pairings along the bottom of the frame, a page at a
      // time, turning every `hold` seconds (web/shared/ticker.js). show: 'all',
      // 'playing' (no result yet) or 'done'; per: tables a page, 0 = as many
      // as the bar fits; legends: each player's legend icon; dock: with an
      // in-game overlay up, run along the bottom of the game area it leaves;
      // title: the label box's word ('' = "Results", "Still playing").
      ticker: { visible: false, show: 'all', per: 0, hold: HOLD_DEFAULT, legends: true, dock: true, title: '' },
      // Result strip: the match winner and where they go next.
      result: { visible: false },
      // Sponsor plate: a 3:1 plate rotating through items every `interval`
      // seconds, docked into whichever in-game overlay is up (position
      // 'auto') or pinned to a corner. every/duration: 0 minutes = up the
      // whole time it is on, otherwise the first `duration` seconds of every
      // `every` minutes. label is an optional tag such as "Presented by".
      // dock: sit in the in-game overlay that is up (position = its own spot
      // or its corner spot); off pins the plate to the frame corner.
      sponsor: { visible: false, items: [], interval: 10, position: 'auto', dock: true, label: '', every: 0, duration: 20 },
      // --- the decks round (2026-09-18) ---
      // Sideboard fly-in: the players' sideboards flying in over the game
      // window of whichever in-game overlay is up, player 1's across the top
      // and player 2's across the bottom ('both'), or one player's alone.
      sideboard: { visible: false, side: 'both' },
      // Sideboard card spotted (2026-09-19, Sam: "a 'sideboard card spotted'
      // for when a sideboard card is added to the hand after turn 1"): the
      // card flies in over the game window, featured and lit, with "Sideboard
      // Card for <player>" under it. spot is the latest card spotted (the
      // spot cue: the RiftAtlas reader, or the panel by hand); the graphic,
      // while it is on air, flies each new one in and out again `hold`
      // seconds after it was spotted.
      sidespot: { visible: false, hold: 8, spot: { id: 0, side: '', cardId: '', cardName: '', player: '', game: 0, turn: 0, at: 0 } },
      // Both players' decklists side by side, full frame.
      decklists: { visible: false, sideboards: true },
      // The game intro: both players' legend, champion and battlefield with
      // the round and the game number, animated into the game window. game
      // 0 counts from the game wins; 1 to 5 pins it.
      matchup: { visible: false, game: 0 },
      // The matchup matrix (2026-09-19, Sam: "a legend matchup matrix
      // scene"): the `size` most played legends across and down, or the ones
      // picked by hand (pick, legend keys), a cell with fewer than
      // minMatches matches left blank, the Overall column and each cell's
      // record switchable. focus: a legend's row, its column, or the cell
      // where they cross; a cue like the other highlights (both banks, on
      // air at once).
      matrix: { visible: false, size: SIZE_DEFAULT, pick: [], minMatches: MIN_MATCHES_DEFAULT, overall: true, records: true, focus: { row: '', col: '' } },
      // --- the odds and trash round (2026-09-19) ---
      // Odds to draw: the cards a player's deck can still give them, the
      // likeliest first (web/shared/odds.js), on their side of the game
      // window, or both players' at once. draws: the next draw or the next
      // few; rows: how many cards it lists before summing the rest; art:
      // each card's art beside its name.
      odds: { visible: false, side: 'left', draws: 1, rows: ROWS_DEFAULT, art: true },
      // Trash: the cards in a player's trash, newest first, the Flow cards
      // (playable from there) lit up and, with flowFirst, listed ahead of
      // the rest (web/shared/trash.js); art as the odds'.
      trash: { visible: false, side: 'left', art: true, flowFirst: true },
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
  // experimental once gated the scouted graphics in the panel (0.6 to 0.9);
  // it stays here as setup data for older saves, and the panel no longer
  // reads it.
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
  bank.match.showdown = { ...fresh.match.showdown, ...(bank.match.showdown || {}) };
  if (!Array.isArray(bank.match.showdown.chain)) bank.match.showdown.chain = [];
  if (!bank.match.showdown.might || typeof bank.match.showdown.might !== 'object') bank.match.showdown.might = { left: null, right: null };
  // Event fields grew with the experimental graphics; older saves carry only
  // the name and round title, and a hand or table list must be an array.
  bank.event = { ...fresh.event, ...bank.event };
  bank.event.countdown = { ...fresh.event.countdown, ...(bank.event.countdown || {}) };
  for (const key of ['tables', 'casters', 'schedule']) {
    if (!Array.isArray(bank.event[key])) bank.event[key] = [];
  }
  bank.event.bracket = { ...fresh.event.bracket, ...(bank.event.bracket || {}) };
  if (!Array.isArray(bank.event.bracket.players)) bank.event.bracket.players = [];
  if (!bank.event.bracket.results || typeof bank.event.bracket.results !== 'object') bank.event.bracket.results = {};
  bank.event.standings = { ...fresh.event.standings, ...(bank.event.standings || {}) };
  if (!Array.isArray(bank.event.standings.rows)) bank.event.standings.rows = [];
  bank.event.legendStats = { ...fresh.event.legendStats, ...(bank.event.legendStats || {}) };
  if (!Array.isArray(bank.event.legendStats.rows)) bank.event.legendStats.rows = [];
  bank.event.pairings = { ...fresh.event.pairings, ...(bank.event.pairings || {}) };
  if (!Array.isArray(bank.event.pairings.rows)) bank.event.pairings.rows = [];
  if (!Array.isArray(bank.event.pairings.byes)) bank.event.pairings.byes = [];
  bank.event.matrix = { ...fresh.event.matrix, ...(bank.event.matrix || {}), ...cleanMatrix(bank.event.matrix) };
  bank.match.result = { ...fresh.match.result, ...(bank.match.result || {}) };
  for (const side of [bank.match.left, bank.match.right]) {
    if (!Array.isArray(side.hand)) side.hand = [];
    if (!Array.isArray(side.battlefields)) side.battlefields = [];
    for (const key of ['trash', 'drawn', 'deckLeft']) if (!Array.isArray(side[key])) side[key] = [];
  }
  for (const key of Object.keys(fresh.scenes)) {
    bank.scenes[key] = { ...fresh.scenes[key], ...bank.scenes[key] };
  }
  // The card row's slots are positional: a save always carries four, each
  // with the full card shape, whatever an older or hand-edited file held.
  const rowCards = Array.isArray(bank.scenes.cardrow.cards) ? bank.scenes.cardrow.cards : [];
  bank.scenes.cardrow.cards = Array.from({ length: ROW_SLOTS }, (_, i) => ({ ...emptyRowCard(), ...(rowCards[i] || {}) }));
  bank.scenes.cardrow.focus = clampInt(bank.scenes.cardrow.focus, -1, ROW_SLOTS - 1);
  if (typeof bank.scenes.decklist.focus !== 'string') bank.scenes.decklist.focus = '';
  if (typeof bank.scenes.decklist.focusOn !== 'boolean') bank.scenes.decklist.focusOn = true;
  if (typeof bank.scenes.cardrow.background !== 'boolean') bank.scenes.cardrow.background = true;
  bank.scenes.sponsor.items = cleanSponsorItems(bank.scenes.sponsor.items);
  bank.scenes.sidespot.spot = cleanSpot(bank.scenes.sidespot.spot);
  bank.scenes.sidespot.hold = clampInt(bank.scenes.sidespot.hold, SPOT_HOLD_MIN, SPOT_HOLD_MAX);
  // The highlights and the legend table's roll (2026-09-19): clean lists and
  // a roll of the right shape, whatever an older or hand-edited save held.
  bank.scenes.standings.focus = cleanPlayerKeys(bank.scenes.standings.focus);
  bank.scenes.pairings.focus = cleanTableKeys(bank.scenes.pairings.focus);
  const ls = bank.scenes.legendstats;
  ls.focus = cleanSliceKeys(ls.focus);
  ls.roll = cleanRoll(ls.roll);
  if (!SLICE_MODES.includes(ls.slices)) ls.slices = SLICES_DEFAULT;
  if (!Object.hasOwn(ROLL_SPEEDS, ls.speed)) ls.speed = ROLL_SPEED_DEFAULT;
  for (const flag of ['autoRoll', 'loop']) if (typeof ls[flag] !== 'boolean') ls[flag] = true;
  const mx = bank.scenes.matrix;
  mx.focus = cleanMatrixFocus(mx.focus);
  mx.pick = cleanMatrixPick(mx.pick);
  mx.size = clampInt(mx.size, SIZE_MIN, SIZE_MAX);
  mx.minMatches = clampInt(mx.minMatches, 1, MIN_MATCHES_MAX);
  for (const flag of ['overall', 'records']) if (typeof mx[flag] !== 'boolean') mx[flag] = true;
  const tk = bank.scenes.ticker;
  if (!TICKER_SHOWS.includes(tk.show)) tk.show = 'all';
  tk.per = clampInt(tk.per, 0, TICKER_PER_MAX);
  tk.hold = clampInt(tk.hold, HOLD_MIN, HOLD_MAX);
  for (const flag of ['legends', 'dock']) if (typeof tk[flag] !== 'boolean') tk[flag] = true;
  if (typeof tk.title !== 'string') tk.title = '';
}

// The highlight lists (web/shared/focus.js): standings players by
// playerKey, pairings tables by number, legend slices by sliceKey; no
// repeats, at most FOCUS_MAX, the newest last.
const lastUnique = (list) => [...new Set(list)].slice(-FOCUS_MAX);
function cleanPlayerKeys(raw) {
  return Array.isArray(raw) ? lastUnique(raw.map((k) => playerKey(cleanStr(k ?? '', 40))).filter(Boolean)) : [];
}
function cleanTableKeys(raw) {
  return Array.isArray(raw) ? lastUnique(raw.map((t) => clampInt(t, 0, 9999)).filter((t) => t > 0)) : [];
}
const SLICE_KEY = /^(?:[a-z0-9-]{1,60}|n:[a-z0-9]{1,60})$/;
function cleanSliceKey(raw) {
  const key = String(raw ?? '').trim().toLowerCase();
  return SLICE_KEY.test(key) ? key : '';
}
function cleanSliceKeys(raw) {
  return Array.isArray(raw) ? lastUnique(raw.map(cleanSliceKey).filter(Boolean)) : [];
}
// The legend table's roll (web/shared/legendstats.js): a playing roll needs
// the moment it started; anything unreadable is stopped at the top.
function cleanRoll(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const at = Math.max(0, Math.trunc(Number(r.at)) || 0);
  const done = Math.max(0, Math.trunc(Number(r.done)) || 0);
  if (!ROLL_STATES.includes(r.state) || r.state === 'stop' || (r.state === 'play' && !at)) return { state: 'stop', at: 0, done: 0 };
  return r.state === 'play' ? { state: 'play', at, done } : { state: r.state, at: 0, done };
}

// A sponsor is a name and, optionally, art uploaded through
// /api/sponsor/image (so the path is always one this server wrote).
const SPONSOR_IMAGE = /^\/theme\/sponsor\/[a-f0-9]{12}\.(png|jpg|webp|svg)$/;
export function cleanSponsorItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, SPONSOR_MAX).map((s) => {
    if (!s || typeof s !== 'object') return null;
    const name = cleanStr(s.name || '', 60);
    const image = typeof s.image === 'string' && SPONSOR_IMAGE.test(s.image) ? s.image : '';
    return name || image ? { name, image } : null;
  }).filter(Boolean);
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
  // A card named without an id keeps an empty id, never the word "undefined".
  const cardId = cleanCardId(raw.cardId || '');
  const cardName = cleanStr(raw.cardName || '', 80);
  if (!cardId && !cardName) return null;
  const domains = Array.isArray(raw.domains) ? raw.domains.filter((d) => DOMAINS.includes(d)).slice(0, 2) : [];
  const energy = raw.energy === '' || raw.energy === null || raw.energy === undefined ? null : clampInt(raw.energy, 0, 20);
  // The hand overlays badge each card by what it can do. A patch may carry
  // it (the panel gets it from the search); otherwise the index says.
  const kind = HAND_KINDS.includes(raw.kind) ? raw.kind : (cardId ? kindOf(cardId) : '');
  return { cardId, cardName, energy, domains, kind, played: Boolean(raw.played) };
}
const HAND_KINDS = ['reaction', 'action', 'unit', 'champion', 'gear', 'spell'];

// A Flow cost ({ energy, power, domain }, carddb parseFlow): domain '' is
// any rune. Nothing to pay reads as no Flow at all.
function cleanFlow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const energy = raw.energy === null || raw.energy === undefined || raw.energy === '' ? null : clampInt(raw.energy, 0, 20);
  const power = clampInt(raw.power ?? 0, 0, 9);
  const domain = DOMAINS.includes(raw.domain) ? raw.domain : '';
  return energy === null && !power ? null : { energy, power, domain };
}

// A card in the trash: a hand card's fields without the played mark, and
// its Flow cost, the patch's own when it carries one (the panel sends back
// what it was given) and otherwise the index's.
function cleanTrashCard(raw) {
  const card = cleanHandCard(raw);
  if (!card) return null;
  const { played, ...rest } = card;
  const flow = raw.flow !== undefined ? cleanFlow(raw.flow) : (card.cardId ? flowOf(card.cardId) : null);
  return { ...rest, flow };
}

// The drawn tally: how many copies of each card have left the deck, one
// entry a card by name (odds.js cardKey), so two printings count as one.
function cleanDrawn(raw) {
  if (!Array.isArray(raw)) return [];
  const out = new Map();
  for (const d of raw) {
    if (!d || typeof d !== 'object') continue;
    const cardId = cleanCardId(d.cardId || '');
    const cardName = cleanStr(d.cardName || '', 80);
    const key = cardKey({ cardId, cardName });
    const n = clampInt(d.n ?? 0, 0, 12);
    if (!key || !n) continue;
    const cur = out.get(key);
    if (cur) cur.n = Math.min(12, cur.n + n);
    else out.set(key, { cardId, cardName, n });
  }
  return [...out.values()].slice(0, 60);
}

// A live feed's deck: each card left in it with how many copies.
function cleanDeckLeft(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 60).map((c) => {
    const card = cleanHandCard(c);
    if (!card) return null;
    const { played, ...rest } = card;
    return { ...rest, left: clampInt(c.left ?? 0, 0, 12) };
  }).filter(Boolean);
}

// The drawn tally follows the hand and the trash (2026-09-19): a copy new
// to the hand was drawn; a copy new to the trash came off the board when a
// copy is out of the deck but in neither list (a unit that died), and off
// the deck itself otherwise (burned); a card moving between the hand and
// the trash in one edit (a discard) was out already. Taking a card off
// either list gives nothing back to the deck: it went to the board or was
// banished, and a copy counted by mistake is put back in the panel.
function applyDeckSeen(side, before) {
  const hand = countBy(side.hand);
  const trash = countBy(side.trash);
  const drawn = new Map(side.drawn.map((d) => [cardKey(d), { ...d }]));
  const cards = new Map();
  for (const c of [...side.hand, ...side.trash]) if (!cards.has(cardKey(c))) cards.set(cardKey(c), c);
  let changed = false;
  for (const [key, card] of cards) {
    let dh = (hand.get(key) || 0) - (before.hand.get(key) || 0);
    let dt = (trash.get(key) || 0) - (before.trash.get(key) || 0);
    if (dh > 0 && dt < 0) { const m = Math.min(dh, -dt); dh -= m; dt += m; }
    if (dt > 0 && dh < 0) { const m = Math.min(dt, -dh); dt -= m; dh += m; }
    if (dh <= 0 && dt <= 0) continue;
    const cur = drawn.get(key) || { cardId: card.cardId, cardName: card.cardName, n: 0 };
    let n = cur.n + Math.max(0, dh);
    if (dt > 0) {
      const away = Math.max(0, n - (hand.get(key) || 0) - ((trash.get(key) || 0) - dt));
      n += Math.max(0, dt - away);
    }
    if (n !== cur.n) {
      drawn.set(key, { ...cur, n: Math.min(12, n) });
      changed = true;
    }
  }
  if (changed) side.drawn = [...drawn.values()].slice(0, 60);
}

// A spell resolving goes to its owner's trash (2026-09-19); a unit, a gear
// or a champion resolves onto the board, which nothing here draws.
const TRASH_KINDS = ['spell', 'reaction', 'action'];
function toTrash(side, card) {
  if (!card || !TRASH_KINDS.includes(card.kind || kindOf(card.cardId))) return;
  const entry = cleanTrashCard({ cardId: card.cardId, cardName: card.cardName, energy: card.energy, domains: card.domains, kind: card.kind });
  if (entry) side.trash = [...side.trash, entry].slice(-TRASH_MAX);
}

// The showdown as a live game feed knows it (RiftAtlas, 2026-09-19): open or
// not, where, who has focus, each side's might there and every card played
// into it in play order, each marked resolved once it has left the chain.
// The operator's own showdown runs on the chain cue instead.
// What was done with each card on a feed's stack (2026-09-19: once focus
// passes, the defender's draws, discards and moves join the plays); empty
// for the chain cue's own entries, which are all plays.
const CHAIN_ACTIONS = ['played', 'drew', 'discarded', 'moved', 'trashed', 'returned', 'banished', 'created', 'milled', 'shuffled'];
function cleanChainEntry(raw) {
  const card = cleanHandCard(raw);
  if (!card || !['left', 'right'].includes(raw.side)) return null;
  const { played, ...rest } = card;
  return { ...rest, side: raw.side, action: CHAIN_ACTIONS.includes(raw.action) ? raw.action : '', resolved: Boolean(raw.resolved) };
}
function applyShowdown(sd, p) {
  if (p.active !== undefined) sd.active = Boolean(p.active);
  if (p.battlefield !== undefined) sd.battlefield = cleanStr(p.battlefield, 40);
  if (p.battlefieldCardId !== undefined) sd.battlefieldCardId = cleanCardId(p.battlefieldCardId);
  if (['', 'left', 'right'].includes(p.priority)) sd.priority = p.priority;
  // The chain cue's own cap: the newest twelve.
  if (Array.isArray(p.chain)) sd.chain = p.chain.map(cleanChainEntry).filter(Boolean).slice(-12);
  if (p.might && typeof p.might === 'object') {
    const might = { ...(sd.might || { left: null, right: null }) };
    for (const s of ['left', 'right']) {
      if (p.might[s] === null) might[s] = null;
      else if (p.might[s] !== undefined) might[s] = clampInt(p.might[s], 0, 999);
    }
    sd.might = might;
  }
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
  return { name, role: cleanStr(raw.role || '', 30), handle: cleanStr(raw.handle || '', 30) };
}

// A row of the day's schedule: a time and what happens then.
function cleanScheduleRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = cleanStr(raw.title || '', 40);
  if (!title) return null;
  return { time: cleanStr(raw.time || '', 12), title };
}

// A standings row: the table side's identity plus the numbers. Points and
// the tiebreaks are kept as numbers so the scene can right-align them.
const num1 = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(Math.min(100, Math.max(0, n)) * 10) / 10 : 0; };
function cleanStandingsRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const side = cleanTableSide(raw);
  if (!side.name) return null;
  return {
    ...side, points: clampInt(raw.points, 0, 999), omw: num1(raw.omw), gw: num1(raw.gw), ogw: num1(raw.ogw),
    group: cleanStr(raw.group ?? '', 20),
  };
}

// Standings in the order the graphic ranks them (2026-09-19, Sam: "sorted
// by points and if no points available, the record. Highest record or
// points first"). Within each group: by points when any of its rows has
// points; otherwise by the record, a win 3 and a draw 1 (W-L-D, the way
// TopDeck writes it), fewer losses first between equal records. Rows that
// tie keep the order they came in: TopDeck's tiebreaks, or the order typed.
// Groups keep the order they first appear in; each shows up to four pages.
const STANDINGS_PER_GROUP = 80;
const STANDINGS_MAX = 320;
const RECORD_RE = /^(\d+)\s*[-\u2013]\s*(\d+)(?:\s*[-\u2013]\s*(\d+))?$/;
function recordRank(record) {
  const m = String(record || '').match(RECORD_RE);
  return m ? { pts: Number(m[1]) * 3 + Number(m[3] || 0), losses: Number(m[2]) } : { pts: -1, losses: 0 };
}
function sortStandings(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.group)) groups.set(r.group, []);
    groups.get(r.group).push(r);
  }
  const out = [];
  for (const list of groups.values()) {
    const byPoints = list.some((r) => r.points > 0);
    const keyed = list.map((r, i) => ({ r, i, k: byPoints ? { pts: r.points, losses: 0 } : recordRank(r.record) }));
    keyed.sort((a, b) => b.k.pts - a.k.pts || a.k.losses - b.k.losses || a.i - b.i);
    out.push(...keyed.slice(0, STANDINGS_PER_GROUP).map((x) => x.r));
  }
  return out.slice(0, STANDINGS_MAX);
}

// A legend distribution row: the legend (resolved like a table side's), how
// many players brought it or, for a list that only has percentages, its
// share, and its record or typed win rate where known. A row with neither a
// count nor a share has nothing to draw, so it drops.
const pctOrNull = (v) => (v === null || v === undefined || v === '' ? null : num1(v));
function cleanLegendRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const legend = cleanStr(raw.legend || '', 60);
  const slug = cleanStr(raw.legendSlug || '', 60);
  const legendSlug = /^[a-z0-9-]*$/.test(slug) ? slug : '';
  if (!legend && !legendSlug) return null;
  const players = clampInt(raw.players, 0, 99999);
  const share = pctOrNull(raw.share) || null;
  if (!players && !share) return null;
  return {
    legend, legendSlug, legendCardId: cleanCardId(raw.legendCardId || ''), players, share,
    wins: clampInt(raw.wins, 0, 99999), losses: clampInt(raw.losses, 0, 99999), winRate: pctOrNull(raw.winRate),
  };
}

// A pairing: the table number, both players as up-next table sides, and the
// table's state. status is '' (unknown), 'pending', 'live' or 'done'; score
// is the games each side won, left first; winner is the side that took the
// match, or 'draw'. A row needs at least one name. 160 tables is five pages
// of 32: a 320-player round (Convergence #3 seats 265 in its four groups).
const PAIRINGS_MAX = 160;
const PAIRINGS_PAGES = 5;
function cleanPairing(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const left = cleanTableSide(raw.left);
  const right = cleanTableSide(raw.right);
  if (!left.name && !right.name) return null;
  const score = Array.isArray(raw.score) ? raw.score : [];
  return {
    table: clampInt(raw.table, 0, 9999),
    left, right,
    status: ['pending', 'live', 'done'].includes(raw.status) ? raw.status : '',
    score: [clampInt(score[0] ?? 0, 0, 9), clampInt(score[1] ?? 0, 0, 9)],
    winner: ['left', 'right', 'draw'].includes(raw.winner) ? raw.winner : '',
  };
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
  if (patch.handUnknown !== undefined) side.handUnknown = clampInt(patch.handUnknown, 0, 20);
  // Cards reaching the hand or the trash have left the deck (the drawn
  // tally, applyDeckSeen), unless the patch brings the tally itself (a
  // live feed, Swap sides, a new game, the panel's deck tracker).
  const seenBefore = (Array.isArray(patch.hand) || Array.isArray(patch.trash)) && !Array.isArray(patch.drawn)
    ? { hand: countBy(side.hand), trash: countBy(side.trash) } : null;
  // Up to 20 listed cards, the most the hand count itself takes.
  if (Array.isArray(patch.hand)) side.hand = patch.hand.map(cleanHandCard).filter(Boolean).slice(0, 20);
  // The trash keeps its newest 60: more than a deck holds.
  if (Array.isArray(patch.trash)) side.trash = patch.trash.map(cleanTrashCard).filter(Boolean).slice(-TRASH_MAX);
  if (Array.isArray(patch.drawn)) side.drawn = cleanDrawn(patch.drawn);
  if (Array.isArray(patch.deckLeft)) side.deckLeft = cleanDeckLeft(patch.deckLeft);
  if (seenBefore) applyDeckSeen(side, seenBefore);
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
  if (patch.team !== undefined) side.team = cleanStr(patch.team, 40);
  if (patch.store !== undefined) side.store = cleanStr(patch.store, 40);
  if (patch.seasonRecord !== undefined) side.seasonRecord = cleanStr(patch.seasonRecord, 12);
  if (patch.bestFinish !== undefined) side.bestFinish = cleanStr(patch.bestFinish, 60);
  if (patch.finishes !== undefined) side.finishes = cleanMultiline(patch.finishes, 300);
  // Card ids become art URLs: same shape guard as any other card id.
  if (patch.legendCardId !== undefined) side.legendCardId = cleanCardId(patch.legendCardId);
  if (patch.legendCardId2 !== undefined) side.legendCardId2 = cleanCardId(patch.legendCardId2);
  if (patch.battlefieldCardId !== undefined) side.battlefieldCardId = cleanCardId(patch.battlefieldCardId);
  if (patch.card && typeof patch.card === 'object') applyCard(side.card, patch.card);
  if (patch.score !== undefined) side.score = clampInt(patch.score, 0, 8);
  if (patch.gameWins !== undefined) side.gameWins = clampInt(patch.gameWins, 0, 3);
  if (patch.deckList !== undefined) side.deckList = cleanMultiline(patch.deckList, 6000);
  if (patch.deckName !== undefined) side.deckName = cleanStr(patch.deckName, 60);
  if (Array.isArray(patch.battlefields)) side.battlefields = patch.battlefields.map(cleanPoolEntry).filter(Boolean).slice(0, 3);
  // The battlefield going into play is one of the pool: it has now been
  // played. Only when the current battlefield itself changes, so a patch
  // that clears the played marks (Reset match) is not undone here.
  if (patch.battlefield !== undefined && side.battlefield) {
    const key = side.battlefield.toLowerCase();
    for (const entry of side.battlefields) if (entry.name.toLowerCase() === key) entry.played = true;
  }
}

// One battlefield a player brought: its name, the card id its art resolves
// against, whether it has been played this match, and once its game is
// decided, that game's number and whether this player won it. A result
// means it was played.
function cleanPoolEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = cleanStr(raw.name || '', 40);
  if (!name) return null;
  const result = ['won', 'lost'].includes(raw.result) ? raw.result : '';
  const game = result ? clampInt(raw.game ?? 0, 0, 5) : 0;
  return { name, cardId: cleanCardId(raw.cardId || ''), played: Boolean(raw.played) || Boolean(result), game, result };
}

// A game decided by hand (2026-09-19): one side's game wins going up by one
// settles game n, n being the games the two have won between them, so each
// side's battlefield in play gets it, 'won' on the side that went up and
// 'lost' on the other (the rows overlay's crown and red X). Going back down
// by one takes that game's marks off again. Only a patch that sets game wins
// does this, and a side whose patch brings its battlefields itself (a live
// feed, Swap sides, Reset match) keeps what it brought.
function recordGame(bank, before, pm) {
  const m = bank.match;
  const set = (key) => Boolean(pm[key] && typeof pm[key] === 'object' && pm[key].gameWins !== undefined);
  const dl = m.left.gameWins - before.left;
  const dr = m.right.gameWins - before.right;
  let winner = '';
  if (dl === 1 && dr === 0 && set('left')) winner = 'left';
  else if (dr === 1 && dl === 0 && set('right')) winner = 'right';
  let game = 0;
  if (winner) game = m.left.gameWins + m.right.gameWins;
  else if ((dl === -1 && dr === 0 && set('left')) || (dr === -1 && dl === 0 && set('right'))) game = before.left + before.right;
  if (game < 1 || game > 5) return;
  for (const key of ['left', 'right']) {
    if (pm[key] && Array.isArray(pm[key].battlefields)) continue;
    const side = m[key];
    // One battlefield a game for each player: the game's marks come off the rest.
    for (const e of side.battlefields) if (e.game === game) { e.game = 0; e.result = ''; }
    if (!winner) continue;
    const now = String(side.battlefield || '').toLowerCase();
    const entry = now ? side.battlefields.find((e) => e.name.toLowerCase() === now) : null;
    if (entry) Object.assign(entry, { played: true, game, result: key === winner ? 'won' : 'lost' });
  }
}

// The latest card spotted (scenes.sidespot.spot): which side, the card, the
// name printed under it, the game and turn it turned up in, when it was
// spotted (ms; 0 once its time on screen is over) and a serial, so the same
// card spotted twice flies in twice.
const SPOT_HOLD_MIN = 3;
const SPOT_HOLD_MAX = 30;
function cleanSpot(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    id: clampInt(r.id ?? 0, 0, Number.MAX_SAFE_INTEGER),
    side: ['left', 'right'].includes(r.side) ? r.side : '',
    cardId: cleanCardId(r.cardId ?? ''),
    cardName: cleanStr(r.cardName ?? '', 80),
    player: cleanStr(r.player ?? '', 40),
    game: clampInt(r.game ?? 0, 0, 5),
    turn: clampInt(r.turn ?? 0, 0, 99),
    at: Math.max(0, Math.trunc(Number(r.at)) || 0),
  };
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
    if (Array.isArray(patch.event.schedule)) bank.event.schedule = patch.event.schedule.slice(0, 8).map(cleanScheduleRow).filter(Boolean);
    if (patch.event.scheduleNow !== undefined) bank.event.scheduleNow = clampInt(patch.event.scheduleNow, -1, 7);
    if (patch.event.format !== undefined) bank.event.format = cleanMultiline(patch.event.format, 400);
    if (patch.event.commands !== undefined) bank.event.commands = cleanStr(patch.event.commands, 120);
    if (patch.event.sponsors !== undefined) bank.event.sponsors = cleanStr(patch.event.sponsors, 200);
    if (patch.event.nextName !== undefined) bank.event.nextName = cleanStr(patch.event.nextName, 80);
    if (patch.event.nextWhen !== undefined) bank.event.nextWhen = cleanStr(patch.event.nextWhen, 80);
    if (['', 'left', 'right'].includes(patch.event.champion)) bank.event.champion = patch.event.champion;
    if (patch.event.bracket && typeof patch.event.bracket === 'object') {
      const b = patch.event.bracket;
      const cur = bank.event.bracket;
      if (BRACKET_FORMAT_KEYS.includes(b.format)) cur.format = b.format;
      if (Array.isArray(b.players)) cur.players = b.players.slice(0, 16).map(cleanTableSide);
      // Results are re-cleaned against the format even when only the format
      // changed, so a switch from 16 to 8 drops the matches that no longer exist.
      if (b.results && typeof b.results === 'object') cur.results = cleanBracketResults(b.results, cur.format);
      else if (b.format) cur.results = cleanBracketResults(cur.results, cur.format);
    }
    if (patch.event.standings && typeof patch.event.standings === 'object') {
      const st = patch.event.standings;
      if (Array.isArray(st.rows)) bank.event.standings.rows = sortStandings(st.rows.slice(0, 2 * STANDINGS_MAX).map(cleanStandingsRow).filter(Boolean));
      if (st.cut !== undefined && [0, 4, 8, 16, 32].includes(Number(st.cut))) bank.event.standings.cut = Number(st.cut);
      // New rows without a label (the Studio's hand-typed editor) drop the
      // last one, so "Group 2" never sits over rows typed for something else.
      if (st.label !== undefined) bank.event.standings.label = cleanStr(st.label, 60);
      else if (Array.isArray(st.rows)) bank.event.standings.label = '';
    }
    if (patch.event.legendStats && typeof patch.event.legendStats === 'object') {
      const ls = patch.event.legendStats;
      const cur = bank.event.legendStats;
      if (Array.isArray(ls.rows)) cur.rows = ls.rows.slice(0, 64).map(cleanLegendRow).filter(Boolean);
      if (ls.total !== undefined) cur.total = clampInt(ls.total, 0, 99999);
      if (ls.label !== undefined) cur.label = cleanStr(ls.label, 60);
      if (ls.note !== undefined) cur.note = cleanStr(ls.note, 160);
    }
    if (patch.event.pairings && typeof patch.event.pairings === 'object') {
      const pr = patch.event.pairings;
      if (Array.isArray(pr.rows)) bank.event.pairings.rows = pr.rows.slice(0, PAIRINGS_MAX).map(cleanPairing).filter(Boolean);
      // The standings' rule: new rows without a label (typed in the Studio)
      // drop the last one, and the byes that came with it.
      if (pr.label !== undefined) bank.event.pairings.label = cleanStr(pr.label, 60);
      else if (Array.isArray(pr.rows)) bank.event.pairings.label = '';
      if (Array.isArray(pr.byes)) bank.event.pairings.byes = pr.byes.slice(0, 16).map((b) => cleanStr(b ?? '', 40)).filter(Boolean);
      else if (Array.isArray(pr.rows)) bank.event.pairings.byes = [];
      if (pr.src !== undefined) bank.event.pairings.src = cleanStr(pr.src ?? '', 120);
      else if (Array.isArray(pr.rows)) bank.event.pairings.src = '';
    }
    if (patch.event.matrix && typeof patch.event.matrix === 'object') {
      const mx = patch.event.matrix;
      const cur = bank.event.matrix;
      // Legends and pairs travel together (a pair points into the legends
      // it came with). New legends without a source are typed ones: the
      // credit goes, and so do the label and the note when they came
      // with a loaded lot (they describe its numbers, not these); a label
      // typed for typed matchups stays. Without a title, the other event's
      // name goes too.
      if (Array.isArray(mx.legends)) {
        const loaded = Boolean(cur.source);
        Object.assign(cur, cleanMatrix({ legends: mx.legends, pairs: Array.isArray(mx.pairs) ? mx.pairs : [] }));
        if (mx.title === undefined) cur.title = '';
        if (mx.source === undefined) {
          cur.source = '';
          if (loaded) { cur.label = ''; cur.note = ''; }
        }
      }
      if (mx.title !== undefined) cur.title = cleanStr(mx.title ?? '', 80);
      if (mx.label !== undefined) cur.label = cleanStr(mx.label ?? '', 60);
      if (mx.note !== undefined) cur.note = cleanStr(mx.note ?? '', 200);
      if (mx.source !== undefined) cur.source = cleanStr(mx.source ?? '', 60);
    }
  }

  const winsBefore = { left: bank.match.left.gameWins, right: bank.match.right.gameWins };
  if (patch.match && typeof patch.match === 'object') {
    if (patch.match.seriesLength !== undefined) {
      const sl = Number(patch.match.seriesLength);
      if ([1, 3, 5].includes(sl)) bank.match.seriesLength = sl;
    }
    if (['', 'left', 'right'].includes(patch.match.activeSide)) bank.match.activeSide = patch.match.activeSide;
    if (patch.match.turn !== undefined) bank.match.turn = clampInt(patch.match.turn, 0, 99);
    if (['', 'left', 'right'].includes(patch.match.choseFirst)) bank.match.choseFirst = patch.match.choseFirst;
    if (patch.match.result && typeof patch.match.result === 'object') {
      const r = patch.match.result;
      if (['', 'left', 'right'].includes(r.winner)) bank.match.result.winner = r.winner;
      if (r.note !== undefined) bank.match.result.note = cleanStr(r.note, 120);
    }
    if (patch.match.left && typeof patch.match.left === 'object') applySide(bank.match.left, patch.match.left);
    if (patch.match.right && typeof patch.match.right === 'object') applySide(bank.match.right, patch.match.right);
    if (patch.match.showdown && typeof patch.match.showdown === 'object') applyShowdown(bank.match.showdown, patch.match.showdown);
  }

  // Game wins can never exceed what the current series length allows.
  const cap = winsNeeded(bank.match.seriesLength);
  bank.match.left.gameWins = Math.min(bank.match.left.gameWins, cap);
  bank.match.right.gameWins = Math.min(bank.match.right.gameWins, cap);
  if (patch.match && typeof patch.match === 'object') recordGame(bank, winsBefore, patch.match);

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
      // The highlight is a cue (the focus action) and lands in both banks;
      // a bank patch may still clear or set it, for the panel's reset paths.
      if (d.focus !== undefined) bank.scenes.decklist.focus = cleanCardId(d.focus);
      if (d.focusOn !== undefined) bank.scenes.decklist.focusOn = Boolean(d.focusOn);
    }
    if (patch.scenes.cardrow && typeof patch.scenes.cardrow === 'object') {
      const r = patch.scenes.cardrow;
      const row = bank.scenes.cardrow;
      if (r.visible !== undefined) row.visible = Boolean(r.visible);
      // Slots patch by position: an array with holes or fewer entries leaves
      // the other slots as they are, and null empties a slot.
      if (Array.isArray(r.cards)) {
        r.cards.slice(0, ROW_SLOTS).forEach((c, i) => {
          if (c === null) row.cards[i] = emptyRowCard();
          else if (c && typeof c === 'object') applyCard(row.cards[i], c);
        });
        for (const c of row.cards) if (!c.cardId) Object.assign(c, emptyRowCard());
      }
      if (r.focus !== undefined) row.focus = clampInt(r.focus, -1, ROW_SLOTS - 1);
      if (r.background !== undefined) row.background = Boolean(r.background);
      // A row with no card can never be on, the popup's rule.
      if (!row.cards.some((c) => c.cardId)) row.visible = false;
    }
    if (patch.scenes.pov && typeof patch.scenes.pov === 'object') {
      const p = patch.scenes.pov;
      if (p.visible !== undefined) bank.scenes.pov.visible = Boolean(p.visible);
      if (p.showLeft !== undefined) bank.scenes.pov.showLeft = Boolean(p.showLeft);
      if (p.showRight !== undefined) bank.scenes.pov.showRight = Boolean(p.showRight);
    }
    const IGO_FLAGS = {
      igodual: ['track', 'clock', 'eventBlock', 'cardSlot', 'hand', 'handArt'],
      igoportrait: ['topBar', 'handCam', 'cardWell'],
      igorows: ['hand', 'handArt', 'activeTurn', 'points', 'turnCounter', 'eventLogo', 'clock', 'cardDock', 'showdownView'],
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
    // Both hand-list overlays take the same two hand styles.
    for (const key of ['igorows', 'igodual']) {
      const h = patch.scenes[key];
      if (h && typeof h === 'object' && ['list', 'lanes'].includes(h.handStyle)) {
        bank.scenes[key].handStyle = h.handStyle;
      }
    }
    if (patch.scenes.igorows && typeof patch.scenes.igorows === 'object') {
      const r = patch.scenes.igorows;
      if (r.showdown !== undefined) bank.scenes.igorows.showdown = Boolean(r.showdown);
      if (['off', 'one', 'all'].includes(r.battlefields)) bank.scenes.igorows.battlefields = r.battlefields;
    }
    if (patch.scenes.handfan && typeof patch.scenes.handfan === 'object') {
      const h = patch.scenes.handfan;
      if (h.visible !== undefined) bank.scenes.handfan.visible = Boolean(h.visible);
      if (['left', 'right'].includes(h.side)) bank.scenes.handfan.side = h.side;
      if (h.opponent !== undefined) bank.scenes.handfan.opponent = Boolean(h.opponent);
      if (h.showdown !== undefined) bank.scenes.handfan.showdown = Boolean(h.showdown);
      if (h.identity !== undefined) bank.scenes.handfan.identity = Boolean(h.identity);
      if (h.clock !== undefined) bank.scenes.handfan.clock = Boolean(h.clock);
    }
    if (patch.scenes.showdown && typeof patch.scenes.showdown === 'object') {
      const d = patch.scenes.showdown;
      if (d.visible !== undefined) bank.scenes.showdown.visible = Boolean(d.visible);
      if (['strip', 'takeover'].includes(d.mode)) bank.scenes.showdown.mode = d.mode;
      if (d.hands !== undefined) bank.scenes.showdown.hands = Boolean(d.hands);
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
      for (const flag of ['schedule', 'ticker', 'camera']) {
        if (s[flag] !== undefined) bank.scenes.slate[flag] = Boolean(s[flag]);
      }
    }
    // --- the starter kit scenes ---
    if (patch.scenes.cornertag && typeof patch.scenes.cornertag === 'object') {
      const c = patch.scenes.cornertag;
      if (c.visible !== undefined) bank.scenes.cornertag.visible = Boolean(c.visible);
      if (['match', 'round', 'custom'].includes(c.mode)) bank.scenes.cornertag.mode = c.mode;
      if (c.text !== undefined) bank.scenes.cornertag.text = cleanStr(c.text, 60);
      if (c.sub !== undefined) bank.scenes.cornertag.sub = cleanStr(c.sub, 60);
      if (c.label !== undefined) bank.scenes.cornertag.label = cleanStr(c.label, 24);
      for (const flag of ['showLabel', 'clock', 'dock']) {
        if (c[flag] !== undefined) bank.scenes.cornertag[flag] = Boolean(c[flag]);
      }
    }
    if (patch.scenes.lowerthird && typeof patch.scenes.lowerthird === 'object') {
      const l = patch.scenes.lowerthird;
      if (l.visible !== undefined) bank.scenes.lowerthird.visible = Boolean(l.visible);
      if (['casters', 'interview', 'coming', 'custom'].includes(l.mode)) bank.scenes.lowerthird.mode = l.mode;
      if (['left', 'right'].includes(l.side)) bank.scenes.lowerthird.side = l.side;
      if (l.credential !== undefined) bank.scenes.lowerthird.credential = cleanStr(l.credential, 120);
      if (l.text !== undefined) bank.scenes.lowerthird.text = cleanStr(l.text, 60);
      if (l.sub !== undefined) bank.scenes.lowerthird.sub = cleanStr(l.sub, 120);
      if (l.label !== undefined) bank.scenes.lowerthird.label = cleanStr(l.label, 24);
      for (const flag of ['showLabel', 'dock']) {
        if (l[flag] !== undefined) bank.scenes.lowerthird[flag] = Boolean(l[flag]);
      }
    }
    if (patch.scenes.headtohead && typeof patch.scenes.headtohead === 'object') {
      const h = patch.scenes.headtohead;
      if (h.visible !== undefined) bank.scenes.headtohead.visible = Boolean(h.visible);
      if (h.status !== undefined) bank.scenes.headtohead.status = cleanStr(h.status, 80);
    }
    if (patch.scenes.profile && typeof patch.scenes.profile === 'object') {
      const p = patch.scenes.profile;
      if (p.visible !== undefined) bank.scenes.profile.visible = Boolean(p.visible);
      if (['left', 'right'].includes(p.side)) bank.scenes.profile.side = p.side;
      if (p.camera !== undefined) bank.scenes.profile.camera = Boolean(p.camera);
      if (p.decklist !== undefined) bank.scenes.profile.decklist = Boolean(p.decklist);
    }
    for (const key of ['bracket', 'result', 'vscard']) {
      if (patch.scenes[key] && typeof patch.scenes[key] === 'object' && patch.scenes[key].visible !== undefined) {
        bank.scenes[key].visible = Boolean(patch.scenes[key].visible);
      }
    }
    if (patch.scenes.standings && typeof patch.scenes.standings === 'object') {
      const st = patch.scenes.standings;
      if (st.visible !== undefined) bank.scenes.standings.visible = Boolean(st.visible);
      if (st.page !== undefined) bank.scenes.standings.page = clampInt(st.page, 1, 4);
      if (st.legends !== undefined) bank.scenes.standings.legends = Boolean(st.legends);
      if (st.group !== undefined) bank.scenes.standings.group = cleanStr(st.group ?? '', 20);
      if (st.focus !== undefined) bank.scenes.standings.focus = cleanPlayerKeys(st.focus);
    }
    if (patch.scenes.pairings && typeof patch.scenes.pairings === 'object') {
      const pr = patch.scenes.pairings;
      if (pr.visible !== undefined) bank.scenes.pairings.visible = Boolean(pr.visible);
      if (pr.page !== undefined) bank.scenes.pairings.page = clampInt(pr.page, 1, PAIRINGS_PAGES);
      if (pr.legends !== undefined) bank.scenes.pairings.legends = Boolean(pr.legends);
      if (pr.results !== undefined) bank.scenes.pairings.results = Boolean(pr.results);
      if (pr.focus !== undefined) bank.scenes.pairings.focus = cleanTableKeys(pr.focus);
    }
    if (patch.scenes.ongoing && typeof patch.scenes.ongoing === 'object') {
      const og = patch.scenes.ongoing;
      if (og.visible !== undefined) bank.scenes.ongoing.visible = Boolean(og.visible);
      if (og.page !== undefined) bank.scenes.ongoing.page = clampInt(og.page, 1, PAIRINGS_PAGES);
      if (og.legends !== undefined) bank.scenes.ongoing.legends = Boolean(og.legends);
    }
    if (patch.scenes.ticker && typeof patch.scenes.ticker === 'object') {
      const tk = patch.scenes.ticker;
      if (tk.visible !== undefined) bank.scenes.ticker.visible = Boolean(tk.visible);
      if (TICKER_SHOWS.includes(tk.show)) bank.scenes.ticker.show = tk.show;
      if (tk.per !== undefined) bank.scenes.ticker.per = clampInt(tk.per, 0, TICKER_PER_MAX);
      if (tk.hold !== undefined) bank.scenes.ticker.hold = clampInt(tk.hold, HOLD_MIN, HOLD_MAX);
      for (const flag of ['legends', 'dock']) {
        if (tk[flag] !== undefined) bank.scenes.ticker[flag] = Boolean(tk[flag]);
      }
      if (tk.title !== undefined) bank.scenes.ticker.title = cleanStr(tk.title ?? '', 24);
    }
    if (patch.scenes.legendstats && typeof patch.scenes.legendstats === 'object') {
      const ls = patch.scenes.legendstats;
      if (ls.visible !== undefined) bank.scenes.legendstats.visible = Boolean(ls.visible);
      if (ls.winRate !== undefined) bank.scenes.legendstats.winRate = Boolean(ls.winRate);
      if (ls.top !== undefined) bank.scenes.legendstats.top = clampInt(ls.top, TOP_MIN, TOP_MAX);
      if (ls.slices !== undefined && SLICE_MODES.includes(ls.slices)) bank.scenes.legendstats.slices = ls.slices;
      // The highlight travels with the bank on TAKE; the panel changes it
      // with the focus cue, and the roll with the roll cue.
      if (ls.focus !== undefined) bank.scenes.legendstats.focus = cleanSliceKeys(ls.focus);
    }
    if (patch.scenes.sponsor && typeof patch.scenes.sponsor === 'object') {
      const sp = patch.scenes.sponsor;
      const cfg = bank.scenes.sponsor;
      if (sp.visible !== undefined) cfg.visible = Boolean(sp.visible);
      if (sp.items !== undefined) cfg.items = cleanSponsorItems(sp.items);
      if (sp.interval !== undefined) cfg.interval = clampInt(sp.interval, 3, 120);
      if (SPONSOR_POSITIONS.includes(sp.position)) cfg.position = sp.position;
      if (sp.dock !== undefined) cfg.dock = Boolean(sp.dock);
      if (sp.label !== undefined) cfg.label = cleanStr(sp.label, 30);
      if (sp.every !== undefined) cfg.every = clampInt(sp.every, 0, 60);
      if (sp.duration !== undefined) cfg.duration = clampInt(sp.duration, 5, 300);
      // A plate with no sponsor has nothing to show, so it can never be on.
      if (!cfg.items.length) cfg.visible = false;
    }
    // --- the decks round ---
    if (patch.scenes.sideboard && typeof patch.scenes.sideboard === 'object') {
      const sb = patch.scenes.sideboard;
      if (sb.visible !== undefined) bank.scenes.sideboard.visible = Boolean(sb.visible);
      if (['both', 'left', 'right'].includes(sb.side)) bank.scenes.sideboard.side = sb.side;
    }
    if (patch.scenes.decklists && typeof patch.scenes.decklists === 'object') {
      const dl = patch.scenes.decklists;
      if (dl.visible !== undefined) bank.scenes.decklists.visible = Boolean(dl.visible);
      if (dl.sideboards !== undefined) bank.scenes.decklists.sideboards = Boolean(dl.sideboards);
    }
    if (patch.scenes.matchup && typeof patch.scenes.matchup === 'object') {
      const mu = patch.scenes.matchup;
      if (mu.visible !== undefined) bank.scenes.matchup.visible = Boolean(mu.visible);
      if (mu.game !== undefined) bank.scenes.matchup.game = clampInt(mu.game, 0, 5);
    }
    if (patch.scenes.matrix && typeof patch.scenes.matrix === 'object') {
      const m = patch.scenes.matrix;
      const sc = bank.scenes.matrix;
      if (m.visible !== undefined) sc.visible = Boolean(m.visible);
      if (m.size !== undefined) sc.size = clampInt(m.size, SIZE_MIN, SIZE_MAX);
      if (m.minMatches !== undefined) sc.minMatches = clampInt(m.minMatches, 1, MIN_MATCHES_MAX);
      if (m.overall !== undefined) sc.overall = Boolean(m.overall);
      if (m.records !== undefined) sc.records = Boolean(m.records);
      if (m.pick !== undefined) sc.pick = cleanMatrixPick(m.pick);
      // The highlight travels with the bank on TAKE; the panel changes it
      // with the focus cue.
      if (m.focus !== undefined) sc.focus = cleanMatrixFocus(m.focus);
    }
    // --- the odds and trash round ---
    if (patch.scenes.odds && typeof patch.scenes.odds === 'object') {
      const o = patch.scenes.odds;
      const cfg = bank.scenes.odds;
      if (o.visible !== undefined) cfg.visible = Boolean(o.visible);
      if (['left', 'right', 'both'].includes(o.side)) cfg.side = o.side;
      if (o.draws !== undefined) cfg.draws = clampInt(o.draws, 1, DRAWS_MAX);
      if (ROWS_CHOICES.includes(Number(o.rows))) cfg.rows = Number(o.rows);
      if (o.art !== undefined) cfg.art = Boolean(o.art);
    }
    if (patch.scenes.trash && typeof patch.scenes.trash === 'object') {
      const t = patch.scenes.trash;
      const cfg = bank.scenes.trash;
      if (t.visible !== undefined) cfg.visible = Boolean(t.visible);
      if (['left', 'right', 'both'].includes(t.side)) cfg.side = t.side;
      if (t.art !== undefined) cfg.art = Boolean(t.art);
      if (t.flowFirst !== undefined) cfg.flowFirst = Boolean(t.flowFirst);
    }
    if (patch.scenes.sidespot && typeof patch.scenes.sidespot === 'object') {
      const ss = patch.scenes.sidespot;
      if (ss.visible !== undefined) bank.scenes.sidespot.visible = Boolean(ss.visible);
      if (ss.hold !== undefined) bank.scenes.sidespot.hold = clampInt(ss.hold, SPOT_HOLD_MIN, SPOT_HOLD_MAX);
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
// --- the between-games highlights and the legend table's roll (2026-09-19) ---

// A highlight on the standings, the pairings or the legend distribution (the
// focus cue). A player or a table newly highlighted turns its graphic to
// the page it is on, so featuring a player is one press even from page 3.
function focusSheet(bank, patch, now) {
  const how = { on: patch.on === undefined ? undefined : Boolean(patch.on), only: Boolean(patch.only), clear: Boolean(patch.clear) };
  if (patch.scene === 'standings') {
    const sc = bank.scenes.standings;
    const key = playerKey(cleanStr(patch.player ?? '', 40));
    const had = sc.focus.includes(key);
    sc.focus = nextFocus(sc.focus, key, how);
    const at = key && !had && sc.focus.includes(key) ? standingsPlaceOf(bank.event.standings, key) : null;
    if (at) Object.assign(sc, at);
  } else if (patch.scene === 'pairings') {
    const sc = bank.scenes.pairings;
    const table = clampInt(patch.table ?? 0, 0, 9999);
    const had = sc.focus.includes(table);
    sc.focus = nextFocus(sc.focus, table, how);
    const page = table && !had && sc.focus.includes(table) ? pairingsPageOf(bank.event.pairings.rows, table) : null;
    if (page) sc.page = Math.min(PAIRINGS_PAGES, page);
  } else {
    const ls = bank.scenes.legendstats;
    ls.focus = nextFocus(ls.focus, cleanSliceKey(patch.legend), how);
    holdRoll(ls, now);
  }
}

// A highlight holds the legend table's roll where it is (the table brings
// the highlighted row into view instead), and clearing the last highlight
// lets it roll on from there.
function holdRoll(ls, now) {
  if (ls.focus.length && ls.roll.state === 'play') ls.roll = { state: 'hold', at: 0, done: rollElapsed(ls.roll, now) };
  else if (!ls.focus.length && ls.roll.state === 'hold') ls.roll = { state: 'play', at: now, done: ls.roll.done };
}

// The roll cue on one bank: its settings, then start (from the top when
// stopped, else from where it stands), pause, stop (back to the top) or
// restart (from the top at once).
function applyRoll(ls, patch, now) {
  if (patch.speed !== undefined && Object.hasOwn(ROLL_SPEEDS, patch.speed)) ls.speed = patch.speed;
  if (patch.loop !== undefined) ls.loop = Boolean(patch.loop);
  if (patch.autoRoll !== undefined) ls.autoRoll = Boolean(patch.autoRoll);
  const r = ls.roll;
  if (patch.op === 'start' && r.state !== 'play') ls.roll = { state: 'play', at: now, done: r.state === 'stop' ? 0 : r.done };
  else if (patch.op === 'pause' && (r.state === 'play' || r.state === 'hold')) ls.roll = { state: 'pause', at: 0, done: rollElapsed(r, now) };
  else if (patch.op === 'stop') ls.roll = { state: 'stop', at: 0, done: 0 };
  else if (patch.op === 'restart') ls.roll = { state: 'play', at: now, done: 0 };
}

// What starts the legend table's roll over: the graphic coming on air, or
// new numbers airing while it is up.
function rollInputs(bank) {
  const ls = bank.scenes.legendstats;
  const st = bank.event.legendStats;
  return { on: Boolean(ls.visible), key: JSON.stringify([st.rows, st.total, ls.slices, ls.top]) };
}
function rollFromTop(ls, now) {
  if (ls.autoRoll === false) ls.roll = { state: 'stop', at: 0, done: 0 };
  else ls.roll = ls.focus.length ? { state: 'hold', at: 0, done: 0 } : { state: 'play', at: now, done: 0 };
}

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

// A bank built from the defaults through the same whitelist every edit
// passes. server/sample.js builds the look builder's sample match with it,
// so the sample always carries the current shape and only values the store
// itself would accept.
export function buildBank(patch) {
  const bank = defaultBank();
  applyBankPatch(bank, patch && typeof patch === 'object' ? patch : {});
  return bank;
}

// A data feed into the banks (2026-09-19): the Tournament platform's fresh
// results for the pairings each bank already holds (server/platform.js
// followPairings), each into its own bank and on air at once, like a clock
// cue. Only event.pairings rides it, through the same whitelist as any edit.
export function applyFeed(patches) {
  let changed = false;
  for (const name of ['preview', 'program']) {
    const p = patches && patches[name];
    if (!p || !p.event || !p.event.pairings || typeof p.event.pairings !== 'object') continue;
    applyBankPatch(state[name], { event: { pairings: p.event.pairings } });
    changed = true;
  }
  if (changed) bump();
  return { ok: true, version: state.version };
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
// Actions: take (preview -> program, atomic), clear (all program graphics
// off, data untouched: the wrong-graphic-on-air recovery) and off (one
// program graphic down, the same recovery aimed at a single graphic).
export function applyUpdate(patch) {
  if (!patch || typeof patch !== 'object') return { ok: false, error: 'invalid body' };

  if (patch.action === 'take') {
    const before = rollInputs(state.program);
    state.program = structuredClone(state.preview);
    // The legend table rolls from the top whenever the graphic comes on air
    // or airs new numbers (with Start on its own off, it waits at the top).
    const after = rollInputs(state.program);
    if (after.on && (!before.on || after.key !== before.key)) {
      const at = Date.now();
      for (const bank of [state.preview, state.program]) rollFromTop(bank.scenes.legendstats, at);
    }
    bump();
    return { ok: true, version: state.version };
  }
  if (patch.action === 'clear') {
    for (const scene of Object.values(state.program.scenes)) scene.visible = false;
    bump();
    return { ok: true, version: state.version };
  }
  // CLEAR for the preview bank: every graphic out of preview, data kept, so
  // the next TAKE airs a clean frame. Program is untouched.
  if (patch.action === 'clearpreview') {
    for (const scene of Object.values(state.preview.scenes)) scene.visible = false;
    bump();
    return { ok: true, version: state.version };
  }
  // Highlight a card on a graphic that is up: the decklist lifts the card
  // with that id out of the plate, the card row enlarges the slot at that
  // index. A cue like the clock, so it lands in both banks and acts on air
  // at once; stepping through a deck on air needs no TAKE per card.
  if (patch.action === 'focus') {
    if (patch.scene === 'decklist') {
      // A card id picks and switches the highlight on; `on` alone flicks it
      // off or back on with the card kept.
      for (const bank of [state.preview, state.program]) {
        const d = bank.scenes.decklist;
        if (patch.cardId !== undefined) {
          d.focus = cleanCardId(patch.cardId);
          d.focusOn = true;
        }
        if (patch.on !== undefined) d.focusOn = Boolean(patch.on);
      }
    } else if (patch.scene === 'cardrow') {
      const slot = clampInt(patch.slot ?? -1, -1, ROW_SLOTS - 1);
      for (const bank of [state.preview, state.program]) bank.scenes.cardrow.focus = slot;
    } else if (patch.scene === 'standings' || patch.scene === 'pairings' || patch.scene === 'legendstats') {
      // The between-games sheets (2026-09-19): a player, a table or a legend
      // added, taken out or flipped (on true, false, or neither), made the
      // only one (only), or every highlight cleared (clear).
      const now = Date.now();
      for (const bank of [state.preview, state.program]) focusSheet(bank, patch, now);
    } else if (patch.scene === 'matrix') {
      // The matchup matrix (2026-09-19): a legend's row, its column, or the
      // cell where they cross (row and col, each a legend key or '' for
      // none); clear takes the highlight off.
      for (const bank of [state.preview, state.program]) {
        const sc = bank.scenes.matrix;
        const next = patch.clear ? { row: '', col: '' } : { ...sc.focus };
        if (!patch.clear && patch.row !== undefined) next.row = cleanMatrixKey(patch.row);
        if (!patch.clear && patch.col !== undefined) next.col = cleanMatrixKey(patch.col);
        sc.focus = next;
      }
    } else {
      return { ok: false, error: 'unknown scene' };
    }
    bump();
    return { ok: true, version: state.version };
  }
  // CLEAR aimed at one graphic: the operator drops the overlay that should
  // not be up without pulling down the rest of the show. A cue on program
  // only, like CLEAR, so preview keeps what it holds and TAKE puts it back.
  if (patch.action === 'off') {
    if (!Object.hasOwn(state.program.scenes, patch.scene)) return { ok: false, error: 'unknown scene' };
    state.program.scenes[patch.scene].visible = false;
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
  // The legend table's roll (2026-09-19): start, pause, stop (back to the
  // top) and restart, and its settings, on both banks at once like the
  // clock, so the operator steers it on air without a TAKE.
  if (patch.action === 'roll') {
    if (patch.scene !== 'legendstats') return { ok: false, error: 'unknown scene' };
    if (patch.op !== undefined && !ROLL_OPS.includes(patch.op)) return { ok: false, error: 'unknown roll op' };
    const now = Date.now();
    for (const bank of [state.preview, state.program]) applyRoll(bank.scenes.legendstats, patch, now);
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
  // The showdown chain is a cue: open at a battlefield, play a card from a
  // hand onto it, resolve the top, close. Acts on both banks like the clock.
  if (patch.action === 'chain') {
    const other = (side) => (side === 'left' ? 'right' : 'left');
    for (const bank of [state.preview, state.program]) {
      const sd = bank.match.showdown;
      switch (patch.op) {
        case 'open': {
          sd.active = true;
          sd.chain = [];
          sd.might = { left: null, right: null };
          sd.battlefield = cleanStr(patch.battlefield || '', 40);
          sd.battlefieldCardId = cleanCardId(patch.battlefieldCardId || '');
          // The defender responds first: whoever is not the active player.
          sd.priority = ['left', 'right'].includes(patch.priority) ? patch.priority
            : (bank.match.activeSide ? other(bank.match.activeSide) : 'right');
          break;
        }
        case 'play': {
          // The card is what the operator sees: preview's hand. Program may
          // hold an older hand (or none), so it gets the same chain entry and
          // marks a matching card played only where it has one.
          if (!['left', 'right'].includes(patch.side)) return { ok: false, error: 'side must be left or right' };
          const i = clampInt(patch.index, 0, 99);
          const source = state.preview.match[patch.side].hand[i];
          if (!source) return { ok: false, error: 'no such card in hand' };
          if (sd.chain.length >= 12) return { ok: false, error: 'the chain is full' };
          const hand = bank.match[patch.side].hand;
          const card = (hand[i] && hand[i].cardId === source.cardId) ? hand[i] : hand.find((c) => c.cardId === source.cardId && !c.played);
          if (card) card.played = true;
          sd.active = true;
          sd.chain.push({ cardId: source.cardId, cardName: source.cardName, kind: source.kind || '', side: patch.side });
          sd.priority = other(patch.side);
          break;
        }
        case 'resolve': {
          const top = sd.chain.pop();
          // A resolved card leaves the hand for good; the count follows.
          if (top) {
            const side = bank.match[top.side];
            const j = side.hand.findIndex((c) => c.played && c.cardId === top.cardId);
            const held = j >= 0 ? side.hand.splice(j, 1)[0] : null;
            if (side.handCount > 0) side.handCount -= 1;
            toTrash(side, held || top);
          }
          break;
        }
        case 'unplay': {
          // The last card back into the hand: the spotter clicked early.
          const top = sd.chain.pop();
          if (top) {
            const card = bank.match[top.side].hand.find((c) => c.played && c.cardId === top.cardId);
            if (card) card.played = false;
            sd.priority = top.side;
          }
          break;
        }
        case 'priority':
          if (['', 'left', 'right'].includes(patch.side)) sd.priority = patch.side;
          break;
        case 'close': {
          // Whatever is still on the chain resolved off camera: it leaves the hands.
          for (const entry of sd.chain) {
            const side = bank.match[entry.side];
            const j = side.hand.findIndex((c) => c.played && c.cardId === entry.cardId);
            const held = j >= 0 ? side.hand.splice(j, 1)[0] : null;
            if (side.handCount > 0) side.handCount -= 1;
            toTrash(side, held || entry);
          }
          sd.active = false; sd.chain = []; sd.priority = ''; sd.battlefield = ''; sd.battlefieldCardId = ''; sd.might = { left: null, right: null };
          break;
        }
        default:
          return { ok: false, error: 'unknown chain op' };
      }
    }
    bump();
    return { ok: true, version: state.version };
  }
  // A sideboard card spotted (2026-09-19): a card a player sided in turned
  // up in their hand. A cue like the clock: it lands in both banks at once
  // and the graphic, while it is on air, flies the card in straight away.
  // op 'show' (the default) spots a card on a side (the RiftAtlas reader, or
  // the panel by hand); 'again' flies the last one in again; 'hide' ends its
  // time on screen now and keeps it for 'again'.
  if (patch.action === 'spot') {
    const op = patch.op === undefined ? 'show' : patch.op;
    const last = state.preview.scenes.sidespot.spot;
    const serial = Math.max(last.id, state.program.scenes.sidespot.spot.id) + 1;
    let next;
    if (op === 'show') {
      if (!['left', 'right'].includes(patch.side)) return { ok: false, error: 'side must be left or right' };
      const cardId = cleanCardId(patch.cardId ?? '');
      const cardName = cleanStr(patch.cardName ?? '', 80);
      if (!cardId && !cardName) return { ok: false, error: 'a spot needs a card' };
      next = cleanSpot({
        id: serial, side: patch.side, cardId, cardName,
        player: patch.player ?? state.preview.match[patch.side].name,
        game: patch.game, turn: patch.turn, at: Date.now(),
      });
    } else if (op === 'again') {
      if (!last.id) return { ok: false, error: 'nothing spotted yet' };
      next = { ...last, id: serial, at: Date.now() };
    } else if (op === 'hide') {
      next = { ...last, at: 0 };
    } else {
      return { ok: false, error: 'unknown spot op' };
    }
    for (const bank of [state.preview, state.program]) bank.scenes.sidespot.spot = { ...next };
    bump();
    return { ok: true, version: state.version };
  }
  // A live game feed (RiftAtlas, riftatlas.js): the game itself says what
  // the points, the hands and the turn are, so the same match patch lands in
  // both banks at once, like a cue, through the same whitelist as any edit.
  // Only match data rides it; anything else in the body is ignored.
  if (patch.action === 'live') {
    if (!patch.match || typeof patch.match !== 'object') return { ok: false, error: 'live needs match data' };
    for (const bank of [state.preview, state.program]) applyBankPatch(bank, { match: patch.match });
    bump();
    return { ok: true, version: state.version };
  }
  if (patch.action !== undefined) return { ok: false, error: 'unknown action' };

  applyBankPatch(state.preview, patch);
  if (patch.theme && typeof patch.theme === 'object') applyThemePatch(patch.theme);
  bump();
  return { ok: true, version: state.version };
}
