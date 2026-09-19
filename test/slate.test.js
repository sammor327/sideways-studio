// The slate rework (2026-09-19): one layout for every screen, the switches
// each screen reads, the side panel's pages and turn, the sponsors, the
// band, and what the panel shows and hides (web/shared/slate.js).
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  FADE_MS, SLATE_EVERY_DEFAULT, SLATE_MODES, SLATE_PAGES, SLATE_SCREENS, SLATE_SWITCHES,
  clockLabelOf, clockSet, nextMatch, nextThing, seedLines, slateBand, slateFields, slateGaps, slateLine,
  slateMain, slateMode, slatePages, slateSlot, slateSponsors, slateSub, slateTitle,
} from '../web/shared/slate.js';
import { TILES } from '../web/shared/looktiles.js';

let applyUpdate;
let getState;
let buildBank;
let STATE_MODES;
before(async () => {
  process.env.SIDEWAYS_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'ss-slate-test-'));
  ({ applyUpdate, getState, buildBank, SLATE_MODES: STATE_MODES } = await import('../server/state.js'));
});

// A bank with the slate on `mode` and the event filled in as asked.
function bank(mode, event = {}, slate = {}, extra = {}) {
  const b = buildBank({ event, scenes: { slate: { mode, ...slate }, ...(extra.scenes || {}) }, match: extra.match || {} });
  if (extra.countdown) b.event.countdown = { ...b.event.countdown, ...extra.countdown };
  return b;
}

const TABLE = { label: 'Table 1', left: { name: 'Mara Quill' }, right: { name: 'Theo Brandt' } };
const FULL = {
  tables: [TABLE], seeds: 'Mara Quill · 7-1-0 · Diana\nSoren Pike · 7-1-0 · Viktor',
  schedule: [{ time: '10:00', title: 'Swiss' }, { time: '18:00', title: 'Top 8' }], scheduleNow: 1,
  format: 'Best of three Swiss.', casters: [{ name: 'Avery Stone', role: 'Play-by-play' }],
  commands: '!bracket !decks', nextName: 'Sideways Open #2', sponsors: 'Card Haven',
};

describe('slate screens', () => {
  it('lets the store take every screen, and only those', () => {
    assert.deepEqual(STATE_MODES, SLATE_MODES);
    for (const mode of SLATE_MODES) {
      applyUpdate({ scenes: { slate: { mode } } });
      assert.equal(getState().preview.scenes.slate.mode, mode);
    }
    applyUpdate({ scenes: { slate: { mode: 'sideways' } } });
    assert.equal(getState().preview.scenes.slate.mode, SLATE_MODES.at(-1), 'an unknown screen is ignored');
    assert.equal(slateMode('sideways'), 'upnext');
  });

  it('describes each screen: a title, the words over its clock, the switches it reads and the field its line lives in', () => {
    assert.deepEqual(Object.keys(SLATE_SCREENS).sort(), [...SLATE_MODES].sort());
    const fresh = buildBank({}).scenes.slate;
    for (const [mode, s] of Object.entries(SLATE_SCREENS)) {
      for (const sw of s.switches) assert.ok(SLATE_SWITCHES.includes(sw), `${mode} reads an unknown switch ${sw}`);
      if (s.switches.includes('countdown')) assert.ok(s.clock, `${mode} counts down with no words over the clock`);
      if (s.text) assert.ok(s.text in fresh, `${mode}'s line lives in ${s.text}, which the store does not keep`);
      assert.equal(s.label.length > 0, true);
    }
    // A switch is offered only where it does something.
    assert.deepEqual(SLATE_MODES.filter((m) => SLATE_SCREENS[m].switches.includes('camera')), ['brb']);
    assert.ok(!SLATE_SCREENS.upnext.switches.includes('ticker'), 'up next lists the tables already');
    assert.ok(!SLATE_SCREENS.thanks.switches.includes('countdown'), 'the sign-off has no break to count');
    assert.ok(!SLATE_SCREENS.schedule.switches.includes('schedule'), 'the schedule screen is the schedule');
  });

  it('heads every screen with its title and the event, the custom one with the event', () => {
    const ev = { name: 'Sideways Open', roundTitle: 'Top 8' };
    assert.equal(slateTitle('upnext', ev), 'Up next');
    assert.equal(slateSub('upnext', ev), 'Sideways Open · Top 8');
    assert.equal(slateTitle('custom', ev), 'Sideways Open');
    assert.equal(slateSub('custom', ev), 'Top 8');
    assert.equal(slateTitle('custom', { roundTitle: 'Top 8' }), 'Top 8');
    assert.equal(slateSub('custom', { roundTitle: 'Top 8' }), '');
  });

  it('keeps a line per screen, so a change of screen never carries one across', () => {
    const cfg = { text: 'Lunch', brbText: 'Back at 14:30', thanksText: 'VOD below' };
    assert.equal(slateLine(cfg, 'brb'), 'Back at 14:30');
    assert.equal(slateLine(cfg, 'thanks'), 'VOD below');
    assert.equal(slateLine(cfg, 'custom'), 'Lunch');
    assert.equal(slateLine(cfg, 'upnext'), '');
  });
});

