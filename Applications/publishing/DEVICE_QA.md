# Android release test sheet

Status: NOT RUN on a physical phone. Record model, Android version, WebView
version, graphics setting and application version for each result.

0.8.4 also has Android 12/API 31 emulator checks on the original WebView 91.
This caught missing randomUUID and unsupported viewport units; those fixes have
their own evidence. Emulator results do not replace any physical-phone row below.

| Scenario | Required evidence | Result |
|---|---|---|
| Launch/update | Update over the prior APK; profile and saved seat remain | Pending |
| Landscape/UI | Start, room code, all decisions and keyboard fit both rotations | Pending |
| Dice/movement | 20 rolls; result strip stays at edge; token route visible | Pending |
| Multiplayer | Two different phones plus PC; same cash/deeds/turn after each action | Pending |
| Human + AI | Solo and mixed table; AI buy, auction, jail, debt and trade | Pending |
| Cards | Chance/Chest text readable; Continue works once; chained effects | Pending |
| Finance | Auction, counter-offer, mortgage transfer, debt liquidation and bankruptcy | Pending |
| Background | Sleep 30 seconds and 10 minutes; resume without double roll/payment | Pending |
| Network | Wi-Fi off/on and change networks; reconnect to same seat/state | Pending |
| Long session | At least 2 hours; record crashes, memory growth, battery and temperature | Pending |
| Low resources | Battery saver and busy phone; no stuck animation/blocked decisions | Pending |
| Android matrix | Android 12 baseline and current versions; at least two GPU families | Pending |
| Audio | Volume/off, background pause, resume and Bluetooth output | Pending |
| Accessibility | Readable labels, contrast, touch targets, reduced motion | Pending |

Do not replace pending rows with browser, unit-test or build results. Capture
the exact reproduction steps and room code for each defect; avoid resetting a
real match while diagnosing it.
