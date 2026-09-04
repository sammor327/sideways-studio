# Sideways Studio — locked product spec

Locally hosted broadcast-graphics software for Riftbound streams, distributed
free to tournament organizers and streamers. Built by Sam Morris / Turn'em
Sideways (TES). Decisions below were locked in the 2026-08-09 interview with
Sam; do not re-litigate them without Sam explicitly reopening one.

## Delivery and architecture

- Single portable **Windows .exe** (packaging is a later part; dev runs `npm start`).
  Double-click starts a localhost webserver, opens the control panel in the
  default browser, shows status. No install, no admin rights.
- **Localhost only** (bind 127.0.0.1). No LAN control surface in v1.
- One browser-source URL per graphic, all **1920x1080 @ 60fps**, for OBS and vMix.
- WebSocket push: every edit reaches every open output instantly.
- Continuous auto-save plus named event files (save/load) so a TO can prep an
  event days early. Crash must lose nothing meaningful.
- **Themable**: TOs set event name, logo, accent colors. TES is the default
  theme. Credit "Built by Sam Morris / Turn'em Sideways" appears in the app
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
5. **IGO 1v1** (in-game overlay) — right sidebar. The two large holder boxes
   are a per-show toggle: transparent webcam cutout OR auto-filled legend art.
6. **IGO 2v2** — four players, two team names, legend portraits.
7. **POV overlay** — per side: featured card slot, numeric score, player /
   legend / champion / battlefield text, legend + battlefield art.

Two standalone transparent sources beyond the PSDs:

8. **Score bug** — 0-8 Riftbound point track + names + series ticks, its own
   URL, positionable anywhere in OBS. Deliberately NOT baked into the IGOs.
9. **Card popup** — operator searches any card by name, it animates in. Same
   engine feeds the POV card slots.

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
