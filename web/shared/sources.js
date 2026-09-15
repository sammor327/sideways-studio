// The browser sources an operator adds to OBS or vMix.
//
// One list, two readers: the app window's source rail and the console banner
// the app prints when it runs without a window. Kept here so a new graphic is
// announced in both places by adding one line, and so the two can never
// disagree about what a source is called or what its URL is.
//
// Derived from the look model rather than typed out a third time: a graphic
// the look can recolour is a graphic that airs, so the two lists are the same
// set by construction and a new scene reaches OBS, the app window and the
// banner the moment it is added there.
import { LOOK_SCENES, SCENE_LABELS } from './look.js';

export const SOURCE_KEYS = [...LOOK_SCENES];

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
// same way. 'deckeditor' rather than 'decklist' because these keys share a
// namespace with the sources when the window asks for something to be opened,
// and there is already a decklist GRAPHIC: one key, two different things, and
// the Open button on the decklist source would quietly open the editor.
export const APP_PAGES = [
  { key: 'panel', label: 'Control panel', path: '/panel/' },
  { key: 'deckeditor', label: 'Deck editor', path: '/decklist/' },
];
