# Public 0.8.3 verification

Verified 4 November 2026 after deployment, not inferred from a build exit code.

- Source commit: 74c6d1e21f9ca9e4a560eebcac8cfd6ebe0fb3b6.
- GitHub Pages run 41835066319 completed successfully, including a fresh 412-test
  run and production build.
- Worker version: 1fe355e7-b6e6-4664-97fa-c8587b143e43.
- Current Unity player: 6e5932dc9583, product version 0.8.3.
- All four retained player data streams returned HTTP 200 with expected gzip
  bytes, SHA-256 and CORS. See mobile-0.8.3-live-player.json.
- Existing QA checkpoint PTPY was read before and after deployment. Exact state
  hash remained 92dc2a3512460c26c0191d6d4d1b12958a9a32e0c062f8efcc6f263000a3889d.
  No gameplay action was sent to that room during the deployment check.
- A separate disposable public mixed-seat test passed: six unique colours and
  expanded board, remove AI back to two seats, no invisible AI moves while the
  room has no viewers, AI resumes on return, automatic roll/move/buy or auction/
  end-turn synchronized to two clients, then waits without changing human state.
- The public website visibly showed Preview 0.8.3. In an 844x390 touch viewport,
  a fresh room BFWX was created, an AI added, and the Classic game started.
  The actual Unity canvas reported unity-ready and requested player 6e5932dc9583.
- The native dice target was tapped. A 2+1 throw moved the token to Nayagaon;
  its full title deed appeared. Buying for INR 60 left INR 1,440 and ownership
  at position 3. Reload restored the same seat, turn and exact server snapshot.
  Unity returned to unity-ready with no browser console errors. See
  mobile-0.8.3-public-ui.json and mobile-0.8.3-public-restored.png.
- The unauthenticated public release APK download returned HTTP 200, 47,873,021
  bytes and SHA-256 e5a2184111a6b7b977c0385f80d26fffd33a93ce681c6d067b759e698de6abc9,
  identical to the locally verified package. See mobile-0.8.3-public-download.json.

Browser: https://divanshuattri123-dot.github.io/TableTalk3D/

Android test release:
https://github.com/divanshuattri123-dot/TableTalk3D/releases/tag/v0.8.3-test

This is browser and package evidence. No physical Android phone was connected;
device frame pacing, thermals and prolonged Android background/resume testing
remain pending. The prepared AAB remains unsigned; this release enables no live
ads, purchases or advertising spend.
