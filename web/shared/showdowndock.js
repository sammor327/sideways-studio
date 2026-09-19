// Where an open showdown airs in one bank: in the middle of the rows
// overlay's column while that overlay is up with Showdown in the column on
// (showdownView, 2026-09-19), else on the showdown graphic. While the column
// shows it the graphic stands down, so a showdown never airs twice; the card
// popup and its docks keep the same rule (shared/carddock.js). Pure, so the
// scenes and the tests read the same rule.
export function rowsShowsShowdown(bank) {
  const rows = bank && bank.scenes && bank.scenes.igorows;
  return Boolean(rows && rows.visible && rows.showdownView !== false);
}
