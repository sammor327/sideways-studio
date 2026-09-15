# LOOP.md — the loop-engineering protocol

Sideways Studio is built in parts, one loop per session. Each loop ships work
AND reviews the build through a different persona's eyes, so QA angles rotate
instead of one agent rediscovering its own blind spots.

## Protocol (run this every loop, in order)

1. **Ingest Sam's feedback** from the message that opened the loop. Triage
   every item: fix now, backlog (add below), or push back with a reason.
2. **Persona review.** Pick the next unused persona from the roster (Sam may
   name one instead). Actually RUN the software (`npm start`, open the panel
   and scene URLs, click things, break things) in that persona's voice. Do not
   armchair-review from source. Produce: findings ranked by severity, and 3-5
   critical questions only Sam can answer. Ask them (AskUserQuestion is fine).
3. **Build.** Implement the agreed fixes plus the next roadmap part.
4. **Verify.** At exactly 1920x1080 with no scrollbars; with `?transparent=1`;
   with `?anim=0`; and the reconnect path (kill the server mid-view, restart,
   confirm the scene recovers without blanking). getComputedStyle over reading
   source. The occluded-source case needs a real hidden tab, not an unfocused
   one.
5. **Log.** Append a loop entry below, update PROMPT.md's "Current status",
   update the roadmap, and suggest a commit (`Loop N: <what shipped>`).

Rules that bind every loop: SPEC.md decisions are locked; the seek-clock
animation pattern and sync contract are mandatory (SPEC.md); no em dashes in
UI copy; every image slot gets a fallback; never ship a blank-frame failure
mode.

## Persona roster

Rotate top to bottom unless Sam names one. Mark used personas with the loop
number. Each persona's question style is the point: ask what THEY would ask.

| # | Persona | Angle | Used |
|---|---------|-------|------|
| 1 | Dana, first-time LGS TO | Non-technical. What do I double-click? Where do I paste the URL? Why is my graphic not showing? Reads nothing, clicks everything. | 1 |
| 2 | Marcus, esports broadcast producer | Ran real shows. Cueing discipline, what breaks 3 hours in, fail-safes, wrong-graphic-on-air recovery, muscle-memory hotkeys. | 2 |
| 3 | Priya, OBS power-user streamer | CPU/GPU cost per source, source lifecycle settings ("shutdown when hidden"), transparency edge cases, multiple sources of the same scene. | 3 |
| 4 | Geoff, vMix operator | vMix browser input quirks: alpha handling, input restarts, fps caps, how vMix differs from OBS CEF. | 4 |
| 5 | Lena, play-by-play caster | Glanceability on the program monitor, information hierarchy, can she read the score at 936p in her peripheral vision. | 5 |
| 6 | The player at table 3 | Is my name spelled right, is my legend correct, how fast can the operator fix it between games. | |
| 7 | Phone viewer | Watches the stream at 360p on a phone. Which text survives, which is soup. | |
| 8 | Rival TO running "Vex Events" | Wants zero TES on screen: their logo, their colors. How deep does theming actually go, what still leaks brand. | |
| 9 | Venue IT / security skeptic | Unsigned exe, SmartScreen, firewall prompt, which port, what data leaves the machine, why should I run this on the venue PC. | |
| 10 | Accessibility reviewer | Contrast ratios on plates, reduced-motion behavior, keyboard-only panel operation, focus visibility. | |
| 11 | Solo grinder operator | Streams, judges, AND plays. Click economy, giant touch targets, undo for misclicks, what happens when they fat-finger score +1 on air. | |
| 12 | Staff engineer code reviewer | State races, double-open panels, error paths, sanitizer bypasses, what breaks under rapid-fire clicking, code health. | |
| 13 | Hostile input tester | 40-char emoji/CJK names, garbage decklist pastes, two panels fighting, 20 clicks a second, script-tag names. | |

After all 13 are used, restart the rotation: the software will have changed
enough that persona 1 sees a different product.

## Roadmap (build order; one part per loop, roughly)

- [x] **Part 1 — Scaffold** (this repo state): server + whitelist state store +
  WS hub + stage framework (sync client, seek clock, stage geometry) + score
  bug scene + panel with match controls. Verified end-to-end 2026-08-09.
- [x] Part 2 — Card database: first-run downloader from Rift Registry surfaces
  (browser UA + Referer, local cache, proxy through server), card search API,
  card popup source + POV card-slot engine. Shipped Loop 1, verified 2026-08-09.
- [x] Part 3 — IGO 1v1: bake plates from `IGO-V2-PREPPED.psd`, webcam/legend
  toggle, ticks, names/battlefields. Shipped Loop 3, verified 2026-08-10.
