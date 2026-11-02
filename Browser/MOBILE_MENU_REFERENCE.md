# Mobile and PC visual reference review — 1 November 2026

Reference: [TapGameplay, Monopoly Mobile tutorial](https://www.youtube.com/watch?v=3NfhO-oWgr4), 32:18.

The supplied video was sampled at every integer second from 0 through 1937.
All 1,938 timestamped frames were inspected in 33 contact sheets, with the opening
and major event sequences examined in detail. This is a one-second visual review,
not a claim to have inspected every source frame or replicated every animation.
Private review captures stay in ignored `tmp/video-review`; they are not game assets.

| Time | Observed visual behavior | Application decision |
| --- | --- | --- |
| 0:00–0:01 | Large red Play panel; secondary panels; white pill buttons; metallic token and dice | New red/blue hub uses supplied token art, white pills, readable landscape text and a single Menu. |
| 0:02–0:10 | Blue mode cards, red title strip, paper diamond background | Real Create/Join choices with slide/fade transitions. No inactive shop or AI controls. |
| 0:11–0:59 | Rules panels, friend-code entry, board selection | Host chooses Classic 2025 or expanding mode and one of six named city themes. |
| 1:00–1:14 | Board thumbnails and city preview | Six free city cards; geometry is currently shared. No false bespoke skyline previews. |
| 1:15–1:43 | Four metal player panels, token selection, empty seats | Responsive player cards, room-code footer, host-only Start, occupied colours disabled. |
| 1:44–2:00 | Loading followed by a long city flyover | Menu does not load Unity. Load the 3D scene when the match starts; retain readable board framing. |
| 2:08–2:22 | Dice settle, camera follows token, Chance back/front, movement to destination | Ordered presentation frames; card text waits for Continue before subsequent movement. |
| 2:23–2:27; 3:25–3:29 | Deed and Buy/Auction controls; purchase confirmation | Separate purchase stage and deed arrival, action controls after movement. |
| 2:52–3:17 | Dedicated auction paper background, bid bubbles, gavel countdown and Sold | Dedicated auction stage, bid pulse, gavel strike, winning deed and Sold stamp. Bidding ends through rule actions rather than a new client timer. |
| 3:19; 3:32; 4:04 | Large player-coloured turn ribbon | Player-coloured turn presentation and portrait. |
| 3:55–4:01; 5:15–5:18 | Chest card, readable effect, salary notes | Readable Chest/Chance effects; money animation follows the card. |
| 4:12–4:17 | Settings in its own paper screen | Preferences remain inside Menu. |
| 6:51–6:54; 7:31–7:34 | Jail transition then separate jail decision | Direct jail movement and jail animation; pay/roll/card choices use canonical rules. |
| 8:12–9:30; 11:24–12:04 | Property drawers, cash editing and trade rejection | Explicit give/receive editor, accept/decline/counter; no invented dice frame. |
| 16:47–16:49; 20:24–20:38; 21:00–21:14 | Trade acceptance and fan of deeds for a completed set | New colour-set deed-fan celebration after purchase or accepted trade. It never changes game state. |
| 21:32–21:53 | Build/sell guidance | Existing even-building and finite bank supply controls retained. |
| 23:52–24:40; 25:54–27:14 | Bankruptcy and asset management take time; raise-money UI | Mandatory debt phase with liquidation/trade/mortgage choices; animation does not permit normal turns through debt. |
| 30:05–30:41; 31:49–32:17 | Elimination, transferred assets, winner confetti, final table | Bankruptcy and winner presentations retained. No claim that a matching 3D victory-token sequence exists yet. |

The reference uses a stylized miniature city, readable symbols and deliberate
camera changes. It is not photographic rendering. This release improves materials,
menus and event clarity within the current supplied geometry; it does not include
six newly modeled cities, a new native renderer, or every reference character rig.

Mobile uses short transitions and a local Unity player. PC retains higher detail
and camera options. Reduced-motion preferences suppress decorative UI animation.
Android/iOS physical-device frame-rate and thermal testing remain separate release gates.
