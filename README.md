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
scene, the legend art and the whole card library are inside it. Every card,
every thumbnail and every legend cutout comes with the app, so card search,
the pickers, the decklist and the graphics work the first time it is opened,
on a machine that has never been online. New sets arrive with app updates.

The one thing not in the exe is the full-resolution card art, which is about
80 MB: press **Download all card art for offline use** in the control panel
once and it is kept in the `data` folder from then on, including across every
future update.

On first run the app creates that `data` folder beside itself for the card
art, downloaded fonts and the event autosave, so the whole thing is portable.
Copy the exe and its `data` folder to a USB stick or the venue PC and it
works there, offline.

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

Every release carries patch notes. They live in `CHANGELOG.md`, one
`## <version> (date)` section per release with the changes as bullets in
plain words. The app window shows them under **What's new** (the version
you are running first, the rest behind **All releases**), the update bar
quotes them, and `npm run release` uses the section for the version being
published as the GitHub release notes; it refuses to publish a version
that has no section, and `npm test` fails on the same gap. Write the
section, bump the version, then release.

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

The legend art rides along from outside the repo (it is Riot art): the hero
crops from `SIDEWAYS_HERO_DIR` and the full-figure cutouts the match card and
player profile draw from `SIDEWAYS_LEGEND_FULL_DIR`. The full figures are
baked from FlipDeck's high-resolution legend PNGs with
`py scripts/bake-legend-full.py` (about 8 MB for 49 legends); rerun it when a
new legend's art arrives, and add an alias there if its filename does not
reduce to the champion's name.

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
under Setup on the panel's Look and setup tab, and printed when the server
starts.

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
popup, the card row and the full screens). The star beside a graphic's name
keeps it in Favorites at the top; the chain beside the star copies that
graphic's browser-source link for OBS or vMix (the same link Setup lists). They start closed; a fold's heading says how
many of its graphics are in preview or on air, and putting a graphic in
preview opens its fold. Each row still carries an Overlay or Full frame
tag. The Studio's control band is three columns: Graphics, Graphic
features and Decklist. Graphic features and Decklist fold from their heading
too, and every control card can be dragged taller or shorter by the grip
along its bottom edge (double-click puts it back); the browser remembers
the folds and the heights. The card popup's search and staged card, and the
card row's four slots, live in Graphic features with each graphic's options.
Neither graphic goes into preview empty, so clicking one with nothing picked
opens its group there to pick from; the popup's search also shows while the
rows, dual-column or portrait pillar overlay is in preview docking the staged
card.
TAKE, CLEAR PROGRAM and CLEAR PREVIEW stay at the top of their column
and the tip about them is TAKE's hover text; what is on air fills the
column from the bottom.

What is on air is listed under the clears, each row with an X that takes
that one graphic off air; a graphic's red ON AIR badge does the same thing
from the Graphics list. Preview is untouched either way, so TAKE puts the
graphic back. CLEAR PROGRAM still drops everything on air at once, and
CLEAR PREVIEW takes every graphic out of preview (data kept) so the next
TAKE airs a clean frame.

Five graphics take a highlight: the card row (one to four cards side by
side over the look's ground, or over nothing with Background off; the star
beside a slot grows and lifts that card while the others shrink and dim),
the decklist (Highlight a card on the Decklist card lifts one card out
of the plate, larger and glowing, with the rest blurred and darkened; the
picker shows each card's art, ‹ › step through the list, and Highlight
on/off flicks it away and back with the card kept), and since 2026-09-19
the standings, the pairings and the legend distribution (below). All are
cues like the clock: they act on air at once, no TAKE needed.

## Looks

The **Look and setup** tab at the top of the control panel (beside
Studio) is where looks are made: the look controls run down the left the way
Match data does in the Studio, with Setup (the card database, browser source
links and updates) under them, and every graphic is laid out on the right as a
live tile, 30 in all (each graphic once, plus the variants worth judging a
look on: the slate's four screens, the lower third's three, the showdown's
strip and takeover, the dual columns with cards in hand). Tiles draw a
built-in sample match by default, so no graphic is judged empty; "Your
preview" switches them to the preview bank. Behind sets what shows through
the overlays (a transparency grid, dark, light, or a felt table), Size sets
the tile size, and the arrow on a tile enlarges it (Left and Right step
through, Esc closes). Click a tile to point the controls at that graphic;
"Back to all graphics" returns. A tile flashes when an edit changes it, and
the ones an edit would not reach fade (a graphic with its own look, while
editing all graphics). Tiles load as they scroll into view and unload when
you go back to the Studio.

