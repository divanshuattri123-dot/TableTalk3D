import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {WORLDS} from '../src/engine/worlds.ts';
const host=process.env.ROOM_SERVER_URL??'wss://table-talk-realtime.divanshuattri123.workers.dev',room=`qa-worlds-${randomUUID()}`,clients=[];
async function connect(){
 const socket=new WebSocket(`${host}/parties/main/${room}`),client={socket,waiters:new Set()};
 socket.addEventListener('message',event=>{if(event.data==='pong')return;const m=JSON.parse(String(event.data));if(m.type==='state'){client.state=m.state;client.ack=m.ackId;for(const check of client.waiters)check();}});
 client.wait=test=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{client.waiters.delete(check);reject(new Error('Room response timeout'));},20000);const check=()=>{if(client.state&&test()){clearTimeout(timer);client.waiters.delete(check);resolve(client.state);}};client.waiters.add(check);check();});
 clients.push(client);await client.wait(()=>true);return client;
}
async function send(action){const id=randomUUID();clients[0].socket.send(JSON.stringify({type:'action',id,action}));for(const c of clients)await c.wait(()=>c.ack===id);for(const c of clients)assert.deepEqual(c.state,clients[0].state);return clients[0].state;}
try{
 const a=await connect();assert.equal(a.state.players.length,0);await send({type:'JOIN',player:{id:'host',name:'QA Map Host',color:'red'}});
 await connect();await send({type:'JOIN',player:{id:'peer',name:'QA Map Peer',color:'blue'}});
 for(const world of WORLDS){const s=await send({type:'SET_WORLD',playerId:'host',world:world.id});assert.equal(s.world,world.id);assert.equal(s.notice,undefined);}
 await send({type:'SET_CITY',playerId:'host',city:'tokyo'});
 await send({type:'START',playerId:'host',firstPlayerId:'host'});await send({type:'ROLL',playerId:'host',dice:[1,2]});await send({type:'MOVE_RESULT',playerId:'host'});
 const bought=await send({type:'BUY',playerId:'host',propertyId:3});assert.equal(bought.world,'theme010');assert.equal(bought.city,'tokyo');assert.equal(bought.players[0].cash,1440);
 const returned=await connect();assert.deepEqual(returned.state,bought);
 const locked=await send({type:'SET_WORLD',playerId:'host',world:'theme000'});assert.equal(locked.world,'theme010');assert.equal(locked.properties[3].ownerId,'host');
 console.log(`PASS ${room}: all 11 worlds sync to two clients; Tokyo, purchase and returning viewer preserve the selected map; map locked after start.`);
}finally{for(const c of clients)c.socket.close();}
