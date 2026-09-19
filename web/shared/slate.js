// The slate's screens (2026-09-19 rework, Sam: "make it look consistent and
// develop it based off of the key learnings and make the toggles work").
//
// Every screen is one layout: the head across the top (the screen's title,
// the event and the round beside it, as on the standings and the pairings),
// the screen's own content down the left, a rail down the right (the break
// clock, a side panel that turns through the event's details, the sponsors)
// and a band along the bottom (the feature tables, or the foot line). What
// the between-games scouting found every hold carries, a clock, the next
// thing named and the sponsors, sits in the same place on every screen.
//
// Shared by the scene (what to draw), the panel (which switches a screen
// reads, and why one that is on shows nothing) and the tests. Plain ESM with
// no browser or Node dependencies, like look.js.

export const SLATE_MODES = ['upnext', 'starting', 'brb', 'thanks', 'custom', 'schedule', 'format'];

// Seconds each page of the side panel holds before the next one turns in.
export const SLATE_EVERY_MIN = 5;
export const SLATE_EVERY_MAX = 60;
export const SLATE_EVERY_DEFAULT = 15;

// The side panel's pages, in the order they turn: the match coming up, the
// day, where the players stand, how it works, who is on the desk, what chat
// can type, and the next event.
export const SLATE_PAGES = ['next', 'schedule', 'standings', 'format', 'desk', 'commands', 'nextEvent'];

// The switches, in the order the panel lists them.
export const SLATE_SWITCHES = ['countdown', 'schedule', 'panel', 'sponsors', 'ticker', 'camera'];

// Per screen: its name in the panel's Screen list, its title, the words over
// the break clock, the switches it reads, and the field that holds the
// operator's line on that screen ('' = the screen has no line).
export const SLATE_SCREENS = {
  upnext: {
    label: 'Up next (tables)', title: 'Up next', clock: 'Next match in',
    switches: ['countdown', 'schedule', 'panel', 'sponsors'], text: '',
  },
  starting: {
    label: 'Starting soon', title: 'Starting soon', clock: 'Show starts in',
    switches: ['countdown', 'schedule', 'panel', 'sponsors', 'ticker'], text: '',
  },
  brb: {
    label: 'Be right back', title: 'Be right back', clock: 'Stream resumes in',
    switches: ['countdown', 'camera', 'schedule', 'panel', 'sponsors', 'ticker'], text: 'brbText',
  },
  // The sign-off has no break to count down: the show is over.
  thanks: {
    label: 'Thanks for watching', title: 'Thanks for watching', clock: '',
    switches: ['panel', 'sponsors'], text: 'thanksText',
  },
  custom: {
    label: 'Custom line', title: '', clock: 'Stream resumes in',
    switches: ['countdown', 'schedule', 'panel', 'sponsors', 'ticker'], text: 'text',
  },
  schedule: {
    label: "Today's schedule", title: "Today's schedule", clock: 'Next block in',
    switches: ['countdown', 'panel', 'sponsors', 'ticker'], text: '',
  },
  format: {
    label: 'Format', title: 'Format', clock: 'Starting in',
    switches: ['countdown', 'schedule', 'panel', 'sponsors', 'ticker'], text: '',
  },
};

export const slateScreen = (mode) => SLATE_SCREENS[mode] || SLATE_SCREENS.upnext;
export const slateMode = (mode) => (SLATE_MODES.includes(mode) ? mode : 'upnext');

// The operator's line on this screen, '' where the screen has none.
export function slateLine(cfg = {}, mode = cfg.mode) {
  const field = slateScreen(mode).text;
  return field ? String(cfg[field] || '') : '';
}

// The head: the screen's title, and beside it the event and the round. The
// custom screen's line is its content, so its title is the event's name.
export function slateTitle(mode, ev = {}) {
  if (mode === 'custom') return ev.name || ev.roundTitle || '';
  return slateScreen(mode).title;
}
export function slateSub(mode, ev = {}) {
  if (mode === 'custom') return ev.name ? ev.roundTitle || '' : '';
  return [ev.name, ev.roundTitle].filter(Boolean).join(' · ');
}

// The words over the clock: the operator's own, else the screen's.
export const clockLabelOf = (mode, cfg = {}) => String(cfg.clockLabel || '').trim() || slateScreen(mode).clock;

// The break clock shows only once it means something: a length set, or
// running, or run. An untouched clock would air 00:00.
export const clockSet = (t) => Boolean(t && (t.countdown > 0 || t.running || t.elapsed > 0));

