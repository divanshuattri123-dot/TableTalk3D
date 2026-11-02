# Mobile 0.8.0 startup and maps verification

Verified on 3 November 2026. Android package `TableTalk3D-0.8.0-test.apk`,
versionCode 6, 47,868,569 bytes. SHA-256:
`f0f33b7fa3ba9f65741502102eda759f3d2979e45552b77657ab14a08f8eba86`.

## User-visible changes

- Da Publications intro remains readable for 3.8 seconds, including Reduced Motion.
- App launch shows Home even with a remembered room. Return to room restores
  the existing seat; normal app switching does not deliberately reload the game.
- Play, Join, Maps, Store and Settings are visible on Home. Preferences stay
  inside Menu during play. Store unlocks are explicitly free test entitlements.
- All eleven supplied native world geometries are bundled locally. Six city-name
  editions are independent choices. A host's saved choices reach the new lobby;
  the shared world/city lock when play starts. Old saves default to Classic City.
- Native assembly, UVs and palettes are retained. Only the active world is
  instantiated. Unsupported shader-driven wisps/waves are omitted to avoid
  opaque patches; original world effects/character animations are not all ported.

## Checks completed

- 346 tests in 34 files passed. Frontend and Worker TypeScript checks passed.
- Unity C# compiled without errors; native map bounds/material checks passed.
  Eleven previews were rendered from actual Unity scene geometry.
- Local durable-room recovery passed four restarts, including purchases,
  mid-roll state, rent receipts and auctions.
- Deployed reducer: eleven world selections agreed between two clients. Tokyo,
  purchases, returning viewer and post-start map locking passed.
- Existing PTPY test room was unchanged across server deployment (same complete
  state SHA-256 before and after).
- Exact packaged web files were served locally for browser QA at 844 x 390 with
  touch emulation. Intro, Home, Store, Settings, maps, lobby, roll and purchase
  were exercised. Reopening led to Intro/Home; Return restored the purchased
  property, cash, seat, turn and world with identical complete room state.
- Android Gradle build and apksigner verification passed. The debug certificate
  matches previous test APKs. All 44 web files in the APK match prepared files
  byte for byte. Unity player productVersion is 0.8.0, hash d06dbcdc6206.
- Hosted large Unity data is streamed from ordered asset parts on the free
  Worker. Downloaded gzip bytes, SHA-256 and CORS matched the local build.
  Existing smaller player releases remain available for already-open clients.

## Limits

This is a debug-signed test APK, not a Play Store release. No physical Android
phone was connected: launcher relaunch, GPU compatibility, audio output,
background/resume, temperature and long-session performance still need device
testing. Android 12+ remains the support target. Windows/iOS packages remain
0.7.0; Unreal PC work is deferred. No real ads, billing or cloud accounts were
activated.
