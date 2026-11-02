import {describe,it,expect} from 'vitest';
import {WORLDS} from './worlds';
import {createInitialState,reduceGame} from './reducer';
import {unitySnapshot} from '../presentation/snapshot';

const lobby=()=>reduceGame(reduceGame(createInitialState('MAPS'),{type:'JOIN',player:{id:'a',name:'QA Host',color:'red'}}),{type:'JOIN',player:{id:'b',name:'QA Friend',color:'blue'}});
describe.each(WORLDS)('$name map',world=>{
  it('syncs one shared world without changing deed economics or mutating the old room',()=>{
    const original=lobby(),before=structuredClone(original);
    const selected=reduceGame(original,{type:'SET_WORLD',playerId:'a',world:world.id});
    expect(original).toEqual(before);expect(selected.properties).toEqual(original.properties);
    expect(selected.players).toEqual(original.players);expect(unitySnapshot(selected).world).toBe(world.id);
    expect(reduceGame(selected,{type:'START',playerId:'a',firstPlayerId:'a'}).world).toBe(world.id);
  });
});
it('preserves old saves and restricts world changes to the host before play',()=>{
  const s=lobby();expect(unitySnapshot(s).world).toBe('theme000');
  expect(reduceGame(s,{type:'SET_WORLD',playerId:'b',world:'theme001'}).world).toBeUndefined();
  expect(reduceGame(s,{type:'SET_WORLD',playerId:'a',world:'missing' as 'theme000'}).world).toBeUndefined();
  const started=reduceGame(s,{type:'START',playerId:'a',firstPlayerId:'a'});
  expect(reduceGame(started,{type:'SET_WORLD',playerId:'a',world:'theme001'}).world).toBeUndefined();
});
