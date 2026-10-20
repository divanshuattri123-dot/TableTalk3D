# Multiplayer Property Game — Engine Specification

## Scope and architecture

This is a browser-based, real-time Monopoly-style game for a small private room.
The browser never owns canonical state: a PartyServer room stores one GameState,
applies the shared reducer, then broadcasts the complete state. The React client
renders that state and sends typed actions. The client imports the same reducer
for shared rules/tests, but only canonical server snapshots enter the presentation
queue. Optimistic snapshots are not rendered: replaying an echo would duplicate
money and ownership animations.

The shared engine has this sole public transition contract:

    reduceGame(state: GameState, action: GameAction): GameState

Hosting update, 19 October 2026: PartyKit's managed platform no longer accepts
deployments. With the user's approval, the room wrapper now uses its official
successor PartyServer on Cloudflare Workers Free. The PartySocket protocol and
engine action contract are unchanged. Room game state remains in memory only;
no game data is written to Durable Object storage.

It is a pure, immutable reducer. It has no React, PartyKit, browser, timer,
Date, I/O, or random-number dependency. Inputs that would normally be random
are always action payloads:

- START.firstPlayerId selects the first player.
- ROLL.dice supplies the two dice.
- MOVE_RESULT.cardDraws supplies fixed-deck indexes, including a chained card.
- TRADE_OFFER.offerId is generated outside the reducer.

Players are trusted: the room accepts their declared player IDs without an
account or identity check. The reducer checks turn eligibility and game-rule
preconditions so an invalid typed action cannot change game economics or turn state.
Auction bids and a trade recipient's reply are intentional exceptions to the
normal active-player turn rule.

## Board and fixed rules

### Player-count expansion (3D edition)

The board uses 40 tiles for 2–3 players, 48 for 4, 56 for 5, and 64 for 6.
The lobby previews that size; START locks it for the match. Eliminations and
disconnects never resize it. `GameState.boardSize` is canonical and is used by
movement, rent, card destinations, GO, Jail and both renderers.

Each expansion tier inserts a complete new pair of color properties before
the next corner on each side. Corners are at 0, size/4, size/2 and 3*size/4.
Classic tile destinations use `classicPosition(position, boardSize)` rather
than a hard-coded index. The classic 40-tile game remains unchanged. Additional
groups have listed prices/rent and obey the same even-build/mortgage rules.
Bank inventory starts at 32 houses/12 hotels, plus 16 houses/4 hotels per tier.

Player cosmetics add optional tokenId/diceId fields. SET_APPEARANCE updates only
those fields for an existing player, without changing the turn or economics.
Asset IDs are looked up in a static catalog; no browser objects or asset loading
ever enters the reducer. It remains a pure deterministic state transition.

### Asset and rendering boundary

All convertible supplied meshes, textures, sprites, sounds and text data are
cataloged and available lazily in an asset studio. Only the selected assets are
fetched/rendered for a live scene. OBJ geometry is converted to optimized GLB;
images/audio are compressed for the web. Unity-only rigs, animations, shaders
and scene bindings remain source references, not fabricated web conversions.
3D movement/dice/camera animation is a view of canonical state. The 2D board is
a fallback, not a different game. Quality, camera, music and volume are local UI
preferences. They do not affect dice, cash, positions or turn eligibility.

The board is the classic 40-position clockwise loop. Position 0 is GO; 10, 20,
and 30 are Jail / Just Visiting, Free Parking, and Go To Jail. Purchasable tile
IDs equal their positions, keeping rendering and ownership lookup aligned.

The India edition uses real Indian landmarks rather than the original US
street names. Its classic colour districts are Kochi (brown), Chennai (light
blue), Bengaluru (pink), Kolkata (orange), Hyderabad (red), Jaipur (yellow),
Delhi (green), and Mumbai (dark blue). The four rail links are CSMT, New Delhi
Station, Howrah Junction, and Chennai Central; utilities are the City Power
Grid and Municipal Waterworks. Every deed carries a short board label, city /
region, and a one-line landmark detail for the inspector and title deed.
Player-count expansions add real destinations in Ahmedabad, Varanasi, Amritsar,
Lucknow, Udaipur, Srinagar, Pune, Goa, Mysuru, Rishikesh, Darjeeling, and the
Andaman Islands. The familiar 40-space order and rent/economy remain intact.