// The next thing, named under the clock: the schedule's current block (the
// one the hold lights as up next) with its time, else the round.
export function nextThing(ev = {}) {
  const rows = Array.isArray(ev.schedule) ? ev.schedule : [];
  const i = Number.isInteger(ev.scheduleNow) ? ev.scheduleNow : -1;
  const block = i >= 0 ? rows[i] : null;
  if (block && block.title) return [block.title, block.time].filter(Boolean).join(' · ');
  return ev.roundTitle || '';
}

// The seeds paste, one player a line: "Name · 9-1-0 · Irelia". Up to eight.
export function seedLines(text) {
  return String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 8)
    .map((line) => {
      const [name, ...rest] = line.split(/\s*[·|,]\s*/);
      return { name, rest: rest.filter(Boolean) };
    });
}

export const commandList = (text) => String(text || '').split(/[,\s]+/).filter(Boolean);

// The match coming up: the first feature table, else the match in Match data.
// A side still called PLAYER ONE / PLAYER TWO (a fresh install's names) counts
// as unnamed, as in the RiftAtlas feed, so a hold never airs the placeholders.
const unnamed = (name) => !String(name || '').trim() || /^player (one|two)$/i.test(String(name).trim());
export function nextMatch(bank) {
  const t = (bank.event.tables || [])[0];
  const pick = (s = {}) => ({
    name: s.name || '', country: s.country || '', record: s.record || '', seed: s.seed || '',
    legend: s.legend || '', legendSlug: s.legendSlug || '', legendCardId: s.legendCardId || '',
  });
  const m = bank.match || {};
  const left = pick(t ? t.left : m.left);
  const right = pick(t ? t.right : m.right);
  if (unnamed(left.name) && unnamed(right.name)) return null;
  return { label: t ? t.label || 'Table 1' : '', left, right };
}

// What a screen puts in its own column, which the side panel then leaves out.
export function slateMain(mode, cfg = {}) {
  switch (mode) {
    case 'upnext': return ['next', 'standings'];
    case 'starting': return cfg.schedule === false ? [] : ['schedule'];
    case 'brb': return cfg.camera === false ? ['next'] : [];
    case 'thanks': return ['nextEvent'];
    case 'schedule': return ['schedule'];
    case 'format': return ['format'];
    default: return [];
  }
}

// The sign-off leaves out what only matters while the day is still going.
const THANKS_SKIPS = ['next', 'schedule', 'format', 'nextEvent'];

// The side panel's pages on this screen: every page with something to say,
// less what the screen already shows. Empty when the panel is switched off.
export function slatePages(bank, mode) {
  const cfg = (bank.scenes && bank.scenes.slate) || {};
  if (cfg.panel === false) return [];
  const ev = bank.event || {};
  const has = {
    next: Boolean(nextMatch(bank)),
    schedule: cfg.schedule !== false && (ev.schedule || []).length > 0,
    standings: seedLines(ev.seeds).length > 0,
    format: Boolean(String(ev.format || '').trim()),
    desk: (ev.casters || []).length > 0,
    commands: commandList(ev.commands).length > 0,
    nextEvent: Boolean(ev.nextName),
  };
  const skip = new Set(slateMain(mode, cfg));
  if (mode === 'thanks') for (const k of THANKS_SKIPS) skip.add(k);
  return SLATE_PAGES.filter((k) => has[k] && !skip.has(k));
}