- [x] Part 4 — IGO 2v2 (plates from `IGO-2v2-V1-Prepped.psd`, team names).
  Shipped Loop 4 with the same webcam/legend toggle as 1v1 (Sam's call),
  verified 2026-08-10.
- [x] **Part 5 — POV overlay**: PSD-baked gold columns, live card, legend and
  battlefield art, five text lines placed on the PSD baselines, per-side show
  flags. Shipped Loop 5, verified 2026-09-02.
- [x] **Part 6b — IGO dual columns** (2026-09-14, out of roadmap order on
  Sam's ask, from the RQ overlay teardown): the Regional Qualifier grammar
  as a live HTML scene with seed badges, the round clock, the docked card
  and the mirrored point track. Event name and round title got their panel
  rows with it.
- [ ] Part 6 — Head-to-Head (auto cards from legend assignment, round titles).
- [ ] Part 7 — Bracket (Top 8 / Top 4, legend portraits, series scores).
- [ ] Part 8 — Standings (manual pages, CSV/paste import, dropped-player
  status marks) + Riot attribution line component for full-frame scenes.
- [x] **Part 9 — Decklist**: FlipDeck's `src/lib/decks/parse.ts` ported to
  `server/decklist.js`, names resolved against the local card index, and a
  card-grid plate scene. Shipped 2026-09-04, out of roadmap order on Sam's
  ask. Revamped 2026-09-11 to FlipDeck's plate brief: the plate now matches
  `Plate.tsx` to the pixel (measured against the reference render), with its
  build-in, a deck editor page, a saved-deck library, PNG export and a batch
  CLI.
- [~] Part 10 — Timers: the round clock shipped with Part 6b (start /
  pause / reset / set, a cue on both banks, drawn by the dual overlay).
  Still open: a clock element for the other overlays and the score bug.
- [x] Part 11 — Theming: pulled forward to Loop 2 on Sam's feedback (accent
  color pickers, logo upload, curated Google Fonts downloaded + cached for
  offline). Leftovers moved to backlog: event name/round title fields,
  per-URL `?theme=` override. **Extended 2026-09-14 into the look model**:
  every graphic's colours and background, globally or per graphic, with
  presets, image uploads and the PSD chrome re-baked into recolorable masks.
- [ ] Part 12 — Event files (save/load named events, New Event flow).
- [ ] Part 13 — OBS/vMix illustrated setup guide page + onboarding polish.
- [x] **Part 14 — Packaging**: `npm run build:exe` produces a self-contained
  94 MB `SidewaysStudio.exe` (Node SEA + esbuild + postject; Bun was not on the
  machine and SEA needed no new toolchain), double-click opens the panel, the
  console is the status window, drawn icon and version info stamped. Shipped
  alongside Loop 5, verified 2026-09-02. Code signing is left to Part 15.
- [~] Part 15 — Distribution polish: the update channel and versioning are
  done (launch check with skip, panel banner, `npm run release`); still open
  are the README for TOs, the font decision, and code signing.

## Backlog (triaged, not yet scheduled)

- Distributable display font to replace the Segoe placeholder (brand.css).
  The curated Google Fonts picker (Loop 2) may settle this: pick a default.
- Panel keyboard shortcuts for score/ticks. Marcus demanded them Loop 2; Sam
  chose "no hotkeys yet". Solo-grinder persona will re-raise.
- Event name + round title panel fields (state exists, no UI; Part 6
  Head-to-Head needs them).
- Per-URL `?theme=` override (Part 11 leftover; state theme is global now).
- TAKE is a hard cut; consider fade/wipe transition styles on the bus later
  (vMix parity, Geoff/Priya loops may ask).
- Vendetta CARDS: Rift Registry's live index carries the set as of
  2026-09-11 (936 cards, 169 of them VEN), so "Check for new sets" brings
  them into the popup search, the decklist and the POV champion picker. An
  install that has not re-synced still lacks them. The supplemental legends
  list in server/legends.js can be pruned once a synced index is confirmed to
  cover all nine. A tcgcsv merge (FlipDeck's catalog.ts) stays the fallback
  for a future set RR is slow to add; tcgcsv had no singles yet for the
  Radiance or Legacy groups on 2026-09-11.
- Vendetta hero art: all 9 champions fall back to their existing 1-suffix
  PNGs; champions gaining a second legend want proper 2-suffix variants in
  IGO-LEGENDS when the art exists.
- (Done 2026-09-14) Plate chrome now repaints from the look: the PSD layers
  are alpha masks per role, see `scripts/bake-looks.py`. The older
  `bake-igo.py` / `bake-igo2v2.py` write a `plate.webp` nothing loads any
  more; `bake-pov.py` still produces the cover gradients and the
  `?debug=psd` reference.
- Headless Edge 152 exits at once with code 0 on this machine (2026-09-14),
  so the decklist PNG export and the still renderer fail with "the headless
  browser exited (0)" until `SIDEWAYS_BROWSER` points at Chrome. Worth a
  Chrome-first fallback in `server/still.js` (try the next candidate when
  one exits before answering), and a panel message that names the fix.
- The dual overlay's image background is one photo per column, cover-fit
  to 350x1080, so a landscape photo shows a narrow slice. A per-column
  focal-point control, or a "span both columns" mode, would help.
- The dual overlay docks the card popup's card; the popup's own position
  still collides with the 1v1 sidebar (below).
- Card popup default side collides with the IGO sidebar; /output/ supports
  ?popupside=left. Consider auto-mirroring the popup when the IGO is on.
- Two open panels can fight over optimistic counter state (each panel now
  mutates its local copy before posting). Single operator is v1 scope; the
  staff-engineer persona loop should decide whether to version-stamp posts.
- carddb in-memory cache counts go stale if art files are deleted on disk
  while the server runs (route still 404s cleanly, scene falls back; counts
  reseed on restart). Cosmetic.
- Two RR token cards (SFD-T01/T02 Mech, Sand Soldier) have only TCGPlayer
  hotlinks, which 403 server-side; popup shows the named placeholder. Revisit
  if Rift Registry adds native art for them.
- IGO 1v1's `.hero.icon-tier` has the content-box padding bug the POV scene
  just fixed: `padding: 14px` on a `width: 100%` element pushes the icon cutout
  28px past the 261px holder. One line (`box-sizing: border-box`), but it only
  shows for a legend with no hero PNG, so it wants its own verification pass.
- Vendetta champion units were missing from the Rift Registry card index, so
  the POV champion picker found none for those legends. The live index has
  them as of 2026-09-11 (see the Vendetta CARDS entry): a re-synced install
  should find them; the "champion name shown on air" field remains the
  workaround for one that has not.
- A Battlefield card staged into the POV featured card slot renders portrait,
  because battlefield art is stored rotated and that slot is a fixed portrait
  frame. Correct, but it can read as a bug from the caster's chair.
- The POV usable text run is a single 200px budget for all four lines. The
  player band is actually wider than the framed boxes, so a long player name
  shrinks earlier than it strictly needs to. Kept uniform on purpose: four
  stacked centred lines that shrink at different thresholds look arbitrary.
- The packaged exe is unsigned, so a copy that arrives over the internet
  trips SmartScreen. Needs a code-signing certificate; Part 15 distribution.
  Signing also matters more now that the app updates itself: the SHA-256 in
  the manifest proves the download is intact, not that the channel is honest.
- The update channel points at github.com/sammor327/sideways-studio, which
  does not exist yet. Until the first `npm run release`, every launch check
  gets a 404 and carries on silently, which is the designed behaviour but
  means the feature is inert.
- An update installed from the panel restarts the app, so the browser sources
  drop and reconnect. Fine between matches, not during one. The banner says so
  and the button confirms first, but a "remind me after this match" would be
  better than relying on the operator reading it.
- `web/` is embedded in the exe at build time, so packaged builds need a
  rebuild after any panel or scene edit. Running from source is unaffected.
- The build hardcodes the same hero-art path as `server/legends.js`. Anyone
  building on another machine needs `SIDEWAYS_HERO_DIR` set, or the exe ships
  without hero cutouts (it warns and carries on).
- A Battlefield card listed in the decklist MAIN deck renders portrait in the
  grid; only the battlefield pills rotate. Correct for the stored art, odd to
  read.
- The decklist backdrop (`web/assets/decklist/background.jpg`) is the TES
  plate background with its green arrow shards. The label rails and pill
  borders follow the theme accent, the backdrop does not. A rival-TO persona
  will want a per-event backdrop upload next to the logo upload.
- The saved-deck library lives in `data/decklists.json`, outside event.json.
  Part 12 (named event files) must save and load it with the event, or a TO
  who preps two events loses one set of lists.
- PNG export drives the machine's own Edge or Chrome headlessly (every
  Windows 10/11 install has Edge; `SIDEWAYS_BROWSER` points at another
  Chromium). If neither exists the editor says so and the rest works.
- /output/ and the monitors stack the decklist under the IGOs and the POV. A
  full-frame plate with its backdrop on arguably belongs above the overlays;
  today an operator who leaves an IGO up gets its sidebar over the deck.
- A deck swap on air waits up to 1.5s for art that has never been downloaded
  (the old plate stays up meanwhile). Lists saved in the deck editor are
  already warm; a list pasted straight into the panel may not be.
- FlipDeck's own live decklist page holds frame 89 with the build-in still
  switched on, so on a list of about 20 or more distinct names the rune
  counts freeze part-faded, and past about 29 the last one never appears.
  Sideways Studio computes the intro length from the latest delay instead.
  Worth porting back to FlipDeck.
- Monitor iframes add 4 WS clients per open panel; interplay with OBS
  "shutdown source when not visible" on the real scene URLs is untested until
  the Priya (OBS power user) loop.

## Loop log

### 2026-09-14e (out of band: folds start collapsed, a graphic opens its own)

Sam: every collapsible section starts collapsed, and putting a graphic in
preview should open the sections it needs and highlight the relevant data.
The Match data folds and the Setup sections no longer remember their state
(the localStorage keys are gone); all start closed on every load.
`revealNewGraphics` runs after each render: it diffs the set of graphics
visible in preview against the last render, and for the newly added ones
collects the fields they draw (through `sceneDraws`, so a dual overlay with
its event block off does not open Event), opens every fold holding one of
them, flashes those rows for 1.6 s (rows outside the folds flash too, so
the score bug lights points and names) and scrolls the first into view.
The first render only records the set, so a reload never flashes. Manual
toggles still work within the page's life.

### 2026-09-14d (out of band: panel layout after 0.6.0, Sam's five asks)

1. **A picture toggles.** Clicking a graphic's thumbnail while it is in
   preview takes it out again (`toggleScene`); otherwise it goes in with the
   same exclusivity rules as before. The tile's title says which.
2. **Kind tags.** Every Graphics row carries OVERLAY or FULL FRAME after its
   name (decklist and slate are the full-frame ones).
3. **Graphic features card.** The per-graphic options left the Graphics
   rows for a card of `.feature-group[data-scene]` blocks that show only
   while that graphic is in preview (`renderFeatures`, from `renderThumbs`),
   with a hint when nothing in preview has options. The option controls keep
   their ids, so nothing else in panel.js changed.
4. **Match data folds.** 2v2 teams, Experimental overlays and Event are
   `<details class="field-section fold">` with the section label as the
   summary; open state remembered per browser in `sidewaysStudio.dataOpen`.
   The dimming code still finds `.section-label` inside the summary.
5. **Staged card.** The card search and the staged box moved out of
   Graphics into their own "Staged card" card. The middle column is now a
   `.column-stack`: Graphic features, Decklist, Staged card.

### 2026-09-14c (out of band: experimental graphics, graphic thumbnails, collapsible Setup)

**Sam's asks.** (1) An "Experimental" switch under Setup that decides
whether the four overlays from the broadcast scouting (report "Four Games,
One Frame", mocks "Riftbound Overlay Mocks") are listed under Graphics.
(2) A small live picture of every graphic in the Graphics card; clicking it
puts that graphic in preview. (3) Setup split into collapsible sections:
links, check for updates, experimental.

**Experimental switch.** `theme.experimental` (setup data, saved with the
event, never bussed). On: the four scene rows, their focus chips, the
"Experimental overlays" block in Match data and their source URLs show.
Off: they hide and the four go off in preview in the same patch; program
keeps what it airs until TAKE or CLEAR (the Setup hint says so). A focus
chip pinned to an experimental graphic falls back to "In preview" when the
switch goes off.

**Thumbnails.** Every `.scene-row[data-scene]` gets a 150x84 tile holding
its scene at 1920x1080 scaled by CSS transform, loaded from
`/scenes/<key>/?transparent=1&preview=1&force=1&anim=0`. `force` is a new
stage param (stage.js) that renders a scene as if switched on, honoured by
all twelve scenes (one line each) and never on a broadcast URL. The tile's
border says in preview (green) or on air (red ring); the tag under it says
which, or "Nothing staged" for a popup with no card and a decklist with no
list, where a click focuses the search instead. Click = show in preview
(the edge scenes still switch each other off; the arena bug and the score
bug swap). Experimental tiles only load their iframe while the switch is
on, so a hidden row costs no Chromium frame.

**Four scenes, live HTML on the look model** (`LOOK_SCENES`, `DESIGNED`,
`SCENE_LABELS`, monitor and output stacks): `igoportrait`, `igorows`,
`arenabug`, `slate`, ported from the scratch mocks. Shared helpers in
`web/stage/exp.js`: clock arithmetic, canvas-gauged text fit, rune glyphs
from `/assets/runes/`, a legend-domains lookup (the legends API now carries
`domains`), and the show/hide clock dance. Geometry is in each scene.css
header. The rows scene's hand list draws costs from the stored card
entries, so the scene needs no catalog; the panel's hand search stores
energy and domains from the ranked search.

**State.** Side: record, country (2-3 letters, uppercased), pronouns,
archetype, handCount (0-20), hand[] (12 cleaned cards), holds. Match:
activeSide, turn, driven by a `turn` cue (next alternates the side, prev,
reset, set, side). Event: roundsRemaining (0-99), countdown (second timer,
`timer` action with `which: 'countdown'`), tables[4] (label + two cleaned
identity blocks), casters[4], seeds (multiline, 800). Scenes: igoportrait
{mode, topBar, handCam, cardWell}, igorows {mode, hand}, arenabug {clock},
slate {mode in SLATE_MODES, text, countdown}. mergeBank layers the new
event and side shapes over older saves. 8 new tests
(test/state-experimental.test.js); 63 pass.

**Panel.** Match data gains the Experimental overlays block (record,
country, pronouns, archetype, hand count counter, cards-in-hand search with
chips, holds, the turn row with Next turn / active side / reset, rounds
left, the break clock, and three pastes: up-next tables one line each
("Table 1: Shoji (KR, 8-2-0, 3rd) [Yasuo, Unforgiven] vs Margaux (FR,
7-3-0, 6th) [Jinx, Loose Cannon]", the legend resolving against the
catalog; the text is rewritten in that shape once it lands so what
resolved is visible), casters "Name - Role", and seeds). SCENE_FIELDS and
sceneDraws cover the four so dimming stays honest. Swap sides and Reset
match carry the new fields; reset also resets the turn cue.

**Setup.** Three `<details>` sections (links, updates, experimental), open
state remembered per browser in `sidewaysStudio.setupOpen`; the card
database status and downloads stay above them.

**Verification.** Second server on 4713 with a scratch data dir (the card
index, thumbs and a few full-art files copied in; the flipdeck launch.json
entry is `sideways-studio-exp`), seeded through `/api/update`, all four
scenes captured through `server/still.js` (Chrome) with `?preview=1&force=1`
and read: pillars, hand cam hole, docked card, runes, both clocks, turn
label, hex track, tables with hero cutouts, seeds strip, casters. Panel
captured headlessly at 1920x1700 to read every card.

### 2026-09-14b (out of band: the 2v2 bars overlay, offline curtain, favicon)

**Sam's asks.** (1) When the app closes, the panel must say so: an
"OFFLINE: RESTART THE APP TO CONTINUE USAGE" error instead of a page that
keeps taking clicks into the void. (2) The app's icon as the browser tab
favicon. (3) The 2v2 overlay from the Singapore Regional Qualifier
showmatch stream (OfflineTV / Disguised Toast sealed 2v2), modelled on the
frame Sam sent.

**Offline curtain.** `web/shared/offline.js`, raised by the panel's and
the deck editor's connection status (`setStatus` / `setConnected`), lowered
by their reconnect loops, with the tab title prefixed OFFLINE meanwhile.
An update restart (`update.phase === 'ready'`) gets a softer "Restarting
for the update" line for 30 s before falling through to the hard error, so
the planned outage never tells the operator to relaunch. Repeated
disconnect calls are no-ops so the reconnect loop cannot reset that grace
period. Verified on a live tab: kill the server, curtain up with the exact
text; restart, the same page instance clears it and the title returns.
Scenes deliberately show nothing: a browser source must never air an error.

**Favicon.** `scripts/make-icon.py` now also writes `web/assets/favicon.ico`
(48/32/16) from the same mark as the exe icon; committed so a source
checkout has it, and under web/ so the packaged build bundles it. Every
page under web/ links it.

**2v2 bars, `igobars`.** Third in-game scene on the look model, live HTML,
no PSD. Geometry from the reference frame at 1080p: bars y 0..54 and
1026..1080 with the trim rule on their inner edges; a cluster hanging off
each bar, centred on 960: legend tile x 514..796, team camera 820..1100,
legend tile 1124..1406, all 145 tall (the bottom cluster at y 935..1080, so
its caption block sits on the bar as in the reference). Tile = art band 92
px (the legend card painting scaled to the tile width and shown from card
y 160 so the face lands; hero and icon cutouts fill from the top) over a
caption block: legend line, trim rule, bold champion line (the reference's
flanking glyphs were tried as trim diamonds and removed at Sam's ask), a
ring ornament on the outer bottom corner. Score =
44 px badge on the camera's inner edge (y 145 / 935). Names at the bar
corners, 26 px caps letter-spaced 3, canvas-gauged fit to 440 px, each
nearest its own tile: P1 left with the left tile, the teammate right with
the right tile. Team 1 (the P1 side) is the top bar, team 2 the bottom.
Team cam mode: legend art fills the window with both cutouts half each;
webcam cuts the bar (and its rule, which lives inside `.bar-bg` for that
reason) away behind the window with the even-odd clip-path. No pips, track,
battlefields or seed: the reference has none. Designed look is the
reference's navy and gold; the global look recolours it like every scene.
State: `legendCardId2` and `champion2` per side (the teammate pickers now
carry the card id, plus a Champion picker in the 2v2 teams block that sets
the line only, never the featured card); `scenes.igobars {visible, mode}`;
`igobars` in LOOK_SCENES, DESIGNED, the edge-scene exclusion set, the focus
chips, the combined output and monitor stacks, the URL list and README.
Verified through `server/still.js` (Chrome, see the 09-14 gotcha) in legend
mode, and in webcam mode with `?transparent=1` by reading the alpha behind
the camera window and the bar beside it. 55 tests pass.

### 2026-09-14 (out of band: the look model and the dual-column overlay)
Sam asked for the dual-column in-game overlay from the RQ overlay teardown,
built to be highly customizable in colours and backgrounds, and for every
existing overlay to be as customizable. The teardown measured Riot's 2026
Regional Qualifier template off the Singapore quarter-final frame (350px
columns, a 1214px near-square feed, name banner, legend tile, 280x302 cam
window with a seed badge, battlefield band, pips, event block with the
round clock bottom left, docked card bottom right, mirrored 1-8-1 track).

**The look model** (`web/shared/look.js`, shared by server and scenes):
each graphic has designed colours (`DESIGNED`), the organizer's global look
overlays only its set fields, and a per-graphic override applies while
enabled. Colours: accents, ground, panels, frame, text, secondary text,
trim (empty trim = the accent gradient). Background: kind (shards, solid,
gradient, image, plate photo, transparent), colours, angle, grain, darken,
image. The stage client resolves the look per scene into `--ss-*` custom
properties and stamps `data-bg` on the root; `web/stage/ground.css` is the
shared ground-layer stack every scene mounts where its ground goes.
Presets are look patches; the sanitizer keeps them whole (tests).

**Masks instead of plates.** `scripts/bake-looks.py` classifies each PSD
chrome layer's pixels by role with soft membership (saturated colour, white
glint, dark) and per-class shade and glint modulation, and writes one
full-canvas alpha mask per role. Two lessons: highlights on a saturated
colour are found by desaturation, not brightness (a pure bright cyan has
V = 1 and is not a glint); and a deep navy needs its own brightness band or
it splits between "navy" and "dark" and greys out. The 2v2's shards live
inside its BG layer, so its ground mask must be the whole BG silhouette or
the shard layers clip. Reconstructions were checked against the old plates
before the scenes moved over. Grain is procedural now: the PSD's own grain
is coarse enough to read as speckle at 1080p.

**Scenes.** igo1v1, igo2v2 and pov render their chrome from the masks; the
score bug, card popup and decklist take the tokens (the decklist backdrop
is the shared ground stack, so it can be a solid, a gradient, an upload or
the TES photo). New `igodual` scene: everything measured above, name fit on
a canvas gauge, legend and battlefield art crops scaled from the POV's
measured windows, webcam holes cut with an even-odd clip-path, the card
popup's card docked (the popup stands down while docked), and the round
clock. `match.timer` plus a `timer` cue action ships Part 10 early.
`stage.js` sets `data-ready` once a scene's images settle so
`server/still.js` can capture any scene, not only the decklist.

**Panel.** The Theme card is the Look card: a scope select (all graphics or
one), an "own look" switch per graphic, presets, colour rows with clear
buttons that show the value that airs, background kind with colours, angle,
grain and darken, an image upload per scope, and a scope-aware reset. Match
data gains Seed, Event name, Round and the Clock row; the Graphics card the
dual row with its four extras; the focus map and chips know the new scene.

Verified on a second server (`--port=4711`, own data folder) with stills
rendered through Chrome (Edge 152 headless exits at once here, see backlog)
in the TES default and the Regional gold preset, plus an uploaded image
background with darkening on the dual overlay's own look. `npm test`: 55
cases. Suggested commit: `Out of band: the look model and the dual-column
in-game overlay`.

### 2026-09-11b (out of band: the decklist plate, rebuilt to FlipDeck's brief)
Sam handed over the FlipDeck agent's implementation brief for its decklist
plate tool and asked for the Sideways Studio graphic to be revamped to it.
The brief is written for a React + Remotion copy; this app is vanilla scenes
with a wall-clock seek clock, and the SPEC's animation rule forbids the rAF
playback Remotion uses. So the brief's non-negotiable, "the preview, the
stream page and the PNG are the same component", became "the same scene
page": the broadcast source, both panel monitors, the new editor's live
preview, a standalone `?list=` source and PNG export all load
`web/scenes/decklist/`, and nothing else draws a plate.

The plate is `Plate.tsx` at its own design pixels: the 1920x1080 TES
backdrop (its own toggle, `scenes.decklist.background`, since /output/ is a
transparent page), a 600px floating legend, the main deck as a grid of card
scans with 0.4-width white quantities (six columns, more past 18 names), and
the strip of vertical labels, three battlefield pills, the champion, the
ten-slot sideboard rack and rune counts. The labels are the template's own
pixel slices turned into alpha masks, so the green follows the theme accent
while the letterforms stay the template's. Measured in the browser against
the reference render: pills at x 76 to 406, label rails at x 32, 422 and 586,
legend 600 by 837.9, grid cards 193.8 by 270.7. Two things only measuring
showed: the reference is border-box throughout, and its 4px and 26px strip
spacers collapse to zero on a two-domain deck because the strip overflows.
The scene copies both. Type prefers a locally installed Akzidenz-Grotesk Next
(never bundled, it is not redistributable), yields to an organizer's theme
font, and falls back to the theme stack.

Build-in: legend slide, card cascade, strip rise, runes last, each on
Remotion's damping-200 spring. Remotion takes the critically damped branch
for any damping ratio of 1 or more, so the curve is the closed form
1 - e^(-10t)(1 + 10t), and the scene writes it per element to `--s` on a 16ms
interval. It plays on an entrance, on a new deck while on air, and on a new
"Replay intro on air" cue, a program-direct action like CLEAR that moves both
banks' counter so TAKE does not light up. The preview monitor settles instead
of cascading on every keystroke, first loads snap settled as before, and at
the end every animated property is removed, so the settled plate carries no
transform and is identical to the still. The length is computed from the
latest delay rather than fixed at 90 frames; see the backlog for why FlipDeck
needs the same fix.

Resolution matches on a key that ignores case, accents, punctuation and
spacing, strips bracketed printings and " - Starter", keeps the unique-prefix
rule, and adds FlipDeck's did-you-mean (Levenshtein, substring hits first).
Being space-blind, it finds "Thermobeam" as Thermo Beam, one of the six typos
FlipDeck's own run reported. The parser moved to `web/shared/` so the editor
runs it in the browser and serialize round-trips. Parsing a list warms its
full art in the background, and art downloads are de-duplicated in flight.

New surfaces: `/decklist/`, the deck editor (textarea as source of truth,
structured view with quantity steppers and fix chips that rewrite the text,
warn-only legality, GENERATE PNG blocked on any unresolved name, SEND TO
PREVIEW, SAVE, COPY STREAM URL, CSV import with a per-deck report, export all
as PNG). A saved-deck library in `data/decklists.json` with its own endpoint
and a version-only WS announcement, kept out of the bussed state because
every state push goes to every scene. The panel's Decklist card gains chips
(click loads into preview, TAKE airs it), preview and on-air labels, the
background toggle and the replay cue. PNG export is headless Edge over the
DevTools protocol with the `ws` client the app already has: nothing bundled,
true alpha, about a second a plate. `npm run decklist:batch` renders a Deck
List Database sheet through the same route, starting a private copy of the
app when none is running. `npm test` is new: 42 node:test cases over the
parser, the layout and timing maths, the CSV reader and the resolver.

Verified against a server on port 4711 with its own data folder
(`--data-dir=`, added for this) so the other session's live server and its
autosave were never touched. The Diana reference list resolves 25 of 25,
Vendetta included, once the index is re-synced. A typo'd pair blocks GENERATE
and the chips rewrite the textarea canonically. The PNG with backdrop and
the true-alpha PNG were checked by pixel and over magenta. Hide-sideboard
keeps the runes flush right at x 1887. Build-in timing was sampled on air, and
a swap, the replay cue, a fade-out, `?anim=0`, and a server kill and restart
all behaved: the plate held through the outage and did not replay after it.
Theme accent and theme font both reach the plate. The panel still fits
1920x1080 with no page scroll. The real 102-deck Chinese co-stream sheet
rendered 102 of 102 in 69 seconds with four genuine typos reported, each with
the right closest match, and Unicode file names. `--strict`, `--resume`,
`--transparent --no-sideboard` and the private-server path all work. The
packaged exe was not rebuilt; the esbuild bundle compiles clean.

An independent review of the diff found two real bugs, both fixed and
re-verified. (1) A headless browser that spawned but never finished starting
was referenced by nothing, so the process and its temp profile were orphaned;
launch now cleans both up on any failure (checked by pointing
`SIDEWAYS_BROWSER` at a program that exits at once: clean rejection, no
profile left), the socket wait has a timeout too, and a sweep removes
profiles over an hour old. (2) Pre-existing: emptying the panel's paste box
by hand left the decklist `visible` with no list, which showed a disabled ON
toggle and, after TAKE, an ON AIR pill over a blank graphic. The sanitizer
now switches a listless decklist off, the same rule the card popup has for a
missing card.

### 2026-09-11 (out of band: one data column, dimmed per graphic)
Sam's ask: the graphics share most of their data with small variants, so keep
all of it in one place on the left and grey out what a graphic does not use.
The Match card and the POV card had grown separate inputs for the same fields
(name, legend, battlefield, points each existed twice, bound to one state
value). Both are gone. A full-height Match data column on the left holds every
fact once, one row per field with Player 1 and Player 2 side by side:
series, player, points (stepper plus direct entry), game wins, legend with its
POV "shown as" line, battlefield, champion with its "shown as" line, featured
card (thumb, search and clear on one line), then a 2v2 block with team name
and the teammate's name, legend and battlefield. Swap sides and Reset match
sit in its header, which clears the old "Swap sides on the match card"
backlog item. Monitors and TAKE/CLEAR moved top right over four cards
(Graphics, Decklist, Theme, Setup); the POV column checkboxes and "Clear POV
cards" moved under the POV row in Graphics, the IGO holder modes under theirs.
Panel only: server, state shape and every scene are untouched.

Dimming: chips at the top of the column pick what to light up. "In preview"
(the default) is the union of the match-data graphics switched on in preview,
lighting everything when none is; the others pin one graphic. `SCENE_FIELDS`
in panel.js is the single map of which graphic draws which field, read off
each scene's render code, plus two setup rules: webcam holders draw no
legend art, and a hidden POV column draws nothing on that side, so both dim
per cell rather than per row. Dimmed means "not on this graphic", not
locked: fields stay editable, lift on hover, and go fully opaque while typing
(a picker's list inherits the cell's opacity). Decklist and card popup use no
match data, so they are not chips; their inputs stay with their own cards.
Row labels carry a "Shown on ..." tooltip generated from the same map.

Found and fixed while testing, pre-existing: a text field posts 300ms after
the last keystroke and reads its value when the timer fires, so typing a name
and clicking a points button inside that window let the counter's state echo
repaint the now-idle name box from the old value, and the timer then posted
the old name. Text fields now also flush on blur, which fires before the
click. Pickers now put back the assigned value when left without a pick, so a
half-typed search never reads as the data that will air, and lists near the
bottom of the column open upward.

Verified at 1920x1080 (no page scroll, data column needs no internal scroll),
1440x900 (column scrolls on its own) and 960 wide (stacks, page scrolls, no
overlap): chip dimming for all four graphics, webcam mode dimming the legend,
a hidden POV column dimming only its side, the "In preview" union with the
bug plus 1v1 on; name plus immediate +1 both landing; legend pick setting
name, slug and card id with "shown as" following; champion pick staging the
featured card; featured card search and clear; Swap sides moving all 14
fields and the card. Sam's preview bank was snapshotted first and restored
byte-identical afterwards; program was never touched. The packaged exe embeds
`web/` at build time, so the installed copy needs a rebuild to get this.

### 2026-09-04b (v0.2.1: the launch prompt could consent without a keystroke)
A packaged 0.1.0 installed a NON-required 0.2.0 twice with nobody at the
keyboard, both times in a console window that had just been created and taken
focus. It could not be reproduced with stdout redirected: there the countdown
times out, prints "Starting the installed version", binds its port and leaves
the exe alone, which is the designed behaviour. The cause was never pinned
down, so the fix does not rest on the diagnosis. Consent is now narrow: the
answer must be an exact single byte, input arriving in the first 800ms after
the prompt is ignored as console noise, setRawMode failures resolve to the
default instead of waiting for a key that can never arrive, and the caller
refuses to install an optional release unless the answer actually came from a
keystroke. An unattended machine starts what it already has, whatever stdin
does. Worth remembering the shape of this one: the safety rule was expressed
only in the value of a timeout fallback, and a single unexpected byte routed
around it. It is now an explicit check at the decision point.

### 2026-09-04 (out of band: Part 9 Decklist, then v0.2.0)
Sam asked for FlipDeck's deckbuilding tool as a Sideways Studio scene, in 15
minutes; it took about 30. `server/decklist.js` is a straight port of
FlipDeck's `src/lib/decks/parse.ts` so both tools read a paste the same way
(headers in any casing, "3 X" / "3x X" / "X x3" / bare names, bullets, inline
`Legend:`, duplicate merging, the rune-suffix strip) plus its warn-only
legality checks. Resolution runs against the card index this app already
carries: exact normalised name, then a UNIQUE prefix match, so an ambiguous
name resolves to nothing rather than to a guess. The paste itself is the
state; the scene and the panel both POST it to `/api/decklist/parse`, so the
summary the operator reads and the plate that airs can never disagree.
`cleanMultiline` is the one sanitizer that keeps newlines. The scene follows
FlipDeck's card-grid grammar: legend with cropped art, rune counts with domain
icons, battlefield pills rotated from the loaded file's own dimensions, the
main deck as a grid of card scans with quantity badges, and a sideboard rack.
One layout bug found and fixed in the browser: fixed-aspect cards overflowed
the plate and pushed the rack off it, so the grid rows now share the height
that is left. Verified on a 25-line list: 14 card images resolved and loaded,
1920x1080 with no scroll, no console errors, and an unresolved Vendetta name
rendering as a named panel. Shipped as v0.2.0.

### Loop 5 - 2026-09-02 (persona 5: Lena, play-by-play caster; Part 5 POV overlay)
Sam left the feedback line blank: no feedback, run the loop.
Lena review, measured rather than eyeballed: the POV design's four text lines
are 16px, the smallest type in the product by a third (score bug names 30 and
score 42, IGO names 24, IGO battlefields 18, all read off getComputedStyle),
and 24 of the 49 legend names (48%) do not fit the 200px run at 16px when
measured against the real BeaufortforLOL-Bold.ttf, worst case Poppy at 388px.
She also found that the three gold glyphs are not decoration: cropped at 6x
they match runes-icons/Card Types/Legend.png, ChampionUnit.png and
Battlefield.png exactly, so they are row labels. That answered the "make them
live domain runes" question without asking it (they stay baked chrome; all 54
battlefields carry zero domains in the index anyway, while all 40 indexed
legends carry exactly two) and it re-read the CHAMPION line as naming a
champion unit card rather than repeating the legend's first word.
Sam's calls: PSD-true 16px with no text-scale knob; the POV score IS the match
score, one source of truth with the bug; CHAMPION is a Champion Unit picker
that also stages that card in the featured slot; the legend strip uses the
legend card's own art, cropped. Default single column is LEFT, my call,
matching the PSD's primary group.

