# Da Plubications — family preview specification

Decision: prepare a test version first. The publisher has no Play Console, AdMob,
or sign-in service accounts yet. Audience includes children and adults.

## Entry and menu

Animated Da Plubications publisher mark -> guest sign-in -> Play / Join / Store.
A returning guest may continue with their saved local profile. No email, password,
date of birth or advertising identifier is collected by this preview. The local
guest profile is not cloud authentication. Existing per-room seats remain intact.
Intro can be skipped, respects reduced motion, and never changes a room.

## Business model

Free core game, six free named city boards, optional cosmetic token purchases,
and one non-consumable Remove Ads product. No paid dice odds, cash advantages,
loot boxes, subscriptions, artificial scarcity or purchase prompts during turns.
Store access has a grown-up interaction gate. This is a UI safeguard, not verified
parental consent or identity verification. Actual consent requirements depend on
the production services and countries chosen.

Preview products grant only local test entitlements after an explicit no-charge
confirmation. They are namespaced separately from future verified purchases.
Restore reloads these test receipts from this installation. Equip selects the
actual matching token in the next room; colour still must be unique in that room.
Remove Ads hides the clearly labelled sample ad placement. No ad SDK is loaded.

## Production boundary

No preview receipt can become a paid entitlement. Production billing must obtain
localized products from Google Play, verify each purchase token on the backend,
record ownership, handle pending/cancelled/refunded purchases, acknowledge grants,
and support restore. A missing account/configuration must fail closed.
Account linking and cloud purchase restoration require a real identity provider,
account deletion and retention flows. Child accounts must not be enrolled in an
adult sign-in flow by a simple age assertion or by this grown-up gate.

Ads remain disabled until a current Families-certified SDK/version and consent
configuration are verified. All users are treated as child/unknown for this preview.
No personalized advertising, advertising identifier permission, tracking SDK,
analytics SDK, open chat or external purchase link is added.

Before submission: publisher account; chosen countries/age groups; signed AAB and
protected upload key; billing products and test track; ad service setup; hosted
privacy policy and contact; Data Safety and content rating declarations; rights
for every distributed APK-derived artwork/model/audio item; physical device and
long-session QA. The extracted source archive itself is not evidence of commercial
reuse rights. The current app is not claimed Play-approved or ready to earn money.

Official references reviewed 1 November 2026:

- https://support.google.com/googleplay/android-developer/answer/9893335?hl=en
- https://developer.android.com/google/play/billing/security
- https://developer.android.com/google/play/billing/integrate
- https://support.google.com/googleplay/android-developer/answer/9859455?hl=en
