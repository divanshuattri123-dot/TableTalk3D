# Classic Monopoly rules audit - 20 October 2026

## Verdict

**The game is playable, but it does not implement every official classic rule.**
The regression tests passing is not a certificate of official-rule compliance.
The shortened card system and several asset-transfer procedures remain incomplete.
The expanding Indian map is an intentional custom mode requested for this game.

## Reference and method

Primary baseline: Hasbro's [C1009 Classic instruction leaflet](https://instructions.hasbro.com/api/download/C1009_en-in_monopoly-game.pdf), the two-page US-layout leaflet dated February 2017, linked by Hasbro's [India instructions page](https://instructions.hasbro.com/en-in/instruction/monopoly-game).
Both complete pages were text-extracted and visually reviewed, including the small-print debt and transfer panels.

Cross-checks: Hasbro's [2015 Standard guide](https://instructions.hasbro.com/api/download/00009_en-hk_monopoly-standard-monopoly.pdf), [older classic rules](https://www.hasbro.com/common/instruct/00009.pdf) and [Vintage guide](https://www.hasbro.com/common/instruct/Monopoly_Vintage.pdf).
These editions have differences, so this report does not treat every historical option as mandatory.
The C1009 leaflet is the main comparison, not Speed Die, Junior, timed, or short-game variants.

Evidence is the shared engine in `src/engine/{board,reducer,types}.ts`, its tests,
the presentation queue and actual disposable multiplayer rooms. Function names below
are searchable code pointers. "Matches" describes the checked behavior, not every possible sequence.

## Setup, movement and board spaces

Comparison: C1009 page 2, Setup, Play and Board Spaces. Currency/name changes are localized presentation.

| Check | Status | Current implementation / evidence |
| --- | --- | --- |
| Starting funds / GO | Matches | `handleJoin`: 1500 cash, position 0. |
| Bank accounting | Matches digitally | Bank payments are separate from player balances; no finite cash-note limit. |
| Player count | Matches baseline | Two to six; `handleJoin`, `handleStart`. The shop page's older 2-8 wording is not this leaflet's 2-6 box. |
| First-player selection | Different | `Lobby.start` picks a random player, not a highest-roll contest. |
| Movement / turn order | Matches | Two supplied dice, clockwise loop, join-order turns; `handleRoll`, `moveForward`, `handleEndTurn`. |
| Multiple tokens on a space | Matches | Positions are independent; no capture or blocking. |
| GO payment | Matches | `moveForward` / `moveTo`; salary, card-directed GO and no double payment for one crossing. |
| Doubles / triple doubles | Matches | Extra roll after landing; third consecutive double sends to Jail. |
| Buy or auction | Matches | `handleBuy`, `handleDeclineBuy`; applies to streets, railroads and utilities. |
| Ordinary rent | Matches checked calculations | `calculateRent` uses ownership, development and deed schedule. No self-rent. |
| Complete color-set rent | Matches | Doubles unimproved rent; a sibling mortgage does not erase the set's ownership. |
| Railroad rent | Matches | Ownership count selects 25/50/100/200. A mortgaged landing collects nothing. |
| Utility rent | Partial | Multipliers are 4/10, but `resolveLanding` reuses the movement dice; there is no new utility-dice action. |
| Manual rent-claim deadline | Digital difference | Rent is automatic; no claim button or missed-claim deadline. |
| Taxes | Matches baseline amounts | 200 / 100, localized to Income Tax and GST / Trade Duty. |
| Free Parking | Matches | No money pot or bonus. |
| Just Visiting | Matches | Landing at the Jail corner alone does not imprison the player. |
| Go To Jail | Matches | `sendToJail`: immediate corner move, turn-ending state and no GO reward. |

The source retains the familiar 22-street / 4-railroad / 2-utility economy on the
40-space map. This leaflet prints only sample deed faces; it does not independently
prove all 28 complete numeric schedules. Do not claim that every deed value was
individually checked against a complete physical deed set.

## Jail

Comparison: C1009 page 2, Jail panel. Existing tests exercise each implemented release path.

| Check | Status | Current implementation / evidence |
| --- | --- | --- |
| Pay before rolling | Matches | `handlePay` releases for 50; roll opportunity remains. |
| Use release card | Partial | Releases and decrements a counter; real deck/card identity is absent. |
| Escape with doubles | Matches | Moves using those dice without another doubles roll. |
| Third failed roll | Matches | `awaitingJailPayment`; payment resumes the stored dice, not a new roll. |
| Collect rent / join auctions in Jail | Matches | Neither rent nor auction eligibility excludes jailed owners. |
| Other Jail transactions | Partial | Finances work on the jailed player's own normal turn, not at arbitrary off-turn times. |

## Buildings, mortgages and trades

Comparison: C1009 page 1, Buildings, Auctions, Deals & Trades and Help panels.
The Vintage guide additionally confirms full hotel liquidation as a distinct sale path.

| Check | Status | Current implementation / evidence |
| --- | --- | --- |
| Full set / no mortgages before building | Matches | `handleBuild`, `playerOwnsFullGroup`, `groupIsUnmortgaged`. |
| Even development | Matches | Build at the group's minimum level, sell at its maximum. |
| Four houses then one hotel | Matches | Level 5 is a hotel; four houses return to inventory on upgrade. |
| Finite building stock | Matches classic map | Initial 32 houses / 12 hotels; expansion stock differs intentionally. |
| Building sale price | Matches | Half cost, integer cash; reverse-even selling. |
| Building scarcity auctions | Missing | No building-auction state/action. Exhausted stock rejects a build. |
| Hotel liquidation options | Partial | Only hotel-to-four-house downgrade; fails if four bank houses are unavailable. No complete hotel/group cash-out operation. |
| Transactions outside one's turn | Missing | `canManageFinances` restricts to the active owner or queued debtor. |
| Mortgage group clearance | Matches | Every improvement in the group must be sold first. |
| Mortgage proceeds / rent suppression | Matches | Listed principal credited; mortgaged land earns zero rent. |
| Repaying own mortgage | Matches | Principal plus 10%, rounded up with integer arithmetic. |
| Mortgaged-property transfer procedure | Missing | Trade changes ownership without a buyer interest/immediate-redemption decision. |
| Cash / deed trades | Matches basic exchange | One offer; atomic acceptance rechecks cash, ownership and development. |
| Trading improved districts | Matches | `canTradeProperty` blocks every deed in a group with buildings. |
| Trading release cards | Missing | `TradeOffer` contains cash and deed IDs only. |
| Unsecured loans / rent immunity | Not implemented | No loan balances, repayment contracts or rent-immunity fields. |
| Cash-only gifts | Custom | Currently allowed; not restricted to property/card consideration. |
| Property-auction participation | Matches | Includes the decliner and other non-bankrupt players, including jailed players. |
| Bidding / payment / no bidders | Partial | Ascending, affordable bids and all-pass completion work. Minimum is 1, not this baseline's opening 10. Passing permanently withdraws a bidder. |

## Cards, debt and elimination

For deck handling, compare C1009 page 2 and the older classic guide's card section.
For transfers and elimination, compare C1009 page 1 and the older guides' bankruptcy sections.

| Check | Status | Current implementation / evidence |
| --- | --- | --- |
| Complete card decks | Missing | `board.ts` contains eight Chance and eight Community cards, not full decks. |
| Shuffle / top-card / bottom-card order | Missing | Client selects reusable indexes; state has no ordered deck or draw cursor. |
| Held release-card circulation | Missing | Drawing adds an unlimited counter; held cards are not removed from a deck or returned to their original deck. |
| Complete card-effect coverage | Partial | Supports money, selected destinations, nearest rail, back three, Jail, release and collection. No repairs-by-building, nearest-utility or special card rent multiplier fields. |
| Readable card reveal | Fixed in this update | Structured card text, front-facing animated HTML and explicit Continue; not dismissed by Unity completion or timeout. This is a UI check, not a tabletop rule. |
| Raise money before continuing | Fixed in this update | `awaitingDebt` gates normal actions; sales, mortgages and rescue offers remain available. |
| Debts outside the roller's turn | Matches checked flow | Ordered debt queue; original turn resumes after settlement. Tested with Community collection. |
| Creditor receives paid cash | Matches checked flow | Existing cash and subsequent proceeds only, not invented unpaid rent. |
| Insolvency test | Different | `netWorth` uses listed asset values, not full realizable liquidation capacity. Automatic negative-net-worth elimination was part of the original project spec. |
| Surrender while rescue is possible | Custom | Negative-cash debtor may voluntarily declare bankruptcy even while holding potentially valuable assets. |
| Creditor asset settlement | Partial | Deeds transfer, but surviving buildings are not liquidated first; release cards are discarded instead of transferred. |
| Bank asset settlement | Partial | Mortgages/improvements clear and stock returns; mandatory immediate auctions of returned deeds are missing. |
| Transfer-interest debt chains | Missing | No interest decision means no associated recipient debt/settlement phase. |
| Eliminated turns / winner | Matches | Removed from future turns; final surviving player gets `winnerId` and `gameOver`. Browser bankruptcy flow verified this. |

The leaflet is not a complete face-by-face card reference. A full official deck's
exact wording/composition must be sourced for a chosen edition before claiming all
32 card effects have been reproduced. This audit makes no such claim.

## Explicit custom-mode differences

- Indian landmarks and rupees replace the US labels without changing the base currency scale.
- Four, five and six players expand to 48, 56 and 64 spaces with additional color sets and bank stock. Strict classic mode would keep 40 spaces regardless of player count.
- Reusable small decks, turn-gated property management, automatic rent and random starting player are current simplifications, not proof of official compliance.
- Speed Die, short-game, timed-game and Free Parking jackpot variants are not enabled. They are not missing requirements for the selected ordinary classic baseline. The older optional percentage-tax rule is not this baseline's flat-tax rule.

## Verification for this update

- Vitest: 93 passing tests across engine, debt, presentation, screen labels and orientation helpers.
- Actual local Worker: 30 multiplayer actions with identical snapshots at two clients.
- Expanded rooms: 90 actions across two through six clients, including reload, auctions and locked board size.
- Browser: Community Chest remained readable after animation completion; mortgage recovery changed -6 to +24 and restored turn controls; bankruptcy returned the deed and declared the other player winner.
- Mobile layout: portrait rotate gate and landscape card/control layout checked in device emulation. Physical-phone frame rate and every browser's orientation permission are not yet measured.

## Recommended implementation order for strict classic compliance

1. Real shuffled deck state and unique held-card IDs; pass shuffled orders in START to preserve reducer purity.
2. Correct liquidation-based bankruptcy plus bank auction queue and creditor settlement.
3. Mortgaged-deed transfer interest/redemption and any resulting debt chains.
4. Release-card trading, complete card effects and a utility-rent dice phase.
5. Building scarcity auctions, full hotel liquidation and coordinated off-turn property management.
6. Separate selectable strict 40-space classic mode from the requested expanding India mode; highest-roll start and baseline opening bids.

These gaps are documented, not silently described as implemented. They require
new engine states and regression tests before additional presentation work.
