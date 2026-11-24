import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const browser=fileURLToPath(new URL('..',import.meta.url));
const dir=await mkdtemp(path.join(browser,'../tmp/unity-stream-'));
const compressed=gzipSync(Buffer.from('complete Unity fixture')),port=8794;
const source=path.relative(dir,path.join(browser,'party/chunkedAssets.ts')).split(path.sep).join('/');
await writeFile(path.join(dir,'worker.ts'),`import {serveUnityChunks} from ${JSON.stringify(source)};
const bytes=new Uint8Array(${JSON.stringify([...compressed])});
export default {async fetch(request:Request){return serveUnityChunks(request,{async fetch(part:Request){
const p=new URL(part.url).pathname;
if(p==='/unity/data-parts.json')return Response.json(Object.fromEntries(['good','short'].map(kind=>['/unity/Build/'+kind+'/AppsWeb.data.gz',{parts:['/first','/'+kind],bytes:bytes.length}])));
return new Response(p==='/first'?bytes.slice(0,8):bytes.slice(8,p==='/short'?-1:undefined));
}})}};`);
await writeFile(path.join(dir,'wrangler.json'),JSON.stringify({name:'tabletalk-stream-qa',main:'worker.ts',compatibility_date:'2026-10-19',dev:{ip:'127.0.0.1'}}));
let output='';
const worker=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--config',path.join(dir,'wrangler.json'),'--local','--port',String(port)],{cwd:browser,windowsHide:true});
worker.stdout.on('data',d=>output+=d);worker.stderr.on('data',d=>output+=d);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function request(kind){return new Promise((resolve,reject)=>{
const req=http.get(`http://127.0.0.1:${port}/unity/Build/${kind}/AppsWeb.data.gz`,{headers:{'Accept-Encoding':'gzip'}},response=>{
const chunks=[];response.on('data',c=>chunks.push(c));response.on('error',reject);
response.on('end',()=>resolve({headers:response.headers,bytes:Buffer.concat(chunks)}));
});req.on('error',reject);req.setTimeout(10000,()=>req.destroy(new Error('Stream timeout')));
});}
try{
 for(let i=0;!output.includes(`Ready on http://127.0.0.1:${port}`);i++){
  if(i>90||worker.exitCode!==null)throw new Error(output);await sleep(300);
 }
 const response=await request('good');assert.equal(Number(response.headers['content-length']),compressed.length);assert.deepEqual(response.bytes,compressed);
 await assert.rejects(request('short'));
 console.log('PASS native Worker FixedLengthStream: complete gzip bytes have Content-Length; truncated data rejects instead of completing.');
}finally{
 if(process.platform==='win32')await new Promise(resolve=>{const kill=spawn('taskkill',['/PID',String(worker.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});kill.on('exit',resolve);});
 else worker.kill('SIGTERM');
}
