# TableTalk3D verification

## Current release verification - 24 October 2026 (0.5.5)

This section supersedes the historical test counts and Classic-gap list below.
The public deployment is checked separately after publishing; local success alone
is not treated as proof that the public website changed.

- Shared engine and presentation: **269 tests across 21 files passed**. TypeScript
  checks and production Vite builds passed in the public Browser project.
- **30 complete seeded games:** 15 Classic plus 15 Expanding; 2-6 players with
  three fixed seeds per player count. Every transition checks deterministic output,
  immutable inputs, inventory, debt and ownership; Classic also checks unique
  release-card circulation and retained building purchase costs.
- **66 synchronized Classic Worker actions** at three real WebSocket clients:
  highest-roll setup, ordered decks, normal/Chance utility dice, movement doubles,
  mortgage transfers and redemption, release-card trading/use, off-turn trades
  interrupting an auction, withdrawal, and exact reconnect snapshots.
- **Four real local Worker restarts passed** with exact saved snapshots for
  purchase/cash/ownership, unfinished dice, rent and an active auction. Retried
  receipts did not apply payment or movement again; idle sockets continued.
- A separate two-client accelerated reliability run covered 600 acknowledged
  actions, 175 turns, 11 trades and six exact reconnects, with a reconnect
  injected before action 17's acknowledgement. This is not an hour-long soak.
- Actual browser at **844x390 CSS pixels, DPR 2**: accepted a mortgaged-property
  trade, selected redemption, paid 143, and resumed the other player's purchase.
  Off-turn property desk, card selection, cash offer, send and withdrawal were
  exercised. No dice presentation appeared on the trade.
- Portrait **390x844** displayed the rotate-to-landscape gate. Accessible zoom,
  jail-card release, and the whole-board view were exercised. The visible
  dice-to-landing gate measured **1568 ms**, with MOVE_RESULT sent by the actual
  browser after presentation, not manually by the harness.
- Found and fixed the new finance desk's inherited dark-background/low-contrast
  labels. The rechecked desk uses the existing cream/green deed palette, readable
  place names, scrollable phone layout and 44-pixel controls.

### Native rendering and measured scope

Native player 0.5.5: content directory `e92c04784bc2`, 14,342,820 compressed bytes.
Detailed city geometry, trees, textures, models, roads, traffic and normal motion
remain; this is not a replacement art pack or a photorealism claim.

- Native compile: zero game compile errors/warnings. Actual Play-mode checks
  verified shared property instances/materials, motion reset, shadow coverage,
  1,200 tractor samples and 15 living-world actors.
- Projected labels: 96 camera states / 19,968 exact corners verified; emit only
  on rendered frames so battery-saving mode cannot advance text ahead of geometry.
- In render-interval-2 testing, 659 game updates produced 330 world-pose updates.
  Reduced motion produced zero repeated pose writes across 400 updates.
- Label painter regression: 9 initial DOM writes become one transform write for
  motion-only changes; identical geometry produces no DOM writes. This is a
  work-count reduction, not a claimed percentage FPS improvement.
- Desktop Chromium trace at 1600x900 DPR 1: 584 DrawFrame events over 18.07 seconds,
  approximately 32 presented frames/second; median gap 31.11 ms and p95 34.82 ms.
  A single trace is not a before/after benchmark or a sustained-device guarantee.
- A touch-pinch injection was unavailable in this in-app browser. No physical
  phone, iOS Safari, thermal or hour-long GPU performance claim is made.

Reproduction: `npm test`, `npm run build`, `node scripts/verify-recovery.mjs`,
`node scripts/verify-classic-room.mjs`, and the existing QA/reconnect scripts.
The scripts require disposable QA-named players; never reset real rooms.

Classic is a separate, localized digital preset, not complete official-edition
certification. See `RULES_AUDIT.md` for automatic rent, edition/card wording,
stable-decision management and last-piece scarcity-auction boundaries.

## Historical verification - 22 October 2026

This is a tested refinement pass, not a claim of zero bugs, exact replication,
photorealism, or complete official Monopoly rule compliance. No live player match
was replaced. Test scenarios use disposable rooms with QA-named players.

## Rules and recovery

