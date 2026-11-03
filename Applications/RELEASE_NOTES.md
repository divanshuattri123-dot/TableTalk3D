# 0.8.1 — Friends and AI at the same table

- The host can add or remove AI in the lobby. Any mix of humans and AI works
  with 2–6 total seats, including one human against one to five AI players.
- AI takes unused colours and counts toward expanding-map size. Existing saves
  remain unchanged. Running games do not replace seats with bots.
- Different playing styles vary reserves, bidding, building and deal prices.
  AI buys, auctions, builds, mortgages, handles debt/jail and negotiates trades
  through the same reducer as humans. No paid AI API is used.
- Server alarms pace the decisions and preserve them across room restarts.
  AI waits for human decisions and pauses when the room has no connected viewers.
- Reuses the local Unity 0.8.0 player and all eleven worlds.

# 0.8.0 — Publisher startup, Home and eleven maps

- A readable Da Publications intro leads to Home on app launch. Saved rooms use
  an explicit Resume option; an existing match no longer bypasses the menu.
- Home exposes Play, Join, Maps, Store and Settings, with a visible preview version.
- Eleven supplied 3D worlds are included locally: Classic, Winter, Harbour, Paris,
  Neon, London, Blossom, Future, Forest, Garden and Underwater.
- Six city-name editions remain a separate choice. The host shares the map and
  city with the room before starting. Old saves keep Classic City.
- Native assembly, original palettes and material grouping replace a names-only
  map choice; only the active world is instantiated. Phone controls stay compact.
- Test store only; no real billing or ads activated.

# 0.7.2 — Mobile audio and saved-room return

- Turning Game sounds off pauses both music and currently playing effects.
- Backgrounding the app pauses audio. Returning resumes enabled music after a
  player gesture has unlocked audio; old effects do not replay.
- Volume updates apply to active sounds without restarting the music track.
- Collection audio previews stop when changing tracks, closing the collection or
  backgrounding the app.
- Returning to the table waits for a fresh room snapshot before enabling actions.
  Duplicate visibility/pageshow events share that request, with a timed reconnect
  if the snapshot is missing. Pending decisions retain their original receipts.
- Reuses the verified 0.7.1 Unity renderer and scenery. Android test app version
  0.7.2 does not require rebuilding or replacing the city player.

# 0.7.1 — Unity mobile environment refinement

- Keeps the existing Unity board, city layout, mobile menus and multiplayer flow.
- Custom realistic leaf artwork, preserved alpha coverage, softer foliage light,
  fine bark grain and slight variation in roadside canopy shapes.
- Gentle leaf wind runs in the shader and stops with Reduced Motion.
- Highway cars share one surface mesh with distinct paint, glass, tyres and trim.
- Android test package is rebuilt with the local Unity player. Unreal PC work is
  deferred; no Unreal build replaces the mobile application.
- Android 12+ is the support target. Physical-phone performance is still unverified.
- Review-driven follow-up: graphics recovery controls, visible building restrictions
  and costs, and independent browser-entropy dice sampled outside the reducer.
- Public review audit: 55,469 distinct written reviews across 73 locale queries;
  every row screened, selected cases manually interpreted. No claim of every
  historical/deleted review or verified competitor defects.

# 0.7.0 — Da Plubications family preview

- Animated publisher intro, skippable and respectful of reduced motion.
- Guest sign-in using a nickname; local profile only, no email/password collection.
- Landscape menu with Play, Join and Store; preferences stay in Menu.
- Grown-up store interaction gate, no-charge confirmation, three token cosmetics,
  Equip, local test restoration and a Remove Ads test entitlement.
- No live ad SDK, real billing, cloud authentication or real charges.
- India/Tricity, London, Atlantic City, New York, Paris and Tokyo named boards
  share the same economy and current 3D city geometry.
- Counter-offers, Classic Hasbro 2025 option, readable Chest/Chance cards,
  saved-room return and new completed-colour-set deed animation.
- Mobile/PC package budgets checked against 300 MB and 3 GB respectively.

Android is a debug-signed test APK. Windows is a portable hybrid application;
extract the full ZIP and launch TableTalk3D.exe. iOS is prepared Xcode source,
not an installable or signed iPhone app. Multiplayer requires internet.

Production monetization remains pending publisher accounts, original asset rights,
verified native purchases, cloud ownership/deletion flows, an appropriate Families
ad integration, privacy disclosures, signing and physical-device QA.

Reference analysis: Browser/MOBILE_MENU_REFERENCE.md. Production boundaries:
Applications/STORE_SPEC.md. Test unlocks are never valid paid receipts.
