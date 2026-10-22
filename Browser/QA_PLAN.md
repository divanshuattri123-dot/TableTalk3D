# TableTalk QA and refinement pass — 22 October 2026

Preserve the supplied detailed city, the pure shared reducer, free hosting and current saved matches. Use disposable QA rooms only. Never replace an existing match to test a scenario.

## Acceptance checks

- Reducer: deterministic, immutable; complete games reach a winner; assets, bank stock and cash accounting remain consistent through debt, trades, auctions and jail.
- Recovery: run a real-time one-hour multiplayer session, reconnect both clients and compare the complete state. Test offline and browser reload, not only a fast simulation.
- Presentation: trades do not replay dice; cards contain readable effects; a sleeping viewer resumes the current table without an unbounded animation backlog.
- Interaction: dragging does not select labels or open deeds accidentally; camera stays bounded; no small-screen dialog or primary control is clipped.
- Environment: cars follow the correct traffic lanes and road curves; farm vehicles turn smoothly; river traffic clears the bridge; trees stay out of roads, fields and water. Keep scenery economical on mobile.
- Release: run automated tests, type checks, local/native validation as relevant, then production browser checks. Record tested limits honestly, including unavailable physical-device/Safari tests.

## Rules scope

Classic 40-space economy is the baseline. Indian place names and the automatic 48/56/64-space expansions are intentional custom rules. The older rules audit remains the gap ledger; do not claim complete official compliance until each gap is independently resolved and tested.

## Recorded results

See `QA_VERIFICATION.md` for this pass's actual test results and remaining limits.
The real-time online soak has a separate saved log in `outputs/qa-real-time-soak.log`.