Part 5 shipped: scripts/bake-pov.py bakes plate.webp (28KB, both gold columns)
plus the four alpha cover gradients at their own bboxes and a gitignored
_psd-reference.png, and asserts alpha 0 on all three art slots and the centre.
web/scenes/pov/ renders every data-bearing layer live over that plate at PSD
coordinates; each side sets --x0 to 0 or 1623 so one stylesheet serves both
columns and one plate file is windowed per side, which is what lets a hidden
side take its chrome with it. BeaufortforLOL-Bold is bundled at
web/assets/fonts/ with the theme face as its fallback (Riot assets are fine,
official project). Text is placed by baseline from a constant derived from the
face's own measured ascent and descent, and auto-fits by canvas measurement
down to an 11px floor and then a real ellipsis. Art chains: card full then
thumb then an empty frame, legend card-art then hero then icon then navy,
battlefield full then thumb then navy with rotation decided by naturalHeight.
State grows champion, card{cardId,cardName}, legendCardId and
battlefieldCardId per side plus a pov scene entry with per-side flags; the
legend and battlefield pickers now carry card ids, /api/champions lists the
124 champion units, and the panel gains a fifth card (score stepper with
direct entry, player, legend picker plus an on-air override, champion picker
plus override, battlefield picker, featured card search with thumbnail and
Clear, show-this-side, Swap sides, Reset POV). POV joins the two IGOs as a
mutually exclusive edge scene, since they draw over each other.

