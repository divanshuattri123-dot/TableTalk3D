interface Assets {fetch(request:Request):Promise<Response>}
interface PartFile {parts:string[];bytes:number}

export async function serveUnityChunks(request:Request,assets:Assets):Promise<Response|undefined> {
  const index=await assets.fetch(new Request(new URL('/unity/data-parts.json',request.url)));
  if(!index.ok||!index.headers.get('Content-Type')?.includes('application/json'))return;
  const manifest=await index.json() as Record<string,PartFile>;
  const file=manifest[new URL(request.url).pathname];if(!file)return;
  const headers={'Content-Type':'application/gzip','Content-Encoding':'gzip','Cache-Control':'public, max-age=31536000, immutable','Access-Control-Allow-Origin':'*'};
  if(request.method==='HEAD'){
    const options={headers:{...headers,'Content-Length':String(file.bytes)},encodeBody:'manual' as const};
    return new Response(null,options);
  }
  const parts=await Promise.all(file.parts.map(path=>assets.fetch(new Request(new URL(path,request.url)))));
  if(parts.some(part=>!part.ok||!part.body||part.headers.get('Content-Type')?.includes('text/html')))
    return new Response('The map download is temporarily unavailable. Please retry.',{status:503,headers:{'Access-Control-Allow-Origin':'*'}});
  let position=0,reader=parts[0]!.body!.getReader();
  // Stream compressed bytes in order; the host caps individual assets at 25 MiB.
  const body=new ReadableStream<Uint8Array>({
    async pull(controller){
      while(position<parts.length){
        const chunk=await reader.read();
        if(!chunk.done){controller.enqueue(chunk.value);return;}
        reader.releaseLock();position++;
        if(position<parts.length)reader=parts[position]!.body!.getReader();
      }
      controller.close();
    },
    async cancel(reason){await Promise.allSettled([reader.cancel(reason),...parts.slice(position+1).map(part=>part.body!.cancel(reason))]);}
  });
  const options={headers,encodeBody:'manual' as const};
  return new Response(body,options);
}
