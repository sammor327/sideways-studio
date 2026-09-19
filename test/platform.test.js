// The Tournament platform's model (server/platform-model.js) on a made-up
// event, written out twice, once as TopDeck's public page data and once as
// its API returns it: eight players in two groups, two Swiss rounds, a Top 8.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEventId, decodeFirestore, buildFromFeed, feedExtras, buildFromApi, standings,
  summarize, standingsPatch, bracketModel, bracketPatch, matchPatch, upNextPatch, pairingsPatch,
} from '../server/platform-model.js';

const BS = String.fromCharCode(92);
const LIST = ['~~Legend~~', '1 Leader A', '', '~~Champion~~', '1 Champ A', '', '~~Battlefields~~', '1 Field One', '1 Field Two', '1 Field Three', '', '~~Mainboard~~', '3 Some Card'].join(`${BS}n`);

// --- the page data ---
const T = (es, wins, extra = {}) => ({ Es: es, Wins: wins, Draws: '0', End: '1', ...extra });
const doc = {
  Name: 'Test Open',
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`E${i}:P1`, `u${i}`])),
  'E9:P1': '_x_',
  'E7:D:Drop1': '1', 'E8:D:Drop1': '1', 'E8:D:Undrop1': '2',
  'S0:C:Type': 'SCI',
  'S1:C:Type': 'POOL',
  'S1:R0:T1': { Es: ['1', '2', '3', '4'] },
  'S1:R0:T2': { Es: ['5', '6', '7', '8'] },
  'S2:C:Type': 'GRP',
  'S2:R1:T1': T(['1', '2'], ['2', '0']),
  'S2:R1:T2': T(['3', '4'], ['2', '1']),
  'S2:R1:T3': T(['5', '6'], ['1', '1']),
  'S2:R1:T4': T(['7', '8'], ['0', '0']),
  'S2:R2:T1': T(['1', '3'], ['2', '1']),
  'S2:R2:T2': T(['2', '4'], ['0', '2']),
  'S2:R2:T3': T(['5', '7'], ['2', '0']),
  'S2:R2:T4': T(['6', '8'], ['0', '2']),
  'S3:C:Type': 'BRKT',
  'S3:R1:T1': T(['1', '8'], ['2', '0']),
  'S3:R1:T2': T(['4', '5'], ['1', '2']),
  'S3:R1:T3': T(['2', '7'], ['2', '1']),
  'S3:R1:T4': T(['3', '6'], ['0', '2']),
  // TopDeck lists a later table's players in either order.
  'S3:R2:T1': T(['5', '1'], ['1', '2']),
  'S3:R2:T2': { Es: ['2', '6'], Wins: ['0', '0'], Draws: '0' },
};
const players = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`u${i}`, {
  name: `Player ${i}`, pronouns: i === 1 ? 'She/Her' : '', leader: i === 1 ? 'Leader A' : i === 2 ? 'Leader B / Leader C' : '',
  decklist: i === 1 ? LIST : undefined,
}]));
const feed = () => buildFromFeed({ doc, players });