Four bugs found and fixed during verification, all introduced this loop:
(1) the auto-fit measured the mixed-case name while CSS rendered it uppercase,
so Renekton overflowed the gold frame and got clipped; (2) the size estimate
is only approximately linear, so a 31-character CJK name still came out 4%
wide, and the fit now converges instead of trusting one division;
(3) document.fonts.ready is a one-shot that can resolve before the face has
even been requested, which left names sized for the fallback metrics, so the
scene now asks for the face itself and keeps .ready as a second chance;
(4) .art padding on a content-box element pushed the contain-tier cutout 8px
past its slot. Two fixes reach beyond the POV: panel and scene code is now
served no-store, because a browser source that kept a stale module after an
app update would air the old graphic with no sign anything was wrong, and the
startup banner lost its em dash.

Sam's follow-up, shipped: the legend and battlefield strips now show the
PAINTING, not a cropped card. Both slots oversize the card image and offset it
so one measured window of the card template lands on the slot, with the slot's
overflow doing the clipping. Legend window x 250..700, y 30..615 of the
744x1039 source, which clears the gold bracket and the two domain badges that
hang off it down the left edge and stops above the LEGEND name bar; the crop
is placed 15% down, which lands on the character on all 40 indexed legends.
Battlefield window x 150..515, y 60..975, the painting between the two
vertical rules-text panels and inside both the border and the type badge, and
only in the rotated portrait case: a landscape file would not match those
coordinates and falls through to the plain cover fill. Both boxes keep the
source's 0.7161 ratio so object-fit has nothing to distort. Measured, not
guessed: the legend frame's gold rails sit at x 30-43 and 701-714, and all 54
battlefields share a template whose rules panels are at x 56-142 and 582-666.
Verified by sampling the live images through a canvas: the legend window means
RGB 158,145,148 (art, not the 17,38,60 navy fill) and the battlefield window
means 10,113,144 against 61,104,116 for the whole card, which is the white
rules panels dropping out. The featured card slot still shows the whole card,
which is the point of that slot.

