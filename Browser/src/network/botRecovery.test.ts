import {it,expect,vi} from 'vitest';
import {SavedRoom} from '../../party/roomStore';
import {botThinkDelay,chooseBotAction} from '../../party/botRunner';

const store=()=>{const data=new Map<string,unknown>();return {get:async<T>(key:string)=>structuredClone(data.get(key)) as T|undefined,put:vi.fn(async(key:string,value:unknown)=>{data.set(key,structuredClone(value));})};};
async function setup(){const storage=store(),room=new SavedRoom(storage,'BOTS');await room.load();await room.apply({type:'JOIN',player:{id:'human',name:'Human',color:'red'}});await room.apply({type:'ADD_BOT',playerId:'human'});await room.apply({type:'START',playerId:'human',firstPlayerId:'human'});return {room,storage};}
it('chooses automatic actions inside the serial queue after the previous human commit',async()=>{
  const {room}=await setup();await room.apply({type:'ROLL',playerId:'human',dice:[1,2]});await room.apply({type:'MOVE_RESULT',playerId:'human'});await room.apply({type:'BUY',playerId:'human',propertyId:3});
  const end=room.apply({type:'END_TURN',playerId:'human'}),automatic=room.apply(chooseBotAction);await end;const state=await automatic;
  expect(state.lastRoll?.playerId).toBe('ai-1');expect(['awaitingMove','awaitingEndTurn']).toContain(state.phase);expect(state.notice).toBeUndefined();
});
it('restores an interrupted AI roll and applies movement once from the checkpoint',async()=>{
  const {room,storage}=await setup();await room.apply({type:'ROLL',playerId:'human',dice:[1,2]});await room.apply({type:'MOVE_RESULT',playerId:'human'});await room.apply({type:'BUY',playerId:'human',propertyId:3});await room.apply({type:'END_TURN',playerId:'human'});
  await room.apply({type:'ROLL',playerId:'ai-1',dice:[1,2]});const before=structuredClone(room.state),restored=new SavedRoom(storage,'BOTS');await restored.load();expect(restored.state).toEqual(before);
  const after=await restored.apply(chooseBotAction);expect(after.players[1]!.position).toBe(3);expect(after.phase).toBe('awaitingEndTurn');
  const restarted=new SavedRoom(storage,'BOTS');await restarted.load();expect(restarted.state).toEqual(after);expect(restarted.state.players[1]!.bot).toBe(true);
});
it('does not expose or advance an AI decision whose checkpoint failed',async()=>{
  const {room,storage}=await setup();await room.apply({type:'ROLL',playerId:'human',dice:[1,2]});await room.apply({type:'MOVE_RESULT',playerId:'human'});await room.apply({type:'BUY',playerId:'human',propertyId:3});await room.apply({type:'END_TURN',playerId:'human'});
  const before=structuredClone(room.state);storage.put.mockRejectedValueOnce(new Error('disk'));await expect(room.apply(chooseBotAction)).rejects.toThrow('disk');expect(room.state).toEqual(before);
  const next=await room.apply(chooseBotAction);expect(next.lastRoll?.playerId).toBe('ai-1');expect(next.notice).toBeUndefined();
});

it("keeps an automatic roll from expiring a human rent claim immediately", async () => {
  const { room } = await setup();
  const state = {
    ...room.state, activePlayerId: "ai-1",
    rentClaim: { id: 20, payerId: "ai-1", ownerId: "human", propertyId: 3, amount: 4 }
  };
  expect(botThinkDelay(undefined, state)).toBeGreaterThanOrEqual(6000);
  expect(botThinkDelay(undefined, { ...state, rentClaim: undefined })).toBe(900);
  expect(botThinkDelay(undefined, { ...state, rentClaim: { ...state.rentClaim, ownerId: "ai-1" } })).toBe(900);
});

it("ignores duplicate and stale movement receipts from a second tab", async () => {
  const { room } = await setup();
  await room.apply({ type: "ROLL", playerId: "human", dice: [1, 1] });
  const oldRollId = room.state.pendingRoll!.id!;
  const move = { type: "MOVE_RESULT", playerId: "human", rollId: oldRollId, cardDraws: [{ deck: "community", index: 0 }] } as const;
  const first = await room.apply({ ...move, cardDraws: [...move.cardDraws] }, "first-tab");
  const duplicate = await room.apply({ ...move, cardDraws: [...move.cardDraws] }, "second-tab");
  expect(duplicate).toEqual(first);
  await room.apply({ type: "END_TURN", playerId: "human" });
  await room.apply({ type: "ROLL", playerId: "human", dice: [1, 2] });
  const nextRoll = room.state;
  expect(nextRoll.pendingRoll?.id).not.toBe(oldRollId);
  expect(nextRoll.phase).toBe("awaitingMove");
  expect(await room.apply({ ...move, cardDraws: [...move.cardDraws] }, "late-second-tab")).toEqual(nextRoll);
});
