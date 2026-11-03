import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const server=process.env.ROOM_SERVER_URL??'ws://127.0.0.1:8803',room=`qa-bots-${randomUUID()}`;
const clients=[],sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));let receipt=0;
async function connect(){
  const socket=new WebSocket(`${server}/parties/main/${room}`),c={socket,waiters:new Set()};
  socket.addEventListener('message',event=>{
    if(event.data==='pong')return;const m=JSON.parse(String(event.data));
    if(m.type==='error')throw new Error(m.message);
    if(m.type==='state'){c.state=m.state;c.ack=m.ackId;for(const fn of c.waiters)fn();}
  });
  c.wait=(predicate,timeout=20000)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{c.waiters.delete(check);reject(new Error(`Timed out in ${c.state?.phase}, ${c.state?.activePlayerId}`));},timeout);const check=()=>{if(c.state&&predicate(c)){clearTimeout(timer);c.waiters.delete(check);resolve(c.state);}};c.waiters.add(check);check();});
  clients.push(c);await c.wait(()=>true);return c;
}
async function send(c,action){const id=`qa-${++receipt}`;c.socket.send(JSON.stringify({type:'action',id,action}));const state=await c.wait(value=>value.ack===id);assert.equal(state.notice,undefined,JSON.stringify(action));return state;}
const act=(type,extra={})=>({type,playerId:'human',...extra});
async function waitForHuman(c){
  const deadline=Date.now()+90000;
  while(Date.now()<deadline){
    const s=c.state;if(s.phase==='awaitingRoll'&&s.activePlayerId==='human')return s;
    if(s.phase==='awaitingAuction'&&s.auction.eligiblePlayerIds.includes('human')&&!s.auction.passedPlayerIds.includes('human')&&s.auction.highestBidderId!=='human')await send(c,act('AUCTION_BID',{pass:true}));
    else if(s.pendingTrade?.toPlayerId==='human')await send(c,act('TRADE_DECLINE',{offerId:s.pendingTrade.id}));
    else await c.wait(value=>value.state.nextEventId>s.nextEventId,30000);
  }
  throw new Error('AI turn did not finish');
}
try{
  let a=await connect(),b=await connect();await send(a,{type:'JOIN',player:{id:'human',name:'QA Human',color:'#ed6266'}});
  for(let i=0;i<5;i++)await send(a,act('ADD_BOT'));
  assert.equal(a.state.players.length,6);assert.equal(a.state.boardSize,64);assert.equal(new Set(a.state.players.map(p=>p.color)).size,6);await b.wait(c=>c.state.nextEventId===a.state.nextEventId);assert.deepEqual(a.state,b.state);
  for(let i=5;i>=2;i--)await send(a,act('REMOVE_BOT',{botId:`ai-${i}`}));assert.equal(a.state.players.length,2);assert.equal(a.state.boardSize,40);
  const start=await send(a,act('START',{firstPlayerId:'ai-1'}));
  for(const c of clients)c.socket.close();await sleep(3500);
  a=await connect();assert.deepEqual(a.state,start);console.log('PASS empty room: no invisible AI moves; saved AI turn resumes on return');
  b=await connect();const human=await waitForHuman(a);assert.equal(human.lastRoll.playerId,'ai-1');assert.ok(human.players.find(p=>p.bot).position>0||human.players.find(p=>p.bot).inJail);
  await b.wait(c=>c.state.nextEventId===human.nextEventId);assert.deepEqual(b.state,human);console.log('PASS one human + AI: automatic roll, movement, purchase/auction and end turn sync to two viewers');
  await sleep(2200);assert.deepEqual(a.state,human);console.log('PASS AI waits for human action without changing the table');
}finally{for(const c of clients)c.socket.close();}
console.log(`PASS mixed-seat server QA ${room}`);
