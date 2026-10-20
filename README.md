# TableTalk3D

Unity rendering project for the TableTalk multiplayer property game.

The browser game is published at
<https://divanshuattri123-dot.github.io/TableTalk3D/>. Its React/Vite source,
engine, tests and automatic GitHub Pages workflow live in [`Browser/`](Browser/).
The site uses the free Cloudflare Worker at
`table-talk-realtime.divanshuattri123.workers.dev` for multiplayer rooms and
large game assets; GitHub Pages hosts the static website only.

- Editor: Unity **6000.6.6f1** with URP **17.6.0**
- Main target: **WebGL**, tuned from a mobile quality profile
- Entry scene: `Assets/TableTalk/Scenes/TableTalk.unity`

The game opens as an immersive table: the city fills the window, with floating
turn actions, player balances, camera tools and menus. Create/Join requests native
full screen where supported; the in-game full-screen button can toggle it later.
Phone players can drag to pan, pinch to zoom and tap a property for its deed.
Players, trades, auctions, building tools and the event log stay inside the game.

## Open the project

Open this folder in Unity Hub, load `Assets/TableTalk/Scenes/TableTalk.unity`, and
press **Play**. The Unity scene can also be used on its own to inspect the board,
camera controls, supplied 3D pieces and jail animation.

## Role in the game

This repository holds the 3D board renderer. The React/TypeScript game and its
authoritative room server are in the separate browser project. Unity receives full
game snapshots and presentation events through `GamePresentation.ApplySnapshot`
and `TableTalkWebBridge`; game rules and dice values remain outside the renderer.

The current scene and WebGL bridge support the supplied city meshes and pieces,
40/48/56/64-space layouts, player positions and property state, dice and token
motion, jail presentation, building markers, camera focus, and streamed models.
Presentation animation frames can report completion to the browser client so a
tile landing can be resolved by the game reducer after movement finishes.

This project is the visual client rather than the complete game: the browser
project supplies the rules, room flow and action controls. WebGL hosting and real
phone-browser performance still require end-to-end checks on the target devices.

## Included assets and project features

- Five assembled city meshes with their palette and UVs: 82,180 triangles.
- A surrounding park with layered leafy canopies, branching trunks, lawns,
  promenades and a perimeter road. Trees share combined meshes and materials.
- Thirteen supplied model files, including tokens, Paris dice, houses, a hotel and
  jail bars.
- Near-overhead perspective camera, easing, close-up inspection, and touch/pointer
  navigation.
- URP lighting, tone mapping, bloom and responsive screen-space UI.
- JSON snapshot DTOs in `Assets/TableTalk/Runtime/BoardLayout.cs`.
- Indian landmark labels and prices are read from each snapshot by Unity itself.
  The Unity font falls back to `Rs` when the rupee glyph is unavailable.
- Editor-side layout, rendered-map and motion checks in `AgentScripts/`.

## Build and verify

In Unity, select **WebGL** as the build target and build the project. The generated
`Build/` folder is intentionally not part of this repository. The browser host must
serve Unity's compressed files with the matching `Content-Encoding` and the
WebAssembly MIME type.

The installed Unity CLI can build the same enabled scene with:

```powershell
unity build --target WebGL --execute-method TableTalk.Editor.SceneBootstrap.BuildWebGL --output-path Build/Web .
```

For editor checks, use the installed Unity CLI to run `AgentScripts/VerificationTools.cs`
through `run_script`:

- `VerificationTools.CheckLayouts` — board-layout assertions.
- `VerificationTools.SetGameView` — fixed-resolution desktop/phone preview with
  `[width,height]` arguments.
- `VerificationTools.CheckRenderedMaps` — rendered tile counts and jail placement.
- `MotionVerification.Run` — preview controls, intermediate token positions,
  advancing frames, completion and jail cage.
- `WebIntegration.Prepare` and `WebIntegration.VerifyMotion` — WebGL bridge setup
  and Unity-side event/movement checks.
- `WebGraphicsResources.Prepare` — retain alpha-cutout foliage variants and use
  the WebGL 2-compatible post-process resource set before rebuilding the player.
- `TouchVerification.Run` — feed real Input System touch events through the
  camera's pinch and one-finger pan loop while frames advance.

Keep `Assets/` and its `.meta` files together when changing the project. Unity
generates `Library/`, `Temp/`, `Logs/`, `Data/`, build output, and `UserSettings/`;
these directories are ignored because they are local or platform-specific output.

After changing the browser board data, run `node scripts/export-unity-preview.mjs`
from `Browser/` to refresh the Unity studio snapshots for every board size.
