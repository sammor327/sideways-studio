// Who the victory graphics name (2026-09-20, Sam: a game victory scene, a
// match victory scene and a tournament champion scene).
//
// One answer for all three, and for the panel that has to label its own
// buttons with it, so the graphic on air and the button that put it there can
// never disagree about who won. Pure, like gamewindow.js and sponsor.js.

// Games a side has to take to win the series.
export const gamesToWin = (match) => Math.ceil(((match && match.seriesLength) || 3) / 2);

const side = (match, key) => (key === 'right' ? match.right : match.left);

// The side that won the match: the winner the operator set under Match card
// and result, else the side that has reached the games it takes. '' while
// the series is still live and nobody has said otherwise. `pinned` ('left' or
// 'right') overrides both, which is how a graphic's own Winner switch works.
export function matchWinner(match, pinned = '') {
  if (pinned === 'left' || pinned === 'right') return pinned;
  const set = match && match.result && match.result.winner;
  if (set === 'left' || set === 'right') return set;
  const need = gamesToWin(match);
  if ((match.left.gameWins || 0) >= need) return 'left';
  if ((match.right.gameWins || 0) >= need) return 'right';
  return '';
}

// The side that won the game just finished: whoever is ahead on game wins,
// because the operator moves that number as the game ends and the graphic
// goes up on the back of it. Level, nobody is named, and the operator pins a
// side instead. The between-games run pins it when it starts, so a game that
// levels the series still names the right player.
export function gameWinner(match, pinned = '') {
  if (pinned === 'left' || pinned === 'right') return pinned;
  const l = match.left.gameWins || 0;
  const r = match.right.gameWins || 0;
  if (l === r) return '';
  return l > r ? 'left' : 'right';
}

// Everything a victory graphic prints about one result, so the three scenes
// draw the same lines from the same reading.
export function victory(match, winnerKey) {
  const won = Boolean(winnerKey);
  const winner = won ? side(match, winnerKey) : {};
  const loser = won ? side(match, winnerKey === 'left' ? 'right' : 'left') : {};
  return {
    won,
    key: winnerKey,
    winner,
    loser,
    // Always the winner's games first, however the players are seated.
    games: `${winner.gameWins || 0} - ${loser.gameWins || 0}`,
    points: `${winner.score || 0} - ${loser.score || 0}`,
    bestOf: `Best of ${(match && match.seriesLength) || 3}`,
  };
}
