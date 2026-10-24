import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const [code, mode="inspect", count="6"] = process.argv.slice(2);
assert(/^[A-Z]{4}$/.test(code??""),"Give a disposable QA room code.");
const endpoint=process.env.ROOM_SERVER_URL??"wss://table-talk-realtime.divanshuattri123.workers.dev";
const socket=new WebSocket(`${endpoint}/parties/main/${code}`), waiters=new Set(); let state, ack;
const wait=test=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{waiters.delete(check);reject(new Error(`Timeout in ${state?.phase}`));},15000);const check=()=>{if(state&&test()){clearTimeout(timer);waiters.delete(check);resolve();}};waiters.add(check);check();});
socket.addEventListener("message",event=>{const m=JSON.parse(String(event.data));if(m.type==="state"){state=m.state;ack=m.ackId;for(const check of waiters)check();}});
const send=async action=>{const id=randomUUID();socket.send(JSON.stringify({type:"action",action,id}));await wait(()=>ack===id);assert(!state.notice,state.notice);};
try {
  await wait(()=>true); assert(state.players.length&&state.players.every(p=>p.name.startsWith("QA ")),"Never stage a real player room.");
  const host=state.players.find(p=>p.name.includes("Host"))??state.players[0];
  if(mode==="join" || mode==="seats") {
    assert.equal(state.phase,"lobby");
    const colors=["#ed6266","#4e9fef","#37b995","#efb447","#ac81e4","#ed79bc"];
    assert(Number(count)>=2&&Number(count)<=6);
    while(state.players.length<Number(count)) {
      const color=colors.find(color=>!state.players.some(player=>player.color===color));
      await send({type:"JOIN",player:{id:`qa-friend-${randomUUID()}`,name:`QA Friend ${state.players.length+1}`,color}});
    }
    if(mode==="join")await send({type:"START",playerId:host.id,firstPlayerId:host.id,...(state.mode==="classic"?{setupRolls:[state.players.map(p=>({playerId:p.id,dice:p.id===host.id?[6,6]:[1,2]}))],deckOrder:{chance:Array.from({length:16},(_,i)=>i),community:Array.from({length:16},(_,i)=>i)}}:{})});
  }
  if(mode==="auction") {
    assert.equal(state.phase,"awaitingRoll");const id=state.activePlayerId;assert.equal(state.players.find(p=>p.id===id).position,0);
    await send({type:"ROLL",playerId:id,dice:[1,2]});await send({type:"MOVE_RESULT",playerId:id});await send({type:"DECLINE_BUY",playerId:id});
  }
  if(mode==="finish-auction" || mode==="advance") {
    if(mode==="advance" && state.phase==="awaitingBuy")await send({type:"DECLINE_BUY",playerId:state.activePlayerId});
    assert(["awaitingAuction","awaitingEndTurn"].includes(state.phase));
    while(state.auction){const a=state.auction,id=a.eligiblePlayerIds.find(id=>id!==a.highestBidderId&&!a.passedPlayerIds.includes(id));await send({type:"AUCTION_BID",playerId:id,pass:true});}
    await send({type:"END_TURN",playerId:state.activePlayerId});
  }
  if(mode==="trade") {
    assert(["awaitingRoll","awaitingEndTurn"].includes(state.phase));
    const id=state.activePlayerId,to=id===host.id?state.players.find(p=>p.id!==id&&!p.bankrupt).id:host.id;
    await send({type:"TRADE_OFFER",playerId:id,offerId:`qa-${randomUUID()}`,toPlayerId:to,offeredCash:10,offeredPropertyIds:[],requestedCash:0,requestedPropertyIds:[]});
  }
  if(mode==="card") {
    assert.equal(state.phase,"awaitingRoll");const id=state.activePlayerId;assert.equal(state.players.find(p=>p.id===id).position,0);
    await send({type:"ROLL",playerId:id,dice:[1,1]});await send({type:"MOVE_RESULT",playerId:id,cardDraws:[{deck:"community",index:1}]});
  }
  if(mode==="roll-visible") {
    assert.equal(state.phase,"awaitingRoll");
    const began=Date.now(); await send({type:"ROLL",playerId:state.activePlayerId,dice:[1,2]});
    await wait(()=>state.phase!=="awaitingMove");
    const elapsed=Date.now()-began;
    assert(elapsed>=1000,`Landing committed before the visible dice animation: ${elapsed}ms.`);
    assert(elapsed<20000,"The active browser did not finish the turn animation.");
    console.log(`PASS visible dice-to-landing gate: ${elapsed}ms; no manual MOVE_RESULT from the test.`);
  }
  console.log(JSON.stringify({room:code,phase:state.phase,active:state.activePlayerId,card:state.card,auction:state.auction,players:state.players.map(p=>({id:p.id,name:p.name,cash:p.cash,position:p.position})),eventId:state.nextEventId}));
} finally { socket.close(); }