A five-dimension adversarial code review over the loop's diff (each finding
put to three refute-by-default skeptics) confirmed two more, both in shared
panel code this loop extended, both reproduced in the running panel before
fixing: (1) wirePicker's Enter path had no empty-query guard, and every search
predicate is a substring filter, so `''` matched the whole catalog and a bare
Enter assigned its first entry. Pressing Enter in an empty legend box silently
swapped Ahri for Kai'Sa including the slug and card id, which moves the POV
legend art, the IGO hero art and the score bug's legend text at once; the new
champion picker made it worse by staging that card in the featured slot too.
Nothing typed now means nothing picked. (2) loadCatalogs only retried inside
`catch`, but the battlefield and champion catalogs are derived from the card
index, so before the first-run download they answer 200 with an empty array:
those pickers stayed dead until someone reloaded the panel. The database
poller now re-runs the load once the index lands.

Self-update shipped in the same session on Sam's ask, on top of packaging.
Every launch reads a manifest from a fixed URL that always resolves to the
newest release (`releases/latest/download/update.json`), so there is no API to
rate-limit and nothing to keep in sync by hand. The rule that shaped all of
it: never block the show. The check times out in 5s, any failure is silent,
and an unanswered prompt starts the installed version; only a release marked
`required` installs itself on timeout (Sam's call). Skipping a version
persists in `data/update-state.json`, and an explicit "Check for updates" in
the panel deliberately looks past a skip. The download is SHA-256 verified
before anything is swapped, and only https is accepted, from GitHub's hosts
or the configured channel's own host (which is what makes SIDEWAYS_UPDATE_URL
usable for a future R2 channel, and what let the whole flow be tested against
a loopback server without publishing). The handover exploits the fact that
Windows will not delete a running exe but will rename one: a generated
sideways-update.cmd renames the running file aside, moves the new one in,
starts it and deletes itself, with a fallback that puts the old binary back
if the move fails. Verified end to end against a local channel: 0.1.0 saw
0.2.0, installed it, restarted, and the swapped binary was byte-identical to
the release; a corrupted manifest checksum was rejected with the running exe
untouched; a skipped version stayed skipped across a relaunch but still showed
up on an explicit check; and with the channel down the app was answering in
two seconds.