The look controls recolour every graphic: pick a preset
(Turn'em Sideways, Regional gold, Ember, Arctic, Mono) or set the accents,
ground, panels, frame, text and trim colours and a background (the arrow
shards, a solid, a gradient, an uploaded image, the TES plate photo, the
glowing arrows of the Sideways Showdown head to head, or transparent) with
grain and darkening. The slate, the bracket, the standings and the VS head to
head stand on the glowing arrows by design, the first three darkened so
small type over an arrow still reads. "All graphics" sets the look every
graphic inherits; pick one graphic and switch on "Own look" to give it its
own. Cleared colours fall back to each graphic's designed look. Changes air
at once, like the logo.

The TES default font is **Aktiv Grotesk** wherever it is installed or
activated (Adobe Fonts), and Segoe UI where it is not; it is a commercial
font, so the app names it and never ships it. The Font and logo section
says whether this computer has it. **Download all fonts** saves every font
in the list on this computer at once, so any of them works at a venue with
no internet.

No name on a graphic is ever cut short with "...": a player, team, legend,
deck or event name too long for its box is set smaller until the whole
name fits, and goes back to full size when a shorter one replaces it.

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
the columns. The bottom of each column holds one thing at a time and slides
it out past the screen edge before the next one comes in: on the left the
event block or player 1's cards in hand; on the right the card frame,
player 2's cards in hand, or the card popup's card, which takes the place
from either while the popup is on (**Dock featured card**, on by default)
and gives it back when the popup goes off.

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
sit in Match data's Extended player details, Hands and showdown, and Event folds,
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
  cost. The table camera gets x 330 to 1920, y 75 to 1005. The middle of the
  column holds one thing at a time: the event logo with the round under it,
  the hands once a card is listed, and, with **Dock featured card** on (the
  default), the card popup's card while the popup is on. Whatever is there
  slides out to the left before the next one slides in, so staging a card
  takes the hands or the logo out and brings the card in over the column
  with its name and type, instead of the popup flying in over the table;
  taking the popup off brings them back.
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
  unknown ones (the hand count less the cards listed; there is no separate
  unknown counter). "Showdown open" lights the reactions; a card marked played
  greys out and says so. Cards go in through the Cards in hand search in
  Match data; each card is a row with its picture, and reactions and actions
  light up in the player's colour. Click a row to mark it played, its × to
  remove it.
- The rows overlay and the dual columns list a hand in the order the cards
  were typed, copies on one row with a count (2x, 3x), as a plain list or
  **marked by type** (reactions green, actions blue). **Card art** puts a
  strip of each card's art beside its name in either style. A hand longer
  than its box scrolls: five seconds at the top, down to the last card, five
  seconds there, back up.
- **The between-games set** (0.11.0): a **corner tag** ("Up next · match ·
  clock", top right, over anything), a **lower third** (casters, an
  interview name with a credential line, or "coming up"), the **match card**
  (both players with legend art, their cards, records, who chose first and a
  status line), a **player profile** (switches for its live camera window
  and for the player's decklist down the left), a **bracket** in four formats (top 8
  and top 16, single and double elimination, edited match by match under
  Match data), **standings** as a full-width table with the cut line (its
  rows come in one after another from the top, and a page change slides the
  old page out and the next one in from the side you paged toward), and a
  **result strip**. The slate's Starting soon, Be right back and Thanks
  modes carry the day's schedule, a camera window and the champion.
- **Standings legends** (0.29.0): each player's legend portrait (the
  legend's face) sits before their name and the legend's name has its own
  column to the right. The **Legends** switch in the standings' Graphic
  features turns both off, for an event whose legends are not known yet;
  with it on, a note under the switch says when some rows have no legend.
- **Pairings** (`/scenes/pairings/`, 0.29.0): every table of a round, 32 a
  page in two columns of 16. Each table reads across: the table number, the
  player (legend portrait, name, then their record going into the round and
  their legend), VS or the result, and the opponent mirrored. A finished
  table shows its games with the winner's in the accent colour and dims the
  player who lost; a draw says so. Records are left off when every one is
  0-0 (a first round), and the byes and how many tables have finished run
  along the foot. The Tournament platform tab loads a whole round (or one
  group of it); by hand, type one table a line under Match data ›
  **Pairings**: `Table 12: Dax (US, 2-1) [Viktor] vs Shoji (KR, 2-1)
  [Yasuo] = 2-1`, with `= draw` for a draw, `= W-L` or `= L-W` for a win
  with no games reported, and a `Bye: Name, Name` line. Graphic features
  pages it and has the **Legends** and **Results** switches. Its pages turn
  the way the standings' do.
- **Standings by group** (2026-09-19): rows can carry a group, and the
  graphic shows one group at a time with the group's name beside the title
  (`scenes.standings.group`, the first group when it is empty or gone).
  The **Group** buttons beside the standings' page arrows switch groups;
  **›** runs on from a group's last page into the next group's first and
  **‹** back into the previous group's last. By hand, a line `# Group 2`
  starts a group. Every list is kept sorted by points, or by record (win
  3, draw 1) when it has no points, highest first, ties in the order they
  came; a list with no points leaves the Points column empty.
- **Highlights on the standings and the pairings** (2026-09-19): the
  **Highlight** search under each one's Graphic features finds a player
  (standings) or a table by its number or a player at it (pairings). A
  highlighted standings row takes a wash of the accent colour and a bar
  down its left edge and grows a little, its name and numbers a size up; a
  highlighted table grows in its column, its names, portraits, number and
  result a size up, the column's other tables giving up the room. The rest
  dim in both. It happens on air at once, and the graphic turns to the
  group and page the player or table is on. Up to eight at a time, each a
  chip under the search (a click takes it off; Clear takes them all). A
  highlight names the player or the table, never a row, so it stays put as
  the standings re-sort and the Tournament platform brings results in.
- **Ongoing matches** (`/scenes/ongoing/`, 2026-09-19): the pairings'
  tables that have no result yet, for the wait at the end of a round. Up to
  12 tables sit in one 1400px column whose rows grow to fill it (up to 1.9
  times a pairing row), more in the pairings' two columns (up to 1.25
  times), 32 a page. A table shows VS, or its games so far when the platform
  has them. With the Tournament platform's **Keep results up to date** on,
  a table leaves the board on air the moment its result is in.
