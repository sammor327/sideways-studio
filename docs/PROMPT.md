# PROMPT.md — paste this into a fresh chat to run the next loop

---

Continue building **Sideways Studio**, a distributable locally hosted
broadcast-graphics app for Riftbound streams (Turn'em Sideways / Sam Morris).

Repo: `C:\Users\sammo\source\repos\sammor327\sideways-studio`

Read these before touching anything, in this order:
1. `docs/SPEC.md` — locked product decisions. Do not re-litigate them.
2. `docs/LOOP.md` — the loop protocol you must run this session, the persona
   roster and rotation state, the roadmap, and the loop log.
3. `C:\Users\sammo\source\repos\sammor327\flipdeck\overlaysoftware\broadcast-line-handoff.md`
   — engineering learnings from the previous broadcast tool. §3.2 (occlusion-
   proof animation) and §3.5 (sync contract) are mandatory patterns, already
   implemented in `web/stage/`.

Source design assets (PSDs, legend cutout PNGs) live in
`C:\Users\sammo\source\repos\sammor327\flipdeck\overlaysoftware\`.

Run it: `npm start` in the repo, then http://localhost:4700/panel/ and
http://localhost:4700/scenes/scorebug/. Use the Browser pane to verify, not
assumptions.

This session is ONE loop. Follow the protocol in LOOP.md exactly:
ingest my feedback from this message, review the current build AS the next
unused persona in the roster (run it, break it, ask me that persona's 3-5
critical questions before building), then implement the agreed fixes plus the
next unchecked roadmap part, verify per the checklist, append the loop log
entry, update the roster mark and this file's status line, and suggest a
commit.

My feedback for this loop:
- [Sam: write feedback here, or "no feedback, run the loop"]

Current status: **Two clears, the card row, the decklist highlight and
the index check, 2026-09-16, 0.13.0 in the tree and not yet released**:
CLEAR is CLEAR PROGRAM plus a new CLEAR PREVIEW (`clearpreview` action);
a new `cardrow` graphic puts one to four cards side by side with a
highlighted slot grown and lifted (Match data › Card row, star per slot);
the decklist lifts one card out of the plate with the rest blurred and
dimmed (Decklist card › Highlight a card, ‹ › to step); both highlights
are `focus` cues on both banks; and the card index is checked before it
is parsed so a page from the host no longer reads as "is the internet
up?" (LOOP.md 2026-09-16b). Before that: **The download buttons answer,
2026-09-16**: the Setup card's two buttons answer with a dialog
when a press had nothing to fetch ("already saved and ready", "nothing new"),
and stay quiet when a real download ran (LOOP.md 2026-09-16a). Before that: **Cards in hand on the
dual columns, 2026-09-15**: each player's hand fills the bottom of their
own column in the rows overlay's two styles, the event block and the docked
card standing down under it, the clock kept on its baseline and the popup
flying again when the hand takes its dock (LOOP.md 2026-09-15j). Before
that: **The app window shipped 2026-09-15 (0.11.1)**: the exe opens
its own window (Edge or Chrome as `--app=`, private profile in `data/window`)
with the wordmark, the control-panel button, status tiles, every
browser-source URL and the app's console as a live log pane, updates offered
there with buttons rather than a console countdown, and the console window
minimized then hidden, restored with the old banner on any path that cannot
draw a window (`server/appwindow.js`, `server/log.js`, `web/window/`,
`web/shared/sources.js`; LOOP.md 2026-09-15i). Before that: **the
out-of-game starter kit shipped 2026-09-15 (0.11.0)** (seven scenes, the
slate rework, bracket and standings editors; LOOP.md 2026-09-15h).
Before that: **Part 6b and the look model shipped 2026-09-14** (the
dual-column in-game overlay on the Regional Qualifier geometry, with the
round clock, seed badges, docked card and mirrored track; every graphic's
colours and background customizable globally or per graphic through the
Look card, with presets and image uploads; the PSD chrome re-baked into
recolorable masks by `scripts/bake-looks.py`; see LOOP.md 2026-09-14).
Before that: **Part 5 complete** (POV overlay: baked gold columns from
`POV-Overlay-1.psd`, live featured card / legend / battlefield art, five text
lines on the PSD baselines with an auto-fit down to 11px, per-side show flags,
a fifth panel card, `/api/champions`, and Beaufort for LOL bundled; Sam's Loop
5 calls: PSD-true 16px with no text-scale knob, the POV score is the match
score, CHAMPION is a champion unit picker that stages the card, legend art is
the legend card cropped; verified end-to-end 2026-09-02, Loop 5). Out of
band on 2026-09-11: the panel's single match-data column, and the decklist
rebuilt to FlipDeck's plate brief (pixel-matched plate with its build-in,
`/decklist/` deck editor, saved decks as panel chips, PNG export through the
machine's Edge, `npm run decklist:batch`, and `npm test`). Next
roadmap part, now that packaging (Part 14) was pulled forward and shipped:
**Part 6 — Head-to-Head** (auto cards from the legend
assignment, round titles; it needs the event name and round title panel fields
from the backlog). Next persona: **#6 the player at table 3**.
