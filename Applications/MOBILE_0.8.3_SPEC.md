# 0.8.3 audit fixes

A completed replacement-socket handshake clears the prior offline flag. An
online event arriving while CONNECTING must not strand the client offline.
Resent pending actions keep the same receipt and apply exactly once.

Compulsory payments can arrive during a Classic building auction. If a winning
bid becomes unaffordable, reopen that auction without the stale cash/property
reservation. Debt settlement can then mortgage the district. Remove bankrupt
participants and invalid building targets; finish the pending auction before
advancing to the next player's movement roll. On loading an older orphaned
auction, checkpoint the repaired phase before broadcasting or scheduling AI.
Preserve money, deeds, deck order and action receipts.

Custom Unity model downloads belong to the native instance, not to one cash or
position snapshot. Deduplicate in-flight requests across all snapshots; retry
failures; suppress registration after disposal. Bundled pieces must not import
the Three.js conversion pipeline. A late custom dice model refreshes the idle
pair immediately, or invalidates its cache for the next throw while a current
throw continues intact.

All reducer repairs remain deterministic. No new auth, monetization or saved
room schema. Verify transaction/presentation boundaries, all rules modes,
sustained seeded play, room restart and acknowledgements, actual Unity model
handoff, mobile controls and matching public website/APK assets. Physical
Android testing and production release gates remain explicitly pending.
