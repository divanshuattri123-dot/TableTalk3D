import {describe,it,expect} from 'vitest';
import {CITIES} from './cities';
import {getBoard,getTile,cityText,isPurchasableTile} from './board';
import {createInitialState,reduceGame} from './reducer';
import {unitySnapshot} from '../presentation/snapshot';
import {planPresentation} from '../presentation/plan';
import type {BoardSize,GameState} from './types';
const lobby=()=>{
  let s=createInitialState('CITY');
  s=reduceGame(s,{type:'JOIN',player:{id:'a',name:'QA Host',color:'red'}});
  return reduceGame(s,{type:'JOIN',player:{id:'b',name:'QA Friend',color:'blue'}});
};
const economy=(s:GameState)=>({phase:s.phase,players:s.players,properties:s.properties,active:s.activePlayerId,roll:s.lastRoll,pending:s.pendingPurchase,bankHouses:s.bankHouses,bankHotels:s.bankHotels});
describe.each(CITIES)('$name board',city=>{
  it('preserves every tile ID and all economics at each board size',()=>{
    for(const size of [40,48,56,64] as BoardSize[]){
      const board=getBoard(size,city.id),base=getBoard(size), names=board.filter(t=>t.kind==='property').map(t=>t.name);
      expect(board).toHaveLength(size);expect(new Set(names).size).toBe(names.length);
      for(const [i,tile]of board.entries()){
        const {name,boardLabel,region,detail,...rules}=tile;
        const {name:a,boardLabel:b,region:c,detail:d,...original}=base[i]!;
        expect(rules).toEqual(original);
      }
    }
  });
  it('keeps reducer movement, purchase and balances identical with localized journal and renderer labels',()=>{
    const before=lobby(),saved=structuredClone(before);
    const selected=reduceGame(before,{type:'SET_CITY',playerId:'a',city:city.id});
    expect(before).toEqual(saved);expect(reduceGame(before,{type:'SET_CITY',playerId:'a',city:city.id})).toEqual(selected);
    let themed=reduceGame(selected,{type:'START',playerId:'a',firstPlayerId:'a'}),plain=reduceGame(before,{type:'START',playerId:'a',firstPlayerId:'a'});
    for(const action of [{type:'ROLL',playerId:'a',dice:[1,2]},{type:'MOVE_RESULT',playerId:'a'},{type:'BUY',playerId:'a',propertyId:3}] as const){
      const previous=themed;themed=reduceGame(themed,action);plain=reduceGame(plain,action);expect(economy(themed)).toEqual(economy(plain));
      if(action.type==='MOVE_RESULT')expect(planPresentation(previous,themed).find(f=>f.kind==='move')?.text).toContain(getTile(3,40,city.id).name);
    }
    expect(themed.eventLog[0]!.text).toContain(getTile(3,40,city.id).name);
    expect(unitySnapshot(themed).tiles[3]!.name).toBe(getTile(3,40,city.id).name);
    expect(reduceGame(themed,{type:'SET_CITY',playerId:'a',city:'paris'}).city).toBe(city.id);
  });
});
it('restricts city selection to the host in the lobby and preserves the default Indian board',()=>{
  const s=lobby();expect(s.city).toBeUndefined();expect(getTile(1).name).toBe('Khudda Lahora');
  expect(reduceGame(s,{type:'SET_CITY',playerId:'b',city:'london'}).city).toBeUndefined();
  expect(reduceGame(s,{type:'SET_CITY',playerId:'a',city:'invalid' as 'london'}).notice).toBeTruthy();
});
it('translates card destinations and short board labels in one pass',()=>{
  expect(cityText('Advance to Marine Drive.','london')).toBe('Advance to Mayfair.');
  expect(cityText('Travel to CSMT Station.','atlantic')).toBe('Travel to Reading Railroad.');
  let s=reduceGame(lobby(),{type:'SET_CITY',playerId:'a',city:'tokyo'});
  s=reduceGame(s,{type:'START',playerId:'a',firstPlayerId:'a'});
  s=reduceGame(s,{type:'ROLL',playerId:'a',dice:[3,4]});
  s=reduceGame(s,{type:'MOVE_RESULT',playerId:'a',cardDraws:[{deck:'chance',index:1}]});
  expect(s.card?.text).toContain(getTile(24,40,'tokyo').name);expect(s.players[0]!.position).toBe(24);
  expect(getBoard(40,'paris').filter(isPurchasableTile)).toHaveLength(28);
});
