# Mobile 0.8.5 — foliage visibility

## Report and finding

The player could not identify a map or app version where tree leaves/branches
were missing. Inspect the shared renderer without resetting their rooms. The
existing RoadsideLeaves texture was bound and the shader was supported. Dense,
overlapping rounded crowns concealed the limbs; small shrubs used plain green
material. The fix addresses visibility and silhouette rather than a missing file.

## Change

- Keep the existing trunk, texture atlas, wind shader and deterministic placement.
- Darken and slightly widen the branches; expose twig forks between smaller crowns.
- Add crossed, curved leaf-shaped sprays at branch and twig ends.
- Lower crown tessellation to offset the sprays; retain four shared foliage batches.
- Reuse textured foliage for low planting.
- Preserve rules, saved state, multiplayer messages and existing seat identities.

## Acceptance and limits

Inspect the actual moving Unity preview, close-up and 844 x 390 whole-board
renders. Verify finite geometry, valid atlas UVs, four foliage batches, the 1024px
texture on auto/low/high, and wind/reduced-motion behavior. Check all four board
sizes. Record results in verification/trees-0.8.5-render-check.json. The 40-space
tree geometry rises from 52,800 to 55,600 triangles; no per-leaf objects or update
loops are added. This is not an FPS guarantee.

Build a new versioned Unity player, package it locally in the APK and signed AAB,
and compare every packaged web asset. Retain prior player URLs during public
deployment. Compare an unchanged QA saved room before and after deployment.
Verify public download hashes. Physical Android 12+ graphics and long-session
testing remain required before production release.