Packaging shipped in the same session on Sam's ask (roadmap Part 14, pulled
forward). `server/runtime.js` is now the single place that knows where assets
and data live: from source they come off disk and data sits in the repo, and
in the packaged build every asset is embedded in the binary while data lives
beside the exe, which is what makes it portable. Three things had to change to
get there: startup moved out of top-level await into `initState()` and
`start()`, because esbuild cannot emit top-level await in CommonJS and the
exe is built from a CommonJS bundle; the legend art routes now return bytes
(`readHeroArt` / `readIconArt`) rather than filesystem paths; and the static
handler tries the embedded assets before the disk, refusing to fall through to
the filesystem at all when packaged. Two build gotchas worth keeping: Node 24's
SEA sentinel fuse is NOT the value in the older docs, so the build reads it out
of the runtime it is packaging, and the icon has to be stamped BEFORE the blob
is injected because rcedit rewrites the same PE resource table postject writes
into. Verified by running the exe from an empty folder on another port: it
creates its own data folder, serves all 34 embedded web files, serves hero art
from inside the binary, blocks traversal, reports a clean first-run state with
no card database, and renders the POV overlay identically to the dev server
with the font loaded and the baseline still 0.21px off the PSD. Double-clicking
it with no arguments starts the server and opens the panel.

