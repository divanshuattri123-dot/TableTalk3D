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

## Engine

`src/engine/reducer.ts` is the deterministic shared game reducer.
`party/server.ts` is its PartyServer room implementation. Vitest covers the
game rules; `npm run test:rooms` can verify the live Worker when
`ROOM_SERVER_URL=wss://table-talk-realtime.divanshuattri123.workers.dev` is set.
