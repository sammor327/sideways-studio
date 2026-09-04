# PROMPT-POV.md: paste this into a fresh chat to build the POV overlay (Part 5)

---

Continue building **Sideways Studio**, the locally hosted broadcast-graphics
app for Riftbound streams (Turn'em Sideways / Sam Morris, official Riot
project). This session ships **Part 5: the POV overlay** as an OBS browser
source plus its control-panel section.

Repo: `C:\Users\sammo\source\repos\sammor327\sideways-studio`

Read these before touching anything, in this order:
1. `docs/SPEC.md`: locked product decisions. Do not re-litigate them.
2. `docs/LOOP.md`: the loop protocol, persona roster, roadmap, loop log.
3. `C:\Users\sammo\source\repos\sammor327\flipdeck\overlaysoftware\broadcast-line-handoff.md`
   §3.2 (occlusion-proof animation) and §3.5 (sync contract). Both are already
   implemented in `web/stage/`; use them, do not reinvent them.
4. `web/scenes/igo1v1/` and `scripts/bake-igo.py`: the reference pattern for
   a PSD-derived scene (baked WebP plate + live HTML for every data layer).

Run it: `npm start`, then http://localhost:4700/panel/ and
http://localhost:4700/scenes/pov/?transparent=1. Verify in the Browser pane,
never from assumptions.

This is ONE loop. Follow LOOP.md: ingest the feedback below, review the current
build as persona **#5 Lena (play-by-play caster)**, ask her 3-5 questions
(the decision list at the bottom is the starting point), build, verify, log,
suggest a commit (`Loop 5: POV overlay`).

## What to build

A 1920x1080 transparent scene at `web/scenes/pov/` reproducing
`POV-Overlay-1.psd` pixel-for-pixel, driven live from the control panel:
every text field, the score, the featured card, the legend art and the
battlefield art on BOTH sides are editable and push instantly over the
existing WebSocket bus (edits land in PREVIEW, TAKE puts them on air).

## PSD spec (already extracted, do not re-derive)

Source: `C:\Users\sammo\source\repos\sammor327\flipdeck\overlaysoftware\OVERLAY-POV\POV-Overlay-1.psd`
(`Downloads\POV-Overlay (3).psd` is the same file; identical layer tree and
geometry, checked 2026-09-02). Canvas 1920x1080. Two groups, `LEFT` and
`RIGHT`. RIGHT is LEFT translated by +1623 px in x with identical y values,
so every coordinate below is LEFT; add 1623 for RIGHT. Bake each side's ART
layer from its own pixels anyway so any mirroring in the chrome is preserved.
The whole center (x 281 to 1640) and everything above y 425 is transparent:
gameplay capture and webcam live there in OBS.

Pixel layers (bbox is x0, y0, x1, y1, end-exclusive):

| Layer | bbox | Role | Treatment |
|---|---|---|---|
| `LEFT-ART` | 17, 755, 281, 1066 | Gold frame chrome, navy name band, score badge ring, three small gold rune glyphs on the left edge, diamond ornaments | Bake to `plate.webp` |
| `LEFT-CARDART` | 23, 425, 278, 781 | Featured card slot, 255x356 (full card, ratio 0.716) | Live `<img>` |
| `LEFT-LEGENDART` | 23, 864, 278, 992 | Legend art slot, 255x128 | Live `<img>` |
| `LEFT-LEGENDARTCOVER` | 23, 864, 278, 992 | Navy (17,38,60) alpha gradient, transparent at top to ~95% at bottom, so text reads over the art | Export as `cover-legend.webp`, layered above the art, below the text |
| `LEFT-BATTLEFIELDART` | 23, 1001, 278, 1066 | Battlefield art strip, 255x65 | Live `<img>` |
| `LEFT-BATTLEFIELDARTCOVER` | 26, 1001, 276, 1066 | Same navy gradient | Export as `cover-battlefield.webp` |

The purple (57,43,128) fills in the three ART slot layers are placeholders,
never bake them. The card in `LEFT-CARDART` (Baccai Sandspinner) is also a
placeholder.

Chrome geometry inside `LEFT-ART` (measured): name band y 795 to 855, fill
(19,57,87) with a noise texture; score badge is a gold-ringed navy circle
about 48 px across, centered x 151.5, spanning roughly y 755 to 803 and
overlapping the top of the band; gold accent averages (206,160,62); the three
rune glyphs sit in x 17 to 47, y 920 to 1055 (two beside the legend box, one
beside the battlefield box).