Verified: exactly 1920x1080 with no scrollbars; every rendered text ink box
within 0.6px of the PSD's own ink bbox on both axes and both sides, checked
with a zero-height inline-block baseline probe rather than my own metric math,
with the PSD placeholder strings and with a 31-character CJK name; the
?debug=psd overlay reads as one crisp string, not a doubled one; the empty
state is bare frames over navy with no broken image and no purple; nonexistent
card and legend ids exhaust their chains and hide; score bump, seek-clock
in and out, and ?anim=0 settling inside 120ms; a genuinely hidden tab
(document.hidden true) driven through six state changes including two hide and
show cycles settled at --t 1 with the right data and revealed clean; the
server killed mid-view held its last good frame with no diagnostic chip and
re-synced on restart; four rapid POV +1 clicks landed four and clamped at 8
with both cards' displays in step; a champion pick filled the line and staged
the card in preview while program held; Swap sides swapped cleanly and Reset
POV kept names, scores and legends. Garbage typed into the direct score entry
now restores the number on the graphic instead of zeroing a live score. After
the two review fixes, an empty Enter on five different pickers changed nothing
while a real query still picked.
Note: Vendetta champion units are still missing from the Rift Registry index,
so the champion picker finds none for those legends. The "champion name shown
on air" override is the workaround.


