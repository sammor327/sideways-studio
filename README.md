# Sideways Studio

Locally hosted broadcast graphics and transparent overlays for Riftbound
streams. Launch it, open the control panel in your browser, and add each
graphic to OBS or vMix as a 1920x1080 browser source. Built by Sam Morris /
Turn'em Sideways.

## Run (the app)

Double-click **SidewaysStudio.exe**. It starts the server, opens the control
panel in your default browser, and prints every browser-source URL in its own
window. Leave that window open while you stream; closing it stops the
graphics.

The app is one self-contained file: the server, the control panel, every
scene and the legend art are inside it. On first run it creates a `data`
folder beside itself for the card database, downloaded fonts and the event
autosave, so the whole thing is portable. Copy the exe and its `data` folder
to a USB stick or the venue PC and it works there, offline.

`SIDEWAYS_PORT` overrides the port. `--no-open` skips opening the browser.

## Updates

Every launch asks the release channel whether a newer build exists. If one
does, the app's own window offers it:

```
  Update available: 0.1.0 to 0.2.0
  [Y] update now   [N] not now   [S] skip this version   starting in 15s
```

Nobody answering starts the version already installed, so an unattended
machine always comes up. The control panel also shows a banner with the same
choice, which is the one to use between matches if you skipped it at launch.

A release can be marked `required`, and only those install themselves when
the prompt times out. That is the lever for pushing an urgent fix.

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
in the panel's Setup card and printed when the server starts.

`npm start -- --open` also opens the panel in your default browser.
`SIDEWAYS_PORT` overrides the port.

## Layout

- `server/` — zero-framework Node server: static files, `/api/state`,
  `/api/update` (whitelist-sanitized), WebSocket hub at `/ws`.
- `web/stage/` — shared scene framework: sync client (version-gated repaints,
  reconnect + resync), occlusion-proof seek-clock animation, 1920x1080 stage
  geometry.
- `web/scenes/<name>/` — one folder per broadcast graphic.
- `web/panel/` — the operator control panel.
- `docs/SPEC.md` — locked product spec. `docs/LOOP.md` — build protocol and
  roadmap. `docs/PROMPT.md` — session prompt for the next build loop.
- `data/` — runtime autosave (gitignored).

## URL parameters (every scene)

- `?transparent=1` — transparent background for compositing over program
- `?anim=0` — kill switch: all motion snaps to settled state
- `?theme=` — reserved for the theming part
