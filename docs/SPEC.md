# Sideways Studio — locked product spec

Locally hosted broadcast-graphics software for Riftbound streams, distributed
free to tournament organizers and streamers. Built by Sam Morris / Turn'em
Sideways (TES). Decisions below were locked in the 2026-08-09 interview with
Sam; do not re-litigate them without Sam explicitly reopening one.

## Delivery and architecture

- Single portable **Windows .exe** (packaging is a later part; dev runs `npm start`).
  Double-click starts a localhost webserver, opens the control panel in the
  default browser, shows status. No install, no admin rights.
  **Amendment 2026-09-15 (Sam):** "shows status" is an app window, not a
  console. The exe opens its own window (the machine's Edge or Chrome started
  with `--app=` and a private profile in `data/window`, so there is still one
  file to copy and nothing to install) carrying the wordmark, the button that
  opens the control panel, the status of the server, the card database and
  updates, every browser-source URL with a Copy button, and the console the
  app used to be, as a log pane inside it. The console window Windows gives
  the exe is minimized at launch and hidden once the window reports in, and
  comes back with the old banner if the window cannot be drawn: no path ends
  with the app running where nobody can see or stop it. Closing the window
  stops the graphics, exactly as closing the console window did.
- **Localhost only** (bind 127.0.0.1). No LAN control surface in v1.
- One browser-source URL per graphic, all **1920x1080 @ 60fps**, for OBS and vMix.
- WebSocket push: every edit reaches every open output instantly.
- Continuous auto-save plus named event files (save/load) so a TO can prep an
  event days early. Crash must lose nothing meaningful.
- **Themable**: TOs set event name, logo, accent colors. TES is the default
  theme. **Amendment 2026-09-14 (Sam):** every graphic is fully customizable
  in colour and background. The look model (`web/shared/look.js`) resolves
  each graphic's designed colours, then the organizer's global look, then an
  optional per-graphic override: accents, ground, panels, frame, text,
  secondary text and trim, plus a background (arrow shards, solid, gradient,
  uploaded image, the TES plate photo, or transparent) with grain and
  darkening. The PSD plates are no longer baked flat: `scripts/bake-looks.py`
  splits each PSD's chrome into alpha masks by role, so the sidebars, the POV
  frames and the shard art repaint from the look. Presets ship for one-click
  looks (TES, Regional gold, Ember, Arctic, Mono). The look is setup, not a
  cued graphic: it airs as it is edited, like the logo. Credit "Built by Sam Morris / Turn'em Sideways" appears in the app
  (header/About) only, never watermarked on broadcast output.
- Per-scene **Copy URL** buttons (noting 1920x1080 @ 60fps) plus an illustrated
  OBS and vMix setup guide inside the app.

## Outputs (9)

Seven derive from the PSDs in `flipdeck/overlaysoftware/` (visual source of
truth, all 1920x1080; composite previews were verified 2026-08-09):

1. **Bracket** — Top 8 and Top 4 single elim only. Per slot: legend portrait,
   series score, player name.
2. **Standings** — pages of 14 (2 cols x 7 rows). Manual paging only, no
   auto-rotate. Rows: points, player name, legend name.
3. **Head-to-Head** — VS screen. Cards auto-pulled from each player's assigned
   legend (big champion card + small legend card per side); round title +
   tournament name text. Manual card override was explicitly NOT chosen.
