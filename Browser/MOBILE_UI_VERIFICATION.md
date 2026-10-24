# Mobile HUD cleanup - 24 October 2026

The mobile game screen keeps the board, current turn, player balances and legal
gameplay actions. Settings, history, help, the property guide, collections,
fullscreen and sharing are accessed through one Menu. Settings start closed.
On-screen zoom, camera and secondary collection toolbars are hidden on mobile in
all three board renderers. Existing touch gestures are unchanged.

The responsive boundary is a coarse primary pointer or a viewport at most 700px
wide. Desktop shortcuts and camera controls remain available outside that boundary.
Very small landscape phones use a narrower HUD. Gameplay and menu buttons retain
touch-sized targets; scrollable menus and settings fit short screens.

## Verification

- 272 tests in 22 files passed, including three new menu routing/rendering tests.
- TypeScript checks and the production frontend build passed.
- In-app browser phone emulation at 844x390 and 568x320: simplified HUD, menu,
  settings, history, property guide and deed inspection checked visually.
- 3D city and 2D fallback: zoom/camera toolbars hidden, gameplay actions retained.
- Fresh four-player Classic lobby created and started; the Trade composer opened
  without a dice action. Settings were closed when entering the table.
- Desktop 1280x720: original shortcuts, zoom controls and settings checked.
- Fixed history being hidden by a legacy mobile CSS rule, settings covering the
  collection picker, and the mobile lobby's overlapping sticky Start button.

This is a frontend-only change. No reducer, multiplayer server, saved-room schema,
native Unity assets, or database migration changes are required. Publishing it
does not require restarting the multiplayer server.

These checks are browser emulation, not physical-phone or Safari certification.
Public deployment is verified after publishing; local build success alone is not
treated as evidence that GitHub Pages changed.
