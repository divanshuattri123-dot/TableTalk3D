import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
const endpoint=process.env.ROOM_SERVER_URL??"ws://127.0.0.1:8791",room=process.env.QA_ROOM??`qa-classic-${randomUUID()}`;
const clients=[];let n=0;
async function connect(){
  const socket=new WebSocket(`${endpoint}/parties/main/${room}`),c={socket,state:undefined,ack:undefined,waiters:new Set()};
  socket.addEventListener("message",event=>{if(event.data==="pong")return;const m=JSON.parse(String(event.data));if(m.type==="state"){c.state=m.state;c.ack=m.ackId;for(const f of c.waiters)f();}});
  c.wait=test=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{c.waiters.delete(check);reject(new Error(`Classic QA timeout in ${c.state?.phase}`));},25000);const check=()=>{if(c.state&&test(c)){clearTimeout(timer);c.waiters.delete(check);resolve(c.state);}};c.waiters.add(check);check();});
  clients.push(c);await c.wait(()=>true);return c;
}
async function send(action,id=`classic-${++n}`){
  clients[0].ack=undefined;clients[0].socket.send(JSON.stringify({type:"action",action,id}));const next=await clients[0].wait(c=>c.ack===id);
  assert(!next.notice,`${JSON.stringify(action)}: ${next.notice}`);
  for(const c of clients.slice(1)){await c.wait(c=>c.state.nextEventId===next.nextEventId);assert.deepEqual(c.state,next);}return next;
}
const act=(type,playerId,rest={})=>send({type,playerId,...rest});
async function roll(id,dice){await act("ROLL",id,{dice});return act("MOVE_RESULT",id);}
try{
  await connect();await connect();await connect();
  let s=clients[0].state;assert(s.phase==="lobby" && s.players.length<=1 && s.players.every(p=>p.name.startsWith("QA ")),"Only a fresh disposable QA table may be prepared.");
  const a=s.players[0]?.id??"p1",b="qa-b",c="qa-c";
  if(!s.players.length)await send({type:"JOIN",player:{id:a,name:"QA Classic Host",color:"red"}});
  for(const [id,name,color] of [[b,"QA Classic B","blue"],[c,"QA Classic C","green"]])await send({type:"JOIN",player:{id,name,color}});
  await act("SET_MODE",a,{mode:"classic"});
  const order=(first,second)=>[first,second,...Array.from({length:16},(_,i)=>i).filter(i=>i!==first&&i!==second)];
  await act("START",a,{firstPlayerId:a,setupRolls:[[{playerId:a,dice:[6,6]},{playerId:b,dice:[1,2]},{playerId:c,dice:[2,3]}]],deckOrder:{chance:order(6,8),community:order(4,0)}});
  s=await roll(a,[6,6]);assert.equal(s.pendingPurchase.propertyId,12);await act("BUY",a,{propertyId:12});await act("END_TURN",a);
  await roll(a,[1,2]);await act("BUY",a,{propertyId:15});await act("END_TURN",a);
  s=await roll(b,[6,6]);assert.equal(s.phase,"awaitingUtilityRoll");s=await act("ROLL",b,{dice:[3,4]});assert.equal(s.players.find(p=>p.id===b).cash,1472);assert.deepEqual(s.lastRoll.dice,[6,6]);
  await act("END_TURN",b);assert.equal(clients[0].state.activePlayerId,b);await roll(b,[1,2]);await act("END_TURN",b);
  s=await roll(c,[3,4]);assert.equal(s.pendingUtility.multiplier,10);assert.equal(s.card.index,6);await act("ROLL",c,{dice:[2,3]});await act("END_TURN",c);
  await roll(a,[2,3]);await act("END_TURN",a);await roll(b,[2,3]);await act("END_TURN",b);await roll(c,[1,2]);await act("END_TURN",c);
  await roll(a,[3,4]);await act("BUY",a,{propertyId:27});await act("MORTGAGE",a,{propertyId:27,mortgage:true});await act("END_TURN",a);
  await roll(b,[3,4]);await act("END_TURN",b);s=await roll(c,[3,4]);assert.deepEqual(s.players.find(p=>p.id===c).jailCardDecks,["chance"]);await act("END_TURN",c);
  await roll(a,[1,2]);await act("END_TURN",a);await roll(b,[1,2]);await act("END_TURN",b);s=await roll(c,[1,2]);assert.equal(s.pendingPurchase.propertyId,25);
  await act("TRADE_OFFER",a,{offerId:"mortgaged-deed-for-release",toPlayerId:c,offeredCash:0,requestedCash:0,offeredPropertyIds:[27],requestedPropertyIds:[],requestedJailCards:["chance"]});
  s=await act("TRADE_ACCEPT",c,{offerId:"mortgaged-deed-for-release"});assert.equal(s.phase,"awaitingMortgageDecision");await act("RESOLVE_MORTGAGES",c,{redeemPropertyIds:[]});
  s=await act("TRADE_OFFER",c,{offerId:"qa-return-deed",toPlayerId:a,offeredCash:0,requestedCash:0,offeredPropertyIds:[27],requestedPropertyIds:[]});
  if(process.env.QA_CLASSIC_PAUSE==="trade") {console.log(`PREPARED ${room}: host can accept trade then choose mortgage redemption. ${n} synchronized actions; active purchase preserved.`);}
  else {
    await act("TRADE_ACCEPT",a,{offerId:"qa-return-deed"});s=await act("RESOLVE_MORTGAGES",a,{redeemPropertyIds:[27]});assert(!s.properties[27].mortgaged);assert.equal(s.phase,"awaitingBuy");assert.equal(s.activePlayerId,c);
    await act("DECLINE_BUY",c);await act("AUCTION_BID",a,{amount:10});
    await act("TRADE_OFFER",a,{offerId:"withdraw-during-auction",toPlayerId:b,offeredCash:0,requestedCash:40,offeredPropertyIds:[12],requestedPropertyIds:[]});s=await act("TRADE_DECLINE",a,{offerId:"withdraw-during-auction"});assert.equal(s.auction.currentBid,10);assert.equal(s.phase,"awaitingAuction");
    await act("AUCTION_BID",b,{pass:true});await act("AUCTION_BID",c,{pass:true});await act("END_TURN",c);
    s=await act("PAY",a,{kind:"jailCard",deck:"chance"});assert.equal(s.decks.chance.at(-1),8);assert(!s.players.find(p=>p.id===a).inJail);
    const saved=structuredClone(s);for(const peer of clients)peer.socket.close();clients.length=0;await connect();await connect();assert.deepEqual(clients[0].state,saved);assert.deepEqual(clients[1].state,saved);
    console.log(`PASS Classic multiplayer ${room}: ${n} synchronized actions; highest-roll setup, utility/Chance dice, doubles, mortgaged trades, held-card exchange/use, off-turn auction trade withdrawal, redemption and exact reconnect snapshot ${createHash("sha256").update(JSON.stringify(saved)).digest("hex").slice(0,12)}.`);
  }
}finally{for(const c of clients)c.socket.close();}