- Automated suite: final full-run count recorded below before release.
- Fifteen complete deterministic matches: 2–6 players, three seeded runs each.
  Ordinary rolls, buying/auctions, trading and building reach a final survivor.
  Every action checks immutable inputs, deterministic outputs, finite house/hotel
  accounting, valid positions, integer cash and eliminated-player ownership/turns.
- Actual local WebSockets: 30 core-rule actions, eight colour-collision actions,
  and 90 expansion-room actions. Two through six clients receive identical state.
- Four real local Worker process restarts preserve exact snapshots for a purchase,
  unfinished roll, rent payment and open auction. Duplicate receipt retries do not
  apply money or movement again. Play continues after recovery and idle hibernation.
  Saved output: `outputs/qa-recovery.log` in the working delivery folder.
- Real-time public-room test: the first bare-WebSocket harness stopped after
  more than 500 acknowledged actions, after about 43 minutes. It is not counted
  as an uninterrupted-hour pass. The saved room retained all three players and
  28 purchased deeds at journal event 655. A 20-minute continuation uses the
  actual PartySocket/RoomConnection heartbeat and retry code, including a reconnect
  immediately after sending an action. Logs: `outputs/qa-real-time-soak.log` and
  `outputs/qa-resume-soak.log`. Final continuation result is recorded below.
- The actual reconnecting client also passed 600 accelerated local actions,
  175 turns, 11 trades and six exact two-client reconnects, including a deliberately
  lost acknowledgement at action 17.

Rules fixes in this pass: double railroad rent for the nearest-rail Chance card;
creditor building liquidation and release-card transfers; ordered bank estate
auctions; full hotel/district liquidation when replacement houses are unavailable.
The reducer remains pure; no random source, timer, storage or browser API was added.

## Browser interaction evidence

- Landscape layouts checked at 667×375 and 568×320 CSS pixels with DPR 2 and coarse
  pointer emulation. This is not a physical-handset or iOS Safari performance test.
- Six-player auction layout has separate deed/bidder scroll areas and reachable
  44-pixel bid/pass controls instead of a three-column panel extending off screen.
- Current Community Chest explanation remains open until Continue, survives tab
  hiding/resume, and can be restored on reload without paying its effect twice.
- Opening and submitting a cash trade has no dice overlay. Background Roll/Roll
  again is disabled while the trade composer is open. Empty offers cannot be sent.
- Incoming snapshots cannot use a stale pre-effect React presentation state to
  skip the dice gate. The actual browser's dice-to-landing test took 1,906 ms,
  with no manual MOVE_RESULT from the test. A local second tap waits for a saved
  action acknowledgement.
- The short-phone purchase dialog uses a scrollable deed beside fixed 44-pixel
  Buy/Auction buttons. At 568×320, Buy was fully inside the viewport and the full
  auction Pass target was inside its scrolling parent (bottom 297.3, height 44).
- Battery-friendly 2D fallback fits the full expanded map and has its own Fit/zoom
  controls. It is optional; the supplied detailed native 3D city remains primary.
- Mandatory debt settlement, saved seats and bounded camera dragging from the
  previous release remain in place; current regressions cover their shared rules.

## Native 3D presentation

Native player version: **0.5.3**, content directory **393793e295ed**.

- Original assembled city geometry, palette, helipads, gardens and facade details
  are retained. This pass does not pretend that the same geometry is a new model.
- The original UV2 contact-lighting atlas now supplies facade/recess occlusion.
  A lightweight URP surface gives blue/cyan glazing a smoother reflective response
  than stone and roofs. Shared static daylight reflection avoids live cube cameras.
- Reduced excessive bloom/saturation; board lettering remains screen-space vector
  type and does not depend on the WebGL framebuffer resolution.
- Fixed the real URP shadow setting: the old range was 28 units, outside the
  expanded overview camera. Range now scales with board size/camera style, and
  quality changes update URP rather than ignored legacy shadow controls. Automatic
  phones use 1024-pixel shadows, desktop 2048, Battery saver 512 with shorter range.
  All four board sizes and both camera styles pass the far-corner coverage check.
- Trees use softer canopy normals, less jagged cluster shapes and lighter foliage;
  verges sit clear of roads. Grass no longer multiplies two dark green tints.
