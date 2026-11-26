import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const host = process.env.ROOM_SERVER_URL || "ws://127.0.0.1:8799";
const room = `council-test-${randomUUID()}`;
const clients = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(read) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    const result = read();
    if (result) return result;
    await sleep(12);
  }
  throw new Error("The room did not confirm the expected state");
}

async function connect(seat) {
  const socket = new WebSocket(`${host}/parties/main/${room}?seat=${seat}`);
  const receipts = new Map();
  const link = { seat, socket, state: undefined };
  clients.push(link);
  socket.addEventListener("message", event => {
    if (event.data === "pong") return;
    const message = JSON.parse(event.data);
    if (message.type !== "state") return;
    link.state = message.state;
    if (message.ackId) receipts.set(message.ackId, message.state);
  });
  await until(() => link.state);
  link.act = async (type, params = {}, id = randomUUID()) => {
    receipts.delete(id);
    socket.send(JSON.stringify({ type: "action", id, action: { type, playerId: seat, ...params } }));
    return until(() => receipts.get(id));
  };
  return link;
}
const cash = (s, id) => s.players.find(player => player.id === id).cash;
const move = async (client, dice) => {
  assert.equal((await client.act("ROLL", { dice })).phase, "awaitingMove");
  return client.act("MOVE_RESULT", { cardDraws: [] });
};

try {
  const a = await connect("qa-a");
  let b = await connect("qa-b");
  const c = await connect("qa-c");
  for (const [client, name, color] of [[a, "Asha", "red"], [b, "Bryn", "blue"], [c, "Cato", "green"]]) {
    assert.equal((await client.act("JOIN", { player: { id: client.seat, name, color } })).notice, undefined);
  }
  await a.act("SET_MODE", { mode: "mayor" });
  assert.equal((await a.act("START", { firstPlayerId: a.seat })).mayor.council, true);
  assert.ok((await a.act("CITY_PROPOSE", { policy: "credit", term: 1 })).mayor.proposal);
  assert.equal((await move(a, [1,3])).phase, "awaitingEndTurn");
  await a.act("END_TURN");
  assert.equal((await b.act("CITY_CONTRACT", { contract: "transit" })).mayor.seats[b.seat].contract, "transit");
  assert.equal(a.state.mayor.seats[b.seat].contract, undefined);
  assert.equal((await move(b, [1,2])).phase, "awaitingBuy");
  assert.equal((await b.act("DECLINE_BUY")).auction?.cityBacking, undefined);
  await b.act("AUCTION_BID", { amount: 1150 });
  await a.act("AUCTION_BID", { pass: true });
  assert.equal(cash(await c.act("AUCTION_BID", { pass: true }), b.seat), 350);
  await b.act("END_TURN");
  await move(c, [1,2]);
  assert.equal(cash(c.state, b.seat), 354);
  assert.equal((await c.act("END_TURN")).mayor.policy?.kind, "credit");
  assert.equal((await move(a, [3,6])).pendingPurchase?.propertyId, 13);
  const backed = await a.act("DECLINE_BUY");
  assert.deepEqual(backed.auction.cityBacking, { limit: 200, playerIds: [b.seat] });
  assert.ok((await b.act("AUCTION_BID", { amount: 555 })).notice);
  await b.act("AUCTION_BID", { amount: 500 });
  await c.act("AUCTION_BID", { pass: true });
  const receipt = randomUUID();
  const sold = await a.act("AUCTION_BID", { pass: true }, receipt);
  assert.equal(sold.properties[13].ownerId, b.seat);
  assert.equal(cash(sold, b.seat), 0);
  assert.equal(sold.mayor.treasury, 254);
  assert.equal(sold.mayor.seats[b.seat].loanAmountDue, 165);
  b.socket.close();
  b = await connect("qa-b");
  assert.equal(b.state.mayor.seats[b.seat].contract, "transit");
  assert.equal(b.state.mayor.seats[b.seat].loanAmountDue, 165);
  assert.deepEqual(await a.act("AUCTION_BID", { pass: true }, receipt), sold);
  await a.act("END_TURN");
  await move(b, [1,2]);
  const later = await b.act("DECLINE_BUY");
  assert.equal(later.auction.cityBacking, undefined);
  console.log(JSON.stringify({ passed: true, room, seats: 3, contractPrivate: true, auction: {
    bid: 500, financed: 146, due: 165, reconnect: true, duplicateReceipt: false
  } }, null, 2));
} finally {
  for (const client of clients) client.socket.close();
}
