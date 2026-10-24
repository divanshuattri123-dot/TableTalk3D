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

## Pre-game follow-up

The first cleanup did not simplify the welcome page. Mobile now shows just the
name, colour, Create, Join and Menu controls before entering a room. The showcase,
asset-browser footer and standalone appearance pickers are not mounted on mobile;
the hidden showcase therefore does not run a WebGL preview. Menu contains personal
board/graphics/sound settings and explicit token/dice customization. Settings start
closed and are read afresh when the menu opens, including after returning from a
match. Desktop keeps its existing showcase and direct pickers.

- Updated suite: **275 tests in 23 files passed**, including three pre-game menu tests.
- TypeScript checks and the production build passed.
- Local mobile layouts checked at 844x390, 568x320 and 390x844.
- Mobile welcome DOM has zero preview canvases and no showcase, appearance-picker
  or asset-browser footer nodes. Settings persisted across reload and stayed closed.
- A fresh QA waiting room was created from the compact form; Settings, Log and
  zoom toolbars remained hidden there. Menu -> Change dice opens the collection.