- **Head to head, VS** (`/scenes/vscard/`, 0.27.0): the Sideways Showdown
  head to head, laid out from its PSD. Each player's legend card stands
  tilted either side of a big VS on the glowing-arrows ground, the upper
  name (player 2) over the right card and the lower name (player 1) across
  the left one, the round and the event name underneath, and the theme logo
  between the cards. Arial Black and Arial as designed, unless a font is
  picked under Look. A player with no legend card shows a dark card naming
  the legend. It sits beside the match card, which is unchanged.
- **Legend distribution** (`/scenes/legendstats/`, 0.28.0): the most played
  legends as a pie on the left and a table on the right, each legend's face,
  name, share of the field and win rate. The pie runs clockwise from twelve
  o'clock in the table's order with the faces on the slices that have room
  for them. **Slices** (Graphic features) decides which legends get one:
  every legend two or more players brought (the default, since 2026-09-19;
  the one-player legends fold into a grey Other that counts them), every
  legend, or the top 8 down to 3 with the rest in Other. Past the eighth,
  a slice is Other's grey: eight colours is as many as stay apart. **Win
  rate** switches the column off, and
  the note under the graphic saying how the win rates were counted with it.
  A table longer than nine rows **rolls** (2026-09-19): five seconds at the
  top, down at a reading pace, five seconds at the bottom, then back up and
  round again with **Loop** on, or it stays at the bottom with Loop off. It
  starts by itself as the graphic goes on air (**Start on its own**), and
  **Start**, **Pause**, **Stop** (back to the top) and **Restart** under
  Table roll act on air at once, with **Speed** slow, normal or fast. The
  legend chips under **Highlight** (or ‹ ›) highlight a legend: its slice
  comes out of the pie and grows with its face while the others step back
  and dim, and its row lights up in its colour; a rolling table holds with
  that row in view until the highlight comes off.
  Fill it under Match data › Legend distribution: one legend per line with
  how many played it and its win rate or record (`Kai'Sa | 42 | 55.1`,
  `Jinx | 30 | 45-37`), a share with a % sign for a list of percentages, or
  one legend per player and the lines count themselves; **Players** sets
  the field size when the lines list only some legends. **Count from
  standings** counts Match data › Standings, and the Tournament platform tab
  loads it from TopDeck. The slice colours are a fixed set checked for
  colour-blind viewers against the graphic's panel, so a look leaves them.
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

