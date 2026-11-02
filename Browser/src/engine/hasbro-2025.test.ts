import { expect, it } from 'vitest';
import { createInitialState, reduceGame } from './reducer';
import type { GameState } from './types';
const modern=():GameState=>{
  let s=createInitialState('GNEW');
  for(const [id,color] of [['p1','red'],['p2','blue'],['p3','green']])s=reduceGame(s,{type:'JOIN',player:{id:id!,name:id!,color:color!}});
  s=reduceGame(s,{type:'SET_MODE',playerId:'p1',mode:'classic',rulesEdition:'hasbro-2025'});
  const order=Array.from({length:16},(_,i)=>i);
  return reduceGame(s,{type:'START',playerId:'p1',firstPlayerId:'p1',deckOrder:{chance:order,community:order},setupRolls:[s.players.map((p,i)=>({playerId:p.id,dice:i===0?[6,6]:[1,2]}))]});
};
const landed=()=>{let s=modern();s.properties[3]!.ownerId='p2';s=reduceGame(s,{type:'ROLL',playerId:'p1',dice:[1,2]});return reduceGame(s,{type:'MOVE_RESULT',playerId:'p1'});};
it('creates a rent claim without charging money before the owner asks',()=>{
  const s=landed(); expect(s.players[0]!.cash).toBe(1500);expect(s.players[1]!.cash).toBe(1500);expect(s.rentClaim).toMatchObject({payerId:'p1',ownerId:'p2',propertyId:3,amount:4});
  const claimed=reduceGame(s,{type:'CLAIM_RENT',playerId:'p2',claimId:s.rentClaim!.id});expect(claimed.players[0]!.cash).toBe(1496);expect(claimed.players[1]!.cash).toBe(1504);expect(claimed.rentClaim).toBeUndefined();
  expect(reduceGame(claimed,{type:'CLAIM_RENT',playerId:'p2',claimId:s.rentClaim!.id}).players).toEqual(claimed.players);
});
it('allows claiming after End turn, but expires the claim on the next movement roll',()=>{
  const s=landed(), next=reduceGame(s,{type:'END_TURN',playerId:'p1'});
  expect(reduceGame(next,{type:'CLAIM_RENT',playerId:'p2',claimId:s.rentClaim!.id}).players[1]!.cash).toBe(1504);
  const rolled=reduceGame(next,{type:'ROLL',playerId:'p2',dice:[1,2]});expect(rolled.rentClaim).toBeUndefined();expect(reduceGame(rolled,{type:'CLAIM_RENT',playerId:'p2',claimId:s.rentClaim!.id}).players).toEqual(rolled.players);
});
it('never lets another player claim rent, and turns an unaffordable claim into mandatory debt',()=>{
  let s=landed();expect(reduceGame(s,{type:'CLAIM_RENT',playerId:'p3',claimId:s.rentClaim!.id}).rentClaim).toEqual(s.rentClaim);
  s={...s,players:s.players.map(p=>p.id==='p1'?{...p,cash:1}:p)};
  const next=reduceGame(s,{type:'CLAIM_RENT',playerId:'p2',claimId:s.rentClaim!.id});expect(next.phase).toBe('awaitingDebt');expect(next.debts?.[0]).toMatchObject({playerId:'p1',creditorId:'p2',amount:3});
});
it('retains received mortgages for free in G0009 and charges normal redemption later',()=>{
  let s=modern();s.properties[1]={ownerId:'p1',mortgaged:true,houses:0};
  s=reduceGame(s,{type:'TRADE_OFFER',playerId:'p1',offerId:'mortgage',toPlayerId:'p2',offeredCash:0,requestedCash:0,offeredPropertyIds:[1],requestedPropertyIds:[]});
  s=reduceGame(s,{type:'TRADE_ACCEPT',playerId:'p2',offerId:'mortgage'});expect(s.phase).toBe('awaitingMortgageDecision');
  const keep=reduceGame(s,{type:'RESOLVE_MORTGAGES',playerId:'p2',redeemPropertyIds:[]});expect(keep.players[1]!.cash).toBe(1500);expect(keep.properties[1]!.mortgaged).toBe(true);
  const redeem=reduceGame(s,{type:'RESOLVE_MORTGAGES',playerId:'p2',redeemPropertyIds:[1]});expect(redeem.players[1]!.cash).toBe(1467);expect(redeem.properties[1]!.mortgaged).toBe(false);
  const legacy={...s,rulesEdition:undefined};expect(reduceGame(legacy,{type:'RESOLVE_MORTGAGES',playerId:'p2',redeemPropertyIds:[]}).players[1]!.cash).toBe(1497);
});