4. **Decklist** — text paste input, reusing FlipDeck's `/tools/decklist`
   parser + renderer (port from `flipdeck/src/lib/decks`).
   **Amendment 2026-09-11 (Sam):** the plate follows FlipDeck's decklist-plate
   brief: `src/remotion/decks/Plate.tsx` geometry and its build-in, a deck
   editor page, saved decks, PNG export and a batch CLI. One scene page is the
   only renderer for every surface (the brief's "same component" rule, in this
   app's terms). PNG export uses the machine's own Edge or Chrome headlessly
   and bundles no browser. The saved-deck library is setup data kept outside
   the bussed state, like the theme.
5. **IGO 1v1** (in-game overlay) — right sidebar. The two large holder boxes
   are a per-show toggle: transparent webcam cutout OR auto-filled legend art.
6. **IGO 2v2** — four players, two team names, legend portraits.
7. **POV overlay** — per side: featured card slot, numeric score, player /
   legend / champion / battlefield text, legend + battlefield art.
7b. **IGO dual columns** (added 2026-09-14, no PSD: live HTML on the
   Regional Qualifier broadcast geometry measured in the RQ overlay
   teardown) — two 350px player columns framing a near-square table camera.
   Per side: name banner, legend tile with legend and champion lines, a
   280x302 camera window (webcam cutout or legend art) with a Swiss-seed
   badge, battlefield art band, series pips. Bottom left: event logo, event
   name, round title and the round clock. Bottom right: the card popup's
   card, docked (the popup stands down while docked). Top centre: a mirrored
   1-8-1 point track lighting each player's current points. Each extra
   (track, clock, event block, card slot) switches off on its own.

Two standalone transparent sources beyond the PSDs:

8. **Score bug** — 0-8 Riftbound point track + names + series ticks, its own
   URL, positionable anywhere in OBS. Deliberately NOT baked into the IGOs.
9. **Card popup** — operator searches any card by name, it animates in. Same
   engine feeds the POV card slots.

**Outputs from the broadcast scouting (2026-09-14, Sam's ask, not yet
locked).** Behind Setup > Experimental (`theme.experimental`) until 0.10.0;
since then listed with the rest of the graphics, the flag kept as setup
data and unread:

10. **IGO portrait pillars** (`igoportrait`) — the Yu-Gi-Oh broadcast
    grammar: portrait table camera x 545..1375, y 64..1080, a 64px game-state
    bar over it (series pips · points · round and clock · points · pips, the
    active side marked with a chevron and a trim line), 545px pillars with
    record and seed, country chip and name, a 489x275 camera well, the legend
    tile with domain runes, archetype and hand count; hand cam window (left,
    optional) and the docked card with legible rules text (right).
11. **IGO rows** (`igorows`) — the Magic Pro Tour grammar: 75px bars top and
    bottom, one player each, a 330px left column with both cameras, series
    dots, the active-turn mark and the CARDS IN HAND list (resolved cards
    with energy and domain runes) plus a HOLDS line.
12. **Arena score bug** (`arenabug`) — the Pokémon wide-shot bug on the
    1-to-8 track: eight hexes per side, games box, name bar with legend
    thumbs, records and the round title, an event and clock lozenge.
    Exclusive with the score bug in the panel.
13. **Slate** (`slate`) — full-frame holds: up next (event.tables, seeds
    strip, casters, break clock) or a message line.
14. **Hand fan** (`handfan`) — one player's cards in hand as real cards
    fanned along the bottom edge with a badge per card (what it can do,
    read off the card text), reactions lit while a showdown is open, played
    cards greyed, the opponent's known cards small at the top with dashed
    unknown slots. The rows and dual-column lists keep the typed order with
    copies counted, can mark each card's type, carry art and scroll a long hand.
15. **Showdown** (`showdown`) — the chain of cards played onto a showdown,
    as the cards in play order with the newest lifted (it resolves first).
    Strip mode docks into the on-air in-game overlay's camera window;
    takeover mode is the lower band over the battlefield art with cameras
    and hands. Driven by the `chain` cue (open / play / resolve / unplay /
    priority / close) on `match.showdown`, both banks at once. The scene
    airs only while a showdown is open, so the panel's Open also switches
    the graphic on in preview when it is off (0.10.1), and the graphic's
    row warns while it is up with no showdown open.

**The out-of-game starter kit (2026-09-15, Sam's ask, from the "Between
the Games" scout and the mocked kit).** Outputs 1 to 3 are now built on
this set; the PSDs stay the visual reference.

16. **Corner tag** (`cornertag`) — "UP NEXT · match or round or a custom
    line · break clock", top right, over anything. Reads event.countdown.
17. **Lower third** (`lowerthird`) — one bar, three modes: casters (the
    first two of event.casters with role and handle, the event lockup
    between them), interview (a side's legend thumbnail, name, country and a
    credential line, typed or built from seed, record, legend and best
    finish), coming (the round over "A vs B").
18. **Match card** (`headtohead`, spec output 3) — legend art fills each
    side, the legend card and the featured card float above the name with
    domain runes, seed, Swiss and season records, best finish, pronouns and
    team; a centre column with the round, best-of, "first to 8 points" and
    who chose first (match.choseFirst); a status line along the bottom.
19. **Player profile** (`profile`) — one side: legend art backdrop, name,
    legend, country and seed, tiles for Swiss record, season record, deck
    and store, up to three top finishes, and a transparent camera well
    bottom right.
20. **Bracket** (`bracket`, spec output 1) — event.bracket {format se8 |
    se16 | de8 | de16, players[16] in seed order, results by match id}.
    web/shared/bracket.js holds the formats (seed pairings, feeds, the
    double-elimination drops) and resolves every slot; the scene lays the
    tree out with SVG connectors, lights the winner's path, dims the
    eliminated and marks live matches. The panel lists every match with
    scores and a winner button.
21. **Standings** (`standings`, spec output 2) — event.standings {rows[64]
    (name, country, legend, record, points, OMW, GW, OGW), cut 0/4/8/16/32}
    as one full-width table, twenty rows a page (scene.page), the cut drawn
    under the last qualifying row. Since 2026-09-19 each row carries the
    legend's portrait (the hero face crop, then the legend card's painting,
    then the icon: art.js portraitSteps) before the name and the legend's
    name in its own column; `scenes.standings.legends` (default true) drops
    both for an event whose legends are not known. Fixed column widths, so
    a long name shrinks (fitnames) rather than widening its column.
22. **Result strip** (`result`) — the match winner (match.result.winner, or
    whoever holds the series) with legend art, round and game chips, the
    "advances to" note and a transparent camera well; the series score as a
    bug top right.
23. **Head to head, VS** (`vscard`, 2026-09-19) — the Sideways Showdown
    head-to-head (HEAD2HEAD-PREPPED.psd): both legend cards (the side's
    legendCardId) tilted -6.4 / +6.4 degrees either side of the baked VS
    glyph, the upper name player 2 and the lower name player 1, the round
    title and the event name, the theme logo between the cards, on the
    look's ground (designed: the new `arrows` background kind, that PSD's
    smoke plate and glowing arrows, baked by scripts/bake-showdown.py).
    State `scenes.vscard {visible}`; a full-frame graphic.