// --- the same event from the API ---
const P = (i) => ({ name: `Player ${i}`, id: `u${i}`, ...(i === 1 ? { leader: 'Leader A', decklist: LIST } : i === 2 ? { leader: 'Leader B / Leader C' } : {}) });
const done = (a, b, winner, wg, lg, table) => ({ table, players: [P(a), P(b)], winner_id: winner ? `u${winner}` : null, winner_games: wg, loser_games: lg, status: 'Completed' });
const draw = (a, b, table) => ({ table, players: [P(a), P(b)], winner_id: 'Draw', winner_games: null, loser_games: null, status: 'Completed' });
const api = {
  info: { name: 'Test Open', status: 'Ongoing' },
  standings: [
    { id: 'u1', name: 'Player 1', points: 6, opponentWinRate: 0.415, gameWinRate: 0.8, opponentGameWinRate: 0.415 },
    { id: 'u3', name: 'Player 3', points: 3, opponentWinRate: 0.75, gameWinRate: 0.5, opponentGameWinRate: 0.7 },
    { id: 'u4', name: 'Player 4', points: 3, opponentWinRate: 0.415, gameWinRate: 0.6, opponentGameWinRate: 0.415 },
    { id: 'u2', name: 'Player 2', points: 0, opponentWinRate: 0.75, gameWinRate: 0, opponentGameWinRate: 0.7 },
    { id: 'u5', name: 'Player 5', points: 4, opponentWinRate: 0.33, gameWinRate: 0.75, opponentGameWinRate: 0.33 },
    { id: 'u8', name: 'Player 8', points: 3, opponentWinRate: 0.33, gameWinRate: 1, opponentGameWinRate: 0.33 },
    { id: 'u6', name: 'Player 6', points: 1, opponentWinRate: (4 / 6 + 1) / 2, gameWinRate: 0.25, opponentGameWinRate: 0.875 },
    { id: 'u7', name: 'Player 7', points: 0, opponentWinRate: 4 / 6, gameWinRate: 0, opponentGameWinRate: 0.75 },
  ],
  rounds: [
    { round: 1, tables: [done(1, 2, 1, 2, 0, 1), done(3, 4, 3, 2, 1, 2), draw(5, 6, 3), done(7, 8, 0, null, null, 4)] },
    { round: 2, tables: [done(1, 3, 1, 2, 1, 1), done(2, 4, 4, 2, 0, 2), done(5, 7, 5, 2, 0, 3), done(6, 8, 8, 2, 0, 4)] },
    { round: 'Top 8', tables: [done(1, 8, 1, 2, 0, 1), done(4, 5, 5, 2, 1, 2), done(2, 7, 2, 2, 1, 3), done(3, 6, 6, 2, 0, 4)] },
    { round: 'Top 4', tables: [done(5, 1, 1, 2, 1, 1), { table: 2, players: [P(2), P(6)], winner_id: null, winner_games: null, loser_games: null, status: 'Active' }] },
  ],
};

const legendOf = (leader) => {
  const first = String(leader || '').split(' / ')[0];
  return first ? { legend: first, legendSlug: first.toLowerCase().replace(/ /g, '-'), legendCardId: first === 'Leader A' ? 'OGN-001' : '' } : { legend: '', legendSlug: '', legendCardId: '' };
};
const deckOf = () => ({ champion: { name: 'Champ A' }, legend: { cardId: 'OGN-001' }, battlefields: [{ name: 'Field One', cardId: 'OGN-201' }, { name: 'Field Two', cardId: 'OGN-202' }, { name: 'Field Three', cardId: '' }] });
const side = (name, extra = {}) => ({ name, team: 'Old Team', store: 'Old Store', legend: 'Typed Legend', pronouns: 'They/Them', score: 5, gameWins: 1, battlefields: [], ...extra });
const bankWith = (left, right) => ({ event: { name: '', tables: [] }, match: { left: side(left), right: side(right) } });

describe('platform: event ids', () => {
  it('reads a bare id and every TopDeck link shape', () => {
    assert.equal(parseEventId('convergence-3'), 'convergence-3');
    assert.equal(parseEventId('https://topdeck.gg/event/convergence-3'), 'convergence-3');
    assert.equal(parseEventId('topdeck.gg/bracket/convergence-3'), 'convergence-3');
    assert.equal(parseEventId('https://topdeck.gg/tournaments/convergence-3/standings'), 'convergence-3');
    assert.equal(parseEventId('not an id!'), '');
    assert.equal(parseEventId(''), '');
  });
  it('flattens Firestore values', () => {
    const out = decodeFirestore({ fields: { A: { stringValue: 'x' }, B: { integerValue: '3' }, C: { mapValue: { fields: { Es: { arrayValue: { values: [{ stringValue: '1' }] } } } } } } });
    assert.deepEqual(out, { A: 'x', B: 3, C: { Es: ['1'] } });
  });
});

