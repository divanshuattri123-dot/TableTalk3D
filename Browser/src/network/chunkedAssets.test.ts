import {describe,it,expect,vi} from 'vitest';
import {serveUnityChunks} from '../../party/chunkedAssets';
const url='https://example.com/unity/Build/hash/AppsWeb.data.gz';
function source(missing=false){return {fetch:vi.fn(async(request:Request)=>{
  const path=new URL(request.url).pathname;
  if(path==='/unity/data-parts.json')return Response.json({'/unity/Build/hash/AppsWeb.data.gz':{parts:['/one','/two'],bytes:6}});
  if(path==='/one')return new Response(new Uint8Array([1,2,3]));
  return missing?new Response('missing',{status:404}):new Response(new Uint8Array([4,5,6]));
})};}
describe('large Unity download streaming',()=>{
  it('reassembles every compressed byte in order without changing encoding',async()=>{
    const response=await serveUnityChunks(new Request(url),source());
    expect([...new Uint8Array(await response!.arrayBuffer())]).toEqual([1,2,3,4,5,6]);
    expect(response!.headers.get('Content-Encoding')).toBe('gzip');
    expect(response!.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
  it('handles HEAD without downloading the data parts',async()=>{
    const assets=source(),response=await serveUnityChunks(new Request(url,{method:'HEAD'}),assets);
    expect(response!.body).toBeNull();expect(response!.headers.get('Content-Length')).toBe('6');expect(assets.fetch).toHaveBeenCalledOnce();
  });
  it('reports a missing part before sending an incomplete game file',async()=>{
    expect((await serveUnityChunks(new Request(url),source(true)))!.status).toBe(503);
  });
  it('keeps older unsplit player URLs on the normal asset route',async()=>{
    expect(await serveUnityChunks(new Request(url.replace('hash','older')),source())).toBeUndefined();
    expect(await serveUnityChunks(new Request(url),{fetch:async()=>new Response('<html>',{headers:{'Content-Type':'text/html'}})})).toBeUndefined();
  });
});
