import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {RoomConnection} from '../src/network/roomConnection.ts';

// An isolated real room exercises the shipped client against the deployed save protocol.
const host=process.env.QA_ROOM_HOST??'wss://table-talk-realtime.divanshuattri123.workers.dev';
const room=`qa-client-resume-${randomUUID()}`;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,label){for(let i=0;i<120;i++){if(predicate())return;await sleep(100);}throw new Error(`Timed out: ${label}`);}
function client(id,color){
  let socket,state,status,hold=false,buffer=[],reconnects=0;
  const sent=[],errors=[],acks=new Set();
  const transport={get readyState(){return socket?.readyState??0;},send(raw){sent.push(raw);socket.send(raw);},reconnect(){reconnects++;socket?.close();open();}};
  const link=new RoomConnection(transport,{state:s=>state=s,status:s=>status=s,error:e=>{if(e)errors.push(e);}},
    {id,name:`QA ${id}`,color},`qa-${id}-${randomUUID()}`);
  function deliver(raw){link.receive(raw);if(raw!=='pong'){const message=JSON.parse(raw);if(message.ackId)acks.add(message.ackId);}}
  function open(){
    const current=socket=new WebSocket(`${host}/parties/main/${room}`);
    current.addEventListener('open',()=>{if(socket===current)link.open();});
    current.addEventListener('close',()=>{if(socket===current)link.disconnected();});
    current.addEventListener('message',event=>{
      if(socket!==current)return;
      const raw=String(event.data);
      if(hold&&raw!=='pong')buffer.push(raw);else deliver(raw);
    });
  }
  open();
  return {link,sent,errors,acks,get state(){return state;},get status(){return status;},get reconnects(){return reconnects;},
    get queued(){return buffer.length;},hold(){hold=true;},discard(){buffer=[];},release(){hold=false;for(const raw of buffer.splice(0))deliver(raw);},close(){socket?.close();}};
}
const a=client('resume-a','#ed6266');let b;
try{
  console.log(`Disposable QA room: ${room}`);
  await until(()=>a.state?.players.some(player=>player.id==='resume-a'),'host seat saved');
  b=client('resume-b','#4e9fef');
  await until(()=>a.state?.players.length===2&&b.state?.players.length===2,'two seats');
  async function action(payload){
    const before=a.state.nextEventId;
    assert.equal(a.link.sendAction({playerId:'resume-a',...payload}),true);
    await until(()=>a.state.nextEventId>before,'saved '+payload.type);
    assert.equal(a.state.notice,undefined);
  }
  await action({type:'START',firstPlayerId:'resume-a'});
  await action({type:'ROLL',dice:[1,2]});await action({type:'MOVE_RESULT'});await action({type:'BUY',propertyId:3});
  const saved=structuredClone(a.state);
  a.hold();a.link.resume();a.link.resume();
  assert.equal(a.status,'connecting');assert.equal(a.link.sendAction({type:'END_TURN',playerId:'resume-a'}),false);
  await until(()=>a.queued>0,'fresh snapshot held in transit');
  assert.equal(a.reconnects,0);assert.equal(a.sent.filter(raw=>raw==='{"type":"sync"}').length,1);
  a.release();await until(()=>a.status==='connected','resume confirmed');assert.deepEqual(a.state,saved);
  console.log('PASS delayed real snapshot: stale controls blocked, duplicate resume coalesced, cash/deed/turn unchanged.');

  a.hold();assert.equal(a.link.sendAction({type:'END_TURN',playerId:'resume-a'}),true);
  const receipt=JSON.parse(a.sent.at(-1)).id;
  await until(()=>b.state.activePlayerId==='resume-b'&&a.queued>0,'saved move with lost acknowledgement');
  const settled=structuredClone(b.state);a.discard();
  // Reconnect is a transport interruption; the original decision must keep its receipt.
  a.link.retry();await until(()=>a.queued>0,'reopened snapshot');a.release();
  await until(()=>a.sent.filter(raw=>{try{return JSON.parse(raw).id===receipt;}catch{return false;}}).length===2,'same receipt retried');
  await until(()=>a.acks.has(receipt),'server acknowledgement of retried receipt');
  assert.equal(a.status,'connected');
  assert.deepEqual(a.state,settled);assert.deepEqual(b.state,settled);
  console.log('PASS lost acknowledgement: same receipt resent after reconnect; end turn and economy applied exactly once.');
}finally{a.close();b?.close();}
