# Release handoff — 4 November 2026

Current outcome: test release preparation. The owner reconfirmed that no Google
Play or advertising accounts exist. There has been no paid advertising spend.

## Prepared

- Android 0.8.4 Play test candidate and a signed upload AAB, with certificate/hash verification.
- Upload key stays outside Git; see UPLOAD_SIGNING.md. Independent credential backup remains pending.
- Privacy/support notice is available in the app and as privacy.html; owner confirmed no public support email yet.
- Complete catalog inventory with SHA-256 and a Data Safety worksheet.
- Android 12 emulator compatibility checks supplement the browser checks; physical-device results remain separate.
- Eleven worlds, six city editions, human/AI rooms and persistent saved games.
- Updated listing text and a paused INR 5,000 campaign plan in LAUNCH_PLAN.md.
- Roll-overlay fix and targeted graphics/network/presentation regression checks.

The local upload AAB is signed. The owner must protect and back up its upload
key and enroll in Play App Signing. A signed bundle does not establish Play
account access, content approval or release readiness.
[Android signing requirements](https://developer.android.com/studio/publish/app-signing).

## Owner/account items still needed

1. Create and verify Play Console. Google lists a US$25 registration fee; this
   is separate from the INR 5,000 advertising budget. Complete identity, payment
   and terms steps yourself. [Play Console setup](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en).
2. Supply the real public developer identity, support email and privacy-policy
   destination. Do not put passwords, payment details or signing secrets in chat.
3. Review commercial-use evidence for artwork, models, sounds and branding,
   including supplied APK-derived content. Extraction alone does not establish
   commercial permission. Do not claim this is Hasbro's official application.
4. Complete Android 12+ physical-phone and long-session testing. Use DEVICE_QA.md
   and record actual results; browser emulation is not a device result.
5. Complete Play app-content declarations and applicable closed testing. New
   personal accounts currently need at least 12 continuously opted-in testers
   for 14 days before applying for production access.
   [Testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).
6. Create the advertising account when a usable release destination exists.
   Review the final paused campaign, targeting, dates, tax-inclusive total and
   creatives before activation. Campaign setup cannot replace the missing account.

## Monetization and family audience

The browser preview Store uses free local test unlocks. The Play test candidate
disables these transactions and sample ads; its Store explains that purchases
are unavailable. A free launch does not require ads or purchases. Future
production purchases need real Play products, server verification,
pending/refund handling and cross-install restoration. Ads for the declared
child/adult audience require the Families-compliant implementation and SDK
versions; the existing grown-up Store gate is not proof of parental consent.
[Families policy](https://support.google.com/googleplay/android-developer/answer/9893335?hl=en).

The app currently targets API 36, which meets the published 2026 target-level
threshold. This does not replace compatibility or policy review.
[Target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en).

## Campaign handoff

Keep the INR 5,000 **total** ceiling, including taxes/fees. LAUNCH_PLAN.md divides
INR 4,000 media and INR 1,000 buffer across an initial India/US/UK experiment.
Those regions are a test hypothesis, not a proven ranking of Classic players.
Use actual tested gameplay, not reference-game footage or promises of bug-free
performance. Do not target children with personalized advertising.

Prefer a supported campaign-total budget with explicit dates for this small
pilot. An average daily budget is not a hard total cap; App campaigns do not
automatically inherit the total-budget support of Search campaigns.
[Budget support](https://developers.google.com/google-ads/api/docs/campaigns/budgets/create-budgets),
[spending limits](https://support.google.com/google-ads/answer/10486637).

Release decisions: no claim of Play approval, no production rollout and no paid
campaign activation while these items remain incomplete.
