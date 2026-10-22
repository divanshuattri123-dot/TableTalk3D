import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = 8792, room = `qa-recovery-${randomUUID()}`;
const storage = await mkdtemp(join(tmpdir(), "table-talk-recovery-"));
let worker, output = "", clients = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function start() {
  output = "";
  worker = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", "wrangler.test.jsonc", "--local", "--port", String(port), "--persist-to", storage], { windowsHide: true });
  worker.stdout.on("data", data => { output += data; }); worker.stderr.on("data", data => { output += data; });
  for (let attempt = 0; attempt < 90; attempt++) {
    if (worker.exitCode !== null) throw new Error(`Test Worker stopped early: ${output}`);
    // The explorer advertises this URL before workerd listens; only the ready line proves startup.
    if (new RegExp(`Ready on http://(?:localhost|127\\.0\\.0\\.1):${port}\\b`).test(output)) return;
    await sleep(500);
  }
  throw new Error(`Test Worker did not start: ${output}`);
}
async function stop() {
  for (const c of clients) c.socket.close(); clients = [];
  await sleep(150);
  if (!worker || worker.exitCode !== null) return;
  const child = worker;
  if (process.platform === "win32") {
    await new Promise(resolve => { const kill = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); kill.on("exit", resolve); });
  } else child.kill("SIGTERM");
  await sleep(800);
}
async function connect() {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/parties/main/${room}`);
  const c = { socket, state: undefined, ack: undefined, waiters: new Set() };
  socket.addEventListener("message", event => {
    if (event.data === "pong") return;
    const message = JSON.parse(String(event.data));
    if (message.type === "error") throw new Error(message.message);
    if (message.type === "state") { c.state = message.state; c.ack = message.ackId; for (const check of c.waiters) check(); }
  });
  c.wait = predicate => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { c.waiters.delete(check); reject(new Error(`State timeout: ${c.state?.phase}; socket ${socket.readyState}; Worker: ${output.slice(-8000)}`)); }, 25_000);
    const check = () => { if (c.state && predicate(c)) { clearTimeout(timer); c.waiters.delete(check); resolve(c.state); } };
    c.waiters.add(check); check();
  });
  clients.push(c); await c.wait(() => true); return c;
}
let n = 0;
const send = async (c, action, id = `action-${++n}`) => {
  c.ack = undefined; c.socket.send(JSON.stringify({ type: "action", action, id }));
  return c.wait(other => other.ack === id);
};
const act = (type, playerId = "p1", payload = {}) => ({ type, playerId, ...payload });
async function restart(expected, label) {
  await stop(); await start(); const a = await connect(), b = await connect();
  assert.deepEqual(a.state, expected); assert.deepEqual(b.state, expected);
  console.log(`PASS ${label}: exact snapshot restored (${createHash("sha256").update(JSON.stringify(expected)).digest("hex").slice(0, 12)})`);
  return [a, b];
}
try {
  console.log(`QA room ${room}`); await start(); let a = await connect(), b = await connect();
  for (const [id, name, color] of [["p1", "QA Asha", "red"], ["p2", "QA Bryn", "blue"]]) await send(a, { type: "JOIN", player: { id, name, color } });
  await send(a, act("START", "p1", { firstPlayerId: "p1" }));
  await send(a, act("ROLL", "p1", { dice: [1, 2] })); await send(a, act("MOVE_RESULT"));
  const bought = await send(a, act("BUY", "p1", { propertyId: 3 }), "lost-purchase-ack");
  [a, b] = await restart(bought, "purchase + cash + ownership + turn");
  assert.deepEqual(await send(a, act("BUY", "p1", { propertyId: 3 }), "lost-purchase-ack"), bought);
  await send(a, act("END_TURN"));
  const rolling = await send(b, act("ROLL", "p2", { dice: [1, 2] }));
  [a, b] = await restart(rolling, "mid-roll pending move");
  const landed = await send(b, act("MOVE_RESULT", "p2"), "lost-rent-ack");
  assert.equal(landed.players[1].cash, 1496); assert.equal(landed.players[0].cash, 1444);
  [a, b] = await restart(landed, "rent payment and action receipt");
  assert.deepEqual(await send(b, act("MOVE_RESULT", "p2"), "lost-rent-ack"), landed);
  await send(b, act("END_TURN", "p2"));
  await send(a, act("ROLL", "p1", { dice: [1, 1] })); await send(a, act("MOVE_RESULT")); await send(a, act("DECLINE_BUY"));
  const auction = await send(b, act("AUCTION_BID", "p2", { amount: 50 }));
  assert.equal(auction.phase, "awaitingAuction");
  [a, b] = await restart(auction, "active auction and highest bid");
  const sold = await send(a, act("AUCTION_BID", "p1", { pass: true }));
  assert.equal(sold.properties[5].ownerId, "p2"); assert.equal(sold.players[1].cash, 1446);
  await sleep(15_000); a.socket.send(JSON.stringify({ type: "sync" }));
  await a.wait(c => c.state.properties[5].ownerId === "p2");
  assert.equal(a.socket.readyState, WebSocket.OPEN); assert.deepEqual(a.state, sold);
  console.log("PASS idle hibernation: sockets stay connected and auction settlement survives.");
  console.log("PASS recovery: four real Worker process restarts, two clients, purchase, mid-roll, rent, auction, duplicate receipt retries and continued play.");
} finally { await stop(); console.log(`Disposable QA state retained at ${storage}`); }