describe('platform: the page data', () => {
  it('reads groups, drops and released seats', () => {
    const ev = feed();
    assert.equal(ev.entrants.get('1').group, 1);
    assert.equal(ev.entrants.get('6').group, 2);
    assert.equal(ev.entrants.get('7').dropped, true);
    assert.equal(ev.entrants.get('8').dropped, false, 'an undrop reverses the drop');
    assert.equal(ev.entrants.get('9').released, true);
    assert.equal(ev.entrants.get('1').decklist.split('\n')[0], '~~Legend~~', 'literal backslash-n becomes a line break');
  });

  it('ranks a group the way TopDeck does', () => {
    const rows = standings(feed(), { group: 1 }).rows;
    assert.deepEqual(rows.map((r) => r.name), ['Player 1', 'Player 3', 'Player 4', 'Player 2']);
    const [p1, p3, p4, p2] = rows;
    assert.equal(p1.record, '2-0');
    assert.equal(p1.points, 6);
    assert.ok(Math.abs(p1.omw - 0.415) < 1e-9, 'opponent at 0-2 floored to 0.33, averaged with 0.5');
    assert.ok(Math.abs(p1.gw - 0.8) < 1e-9);
    assert.ok(Math.abs(p3.omw - 0.75) < 1e-9, 'OMW breaks the 3-point tie');
    assert.ok(Math.abs(p4.ogw - 0.415) < 1e-9, 'an opponent with no game wins counts as 0.33');
    assert.equal(p2.gw, 0, 'a player\'s own GW% is not floored');
  });

  it('counts draws and ignores a double no-show', () => {
    const rows = standings(feed(), { group: 2 }).rows;
    assert.deepEqual(rows.map((r) => [r.name, r.record, r.points]), [
      ['Player 5', '1-0-1', 4], ['Player 8', '1-0', 3], ['Player 6', '0-1-1', 1], ['Player 7', '0-1', 0],
    ]);
  });

  it('gives records going into a round', () => {
    const s = summarize(feed(), legendOf);
    const r2 = s.rounds.find((r) => r.id === 'swiss:2');
    assert.deepEqual(r2.tables[0].players.map((p) => p.record), ['1-0', '1-0']);
    assert.equal(r2.tables[0].group, 1);
    assert.deepEqual(s.groups, [1, 2]);
    assert.deepEqual(s.rounds.map((r) => r.label), ['Round 1', 'Round 2', 'Quarterfinals', 'Semifinals']);
    const live = s.rounds.find((r) => r.id === 'bracket:2').tables[1];
    assert.equal(live.status, 'live');
    assert.equal(live.winner, -1);
  });
});

describe('platform: the API', () => {
  it('matches the page data once the groups are added', () => {
    const page = feed();
    const ev = buildFromApi(api, feedExtras(page));
    for (const g of [1, 2]) {
      const a = standingsPatch(ev, legendOf, { group: g }).patch;
      const b = standingsPatch(page, legendOf, { group: g }).patch;
      assert.deepEqual(a, b, `group ${g}`);
    }
    assert.deepEqual(bracketPatch(ev, legendOf).patch, bracketPatch(page, legendOf).patch);
  });

  it('has no groups on its own', () => {
    const ev = buildFromApi(api);
    assert.deepEqual(summarize(ev, legendOf).groups, []);
  });
});