## Players' decks, battlefields and the game intro

Match data › **Decks and battlefields** holds each player's own deck and the
three battlefields they brought. Pick a saved deck (the deck editor saves
them) or paste a list; loading a deck fills that player's three battlefields
from its Battlefields section, or pick them by hand. **Populate from
decklist** fills that player's legend, champion and three battlefields from
their list in one press, as if each were picked by hand (the champion is
also staged as their featured card). **This game** makes one
of them the battlefield in play (it becomes the player's Battlefield and is
marked played); the arrow clears the played marks, and Reset match does too.

- **Rows overlay battlefields** (Graphic features › rows, Battlefields): Off,
  This game's, or All three, played marked. They sit in a strip of their
  own beside each player's camera (under player 1's, over player 2's), apart
  from the hands: the three side by side with an arrow on this game's and
  the ones played earlier greyed out.
- **Sideboard fly-in** (1v1 graphics): both players' sideboards at once,
  player 1's across the top of the game flying in from the left, player 2's
  across the bottom from the right; or one player alone. Both plates span
  the game area at one card size, as large as fits. A player whose list has
  no sideboard is left out.
- **Decklists side by side** (Between games, full frame): both players'
  lists with legend, runes, champion, battlefields, the main deck and,
  optionally, the sideboards.
- **Game intro** (1v1 graphics): the round and the game number over both
  players' legend (the legend card's painting, one size for both, a VS
  between them), name, champion and this game's battlefield, built in over
  about two seconds. The game number counts from the game wins unless
  pinned under Graphic features.

The game intro and the sideboard fly-in fit themselves into the table area
of whichever in-game overlay is up (the rows, the dual columns, the pillars,
the bars, the sidebars, the POV) and take the whole frame with none. They
play underneath the overlay: add their browser sources below your in-game
overlay's (the combined /output/ source already stacks them that way). Each
also clips itself to the table area, so its plates come out from under the
overlay's panels however the sources are layered.

## Tournament platform (TopDeck.gg)

The **Tournament platform** tab at the top of the panel connects a live
TopDeck.gg event. Paste the event's link (or its id, like `convergence-3`)
and press Connect. An API key is optional: with one (free, from TopDeck's
developer portal) the data comes from TopDeck's API; without one, from the
event's public page. A pooled event's groups always come from the public
page, since the API does not carry them. The event is read again every 30
seconds while **Every 30 s** is on.

**Matches** lists every table of the chosen round (the newest by default),
with a group filter and a player search. Click a match and both players load
into preview at once: name, record going into the round, legend, pronouns,
seed (bracket), and, once TopDeck shows decks, the list, champion and three
battlefields; the round title becomes "Round 3 · Group 2" or "Semifinals".
A new pairing starts at 0 points and games and clears the last players'
hand-typed extras (team, store, finishes, hand); clicking the pairing that is
already up keeps what you have counted. A finished table brings its game
score. **Swap sides** reloads it with the players the other way round, and
**+** adds a table to the Up next board.