describe('slate switches in the store', () => {
  it('whitelists the side panel, the sponsors, the page length, the clock words and the two lines', () => {
    applyUpdate({ scenes: { slate: {
      mode: 'brb', panel: false, sponsors: 0, every: '22.7', clockLabel: '  Semifinals begin in  ',
      brbText: 'x'.repeat(200), thanksText: 'VOD at the link', bogus: true,
    } } });
    const sl = getState().preview.scenes.slate;
    assert.equal(sl.panel, false);
    assert.equal(sl.sponsors, false);
    assert.equal(sl.every, 22);
    assert.equal(sl.clockLabel, 'Semifinals begin in');
    assert.equal(sl.brbText.length, 120);
    assert.equal(sl.thanksText, 'VOD at the link');
    assert.equal('bogus' in sl, false);
    applyUpdate({ scenes: { slate: { every: 1 } } });
    assert.equal(getState().preview.scenes.slate.every, 5);
    applyUpdate({ scenes: { slate: { every: 900 } } });
    assert.equal(getState().preview.scenes.slate.every, 60);
    applyUpdate({ scenes: { slate: { every: 'soon' } } });
    assert.equal(getState().preview.scenes.slate.every, 5);
    assert.equal(buildBank({}).scenes.slate.every, SLATE_EVERY_DEFAULT);
  });
});

describe('the side panel', () => {
  it('turns through every page with something to say, less what the screen shows itself', () => {
    assert.deepEqual(slatePages(bank('custom', FULL), 'custom'), SLATE_PAGES);
    assert.deepEqual(slatePages(bank('upnext', FULL), 'upnext'), ['schedule', 'format', 'desk', 'commands', 'nextEvent']);
    assert.deepEqual(slatePages(bank('starting', FULL), 'starting'), ['next', 'standings', 'format', 'desk', 'commands', 'nextEvent']);
    assert.deepEqual(slatePages(bank('schedule', FULL), 'schedule'), ['next', 'standings', 'format', 'desk', 'commands', 'nextEvent']);
    assert.deepEqual(slatePages(bank('format', FULL), 'format'), ['next', 'schedule', 'standings', 'desk', 'commands', 'nextEvent']);
    assert.deepEqual(slatePages(bank('thanks', FULL), 'thanks'), ['standings', 'desk', 'commands']);
  });

  it('follows the switches: the camera, the schedule, the panel itself', () => {
    assert.ok(slatePages(bank('brb', FULL), 'brb').includes('next'));
    assert.ok(!slatePages(bank('brb', FULL, { camera: false }), 'brb').includes('next'), 'with the camera off the match is in the column');
    assert.ok(!slatePages(bank('brb', FULL, { schedule: false }), 'brb').includes('schedule'));
    assert.deepEqual(slateMain('starting', { schedule: false }), []);
    assert.deepEqual(slatePages(bank('brb', FULL, { panel: false }), 'brb'), []);
  });

  it('has no pages on an empty event, and names the match from Match data when no table is typed', () => {
    assert.deepEqual(slatePages(bank('custom'), 'custom'), [], "a fresh install's PLAYER ONE and PLAYER TWO are not a match to name");
    assert.equal(nextMatch(bank('custom')), null);
    const b = bank('custom', {}, {}, { match: { left: { name: 'Mara Quill' }, right: { name: 'Theo Brandt' } } });
    assert.deepEqual(slatePages(b, 'custom'), ['next']);
    assert.equal(nextMatch(b).label, '');
    assert.equal(nextMatch(bank('custom', { tables: [TABLE] })).left.name, 'Mara Quill');
  });

  it('turns on the wall clock, each page `every` seconds, fading in over the previous one', () => {
    assert.deepEqual(slateSlot(0, 15, 1000), { index: -1, previous: -1, fade: 1 });
    assert.deepEqual(slateSlot(1, 15, 1000), { index: 0, previous: -1, fade: 1 });
    const s = slateSlot(3, 15, 15_000 * 4 + 300);
    assert.equal(s.index, 1);
    assert.equal(s.previous, 0);
    assert.equal(s.fade, 300 / FADE_MS);
    assert.equal(slateSlot(3, 15, 15_000 * 4 + 7_500).into, 0.5);
    assert.equal(slateSlot(2, 1, 5_000).index, 1, 'a page holds at least five seconds');
    assert.equal(slateSlot(2, 1, 4_999).index, 0);
  });
});

