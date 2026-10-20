# TableTalk3D — Unity graphics project

Editor: **Unity 6000.6.6f1**. Template: **Universal 3D / URP 17.6.0**.
Primary target: **WebGL**, with the Mobile quality tier selected.
Source control: local Git only. No remote repository or Unity Cloud project is linked.

## Open and inspect

1. Open this folder in Unity Hub, or open `Assets/TableTalk/Scenes/TableTalk.unity` in the installed editor.
2. Press **Play**. The scene creates the board and player tokens at runtime.
3. Use **Whole board**, **Follow player**, **Token motion**, and **Jail transfer**.
4. Tap a board tile to show its full name/price and ease the camera toward it.

The preview uses fixed sample data. The motion button is an animation demonstration,
not a dice roll or a substitute rules engine. Jail transfer demonstrates a direct
arc and the supplied cage geometry rather than moving around the perimeter.

## Included

- Five correctly assembled native city meshes: 82,180 triangles, with the native palette and UVs.
- Thirteen supplied model files, including nine token models, Paris dice, house/hotel and jail bars.
- A near-overhead perspective camera, easing and close-up inspection.
- Soft directional lighting, ACES tonemapping, low quarter-resolution bloom,
  modest colour adjustments and a subtle vignette.
- Screen-space uGUI/TextMeshPro controls, not runtime IMGUI.
- Data-driven 40/48/56/64-space board geometry and an expanding jail corner.
- JSON snapshot DTOs in `Assets/TableTalk/Runtime/BoardLayout.cs` and the
  presentation entry point `GamePresentation.ApplySnapshot(string)`.
- Repeatable editor-side layout, rendered-map and motion checks in `AgentScripts/`.

The chosen template supplies URP, Input System, uGUI/TextMeshPro and the test dependencies.
`com.unity.pipeline` 0.8.0-exp.1 allows local editor control. No paid multiplayer,
ads, purchases, accounts, cloud-save or analytics service SDK was added to the game.

## Relationship to the browser game

This is the **graphics foundation / preview**, not a finished Unity replacement for
the multiplayer browser game. The existing React/TypeScript pure reducer and
authoritative room server remain in the separate browser project. Do not port the
rules into this component or introduce random dice inside the reducer.

Still to connect: the WebGL build and JavaScript room bridge, real dice presentation,
full deed/purchase screens, live auctions/trades, rent/tax/card events, construction,
mortgage, bankruptcy and victory choreography. All supplied assets are preserved in
the original asset archive and browser collection; only the relevant subset is
included in this first Unity scene. Original animation rigs/shaders have not been
recovered merely by importing OBJ geometry.

No new frontend deployment was published as part of this project setup. Editor
screenshots and advancing frames do not establish real phone/Safari performance;
the WebGL build still needs browser and physical-device testing.

## Browser settings

- Active target WebGL; Linear colour space; Mobile quality tier; 2× MSAA.
- HDR/post-processing enabled on the active mobile URP asset and camera.
- Brotli and browser data caching remain enabled; decompression fallback is off.
- Medium managed stripping, size-oriented IL2CPP, 128 MB initial / 512 MB maximum memory.
- Runtime uses browser-driven frame pacing (`targetFrameRate = -1`, vSync 0).

When a WebGL build is hosted, verify the host sends the matching `Content-Encoding`
and WebAssembly MIME headers. These settings alone do not prove a smooth browser game.

## Repeat the editor checks

With the project open, use the installed Unity CLI to run `AgentScripts/VerificationTools.cs`
through the editor's `run_script` command. Entry points:

- `VerificationTools.CheckLayouts` — pure layout assertions.
- `VerificationTools.SetGameView` — fixed-resolution desktop/phone preview, with `[width,height]` arguments.
- `VerificationTools.CheckRenderedMaps` — Play mode, rendered tile counts and jail placement.
- `MotionVerification.Run` — fresh Play mode, verifies the two preview-button bindings,
  intermediate token positions, advancing frames, completion and the jail cage.

Keep `Assets/` and every `.meta` file together. `Library/`, `Temp/`, `Logs/`, build
outputs and `UserSettings/` are generated and excluded from local Git history.