24. **Legend distribution** (`legendstats`, 2026-09-19) — event.legendStats
    {rows[64] {legend, legendSlug, legendCardId, players, share, wins,
    losses, winRate}, total, label, note} as a pie (SVG, clockwise from
    twelve in share order, legend faces on the slices with room) beside a
    table (the face ringed in its slice colour, champion and title, share
    over the player count, win rate over the record). scenes.legendstats
    {visible, winRate, top 3-8}: the win rate column and the note switch
    together; legends past `top` fold into Other, with any players past the
    rows when `total` is larger. Shares, Other, slice colours, the paste and
    the standings count live in web/shared/legendstats.js; the Tournament
    platform fills it from TopDeck (legendStats in server/platform-model.js).
    A full-frame graphic.
25. **Pairings** (`pairings`, 2026-09-19) — every table of a round:
    event.pairings {rows[128] (table, left and right as up-next table
    sides, status '' / pending / live / done, score [left, right], winner
    left / right / draw), label ("Round 3 · Group 2"; empty falls back to
    the round title), byes[16]}. 32 tables a page in two columns of 16
    (scene.page 1-4), each table read across: number, player (portrait,
    name, record going in and legend), VS or the games, opponent mirrored.
    `scenes.pairings {visible, page, legends, results}`: legends as the
    standings'; results off keeps every table at VS. Records are left off
    when every one is 0-0. Filled by the Tournament platform (kind
    `pairings`: a round, optionally one group; a different round or group
    resets the page, the same one keeps it) or typed under Match data ›
    Pairings. Its pages turn like the standings' (web/stage/pager.js, shared
    since this round). A full-frame graphic on the standings' ground.