Type layers (all `BeaufortforLOL-Bold`, white, centered, ALL CAPS via
FontCaps, tracking 0). Font size = 29.3417 x transform scale. `ty` is the
transform's vertical origin; the cap-ink bbox is listed so you can place by
overlay rather than trusting either number alone:

| Layer | Rendered size | Center x | ty | Cap-ink bbox | Placeholder |
|---|---|---|---|---|---|
| `LEFT-SCORE` | 32.06 px | 151.5 | 791.72 | 143, 769, 160, 793 | `8` |
| `LEFT-PLAYER` | 16.00 px | 150.5 | 828.85 | 79, 818, 222, 830 | `PLAYERNAMEHERE` |
| `LEFT-LEGEND` | 16.00 px | 150.5 | 950.85 | 77, 939, 224, 952 | `LEGENDNAMEHERE` |
| `LEFT-CHAMPION` | 16.00 px | 150.5 | 979.85 | 83, 968, 219, 981 | `CHAMPION NAME` |
| `LEFT-BATTLEFIELD` | 16.00 px | 150.5 | 1039.85 | 77, 1029, 224, 1041 | `BATTLEFIELDNAME` |

A thin gold rule sits between LEGEND and CHAMPION (in the ART layer). Usable
text width is about 200 px (x 45 to 256) inside a 255 px wide box; the
ornaments and glyphs eat the rest.

Font: `BeaufortforLOL-Bold` is installed on this PC (`C:\Windows\Fonts`) and
available as TTF at
`C:\Users\sammo\source\repos\sammor327\riftregistry\Design Drops\fonts\BeaufortforLOL-Bold.ttf`.
Bundle it at `web/assets/fonts/` with an `@font-face` (SPEC: Riot assets are
fine, official project). Fall back to the theme font, never to a system serif.

## Bake step: `scripts/bake-pov.py`

Mirror `bake-igo.py`. Composite only `LEFT-ART` and `RIGHT-ART` into
`web/scenes/pov/plate.webp` (quality 95). Export the four COVER layers as
alpha WebPs at their own bbox sizes. Also export the full PSD composite to
`web/scenes/pov/_psd-reference.png` (gitignored) for the overlay check below.
Print alpha at (150, 600), (150, 928), (150, 1033), (960, 540): the first
three (card, legend, battlefield slots) and the center must all be 0 in the
plate.

## Scene: `web/scenes/pov/`

- `index.html` / `scene.css` / `scene.js`, same skeleton as `igo1v1`:
  `initStage`, `sceneBank`, `SeekClock` on `--t` for in/out, `bump()` for
  score changes, `?transparent=1`, `?preview=1`, `?anim=0`, the diag frame and
  the hidden-scene hint (never on the transparent URL). Add
  `?debug=psd` which draws `_psd-reference.png` at 50% opacity over the
  scene; use it to verify text and slot placement to the pixel.
- Layer order per side, bottom to top: art images (card, legend,
  battlefield) > cover WebPs > plate > text. The plate goes ABOVE the art so
  the gold frames clip the slot edges exactly as the designer intended.
- Featured card: `/cardart/full/<cardId>.webp` (existing proxy), then
  `/cardart/thumb/`, then the empty slot: the card layer hides entirely
  (frame only), never a broken image or a purple box.
- Legend art: `/cardart/full/<legendCardId>.webp` cropped with
  `object-fit: cover; object-position: center 22%` so the card's art window
  fills the 255x128 strip, then `/legendart/hero/<slug>.png` centered on a
  navy fill, then `/legendart/icon/<slug>.webp`, then a navy fill. Extend
  `/api/legends` to return each legend's `cardId` if it does not already.
- Battlefield art: `/cardart/full/<cardId>.webp`; battlefield art is stored
  portrait, rotate 90 degrees when `naturalHeight > naturalWidth` (handoff
  rule), then `object-fit: cover` into 255x65. Extend `/api/battlefields` to
  include `cardId`. Fallback: navy fill.
- Text: `text-transform: uppercase`, centered, PSD sizes as the default.
  Auto-fit long names: shrink font-size down to 11 px, then ellipsis. Never
  wrap, never overflow the frame. 40-char CJK/emoji names must not break
  layout (persona 13 will test this later).