describe('platform: patches', () => {
  it('labels standings with the round and tags the rows with the group', () => {
    const out = standingsPatch(feed(), legendOf, { group: 2, cut: 4 });
    assert.equal(out.patch.event.standings.label, 'after Round 2');
    assert.equal(out.patch.event.standings.cut, 4);
    assert.equal(out.patch.event.standings.rows[0].omw, 33);
    assert.ok(out.patch.event.standings.rows.every((r) => r.group === 'Group 2'));
    assert.deepEqual(out.patch.scenes, { standings: { group: 'Group 2', page: 1 } }, 'a new group opens on its first page');
  });

  it('places the bracket by who played, whatever order TopDeck lists them in', () => {
    const b = bracketModel(feed());
    assert.equal(b.format, 'se8');
    assert.deepEqual(b.results.W1, { top: 2, bottom: 0, winner: 'top' });
    assert.deepEqual(b.results.W2, { top: 1, bottom: 2, winner: 'bottom' });
    assert.deepEqual(b.results.W5, { top: 2, bottom: 1, winner: 'top' }, 'Player 1 (top) beat Player 5 though TopDeck listed 5 first');
    assert.equal(b.results.W6, undefined, 'a match still being played has no result');
    const players = bracketPatch(feed(), legendOf).patch.event.bracket.players;
    assert.equal(players[0].name, 'Player 1');
    assert.equal(players[7].name, 'Player 8');
    assert.equal(players[0].seed, '');
  });

  it('loads a new pairing with everything TopDeck knows and clears the last players\' extras', () => {
    const out = matchPatch(feed(), legendOf, { round: 'swiss:2', table: 1, bank: bankWith('Someone', 'Else'), deckOf });
    const { left, right } = out.patch.match;
    assert.equal(out.newPairing, true);
    assert.equal(left.name, 'Player 1');
    assert.equal(left.record, '1-0');
    assert.equal(left.pronouns, 'She/Her');
    assert.equal(left.legendCardId, 'OGN-001');
    assert.equal(left.champion, 'Champ A');
    assert.deepEqual(left.battlefields.map((b) => b.name), ['Field One', 'Field Two', 'Field Three']);
    assert.equal(left.deckName, 'Leader A');
    assert.equal(left.team, '');
    assert.equal(right.legend, '', 'no leader on TopDeck: a new player gets none');
    assert.equal(left.gameWins, 2, 'a finished table brings its games');
    assert.equal(right.gameWins, 1);
    assert.equal(left.score, 0);
    assert.equal(out.patch.event.roundTitle, 'Round 2 · Group 1');
    assert.equal(out.patch.event.name, 'Test Open');
    assert.deepEqual(out.patch.match.result, { winner: '', note: '' });
  });

  it('keeps the operator\'s counts and typed extras when the same pairing reloads', () => {
    const bank = bankWith('Player 2', 'Player 6');
    bank.match.left.battlefields = [{ name: 'Field One', cardId: '', played: true }];
    const out = matchPatch(feed(), legendOf, { round: 'bracket:2', table: 2, bank, deckOf });
    const { left, right } = out.patch.match;
    assert.equal(out.newPairing, false);
    assert.equal(left.team, undefined, 'extras untouched');
    assert.equal(left.score, undefined, 'points untouched');
    assert.equal(left.gameWins, undefined, 'games untouched while the match is live');
    assert.equal(left.legend, 'Leader B', 'the first of two leaders names the deck');
    assert.equal(right.legend, undefined, 'TopDeck has no leader: the typed one stays');
    assert.equal(right.pronouns, undefined);
    assert.equal(left.seed, '2ND', 'the seed-2 slot of the Top 8');
    assert.equal(out.patch.event.roundTitle, 'Semifinals');
  });

  it("keeps each battlefield's played mark and result when the same pairing reloads", () => {
    const first = matchPatch(feed(), legendOf, { round: 'swiss:2', table: 1, bank: bankWith('Someone', 'Else'), deckOf });
    const bank = bankWith(first.names[0], first.names[1]);
    bank.match.left.battlefields = [{ name: 'Field One', cardId: '', played: true, game: 1, result: 'won' }, { name: 'Field Two', cardId: '', played: true }];
    const out = matchPatch(feed(), legendOf, { round: 'swiss:2', table: 1, bank, deckOf });
    assert.equal(out.newPairing, false);
    assert.deepEqual(out.patch.match.left.battlefields.map((b) => [b.name, b.played, b.game, b.result]), [
      ['Field One', true, 1, 'won'], ['Field Two', true, 0, ''], ['Field Three', false, 0, ''],
    ]);
  });

  it('swaps sides on request', () => {
    const out = matchPatch(feed(), legendOf, { round: 'swiss:1', table: 1, swap: true, bank: bankWith('A', 'B'), deckOf });
    assert.equal(out.patch.match.left.name, 'Player 2');
    assert.equal(out.patch.match.right.name, 'Player 1');
    assert.equal(out.patch.match.right.gameWins, 2);
  });

  it('answers a table that is gone with an error, not a patch', () => {
    assert.ok(matchPatch(feed(), legendOf, { round: 'swiss:9', table: 1, bank: bankWith('A', 'B') }).error);
  });

  it('adds up to four tables to Up next, once each', () => {
    const bank = bankWith('A', 'B');
    const first = upNextPatch(feed(), legendOf, { round: 'swiss:2', table: 1, bank });
    assert.equal(first.patch.event.tables[0].label, 'Table 1');
    bank.event.tables = first.patch.event.tables;
    assert.equal(upNextPatch(feed(), legendOf, { round: 'swiss:2', table: 1, bank }).patch.event.tables.length, 1);
    bank.event.tables = [1, 2, 3, 4].map((i) => ({ label: `Table ${i + 10}`, left: { name: 'x' }, right: { name: 'y' } }));
    assert.ok(upNextPatch(feed(), legendOf, { round: 'swiss:2', table: 2, bank }).error);
  });
});

