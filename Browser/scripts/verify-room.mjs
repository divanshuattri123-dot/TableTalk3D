import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const endpoint = process.env.ROOM_SERVER_URL ?? "ws://127.0.0.1:1999";
const room = `qa-${randomUUID()}`;
const clients = [];

async function connect() {
  const socket = new WebSocket(`${endpoint}/parties/main/${room}`);
  const waiters = new Set();
  const client = { socket, state: undefined, waitFor: undefined };
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.type !== "state") return;
    client.state = message.state;
    for (const check of waiters) check();
  });
  client.waitFor = (predicate) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { waiters.delete(check); reject(new Error(`Room state timed out: ${client.state?.phase}`)); }, 8000);
    const check = () => {
      if (!client.state || !predicate(client.state)) return;
      clearTimeout(timeout); waiters.delete(check); resolve(client.state);
    };
    waiters.add(check); check();
  });
  clients.push(client);
  await client.waitFor(() => true);
  return client;
}

try {
  const a = await connect();
  const b = await connect();
  let actions = 0;
  const send = async (client, action, predicate) => {
    client.socket.send(JSON.stringify({ type: "action", action }));
    const state = await client.waitFor(predicate);
    await (client === a ? b : a).waitFor((other) => other.nextEventId === state.nextEventId);
    assert.deepEqual(a.state, b.state);
    actions += 1;
    return state;
  };
  const action = (type, playerId, payload = {}) => ({ type, playerId, ...payload });
  const cash = (state, id) => state.players.find((player) => player.id === id).cash;

  for (const [id, name, color] of [["p1", "Asha", "red"], ["p2", "Bryn", "blue"], ["p3", "Cato", "green"]]) {
    await send(a, { type: "JOIN", player: { id, name, color } }, (s) => s.players.some((p) => p.id === id));
  }
  await send(a, action("START", "p1", { firstPlayerId: "p1" }), (s) => s.phase === "awaitingRoll");
  const move = async (client, id, dice, draws, predicate) => {
    await send(client, action("ROLL", id, { dice }), (s) => s.phase === "awaitingMove");
    return send(client, action("MOVE_RESULT", id, { cardDraws: draws }), predicate);
  };
  const end = (client, id, next) => send(client, action("END_TURN", id), (s) => s.phase === "awaitingRoll" && s.activePlayerId === next);

  await move(a, "p1", [1, 2], [], (s) => s.phase === "awaitingBuy");
  await send(a, action("BUY", "p1", { propertyId: 3 }), (s) => s.properties[3].ownerId === "p1");
  await end(a, "p1", "p2");
  await move(b, "p2", [1, 2], [], (s) => s.phase === "awaitingEndTurn" && cash(s, "p2") === 1496);
  await end(b, "p2", "p3");
  await move(a, "p3", [3, 4], [{ deck: "chance", index: 6 }], (s) => s.players[2].inJail);
  await end(a, "p3", "p1");
  await send(a, action("TRADE_OFFER", "p1", { offerId: "qa", toPlayerId: "p2", offeredCash: 0, requestedCash: 100, offeredPropertyIds: [3], requestedPropertyIds: [] }), (s) => s.phase === "awaitingTradeResponse");
  await send(b, action("TRADE_ACCEPT", "p2", { offerId: "qa" }), (s) => s.properties[3].ownerId === "p2");
  await move(a, "p1", [1, 1], [], (s) => s.phase === "awaitingBuy");
  await send(a, action("DECLINE_BUY", "p1"), (s) => s.phase === "awaitingAuction");
  await send(a, action("AUCTION_BID", "p1", { amount: 50 }), (s) => s.auction?.currentBid === 50);
  await send(b, action("AUCTION_BID", "p2", { pass: true }), (s) => s.auction?.passedPlayerIds.includes("p2"));
  await send(a, action("AUCTION_BID", "p3", { pass: true }), (s) => s.properties[5].ownerId === "p1");
  await end(a, "p1", "p1");
  await move(a, "p1", [2, 3], [], (s) => s.phase === "awaitingEndTurn");
  await end(a, "p1", "p2");
  await send(b, action("MORTGAGE", "p2", { propertyId: 3, mortgage: true }), (s) => s.properties[3].mortgaged);
  await send(b, action("MORTGAGE", "p2", { propertyId: 3, mortgage: false }), (s) => !s.properties[3].mortgaged);
  const final = await move(b, "p2", [1, 3], [{ deck: "chance", index: 0 }], (s) => s.phase === "awaitingEndTurn" && s.players[1].position === 0);
  assert.equal(cash(final, "p2"), 1593);
  assert.equal(cash(final, "p1"), 1494);
  console.log(`PASS: ${actions} real WebSocket actions; 3 players; both clients received identical canonical snapshots. Buying, rent, cards, jail, doubles, auction, trades, mortgage, GO verified.`);
} finally {
  for (const client of clients) client.socket.close();
}
