# Unity mobile 0.7.1 verification — 1 November 2026

Result: rebuilt Android **test APK**, with the existing Unity city composition and
multiplayer game. This is not a production Play Store release or a physical-phone
performance certification. Unreal PC work remains deferred.

## Delivered package

- `downloads/TableTalk3D-0.7.1-test.apk`: **26,444,658 bytes** (26.44 MB decimal).
- Version name 0.7.1; Android version code 4.
- SHA-256: `19809f14b40998f048fda9fa850cef17cb88c41b2a6ebca23d336c2a7f9cf29a`.
- APK signature verified; same Android Debug certificate as the earlier preview.
- Unity player version 0.7.1, content hash `6f025206ced3`.
- All four player files are present. All **32** files from the final prepared web
  folder match their corresponding APK entries byte-for-byte.
- ZIP payload before compression: 52,566,304 bytes. Optional collection models
  remain downloaded on demand. This is not a 300–400 MB content pack.
- Previous preview packages and the first graphics candidate are preserved.

## Graphics checks

The custom leaf texture has a 1024-pixel import limit, alpha coverage, mipmaps and
trilinear filtering. Four shared foliage materials provide natural canopy colour
variation. Shader wind stops and resumes with Reduced Motion. Bark grain and car
paint, glass, tyres and trim are separate surfaces without per-car mesh copies.

Unity C# compilation and WebGL build succeeded. Shader validation reported no
foliage shader error. The traffic mesh preserves all 2,594 triangles, with one
shared mesh and nonempty paint/glass/tyre/trim index groups. Presentation checks
passed for interrupted movement cleanup, stable property objects, city materials,
shadow bounds, 1,200 tractor route samples and 15 living actors.

Board-label checks passed **96 camera states and 19,968 label corners**. A
1366×768 Editor sample measured 16.99 ms CPU frame and 11.71 ms GPU frame; these
are Editor measurements, not Android FPS or thermal results.

## Rules and recovery checks

- **312 tests in 30 files passed.** Frontend and Worker type checks passed.
- Four real local Worker restarts restored exact snapshots after a purchase,
  pending move, rent payment and active auction. Duplicate receipt retries did
  not repeat charges; auction play continued after idle hibernation.
- A mobile-sized browser at **844×390 with touch emulation** loaded the exact
  final web assets packaged into the APK.
- A local QA-only missing-player fault displayed Restore 3D and Continue in 2D.
  Removing the fault and selecting Restore 3D loaded the actual city. No JOIN,
  economy reset or turn change was required. Before/after saved snapshots had
  identical SHA-256 hashes, including cash and property ownership.
- The final recovery buttons measured **150×44 CSS pixels**, with 16 px text.
- Actual UI play after restoration rolled 2+5, showed the Chance card text
  “Bank dividend. Collect ₹50.” and returned controls after its animation.
- Opening Trade caused no roll. A cash/deed offer, peer counter-offer and UI
  acceptance transferred Nayagaon and ₹70 correctly. The pending roll stayed empty
  and player positions stayed unchanged during trading.
- The property desk showed “Own every deed in this colour set to build.” with a
  disabled House ₹50 button. The deed received through trade remained owned after
  reload and graphics repair.
- The final renderer reached `unity-ready`, camera tools were hidden on the touch
  layout, and the browser error log was empty after the final reload.

Evidence images: `mobile-0.7.1-final.png`, `mobile-0.7.1-property-help.png`,
`mobile-unity-before.png`, `mobile-unity-after.png`. Raw local command evidence
remains under ignored `tmp` logs.

## Scope limits and release work

The graphics-context listener has unit coverage. The browser integration above
tests a failed player download followed by a view rebuild; it does not simulate a
physical Android GPU driver crash. No Android phone was attached for a long play
session, thermal/battery profiling, WebView background/resume or installation
verification. Android 12+ remains the support target, with device QA outstanding.

Offline play, rankings, full localization, account-backed purchases and real ad
serving are not implemented by this update. The public website/Worker were not
redeployed during this mobile package work. Production needs publisher accounts,
release signing, privacy/support details, verified commercial asset rights and the
applicable Google Play testing/Families requirements. No ads were activated or
money spent. See `../publishing/LAUNCH_PLAN.md` for the prepared ₹5,000 plan.
