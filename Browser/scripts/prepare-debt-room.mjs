import assert from "node:assert/strict";

// Use legal game actions instead of adding a debug cash/state endpoint to the server.
const [mode = "inspect", room, endpoint = "ws://127.0.0.1:8790"] = process.argv.slice(2);
assert.match(room ?? "", /^[A-Z]{4}$/);
const socket = new WebSocket(`${endpoint}/parties/main/${room}`);
let state;
const waiters = new Set();
socket.addEventListener("message", event => {
  const message = JSON.parse(String(event.data));
  if (message.type !== "state") return;
  state = message.state;
  for (const check of waiters) check();
});
const waitFor = predicate => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { waiters.delete(check); reject(new Error(`Timed out: ${state?.phase}, ${state?.notice ?? ""}`)); }, 8000);
  const check = () => { if (state && predicate(state)) { clearTimeout(timer); waiters.delete(check); resolve(state); } };
  waiters.add(check); check();
});

try {
  await waitFor(() => true);
  assert.ok(state.players.length && state.players.every(p => p.name.startsWith("QA ")), "Only disposable QA rooms can be used.");
  const host = state.players[0].id, friend = "qa-debt-friend";
  const cash = id => state.players.find(p => p.id === id).cash;
  const send = async action => {
    const previous = state.nextEventId;
    socket.send(JSON.stringify({ type: "action", action }));
    await waitFor(next => next.nextEventId > previous);
    assert.equal(state.notice, undefined);
  };
  const act = (type, playerId = host, extra = {}) => send({ type, playerId, ...extra });
  const move = async (playerId, dice, cardDraws = []) => {
    await act("ROLL", playerId, { dice });
    assert.equal(state.phase, "awaitingMove");
    await act("MOVE_RESULT", playerId, { cardDraws });
  };
  if (mode === "prepare") {
    assert.equal(state.phase, "lobby"); assert.equal(state.players.length, 1);
    await send({ type: "JOIN", player: { id: friend, name: "QA Friend", color: "#317bb2" } });
    await act("START", host, { firstPlayerId: host });
    await move(host, [1, 2]);
    await act("BUY", host, { propertyId: 3 });
    await act("TRADE_OFFER", host, { offerId: "qa-gift", toPlayerId: friend, offeredCash: 1400, requestedCash: 0, offeredPropertyIds: [], requestedPropertyIds: [] });
    await act("TRADE_ACCEPT", friend, { offerId: "qa-gift" });
    await act("END_TURN");
    await move(friend, [1, 2]);
    await act("END_TURN", friend);
    await move(host, [6, 6]);
    await act("DECLINE_BUY");
    for (const id of [host, friend]) await act("AUCTION_BID", id, { pass: true });
    await act("END_TURN");
    assert.equal(state.phase, "awaitingRoll"); assert.equal(cash(host), 44);
    assert.equal(state.players[0].position, 15);
    console.log("READY: reload the QA browser to discard setup animations, then run draw.");
  } else if (mode === "draw") {
    assert.equal(state.phase, "awaitingRoll"); assert.equal(state.players[0].position, 15);
    await move(host, [1, 1], [{ deck: "community", index: 2 }]);
    assert.equal(state.phase, "awaitingDebt"); assert.equal(cash(host), -6);
    assert.equal(state.card.text, "Clinic and medicines. Pay ₹50.");
    console.log("READY: Community Chest must stay readable until Continue. Then mortgage Mattancherry Palace to clear the ₹6 shortfall, or declare bankruptcy.");
  } else if (mode === "assert-settled") {
    assert.equal(state.phase, "awaitingEndTurn"); assert.equal(cash(host), 24);
    assert.equal(state.properties[3].mortgaged, true); assert.equal(state.debts, undefined);
    console.log("PASS: the UI mortgage cleared the debt, leaving ₹24 and allowing the interrupted turn to resume.");
  } else if (mode === "assert-bankrupt") {
    assert.equal(state.phase, "gameOver"); assert.equal(state.winnerId, friend);
    assert.equal(state.players[0].bankrupt, true); assert.equal(state.properties[3].ownerId, undefined);
    console.log("PASS: the UI bankruptcy eliminated the debtor, returned the deed and declared the final survivor.");
  } else assert.equal(mode, "inspect");
  console.log(JSON.stringify({ room: state.roomCode, phase: state.phase, players: state.players.map(p => ({ name: p.name, cash: p.cash, position: p.position, bankrupt: p.bankrupt })), debts: state.debts }, null, 2));
} finally {
  socket.close();
}
