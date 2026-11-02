import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const endpoint=process.env.ROOM_SERVER_URL??'ws://127.0.0.1:8791';
const room=process.env.QA_ROOM??`qa-2025-${randomUUID()}`, clients=[];
let serial=0;
async function connect() {
  const socket=new WebSocket(`${endpoint}/parties/main/${room}`), c={socket,waiters:new Set()};
  socket.addEventListener('message',event=>{if(event.data==='pong')return;const m=JSON.parse(String(event.data));if(m.type==='state'){c.state=m.state;c.ack=m.ackId;for(const check of c.waiters)check();}});
  c.wait=test=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{c.waiters.delete(check);reject(new Error(`Timeout: ${c.state?.phase}`));},25000);const check=()=>{if(c.state&&test(c)){clearTimeout(timer);c.waiters.delete(check);resolve(c.state);}};c.waiters.add(check);check();});
  clients.push(c);await c.wait(()=>true);return c;
}
async function send(action) {
  const id=`2025-${randomUUID()}`;clients[0].socket.send(JSON.stringify({type:'action',action,id}));
  const s=await clients[0].wait(c=>c.ack===id);assert(!s.notice,s.notice);
  for(const c of clients.slice(1)){await c.wait(c=>c.ack===id);assert.deepEqual(c.state,s);}serial++;return s;
}
const act=(type,playerId,payload={})=>send({type,playerId,...payload});
const roll=async id=>{await act('ROLL',id,{dice:[1,2]});return act('MOVE_RESULT',id);};
try {
  await connect();await connect();let s=clients[0].state;
  assert(s.phase==='lobby'&&s.players.length<=1&&s.players.every(p=>p.name.startsWith('QA ')),'Use a fresh disposable QA room.');
  const a=s.players[0]?.id??'qa-a', b='qa-b', c='qa-c';
  if(!s.players.length)await send({type:'JOIN',player:{id:a,name:'QA 2025 Host',color:'#ed6266'}});
  for(const [id,color]of[[b,'#4e9fef'],[c,'#37b995']])await send({type:'JOIN',player:{id,name:`QA ${id}`,color}});
  await act('SET_MODE',a,{mode:'classic',rulesEdition:'hasbro-2025'});
  if(process.env.QA_CITY){await act('SET_CITY',a,{city:process.env.QA_CITY});assert.equal(clients[0].state.city,process.env.QA_CITY);}
  const order=Array.from({length:16},(_,i)=>i);
  await act('START',a,{firstPlayerId:a,setupRolls:[[{playerId:a,dice:[6,6]},{playerId:b,dice:[1,2]},{playerId:c,dice:[2,3]}]],deckOrder:{chance:order,community:order}});
  await roll(a);await act('BUY',a,{propertyId:3});await act('END_TURN',a);
  s=await roll(b);assert.equal(s.players.find(p=>p.id===b).cash,1500);assert.equal(s.rentClaim.ownerId,a);
  if(process.env.QA_2025_PAUSE==='rent')console.log(`PREPARED ${room}: claim rent as ${a}; ${serial} actions synchronized.`);
  else {
    s=await act('CLAIM_RENT',a,{claimId:s.rentClaim.id});assert.equal(s.players.find(p=>p.id===b).cash,1496);
    await act('END_TURN',b);s=await roll(c);assert(s.rentClaim);await act('END_TURN',c);
    s=await act('ROLL',a,{dice:[1,2]});assert.equal(s.rentClaim,undefined);await act('MOVE_RESULT',a);
    s=await act('TRADE_OFFER',a,{offerId:'one',toPlayerId:b,offeredCash:0,requestedCash:100,offeredPropertyIds:[3],requestedPropertyIds:[]});
    const positions=s.players.map(p=>p.position), dice=s.lastRoll;
    s=await act('TRADE_COUNTER',b,{previousOfferId:'one',offerId:'two',offeredCash:80,requestedCash:0,offeredPropertyIds:[],requestedPropertyIds:[3]});
    assert.deepEqual(s.lastRoll,dice);assert.deepEqual(s.players.map(p=>p.position),positions);
    s=await act('TRADE_ACCEPT',a,{offerId:'two'});assert.equal(s.properties[3].ownerId,b);assert.equal(s.phase,'awaitingBuy');
    const saved=structuredClone(s);for(const c of clients)c.socket.close();clients.length=0;
    await connect();await connect();for(const c of clients)assert.deepEqual(c.state,saved);
    console.log(`PASS G0009: ${serial} synchronized actions; manual/expired rent, counter-offer without a roll, accepted ownership and exact reconnect.`);
  }
}finally{for(const c of clients)c.socket.close();}
