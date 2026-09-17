# The card store

How the card database sits on an operator's disk, what that protects, and what
it does not. Implementation: `server/cardstore.js` for the cache an install
fills itself, `server/cardpack.js` and `server/cardlibrary.js` for the library
that ships with the build.

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

## The library that ships with the app

**Rift Registry is private and is staying private** (Sam, 2026-09-17). Every
paragraph above describes an install downloading the database onto itself, and
that only ever worked for the one person who can reach the site. For everyone
else the download answered with a sign-in page, surfaced as:

> Could not check for new sets: Rift Registry answered with a web page instead
> of the card list. Is the internet up?

The internet was up. They simply were never going to be let in, and an app with
no cards is an app with no card search, no pickers, no decklist and no card
graphics. So the library is baked on a machine that does have access and
travels with the build, in two pieces:

| | what | where | size |
| --- | --- | --- | --- |
| `cards-bundle.pack` | the index, every thumbnail, every legend cutout | inside `SidewaysStudio.exe` | ~17 MB |
| `cards-full.pack` | the full-resolution card art | a release asset, fetched once into `data/carddb/full.pack` | ~78 MB |

The split is the trade it looks like. The bundle is what makes the app work the
moment it is opened on a machine that has never been online, and 17 MB on the
exe is a price paid on every update. The full art is five times that, it only
changes when a set does, and an install keeps the copy it has across every
future update, so it is downloaded once in the life of the machine rather than
once per release.

**Read order is store, then library, then Rift Registry**, everywhere art is
asked for. An operator who has synced a card newer than the build still gets
their own copy; everyone else gets the baked one instead of a hole; and the one
machine that can reach the site can still top up art the last bake predates.

### Baking it

```
npm run bake:cards      # fill in what is missing from Rift Registry, then seal
npm run build:exe       # puts the bundle inside the app
npm run release         # publishes the full pack and its manifest
```

The bake drives the app's own downloader (`server/carddb.js`) rather than
keeping a second copy of the fetch rules, so the browser user agent, the
Referer and the allowed origins cannot drift from the ones that ship. It writes
`packs/` at the repo root, which is gitignored and deliberately outside `build/`
and `dist/`: those are wiped on every build, and the library takes minutes and a
connection to rebuild.

`npm run build:exe` warns loudly when `packs/cards-bundle.pack` is not there,
because a build without it ships an app with no cards for everyone who is not
Sam, and that is not a line to scroll past.

### Why a pack is not just more of the store

The store names its blobs with a per-install random salt. That is what stops a
table built from one install saying anything about another, and it is also why
a file built weeks earlier on a different machine cannot use the same scheme: it
cannot know the salt. So a pack carries its own directory instead, sealed with
the build key like everything else, and the name of every entry is inside that
directory rather than in the filesystem. A pack found on disk is one opaque file
with no readable names in it, which is the same protection the store offers and
the same honest limit: the key ships inside the exe.

Two details worth keeping:

- **Nonces are derived from the entry label**, not drawn at random, so the same
  art bakes to the same bytes every time. That is what lets a release compare
  its pack against the published one and skip re-uploading 80 MB of unchanged
  pictures. It is safe because a label appears once in a pack and the key is per
  build, so one nonce never seals two different plaintexts.
- **The manifest is checked before it is followed.** `library.json` names a URL
  and a SHA-256; the URL must be on the release hosts, the download is hashed as
  it streams, and the file is proved to open with this build's key before it
  replaces the pack already installed. A pack that will not open is a pack from
  another key, and putting it in place would cost the operator every card the
  old one served.

### What an operator sees now

"Download card database" stays, because a new set does reach Rift Registry
first and one machine can fetch it. For everyone else it is a button that finds
nothing, and it now says so as a fact rather than a failure: their card list
came with the app, and new sets arrive with app updates. The panel says the same
in its status line rather than claiming a list "checked today" that only moves
when the app does.

## The key

Generated once into `.carddb-key` at the repo root by `npm run build:exe`.
Gitignored.

**Keep it, and keep it the same.** It is now the key to two things, and losing
it costs more than it used to.

- **The cache** an install filled itself. A blob that will not open reads as
  "not cached", so the app falls through to the library that shipped with it and
  is no worse off than a fresh install. Soft, and now softer than before.
- **The packs.** A pack sealed with a key the build does not have will not open
  at all, and the app it shipped inside has no cards. That is the failure worth
  guarding: a release built with a new key needs a bake with the same new key,
  and the whole library re-published, or it ships empty.

If the file is missing at build time a new key is generated and the build warns.
An existing file is never overwritten, whatever is in it.

The secret itself lives in `server/cardsecret.js`, which the build substitutes
the real value into, so the store and the packs cannot drift onto two different
keys. Running from source there is no build step, so `npm start` seals its own
cache with the development key written there in the clear. That is deliberate: a
cache built by a developer on their own machine is not what any of this is
protecting, and hiding it would only obscure where the real secret is. Packs are
the exception. They are always sealed with the release key, and a source run
reads it off `.carddb-key` beside the repo, because a pack that only opened on
one developer's machine would be no use to any install.

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
