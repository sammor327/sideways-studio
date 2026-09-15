// The browser sources an operator adds to OBS or vMix.
//
// One list, two readers: the app window's source rail and the console banner
// the app prints when it runs without a window. Kept here so a new graphic is
// announced in both places by adding one line, and so the two can never
// disagree about what a source is called or what its URL is.
//
// Shipped graphics only. A scene folder exists for several graphics that are
// still being built (bracket, standings, result and friends); listing them
// here would invite an operator to put an unfinished plate on air.
import { SCENE_LABELS } from './look.js';

export const SOURCE_KEYS = [
  'scorebug', 'cardpopup', 'igo1v1', 'igo2v2', 'igodual', 'igobars', 'pov', 'decklist',
  'igoportrait', 'igorows', 'arenabug', 'slate', 'handfan', 'showdown',
];

// Everything at once, for the operator who would rather run a single source
// and switch graphics from the panel.
export const OUTPUT_SOURCE = {
  key: 'output',
  label: 'All graphics in one source',
  path: '/output/',
  note: 'one source, every graphic',
};

export const SCENE_SOURCES = SOURCE_KEYS.map((key) => ({
  key,
  label: SCENE_LABELS[key] || key,
  path: `/scenes/${key}/?transparent=1`,
  note: '',
}));

export const ALL_SOURCES = [OUTPUT_SOURCE, ...SCENE_SOURCES];

// Absolute URLs against a base like "http://localhost:4700".
export const sourceUrls = (base) => ALL_SOURCES.map((s) => ({ ...s, url: `${base}${s.path}` }));

// The operator pages, same shape, so the window and the banner list them the
// same way.
export const APP_PAGES = [
  { key: 'panel', label: 'Control panel', path: '/panel/' },
  { key: 'decklist', label: 'Deck editor', path: '/decklist/' },
];
