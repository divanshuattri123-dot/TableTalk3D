# 0.8.6 bug-fix verification

## Reproduced defects

1. Two building changes arriving in one snapshot produced targets `[1, 1]`
   instead of `[1, 3]`. The animation planner selected the first difference
   between snapshots for every event. It now uses the individual event's
   structured position or named property before falling back to that difference.
2. The same defect affected mortgage animations. Regression cases cover both
   Classic and expanding modes, including older events without property IDs.
3. An older mortgage event for Sam Singh matched Sam when Sam appeared first
   in the roster. Events with a player ID use that ID; older text-only events
   now prefer the longest matching nickname.

The three reproduction categories failed before the patch. Five new regression
cases pass after it. The full suite passes 418 tests in 44 files. The latest
targeted recheck passes 47 presentation/timeline tests and both TypeScript targets.
The browser production build also passes.

## Stateful checks

The local two-client recovery run passed purchase/cash/ownership/turn, mid-roll,
rent and action receipts, active auction/highest bid and idle hibernation across
four actual Worker process restarts. An additional 48 seeded match simulations
covered three rules modes, two/six seats and eight seeds, up to 2,000 decisions
or completion per match. No AI stall or tested invariant failure was found.

Worker deployment `fa56c44f-9eaa-439f-8a8c-0ad7549e0dc3` retains the five prior
Unity data streams. The saved QA room PTPY has exactly the same serialized
snapshot before/after deployment; no gameplay actions were sent to that room.
Read `mobile-0.8.6-preserved-room.json` for the hashes.

## Android artifacts

The APK and signed AAB each contain 47 web files matching the final local bundle.
The existing upload certificate matches. This release retains Unity renderer
0.8.5 (`7864c4435559`); the fixes are in the shared browser presentation layer.
The build scripts also accept explicit tool/signing directory overrides because
the desktop app runtime changed and the previously installed SDK/key remained
in its older application cache. Private signing files remain outside Git.

This evidence establishes the listed fixes and checks. Physical Android graphics,
frame rate and two-hour device sessions remain pending. Play production and paid
advertising remain pending in the release-readiness report.
