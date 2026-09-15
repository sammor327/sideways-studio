# Sideways Studio

Locally hosted broadcast graphics and transparent overlays for Riftbound
streams. Launch it, open the control panel in your browser, and add each
graphic to OBS or vMix as a 1920x1080 browser source. Built by Sam Morris /
Turn'em Sideways.

## Run (the app)

Double-click **SidewaysStudio.exe**. The Sideways Studio window opens: one
button to the control panel, the state of the server, the card database and
updates, every browser-source URL with a Copy button, and the app's console
running down the side of it. Leave that window open while you stream;
closing it stops the graphics.

The window is drawn by the copy of Edge (or Chrome) the computer already
has, started with its own private profile in `data\window`, so there is
still one file to copy and nothing to install. If neither is there, or the
window cannot be drawn for any reason, the app says so in its old console
window and carries on exactly as it did before: the show never stops for
this.

The app is one self-contained file: the server, the control panel, every
scene and the legend art are inside it. On first run it creates a `data`
folder beside itself for the card database, downloaded fonts and the event
autosave, so the whole thing is portable. Copy the exe and its `data` folder
to a USB stick or the venue PC and it works there, offline.

`SIDEWAYS_PORT` overrides the port. `--console` runs it the old way, in a
console window with every URL printed and the control panel opened in your
default browser; `--no-open` does the same and opens nothing.

## Updates

Every launch asks the release channel whether a newer build exists. If one
does, a bar across the top of the app window offers it: **Update now**, **Not
now**, or **Skip this version**. Nothing installs on its own, so an
unattended machine always comes up on the version it has. The control panel
shows the same banner, which is the one to use between matches if you said
not now at launch.

A release can be marked `required`. Those install themselves, behind a
progress curtain in the window, and that is the lever for pushing an urgent
fix.

In `--console` mode the same choice is a keystroke with a 15 second
countdown, and an unanswered prompt starts the version already installed:

```
  Update available: 0.1.0 to 0.2.0
  [Y] update now   [N] not now   [S] skip this version   starting in 15s
```

`--skip-update` or `SIDEWAYS_NO_UPDATE=1` turns the check off for one run.
`SIDEWAYS_UPDATE_URL` points the app at a different channel.

### Publishing an update

```
npm version patch          (or edit "version" in package.json)
npm run release -- --notes "What changed"
npm run release -- --required --notes "Fixes a scene that could air blank"
```

That builds the exe, writes `dist/update.json` with the build's SHA-256, and
publishes both as a GitHub release. Every installed copy reads
`releases/latest/download/update.json` on its next launch, so publishing the
release IS the rollout. A version that is not newer than what people are
running reaches nobody, so bump first.

The download is checked against the SHA-256 in the manifest before anything
is replaced, which catches a truncated or swapped asset. It does not protect
against a compromised release channel; only code signing would, and the build
is not signed yet.

## Build the app

```
npm install
npm run build:exe
```

Produces `dist/SidewaysStudio.exe` (about 94 MB). The build bundles the server
with esbuild, packs it and every asset into a Node single-executable blob, and
injects that into a copy of the Node runtime with postject. `web/` is embedded
at build time, so a change to the panel or a scene needs a rebuild before the
packaged app shows it. Running from source picks those files up off disk
immediately, so develop with `npm start` and rebuild to ship.

