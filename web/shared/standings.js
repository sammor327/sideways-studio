// The standings' groups (2026-09-19, Sam: "make it so the standings can
// alternate through the groups more easily"). Rows carry the group they
// belong to ('' for none) and the graphic shows one group at a time, twenty
// rows a page. Shared by the standings scene and the panel's group buttons
// and page arrows, so both agree on which groups there are, in what order,
// and how many pages each has.

export const STANDINGS_PER_PAGE = 20;
export const STANDINGS_PAGES = 4;

// The groups in the order their rows come.
export function standingsGroups(rows) {
  const out = [];
  for (const r of rows || []) {
    const g = (r && r.group) || '';
    if (!out.includes(g)) out.push(g);
  }
  return out;
}

// What the graphic shows: the group asked for when the rows have it, else
// the first, and the page asked for within that group's pages.
export function standingsView(standings, scene) {
  const rows = (standings && standings.rows) || [];
  const groups = standingsGroups(rows);
  const asked = (scene && scene.group) || '';
  const group = groups.includes(asked) ? asked : (groups[0] || '');
  const list = rows.filter((r) => ((r && r.group) || '') === group);
  const pages = Math.max(1, Math.min(STANDINGS_PAGES, Math.ceil(list.length / STANDINGS_PER_PAGE)));
  const page = Math.min(pages, Math.max(1, (scene && scene.page) || 1));
  return { groups, group, index: Math.max(0, groups.indexOf(group)), rows: list, pages, page };
}

// Where the page arrows go: the next page, and past a group's last page the
// next group's first (back: the previous group's last), so one button walks
// every page of every group. null at either end.
export function standingsStep(standings, scene, dir) {
  const v = standingsView(standings, scene);
  if (dir > 0) {
    if (v.page < v.pages) return { group: v.group, page: v.page + 1 };
    if (v.index + 1 < v.groups.length) return { group: v.groups[v.index + 1], page: 1 };
    return null;
  }
  if (v.page > 1) return { group: v.group, page: v.page - 1 };
  if (v.index > 0) {
    const prev = v.groups[v.index - 1];
    return { group: prev, page: standingsView(standings, { group: prev, page: STANDINGS_PAGES }).page };
  }
  return null;
}
