import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const endpoint = process.env.ROOM_SERVER_URL ?? "ws://127.0.0.1:1999";
const room = `qa-colours-${randomUUID()}`, clients = [];
async function connect() {
  const socket = new WebSocket(`${endpoint}/parties/main/${room}`), waiters = new Set();
  const client = { socket, state: undefined, waitFor: undefined };
  socket.addEventListener("message", event => {
    const message = JSON.parse(String(event.data));
    if (message.type !== "state") return;
    client.state = message.state;
    for (const check of waiters) check();
  });
  client.waitFor = predicate => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { waiters.delete(check); reject(new Error("Colour room timed out")); }, 8000);
    const check = () => { if (client.state && predicate(client.state)) { clearTimeout(timer); waiters.delete(check); resolve(client.state); } };
    waiters.add(check); check();
  });
  clients.push(client); await client.waitFor(() => true); return client;
}
const send = (client, action) => client.socket.send(JSON.stringify({ type: "action", action }));
async function synced(predicate) {
  await Promise.all(clients.map(client => client.waitFor(predicate)));
  assert.deepEqual(clients[0].state, clients[1].state);
  return clients[0].state;
}
try {
  const a = await connect(), b = await connect();
  send(a, { type: "JOIN", player: { id: "a", name: "QA Coral A", color: "#ed6266" } });
  send(b, { type: "JOIN", player: { id: "b", name: "QA Coral B", color: "#ED6266" } });
  let state = await synced(state => state.nextEventId === 3);
  assert.equal(state.players.length, 1); assert.match(state.notice, /colour.*taken/);
  const loser = state.players[0].id === "a" ? "b" : "a";
  send(b, { type: "JOIN", player: { id: loser, name: "QA Retry", color: "#4e9fef" } });
  state = await synced(state => state.nextEventId === 4);
  assert.equal(state.players.length, 2);
  send(a, { type: "SET_APPEARANCE", playerId: loser, color: "#ed6266" });
  state = await synced(state => state.nextEventId === 5);
  assert.equal(state.players.find(player => player.id === loser).color, "#4e9fef");
  send(a, { type: "SET_APPEARANCE", playerId: loser, color: "#37b995" });
  state = await synced(state => state.nextEventId === 6);
  assert.equal(state.notice, undefined);
  send(a, { type: "JOIN", player: { id: "c", name: "QA Released Blue", color: "#4e9fef" } });
  state = await synced(state => state.nextEventId === 7);
  assert.equal(new Set(state.players.map(player => player.color)).size, 3);
  const host = state.players[0].id;
  send(a, { type: "START", playerId: host, firstPlayerId: host });
  state = await synced(state => state.nextEventId === 8);
  assert.equal(state.phase, "awaitingRoll");
  send(b, { type: "SET_APPEARANCE", playerId: loser, color: "#efb447" });
  state = await synced(state => state.nextEventId === 9);
  assert.equal(state.players.find(player => player.id === loser).color, "#37b995");
  assert.equal(new Set(state.players.map(player => player.color)).size, 3);
  console.log("PASS: 8 real WebSocket actions; concurrent colour collision rejected, retry accepted, occupied change rejected, freed colour reused, colours locked at start; both clients stayed identical.");
} finally { for (const client of clients) client.socket.close(); }
