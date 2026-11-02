# Package and asset budgets

The requested targets are **300 MB mobile** and **3 GB PC**, using decimal MB/GB.
They are maximum package budgets, not goals to fill with duplicate assets.

- Mobile packages carry the game, the Unity player, all eleven board worlds,
  map previews, fonts, menu art and app icons locally. Optional tokens/music and
  additional collection scenery stream when selected.
  Menu/lobby screens do not initialize Unity or a second WebGL preview.
- Windows uses the same rooms and shared rules, with a larger rendering budget
  for antialiasing, shadows and facade detail. Its portable folder is measured
  separately from its compressed download.
- The eleven 3D worlds have distinct geometry and materials. Six city-name
  editions reuse the same economic data independently of the selected world.
  Only the active world is instantiated; material grouping reduces draw calls.
- Future high-resolution PC asset packs must stay inside the 3 GB folder limit.
  A mobile variant must be resized/simplified before inclusion under 300 MB.
- Downloads, runtime caches, installed SDKs and source projects are separate
  quantities. The size check does not claim an unlimited optional collection
  stays permanently cached below 300 MB on a phone.

Run `node Applications/scripts/check-budgets.mjs` after building both packages.
The report is written to `Applications/verification/package-budgets.json` and
the command fails if either package exceeds its budget. No Android/iOS device
FPS or thermal claim follows from this file-size check.
