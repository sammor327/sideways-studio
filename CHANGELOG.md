# Sideways Studio patch notes

One section per release, newest first, in the operator's words. The app
window shows these under "What's new", the release script publishes the
current version's section as the GitHub release notes and the update
prompt's text, and it refuses to publish a version that has no section
here. Write the section before running `npm run release`.

## 0.32.0 (2026-09-19)

- Standings rank by points during a round again. Standings loaded from the Tournament platform mid-round had every player on 0 points (TopDeck's own standings only catch up once a round ends) and so were sorted by name; the app now counts the finished tables itself until TopDeck's numbers agree with them. While a round's tables are still being played the line under the title says "Round 2 in progress" instead of "after Round 2", and a freshly paired round's byes wait for its first result.
- Standings are always in order: by points, or by record (a win 3, a draw 1) for a list with no points, highest first, ties in the order they came. That goes for standings typed by hand too; a list with no points leaves the Points column empty and says it is ranked by record.
- Standings by group: Standings to preview on the Tournament platform tab loads every group at once (pick "Group 2 only" for one group, or "Everyone, one list"). The graphic shows one group at a time, its name beside the title. Switch groups with the Group buttons beside the page arrows under Graphic features › Standings; › runs on from a group's last page into the next group's first, so one button walks every page of every group. A group change on air turns like a page.
- Standings by hand: a line "# Group 2" in Match data › Standings starts a group.
- New graphic: Ongoing matches, the tables of the round still being played, for the wait at the end of a round. It draws the pairings (Pairings to preview on the Tournament platform tab, or Match data › Pairings) minus every table with a result: up to 12 tables in one big column, more in two columns, 32 a page. It is under Between games, after Pairings.
- Tournament platform: Keep results up to date, on air too (on by default). Every refresh brings finished tables into the pairings that preview and program already hold, without a TAKE, so the Ongoing matches empty themselves as tables finish and the Pairings fill in their results. It never changes which round is loaded or which graphic is up.
- Pairings hold 160 tables now (five pages), enough for every group of Convergence #3's rounds at once.

## 0.31.0 (2026-09-19)

- The card popup docks into the rows overlay. With the rows overlay up, a card you stage and TAKE no longer flies in over the table: the hands (or the event logo) slide out of the middle of the left column and the card slides in over the column with its name and type under it. Take the card popup off and the card slides out and the hands or the logo come back. A new card while one is docked swaps it the same way, and cards typed into a hand meanwhile are there when the hands return.
- Dock featured card, a new switch in the rows overlay's Graphic features (on by default), turns this off: the card popup then flies in over the feed as before.
- Dual columns: the docked card now takes the bottom right from player 2's cards in hand. The hand slides out, the card slides in, and the hand comes back when the card popup goes off; before, the hand kept the slot and the popup flew in over the table instead. With no hand listed, the empty card frame slides out for the card the same way.
- Dual columns: every change at the bottom of a column now slides. The event block slides out for player 1's hand and back when it clears, the card frame slides out for player 2's hand, and a card change slides the old card out and the new one in.
- The card popup's search shows under Graphic features whenever the rows or dual-column overlay is in preview with its dock on.

## 0.30.0 (2026-09-19)

- New: Live game, at the top of Match data. Type a RiftAtlas room code (or paste the caster link) and press Connect: the game in that room fills Match data as it is played. Points, game wins, both hands, the battlefield in play, legends, champions, the turn counter and whose turn it is follow the game by themselves, and a best of three is followed from game to game. The fold lists every card played, and a click on one stages it in the card popup.
- Live values go straight to air, like the clock, while the players on air are the players in preview. Load a new pairing into preview and they wait there until TAKE. Switch "Live values straight to air" off to keep everything in preview.
- Names never change by themselves, so names from the Tournament platform stay as they are. Load players brings RiftAtlas's names, legends, battlefields and each player's full deck into preview, for a match nobody loaded from TopDeck.
- It needs a RiftAtlas account with caster access. Press Sign in once: RiftAtlas opens in its own window, you sign in there (Google works), close it, and the reader starts on its own, out of sight. RiftAtlas keeps you signed in after that.
- "Stage each card played in the card popup" puts every card a player plays into the card popup in preview, ready for TAKE.

## 0.29.0 (2026-09-19)

- New graphic: Pairings, every table of the round on one graphic, 32 tables a page in two columns. Each table reads across: the table number, the player's legend portrait, name, record going in and legend, then VS, then the opponent. A finished table shows its games with the winner's number in the accent colour and dims the player who lost; a draw says so. The byes and how many tables have finished run along the bottom. It is under Between games, after Standings, with Page, Legends and Results in its Graphic features.
- Tournament platform: Pairings to preview loads the round picked under Matches, or only the picked group's tables when a group is on, with every result so far and the round's byes. Press it again during the round to bring in new results; the page on screen stays where it is.
- Pairings by hand: Match data › Pairings takes one table a line, like "Table 12: Dax (US, 2-1) [Viktor] vs Shoji (KR, 2-1) [Yasuo] = 2-1". Add "= draw" for a draw, "= W-L" or "= L-W" for a win with no games reported, and a "Bye:" line for the players sitting out.
- Standings: each player's legend portrait now sits before their name, bigger, with the legend's name in its own column to the right. The new Legends switch in the standings' Graphic features takes both away for an event whose legends are not known yet, and a note under it says when some players have no legend.
- Standings: a very long name now gets smaller to fit its column instead of pushing the numbers across.
- Legend distribution: data arriving while the graphic is on air no longer shows an empty panel for a moment before the pie draws, and clearing the data lets the rows leave before the "no legend data yet" line comes in.

## 0.28.0 (2026-09-19)

- New graphic: Legend distribution, under Between games. The most played legends as a pie on the left and a table on the right: each legend's face, its name, its share of the field and its win rate. The pie sweeps round with each face landing on its slice, and the rows follow one after another.
- Win rate switches on and off under Graphic features, and the note under the graphic saying how the win rates were counted goes with it. Legends shown sets how many legends get a slice and a row of their own (eight at most); the rest fold into a grey Other.
- Fill it under Match data › Legend distribution: one legend per line with how many played it and its win rate or record (Kai'Sa | 42 | 55.1, or Jinx | 30 | 45-37). A share with a % sign works for a list of percentages, a column with one legend per player counts itself, and Players sets the field size when the lines list only some legends. Count from standings counts the standings you already have.
- Tournament platform: Legend distribution to preview counts a TopDeck event or one group: how many played each legend and each legend's win rate against the others, with mirror matches, draws and byes left out. TopDeck shows legends once the event ends or the organizer allows it; until then the button says so.

## 0.27.0 (2026-09-19)

- New graphic: Head to head, VS, the Sideways Showdown head to head. Both players' legend cards stand tilted either side of a big VS, the names in the design's silver, the round and the event name underneath, and your logo from Look between the cards. It builds in (the cards fly in, the VS lands, the names slide across) and plays backwards on the way out. It is under Between games, beside the Match card, which stays as it was.
- New background: Glowing arrows (Sideways Showdown), the smoke and glowing arrows from the same design. Pick it under Look for all graphics or for any one graphic. The slate, the bracket and the standings now stand on it by default, darkened a little so small type stays readable; Look puts any of them back.
- Standings animate: the rows come in one after another from the top when the standings come on, and a page change slides the old page out and the new page in (the next page from the right, the previous page from the left).
- The chain beside each graphic's star copies that graphic's browser-source link, ready to paste into OBS or vMix, and turns into a green tick once it is copied.

## 0.26.0 (2026-09-19)

- New tab: Tournament platform. Connect a TopDeck.gg event by pasting its link (an API key is optional) and the app reads it again every 30 seconds.
- Pick any match from the round's list (filter by group, search by player) and both players load into preview at once: name, record going in, legend, pronouns, and once TopDeck shows decks, their decklist, champion and three battlefields. The round title fills in too, like "Round 3 · Group 2". TAKE airs it.
- A new pairing starts at 0 points and games and clears the last players' typed extras; clicking the match already up keeps your counts. Swap sides flips the players.
- Standings to preview writes a group's standings with TopDeck's own tiebreaks, and Bracket to preview writes the Top 8 or Top 16 as it stands. The + beside a match adds it to the Up next board.
- Every graphic that draws the event's data sits on the right of the tab, showing your preview, so you see what a click filled before you TAKE.
- Standings: the line under the title can now name the group ("Group 2 · after Round 3"). Standings typed by hand in the Studio clear it.

## 0.25.0 (2026-09-18)

- No name is cut short with "..." any more. A player, team, legend, deck or event name too long for its box is set smaller until the whole name fits, on every graphic, and goes back to full size for a shorter name.
- Sponsor plate: pick a corner while it stays docked. With Dock into the overlay on (the default), Top left, Top right, Bottom left and Bottom right put the plate in that corner of whichever in-game overlay is up, clear of its panels and in its look; Auto is the overlay's own spot as before. With it off, the corners sit on the frame edge as before.
- Sponsor plate on the POV overlay: its own spot moved above the featured card, which it used to cover.
- Game intro and sideboard fly-in: they now play underneath the in-game overlays, so the sideboards slide out from under the overlay's panels. In OBS, put their browser sources below your overlay's (the combined output source already does).
- Match data: a Populate from decklist button per player, under Decks and battlefields, fills their legend, champion and three battlefields from their decklist in one press.
- Rows overlay: the stray line under Active turn is gone. It was the divider between the two hand lists, and it now shows only while both hands are listed.

## 0.24.2 (2026-09-18)

- A font picked under Look now reaches graphics that are already open. Before, a font downloaded after a browser source opened (a first pick, or Download all fonts) stayed in the default font until the source was refreshed. Refresh your browser sources once after this update; from then on font changes go live on their own.
- Decklists side by side: the header is gone (the event name and its diamond, the DECKLISTS title and the round), so both players' lists run the full height with larger cards.
- Decklists side by side and the sideboard fly-in: every card now finishes coming in. Before, the last cards of a long list stayed partly faded and slightly low.

## 0.24.1 (2026-09-18)

- Player profile: the diamond beside the event name is gone.
- Player profile: a Live camera switch. Turn it off to hide the camera window bottom right when there is no player feed.
- Player profile: a Decklist switch. With it on, the player's own list (from Match data, Decks and battlefields) runs down the left under their details, with the deck name and rune counts over it. The top finishes make room for it.
- Look: a Download all fonts button saves every font in the list on this computer at once, so any of them works at a venue with no internet.
- The TES default font is now Aktiv Grotesk wherever it is installed or activated in Adobe Fonts, and Segoe UI where it is not. The Font section says which one this computer will use.
- Match data: the This game battlefield buttons are all the same size.

## 0.24.0 (2026-09-18)

- New graphic: Game intro. The round and the game number over both players' legend art, name, champion and this game's battlefield, with a VS between them. It builds in over the game area of whichever in-game overlay is up.
- New graphic: Sideboard fly-in. Both players' sideboards at once, player 1 across the top flying in from the left and player 2 across the bottom from the right, filling the game area (or one player alone).
- New graphic: Decklists side by side. Both players' decks, full screen: legend, runes, champion, battlefields, main deck and sideboards.
- Match data has a new Decks and battlefields section: pick each player's saved deck or paste a list, set the three battlefields they brought (loading a deck fills them in), and click This game to mark the one being played.
- Rows overlay: a new Battlefields option. A strip beside each player's camera with their three battlefields, an arrow on this game's and the ones already played greyed out, or just this game's.
- Clocks no longer change width as they tick, so nothing beside a clock moves. This covers every graphic's clock and the panel's own.

## 0.23.0 (2026-09-18)

- New tab: Look and setup, beside Studio at the top of the panel. The look controls run down the left and every graphic is laid out on the right, 30 in all (including the slate's four screens, the lower third's three and both showdown styles), so you see a change on all of them at once.
- The graphics there show a made-up sample match, so none of them is empty while you build a look. "Your preview" switches them to your own data. Pick what shows behind the overlays (grid, dark, light or a felt table) and the tile size; the arrow on a graphic opens it large.
- Click a graphic to edit its own look. A graphic flashes when a change reaches it, and the ones a change will not reach fade out.
- Setup (card database, browser source links, updates) moved to the same tab, under the look controls.
- Studio: the Decklist has its own column now, beside Graphics and Graphic features.
- Look changes still air the moment you make them, as before; the new tab says so.

## 0.22.0 (2026-09-18)

- Rows overlay: upload or remove the event logo right from the rows options, with the recommended size beside the button (PNG or SVG, transparent background, about 720 x 440 or larger). It is the same logo as the one under Look, so it changes everywhere.
- Rows overlay: the hands slide in from the left edge of the column and back out. The logo slides out before a hand comes in, and comes back once the hands have gone.
- Rows overlay: the round clock now sits at the right end of the bottom bar, with its own Round clock checkbox.
- Rows overlay: the round title and turn sit under the event logo.

## 0.21.0 (2026-09-18)

- Rows overlay: your event logo now sits in the middle of the left column, between the two cameras. No logo uploaded? It shows the event name instead.
- When a hand is listed under Cards in hand, the logo slides out of the way, and it slides back in once the hands are cleared.
- Switch it off with the new Event logo checkbox next to Active turn, Points and Turn counter.

## 0.20.0 (2026-09-18)

- New graphic: Sponsor plate. A 3:1 plate that rotates through your sponsors and fits itself into whichever in-game overlay is up, in that overlay's colours: over the logo panel on the 1v1 and 2v2 sidebars, over the event block on the dual columns and portrait pillars, in a spare corner on the rows, 2v2 bars and arena bug, above the column on the POV. Or pin it to any corner.
- Add sponsors under Graphic features > Sponsor plate: upload art (600 x 200 is ideal) or just type a name. Reorder or remove them there, set how long each stays up, add a tag such as "Presented by", and optionally have it pop in on its own every few minutes.
- The plate has its own browser source (put it above your in-game overlay) and is in the all-in-one output.
- Rows overlay: Active turn, Points and Turn counter can each be switched off, like Cards in hand ("Hidden information" is now called "Cards in hand").
- Rows overlay: the POINTS label sits toward the middle of the frame (under the box on the top bar, over it on the bottom), so the top one is no longer cut off, and it is bolder.

## 0.19.0 (2026-09-17)

- Every card comes with the app. The card list, all 932 card thumbnails and the legend cutouts are inside Sideways Studio itself: open it on a machine that has never been online and card search, the pickers, the decklist and every graphic already work.
- "Download card database" is no longer a thing anyone has to press. It stays for checking whether a new set has appeared, and a check that cannot reach the card database now says so plainly instead of reporting an error: your cards came with the app, and new sets arrive with app updates.
- "Download all card art for offline use" fetches one file from the release rather than nine hundred separate images, and it is kept when you update, so you download the full art once and never again.

## 0.18.1 (2026-09-17)

- Cards in hand: a hand can list up to 20 cards. It was 12.
- Fixed: after about nine cards, the "Add a card" search list opened below the bottom of the panel, where it could not be clicked. It now opens right under the search box however long the hand is.
- A full hand says so: the search box reads "Hand full: 20 cards" until you remove a card.
- Hand fan and showdown: a long hand still fits. The fan keeps its width and the cards overlap more, and the showdown's small cards step down a size past 14.

## 0.18.0 (2026-09-17)

- Cards in hand, on the rows and dual-column overlays: the hand keeps the order you typed it in. It is no longer split into Reactions, Actions and Units and gear.
- Copies of a card share one row with a count on the left: 3x, 2x, 1x. A copy played onto the chain gets its own greyed row.
- A hand too long for its space scrolls: five seconds at the top, down to the last card, five seconds there, then back up, and round again.
- New Card art switch beside "Hand as": a strip of each card's art beside its name, in either hand style. It starts on.
- "Lanes by type" is now "Marked by type": the same list, with reactions marked green and actions blue. On the rows overlay, Showdown open lights the reactions still in hand.
- Rows overlay: a short hand keeps its full height and a long one gets the rest of the column; two long hands share it evenly.

## 0.17.0 (2026-09-17)

- Match data: Legend, Battlefield and Champion now read like Featured card, with the card's picture beside its name and an X to clear it. The same goes for the 2v2 teammate lines and the showdown's battlefield.
- Match data: Record sits right under the player name, and the fold it came from is now called Extended player details.
- Match data: Points and Game wins are the same size, so their plus and minus buttons line up.
- Hands and showdown: the Unknown cards counter is gone. Set the hand count, list the cards you can see, and the rest are shown as unknown cards by themselves. Listing more cards than the count raises the count.
- Hands and showdown: cards in hand are rows with the card's picture, like Featured card. Reactions and actions light up in the player's colour, blue for Player 1 and green for Player 2.
- Hands and showdown: a line marks where the turn and showdown controls start.

## 0.16.0 (2026-09-17)

- Favorites: every graphic has a star beside its name. Star one and it moves into a Favorites fold at the top of the Graphics card, above 1v1; click the star again and it goes back where it was. Favorites opens on its own when it holds anything, and your stars are remembered on this computer.
- In preview: the column between the monitors lists what is in preview, in green, above the red "On air now" list. The X beside a name takes that one graphic out of preview; nothing on air changes.
- TAKE now starts level with the top of the Preview and Program windows, and the buttons under it are a little tighter to make room for the two lists.
- Fixed: the drag handle at the bottom of each card left a thin strip under it where scrolled content showed through.

## 0.15.1 (2026-09-16)

- Updating from 0.14.1 or 0.15.0: if a window titled "find" and a number opens and nothing happens, click that window, press Ctrl+Z, then Enter. The update finishes and the app restarts. You only need this once, for this update.
- Fixed: installing an update could stop at that "find" window and never restart the app, on computers where Windows Terminal is the default terminal. From this version on, the app finishes its own updates with no extra windows.

## 0.15.0 (2026-09-16)

- Match card and player profile: the legends are now the full high-resolution figure art, sharp at that size, instead of a small close-up stretched to fill the space.
- The card popup's search and staged card, and the card row's four card slots, moved from Match data into Graphic features, beside each graphic's other options.
- Click the Card popup or Card row picture (or its OFF button) with nothing picked and its section opens in Graphic features, ready to search. The card popup's search also shows while the dual-column or portrait pillar overlay is in preview with Dock featured card on.

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
