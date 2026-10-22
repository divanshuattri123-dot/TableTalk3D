import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
const [mode,...rooms]=process.argv.slice(2);
assert(["snapshot","compare"].includes(mode)&&rooms.length,"Use snapshot/compare and disposable QA room names.");
const host=process.env.ROOM_SERVER_URL??"wss://table-talk-realtime.divanshuattri123.workers.dev";
const file=process.env.QA_DEPLOY_BASELINE??"outputs/qa-before-deployment.json";
async function read(room){
  return new Promise((resolve,reject)=>{
    const socket=new WebSocket(`${host}/parties/main/${room}`);
    const timer=setTimeout(()=>{socket.close();reject(new Error(`No saved snapshot for ${room}`));},20000);
    socket.addEventListener("error",()=>{clearTimeout(timer);reject(new Error(`Connection failed: ${room}`));});
    socket.addEventListener("message",event=>{const m=JSON.parse(String(event.data));if(m.type!=="state")return;clearTimeout(timer);socket.close();
      if(!m.state.players.length||!m.state.players.every(p=>p.name.startsWith("QA "))){reject(new Error("Only disposable QA saves may be recorded."));return;}resolve(m.state);});
  });
}
const states=Object.fromEntries(await Promise.all(rooms.map(async room=>[room,await read(room)])));
if(mode==="snapshot"){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(states));}
else{
  assert.deepEqual(states,JSON.parse(await fs.readFile(file,"utf8")));
  const origin=host.replace(/^ws/,"http"), release=await(await fetch(`${origin}/unity/release.json`,{cache:"no-store"})).json();
  if(process.env.QA_NATIVE_VERSION)assert.equal(release.productVersion,process.env.QA_NATIVE_VERSION);
  for(const key of ["dataUrl","frameworkUrl","codeUrl"]){const r=await fetch(`${origin}/unity/${release[key]}`,{method:"HEAD"});assert.equal(r.status,200);assert.equal(r.headers.get("Content-Encoding"),"gzip");assert.equal(r.headers.get("Access-Control-Allow-Origin"),"*");if(key==="codeUrl")assert.equal(r.headers.get("Content-Type"),"application/wasm");}
  console.log(`PASS native ${release.productVersion}: new release, gzip, Wasm MIME and cross-origin headers.`);
}
for(const [room,state]of Object.entries(states))console.log(`${mode==="compare"?"PASS unchanged":"Saved"} ${room}: ${state.phase}, event ${state.nextEventId}, ${createHash("sha256").update(JSON.stringify(state)).digest("hex").slice(0,12)}.`);
