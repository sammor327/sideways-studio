// Patch notes: CHANGELOG.md read three ways from one file.
//
// The release script takes the section for the version being released as
// the GitHub release notes and the update manifest's notes, and refuses to
// publish without one; the app window renders every section under "What's
// new"; the server hands the file over at /api/patchnotes. Plain ESM with no
// browser or Node dependencies, like the decklist format module.
//
// The file's shape:
//
//   # Sideways Studio patch notes
//   ## 0.13.0 (2026-09-16)
//   - One line per change, in the operator's words.
//   - Another.
//   ## 0.12.2 (2026-09-16)
//   ...
//
// A "## <version>" heading opens a section; the date in brackets is
// optional. Lines under it that start with "- " or "* " are bullets;
// any other non-empty line is a paragraph. Newest first is the convention,
// not a rule: the window sorts by version.

const HEADING = /^##\s+v?(\d+\.\d+\.\d+)\s*(?:\(([^)]*)\))?\s*$/;

export function parseChangelog(markdown) {
  const sections = [];
  let current = null;
  for (const raw of String(markdown || '').split(/\r?\n/)) {
    const line = raw.trimEnd();
    const head = line.match(HEADING);
    if (head) {
      current = { version: head[1], date: (head[2] || '').trim(), bullets: [], paragraphs: [] };
      sections.push(current);
      continue;
    }
    if (!current) continue;
    const text = line.trim();
    if (!text) continue;
    if (/^[-*]\s+/.test(text)) current.bullets.push(text.replace(/^[-*]\s+/, ''));
    else if (!text.startsWith('#')) current.paragraphs.push(text);
  }
  return sections.sort((a, b) => compareVersions(b.version, a.version));
}

export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

export const sectionFor = (sections, version) => sections.find((s) => s.version === version) || null;

// The section as plain text, for the release notes and the manifest: the
// paragraphs first, then one bullet per line. The updater keeps the first
// 500 characters and the console prints the first four lines, so the
// bullets are written to stand on their own.
export function sectionText(section) {
  if (!section) return '';
  return [...section.paragraphs, ...section.bullets.map((b) => `- ${b}`)].join('\n');
}
