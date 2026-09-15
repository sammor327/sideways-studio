# The card store

How the card database sits on an operator's disk, what that protects, and what
it does not. Implementation: `server/cardstore.js`.

## What changed and why

Sideways Studio downloads Rift Registry's card index and art onto every machine
it runs on, and caches it so a venue with no internet still has graphics. Until
0.11.1 that cache was plaintext:

```
data/carddb/cards.json        the whole index, 934 cards, readable in Notepad
data/carddb/thumb/UNL-131.webp    932 files, named for the card
data/carddb/full/UNL-131.webp     932 files, named for the card
data/carddb/legends/jinx-loose-cannon.webp
```

Anyone who ran the app got a clean, complete, ready-to-import copy of the
database for no effort at all. Now the same cache is:

```
data/carddb/store/store.id    16 random bytes, the per-install salt
data/carddb/store/index       the index, AES-256-GCM
data/carddb/store/t/3f2a9c...  thumbs, 32 hex characters each, AES-256-GCM
data/carddb/store/f/...        full art
data/carddb/store/l/...        legend cutouts
```

Copying `data/carddb/` out of an install now yields a pile of files that are
not images, are not named for anything, and do not open.

## What this is worth, honestly

**It stops the casual rip, not a determined one.** The key ships inside
`SidewaysStudio.exe`, because the app has to be able to read its own cache with
no operator involvement. Anyone willing to pull strings out of a 100 MB binary
can recover it. That is inherent to shipping a local app, not a flaw in the
implementation, and no amount of extra ceremony changes it.

**The index is public anyway, and not because of this app.**
`https://riftregistry.com/data/cards.json` is a static file, and the Rift
Registry front end fetches it in the browser, so the whole index is one `curl`
away from anyone who opens devtools. Encryption here does not change that by one
bit. If the database is worth gating, the gate belongs on riftregistry.com: a
trimmed public index for what the website actually renders, and an
authenticated, rate-limited endpoint for the app. This file only covers the
local half.

**What it does buy.** A tidy folder of card-named images beside a downloaded exe
is an invitation; a directory of opaque blobs is not. It removes the accidental
copy, the "I just zipped the data folder" share, and the zero-effort scrape, and
it means art the operator paid bandwidth for is not sitting on their disk as a
redistributable dataset.

## The key

Generated once into `.carddb-key` at the repo root by `npm run build:exe`.
Gitignored.

**Keep it, and keep it the same.** Every release must be built with the same key
or every installed copy's cache becomes unopenable. The failure is soft: a blob
that will not open reads as "not cached", so the app silently downloads the
database again (about 18 MB of thumbs, a bit under a minute). Nothing breaks and
nothing is corrupted, but every operator pays for it, and an operator offline at
a venue is stuck with no card art until they have internet.

If the file is missing at build time a new key is generated and the build warns.
An existing file is never overwritten, whatever is in it.

Running from source there is no build step, so `npm start` uses a fixed
development key that is written in `server/cardstore.js` in the clear. That is
deliberate: a cache built by a developer on their own machine is not what any of
this is protecting, and hiding it would only obscure where the real secret is.

## Design notes

- **AES-256-GCM**, one sealed file per card and tier. Key and blob-name key are
  both HKDF-derived from the build secret plus a per-install random salt, so no
  table built from one install says anything about another.
- **Blob names are HMAC'd**, not encrypted, because a name has to be derivable
  from a card id without reading anything. 128 bits of it, hex.
- **The label goes in as GCM additional data**, so each blob is bound to the one
  card and tier it holds. Swapping two files makes both fail to open rather than
  serving the wrong art under the right name.
- **A card id never reaches the filesystem.** It is hashed into a name, so the
  art route has nothing to traverse with even before its own validation.
- **Atomic writes** (temp plus rename), so a crash or a full disk never leaves a
  truncated blob that would count as cached and never open.
- **Small hot cache** of unsealed art, capped at 96 entries: a scene can ask for
  the same card on every redraw, and decryption is cheap but not free.
- **Anything that will not open reads as absent**, and the caller re-downloads.
  That one rule is what makes a lost key, a damaged file, a half-written
  download and a build with a different secret all recoverable.

## Upgrading an existing install

On first launch of a build with the store, an install carrying the old plaintext
layout migrates itself:

- **The index moves first, in the foreground.** It is 400 KB, nothing works
  without it, and re-downloading it is the slow path this exists to avoid. The
  old file's modification date is carried onto the new blob, so an install that
  has been sitting on a three-week-old set list still gets its launch refresh on
  the launch it upgrades.
- **The art moves in the background**, after the server is listening: it is
  ~90 MB on a filled-in install, and holding the graphics up for it would be the
  wrong trade at a venue. Reads fall through to the plaintext file until each
  one has moved, so nothing goes missing while it runs, and the panel says what
  is happening.
- **A file that fails to move is left where it is** for the next launch to
  retry, rather than being lost. The plaintext folders are only removed once
  every file in them has been sealed.
- The migration and the launch refresh track progress separately, so they can
  both run on the same launch without one cancelling the other.

Covered by `test/cardstore.test.js`.
