import { describe, expect, it } from "vitest";
import { cardAt, classicPosition, colorGroupTiles, getBoard, getTile, isPurchasableTile, railroadPositions } from "./board";
import { createInitialState, playerOwnsFullGroup, reduceGame } from "./reducer";
import type { CardDraw, GameAction, GameState } from "./types";

const rng = (seed: number) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
function drawsFor(s: GameState, random: () => number): CardDraw[] {
  const player = s.players.find(p => p.id === s.activePlayerId)!;
  let position = (player.position + s.pendingRoll!.total) % s.boardSize;
  const draws: CardDraw[] = [];
  for (let depth = 0; depth < 4; depth++) {
    const tile = getTile(position, s.boardSize);
    if (tile.kind !== "chance" && tile.kind !== "community") break;
    const draw = { deck: tile.kind, index: depth === 3 ? 4 : Math.floor(random() * 8) };
    draws.push(draw); const effect = cardAt(draw.deck, draw.index)!.effect;
    if (effect.kind === "moveTo") position = classicPosition(effect.position, s.boardSize);
    else if (effect.kind === "nearestRailroad") position = railroadPositions(s.boardSize).find(p => p > position) ?? railroadPositions(s.boardSize)[0]!;
    else if (effect.kind === "moveRelative") position = (position + effect.spaces + s.boardSize) % s.boardSize;
    else break;
  }
  return draws;
}

