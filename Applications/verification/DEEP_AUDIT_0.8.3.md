# TableTalk3D 0.8.3 bug audit

Audit date: 4 November 2026. This update fixes five reproduced root causes.
It does not certify that every possible bug or device problem is eliminated.

| Reproduced problem | Correction | Regression evidence |
| --- | --- | --- |
| A browser goes offline, starts a replacement socket, then receives its online event while that socket is still CONNECTING. The later handshake leaves the offline flag set and controls never return. | A completed handshake clears the old offline flag; controls still wait for the authoritative snapshot. Pending actions retain their receipt IDs. | Unit regression, real WebSocket race, lost-ack retry, actual browser offline/online check. |
| A compulsory rent claim reduces the highest building-auction bidder's cash below its reserved bid. The reservation can also lock the only district that could be mortgaged to clear debt. | Reconcile active and suspended bids after compulsory payments. Release an unaffordable or invalid winning bid and reopen the auction so debt can be resolved. | Rent-to-auction tests verify the new winning bidder, money and house supply; mortgage test clears debt and resumes auction. |
| Bankruptcy of the active bidder advances the turn while leaving an unfinished auction attached. Older saved rooms can already contain this orphan. | Finish the pending auction before movement; remove bankrupt participants and invalid sites. Repair an older orphan deterministically and checkpoint the repair before sending state or scheduling AI. Close an auction with no eligible building sites. | Bankruptcy/next-turn regression, reconnect repair, empty-site regression and idempotent checkpoint/receipt tests. |
| A custom dice model arrives after the default placeholder pair has been cached. The placeholder remains indefinitely. | Invalidate the cache on registration. Refresh resting dice immediately, or use the new mesh on the next throw without interrupting a current throw. | Actual Unity before/after regression, idle arrival, arrival during a throw, subsequent throw and interruption cleanup. |
| Normal player snapshots cancel custom-model downloads after marking those IDs requested. In-flight pieces may never register. The converter is also imported for bundled pieces that do not need it. | Give downloads the lifetime of their Unity instance, deduplicate pending loads, retry failures and suppress completion after disposal. Check bundled IDs before the dynamic import. | Four stream-lifetime tests; real browser GLB held across a mortgage snapshot then released exactly once; bundled run has zero converter requests. |

The auction reconciliation is TableTalk's deterministic policy for stale or
unaffordable bids. It is not presented as a verbatim Hasbro instruction.
The shared reducer remains pure; no randomness or timers were introduced.
Saved checkpoint schema remains version 1 and action receipts are preserved.

## Completed checks

- 412 Vitest tests across 43 files passed; browser and Worker TypeScript checks
  and the production browser build passed.
- 18 sustained seeded match scenarios: expanding, Classic traditional and
  Classic 2025, each with 2 and 6 seats and three seeds, up to 2,000 actions per
  scenario. These check accepted bot decisions, valid positions/economy,
  building-stock conservation, bankrupt ownership and debt pauses.
- Real local Worker recovery: four process restarts, two clients, purchase,
  ownership/cash/turn, mid-roll, rent, auction, duplicate receipt retries and
  idle hibernation restored exact snapshots and continued play.
- Real client transport: delayed initial snapshot, lost acknowledgement retry
  applied exactly once, online-during-CONNECTING race recovered unchanged state.
- Actual Unity Editor 6000.6.6f1 compiled with zero errors/warnings. The approved
  build-control CLI update is 1.0.0-beta.16. The editor/project was not upgraded.
- Unity web player 6e5932dc9583 built successfully, product version 0.8.3.
- In a landscape touch-sized browser: native dice remained playable after
  offline/online recovery; a delayed custom dice download survived a mortgage;
  custom dice rolled, the token moved, and Victoria Memorial's purchase deed
  appeared without console errors. Screenshots and JSON evidence accompany
  this report. Browser emulation is not physical Android performance testing.
- Android Gradle APK/AAB build succeeded. Package verification compares every
  shipped web file against the current build and rejects unexpected old files.

## Android artifact

- Package: com.tabletalk.game; versionName 0.8.3; versionCode 9.
- APK: TableTalk3D-0.8.3-test.apk, 47,873,021 bytes.
- SHA-256: e5a2184111a6b7b977c0385f80d26fffd33a93ce681c6d067b759e698de6abc9.
- All 44 web files match; no mismatches or unexpected public assets.
- APK signature verified. This is the same Android Debug certificate used for
  the preceding test build, not a production upload key.
- Release AAB is prepared but unsigned. See release-readiness-0.8.3.json for
  production-account, signing, policy, asset-evidence and physical-device gates.
- No real ads or billing were enabled. Advertising spend remains INR 0.

Public deployment, saved-room preservation, retained player streams and public
APK download are recorded separately in the live verification evidence.

## Limits and next acceptance work

No physical Android phone was connected. Smooth frame pacing, GPU memory,
thermal behaviour, battery use and prolonged foreground/background cycles on
Android 12+ need real-device testing before store release. The seeded matches
and recovery checks cover important boundaries but do not prove every rule
combination or arbitrary network failure. iOS signing still needs a Mac/Xcode.
