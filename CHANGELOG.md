# Sideways Studio patch notes

One section per release, newest first, in the operator's words. The app
window shows these under "What's new", the release script publishes the
current version's section as the GitHub release notes and the update
prompt's text, and it refuses to publish a version that has no section
here. Write the section before running `npm run release`.

## 0.14.1 (2026-09-16)

- Card row: no more name plates under the cards, and a background behind them (the arrow shards in your accent colours, dimmed; change or switch it off under Graphic features and the Look card).
- Decklist highlight: "Highlight on/off" flicks the highlight away and back without losing the card, and the card picker shows each card's art beside its name.
- Updating is a clean handover: the new version waits for the old one to shut down before it takes its place, and if the old one lingers it is closed. Only one copy of the app runs at a time; a second launch says so and stops, and an older build started beside a newer one stops too.
- The control panel reloads itself once the new version is up, so the "Update ready, restarting" bar goes away on its own instead of sitting there until the next check.

## 0.14.0 (2026-09-16)

- The app window has a "What's new" card with the notes for every release, the version you are on first.
- Every release now carries its notes from this file, and the release script refuses to publish a version that has none.

## 0.13.0 (2026-09-16)

- CLEAR is now two buttons. CLEAR PROGRAM takes every graphic off air, as before. CLEAR PREVIEW takes every graphic out of preview with its data kept, so the next TAKE airs a clean frame.
- New graphic: Card row. One to four cards side by side over name plates. Pick them under Match data > Card row; the star beside a slot highlights that card on air, larger and lifted, while the others shrink and dim.
- Decklist: "Highlight a card" on the Decklist card lifts one card out of the plate, larger and glowing, with the rest blurred and darkened. The arrows step through the list. Highlights act on air at once, no TAKE needed.
- "Check for new sets" no longer reports "Unexpected token '<'... Is the internet up?" when Rift Registry answers with a web page instead of the card list. It says what happened, tries once more, and only asks about the internet when the connection is really down.

## 0.12.2 (2026-09-16)

- The two download buttons in Setup answer when there is nothing to fetch: "already saved and ready" for the offline art button, "nothing new" for Check for new sets. A real download shows its progress as before.

## 0.12.1 (2026-09-16)

- Decklist: long battlefield names shrink to fit their pill, and the rune counts shrink as a block when a two-digit count or a third domain would run off the strip.
- The 0.12.0 notes are included here for installs coming from 0.11.1: the card database on disk is encrypted, and each player's cards in hand can fill the bottom of their column on the dual-column overlay.

## 0.12.0 (2026-09-15)

- The card database on this computer is stored encrypted. Art already saved is converted in the background on first launch; the graphics keep working while it runs.
- Dual-column overlay: cards in hand for each player fill the bottom of their column, in the rows overlay's two styles.

## 0.11.1 (2026-09-15)

- The app opens its own window: the control panel button, status tiles, every browser-source URL with a Copy button, and the app's console as a live log. Updates are offered there with buttons.

## 0.11.0 (2026-09-15)

- The out-of-game starter kit: corner tag, lower third, match card, player profile, bracket (four formats), standings and result strip, plus the reworked slate with hold, BRB and thanks screens. A Between games fold in the Graphics list and editors for the bracket and standings under Match data.

## 0.10.1 (2026-09-15)

- Opening a showdown switches the showdown graphic on in preview, and its row warns while it is up with no showdown open.

## 0.10.0 (2026-09-15)

- TAKE stays pinned at the top of its column. Graphics are listed in 1v1, 2v2 and Other folds. The scouted graphics moved out of Experimental and into the folds. The staged card lives under Event in Match data. Control cards can be dragged taller or shorter, and the Look card folds.
