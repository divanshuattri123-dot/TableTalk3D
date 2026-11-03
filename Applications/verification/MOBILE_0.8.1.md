# Mobile 0.8.1 — mixed human and AI seats

Verified 3 November 2026. Android version 0.8.1 / versionCode 7. File:
`TableTalk3D-0.8.1-test.apk`, 47,869,385 bytes. SHA-256:
`31d3d1760990ca3a1a43b69326e8a94ff0fa1fd4772b6c16a3b96b070fb0b986`.
Same debug signing certificate as previous APKs; update in place to retain seats.
Unity player is the unchanged 0.8.0 release d06dbcdc6206, with all eleven worlds.

## Behavior

The host may add/remove AI before START. Total seats: 2–6, with at least one
human. Every human/AI mix is supported, including 1+1, 1+5, 3+1 and 3+3.
AI receives unique colours and counts toward expanding board size. Existing
human-only saves are unchanged. No bots replace people during a running match.

Visible personalities vary cash reserves, bids, building and offer prices. AI
handles roll/move, buying, property/building auctions, rent claims, jail,
utilities, even construction, mortgages, debt liquidation and bankruptcy.
It accepts/counters/declines offers and can propose a set-completing deal once
per turn. Dice/card entropy is supplied outside the pure reducer.

Server alarms pace decisions after presentation frames. Decisions are chosen
inside the same serial checkpoint queue as human moves. AI waits for human
auction/trade responses, pauses when no viewers remain, and resumes on return.
No external AI API or paid model is used. These are strategy-based opponents,
not people or generative chat characters.

## Evidence

- 387 tests / 37 files passed; frontend and Worker TypeScript checks passed.
- Every supported 2–6-seat mix checked, including host restrictions, unique
  colours, removal, Classic/expanding sizing, old-save compatibility and purity.
- 1,500 varied decisions each in expanding, traditional Classic and Hasbro 2025
  Classic passed without a rejected move or stalled bot phase.
- Targeted scenarios cover counter-offer termination, one proactive offer per
  turn, debt/mortgage liquidation, hotel sales with no replacement houses,
  building shortages/auctions, jail cards/fines and off-turn rent claims.
- Room checkpoint tests cover an interrupted AI roll, failed persistence and
  choosing from the state after queued human moves.
- Local and deployed multiplayer tests: six seats/add/remove, exact two-viewer
  synchronization, automatic solo bot turn, waiting at the human turn, and
  no invisible moves while disconnected.
- Four real local Worker restarts preserved purchases, pending movement, rent,
  auction and idempotent action receipts. The existing PTPY test room was
  byte-for-byte unchanged across the public deployment.
- Exact packaged files were served for 844 x 390 touch-layout QA. Add AI,
  Remove AI, six-seat layout and solo START passed.
- Android build, signature and version checks passed. All 44 packaged web files
  match the prepared build byte for byte. Package budget passed.

## Remaining scope

Debug-signed test APK. No physical Android phone was connected; physical GPU,
thermal, battery and long-session testing remain. Multiplayer and AI require
internet. Store billing/ads remain inactive. Native PC/iOS packages were not
rebuilt in this mobile update.