describe('platform: pairings', () => {
  const pairingsBank = (label = '') => ({ event: { name: '', pairings: { rows: [], label, byes: [] } } });

  it('loads one group\'s tables of a round with records going in, legends and results', () => {
    const out = pairingsPatch(feed(), legendOf, { round: 'swiss:2', group: 1, bank: pairingsBank() });
    const pr = out.patch.event.pairings;
    assert.equal(pr.label, 'Round 2 · Group 1');
    assert.deepEqual(pr.rows.map((r) => r.table), [1, 2]);
    const [t1, t2] = pr.rows;
    assert.equal(t1.left.name, 'Player 1');
    assert.equal(t1.left.record, '1-0', 'the record going into round 2');
    assert.equal(t1.left.legendCardId, 'OGN-001');
    assert.deepEqual([t1.status, t1.score, t1.winner], ['done', [2, 1], 'left']);
    assert.deepEqual([t2.right.name, t2.score, t2.winner], ['Player 4', [0, 2], 'right']);
    assert.equal(t2.left.legend, 'Leader B', 'the first of two leaders');
    assert.deepEqual(pr.byes, []);
    assert.equal(out.count, 2);
    assert.equal(out.done, 2);
    assert.equal(out.patch.event.name, 'Test Open', 'an empty event name is filled');
  });

  it('marks a draw, and a finished table with no games as no result', () => {
    const [draw, noShow] = pairingsPatch(feed(), legendOf, { round: 'swiss:1', group: 2 }).patch.event.pairings.rows;
    assert.deepEqual([draw.status, draw.score, draw.winner], ['done', [1, 1], 'draw']);
    assert.deepEqual([noShow.status, noShow.winner], ['done', '']);
  });

  it('reads every table of the round with no group, and a bracket round whatever group is asked for', () => {
    assert.equal(pairingsPatch(feed(), legendOf, { round: 'swiss:1' }).patch.event.pairings.rows.length, 4);
    const semis = pairingsPatch(feed(), legendOf, { round: 'bracket:2', group: 1 });
    assert.equal(semis.patch.event.pairings.label, 'Semifinals');
    const [done, live] = semis.patch.event.pairings.rows;
    assert.deepEqual([done.left.name, done.right.name, done.winner], ['Player 5', 'Player 1', 'right']);
    assert.deepEqual([live.status, live.winner], ['live', '']);
    assert.equal(semis.done, 1);
  });

  it('turns back to page one for a new round or group, not for fresh results of the same one', () => {
    assert.deepEqual(pairingsPatch(feed(), legendOf, { round: 'swiss:2', group: 1, bank: pairingsBank('Round 1 · Group 1') }).patch.scenes, { pairings: { page: 1 }, ongoing: { page: 1 } });
    assert.equal(pairingsPatch(feed(), legendOf, { round: 'swiss:2', group: 1, bank: pairingsBank('Round 2 · Group 1') }).patch.scenes, undefined);
  });

  it('answers a round that is gone, or a group with no tables, with an error', () => {
    assert.ok(pairingsPatch(feed(), legendOf, { round: 'swiss:9' }).error);
    assert.ok(pairingsPatch(feed(), legendOf, { round: 'swiss:1', group: 3 }).error);
  });

  it('comes out the same from the API once the groups are added', () => {
    const page = feed();
    const ev = buildFromApi(api, feedExtras(page));
    assert.deepEqual(pairingsPatch(ev, legendOf, { round: 'swiss:2', group: 2 }).patch, pairingsPatch(page, legendOf, { round: 'swiss:2', group: 2 }).patch);
  });
});
