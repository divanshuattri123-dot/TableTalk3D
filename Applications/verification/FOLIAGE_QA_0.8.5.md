# Foliage acceptance — 0.8.5

The running Unity STUDIO preview exposed the shared tree renderer used by all
board worlds. The existing leaf atlas loaded correctly; overlapping crown
surfaces concealed the branches. Ground shrubs had no leaf texture. This update
opens the canopy, adds twig forks and curved leaf-shaped outer geometry, and
uses textured foliage on shrubs.

## Verified

- C# compilation: zero errors and warnings in the isolated Editor check.
- Unity player build succeeded in 351.759 seconds; version 0.8.5, content
  `7864c4435559`.
- Actual preview frame progression was checked before capture.
- 40/48/56/64 spaces: four nonempty canopy batches; finite vertices; UVs inside
  the atlas; respectively 55,600 / 62,272 / 68,944 / 75,616 tree triangles.
- Auto, low and high mobile presets retain four supported foliage materials and
  the 1024px RoadsideLeaves texture.
- Ground shrubs use the leaf shader. Wind switches off and back on with reduced
  motion. The existing shared traffic mesh and its material groups are retained.
- `trees-0.8.5-before-close.png` and `trees-0.8.5-final-close.png` show the change;
  `trees-0.8.5-phone.png` is the 844 x 390 board render.
- APK and signed AAB each contain all 47 matching final web assets, including the
  new renderer. Package and signing reports record the exact hashes.

The geometry check is reproducible through Unity's `eval_file` command with
`Applications/scripts/verify-foliage.cs` in the isolated STUDIO Play preview. It
refuses other room codes. Its report is `trees-0.8.5-render-check.json`.

## Limits

The current in-app browser could not initialize WebGL, so it did not verify
packaged 3D gameplay. The Android 12 emulator check for the preceding 0.8.4 build
verified startup, AI play and exact saved-room return using the 2D fallback on
old WebView 91. That is not a 0.8.5 3D result. Physical-phone foliage appearance,
GPU behavior, sustained FPS and two-hour sessions remain pending. Account,
support-contact, key-recovery, rights and Play testing gates remain recorded in
the release-readiness report. No advertising was activated.
