# TableTalk3D refinement verification — 22 October 2026

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
