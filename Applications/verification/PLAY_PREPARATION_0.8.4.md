# 0.8.4 Play test preparation

4 November 2026. The signed upload bundle is prepared; no Play submission,
approval, paid advertising or real billing has occurred.

## Build and signing

- Version 0.8.4 / versionCode 10; package com.tabletalk.game; target API 36.
- Direct test APK retains the prior Android Debug certificate so test updates
  can preserve local data. It is not a production-signed APK.
- The AAB uses a separate 4,096-bit RSA upload key, outside the repository, with
  DPAPI-protected local credentials. The exported public certificate matches its
  signer; the certificate expires in 2054. Private material was not published.
- Both packages are compared against all 47 current web files. The signed AAB's
  signature and artifact hash are independently checked. Package comparison
  rejects stale/mixed build outputs rather than treating any APK as current.
- No native Android .so libraries are in the AAB; the Unity player is WebAssembly
  in a WebView. This renderer remains version 0.8.3 / 6e5932dc9583 and is unchanged
  in this UI/compatibility/release update.
- The repeatable Package-PlayTest.ps1 waits for the build before copying and
  verifying both outputs. Readiness can require the current Play-test channel;
  monetization is optional for a free launch rather than a mandatory gate.

## Reproduced Android 12 defect and corrections

The original Android 12/API 31 WebView 91 threw
`TypeError: crypto.randomUUID is not a function` when the guest button was tapped.
The guest ID now uses getRandomValues when randomUUID is absent. A regression
checks distinct, valid version-4 IDs with the older API surface.

Array.at was also removed from client presentation/finance paths. The browser
build targets Chrome 91 syntax. Generated CSS retains modern viewport units but
adds vh/vw fallbacks for older WebViews. The landscape guest screen is compact
and scrollable, including when the keyboard is open.

413 tests across 44 files and both TypeScript targets passed. Android release
lint has its own report. Browser UI checks verified privacy access before guest
entry, a focusable/closable policy dialog, the mobile menu and Store-unavailable
message, with no sample ad or test-unlock action in the Play candidate.

## Emulator evidence and graphics limit

Android 12 emulator / original WebView 91: guest entry, room creation, adding AI,
starting the match, a 5+5 dice throw, token movement to Just Visiting and return
after an APK update passed. The saved room snapshot was exactly unchanged by the
update/return. See mobile-0.8.4-android12.json and its screenshots.

That old WebView cannot execute the current Unity WebAssembly feature set.
The app supplies a readable update explanation and a working 2D continuation
for the same room. Do not claim Unity 3D works on the unupdated WebView 91.
Current Android-image 3D checks are recorded separately when completed.

Capacitor also emitted nonfatal safe-area injection messages before the document
root existed. These are recorded separately from the corrected guest failure;
do not describe the Android logs as entirely error-free. No physical phone
frame-rate, thermal, battery or two-hour session result is claimed.

## Store-facing work

- The Play candidate disables preview transactions and sample ads, and explains
  that purchases are unavailable. All boards and core play remain accessible.
- Privacy/support is accessible from guest entry and the menus. The hosted HTML
  notice is generated from the same sections used in the app.
- The owner confirmed there is no public support email yet. The test notice
  labels this accurately; it is not silently treated as a final store policy.
- 6,430 catalog items were inventoried with source paths and SHA-256. The owner's
  authorship statement is retained; file/group commercial-use evidence and the
  embedded/project art review remain pending. Nothing was marked cleared merely
  because it came from the supplied extraction.
- Data Safety, asset review, signing backup, Play test upload and physical-device
  instructions are in Applications/publishing. Console statuses remain false
  until there is actual account/declaration/test evidence.

Remaining production gates: Play account and content setup, public support and
reviewed policy, recoverable key backup, asset review, real-device QA and the
applicable Play closed test/production access. Advertising spend remains INR 0.