The slate's starting mode became the hold (clock, event.schedule with
event.scheduleNow lit, event.format panel, first feature table, sponsors,
tables ticker); brb leaves a transparent camera window with the resume
clock, next match and event.commands; thanks names event.champion with
their legend art and event.nextName / nextWhen. Sides gained team, store,
seasonRecord, bestFinish, finishes; casters gained a handle. Full-frame
graphics (slate, decklist, match card, VS card, profile, bracket,
standings, pairings, side-by-side decklists) switch each other off in
preview.

New per-side fields: record, country (2-3 letters), pronouns, archetype,
handCount, hand[] (cardId, cardName, energy, domains), holds. New match
cues: `turn` (next / prev / reset / set / side) acting on both banks.
Event: roundsRemaining, countdown (a second timer, `timer` with
`which: 'countdown'`), tables[4], casters[4], seeds paste. The panel lists
each graphic with a live thumbnail (`?force=1` renders a scene as if on)
that puts the graphic in preview when clicked, and Setup is two
collapsible sections: browser source links and updates.

Panel layout (2026-09-15, 0.10.0): Graphics lists its rows in three
folds, 1v1, 2v2 and Other (bugs, the card popup, the full screens), closed
on load; a fold's heading counts what is in preview and on air inside it,
and a graphic put in preview opens its fold. Graphic features, Decklist,
Look and Setup fold from their heading, and every control card has a grip
along its bottom edge that sets its height (vertical only; double-click
resets). Folded cards and heights are kept per browser. A graphic put in
preview opens Graphic features the same way it opens the Match data folds
holding its fields. The control band is three columns: Graphics, then
Graphic features over Decklist, then Look above Setup. Match data has no
field focus bar any more; its folds are Player details, 2v2 teams, Hands
and showdown, and Event. The card popup's search and staged card and the
card row's slots moved into Graphic features (2026-09-16); a click on either
graphic with nothing picked arms its group there. TAKE and
CLEAR are pinned to the top of their column with the tip as TAKE's hover
text, and the on-air list fills the column from the bottom.

What is on air is named under CLEAR, one row per graphic with an X that
drops it, and a graphic's ON AIR badge is the same control where the graphic
is listed. Both post `{action:'off', scene}`: CLEAR aimed at one graphic, a
cue on program only, so preview keeps what it holds and TAKE puts it back.

Timers (Part 10) shipped early with the dual overlay: one round clock in
`match.timer`, driven by a `timer` action (start / pause / reset / set
minutes) that acts on both banks at once, so the clock on air never waits
for a TAKE. Countdown when a length is set, count-up otherwise, always
printed as minutes:seconds.

## Overlay semantics

- Tick pips on IGO 1v1/2v2 and the score bug = **series game wins**. Series
  length configurable Bo1/Bo3/Bo5 → 1/2/3 tick slots (ceil(n/2)).
- Score track is 0-8 (8 wins the game in Riftbound).
- Live-updating data: score, series wins, player names/legends/battlefields,
  operator timers (start/pause/reset).