The exe is not code-signed. Locally built it runs without complaint, but a
copy sent over the internet will trip SmartScreen ("Windows protected your
PC": More info, then Run anyway) until it is signed.

## Run (development)

```
npm install
npm start
```

- Control panel: http://localhost:4700/panel/
- All graphics in one browser source: http://localhost:4700/output/
  (1920 x 1080, 60 fps)

Every graphic also has its own browser-source URL, listed with a Copy button
in the panel's Setup card and printed when the server starts.

`npm start -- --open` also opens the panel in your default browser, and
`npm start -- --window` opens the app window the packaged build opens (from
source the console is the default, since that is where you are working).
`SIDEWAYS_PORT` (or `--port=4711`) overrides the port, and
`SIDEWAYS_DATA_DIR` (or `--data-dir=...`) moves the data folder, so a second
copy can run beside a live one without sharing its autosave or its window
profile.

`npm test` runs the unit tests (Node's built-in runner, no dependencies).

## Panel layout

Graphics are listed in three folds: 1v1, 2v2 and Other (the bugs, the card
popup and the full screens). They start closed; a fold's heading says how
many of its graphics are in preview or on air, and putting a graphic in
preview opens its fold. Each row still carries an Overlay or Full frame
tag. Graphic features, Decklist, Look and Setup fold from their heading
too, and every control card can be dragged taller or shorter by the grip
along its bottom edge (double-click puts it back); the browser remembers
the folds and the heights. The card popup's search and staged card live in
Match data, under Event. TAKE and CLEAR stay at the top of their column
and the tip about them is TAKE's hover text; what is on air fills the
column from the bottom.

What is on air is listed under CLEAR, each row with an X that takes that one
graphic off air; a graphic's red ON AIR badge does the same thing from the
Graphics list. Preview is untouched either way, so TAKE puts the graphic
back. CLEAR still drops everything at once.

## Looks

The Look card in the control panel recolours every graphic: pick a preset
(Turn'em Sideways, Regional gold, Ember, Arctic, Mono) or set the accents,
ground, panels, frame, text and trim colours and a background (the arrow
shards, a solid, a gradient, an uploaded image, the TES plate photo, or
transparent) with grain and darkening. "All graphics" sets the look every
graphic inherits; pick one graphic and switch on "Own look" to give it its
own. Cleared colours fall back to each graphic's designed look. Changes air
at once, like the logo.

Image uploads, and where they are drawn:

- **Logo**: PNG or SVG with a transparent background, landscape, about
  720 × 440 or larger, under 2 MB. Scaled to fit, never cropped: 360 × 220
  on the 2v2 sidebar, 272 × 152 on the 1v1, 120 × 110 in the dual-column
  event block.
- **Background**: PNG, JPG or WebP under 6 MB, scaled to fill the surface
  and cropped. 1920 × 1080 for "All graphics" and the decklist; a portrait
  image (about 700 × 1080) for the dual columns and the 1v1 / 2v2 sidebars,
  since a landscape photo shows only its middle there; a wide strip for the
  score bug and card popup name plates. The panel names the surface for the
  scope you have picked, refuses files over the limit before uploading, and
  warns when an image is smaller than the surface.

The dual-column in-game overlay (`/scenes/igodual/`) follows the Regional
Qualifier broadcast layout: two player columns around a near-square table
camera, with the round clock, seed badges, the docked featured card and a
mirrored point track. Crop the table camera to roughly 1214 x 1080 between
the columns.

The 2v2 bars overlay (`/scenes/igobars/`) follows the Regional Qualifier
showmatch layout: team 1 on a bar across the top edge, team 2 across the
bottom, each with a legend tile, the team camera and the teammate's legend
tile hanging off it and the score as a badge on the camera's inner edge.
It reads the 2v2 teams block (teammate name, legend and champion) and
leaves the table camera full width; the tiles cover x 514 to 1406 for the
top 145 px and bottom 145 px of the frame. Team cam "Webcam cutout" cuts
the bar away behind the camera window for an OBS source.

### Graphics from the broadcast scouting

Six more graphics come from the September 2026 scouting of Pokémon,
Yu-Gi-Oh, One Piece, Magic and Flesh and Blood broadcasts. They are listed
under Graphics with everything else (the pillars, rows, hand fan and
showdown under 1v1, the arena bug and the slate under Other); their fields
sit in Match data's Player details, Hands and showdown, and Event folds,
and their source URLs are in Setup's browser source links.

- **Portrait pillars** (`/scenes/igoportrait/`): a portrait table camera
  in the middle (crop it to 830 x 1016 at x 545, y 64) with a game-state bar
  over its top (series pips, points, round and clock, with a chevron and a
  trim line on the active side) and a 545 px pillar per player: record and
  seed, country chip and name, a 489 x 275 camera well, the legend tile with
  the domain runes, archetype and hand count. The left pillar can open a
  second window for a hand camera; the right pillar docks the card popup's
  card at a size where the rules text reads.
- **Rows** (`/scenes/igorows/`): slim bars along the top and bottom edges,
  one player each (country chip, name, pronouns and record, a points box,
  legend, champion, archetype and runes; the round title and turn on the
  bottom bar), and a 330 px left column with both camera windows, the series
  dots, an active-turn mark and the cards-in-hand list with each card's
  cost, plus a "holds" line. The table camera gets x 330 to 1920, y 75 to
  1005.
- **Arena score bug** (`/scenes/arenabug/`): the wide-shot bug for stage and
  player cameras: eight numbered hexes per side lit up to each player's
  points, a games box, and a name bar with legend thumbnails, country chips,
  records and the round title, plus an event and round-clock lozenge top
  left. It replaces the score bug in preview when switched on.
- **Slate** (`/scenes/slate/`): full-frame hold screens. "Up next" lists the
  feature tables typed in Match data (one line each, see the field's
  tooltip), a standings strip from the seeds paste, the caster desk and the
  break clock; the other screens print a line (Starting soon, Be right back,
  Thanks for watching, or your own) with the same clock.

The turn counter, the active side and the break clock are cues like the
round clock: Next turn, Reset and the clock buttons act on air at once.

- **Hand fan** (`/scenes/handfan/`): one player's cards in hand as real
  cards fanned along the bottom edge, each badged Reaction, Action, Unit,
  Champion or Gear (the app reads that off the card's own text), with the
  other player's known cards small at the top and dashed slots for the
  unknown ones. "Showdown open" lights the reactions; a card marked played
  greys out and says so. Cards go in through the Cards in hand search in
  Match data; click a chip to mark it played, its × to remove it.
- The rows overlay's hand can be a plain list or **lanes by type**
  (Reactions, Actions, Units and gear) with an art strip per card.
- **The between-games set** (0.11.0): a **corner tag** ("Up next · match ·
  clock", top right, over anything), a **lower third** (casters, an
  interview name with a credential line, or "coming up"), the **match card**
  (both players with legend art, their cards, records, who chose first and a
  status line), a **player profile**, a **bracket** in four formats (top 8
  and top 16, single and double elimination, edited match by match under
  Match data), **standings** as a full-width table with the cut line, and a
  **result strip**. The slate's Starting soon, Be right back and Thanks
  modes carry the day's schedule, a camera window and the champion.
- **Showdown** (`/scenes/showdown/`): the cards played onto a showdown, in
  order, the newest lifted because it resolves first. Open it in Match data
  by picking the battlefield; then click a card in either Cards in hand to
  play it, Resolve top when it resolves, Close when the showdown ends. All
  of that acts on air at once. Open also switches the Showdown graphic on
  in preview (TAKE airs it), and the graphic's row under Graphics warns
  while it is in preview or on air with no showdown open, since it airs
  nothing until one is. "Strip" docks into the camera window of whichever
  in-game overlay is on; "Takeover band" is the full lower band with both
  cameras and hands over the battlefield's art.

## Decklists

The deck editor at http://localhost:4700/decklist/ is where decklists are
prepared: paste a list, fix any name the card database does not know (it
offers the closest matches), save it, and it appears as a one-click chip in
the control panel's Decklist card. Clicking a chip loads that deck into
preview; TAKE airs it, and the plate builds in on every swap.

- **PNG export**: GENERATE PNG in the editor, with or without the plate's
  background (the transparent version has true alpha). Drawn by the same
  scene the stream uses, in a hidden copy of Edge or Chrome, and saved in
  `data/decklist/` as well as downloaded.
- **A fixed-deck browser source**: COPY STREAM URL gives a URL with the whole
  list inside it (`/scenes/decklist/?list=...`), no panel needed.
- **A whole event's sheet**: Import deck sheet (CSV) takes a co-stream "Deck
  List Database" export, one deck per column, and saves every deck with a
  report of names it could not find. From source, the same sheet renders to
  PNGs in one go:

```
npm run decklist:batch -- --csv="C:\path\to\Deck List Database.csv"
npm run decklist:batch -- --csv=... --list          (inventory only)
npm run decklist:batch -- --csv=... --only=Viktor,Lux --transparent --no-sideboard
npm run decklist:batch -- --csv=... --strict --resume
```

## Layout

- `server/` — zero-framework Node server: static files, `/api/state`,
  `/api/update` (whitelist-sanitized), WebSocket hub at `/ws`.
- `web/stage/` — shared scene framework: sync client (version-gated repaints,
  reconnect + resync), occlusion-proof seek-clock animation, 1920x1080 stage
  geometry.
- `web/scenes/<name>/` — one folder per broadcast graphic.
- `web/panel/` — the operator control panel.
- `web/decklist/` — the deck editor. `web/shared/` — code the server and the
  browser both run (the decklist text format).
- `test/` — unit tests (`npm test`).
- `docs/SPEC.md` — locked product spec. `docs/LOOP.md` — build protocol and
  roadmap. `docs/PROMPT.md` — session prompt for the next build loop.
- `data/` — runtime autosave (gitignored).

## URL parameters (every scene)

- `?transparent=1` — transparent background for compositing over program
- `?anim=0` — kill switch: all motion snaps to settled state
- `?theme=` — reserved for the theming part