| Tile class | Positions |
| --- | --- |
| Color properties | 1, 3, 6, 8, 9, 11, 13, 14, 16, 18, 19, 21, 23, 24, 26, 27, 29, 31, 32, 34, 37, 39 |
| Railroads | 5, 15, 25, 35 |
| Utilities | 12, 28 |
| Chance | 7, 22, 36 |
| Community Chest | 2, 17, 33 |
| Tax | 4, 38 |
| Corners / special | 0, 10, 20, 30 |

Every purchasable tile holds its listed price, mortgage value, group, house
cost where relevant, and rent schedule. Color rents are
[base, one house, two, three, four, hotel]. Railroads cost
₹25 / ₹50 / ₹100 / ₹200 by count owned. Utilities charge four times the dice
total, or ten times it when both utilities have the same owner. An unmortgaged
complete color group doubles its unimproved base rent.

Players start with ₹1,500, token position 0, no properties, no jail status, and
no cards. Passing or landing on GO pays ₹200. Free Parking has no jackpot.

## State model

    type Phase =
      | "lobby"
      | "awaitingRoll"
      | "awaitingMove"
      | "awaitingBuy"
      | "awaitingJailPayment"
      | "awaitingAuction"
      | "awaitingTradeResponse"
      | "awaitingEndTurn"
      | "gameOver"

    interface Player {
      id: string; name: string; color: string; cash: number; position: number;
      inJail: boolean; jailTurns: number; getOutOfJailCards: number;
      bankrupt: boolean;
    }

    interface PropertyState {
      ownerId?: string;
      houses: 0 | 1 | 2 | 3 | 4 | 5; // 5 is a hotel
      mortgaged: boolean;
    }

    interface GameState {
      roomCode: string;
      phase: Phase;
      players: Player[];
      activePlayerId?: string;
      properties: Record<number, PropertyState>;
      bankHouses: number;     // 32 initially
      bankHotels: number;     // 12 initially
      consecutiveDoubles: number;
      pendingRoll?: PendingRoll;
      pendingPurchase?: PendingPurchase;
      auction?: AuctionState;
      pendingTrade?: TradeOffer;
      card?: CardReveal;
      lastRoll?: LastRoll;
      eventLog: GameEvent[];  // newest first, bounded to 60
      nextEventId: number;
      notice?: string;
      winnerId?: string;
    }

Money is integer dollars. netWorth(player) is cash plus listed property and
improvement value less mortgage principal. It implements the explicitly
requested negative-net-worth bankruptcy condition.

## Action contract

Every action names the player attempting it. The reducer supports exactly these
action types:

| Action | Required payload | Effect |
| --- | --- | --- |
| JOIN | player | Adds a unique player in the lobby, maximum six. |
| START | playerId, firstPlayerId | Host starts with at least two players and an eligible supplied first player. |
| ROLL | playerId, dice: [number, number] | Validates and stores dice, resolving jail/doubles rules but not movement. |
| MOVE_RESULT | playerId, cardDraws? | Moves by stored dice and resolves landing effects. |
| BUY | playerId, propertyId | Buys the currently pending property. |
| DECLINE_BUY | playerId | Opens an auction for the pending property. |
| BUILD | playerId, propertyId, operation | Builds or sells one improvement. |
| MORTGAGE | playerId, propertyId, mortgage | Mortgages or unmortgages an eligible property. |
| PAY | playerId, kind | Pays the jail fine or uses a jail-release card. |
| END_TURN | playerId | Advances, or lets the same player roll after doubles. |
| AUCTION_BID | playerId, amount or pass | Places an ascending bid or permanently passes. |
| TRADE_OFFER | playerId, offerId, recipient, cash/property terms | Creates one bilateral offer. |
| TRADE_ACCEPT | playerId, offerId | Atomically accepts a still-valid offer. |
| TRADE_DECLINE | playerId, offerId | Rejects the offer without a transfer. |

A CardDraw names chance or community and a valid index in its corresponding
fixed eight-card deck. Deck entries are intentionally reusable: this compact
game has fixed effects but does not shuffle or remove cards. Thus the reducer
remains deterministic without concealed state.

