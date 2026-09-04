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
- [ ] Part 6 — Head-to-Head (auto cards from legend assignment, round titles).
- [ ] Part 7 — Bracket (Top 8 / Top 4, legend portraits, series scores).
- [ ] Part 8 — Standings (manual pages, CSV/paste import, dropped-player
  status marks) + Riot attribution line component for full-frame scenes.
- [ ] Part 9 — Decklist (port FlipDeck parser + renderer).
- [ ] Part 10 — Timers (start/pause/reset, panel + overlay element).
- [x] Part 11 — Theming: pulled forward to Loop 2 on Sam's feedback (accent
  color pickers, logo upload, curated Google Fonts downloaded + cached for
  offline). Leftovers moved to backlog: event name/round title fields,
  per-URL `?theme=` override.
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
- Vendetta CARDS are not in the popup search until the RR index adds the
  set (legends are covered by the supplemental list in server/legends.js;
  prune that list when RR catches up). A tcgcsv merge is the fallback if RR
  stays behind.
- Vendetta hero art: all 9 champions fall back to their existing 1-suffix
  PNGs; champions gaining a second legend want proper 2-suffix variants in
  IGO-LEGENDS when the art exists.
- Theme accents recolor live elements (ticks, gradients) but baked plate
  chrome keeps the designed green/blue; full plate re-theming would need
  runtime recolor of the WebP plates.
- Card popup default side collides with the IGO sidebar; /output/ supports
  ?popupside=left. Consider auto-mirroring the popup when the IGO is on.
- "Swap sides" button on the match card.
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
- Vendetta champion units are not in the Rift Registry card index, so the POV
  champion picker finds none for those legends (same root cause as the card
  search entry above). The "champion name shown on air" field is the workaround.
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
- Monitor iframes add 4 WS clients per open panel; interplay with OBS
  "shutdown source when not visible" on the real scene URLs is untested until
  the Priya (OBS power user) loop.

## Loop log

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
