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

Current status: **Part 5 complete** (POV overlay: baked gold columns from
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
