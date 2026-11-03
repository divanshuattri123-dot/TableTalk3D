# TableTalk3D 0.8.2 test verification

Verified 3 November 2026. This is a test release, not production/store approval.

## Dice and presentation

- Real Unity 3D mesh pair on the board; a transparent accessible target follows
  projected mesh bounds. Only the current player can throw.
- Packaged game at 844 x 390 touch layout: tapped dice, watched the native roll,
  unobstructed movement, New Delhi Railway Station offer and purchase. Cash
  changed from 1,500 to 1,300. AI completed its turn and returned control.
- Result readout stayed at x=10, y=66, width=210, height=62.8. Board centre hit
  the Unity canvas during roll and move, rather than a number/modal overlay.
- Chance card text and Continue were visible. Opening Trade triggered no roll;
  the native dice target disappeared while trading and returned on close.
- Out-of-turn dice target absent. At 667 x 375 the projected hit area was
  127.7 x 86.9 pixels, entirely within the viewport, and hit testing found it.
- At 1366 x 768 the projected PC target fit the viewport and hit testing found it.
- Native Play-mode frame counter advanced. Idle pair and positive projection,
  disabled dice hiding, rolling mesh visibility and interrupted-roll cleanup passed.
- Actual mobile screenshots: mobile-0.8.2-tap-dice.png, -dice.png, -move.png,
  -purchase.png and -small-phone.png. Layout samples are stored alongside them.

## Automated and hosted checks

- Vitest: 395 tests / 40 files passed. Frontend and Worker TypeScript builds passed.
- Coverage includes all 36 dice outcomes, doubles, utility dice, auction sequencing,
  card acknowledgement, stale completion, callback timeout and duplicate receipts.
- Room recovery: local Worker restart, pending movement, purchase, rent, auction
  and idempotent receipt scenarios passed. Updated RoomConnection reconnect test passed.
- Live server: one human plus AI, two synced viewers, no invisible bot play in an
  empty room, saved AI resume and waiting for a human action passed.
- Worker f960d80a-b698-4db0-8575-0929afa94607 serves the new player 54ab18f662cd.
  All three streamed data files, including earlier player hashes, matched SHA-256,
  compressed byte lengths and CORS headers. All 6,430 catalog assets staged.
- Saved QA room PTPY was byte-identical across deployment. SHA-256:
  92dc2a3512460c26c0191d6d4d1b12958a9a32e0c062f8efcc6f263000a3889d.

## Public browser and download

GitHub Pages deployment run 41596220751 succeeded. In a fresh public QA room
RTMJ, the real Unity pair was present, the old Roll slab was absent, and clicking
the dice produced double sixes followed by movement to the City Power Grid
purchase decision. Public browser loaded native player 54ab18f662cd. The public
APK was downloaded back and matched the exact local byte count and SHA-256.

## Android package

- APK: 56,745,613 bytes, version 0.8.2 / code 8.
- SHA-256: 158b1136f38c799b2bb73a7e055173682f7f69a22e4fb6078ce4e724db49bad3.
- All 44 packaged web files exactly match the prepared web input.
- apksigner verification passed; same Android Debug certificate as the previous test.
- assembleDebug and bundleRelease passed. Release AAB is explicitly unsigned.
- Android lintRelease passed with warnings (launcher resources, dependencies and
  manifest/API suggestions); this is not a zero-warning production certification.
- Mobile budget passed without adding filler. Optional collections stream on demand.

## Remaining release gates

No physical Android device was connected. Android 12+ GPU/thermal/battery and
long-session, background/resume, tablet/foldable and real installation testing
remain pending. Browser emulation does not establish those results.

Owner confirmed no Play/ad accounts. Production upload signing, commercial asset
rights evidence, publisher support/privacy information, Play content/testing and
family-audience monetization setup remain pending. The AAB cannot be uploaded
unsigned. No real billing, live ads or campaigns were activated; ad spend is INR 0.
See publishing/RELEASE_HANDOFF.md and publishing/DEVICE_QA.md.
