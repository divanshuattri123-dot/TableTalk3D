import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const endpoint = process.env.ROOM_SERVER_URL || "ws://127.0.0.1:8798";
const room = `qa-city-${randomUUID()}`;
const sockets = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const cash = (s, id) => s.players.find(p => p.id === id).cash;
async function connect(seat) {
  const socket = new WebSocket(`${endpoint}/parties/main/${room}?seat=${seat}`);
  const client = { socket, state: undefined, acks: new Map(), revision: 0 };
  sockets.push(socket);
  socket.addEventListener("message", event => {
    if (event.data === "pong") return;
    const message = JSON.parse(String(event.data));
    if (message.type === "state") {
      client.state = message.state;
      client.revision++;
      if (message.ackId) client.acks.set(message.ackId, message.state);
    }
  });
  await until(() => client.state);
  return client;
}
async function until(predicate) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const result = predicate();
    if (result) return result;
    await pause(12);
  }
  throw new Error("The WebSocket room did not confirm the requested state.");
}
let actions = 0;
async function send(client, action, id = randomUUID()) {
  client.acks.delete(id);
  client.socket.send(JSON.stringify({ type: "action", id, action }));
  const confirmed = await until(() => client.acks.get(id));
  actions++;
  return confirmed;
}
const act = (client, playerId, type, payload = {}, receipt) => send(client, { type, playerId, ...payload }, receipt);
const move = async (client, playerId, dice) => {
  assert.equal((await act(client, playerId, "ROLL", { dice })).phase, "awaitingMove");
  return act(client, playerId, "MOVE_RESULT", { cardDraws: [] });
};

try {
  let a = await connect("p1");
  const b = await connect("p2"), c = await connect("p3"), guest = await connect("");
  for (const [client, id, name, color] of [[a, "p1", "Asha", "red"], [b, "p2", "Bryn", "blue"], [c, "p3", "Cato", "green"]]) {
    assert.ok((await send(client, { type: "JOIN", player: { id, name, color } })).players.find(p => p.id === id));
  }
  await act(a, "p1", "SET_MODE", { mode: "mayor" });
  assert.equal((await act(a, "p1", "START", { firstPlayerId: "p1" })).mayor.mayorId, "p1");
  assert.ok((await act(a, "p1", "CITY_PROPOSE", { term: 1, policy: "transit" })).mayor.proposal);
  for (const [client, id] of [[a, "p1"], [b, "p2"], [c, "p3"]]) {
    await move(client, id, [2, 3]);
    if (id === "p1") assert.equal((await act(client, id, "BUY", { propertyId: 5 })).properties[5].ownerId, id);
    await act(client, id, "END_TURN");
  }
  assert.equal((await until(() => a.state.mayor.policy)).kind, "transit");
  for (const [client, id] of [[a, "p1"], [b, "p2"], [c, "p3"]]) {
    const after = await act(client, id, "CITY_EXPRESS");
    assert.equal(after.players.find(p => p.id === id).position, 15);
    assert.equal(after.mayor.seats[id].freeRideRound, 2);
    if (id === "p1") assert.equal((await act(client, id, "BUY", { propertyId: 15 })).properties[15].ownerId, id);
    await act(client, id, "END_TURN");
  }
  for (const [client, id] of [[a, "p1"], [b, "p2"], [c, "p3"]]) {
    await move(client, id, [4, 6]);
    if (id === "p1") await act(client, id, "BUY", { propertyId: 25 });
    if (id === "p2") await until(() => a.state.mayor.seats.p1.bills.find(bill => bill.round === 3 && bill.amount === 10));
    await act(client, id, "END_TURN");
  }
  const roundFour = await until(() => a.state.mayor.round === 4 && a.state);
  const rentBill = roundFour.mayor.seats.p1.bills.find(bill => bill.round === 3);
  assert.equal(rentBill?.amount, 20);
  const def = await act(a, "p1", "CITY_DEFER_TAX", { round: 3, billId: rentBill.id });
  assert.equal(def.mayor.seats.p1.bills.find(bill => bill.round === 3)?.status, "deferred");
  assert.deepEqual(b.state.mayor.seats.p1.bills, []);
  const tip = await act(b, "p2", "CITY_TIP", { term: 2 });
  assert.ok(tip.mayor.tip.includes("p1"));
  assert.equal(a.state.mayor.tip, undefined);
  assert.equal(guest.state.mayor.tip, undefined);
  const actualCash = cash(a.state, "p1");
  const audit = await act(b, "p2", "CITY_AUDIT", { term: 2, targetId: "p1" });
  assert.ok(audit.mayor.auditUsed);
  assert.equal(cash(await until(() => a.state.mayor.auditUsed && a.state), "p1"), actualCash - 45);

  for (const position of [35, 5, 15]) {
    for (const [client, id] of [[a, "p1"], [b, "p2"], [c, "p3"]]) {
      const after = await move(client, id, [4, 6]);
      assert.equal(after.players.find(p => p.id === id).position, position);
      if (after.phase === "awaitingBuy") await act(client, id, "BUY", { propertyId: position });
      assert.equal((await act(client, id, "END_TURN")).phase, "awaitingRoll");
    }
  }
  assert.equal((await move(a, "p1", [3, 5])).phase, "awaitingBuy");
  const arrived = await act(a, "p1", "BUY", { propertyId: 23 });
  assert.equal(arrived.properties[23].ownerId, "p1");
  assert.ok(arrived.mayor.wheel);
  const wheelId = arrived.mayor.wheel.id;
  const receipt = randomUUID();
  const firstSpin = await act(a, "p1", "CITY_SPIN", { wheelId }, receipt);
  const section = firstSpin.mayor.wheelResult.section;
  a.socket.close();
  a = await connect("p1");
  assert.equal(a.state.mayor.wheelResult.section, section);
  const replay = await act(a, "p1", "CITY_SPIN", { wheelId }, receipt);
  assert.deepEqual(replay, firstSpin);
  if (section === 5) {
    assert.equal(replay.mayor.wheel.prize, undefined);
    const result = await act(a, "p1", "CITY_SCRATCH", { wheelId });
    assert.ok([100, 250, 2000].includes(result.mayor.wheelResult.prize));
    assert.equal(cash(result, "p1") - cash(replay, "p1"), result.mayor.wheelResult.prize);
  }
  assert.ok((await act(a, "p1", "END_TURN")).phase === "awaitingRoll");
  console.log(JSON.stringify({ passed: true, room, actions, seats: 3, spectator: true, section, checks: [
    "mode and rotation", "Transit Day paid by treasury", "rail arrivals", "progressive tax", "private bill and tip",
    "audit charge", "first Fort visit", "saved separate seat reconnect", "duplicate spin receipt", "turn progression"
  ] }, null, 2));
} finally {
  for (const socket of sockets) socket.close();
}