### Loop 4 — 2026-08-10 (persona 4: Geoff, vMix operator; Sam's 5 fixes + Part 4 IGO 2v2)
Sam's feedback, all shipped: (1) battlefield dropdowns: /api/battlefields
(54 cards) + type-ahead pickers replacing free text, generic wirePicker
helper now drives 4 legend + 4 battlefield pickers; (2) pips off-center:
tick rings drew OUTSIDE the design size (25px + 4px borders), box-sizing
border-box restores exact PSD spans (green 267-318, blue 763-814) and
re-centers on the text block, scorebug diamonds fixed the same way, the
slots-3 top hacks removed; (3) fonts too small: true sizes extracted from
PSD type layers (24px names, 18px battlefields, was 19/13), tops placed at
PSD ink positions (270/296, 767/793); (4) center logo: baked Sideways
Showdown CN vs WORLD art deleted, the slot is now always the styled dark
panel (blank until an event logo is uploaded, Sam chose blank over event
name text); (5) Vendetta legends: RR index does not carry the set yet, so
a SUPPLEMENTAL_LEGENDS list (9 legends, tcgcsv group 24698 confirmed the
roster) merges into the catalog deduped by slug: all 9 champions already
have hero PNGs, catalog now 49.
Geoff review: broadcast scenes and /output/ use only long-supported CSS
(risky features confined to panel/monitor pages that run in real Chrome);
vMix guidance added to Setup copy (Web Browser input, transparent
background, FPS 60); input-restart path is the verified reload-snap; TAKE
fade deferred again (Sam: backlog).
Part 4 shipped: bake-igo2v2.py (plate 28KB, four player windows punched),
2v2 scene at exact PSD coordinates (187x173 holders, 24px names/teams,
18px bfs, 19px team pips with 13px Bo5 variant, logo panel), same
webcam/legend toggle as 1v1 (Sam's call), state grows flat *2 fields +
teamName per side with load-time normalization for old saves, panel gets a
2v2 section (team names, second players with pickers), IGO toggles are
mutually exclusive in preview (same screen zone), /output/ and monitors
stack the new scene, per-scene URL row added.
Verified: plate alpha (game + 4 windows transparent), 2v2 renders full
team data including Vendetta hero art (Renekton), 1v1 pip/font/logo fixes
land on PSD numbers via getComputedStyle, battlefield picker and IGO
mutual exclusion through the real panel UI, Vendetta legends in pickers,
kill/restart recovery on the 2v2, no em dashes. One test-data bug of my
own (duplicate JSON key nuked a side) confirmed the sanitizer merges
per-field as designed.

### Loop 3 — 2026-08-10 (persona 3: Priya, OBS power user; shipped Part 3 IGO 1v1)
Priya findings: ambient shimmer ticked at 25fps forever in every source even
while hidden (fixed: startLoop now takes tickMs=150 + an active() gate, the
scorebug pauses its loop when off); OBS reload-snap verified (no entrance
replay, --t=1 at 350ms); two simultaneous sources of one scene track state
identically; Priya's ask for ONE source instead of N became /output/ (all
graphics stacked in one transparent page, per-scene URLs kept; Sam: "options
for both"). Sam's calls: legend-art default for IGO holders, searchable
legend picker, and a SPEC amendment: this is an official Riot project, so
bundling Riot art is permitted (hero PNGs served from the flipdeck resources
dir, SIDEWAYS_HERO_DIR override).
Part 3 shipped: scripts/bake-igo.py bakes plate.webp (33KB) + center-logo.png
from IGO-V2-PREPPED.psd with the holder image windows punched transparent
(webcam mode shows OBS sources through them; legend mode draws its own dark
backdrop); scene renders at exact PSD coordinates (holders 1645x17/822,
261x242; names 1680/269+766; tick stacks 1647, Bo5 shrinks to three 16px
slots repositioned to stay on the name bar). server/legends.js derives the
40-legend catalog from the card index, slugified to RR's convention, maps
champion-keyed hero files including the MASTER YI1/MASTERYI2 variant pair,
and lazily caches RR icon cutouts; /legendart/<tier>/<slug> routes. Holder
fallback chain: hero png, icon cutout centered, legend-initial chip. Panel:
legend type-ahead pickers + battlefield fields per side (per-input debounce
timers), IGO row with mode select, /output/ + per-scene URL rows. Custom
theme logo replaces the baked center panel via .custom-logo.
Verified: plate alpha (game area + both windows 0, sidebar 255), scene
geometry via getBoundingClientRect at 1920x1080 no scrollbars, webcam mode
holders display:none, Bo5 ticks on-bar, fallback chain ends in a chip,
combined /output/ tracks program truth in a genuinely hidden tab, kill/
restart recovery with the IGO on air, legend picker round-trips name+slug,
no em dashes in HTML copy. Note: ~20 state versions during testing came
from Sam driving the live panel mid-loop (again); concurrent operator +
agent writes interleaved without a crash, last-write-wins per field.

### Loop 2 — 2026-08-09 (persona 2: Marcus, broadcast producer; vMix bus + theming)
Sam's feedback: vMix-style full-width layout, and a theme panel (colors,
logo, Google Fonts). Full-art download mystery from Loop 1 resolved: Sam
pressed the offline button.
Marcus findings: no panic button (Reset match would have destroyed a live
score), search results shoved SHOW CARD 346px down mid-search, no hotkeys,
inconsistent cueing (popup staged, scorebug instant). Sam's calls: FULL
vMix preview/program bus (over the recommended per-scene model), no hotkeys
yet, curated cached Google Fonts, layout + theming this loop with IGO
moving out.
Shipped: state restructured into preview/program banks with atomic
server-side TAKE (structuredClone) and CLEAR (hides every program graphic,
data untouched: the wrong-graphic recovery); every operator edit lands in
preview; broadcast URLs render program, ?preview=1 renders preview; legacy
saves migrate (staged/live collapsed into one card per bank). Panel rebuilt
vMix-style: monitors row (PREVIEW | TAKE/CLEAR column | PROGRAM) up top,
four control cards below (Match, Graphics, Theme, Setup), fills 1920x1080
with no page scroll, TAKE glows when preview differs from program, ON AIR
pills per scene, search results now an absolute dropdown (no layout jump).
Theming: theme state (accentA/B hex, font, logo) global (not bussed),
sanitized server-side; scenes apply it as root custom-property overrides
over brand.css defaults; server/fonts.js curates 23 Google Fonts, downloads
css2 + woff2 with a browser UA on pick, rewrites URLs local, serves
/theme/fonts.css (all cached families, so the picker previews them); logo
upload (png/jpg/webp/svg, 2MB cap) to data/theme/, served at /theme/logo.
Verified: bus semantics via API and UI, migration, accents recolor the
live scene gradient (getComputedStyle), Oswald renders on the name plate,
theme reset restores TES, dropdown overlay zero-jump, all four cards fit
1080 without internal scroll, transparent/no-scrollbar/reconnect passes
against the new state shape, unknown actions and non-curated fonts
rejected. Note: scenes no longer force-visible in preview; the preview
monitor is an honest "what TAKE will air" (visibility toggles included).

### Loop 1 — 2026-08-09 (persona 1: Dana, first-time LGS TO; shipped Part 2)
Dana findings: (1) HIGH rapid +1 clicks collapsed to one step (panel computed
from the last WS echo) — fixed with optimistic local state, verified 5 fast
clicks now land 5; (2) HIGH hidden scene preview was an empty page —
per Sam: panel now embeds PREVIEW and PROGRAM monitor windows over a
checkerboard (/monitor/?mode=), and non-transparent scene views show a
"hidden: press SHOW" chip (broadcast ?transparent=1 URL stays clean);
(3) MED copy-URL failed silently and the address-bar workaround dropped
?transparent=1 — URLs are now always-visible readonly inputs, copy failure
selects the text and says "Press Ctrl+C"; (4) MED stale event greeted her
live on open — added Reset match (confirm; zeroes scores/wins, hides scenes,
keeps names/series/staged card). Loop 0 backlog diag-chip recovery item
verified fixed (state arrival clears the chip).
Part 2 shipped: server/carddb.js (index + thumb prefetch sync with progress,
lazy full-art proxy cache /cardart/<tier>/<id>.webp, ranked search API,
RR-origin-only fetch allowlist with browser UA + Referer, temp+rename writes,
null-cardId token entries dropped at the door); stage-then-SHOW card popup
(staged renders on PREVIEW, SHOW commits staged→live; entrance replays on
card swap; ?side=left mirror; battlefield rotation via onload
naturalHeight check, verified on Abandoned Hall); panel card search
(debounced, Enter stages top result), staged box, SHOW/HIDE, card database
section with progress and offline full-art prefetch (Sam's pick: index+thumbs
up front, full art lazy, offline button). Verified per checklist: 1920x1080
no scrollbars, transparent clean, anim=0 snaps settled in a real hidden tab
(document.hidden true), kill/restart reconnect held the frame on both scenes,
sanitizer 404s bad/traversal art ids. Sync numbers: 765 cards indexed (2
null-id tokens dropped), 763 thumbs, full art cached on Sam's button press.

### Loop 0 — 2026-08-09 (scaffold, no persona)
Interview + prior-tool handoff reconciled into SPEC.md. Part 1 built and
verified: panel edit → POST → whitelist sanitize → WS push → scene repaint
(score, names with apostrophes, Bo3→Bo5 tick re-slotting) with no reload;
first-load snaps to settled state; diagnostic chip hidden once state arrives;
clean-state reset. Known gaps left deliberately: no event save/load UI, no
timers, placeholder font, panel is desktop-layout only.
