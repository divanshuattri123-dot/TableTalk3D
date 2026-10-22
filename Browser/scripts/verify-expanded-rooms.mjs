import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const endpoint = process.env.ROOM_SERVER_URL ?? "ws://127.0.0.1:1999";
const catalog = JSON.parse(await (await import("node:fs/promises")).readFile("public/assets/catalog.json", "utf8"));
let actions = 0;

for (const count of [2, 3, 4, 5, 6]) {
  const room = `qa-expanded-${count}-${randomUUID()}`, clients = [];
  const size = count <= 3 ? 40 : 40 + (count - 3) * 8;
  const connect = async () => {
    const socket = new WebSocket(`${endpoint}/parties/main/${room}`), waiters = new Set();
    const client = { socket, state: undefined };
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.type !== "state") return;
      client.state = message.state;
      for (const check of waiters) check();
    });
    client.wait = (predicate) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiters.delete(check); reject(new Error(`${count}-player room timed out: ${client.state?.phase}`)); }, 10000);
      const check = () => { if (!client.state || !predicate(client.state)) return; clearTimeout(timer); waiters.delete(check); resolve(client.state); };
      waiters.add(check); check();
    });
    clients.push(client); await client.wait(() => true); return client;
  };
  const send = async (client, action, predicate) => {
    client.socket.send(JSON.stringify({ type: "action", action }));
    await Promise.all(clients.map((peer) => peer.wait(predicate)));
    clients.forEach((peer) => assert.deepEqual(peer.state, clients[0].state));
    actions += 1; return client.state;
  };
  const action = (type, index, payload = {}) => ({ type, playerId: `p${index}`, ...payload });
  try {
    for (let index = 0; index < count; index += 1) {
      const client = await connect();
      await send(client, { type: "JOIN", player: { id: `p${index}`, name: `Player ${index + 1}`, color: ["#ff776e", "#6aaaf2", "#f2c46c", "#9ed18c", "#c69aea", "#6ed6ce"][index], tokenId: catalog.featured.tokens[index], diceId: catalog.featured.dice[index % 4] } }, (s) => s.players.length === index + 1);
    }
    assert.equal(clients[0].state.boardSize, size);
    await send(clients[0], action("START", 0, { firstPlayerId: "p0" }), (s) => s.phase === "awaitingRoll");
    // Cosmetic updates do not increment the event ID; compare the actual shared field.
    await send(clients[1], action("SET_APPEARANCE", 1, { tokenId: catalog.featured.tokens[7] }), (s) => s.players[1].tokenId === catalog.featured.tokens[7]);
    const position = size === 40 ? 3 : 10;
    await send(clients[0], action("ROLL", 0, { dice: size === 40 ? [1, 2] : [4, 6] }), (s) => s.phase === "awaitingMove");
    await send(clients[0], action("MOVE_RESULT", 0, { cardDraws: [] }), (s) => s.phase === "awaitingBuy");
    assert.equal(clients[0].state.players[0].position, position);
    await send(clients[0], action("BUY", 0, { propertyId: position }), (s) => s.properties[position].ownerId === "p0");
    await send(clients[0], action("END_TURN", 0), (s) => s.activePlayerId === "p1");
    await send(clients[1], action("ROLL", 1, { dice: [5, 6] }), (s) => s.phase === "awaitingMove");
    await send(clients[1], action("MOVE_RESULT", 1, { cardDraws: [] }), (s) => s.phase === "awaitingBuy");
    await send(clients[1], action("DECLINE_BUY", 1), (s) => s.phase === "awaitingAuction");
    await send(clients[0], action("AUCTION_BID", 0, { amount: 50 }), (s) => s.auction?.currentBid === 50);
    for (let index = 1; index < count; index += 1) {
      await send(clients[index], action("AUCTION_BID", index, { pass: true }), (s) => index === count - 1 ? s.phase === "awaitingEndTurn" : s.auction?.passedPlayerIds.includes(`p${index}`));
    }
    assert.equal(clients[0].state.properties[11].ownerId, "p0");
    clients[1].socket.close();
    const reloaded = await connect();
    await send(reloaded, { type: "JOIN", player: { id: "p1", name: "Reload", color: "black" } }, (s) => s.players.length === count);
    assert.equal(reloaded.state.players[1].name, "Player 2");
    assert.equal(reloaded.state.boardSize, size);
    console.log(`PASS: ${count} players / ${size} tiles; all ${count} clients identical after each action, cosmetics, new deeds, auction, reload and locked map.`);
  } finally { clients.forEach((client) => client.socket.close()); }
}
console.log(`PASS: ${actions} expanded-room WebSocket actions.`);