describe("complete-match QA with only public reducer actions", () => {
  it.each([2, 3, 4, 5, 6])("finishes seeded %i-player matches without broken stock, debt or turn state", count => {
    for (const seed of [17, 193, 722]) {
      const random = rng(seed), colours = ["red", "blue", "green", "yellow", "purple", "pink"];
      let s = createInitialState(`QA${count}`), steps = 0, tradesThisTurn = 0;
      const apply = (action: GameAction) => {
        const before = JSON.stringify(s), next = reduceGame(s, action);
        expect(JSON.stringify(s)).toBe(before);
        expect(next.notice, `${seed}/${count} ${JSON.stringify(action)}`).toBeUndefined();
        expect(reduceGame(s, action)).toEqual(next); s = next; steps++;
        const properties = Object.values(s.properties);
        expect(s.bankHouses + properties.reduce((n, p) => n + (p.houses === 5 ? 0 : p.houses), 0)).toBe(32 + (s.boardSize - 40) * 2);
        expect(s.bankHotels + properties.filter(p => p.houses === 5).length).toBe(12 + (s.boardSize - 40) / 2);
        expect(s.bankHouses).toBeGreaterThanOrEqual(0); expect(s.bankHotels).toBeGreaterThanOrEqual(0);
        expect(s.players.every(p => Number.isSafeInteger(p.cash) && p.position >= 0 && p.position < s.boardSize)).toBe(true);
        if (s.phase !== "lobby" && s.phase !== "gameOver") expect(s.players.find(p => p.id === s.activePlayerId)?.bankrupt).toBe(false);
        if (s.players.some(p => !p.bankrupt && p.cash < 0)) expect(["awaitingDebt", "awaitingTradeResponse"]).toContain(s.phase);
        for (const p of properties) if (p.ownerId) expect(s.players.find(player => player.id === p.ownerId)?.bankrupt).toBe(false);
      };
      for (let i = 0; i < count; i++) apply({ type: "JOIN", player: { id: `p${i}`, name: `QA ${i}`, color: colours[i]! } });
      apply({ type: "START", playerId: "p0", firstPlayerId: "p0" });
      while (s.phase !== "gameOver" && steps < 15000) {
        const id = s.activePlayerId!, player = s.players.find(p => p.id === id)!;
        const board = getBoard(s.boardSize);
        if (s.phase === "awaitingEndTurn") {
          const build = board.find(tile => tile.kind === "property" && s.properties[tile.position]?.ownerId === id && playerOwnsFullGroup(s, id, tile.group) &&
            colorGroupTiles(tile.group, s.boardSize).every(t => !s.properties[t.position]!.mortgaged) &&
            s.properties[tile.position]!.houses < 5 && player.cash >= tile.houseCost + 70 &&
            s.properties[tile.position]!.houses === Math.min(...colorGroupTiles(tile.group, s.boardSize).map(t => s.properties[t.position]!.houses)) &&
            (s.properties[tile.position]!.houses === 4 ? s.bankHotels > 0 : s.bankHouses > 0));
          if (build) { apply({ type: "BUILD", playerId: id, propertyId: build.position, operation: "build" }); continue; }
          // Cooperative test agents consolidate districts so the run exercises hotel rent and elimination.
          const deed = board.find(tile => tile.kind === "property" && s.properties[tile.position]!.ownerId === id && !s.properties[tile.position]!.mortgaged && !s.properties[tile.position]!.houses &&
            colorGroupTiles(tile.group, s.boardSize).every(t => !s.properties[t.position]!.houses) &&
            colorGroupTiles(tile.group, s.boardSize).some(t => s.properties[t.position]!.ownerId && s.properties[t.position]!.ownerId !== id));
          if (deed?.kind === "property" && tradesThisTurn < 1) {
            const to = s.properties[colorGroupTiles(deed.group, s.boardSize).find(t => s.properties[t.position]!.ownerId && s.properties[t.position]!.ownerId !== id)!.position]!.ownerId!;
            if (s.players.find(p => p.id === to)!.cash >= 40) {
              tradesThisTurn++; apply({ type: "TRADE_OFFER", playerId: id, offerId: `qa-${steps}`, toPlayerId: to, offeredCash: 0, offeredPropertyIds: [deed.position], requestedCash: 40, requestedPropertyIds: [] }); continue;
            }
          }
        }
        switch (s.phase) {
          case "awaitingRoll": apply({ type: "ROLL", playerId: id, dice: [1 + Math.floor(random() * 6), 1 + Math.floor(random() * 6)] }); break;
          case "awaitingMove": apply({ type: "MOVE_RESULT", playerId: id, cardDraws: drawsFor(s, random) }); break;
          case "awaitingBuy": { const tile = getTile(s.pendingPurchase!.propertyId, s.boardSize); apply(isPurchasableTile(tile) && player.cash >= tile.price + 50 ? { type: "BUY", playerId: id, propertyId: tile.position } : { type: "DECLINE_BUY", playerId: id }); break; }
          case "awaitingAuction": {
            const auction = s.auction!, candidate = auction.eligiblePlayerIds.find(p => p !== auction.highestBidderId && !auction.passedPlayerIds.includes(p))!;
            const bid = auction.currentBid + 10, bidder = s.players.find(p => p.id === candidate)!;
            apply({ type: "AUCTION_BID", playerId: candidate, ...(bidder.cash >= bid + 50 && bid < 150 ? { amount: bid } : { pass: true }) }); break;
          }
          case "awaitingTradeResponse": apply({ type: "TRADE_ACCEPT", playerId: s.pendingTrade!.toPlayerId, offerId: s.pendingTrade!.id }); break;
          case "awaitingJailPayment": apply({ type: "PAY", playerId: id, kind: player.getOutOfJailCards ? "jailCard" : "jailFine" }); break;
          case "awaitingDebt": {
            const debtor = s.debts![0]!.playerId;
            const improved = board.find(t => t.kind === "property" && s.properties[t.position]!.ownerId === debtor && s.properties[t.position]!.houses);
            const mortgage = board.find(t => isPurchasableTile(t) && s.properties[t.position]!.ownerId === debtor && !s.properties[t.position]!.mortgaged);
            apply(improved ? { type: "BUILD", playerId: debtor, propertyId: improved.position, operation: "sellGroup" } : mortgage ? { type: "MORTGAGE", playerId: debtor, propertyId: mortgage.position, mortgage: true } : { type: "BANKRUPT", playerId: debtor }); break;
          }
          case "awaitingEndTurn": tradesThisTurn = 0; apply({ type: "END_TURN", playerId: id }); break;
          default: throw new Error(`Unplayable phase ${s.phase}`);
        }
      }
      expect(s.phase, `seed ${seed}, ${count} players, ${steps} actions`).toBe("gameOver");
      expect(s.players.filter(p => !p.bankrupt)).toHaveLength(1);
      expect(s.winnerId).toBe(s.players.find(p => !p.bankrupt)!.id);
    }
  }, 120000);
});