describe('the clock, the next thing, the seeds', () => {
  it('shows the break clock only once it is set, running or run', () => {
    assert.equal(clockSet(null), false);
    assert.equal(clockSet({ countdown: 0, running: false, elapsed: 0 }), false);
    assert.equal(clockSet({ countdown: 300_000, running: false, elapsed: 0 }), true);
    assert.equal(clockSet({ countdown: 0, running: true, elapsed: 0 }), true);
    assert.equal(clockSet({ countdown: 0, running: false, elapsed: 4_000 }), true);
    assert.equal(clockLabelOf('brb', {}), 'Stream resumes in');
    assert.equal(clockLabelOf('brb', { clockLabel: 'Semifinals in' }), 'Semifinals in');
  });

  it('names the block up next with its time, else the round', () => {
    assert.equal(nextThing(FULL), 'Top 8 · 18:00');
    assert.equal(nextThing({ ...FULL, scheduleNow: -1, roundTitle: 'Round 3' }), 'Round 3');
    assert.equal(nextThing({ schedule: [{ time: '', title: 'Finals' }], scheduleNow: 0 }), 'Finals');
    assert.equal(nextThing({}), '');
  });

  it('reads the seeds paste a player a line, eight at most', () => {
    const lines = seedLines('A · 9-1-0 · Irelia\n\nB | 8-2-0\n' + 'C\n'.repeat(10));
    assert.equal(lines.length, 8);
    assert.deepEqual(lines[0], { name: 'A', rest: ['9-1-0', 'Irelia'] });
    assert.deepEqual(lines[1], { name: 'B', rest: ['8-2-0'] });
  });
});

describe('sponsors and the band', () => {
  it('shows the sponsor plate\'s logos when any are uploaded, else the names typed under Event', () => {
    const names = bank('brb', { sponsors: 'Card Haven, Rift Cave' });
    assert.deepEqual(slateSponsors(names), [{ name: 'Card Haven', image: '' }, { name: 'Rift Cave', image: '' }]);
    const logos = bank('brb', { sponsors: 'Card Haven' }, {}, { scenes: { sponsor: { items: [{ name: 'TURN5', image: '/theme/sponsor/0123456789ab.png' }] } } });
    assert.deepEqual(slateSponsors(logos), [{ name: 'TURN5', image: '/theme/sponsor/0123456789ab.png' }]);
    assert.equal(slateSponsors(bank('brb', { sponsors: 'a,b,c,d,e,f,g,h' })).length, 8, 'the card turns through them three at a time');
  });

  it('runs the feature tables along the bottom on the screens that read the switch, and gives way to the results ticker', () => {
    assert.equal(slateBand(bank('brb', FULL), 'brb'), true);
    assert.equal(slateBand(bank('upnext', FULL), 'upnext'), false, 'up next lists them already');
    assert.equal(slateBand(bank('thanks', FULL), 'thanks'), false);
    assert.equal(slateBand(bank('brb', FULL, { ticker: false }), 'brb'), false);
    assert.equal(slateBand(bank('brb', {}), 'brb'), false, 'no tables, no band');
    assert.equal(slateBand(bank('brb', FULL, {}, { scenes: { ticker: { visible: true } } }), 'brb'), false);
  });
});

