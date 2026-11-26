import {expect,it} from 'vitest';
import {playerId} from './compat';
import {cityPolicyAvailable,startCity,type CityPolicy} from './engine/mayor';
import {createInitialState} from './engine/reducer';

it('creates distinct v4 player IDs without randomUUID on the original Android 12 WebView',()=>{
  let seed=0;
  const source={getRandomValues:(bytes:Uint8Array)=>{for(let i=0;i<bytes.length;i++)bytes[i]=seed++;return bytes;}} as Crypto;
  const ids=Array.from({length:8},()=>playerId(source));
  expect(new Set(ids).size).toBe(8);
  for(const id of ids)expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
});

it('keeps Mayor project controls available on the original Android 12 WebView',()=>{
  const base=createInitialState('COMP');
  const state={...base,mayor:startCity([],'mayor')};
  const descriptor=Object.getOwnPropertyDescriptor(Object,'hasOwn')!;
  const results: boolean[]=[];
  try {
    Object.defineProperty(Object,'hasOwn',{...descriptor,value:undefined});
    results.push(cityPolicyAvailable(state,'loans'),cityPolicyAvailable(state,'credit'),cityPolicyAvailable(state,'toString' as CityPolicy));
  } finally {
    Object.defineProperty(Object,'hasOwn',descriptor);
  }
  expect(results).toEqual([true,true,false]);
});
