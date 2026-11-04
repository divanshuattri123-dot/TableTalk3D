TableTalk3D 0.8.5 is an Android test update focused on foliage visibility.
Branches and twig forks are more exposed, leaf-shaped geometry breaks up the
outer canopy, and ground shrubs use the foliage texture. Four shared foliage
batches and reduced-motion wind are retained.

Install `TableTalk3D-0.8.5-test.apk` to update the existing test app. Keep its app
data to preserve the local profile and saved seat. The `.aab` is the signed Play
upload bundle and is not directly installable. Both contain the local 0.8.5
Unity renderer. Internet is required for multiplayer.

This includes the preceding Android 12/WebView compatibility and privacy-menu
updates, with no live ads, real purchases or sample transactions in the Play
test candidate. Old WebViews may require an Android System WebView update for
3D; the 2D view remains available for the same room.

Geometry/material checks passed for all four board sizes and three quality
presets. Every packaged web file and the AAB signing certificate were verified.
This remains a test release: physical Android 12+ graphics and long-session QA,
publisher account/contact setup, recoverable key backup, asset rights review and
applicable Play testing are still pending. No paid ads have run.
