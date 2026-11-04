# Play test handoff — 0.8.4

The signed bundle is a technical upload artifact. It does not mean the game has
been submitted, approved, commercially cleared or tested on physical phones.

## Prepared locally

- TableTalk3D-0.8.4-play-upload.aab, signed with the local upload key.
- Public upload certificate and versioned signature/hash verification report.
- TableTalk3D-0.8.4-test.apk, retaining the preceding debug test certificate.
- Privacy/support screen and web notice, Data Safety worksheet, listing draft,
  device test sheet and complete downloadable asset inventory.
- Play candidate excludes sample ads and local test-purchase transactions.

## Owner steps before a public launch

1. Create and verify Play Console with the correct personal or organisation
   identity. Complete its payment, verification and legal steps yourself.
2. Create a public support email. Put it in
   Browser/src/publisher/publisher.json; review the policy and set its reviewed
   status only after that review. Rebuild both app and hosted notice.
3. Arrange a recoverable signing-key/password backup; see UPLOAD_SIGNING.md.
4. Confirm commercial-use evidence for distributed and embedded art/audio/models.
5. In Play Console, check availability/ownership of com.tabletalk.game, create
   the app, configure Play App Signing, and upload the verified signed AAB to
   an internal test release.
6. Finish the listing and app-content forms from the actual release behaviour:
   privacy policy, support, Data Safety, audience, content rating and ads status.
   Do not claim no data collection: multiplayer nicknames/IDs and actions reach
   the server and other invited players.
7. Test real Android 12+ devices and prolonged matches using DEVICE_QA.md.
   Resolve findings and rebuild with an increased versionCode for each upload.
8. For a new personal account subject to Google's testing requirement, run the
   closed Play test with at least 12 continuously opted-in testers for 14 days,
   then apply for production access. An APK installed from GitHub does not
   substitute for that Play closed-test opt-in.
9. Review the final production release in Play Console. Google decides approval.
   Paid advertising remains paused until there is a verified release destination
   and the prepared campaign receives final approval within INR 5,000 total.

Do not publish signing credentials, passwords, identity documents or tester
email lists to the public repository. The public PEM certificate is not a
private key. Store the tester list privately in Play Console.

References:

- https://support.google.com/googleplay/android-developer/answer/9859348
- https://support.google.com/googleplay/android-developer/answer/14151465
- https://support.google.com/googleplay/android-developer/answer/9859455