- Player/standings entry: manual + CSV/paste import.
- **Never filter dropped/DQ'd players out of standings** — status-mark them
  (Rift Registry hard rule #1). Display caps are windows, not filters.

## Animation (all mandatory, 60fps)

Operator-triggered in/out transitions per scene; ambient loops (arrow-shard
glow, grain shimmer); data-change micro-animations (score bump, tick fill,
name-bar slide); card popup flip/slide.

**Implementation is non-negotiable** (broadcast-line-handoff §3.2): occluded
OBS/vMix sources freeze rAF and CSS animation timelines, so all motion derives
from wall-clock setInterval ticks writing CSS custom properties
(`web/stage/seekclock.js`). Every CSS read fails open: `var(--t, 1)` = settled,
never invisible. `?anim=0` is the on-air kill switch; `prefers-reduced-motion`
is honored via JS matchMedia. No rAF, no `@keyframes`, no WAAPI, no CSS trig
(older OBS CEF builds lack it).

## Sync contract (stage.js, applies to every scene + the panel)

Version-gated repaints (only on `state.version` increase, minimal DOM churn);
full-state fetch on load and on every WS reconnect; keep the last good frame
on any failure — a failed poll must never blank an output; 60s belt-and-braces
resync; URL params own presentation (`transparent`, `theme`, `anim`), server
state owns content. All mutations pass the server-side whitelist sanitizer in
`server/state.js` (unknown keys dropped, numerics clamped).

## Card and legend data

- Catalog + art via a **first-run "download card database" step** pulling from
  Rift Registry public surfaces onto the user's machine (we distribute code,
  not Riot's assets), cached for offline venues. "Check for new sets" refresh.
- **Amendment 2026-09-17 (Sam):** Rift Registry is private and stays private,
  so that download only ever works for its operator: everyone else is answered
  with a sign-in page and has no cards at all. **The library therefore ships
  with the build.** `scripts/bake-cardpack.mjs` seals it with the release key
  into two packs (`server/cardpack.js`): the index, thumbnails and legend
  cutouts inside the exe, the full art as a release asset fetched once and kept
  across updates. Read order everywhere is store, then library, then Rift
  Registry. A new set reaches an operator by way of an app update, and a failed
  "check for new sets" is reported as nothing to do rather than as an error.
- **Amendment 2026-08-10 (Sam):** this is an official Riot project; bundling
  Riot assets is permitted. IGO hero art (261x242 holder PNGs) is served
  from `flipdeck/overlaysoftware/RESOURCES/IGO-LEGENDS/` (override with
  `SIDEWAYS_HERO_DIR`) and may ship with the distributed build.
- Endpoints and gotchas (broadcast-line-handoff §2): `photo.` / `art.`
  subdomains 403 non-browser user agents — the downloader must send a browser
  UA + `Referer: https://riftregistry.com/`. `fetch()` CORS is limited to RR
  origins — the local server proxies/caches, making everything same-origin.
  - Legend cutouts: `riftregistry.com/data/legends/<legend-slug>.webp`
    (256px, alpha; icon tier only — hero art comes from
    `flipdeck/overlaysoftware/RESOURCES/IGO-LEGENDS/*.png`).
  - Card thumbs: `riftregistry.com/data/cards/thumb/<cardId>.webp`; full art:
    `art.riftregistry.com/full/<cardId>.webp`; index: `riftregistry.com/data/cards.json`.
- Battlefield art is stored portrait: rotate when `naturalHeight > naturalWidth`
  (onload check, never per-card hardcoding).
- Every image slot declares a fallback chain ending in something rendered
  (initial chip / named placeholder panel). A broken img glyph on program
  output is a shipping bug.

## Attribution and copy rules

- **Riot fan-content attribution line on every full-frame scene** (bracket,
  standings, head-to-head, decklist). Overlays are exempt — the program feed
  they sit on carries it (narrowing approved by Sam).
- TES-published copy style applies to UI strings: **no em dashes**; use
  colons, commas, periods.
- True TES font is Akzidenz-Grotesk Next — NOT redistributable. Placeholder
  stack lives in `web/assets/brand.css`; picking a distributable face is an
  open loop item. Brand gradient: #11b6fb → #1bef19.

## Empty states

Every failure mode renders a styled diagnostic (full-frame scenes) or a
compact chip (overlays; see `.stage-diag`) — never a blank/black 1080p frame,
never a fall-through. "No state yet before first frame" = render nothing, it
is not an error.

## PSD-to-scene pipeline (for parts 3-8)

Bake non-data layers (backgrounds, arrow shards, frames) into WebP plates;
render everything data-bearing as live HTML. `py` + psd-tools 1.11 is
installed and works: `PSDImage.open(...).composite()` per layer group.
Baseline-exact text placement math is documented in broadcast-line-handoff
§3.9. Verify at exactly 1920x1080, no scrollbars, via `getComputedStyle` and
`getBoundingClientRect` — not by reading source.

## Explicitly out of scope for v1

LAN/remote control, co-streamer rooms, tournament-software API integrations
(CSV import covers it), double elimination, auto-rotating standings pages,
Mac/Linux builds, on-graphic TES watermark.