**Standings to preview** writes every group's standings at once ("Every
group"; the Studio switches between them beside the page arrows), one
group's, or everyone in one list, labelled "after Round 3", or "Round 4 in
progress" while that round's tables are being played. TopDeck's own points
and tiebreaks are used while they agree with the finished tables; during a
round TopDeck's standings still stand before it, so the app counts the
tables itself until they catch up. A round's byes count with its first
finished table. **Pairings to
preview** writes every table of the round picked under Matches (only the
picked group's, when a group chip is on) with each finished table's result
and the round's byes; press it again during the round to bring in new
results (a different round or group starts on page one, the same one stays
on its page). The same tables feed the **Ongoing matches** graphic. With
**Keep results up to date, on air too** on (the default), every refresh
brings new results into the pairings preview and program already hold,
each in its own bank and without a TAKE (`event.pairings.src` names the
event, round and group they came from; typed tables have none, so they are
never touched). **Bracket to
preview** writes the Top 8 or Top 16 as TopDeck ran it. **Legend
distribution to preview** counts the whole event or one group: how many
players TopDeck lists for each legend, and each legend's win rate against the
others, with mirror matches, draws and byes left out. TopDeck shows legends
once the event ends or the organizer allows it; until then the button says
so. Everything lands in preview; TAKE airs it. The right side shows every
graphic that draws this data, from the preview bank, so a click shows at
once what it filled.

The event, the key and the refresh switch live in `data/platform.json`. The
key never goes into the state the graphics receive, and the panel only
shows its last four characters. Data provided by
[TopDeck.gg](https://topdeck.gg); their API asks for that credit.

## Live game (RiftAtlas)

**Live game**, the first fold of Match data, reads a game on RiftAtlas (the
online simulator Convergence is played on) the way RiftAtlas's own casting
studio shows it, and writes it into Match data as it is played. It needs a
RiftAtlas account with the caster role.

Type the room code (the letters after `room=` in the caster link, or paste
the whole link) and press **Connect**. The app opens the casting studio for
that room in a copy of Edge that runs out of sight and reads what the page
receives; it follows a best of three from one game's room to the next by
itself. From then on points, game wins, both players' hands (the casting
studio sees every card), hand counts, the battlefield in play (marked played
in the player's pool), legend, champion, the turn counter and whose turn it
is follow the game. **Cards played** lists the latest cards with who played
them; click one to stage it in the card popup, or switch on **Stage each
card played in the card popup** to have each card staged as it is played.

**Live values straight to air** (on by default) writes those values into
preview and program together, like the clock, while the players on air are
the players in preview. Load a new pairing into preview (Tournament
platform, or typing) and the values wait in preview until TAKE; switch it
off to keep everything in preview. Names never change on their own, so the
names the Tournament platform loaded stay. **Load players** brings
RiftAtlas's names, legends, battlefields and each player's full deck (as a
decklist paste) into preview, for a match nobody loaded from TopDeck. Sides
follow the names already in Match data when they match; **Swap feed sides**
turns the feed round otherwise.

**Signing in.** Press **Sign in** and RiftAtlas opens in a normal Edge
window. Sign in there with the account that has caster access, wait for the
casting studio, and close the window: the reader starts on its own. Google
refuses to sign anyone in to a browser the app can read, which is why
signing in has a window of its own; RiftAtlas keeps the session after that,
and the reader uses it with no Google involved. The sign-in lives in
`data/riftatlas` (a browser profile of its own, like the app window's);
delete that folder to forget it. **Show the RiftAtlas window** runs the
reader in a visible window, to watch what it is reading. The room is
remembered but not reconnected when the app starts, so yesterday's game
never pours into Match data: press Connect.

The app sends RiftAtlas nothing of its own: the page does its own talking and
the app only reads what it receives. That is RiftAtlas's own realtime data,
which RiftAtlas can change whenever it updates; the room line says when the
app cannot follow. 1v1 rooms only for now.

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
- `?tile=<key>` — the Look and setup tab's tiles: this graphic on its own (every
  other graphic off, so nothing docks) in that tile's variant
  (`web/shared/looktiles.js`). Panel use only, never a browser source.
- `?sample=1` — draw the built-in sample match (`GET /api/sample`,
  `server/sample.js`) instead of the event's data; the look stays live.
  Panel use only.