## Turn state machine

    lobby --START--> awaitingRoll --ROLL--> awaitingMove --MOVE_RESULT-->
      awaitingBuy | awaitingAuction | awaitingJailPayment | awaitingEndTurn

    awaitingBuy --BUY / DECLINE_BUY--> awaitingEndTurn / awaitingAuction
    awaitingAuction --award or all pass--> awaitingEndTurn
    awaitingEndTurn --END_TURN--> awaitingRoll for same player after doubles,
                                  otherwise awaitingRoll for next solvent player

ROLL never advances a token. Separating it from MOVE_RESULT permits dice
animation before movement and card display afterward. A MOVE_RESULT can
consume several supplied CardDraw items because a card-directed move may land
on another card space.

Jail and doubles details:

1. Before rolling, a jailed player can PAY a ₹50 fine or use a jail card;
   either releases them and leaves their roll opportunity.
2. A jail double releases and moves the player by that roll.
3. A non-double ends a jailed turn twice. The third failed roll requires the
   ₹50 fine; after it, the previously stored dice must be moved.
4. The third consecutive double sends a non-jailed player straight to Jail,
   without movement or GO money.
5. Go To Jail and matching cards do not award GO money.

## Landing, cards, and payments

- An unowned property records a pending purchase for BUY or DECLINE_BUY.
- An owned unmortgaged property charges rent, except to its own owner.
- Tax tiles pay the bank: income tax ₹200 and GST / trade duty ₹100.
- Chance and Community Chest use small fixed decks of movement, money,
  Go To Jail, and Get Out of Jail Free effects.
- Card text/effect is stored in state.card; dismissing the modal is client UI
  state and never mutates game state.
- Forced payments can temporarily make cash negative. Afterwards, a player
  with negative net worth is bankrupt.

If a bankrupt player's creditor is another player, all their properties
transfer to that creditor with mortgage state intact. If their creditor is the
bank, their properties return to the bank with improvements cleared. When only
one solvent player remains, phase becomes gameOver and winnerId is set.
If the active player becomes bankrupt while other players remain, the reducer
advances immediately to the next solvent player; an eliminated player never
needs to press End Turn. A hotel returned to the bank returns one hotel only,
because its four houses were already returned when it was built.

## Buildings and mortgages

BUILD applies only to the active owner during a normal turn phase. Color
properties require a complete unmortgaged set. Improvement levels must remain
even across that set. Building 1–4 consumes a bank house; level 5 converts
four houses into a hotel, returning those houses to the bank and consuming a
bank hotel. Selling follows the reverse inventory rules and pays half of house
cost.

A property cannot be mortgaged while its color group has any improvement.
Mortgage proceeds equal half its listed price. Unmortgaging costs principal
plus 10%, rounded up. Mortgaged properties charge no rent. Other unimproved
streets still earn doubled base rent when their owner holds the full colour set.
The surcharge is computed with integer arithmetic so floating-point rounding
cannot add an extra dollar.

## Auctions and trades

Declining a property begins an open ascending auction among all solvent
players. A bid must exceed the current bid and be payable in cash. A player who
passes cannot bid again. Once all non-leading eligible bidders pass, the leader
pays and receives the property. If every bidder passes, the property stays with
the bank.

A trade freezes normal turn progression until its recipient responds. One
offer may exchange cash and unimproved properties in either direction. A
color-group property can be traded only after every building in its group has
been sold. On
acceptance, cash, ownership, solvency, and improvement constraints are checked
again before every transfer is applied together. A stale or invalid offer makes
no economic change.

## Invalid actions and test gate

Invalid typed actions leave all substantive game state unchanged,
set a concise notice, and append one deterministic event log item. Log IDs are
incrementing integers with no timestamps.
JOIN with an existing player ID is idempotent in every phase, allowing a page
reload to resume the same seat without duplicating players or changing cash.

Before creating PartyKit or React files, Vitest must demonstrate:

1. lobby join/start, immutable output, and deterministic input handling;
2. passing GO, purchase, decline, auction award, and all-pass auction;
3. base, monopoly, railroad, utility, house/hotel, and mortgage rent;
4. doubles, triple-doubles jail, and every jail-release path;
5. tax, cards, chained cards, and Go To Jail;
6. legal/illegal even building and mortgage inventory changes;
7. creditor and bank bankruptcy plus last-player victory;
8. offer, accept, decline, and stale-trade rejection;
9. wrong phase, ownership, and turn attempts preserving substantive state.
