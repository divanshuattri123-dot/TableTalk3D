import { expect, it } from "vitest";
import { createInitialState, reduceGame } from "../engine/reducer";
import { presentationBusy, PresentationTimeline } from "./timeline";
const start = () => {
  let s = createInitialState("TIME");
  s = reduceGame(s, { type: "JOIN", player: { id: "a", name: "A", color: "red" } });
  s = reduceGame(s, { type: "JOIN", player: { id: "b", name: "B", color: "blue" } });
  return reduceGame(s, { type: "START", playerId: "a", firstPlayerId: "a" });
};
it("blocks the incoming roll during the render before its presentation effect is scheduled", () => {
  const t = new PresentationTimeline(), s = start(); t.receive(s);
  const rolled = reduceGame(s, { type: "ROLL", playerId: "a", dice: [1, 2] });
  expect(presentationBusy(s, t.snapshot())).toBe(false);
  expect(presentationBusy(rolled, t.snapshot())).toBe(true);
  t.receive(rolled); expect(presentationBusy(rolled, t.snapshot())).toBe(true);
  t.complete(t.snapshot().frame!.id, "animation"); expect(presentationBusy(rolled, t.snapshot())).toBe(false);
});
it("plays a live roll in order and ignores stale completions", () => {
  const t = new PresentationTimeline(), s = start(); t.receive(s);
  const rolled = reduceGame(s, { type: "ROLL", playerId: "a", dice: [1, 2] }); t.receive(rolled);
  expect(t.snapshot().frame?.kind).toBe("dice");
  const id = t.snapshot().frame!.id;
  t.complete("stale", "animation"); expect(t.snapshot().frame?.id).toBe(id);
  t.complete(id, "animation"); expect(t.snapshot()).toMatchObject({ shown: rolled, busy: false });
});
it("does not queue an hour of hidden-tab animation or replay it on return", () => {
  const t = new PresentationTimeline(), s = start(); t.receive(s); t.setVisible(false);
  for (let i = 1; i <= 1000; i++) t.receive({ ...s, nextEventId: s.nextEventId + i });
  t.setVisible(true);
  expect(t.snapshot()).toMatchObject({ shown: { nextEventId: s.nextEventId + 1000 }, busy: false });
  expect(t.snapshot().frame).toBeUndefined();
});
it("resumes the canonical position if hidden mid-move and rejects the old callback", () => {
  const t = new PresentationTimeline(), s = start(); t.receive(s);
  const rolled = reduceGame(s, { type: "ROLL", playerId: "a", dice: [1, 2] }); t.receive(rolled);
  const id = t.snapshot().frame!.id, version = t.snapshot().syncVersion;
  t.setVisible(false);
  const landed = reduceGame(rolled, { type: "MOVE_RESULT", playerId: "a" }); t.receive(landed); t.setVisible(true);
  t.complete(id, "animation"); expect(t.snapshot()).toMatchObject({ shown: landed, busy: false });
  expect(t.snapshot().syncVersion).toBeGreaterThan(version);
});
it("keeps a visible card readable until Continue, never an animation timeout", () => {
  const t = new PresentationTimeline(), s = start(); t.receive(s);
  const rolled = reduceGame(s, { type: "ROLL", playerId: "a", dice: [1, 1] }); t.receive(rolled);
  t.complete(t.snapshot().frame!.id, "animation");
  t.receive(reduceGame(rolled, { type: "MOVE_RESULT", playerId: "a", cardDraws: [{ deck: "community", index: 1 }] }));
  t.complete(t.snapshot().frame!.id, "animation"); expect(t.snapshot().frame?.kind).toBe("card");
  const card = t.snapshot().frame!;
  t.complete(card.id, "animation"); expect(t.snapshot().frame).toBe(card);
  t.complete(card.id, "reader"); expect(t.snapshot().frame?.kind).toBe("money");
});
it("discards stale snapshots and resets for a different room", () => {
  const t = new PresentationTimeline(), s = start(); t.receive(s);
  t.receive({ ...s, nextEventId: 1 }); expect(t.snapshot().shown).toBe(s);
  const next = { ...s, roomCode: "NEXT" }; t.receive(next);
  expect(t.snapshot()).toMatchObject({ shown: next, busy: false });
});
it("keeps the unread card when a phone sleeps during the landing animation", () => {
  const t = new PresentationTimeline(), s = start(); t.receive(s);
  const rolled = reduceGame(s, { type: "ROLL", playerId: "a", dice: [1, 1] }); t.receive(rolled);
  const landed = reduceGame(rolled, { type: "MOVE_RESULT", playerId: "a", cardDraws: [{ deck: "community", index: 1 }] }); t.receive(landed);
  t.setVisible(false); t.receive(structuredClone(landed)); t.setVisible(true);
  expect(t.snapshot().frame).toMatchObject({ kind: "card", text: "Bank error in your favour. Collect ₹200." });
  t.complete(t.snapshot().frame!.id, "reader"); expect(t.snapshot()).toMatchObject({ shown: landed, busy: false });
});
it("retains one readable card, not a long replay, when cards arrive while the viewer is away", () => {
  const t = new PresentationTimeline(), s = start(); t.receive(s); t.setVisible(false);
  const rolled = reduceGame(s, { type: "ROLL", playerId: "a", dice: [1, 1] }); t.receive(rolled);
  const landed = reduceGame(rolled, { type: "MOVE_RESULT", playerId: "a", cardDraws: [{ deck: "community", index: 2 }] }); t.receive(landed);
  for (let i = 1; i <= 1000; i++) t.receive({ ...landed, nextEventId: landed.nextEventId + i });
  t.setVisible(true); expect(t.snapshot().frame).toMatchObject({ kind: "card", text: "Clinic and medicines. Pay ₹50." });
  t.complete(t.snapshot().frame!.id, "reader"); expect(t.snapshot().busy).toBe(false);
});
it("restores the current card on reload without reapplying money or replaying dice", () => {
  const rolled = reduceGame(start(), { type: "ROLL", playerId: "a", dice: [1, 1] });
  const landed = reduceGame(rolled, { type: "MOVE_RESULT", playerId: "a", cardDraws: [{ deck: "community", index: 1 }] });
  const t = new PresentationTimeline(); t.receive(landed);
  expect(t.snapshot().frame).toMatchObject({ kind: "card", text: landed.card!.text });
  t.complete(t.snapshot().frame!.id, "reader");
  expect(t.snapshot()).toMatchObject({ shown: landed, busy: false });
  expect(t.snapshot().shown!.players[0]!.cash).toBe(1700);
});
it("does not present a previous player's completed card when rejoining their friend's turn", () => {
  const rolled = reduceGame(start(), { type: "ROLL", playerId: "a", dice: [1, 1] });
  const landed = reduceGame(rolled, { type: "MOVE_RESULT", playerId: "a", cardDraws: [{ deck: "community", index: 1 }] });
  const t = new PresentationTimeline(); t.receive({ ...landed, activePlayerId: "b", phase: "awaitingRoll" });
  expect(t.snapshot().frame).toBeUndefined();
});
