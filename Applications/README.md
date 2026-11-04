# TableTalk3D applications — family preview

The current Android test update is **0.8.3**, with a Da Publications startup, Home
menu, mixed human/AI seats, compact dice results and eleven bundled 3D worlds and six independent city-name editions. It retains
the improved foliage, traffic, audio/background and saved-room return fixes. Windows and iOS
packages remain at 0.7.0 while mobile is the priority. Unreal PC work is deferred.

Da Publications intro -> guest sign-in when needed -> Home with Play, Join,
Maps, Store and Settings. Use Return to room to resume a saved match.
The store contains explicit free test unlocks for token skins and Remove Ads.
Guest profiles and test receipts stay on this installation. Cloud accounts,
real billing and ad delivery are not connected; this version cannot earn revenue
or charge money. See STORE_SPEC.md for the production integration boundary.

These are hybrid applications: the complete React game and Unity WebGL renderer
are packaged in Electron (Windows) and Capacitor (Android/iOS). They use the same
durable multiplayer rooms as the GitHub Pages website. An internet connection is
required for multiplayer and optional models/music; the core Unity player is local.

## Play

- Windows: extract the **entire** portable ZIP, then open `TableTalk3D.exe`. F11
  switches full screen. Keep the other files beside the executable.
- Android: the support target is Android 12 or later with a current WebView.
  The package permits older Android installations; these have not been verified.
  The game locks to landscape and hides the system bars; swipe to reveal them.
  This is a debug-signed test package, not a Play Store release.
- iOS: the ZIP contains the Xcode project, prepared web game and local Unity
  player. Open `ios/App/App.xcodeproj` on a Mac with a compatible Xcode, resolve
  its Swift Package dependencies, choose your signing team and build to a device.
  It has not been compiled, signed or tested on iOS from this Windows PC.

Create a table, share its four-letter code, and join from any of these apps or
[the browser](https://divanshuattri123-dot.github.io/TableTalk3D/). Joining an app
uses a new seat; returning to a saved match requires the app/browser that holds
that seat. Multiplayer is free and there are no subscriptions in this preview.

## Rebuild

1. Install the Browser and Applications npm dependencies with `npm ci`.
2. Build the Unity WebGL scene to `Build/AppsWeb`, then run
   `node Applications/scripts/prepare-player.mjs` from the repository root.
3. Set `TABLETALK_ASSET_SOURCE` to the absolute `Applications/player-assets` folder
   and run `npm run bundle` from Applications.
4. Run `node scripts/icons.mjs`, `npm run sync:android`, `npm run sync:ios` and
   `npm run package:windows` from Applications as required.
5. Android builds use `scripts/Build-Android.ps1` after the official SDK/JDK setup
   and the user's licence acceptance. The tools remain under LocalAppData, outside
   the source repository. Do not commit signing keys or SDK installations.

The packages preserve phone controls (name, colour, Create, Join, Menu), with
preferences and customization inside Menu. Desktop has a larger menu and keeps
its camera options. Graphics use separate phone/PC budgets; the current meshes
are stylized, with enhanced facade shading and day/night materials.
