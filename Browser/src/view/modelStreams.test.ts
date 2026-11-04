import {expect,it,vi} from 'vitest';
import type {GameAsset} from '../assets';
import {BUNDLED_MODELS,ModelStreams} from './modelStreams';
const asset:GameAsset={id:'custom',kind:'model',category:'token',name:'Custom',label:'Custom',source:'test',src:'model.glb',bytes:10};

it('registers a slow model once across intervening game snapshots',async()=>{
  let finish!:(value:string)=>void;const load=vi.fn(()=>new Promise<string>(resolve=>finish=resolve)),register=vi.fn();
  const streams=new ModelStreams(load,register,vi.fn());
  const first=streams.ensure(asset),echo=streams.ensure({...asset});expect(first).toBe(echo);
  await Promise.resolve();finish('geometry');await first;
  expect(load).toHaveBeenCalledOnce();expect(register).toHaveBeenCalledExactlyOnceWith('geometry');
  await streams.ensure(asset);expect(load).toHaveBeenCalledOnce();
});
it('never imports the conversion pipeline for bundled models',async()=>{
  const load=vi.fn();const streams=new ModelStreams(load,vi.fn(),vi.fn());
  for(const id of BUNDLED_MODELS)await streams.ensure({...asset,id});expect(load).not.toHaveBeenCalled();
});
it('retries failed downloads and registers independent models concurrently',async()=>{
  const load=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('geometry'),register=vi.fn(),failed=vi.fn();
  const streams=new ModelStreams(load,register,failed);await streams.ensure(asset);expect(failed).toHaveBeenCalledOnce();
  await Promise.all([streams.ensure(asset),streams.ensure({...asset,id:'other'})]);expect(register).toHaveBeenCalledTimes(2);
});
it('never registers a late download into a disposed native player',async()=>{
  let finish!:(value:string)=>void;const register=vi.fn(),failed=vi.fn();
  const streams=new ModelStreams(()=>new Promise<string>(resolve=>finish=resolve),register,failed);
  const request=streams.ensure(asset);await Promise.resolve();streams.dispose();finish('geometry');await request;
  expect(register).not.toHaveBeenCalled();expect(failed).not.toHaveBeenCalled();
});
