# TableTalk browser game

Play: <https://divanshuattri123-dot.github.io/TableTalk3D/>

This is the India edition of a classic property-trading board game: Kochi,
Chennai, Bengaluru, Kolkata, Hyderabad, Jaipur, Delhi and Mumbai form the main
colour districts, with more Indian landmarks added to the 4–6 player maps.
Deeds include Indian locations, region labels, local descriptions and rupee
prices. The familiar 40-space loop and property-trading rules stay recognizable.

This React/Vite app is published for free with GitHub Pages. It connects to the
separately hosted Cloudflare Worker for live rooms and the 3D asset catalogue:

- Realtime rooms and game state: `table-talk-realtime.divanshuattri123.workers.dev`
- Large Unity and game asset files are served by that Worker, not duplicated in
  this GitHub Pages bundle.

GitHub Actions rebuilds `Browser/` on pushes to `main` and publishes its `dist/`
folder. It uses the repository URL prefix (`/TableTalk3D/`) and the public
Cloudflare host values from `.github/workflows/deploy-pages.yml`. These are
public service addresses, not credentials. GitHub Pages only hosts static
files; it cannot run the room server.

## Saved matches and reconnecting

Every confirmed action is checkpointed in the existing room's Durable Object
storage before broadcasting. Server restarts, hibernation and new deployments
restore cash, deeds, player positions, the active turn and pending rolls,
auctions, trades or debt. There is no one-hour match timeout. No account,
external database or paid service has been added.

After an interruption the browser keeps the board visible, reconnects
automatically and waits for the canonical snapshot before enabling turn controls.
An unacknowledged action retries with its original receipt, so rent, purchases
and dice do not apply twice. Heartbeats recover silent broken connections;
returning to a phone tab triggers a resync. Keep the room link/code. Reopening
that link in the same browser restores the saved seat even after closing its tab.
Clearing browser data removes that local identity, not the server checkpoint.
Progress already discarded by the former memory-only server cannot be recovered.

Dragging the 3D board does not select browser text or create image drag ghosts.
Trade offers never replay the previous dice animation; dice animation is limited
to actual roll outcomes. The original detailed city geometry is retained.

## Local run

Install Node.js 22.12 or newer, then run:

```sh
npm ci
npm test
npm run build
npm run dev
```

For local Vite to connect to the live room and asset server, set
`VITE_PARTYKIT_HOST=table-talk-realtime.divanshuattri123.workers.dev` and
`VITE_ASSET_HOST=https://table-talk-realtime.divanshuattri123.workers.dev`
in the shell before starting Vite. The full local Cloudflare/Unity asset build
pipeline remains in the original development workspace; generated binaries and
the extracted asset archive are intentionally not copied into this static-site
folder.

Each player must use a different token colour in a room. Entering a room code
previews occupied colours without taking a seat. Taken swatches are crossed out
and disabled; the shared reducer also rejects a colour collision if two friends
join simultaneously. A rejected join can pick another colour and retry. Players
may change to a free colour under “Your token colour” in the lobby, but colours
lock once play starts. Legacy lobbies with duplicates must resolve them before
Start becomes available.
`npm run test:colors` exercises concurrent joins, retries, colour changes and
the start lock against a real local room server; set `ROOM_SERVER_URL` to test a
deployed server instead.

The cinematic Unity city is the default renderer. Saved preferences from the
older collection-only release migrate back to it. The table fills the viewport;
Create/Join requests native full screen when available, with a toggle inside the
game. The HUD, property tools, player list and event log overlay the table.
Phones use landscape-first play with drag, pinch and tap camera controls; 2D
remains available in Settings. Create/Join and the in-game fullscreen button
request landscape orientation where the browser supports it. Portrait phones
show a rotate-phone screen; browsers that refuse orientation/fullscreen still
work after physically rotating the phone. Leaving the table releases the lock.

Desktop and mobile names and prices are a browser-text layer anchored to Unity's
projected tile bounds, so reduced 3D quality does not blur them. Names stay visible at
whole-map scale. Prices sit horizontally below the names, inside each tile.
The self-hosted Barlow Condensed typeface keeps the printed-board layout compact;
names wrap only between words, so Chance and other words never split into pieces.
Original vector signs distinguish Chance, Community Chest, stations, utilities,
taxes and all four corners. These stay sharp independently of 3D render resolution.
Type grows as the player zooms. The [Barlow Condensed source](https://github.com/google/fonts/tree/main/ofl/barlowcondensed)
is bundled locally; its license is included in `public/fonts/`.
The in-game ₹ button opens all bank prices and links to the full deed inspector.
Canvas resolution tracks resizing and quality
changes without restarting the room or Unity player. See Unity's supported
[manual canvas sizing](https://docs.unity3d.com/Manual/webgl-canvas-size.html).

The native city is surrounded by curved highways, alternating crop fields, a
coastal river and a bridge. Cars, tractors, a boat and wind-turbine rotors animate
only in the presentation layer; they never change the deterministic game state.
The scene respects the browser's reduced-motion setting. The static landscape is
batched separately from moving actors, and decorative geometry has no physics
colliders. Native city assets and gameplay rules remain unchanged.

Native release 0.5.0 restores the colour/lighting profile's missing serialized
effect references: ACES tonemapping, moderate contrast/saturation, restrained
quarter-resolution bloom and a light vignette. The same detailed towers,
stations, low-rise buildings, rooftops and gardens are retained, not replaced by
generic blocks. Browser signs now project after camera movement in the same
rendered frame; reusable projection buffers avoid per-frame anchor allocations.
Panning is bounded so a swipe cannot throw the entire board out of sight.
Automatic mobile/battery-saver graphics targets 30 fps; high detail targets 60 fps.
These are frame caps, not claims of measured performance on every phone.

## Engine

`src/engine/reducer.ts` is the deterministic shared game reducer.
`party/server.ts` is its PartyServer room implementation. Vitest covers the
game rules; `npm run test:rooms` can verify the live Worker when
`ROOM_SERVER_URL=wss://table-talk-realtime.divanshuattri123.workers.dev` is set.

Negative cash enters mandatory debt settlement. Only selling improvements,
mortgaging, a rescue trade or bankruptcy is allowed until the shortfall is paid.
Off-turn Community Chest debts pause the roller and are resolved in order.
The creditor receives actual paid cash, not the unpaid balance. Card effects
are applied by the reducer once; each viewer reads the card until Continue.

`node scripts/prepare-debt-room.mjs prepare CODE ws://127.0.0.1:8790` prepares a
local browser room for card/debt QA using normal actions. The room must contain
only players named `QA ...`. Reload that browser, then run `draw` instead of
`prepare`. Use the UI to mortgage or declare bankruptcy and run `assert-settled`
or `assert-bankrupt` to verify the canonical server result. This never requires
a debug state-injection endpoint.

See [RULES_AUDIT.md](RULES_AUDIT.md) for the official-rule comparison, known gaps
and the difference between a passing regression suite and full rule compliance.