describe('what the panel shows', () => {
  it('dims only the Match data fields the screen, its rail and its band cannot draw', () => {
    const cfg = (mode, extra = {}) => ({ ...buildBank({}).scenes.slate, mode, ...extra });
    const upnext = slateFields(cfg('upnext'));
    for (const f of ['tables', 'seeds', 'casters', 'format', 'commands', 'nextEvent', 'countdown', 'sponsors']) assert.ok(upnext.has(f), `up next draws ${f}`);
    assert.ok(!slateFields(cfg('upnext', { panel: false })).has('casters'), 'the desk is only in the side panel');
    assert.ok(!slateFields(cfg('upnext', { countdown: false })).has('countdown'));
    const thanks = slateFields(cfg('thanks'));
    assert.ok(thanks.has('champion') && thanks.has('nextEvent'));
    assert.ok(!thanks.has('countdown') && !thanks.has('schedule') && !thanks.has('format'));
    assert.ok(slateFields(cfg('format')).has('choseFirst'));
    assert.ok(slateFields(cfg('brb')).has('name'), 'the side panel names the match from Match data when no table is typed');
    assert.ok(!slateFields(cfg('brb', { panel: false })).has('name'), 'with the camera on and no side panel, no player is drawn');
    assert.ok(slateFields(cfg('brb', { camera: false, panel: false })).has('name'), 'with the camera off the match is in the column');
  });

  it('says why a switch that is on shows nothing, and says nothing when all is there', () => {
    const empty = slateGaps(bank('brb'), 'brb');
    assert.ok(empty.some((g) => g.startsWith('Break clock')));
    assert.ok(empty.some((g) => g.startsWith('Schedule')));
    assert.ok(empty.some((g) => g.startsWith('Side panel')));
    assert.ok(empty.some((g) => g.startsWith('Sponsors')));
    assert.ok(empty.some((g) => g.startsWith('Tables ticker')));
    assert.deepEqual(slateGaps(bank('brb', FULL, {}, { countdown: { countdown: 300_000 } }), 'brb'), []);
    assert.deepEqual(slateGaps(bank('brb', {}, { countdown: false, schedule: false, panel: false, sponsors: false, ticker: false }), 'brb'), []);
    const band = slateGaps(bank('brb', FULL, {}, { countdown: { countdown: 300_000 }, scenes: { ticker: { visible: true } } }), 'brb');
    assert.deepEqual(band, ['Tables ticker: stands down while the Results ticker is on; that ticker takes the band.']);
  });

  it('lists every screen in the panel and gives every switch a checkbox the panel can hide', async () => {
    const html = await readFile(new URL('../web/panel/index.html', import.meta.url), 'utf8');
    const group = html.slice(html.indexOf('data-scene="slate">', html.indexOf('feature-group hidden" data-scene="slate"')));
    for (const mode of SLATE_MODES) assert.ok(group.includes(`<option value="${mode}">`), `the Screen list lacks ${mode}`);
    for (const sw of SLATE_SWITCHES) assert.match(group, new RegExp(`data-switch="${sw}"[^>]*><input type="checkbox"`), `no checkbox for ${sw}`);
  });

  it('gives the look builder a tile for every screen', () => {
    const modes = TILES.filter((t) => t.scene === 'slate').map((t) => t.vary.mode);
    assert.deepEqual([...modes].sort(), [...SLATE_MODES].sort());
  });
});