// The sponsors the rail's last card shows: the sponsor plate's logos when
// any are uploaded (with their names), else the names typed under Event. The
// card holds one row of three and turns through the rest.
export const SLATE_SPONSORS_MAX = 12;
export const SLATE_SPONSORS_ROW = 3;
export function slateSponsors(bank) {
  const items = (((bank.scenes || {}).sponsor || {}).items || []).filter((s) => s && (s.image || s.name));
  if (items.length) return items.slice(0, SLATE_SPONSORS_MAX).map((s) => ({ name: s.name || '', image: s.image || '' }));
  return String((bank.event || {}).sponsors || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
    .slice(0, SLATE_SPONSORS_MAX).map((name) => ({ name, image: '' }));
}

// The feature-tables band along the bottom: on the screens that read the
// switch, with tables listed, and not while the results ticker is up in the
// same bank (it takes the same band).
export function slateBand(bank, mode) {
  const cfg = (bank.scenes && bank.scenes.slate) || {};
  if (!slateScreen(mode).switches.includes('ticker') || cfg.ticker === false) return false;
  if (bank.scenes.ticker && bank.scenes.ticker.visible) return false;
  return (bank.event.tables || []).some((t) => t && ((t.left && t.left.name) || (t.right && t.right.name)));
}

// Which page of the side panel is up at wall-clock ms `now`, and how far
// into its turn: { index, previous, fade }, fade running 0 -> 1 over the
// first FADE_MS while the previous page fades out under it. From the wall
// clock alone, so preview, program and a second copy always agree.
export const FADE_MS = 600;
export function slateSlot(count, everySec, now) {
  if (count <= 0) return { index: -1, previous: -1, fade: 1 };
  if (count === 1) return { index: 0, previous: -1, fade: 1 };
  const period = Math.max(SLATE_EVERY_MIN, Math.min(SLATE_EVERY_MAX, Number(everySec) || SLATE_EVERY_DEFAULT)) * 1000;
  const k = Math.floor(now / period);
  const into = now - k * period;
  return { index: k % count, previous: (k - 1 + count) % count, fade: Math.min(into / FADE_MS, 1), into: into / period };
}

// For the panel's Match data column: the fields the slate can draw set up
// the way `cfg` has it, whether or not they are typed yet (a field it would
// draw once typed is not dimmed). The two sides' own fields are the match
// the up-next and be-right-back screens fall back to, and the champion.
const SIDE_FIELDS = ['name', 'country', 'legend', 'record'];
const PAGE_FIELDS = {
  next: ['tables', ...SIDE_FIELDS], schedule: ['schedule'], standings: ['seeds'], format: ['format'],
  desk: ['casters'], commands: ['commands'], nextEvent: ['nextEvent'],
};
export function slateFields(cfg = {}) {
  const mode = slateMode(cfg.mode);
  const reads = slateScreen(mode).switches;
  const on = (sw) => reads.includes(sw) && cfg[sw] !== false;
  const out = new Set(['eventName', 'roundTitle']);
  const add = (list) => { for (const f of list) out.add(f); };
  if (on('countdown')) out.add('countdown');
  if (on('sponsors')) out.add('sponsors');
  if (on('ticker')) out.add('tables');
  if (mode === 'upnext') add(['tables', 'seeds', ...SIDE_FIELDS]);
  if (mode === 'starting' && on('schedule')) out.add('schedule');
  if (mode === 'brb' && cfg.camera === false) add(['tables', ...SIDE_FIELDS]);
  if (mode === 'thanks') add(['champion', 'nextEvent', ...SIDE_FIELDS]);
  if (mode === 'schedule') out.add('schedule');
  if (mode === 'format') add(['format', 'seriesLength', 'choseFirst']);
  if (on('panel')) {
    const skip = new Set(slateMain(mode, cfg));
    if (mode === 'thanks') for (const k of THANKS_SKIPS) skip.add(k);
    for (const k of SLATE_PAGES) {
      if (skip.has(k) || (k === 'schedule' && cfg.schedule === false)) continue;
      add(PAGE_FIELDS[k]);
    }
  }
  return out;
}

// For the panel: why a switch that is on shows nothing on this screen.
// Returns one short line per switch left empty, in the switches' order.
export function slateGaps(bank, mode) {
  const cfg = (bank.scenes && bank.scenes.slate) || {};
  const ev = bank.event || {};
  const reads = slateScreen(mode).switches;
  const out = [];
  if (reads.includes('countdown') && cfg.countdown !== false && !clockSet(ev.countdown)) {
    out.push('Break clock: not set yet. Give it minutes and press Set, or Start to count up.');
  }
  if (reads.includes('schedule') && cfg.schedule !== false && !(ev.schedule || []).length) {
    out.push('Schedule: nothing typed yet (Match data › Event › Schedule).');
  }
  if (mode === 'schedule' && !(ev.schedule || []).length) {
    out.push('This screen lists the schedule: type it under Match data › Event › Schedule.');
  }
  if (mode === 'format' && !String(ev.format || '').trim()) {
    out.push('This screen prints the format: type it under Match data › Event › Format.');
  }
  if (reads.includes('panel') && cfg.panel !== false && !slatePages(bank, mode).length) {
    out.push('Side panel: nothing to turn through yet. Type a format, casters, chat commands, seeds or the next event under Match data › Event.');
  }
  if (reads.includes('sponsors') && cfg.sponsors !== false && !slateSponsors(bank).length) {
    out.push('Sponsors: none yet. Upload logos in the Sponsor plate, or type names under Match data › Event › Sponsors.');
  }
  if (reads.includes('ticker') && cfg.ticker !== false && !(ev.tables || []).length) {
    out.push('Tables ticker: no feature tables typed yet (Match data › Event › Up next).');
  }
  if (reads.includes('ticker') && cfg.ticker !== false && (ev.tables || []).length && bank.scenes.ticker && bank.scenes.ticker.visible) {
    out.push('Tables ticker: stands down while the Results ticker is on; that ticker takes the band.');
  }
  return out;
}
