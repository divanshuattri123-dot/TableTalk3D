# Mobile 0.7.2 — 2 November 2026

Result: Android test APK rebuilt, packaged assets verified, client resume checked
against real multiplayer rooms, and the touch UI checked at 844×390. The Unity
renderer remains the verified 0.7.1 player (`6f025206ced3`); this patch changes
audio and connection handling rather than replacing the graphics.

## Changes

- The game sound preference now pauses music and active effects together.
- Music/effects pause when the page is hidden. Foreground return resumes enabled
  music after the player has unlocked playback; interrupted effects do not replay.
- Volume changes update active audio without recreating/restarting the music.
- Music previews stop when the selected asset changes, the collection closes or
  the app backgrounds. Cleanup captures the old element before React replaces it.
- A quick return requests a fresh authoritative room state before enabling play.
  Repeated visibility/pageshow events share that request. Missing snapshots cause
  a reconnect after the wait expires, even if heartbeat responses continue.
- Late socket messages cannot re-enable actions while the client is marked offline.
- Unacknowledged actions retain their original receipt through resync/reconnect.

## Verification

**326 tests in 31 files passed**, including 14 new regressions for audio and room
return. Frontend and Worker type checks passed. No rules reducer changes were
needed, and no Worker deployment was performed.

`npm run test:resume` uses the actual RoomConnection class, two real WebSocket
clients and an isolated deployed QA room. It delays a real snapshot, verifies that
stale actions are blocked and duplicate resumes are coalesced, then releases that
snapshot. It also drops an acknowledgement, reconnects and waits for the server's
acknowledgement of the retried receipt. Exact snapshots show that the action,
cash, ownership and turn apply once. A first harness attempt raced the two joins;
the harness now saves the host seat before connecting the second client.

The final prepared app was exercised in a touch-emulated browser:

1. Created room PTPY through the menu, joined a differently coloured peer and
   started Classic. The peer rolled, bought Nayagaon and ended their turn.
2. Switched the browser's connection to offline. The recovery notice appeared and
   Roll/Trade/property-action controls were absent.
3. The peer redeemed a mortgage while the browser was offline. Chrome delivered a
   late socket state showing ₹1,437; the offline notice and disabled play remained.
4. Restored networking. The reconnect notice cleared, normal controls returned,
   and the current turn and updated balance remained correct.
5. Reopened the same room and settings. The selected music and unchecked Game
   sounds preference persisted. Settings/history/camera tools stayed inside Menu
   on the touch layout.

The final city rendered normally and the browser error log was empty.

The complete saved snapshot remained identical through reconnect/reload after the
peer's last action. SHA-256:
`92dc2a3512460c26c0191d6d4d1b12958a9a32e0c062f8efcc6f263000a3889d`.

Evidence: `mobile-0.7.2-offline.png`, `mobile-0.7.2-restored.png`,
`mobile-0.7.2-audio-settings.png`. Raw logs remain under ignored `tmp`.

## Package

- `downloads/TableTalk3D-0.7.2-test.apk`: **26,445,953 bytes**.
- Android application version 0.7.2, version code 5.
- SHA-256: `cc07d4befd81b7d6ccbbf434a13b92f3e7b3ff8dd183c343bbde79f941aed543`.
- APK signature verified with the same Android Debug certificate as 0.7.1.
- All **32** prepared web files match their APK entries byte-for-byte.
- Android package-size budget passed. Previous APKs remain available.
- `mobile-0.7.2-package.json` and `downloads.json` record the file evidence.

## Remaining limits

Audio lifecycle tests use controllable media objects; the browser check verifies
the real settings and their persistence. It is not a physical Android speaker,
Bluetooth/audio-focus or background/resume certification. No phone was attached.
Long phone sessions, heat/battery, process death, installation and Android 12+
device coverage remain release checks. The earlier Unity/label verification is
recorded in MOBILE_0.7.1.md and was not re-run for this frontend-only patch.

The public website remains unchanged. Google Play publication and paid ads are
not activated; the ₹5,000 draft plan and missing-account/release prerequisites
remain as recorded in `../publishing/LAUNCH_PLAN.md`.
