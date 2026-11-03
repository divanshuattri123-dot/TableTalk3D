# Mobile roll visibility and release preparation

Keep the 3D dice and token animations. Replace the duplicate centre-screen number
cards with a compact, non-interactive edge readout. Ordinary move/turn notices
also stay at the edge. A pending auction must not cover earlier dice/movement.
Replace the rectangular Roll control with a real Unity mesh pair resting over
the board. A transparent semantic hit target follows the projected dice bounds
through camera changes and resizing. It remains accessible by keyboard/screen
reader. Only the current player can throw; property tools and menus block it.
Jail uses the same native pair; 2D and utility dialogs keep shaded dice as their
fallback interaction. Existing receipt handling rejects duplicate taps.

Interrupted Unity frames explicitly hide reusable dice before starting another
frame. A missing completion callback gets a bounded grace period instead of
eight extra seconds; cards still wait for Continue. Late completions cannot
advance another frame. Duplicate room snapshots acknowledge pending actions but
do not repaint the whole game; reconnect snapshots and appearance changes must
still reach the client.

Acceptance: all 36 dice pairs and doubles; small landscape layout with an empty
board centre; uninterrupted and interrupted Unity dice; roll-to-move-to-property
sequence; card/auction/trade/debt regressions; AI and human turns; reconnect and
saved-room recovery; APK file integrity and public website/player verification.
No change to the pure reducer, prices, dice odds or saved-room schema.

Prepare a test APK and publishing handoff. Owner confirmed no publisher/ad
accounts on 3 November 2026. Record real device and production-signing gaps,
publisher identity/support/privacy requirements and APK-derived asset licensing
evidence. Keep live ads/billing off and the existing INR 5,000 campaign ceiling.
Do not represent a test package or incomplete release gate as store approval.
