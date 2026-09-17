// The one secret that seals the card database, in every form it takes on an
// operator's machine: the per-install store (cardstore.js) and the read-only
// packs that ship with the app (cardpack.js).
//
// Substituted in as a literal by scripts/build-exe.mjs, which reads it from
// .carddb-key: gitignored, generated once, and the same for every release.
// Change it and every installed copy's cache turns unreadable and downloads
// itself again, and the packs shipped inside older builds stop opening, so
// the build script guards that file rather than regenerating it.
//
// From source there is no build step, so source runs share the development
// key below. It sits in a public repo deliberately: a cache built by
// `npm start` belongs to a developer, and inventing a second hiding place for
// it would only obscure where the real secret lives.
const BUILD_SECRET = process.env.SIDEWAYS_CARDDB_KEY || '';
const DEV_SECRET = 'sideways-studio development card store; not the shipped key';

export const CARD_SECRET = BUILD_SECRET || DEV_SECRET;
export const usingBuildKey = Boolean(BUILD_SECRET);