- Score: 0 to 8, the existing `bump` micro-animation on change.
- Per-side `visible` flag: a hidden side removes its whole column (POV
  streams sometimes only want the featured player's column).
- Anything data-bearing renders live; the ONLY raster is the plate and the
  two covers.

## State (server/state.js)

Sides already exist at match level and are shared with the score bug and
IGOs (`name`, `legend`, `legendSlug`, `battlefield`, `score`, `gameWins`).
Keep sharing them so the score bug and POV never disagree. Add per side:

- `champion` (string, 40 chars, free text; auto-filled from the legend pick
  as the text before the comma in the legend name, operator can overwrite)
- `card` `{ cardId, cardName }` (featured card, same sanitizer as
  `cardpopup.card`)
- `legendCardId` (set by the legend picker; art source for the legend slot)
- `battlefieldCardId` (set by the battlefield picker)

Add scene entry `pov: { visible: false, showLeft: true, showRight: true }`
to both banks, to `mergeBank` defaults, and to the sanitizer whitelist. TAKE
and CLEAR semantics are unchanged.

## Control panel (web/panel/)

Add a **POV** card in the Graphics area following the IGO cards' style:

- On/off toggle for preview, ON AIR badge from program, Copy-URL field
  `/scenes/pov/?transparent=1` (1920x1080 @ 60fps), and a POV entry in the
  server's startup URL list and in `/output/`.
- Two columns, LEFT and RIGHT, each with: big score stepper (minus / value /
  plus, 0 to 8, direct entry allowed); player name; legend type-ahead
  (reuses `wirePicker` against `/api/legends`; picking fills `legend`,
  `legendSlug`, `legendCardId`, `champion`, and the art); legend name and
  champion name as editable text fields that keep the override when the
  operator has typed something; battlefield type-ahead against
  `/api/battlefields`; featured card search (reuse the card popup's search
  UI and `/api/cards/search`) with a thumbnail of the staged card and a
  Clear button; "Show this side" checkbox.
- A **Swap sides** button and a **Reset POV** button (clears cards and
  champions, keeps names).
- Every edit posts a partial patch through the existing `post()` path;
  optimistic score clicks must survive rapid clicking (Loop 1 fix pattern).
- No em dashes in any UI copy.

## Verify (all required before logging)

1. Exactly 1920x1080, no scrollbars, `?transparent=1` shows nothing but the
   two columns.
2. `?debug=psd` overlay: every text baseline and every slot edge lands on the
   PSD within 1 px on both sides, with placeholder-length text and with a
   40-char name.
3. Empty state: no card, no legend, no battlefield gives frames over navy,
   never a purple box, broken image, or blank frame.
4. Score change bumps; in/out transition runs on the seek clock; `?anim=0`
   settles instantly.
5. Occluded-source test in a real hidden tab, then reveal: no frozen frame.
6. Reconnect: kill the server mid-view, restart, scene recovers with the last
   good frame and re-syncs.
7. Panel edits appear in PREVIEW monitor, not on air until TAKE.
8. getComputedStyle checks, not source reading, for font family and sizes.

## Decisions for Sam (ask as Lena, then build on the answers)

1. The two gold rune glyphs beside the legend box: keep them as baked chrome,
   or make them live domain-rune icons of the picked legend
   (`flipdeck/public/runes-icons/` has the set)?
2. Legend slot art: legend card art crop (recommended above), or the IGO hero
   cutouts? Same question for whether the featured card slot should auto-stage
   the champion unit card when a legend is picked.
3. The PSD's 16 px caps text is small for a caster reading a 936p program
   monitor. Ship PSD-true sizes, or add a "text scale" knob (default 1.0) to
   the POV card?
4. Should POV score edits be the same match score the score bug shows
   (recommended, one source of truth), or independent?
5. Which side is "the POV player" by default when a stream shows only one
   column, left or right?

## Log

Append the Loop 5 entry to `docs/LOOP.md`, tick Part 5 in the roadmap, mark
persona 5 used, update `docs/PROMPT.md`'s status line to "Part 5 complete",
and suggest the commit. The repo still has no commits: suggest a baseline
commit first.

My feedback for this loop:
- [Sam: write feedback here, or "no feedback, run the loop"]
