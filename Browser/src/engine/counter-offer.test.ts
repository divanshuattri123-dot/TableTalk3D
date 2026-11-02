import { describe, expect, it } from 'vitest';
import { createInitialState, reduceGame } from './reducer';
import type { GameState, GameAction } from './types';

function offer(mode: 'classic' | 'expanding') {
  let s = createInitialState('QAAB');
  for (const [id,color] of [['a','#ed6266'],['b','#4e9fef'],['c','#37b995']]) s=reduceGame(s,{type:'JOIN',player:{id:id!,name:id!,color:color!}});
  s=reduceGame(s,{type:'START',playerId:'a',firstPlayerId:'a'});
  s={...s,mode,properties:{...s.properties,1:{...s.properties[1]!,ownerId:'a'},3:{...s.properties[3]!,ownerId:'b'}}};
  return reduceGame(s,{type:'TRADE_OFFER',playerId:'a',toPlayerId:'b',offerId:'one',offeredCash:0,requestedCash:100,offeredPropertyIds:[1],requestedPropertyIds:[]});
}
const counter: Extract<GameAction,{type:'TRADE_COUNTER'}> = {type:'TRADE_COUNTER',playerId:'b',previousOfferId:'one',offerId:'two',offeredCash:80,requestedCash:0,offeredPropertyIds:[],requestedPropertyIds:[1]};
describe.each(['classic','expanding'] as const)('%s counter-offers', mode => {
  it('atomically replaces the offer, preserves the turn and never rolls dice',()=>{
    const before=offer(mode), saved=structuredClone(before);
    const next=reduceGame(before,counter);
    expect(before).toEqual(saved); expect(reduceGame(before,counter)).toEqual(next);
    expect(next.pendingTrade).toMatchObject({id:'two',counterOfId:'one',fromPlayerId:'b',toPlayerId:'a',resumePhase:'awaitingRoll'});
    expect(next.activePlayerId).toBe('a');expect(next.pendingRoll).toEqual(before.pendingRoll);expect(next.lastRoll).toEqual(before.lastRoll);expect(next.players).toEqual(before.players);expect(next.properties).toEqual(before.properties);
    const stale=reduceGame(next,{type:'TRADE_ACCEPT',playerId:'b',offerId:'one'}); expect(stale.pendingTrade?.id).toBe('two');
    const accepted=reduceGame(next,{type:'TRADE_ACCEPT',playerId:'a',offerId:'two'});
    expect(accepted.pendingTrade).toBeUndefined();expect(accepted.phase).toBe('awaitingRoll');expect(accepted.properties[1]?.ownerId).toBe('b');expect(accepted.players[0]?.cash).toBe(1580);expect(accepted.players[1]?.cash).toBe(1420);
  });
  it('keeps the previous offer intact for invalid or unauthorized counters',()=>{
    const s=offer(mode);
    for(const patch of [{playerId:'a'},{playerId:'c'},{previousOfferId:'stale'},{offerId:'one'},{offeredCash:5000},{offeredPropertyIds:[1]}]) {
      const next=reduceGame(s,{...counter,...patch});expect(next.pendingTrade).toEqual(s.pendingTrade);expect(next.players).toEqual(s.players);expect(next.notice).toBeTruthy();
    }
  });
  it('supports repeated negotiation and decline back to the original decision',()=>{
    const s=reduceGame(offer(mode),counter);
    const third=reduceGame(s,{...counter,playerId:'a',previousOfferId:'two',offerId:'three',offeredCash:0,requestedCash:90,offeredPropertyIds:[1],requestedPropertyIds:[]});
    const declined=reduceGame(third,{type:'TRADE_DECLINE',playerId:'b',offerId:'three'});expect(declined.pendingTrade).toBeUndefined();expect(declined.phase).toBe('awaitingRoll');expect(declined.activePlayerId).toBe('a');
  });
});
