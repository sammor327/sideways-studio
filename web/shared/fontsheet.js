// The theme fonts sheet (/theme/fonts.css) lists only the families saved
// when a page loaded it. A browser source stays open for a whole show, so a
// font downloaded after that (a first pick under Look, or Download all
// fonts) is named by --tes-font but never declared: the page draws the
// fallback until someone refreshes the source (Sam, 2026-09-18). These
// reload the sheet in place instead, the new one added before the old one
// goes, so the faces already showing never drop out.

const SHEET = '/theme/fonts.css';

// Swap in a fresh copy of the sheet. The old link stays until the new one
// has loaded; a failed load keeps the old one.
export function refreshFontSheet() {
  const old = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .filter((l) => new URL(l.href, location.href).pathname === SHEET);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `${SHEET}?v=${Date.now()}`;
  link.onload = () => { for (const l of old) l.remove(); };
  link.onerror = () => link.remove();
  if (old.length) old[old.length - 1].after(link);
  else document.head.append(link);
}

const declared = (family) => [...document.fonts]
  .some((f) => f.family.replace(/^["']|["']$/g, '') === family);

// Called on every state push with the theme's font. Reloads the sheet when
// the family is not declared on this page, at most once every few seconds
// for the same family, so a font that is not on this computer at all (an
// event file from another machine) does not refetch on every score click.
let lastFamily = '';
let lastTry = 0;
export function ensureFontFace(family) {
  if (!family || declared(family)) return;
  const now = Date.now();
  if (family === lastFamily && now - lastTry < 5000) return;
  lastFamily = family;
  lastTry = now;
  refreshFontSheet();
}
