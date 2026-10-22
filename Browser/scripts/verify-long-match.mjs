import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import ts from "typescript";
import PartySocket from "partysocket";
const source=ts.transpileModule(await fs.readFile("src/network/roomConnection.ts","utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {RoomConnection}=await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const endpoint=process.env.ROOM_SERVER_URL??"wss://table-talk-realtime.divanshuattri123.workers.dev";
const room=process.env.QA_ROOM??`qa-long-${randomUUID()}`;let clients=[],actions=0,reconnections=0,turns=0,trades=0;
const duration=Number(process.env.QA_SOAK_MS??0), interval=Number(process.env.QA_INTERVAL_MS??0);
const began=Date.now();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function connect(){
  const url=new URL(endpoint), socket=new PartySocket({host:url.host,protocol:url.protocol==="wss:"?"wss":"ws",room,party:"main",maxRetries:Infinity,minReconnectionDelay:750,maxReconnectionDelay:8000,connectionTimeout:10000,maxEnqueuedMessages:0}),waiters=new Set();
  const c={socket,state:undefined,ack:undefined,sentId:undefined,status:"connecting"};
  c.wait=(test)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{waiters.delete(check);reject(new Error(`Timeout ${c.state?.phase}, ${c.status}, after ${actions} actions`));},65000);const check=()=>{if(c.state&&test(c)){clearTimeout(timer);waiters.delete(check);resolve(c.state);}};waiters.add(check);check();});
  const adapter={get readyState(){return socket.readyState;},send(data){const message=JSON.parse(data==="ping"?'{}':data);if(message.type==="action")c.sentId=message.id;socket.send(data);},reconnect(){socket.reconnect();}};
  c.link=new RoomConnection(adapter,{state(state){c.state=state;for(const check of waiters)check();},status(status){c.status=status;for(const check of waiters)check();},error(message){if(message)console.log(`Connection: ${message}`);}},undefined,`soak-${randomUUID()}`);
  socket.addEventListener("open",()=>c.link.open());socket.addEventListener("close",()=>c.link.disconnected());socket.addEventListener("error",()=>c.link.disconnected());
  socket.addEventListener("message",event=>{const raw=String(event.data);if(raw!=="pong"){const m=JSON.parse(raw);if(m.type==="state"&&m.ackId)c.ack=m.ackId;}c.link.receive(raw);});
  const heartbeat=setInterval(()=>c.link.tick(),5000);
  c.stop=()=>{clearInterval(heartbeat);socket.close(1000,"QA reconnect");};
  clients.push(c);await c.wait(()=>true);return c;
}
async function send(action){
  await clients[0].wait(peer=>peer.status==="connected"&&peer.socket.readyState===1);
  actions++;
  assert(clients[0].link.sendAction(action),"The actual game client must be ready before a decision.");
  const id=clients[0].sentId;
  if(process.env.QA_INJECT_RECONNECT==="1"&&actions===17){clients[0].socket.reconnect();console.log("Injected a reconnect immediately after sending action 17, before waiting for its acknowledgement.");}
  await clients[0].wait(peer=>peer.ack===id);
  const expected=clients[0].state;
  await clients[1].wait(peer=>peer.state.nextEventId===expected.nextEventId);
  assert.deepEqual(clients[0].state,clients[1].state);assert(!clients[0].state.notice,clients[0].state.notice);
  return clients[0].state;
}
const act=(type,playerId,payload={})=>({type,playerId,...payload});
async function reconnect(){const saved=structuredClone(clients[0].state);for(const c of clients)c.stop();clients=[];await connect();await connect();assert.deepEqual(clients[0].state,saved);assert.deepEqual(clients[1].state,saved);reconnections++;}
try{
  await connect();await connect();
  if(process.env.QA_ROOM){assert(clients[0].state.players.every(p=>p.name.startsWith("QA ")),"Only resume disposable QA rooms.");assert.deepEqual(clients[0].state,clients[1].state);console.log(`Resumed saved room: event ${clients[0].state.nextEventId}, ${Object.values(clients[0].state.properties).filter(p=>p.ownerId).length} owned deeds.`);}
  else{for(const [id,color]of[["p1","red"],["p2","blue"],["p3","green"]])await send({type:"JOIN",player:{id,name:`QA Long ${id}`,color}});await send(act("START","p1",{firstPlayerId:"p1"}));}
  let roll=0,lastReconnect=0;
  console.log(`Started disposable room ${room}; real-time target ${duration/60000} minutes.`);
  while(duration?Date.now()-began<duration:actions<600){
    if(interval)await pause(interval);
    const s=clients[0].state,id=s.activePlayerId,player=s.players.find(p=>p.id===id);
    if(s.phase==="gameOver"){
      if(!duration)break;
      await reconnect();await pause(10000);continue;
    }
    if(actions-lastReconnect>=100){await reconnect();lastReconnect=actions;console.log(`PASS ${actions} actions, ${turns} completed turns, ${reconnections} exact reconnects.`);}
    if(s.phase==="awaitingRoll"||s.phase==="awaitingEndTurn"){
      if(actions%31===0&&player.cash>10){const to=s.players.find(p=>p.id!==id&&!p.bankrupt);await send(act("TRADE_OFFER",id,{offerId:`trade-${actions}`,toPlayerId:to.id,offeredCash:10,offeredPropertyIds:[],requestedCash:0,requestedPropertyIds:[]}));trades++;continue;}
    }
    switch(s.phase){
      case "awaitingRoll":if(player.inJail){await send(act("PAY",id,{kind:player.getOutOfJailCards?"jailCard":"jailFine"}));}else{const dice=[[1,2],[2,3],[3,4],[5,6],[4,5],[2,2]][roll++%6];await send(act("ROLL",id,{dice}));}break;
      case "awaitingMove":{const pos=(player.position+s.pendingRoll.total)%40;const cardDraws=[7,22,36].includes(pos)?[{deck:"chance",index:4}]:[2,17,33].includes(pos)?[{deck:"community",index:1}]:[];await send(act("MOVE_RESULT",id,{cardDraws}));break;}
      case "awaitingBuy":await send(player.cash>=400?act("BUY",id,{propertyId:s.pendingPurchase.propertyId}):act("DECLINE_BUY",id));break;
      case "awaitingAuction":{const a=s.auction,p=a.eligiblePlayerIds.find(p=>p!==a.highestBidderId&&!a.passedPlayerIds.includes(p));assert(p);await send(act("AUCTION_BID",p,{pass:true}));break;}
      case "awaitingTradeResponse":await send(act("TRADE_ACCEPT",s.pendingTrade.toPlayerId,{offerId:s.pendingTrade.id}));break;
      case "awaitingJailPayment":await send(act("PAY",id,{kind:"jailFine"}));break;
      case "awaitingDebt":{const debt=s.debts[0].playerId,p=Object.entries(s.properties).find(([,p])=>p.ownerId===debt&&!p.mortgaged&&!p.houses);await send(p?act("MORTGAGE",debt,{propertyId:Number(p[0]),mortgage:true}):act("BANKRUPT",debt));break;}
      case "awaitingEndTurn":await send(act("END_TURN",id));turns++;break;
      default:throw new Error(`Unexpected phase ${s.phase}`);
    }
  }
  await reconnect();console.log(`PASS ${duration?"real-time soak":"accelerated long match"}: ${actions} acknowledged actions, ${turns} completed turns, ${trades} trades, ${reconnections} reconnects; elapsed ${((Date.now()-began)/60000).toFixed(2)} minutes; both clients identical after every action.`);
}finally{for(const c of clients)c.stop();}
