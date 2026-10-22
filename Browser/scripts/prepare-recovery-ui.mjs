import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const code = process.argv[2], mode = process.argv[3] ?? "inspect";
if (!/^[A-Z]{4}$/.test(code ?? "")) throw new Error("Pass the disposable QA room code.");
const socket = new WebSocket(`wss://table-talk-realtime.divanshuattri123.workers.dev/parties/main/${code}`);
let state, ack; const waiters = new Set();
const wait = predicate => new Promise((resolve,reject) => {
  const timer=setTimeout(()=>{waiters.delete(check);reject(new Error(`Timed out in ${state?.phase}`));},10000);
  const check=()=>{if(state&&predicate()){clearTimeout(timer);waiters.delete(check);resolve(state);}};
  waiters.add(check);check();
});
socket.addEventListener("message",event=>{const message=JSON.parse(String(event.data));if(message.type==="state"){state=message.state;ack=message.ackId;for(const check of waiters)check();}});
const send = async action => { const id=randomUUID();socket.send(JSON.stringify({type:"action",action,id}));await wait(()=>ack===id); };
try {
  await wait(()=>true); assert(state.players.every(p=>p.name.startsWith("QA ")),"Only disposable QA rooms may be prepared.");
  if(mode==="friend-turn") {
    const host=state.players.find(p=>p.name==="QA Recovery Host"), friend=state.players.find(p=>p.name!==host?.name);
    assert.equal(state.activePlayerId,friend.id);assert.equal(state.phase,"awaitingRoll");
    await send({type:"ROLL",playerId:friend.id,dice:[1,2]});await send({type:"MOVE_RESULT",playerId:friend.id});
    if(state.pendingPurchase)await send({type:"BUY",playerId:friend.id,propertyId:state.pendingPurchase.propertyId});
    assert.equal(state.phase,"awaitingEndTurn");await send({type:"END_TURN",playerId:friend.id});assert.equal(state.activePlayerId,host.id);
  }
  if(mode==="accept-trade") {
    assert.equal(state.phase,"awaitingTradeResponse");
    await send({type:"TRADE_ACCEPT",playerId:state.pendingTrade.toPlayerId,offerId:state.pendingTrade.id});
  }
  console.log(JSON.stringify({room:code,phase:state.phase,active:state.activePlayerId,players:state.players.map(p=>({id:p.id,name:p.name,cash:p.cash,position:p.position})),properties:state.properties,lastRoll:state.lastRoll,nextEventId:state.nextEventId}));
}finally{socket.close();}