- Road traffic reuses the supplied sports-car geometry. Tractors have wheels and
  continuous rounded turns; the boat follows the river and clears the raised bridge.
- Unchanged property geometry is retained rather than destroyed/rebuilt on every
  unrelated server snapshot. Interrupted tile lifts/scales and dice reset on resume.
- Native harness passed: three nonempty owned/developed property instance IDs
  unchanged, interrupted presentation
  reset, 1,200 tractor route samples (minimum tangent agreement 0.999999; maximum
  normalized step 0.001001), 15 moving actors. Editor frame advancement confirmed.
- Custom city shader: zero shader compiler messages in the live Editor. WebGL build
  completed successfully. Tooling probe/licensing warnings are not treated as game
  exceptions; the actual build result and rendered browser are the release gate.

The compressed native loader/data/framework/Wasm total is **14,343,107 bytes**,
versus **13,533,303 bytes** in the previous public release (+809,804 bytes, about
6%). Each file remains below the existing free static host's per-file limit.
Gzip delivery, medium stripping and the existing 128–512 MB memory settings remain.
The existing release-settings builder already covers this project; no competing
one-click optimization script or paid service was installed.

## Release record

- Full suite: **189 tests across 14 files passed**, including the 15 full matches;
  TypeScript checks and production frontend build passed.
- Public-room continuation: **passed 20.02 minutes, 244 acknowledged actions,
  79 completed turns, four trades, three exact two-client reconnects plus an
  injected reconnect before an action acknowledgement**. The same room spans
  a 67.6-minute test window, with the earlier bare-harness interruption explicitly
  retained in the log. This is not described as an uninterrupted-hour soak.
- Public Worker deployment: **d0d55b28-3e42-41d1-8a23-117d6335cd99**.
  Exact pre/post-deployment full-state comparison passed for `ALBR` (event 27,
  SHA-256 prefix `7e490e3769c7`) and the continued long-match room (event 971,
  prefix `d914117bf588`). Gzip, Wasm MIME and cross-origin asset headers passed.
  The deployed backend also passed the 30 core, eight colour and 90 expansion
  action checks with real public WebSockets.
- Code release: **b8d090fc81f6ea4fc7d61d3f3c9070a7a62729a3**. GitHub Pages
  [run 39782540320](https://github.com/divanshuattri123-dot/TableTalk3D/actions/runs/39782540320)
  completed successfully. This report is finalized in a subsequent docs-only commit.
- The actual public GitHub page was rendered and played, not merely checked for
  HTTP success. Its DOM loaded native content directory `393793e295ed`; desktop
  city/tree shadows were visible and the browser error log was empty. A new six-seat
  QA room completed its browser-driven dice-to-landing gate in **1,784 ms** without
  a test-script MOVE_RESULT. A real Buy tap purchased Mattancherry Palace for ₹60.
  Reload restored both the owned deed and the exact ₹1,440 balance.
- Public layouts verified at 1600×900 desktop, 667×375 landscape and 568×320
  purchase view. The public Buy button was 44 CSS pixels high and entirely inside
  the 568×320 viewport. Whole-board mobile framing was checked after camera easing.
  Full-board labels are naturally small on a 64-space phone overview; zoom and
  property inspection remain available. No error messages were captured in these
  public checks. Screenshots in the working delivery folder:
  `outputs/qa-public-053-desktop.png`, `outputs/qa-public-053-mobile.png`, and
  `outputs/qa-public-053-purchase-568.png`.

## Known limits and remaining rule work

No physical-phone thermal/frame-rate, touch-gesture hardware, Safari/iOS or exhaustive
all-sequence certification is claimed. Mobile users can choose Battery saver or the
2D fallback if their device cannot sustain the detailed 3D view. There is no fixed
one-hour match timeout, but browser storage clearing still loses the local seat ID;
the server's saved match is separate. Earlier lost memory-only games cannot be
reconstructed.

The expanding India board is a requested custom mode. Full ordered 16-card decks,
unique held-card circulation/trading, transfer-interest debt decisions, fresh utility
dice, building scarcity auctions and arbitrary off-turn management remain gaps.
Automatic retail-net-worth elimination is also the original custom rule, not a
complete realizable-liquidation test. The detailed gap ledger is `RULES_AUDIT.md`.
