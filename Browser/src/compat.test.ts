import {expect,it} from 'vitest';
import {playerId} from './compat';

it('creates distinct v4 player IDs without randomUUID on the original Android 12 WebView',()=>{
  let seed=0;
  const source={getRandomValues:(bytes:Uint8Array)=>{for(let i=0;i<bytes.length;i++)bytes[i]=seed++;return bytes;}} as Crypto;
  const ids=Array.from({length:8},()=>playerId(source));
  expect(new Set(ids).size).toBe(8);
  for(const id of ids)expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
});
